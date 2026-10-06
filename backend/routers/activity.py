from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from lib.auth import require_master
from lib.db import db
from models.appraisal import ActivityDeleteRequest, ActivityEntry

router = APIRouter(prefix="/activity", tags=["activity"])


def _aware(doc: dict) -> dict:
    t = doc.get("timestamp")
    if isinstance(t, datetime) and t.tzinfo is None:
        doc["timestamp"] = t.replace(tzinfo=timezone.utc)
    return doc


@router.get("", response_model=list[ActivityEntry])
async def list_activity(_: dict = Depends(require_master)):
    docs = await db.activity.find({}, {"_id": 0}).sort("timestamp", -1).to_list(500)
    return [ActivityEntry(**_aware(d)) for d in docs]


@router.post("/delete")
async def delete_activity(body: ActivityDeleteRequest, _: dict = Depends(require_master)):
    # Master-only: purge the selected audit entries. Missing ids are simply ignored.
    if not body.ids:
        return {"deleted": 0}
    res = await db.activity.delete_many({"id": {"$in": body.ids}})
    return {"deleted": res.deleted_count}
