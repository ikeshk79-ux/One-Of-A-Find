import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import hash_pin, require_master
from lib.db import db
from models.appraisal import (
    PinReset,
    StaffCreate,
    StaffMember,
    StaffUpdate,
    default_avatar_color,
)

router = APIRouter(prefix="/staff", tags=["staff"])
_USERNAME_RE = re.compile(r"^[A-Za-z0-9 _.\-]{2,30}$")


def _aware(doc: dict) -> dict:
    t = doc.get("created_at")
    if isinstance(t, datetime) and t.tzinfo is None:
        doc["created_at"] = t.replace(tzinfo=timezone.utc)
    return doc


def _to_member(user: dict) -> StaffMember:
    name = user["username"]
    return StaffMember(
        id=user.get("id"),
        username=name,
        color=user.get("color") or default_avatar_color(name),
        avatar=user.get("avatar"),
        created_at=_aware(user).get("created_at"),
    )


async def _get_volunteer(username: str) -> dict:
    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    if user.get("is_master"):
        raise HTTPException(status_code=403, detail="The master account cannot be managed here")
    return user


@router.get("", response_model=list[StaffMember])
async def list_staff(_: dict = Depends(require_master)):
    docs = await db.users.find(
        {"is_master": {"$ne": True}},
        {"_id": 0, "id": 1, "username": 1, "color": 1, "avatar": 1, "created_at": 1},
    ).to_list(500)
    docs.sort(key=lambda d: str(d.get("username", "")).lower())
    return [_to_member(d) for d in docs if d.get("username")]


@router.post("", response_model=StaffMember, status_code=201)
async def create_staff(body: StaffCreate, _: dict = Depends(require_master)):
    """Master creates a volunteer account directly — no shop password gate."""
    username = body.username.strip()
    if not _USERNAME_RE.match(username):
        raise HTTPException(status_code=422, detail="Username must be 2-30 letters, numbers or . _ -")
    if len(body.pin.strip()) < 6:
        raise HTTPException(status_code=422, detail="PIN must be at least 6 characters")
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=409, detail="That username is already taken")
    user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "pin_hash": hash_pin(body.pin.strip()),
        "is_master": False,
        "color": body.color or default_avatar_color(username),
        "avatar": body.avatar or None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    return _to_member(user)


@router.patch("/{username}", response_model=StaffMember)
async def update_staff(username: str, body: StaffUpdate, _: dict = Depends(require_master)):
    """Rename and/or recolour/rephoto a volunteer. A rename keeps active sessions valid and
    rewrites the audit trail so past entries show the new name."""
    user = await _get_volunteer(username)
    update: dict = {}
    if body.color is not None:
        update["color"] = body.color
    if body.avatar is not None:
        update["avatar"] = body.avatar or None
    new_username = body.new_username.strip() if body.new_username is not None else None
    if new_username and new_username != username:
        if not _USERNAME_RE.match(new_username):
            raise HTTPException(status_code=422, detail="Username must be 2-30 letters, numbers or . _ -")
        if await db.users.find_one({"username": new_username}):
            raise HTTPException(status_code=409, detail="That username is already taken")
        update["username"] = new_username
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"username": username}, {"$set": update})
    final_username = update.get("username", username)
    if "username" in update:
        await db.sessions.update_many({"username": username}, {"$set": {"username": final_username}})
        await db.activity.update_many({"username": username}, {"$set": {"username": final_username}})
    user.update(update)
    return _to_member(user)


@router.patch("/{username}/pin", response_model=StaffMember)
async def reset_pin(username: str, body: PinReset, _: dict = Depends(require_master)):
    user = await _get_volunteer(username)
    if len(body.pin.strip()) < 6:
        raise HTTPException(status_code=422, detail="PIN must be at least 6 characters")
    await db.users.update_one(
        {"username": username}, {"$set": {"pin_hash": hash_pin(body.pin.strip())}}
    )
    # Force re-login with the new PIN — revoke any existing sessions for this volunteer so a
    # compromised/old session can't keep the account after a reset.
    await db.sessions.delete_many({"username": username})
    return _to_member(user)


@router.delete("/{username}", status_code=204)
async def remove_staff(username: str, _: dict = Depends(require_master)):
    await _get_volunteer(username)
    await db.users.delete_one({"username": username})
    await db.sessions.delete_many({"username": username})  # sign the removed volunteer out everywhere
    return None
