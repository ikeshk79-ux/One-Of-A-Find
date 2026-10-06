"""Pre-scaffolded pytest fixtures for the FastAPI backend.

Tests hit the live uvicorn process managed by supervisor (not an in-process ASGI app), so
the app under test is the same one the frontend and Playwright see. Do NOT re-create this
file — add app-specific fixtures below the marker at the bottom.
"""

import os

import httpx
import pytest
import pytest_asyncio

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"


def api_url(path: str = "") -> str:
    """Absolute URL for an /api route: api_url("/status") -> http://localhost:8001/api/status."""
    return f"{API_URL}{path}"


@pytest.fixture(scope="session")
def backend_url() -> str:
    return BACKEND_URL


@pytest.fixture
def client():
    """Sync httpx client rooted at /api — the default for endpoint tests.

    Example:
        def test_status(client):
            assert client.get("/status").status_code == 200
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def aclient():
    """Async variant, for tests that also await motor/backend helpers directly."""
    async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as c:
        yield c


# --- app-specific fixtures below this line ---
from pathlib import Path

from dotenv import load_dotenv

# Load the backend .env so tests use the real (rotated) credentials instead of a hardcoded
# secret in source. pytest runs as its own process, so nothing else loads it here.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

MASTER_USERNAME = os.environ.get("ADMIN_USERNAME", "master")
MASTER_PIN = os.environ.get("ADMIN_PASSWORD", "")
VOLUNTEER_USERNAME = "SarahTest"
VOLUNTEER_PIN = "1234"
SHOP_PASSWORD = os.environ.get("SHOP_PASSWORD", "Oneofafind")


def login_client(username: str, pin: str) -> httpx.Client:
    """Return an httpx.Client already logged in as username/pin.

    The backend sets the session cookie with the Secure attribute (COOKIE_SECURE
    defaults true, correct for the real https ingress). httpx's cookie jar honours
    that flag and refuses to resend the cookie over this test's plain-http localhost
    connection, so we extract the raw Set-Cookie value and pin it as a default header
    instead of relying on the jar.
    """
    c = httpx.Client(timeout=30.0)
    resp = c.post(api_url("/auth/login"), json={"username": username, "pin": pin})
    assert resp.status_code == 200, resp.text
    # Multiple Set-Cookie headers (session + CSRF double-submit cookie) can be present;
    # httpx's raw_items exposes each header separately.
    cookie_pairs = []
    csrf_token = None
    for key, value in resp.headers.raw:
        if key.decode().lower() == "set-cookie":
            pair = value.decode().split(";")[0]
            cookie_pairs.append(pair)
            if pair.startswith("ooaf_csrf="):
                csrf_token = pair.split("=", 1)[1]
    c.headers["Cookie"] = "; ".join(cookie_pairs)
    if csrf_token:
        c.headers["X-CSRF-Token"] = csrf_token
    return c


@pytest.fixture
def master_client():
    c = login_client(MASTER_USERNAME, MASTER_PIN)
    yield c
    c.close()


@pytest.fixture
def volunteer_client():
    c = login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)
    yield c
    c.close()
