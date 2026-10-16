import asyncio
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, ensure_indexes
from lib.auth import seed_master
from seed_shops import seed as seed_shops


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    await seed_master()  # ensure the master (admin) account exists
    # Seed the Octavia Foundation shops on first boot so a fresh deployment (empty Mongo) has the
    # branch list the frontend's location dropdowns rely on. The seeder is idempotent — on an
    # existing database it only patches rows that have gone stale and otherwise no-ops.
    try:
        await seed_shops()
    except Exception as e:  # noqa: BLE001 — never block boot on a seed hiccup
        logging.getLogger(__name__).warning("shops seed skipped: %s", e)
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Unauthenticated health probe (used by the readiness poll). Exposes nothing sensitive.
@api_router.get("/")
async def health():
    return {"status": "ok"}


# Feature routers
from routers.activity import router as activity_router
from routers.appraise import router as appraise_router
from routers.auth import router as auth_router
from routers.inventory import router as inventory_router
from routers.pricing import router as pricing_router
from routers.shops import router as shops_router
from routers.staff import router as staff_router

api_router.include_router(auth_router)
api_router.include_router(appraise_router)
api_router.include_router(inventory_router)
api_router.include_router(activity_router)
api_router.include_router(pricing_router)
api_router.include_router(shops_router)
api_router.include_router(staff_router)

# Include the router in the main app
app.include_router(api_router)


# Request-body size cap. Public endpoints (login/register/roster) parse the entire body before
# any validator runs, so an unauthenticated attacker could stream a multi-hundred-MB JSON blob
# and exhaust worker memory. We refuse any /api request whose body exceeds the cap with a 413
# Payload Too Large: by Content-Length when it is declared, and by metering the stream when it is
# not (chunked transfer). The limit comfortably fits the largest legitimate payload — an appraisal
# POST with two base64 images (~6 MB each + metadata).
MAX_API_BODY_BYTES = 20 * 1024 * 1024  # 20 MiB


@app.middleware("http")
async def enforce_api_body_cap(request: Request, call_next):
    if request.url.path.startswith("/api") and request.method in {"POST", "PUT", "PATCH"}:
        raw_len = request.headers.get("content-length")
        if raw_len:
            try:
                declared = int(raw_len)
            except ValueError:
                return JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)
            if declared > MAX_API_BODY_BYTES:
                return JSONResponse({"detail": "Request body too large"}, status_code=413)
        else:
            # No declared length (chunked transfer): the header check above cannot help, so meter
            # the stream ourselves and bail the moment it crosses the cap — otherwise an anonymous
            # caller could stream an unbounded body into the worker's memory. The bytes we drained
            # are replayed to the route via a one-shot receive channel.
            chunks: list[bytes] = []
            total = 0
            async for chunk in request.stream():
                total += len(chunk)
                if total > MAX_API_BODY_BYTES:
                    return JSONResponse({"detail": "Request body too large"}, status_code=413)
                chunks.append(chunk)
            body = b"".join(chunks)
            # Starlette's BaseHTTPMiddleware replays a cached `_body` to the downstream app, so
            # handing it the bytes we drained keeps the route's parsing untouched.
            request._body = body  # type: ignore[attr-defined]
    return await call_next(request)


# CSRF (double-submit cookie) + security headers. Added BEFORE CORS so the CORS middleware
# stays outermost and still decorates responses (including 403s). Unsafe methods on /api must
# echo the ooaf_csrf cookie back in the X-CSRF-Token header; auth endpoints are exempt (a user
# has no CSRF cookie yet at login/register, and logout revokes state harmlessly).
_CSRF_UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
# Pre-session endpoints only: the caller has no CSRF cookie yet at login/register/roster-unlock.
# Logout is NOT exempt — by then the cookie exists, so it carries the double-submit check.
_CSRF_EXEMPT = {"/api/auth/login", "/api/auth/register", "/api/auth/roster"}


@app.middleware("http")
async def csrf_and_security_headers(request: Request, call_next):
    if (
        request.method in _CSRF_UNSAFE
        and request.url.path.startswith("/api")
        and request.url.path not in _CSRF_EXEMPT
    ):
        # CSRF applies to cookie-authenticated requests. A request authenticated purely by a
        # Bearer token (native mobile) carries no session cookie, so it is immune to CSRF — but a
        # forged Bearer prefix must NOT disable the check while the ambient cookie still authenticates
        # (token_from prefers the cookie). So gate CSRF on the presence of the session cookie.
        if request.cookies.get("ooaf_session"):
            cookie = request.cookies.get("ooaf_csrf")
            header = request.headers.get("x-csrf-token")
            if not cookie or not header or not secrets.compare_digest(cookie, header):
                return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    # Deny every powerful feature by default on API responses. The SPA layer sets its own
    # policy for pages that legitimately need camera (for item capture) and clipboard.
    response.headers["Permissions-Policy"] = (
        "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), "
        "gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), "
        "xr-spatial-tracking=(), interest-cohort=()"
    )
    return response


# CORS from env. Comma-separated allowlist, or "*" for a credential-safe wildcard. The web app
# is same-origin (relative /api) and the Bearer/native path uses no cookies, so credentialed
# cross-origin access is never needed — reflecting any Origin WITH credentials would be a
# CSRF/data-exposure risk, so for "*" we allow any origin WITHOUT credentials; an explicit
# allowlist keeps credentials enabled for named origins.
_cors_env = os.environ.get('CORS_ORIGINS', '').strip()
if _cors_env == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    _cors_origins = [o.strip() for o in _cors_env.split(',') if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=_cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
