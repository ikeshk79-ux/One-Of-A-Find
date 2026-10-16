"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "inventory": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("sku", ASCENDING)], name="sku", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "sessions": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        # TTL index: Mongo purges expired sessions automatically once expires_at passes.
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "users": [IndexModel([("username", ASCENDING)], name="username", unique=True)],
    "activity": [IndexModel([("timestamp", DESCENDING)], name="ts_desc")],
    # pricing_ledger: `/pricing/audit` and `TagPage`'s latest-adjustment lookup both scan by
    # `item_id` sorted on `created_at` descending. Index both so the lookup stays O(log N) as
    # the ledger grows past the current ~tens of rows.
    "pricing_ledger": [
        IndexModel([("item_id", ASCENDING), ("created_at", DESCENDING)], name="item_created_desc"),
    ],
    # pricing_rules: `load_rules()` runs on every valuation and sorts by `version` desc to pick
    # the current ruleset. Tiny today but the primary read path.
    "pricing_rules": [IndexModel([("version", DESCENDING)], name="version_desc")],
    "shops": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    # ai_quota: TTL index so expired day-buckets drop automatically. Lookup by (username, bucket).
    "ai_quota": [
        IndexModel([("username", ASCENDING), ("bucket", ASCENDING)], name="user_bucket", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
