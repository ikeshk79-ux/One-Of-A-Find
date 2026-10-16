"""Backend test for: ai_quota collection has the TTL + unique index declared in lib/db.py.

Confirms ensure_indexes() applied the new config: a unique index on (username, bucket) named
"user_bucket" (enforces one daily-count doc per user/day) and a TTL index named "expires_ttl"
with expireAfterSeconds=0 (purges expired day-buckets automatically).
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.db import db  # noqa: E402


@pytest.mark.asyncio
async def test_ai_quota_has_unique_user_bucket_and_ttl_indexes():
    idx = await db.ai_quota.index_information()
    assert "user_bucket" in idx, idx
    user_bucket = idx["user_bucket"]
    assert dict(user_bucket["key"]).get("username") == 1
    assert dict(user_bucket["key"]).get("bucket") == 1
    assert user_bucket.get("unique") is True

    assert "expires_ttl" in idx, idx
    ttl = idx["expires_ttl"]
    assert dict(ttl["key"]).get("expires_at") == 1
    assert ttl.get("expireAfterSeconds") == 0
