import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response

from lib.auth import (
    COOKIE_NAME,
    COOKIE_SECURE,
    CSRF_COOKIE,
    SESSION_TTL,
    check_login_lockout,
    check_shop_gate,
    clear_login_failures,
    clear_shop_gate,
    client_ip,
    create_session,
    destroy_session,
    get_session,
    hash_pin,
    new_csrf_token,
    record_login_failure,
    record_shop_gate_failure,
    require_session,
    set_csrf_cookie,
    shop_password,
    token_from,
    verify_pin,
)
from lib.activity import log_activity
from lib.db import db
from models.appraisal import (
    AVATAR_COLORS,
    LoginRequest,
    ProfileUpdate,
    RegisterRequest,
    Roster,
    RosterEntry,
    RosterUnlock,
    SessionInfo,
    default_avatar_color,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Precomputed malformed hash: verify_pin() still runs the full PBKDF2 against it before returning
# False, so lookups for unknown usernames take the same ~100ms as a real login. Prevents an
# unauthenticated timing oracle for account existence.
_TIMING_DUMMY_HASH = "00" * 16 + "$" + "ff" * 32
_USERNAME_RE = re.compile(r"^[A-Za-z0-9 _.\-]{2,30}$")


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=int(SESSION_TTL.total_seconds()),
        path="/",
    )


@router.post("/register", response_model=SessionInfo)
async def register(body: RegisterRequest, request: Request, response: Response, token: bool = False):
    ip = client_ip(request)
    await check_shop_gate(ip)
    configured = shop_password()
    if not configured:
        raise HTTPException(status_code=503, detail="Registration is currently unavailable")
    if not secrets.compare_digest(body.shop_password.strip(), configured):
        await record_shop_gate_failure(ip)
        raise HTTPException(status_code=401, detail="Incorrect shop password")
    await clear_shop_gate(ip)
    username = body.username.strip()
    if not _USERNAME_RE.match(username):
        raise HTTPException(status_code=422, detail="Username must be 2-30 letters, numbers or . _ -")
    if len(body.pin.strip()) < 6:
        raise HTTPException(status_code=422, detail="PIN must be at least 6 characters")
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=409, detail="That username is already taken")
    color = body.color or default_avatar_color(username)
    avatar = body.avatar or None
    await db.users.insert_one(
        {
            "id": str(uuid.uuid4()),
            "username": username,
            "pin_hash": hash_pin(body.pin.strip()),
            "is_master": False,
            "color": color,
            "avatar": avatar,
            "created_at": datetime.now(timezone.utc),
        }
    )
    tok = await create_session(username, False)
    _set_cookie(response, tok)
    # Also mint + expose the CSRF double-submit token in the response body: embedded preview
    # iframes may partition the ooaf_csrf cookie out of document.cookie, so the frontend keeps
    # a sessionStorage fallback populated from this field.
    csrf_tok = new_csrf_token()
    set_csrf_cookie(response, csrf_tok)
    # `?token=true` (native mobile) also returns the raw session token to send as a Bearer
    # header; web clients omit it and keep using the HttpOnly cookie only.
    return SessionInfo(
        authenticated=True,
        username=username,
        is_master=False,
        color=color,
        avatar=avatar,
        token=tok if token else None,
        csrf=csrf_tok,
    )


@router.post("/login", response_model=SessionInfo)
async def login(body: LoginRequest, response: Response, token: bool = False):
    username = body.username.strip()
    await check_login_lockout(username)
    user = await db.users.find_one({"username": username})
    # Timing hygiene: when the username is unknown, run a dummy PBKDF2 against the submitted PIN
    # so the response latency doesn't leak account-existence to an unauthenticated attacker.
    stored_hash = user.get("pin_hash", "") if user else _TIMING_DUMMY_HASH
    pin_ok = verify_pin(body.pin.strip(), stored_hash)
    if not user or not pin_ok:
        await record_login_failure(username)
        raise HTTPException(status_code=401, detail="Incorrect username or PIN")
    await clear_login_failures(username)
    is_master = bool(user.get("is_master"))
    await log_activity(username, "logged_in", details={"master": is_master})
    tok = await create_session(username, is_master)
    _set_cookie(response, tok)
    csrf_tok = new_csrf_token()
    set_csrf_cookie(response, csrf_tok)
    return SessionInfo(
        authenticated=True,
        username=username,
        is_master=is_master,
        color=user.get("color") or default_avatar_color(username),
        avatar=user.get("avatar"),
        token=tok if token else None,
        csrf=csrf_tok,
    )


@router.get("/me", response_model=SessionInfo)
async def me(
    response: Response,
    ooaf_session: str | None = Cookie(default=None),
    ooaf_csrf: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
):
    sess = await get_session(token_from(ooaf_session, authorization))
    if not sess:
        return SessionInfo(authenticated=False)
    # Bootstrap a CSRF token only for cookie (web) sessions that lack one; do NOT rotate an
    # existing token, and skip entirely for Bearer (mobile) auth which needs no CSRF cookie.
    csrf_tok = ooaf_csrf
    if ooaf_session and not ooaf_csrf:
        csrf_tok = new_csrf_token()
        set_csrf_cookie(response, csrf_tok)
    uname = sess.get("username")
    user = await db.users.find_one({"username": uname}, {"_id": 0, "color": 1, "avatar": 1}) or {}
    return SessionInfo(
        authenticated=True,
        username=uname,
        is_master=bool(sess.get("is_master")),
        color=user.get("color") or (default_avatar_color(uname) if uname else None),
        avatar=user.get("avatar"),
        # Echo the CSRF token in the body so cookie-partitioned iframes can keep a sessionStorage
        # fallback populated after a page reload — only for web (cookie) sessions.
        csrf=csrf_tok if ooaf_session else None,
    )


@router.patch("/profile", response_model=SessionInfo)
async def update_profile(body: ProfileUpdate, session: dict = Depends(require_session)):
    """Update the signed-in volunteer's roster tile colour and/or photo."""
    uname = session.get("username")
    update: dict = {}
    if body.color is not None:
        update["color"] = body.color
    if body.avatar is not None:
        update["avatar"] = body.avatar or None  # "" clears the photo
    if update:
        await db.users.update_one({"username": uname}, {"$set": update})
    user = await db.users.find_one({"username": uname}, {"_id": 0, "color": 1, "avatar": 1}) or {}
    return SessionInfo(
        authenticated=True,
        username=uname,
        is_master=bool(session.get("is_master")),
        color=user.get("color") or default_avatar_color(uname),
        avatar=user.get("avatar"),
    )


@router.post("/roster", response_model=Roster)
async def roster(body: RosterUnlock, request: Request):
    """Volunteer tiles for the tap-to-sign-in till roster, gated by the shared shop password so
    staff names/photos are never exposed to the public internet. Excludes the master account."""
    ip = client_ip(request)
    await check_shop_gate(ip)
    configured = shop_password()
    if not configured or not secrets.compare_digest(body.shop_password.strip(), configured):
        await record_shop_gate_failure(ip)
        raise HTTPException(status_code=401, detail="Incorrect shop password")
    await clear_shop_gate(ip)
    docs = await db.users.find(
        {"is_master": {"$ne": True}}, {"_id": 0, "username": 1, "color": 1, "avatar": 1}
    ).to_list(200)
    docs.sort(key=lambda d: str(d.get("username", "")).lower())
    return Roster(
        volunteers=[
            RosterEntry(
                username=d["username"],
                color=d.get("color") or default_avatar_color(d["username"]),
                avatar=d.get("avatar"),
            )
            for d in docs
            if d.get("username")
        ]
    )


@router.post("/logout", response_model=SessionInfo)
async def logout(
    response: Response,
    ooaf_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
):
    await destroy_session(token_from(ooaf_session, authorization))
    response.delete_cookie(COOKIE_NAME, path="/")
    # The CSRF cookie is readable by JS by design; leaving it behind after sign-out serves no
    # purpose and lingers on shared till devices.
    response.delete_cookie(CSRF_COOKIE, path="/")
    return SessionInfo(authenticated=False)
