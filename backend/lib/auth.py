import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from math import ceil

from fastapi import Cookie, Depends, Header, HTTPException, Response

from lib.db import db

COOKIE_NAME = "ooaf_session"
CSRF_COOKIE = "ooaf_csrf"
SESSION_TTL = timedelta(days=14)
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() != "false"


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_csrf_cookie(response: Response, token: str) -> None:
    # Readable by JS (not HttpOnly) so the frontend can echo it back as the X-CSRF-Token
    # header — the double-submit-cookie defence layered on top of SameSite=lax.
    response.set_cookie(
        CSRF_COOKIE,
        token,
        httponly=False,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=int(SESSION_TTL.total_seconds()),
        path="/",
    )


def shop_password() -> str | None:
    # No default: a missing SHOP_PASSWORD fails closed (registration/roster refuse) rather than
    # silently accepting a well-known built-in secret.
    return os.environ.get("SHOP_PASSWORD") or None


def hash_pin(pin: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 100_000)
    return f"{salt}${dk.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    if not isinstance(stored, str) or "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    try:
        salt_bytes = bytes.fromhex(salt)
    except ValueError:
        # Malformed salt (non-hex) — treat as a failed match, never raise a 500.
        return False
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt_bytes, 100_000)
    return secrets.compare_digest(dk.hex(), digest)


# --- Throttling: PIN login lockout + shop-password gate -------------------------------
# A rolling window of failed attempts; once the threshold is hit the key is locked for the
# window. Attempts while locked don't extend it; a success clears the counter. Login is keyed
# per-username; the shop-password gate (register + roster) is keyed per client IP.
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT = timedelta(minutes=15)
SHOP_GATE_MAX_ATTEMPTS = 10
SHOP_GATE_LOCKOUT = timedelta(minutes=15)


def client_ip(request) -> str:
    """Client IP for throttling. Use the LAST X-Forwarded-For hop — the value appended by the
    trusted ingress proxy — so an attacker can't spoof/rotate the throttle key by injecting their
    own X-Forwarded-For header (client-supplied entries land earlier in the list and are ignored)."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        hops = [h.strip() for h in xff.split(",") if h.strip()]
        if hops:
            return hops[-1]
    return request.client.host if request.client else "unknown"


async def _check_throttle(coll, field: str, key: str) -> None:
    doc = await coll.find_one({field: key})
    locked_until = doc.get("locked_until") if doc else None
    if isinstance(locked_until, datetime):
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if locked_until > now:
            secs = int((locked_until - now).total_seconds())
            mins = max(1, ceil(secs / 60))
            raise HTTPException(
                status_code=429,
                detail=f"Too many attempts. Try again in {mins} minute{'s' if mins != 1 else ''}.",
                headers={"Retry-After": str(secs)},
            )


async def _record_throttle_failure(
    coll, field: str, key: str, max_attempts: int, window: timedelta
) -> None:
    now = datetime.now(timezone.utc)
    doc = await coll.find_one({field: key})
    count = 1
    if doc:
        last = doc.get("last_failure")
        if isinstance(last, datetime):
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if now - last < window:  # stale failures fall outside the window → reset
                count = int(doc.get("count", 0)) + 1
    update: dict = {field: key, "count": count, "last_failure": now}
    if count >= max_attempts:
        update["locked_until"] = now + window
    await coll.update_one({field: key}, {"$set": update}, upsert=True)


async def check_login_lockout(username: str) -> None:
    await _check_throttle(db.login_attempts, "username", username)


async def record_login_failure(username: str) -> None:
    await _record_throttle_failure(
        db.login_attempts, "username", username, LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT
    )


async def clear_login_failures(username: str) -> None:
    await db.login_attempts.delete_one({"username": username})


async def check_shop_gate(ip: str) -> None:
    await _check_throttle(db.shop_attempts, "ip", ip)


async def record_shop_gate_failure(ip: str) -> None:
    await _record_throttle_failure(
        db.shop_attempts, "ip", ip, SHOP_GATE_MAX_ATTEMPTS, SHOP_GATE_LOCKOUT
    )


async def clear_shop_gate(ip: str) -> None:
    await db.shop_attempts.delete_one({"ip": ip})


async def create_session(username: str, is_master: bool) -> str:
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one(
        {
            "token": token,
            "username": username,
            "is_master": is_master,
            "created_at": now,
            "expires_at": now + SESSION_TTL,
        }
    )
    return token


async def get_session(token: str | None) -> dict | None:
    if not token:
        return None
    doc = await db.sessions.find_one({"token": token})
    if not doc:
        return None
    exp = doc.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return None
    return doc


async def destroy_session(token: str | None) -> None:
    if token:
        await db.sessions.delete_one({"token": token})


def token_from(ooaf_session: str | None, authorization: str | None) -> str | None:
    """Resolve the session token from the cookie (web) OR an Authorization: Bearer header
    (native mobile). The cookie wins if both are present."""
    if ooaf_session:
        return ooaf_session
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


async def require_session(
    ooaf_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    sess = await get_session(token_from(ooaf_session, authorization))
    if not sess:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sess


async def require_master(sess: dict = Depends(require_session)) -> dict:
    if not sess.get("is_master"):
        raise HTTPException(status_code=403, detail="Master account only")
    return sess


async def seed_master() -> None:
    """Ensure the master (admin) account exists, seeded from env.

    Seeds ONLY when the account is absent and a password is configured; an existing master
    PIN is never overwritten, so a rotated credential survives every restart (fixes the
    "rewrites the PIN on every boot" finding). To rotate the admin password: update
    ADMIN_PASSWORD in .env, delete the master user document, then restart the backend.
    """
    username = os.environ.get("ADMIN_USERNAME", "master")
    password = os.environ.get("ADMIN_PASSWORD")
    if not password:
        return
    if await db.users.find_one({"username": username}):
        return
    await db.users.insert_one(
        {
            "id": str(uuid.uuid4()),
            "username": username,
            "pin_hash": hash_pin(password),
            "is_master": True,
            "created_at": datetime.now(timezone.utc),
        }
    )
