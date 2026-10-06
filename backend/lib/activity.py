import uuid
from datetime import datetime, timezone

from lib.db import db


async def log_activity(
    username: str | None,
    action: str,
    *,
    item: dict | None = None,
    item_id: str | None = None,
    item_title: str | None = None,
    item_sku: str | None = None,
    details: dict | None = None,
) -> None:
    """Append an audit entry. Only the master account can read these back."""
    if item is not None:
        item_id = item.get("id")
        item_title = item.get("title")
        item_sku = item.get("sku")
    await db.activity.insert_one(
        {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc),
            "username": username or "unknown",
            "action": action,
            "item_id": item_id,
            "item_title": item_title,
            "item_sku": item_sku,
            "details": details,
        }
    )
