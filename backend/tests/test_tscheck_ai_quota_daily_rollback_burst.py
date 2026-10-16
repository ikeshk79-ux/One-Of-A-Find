"""Backend test for: Daily cap over-limit rolls back both the Mongo count AND the burst slot.

Pre-inserts db.ai_quota at the daily cap, then fires 6 blurb calls (1 + 5 more). Every one of
them must come back 429 'Daily AI quota reached' -- never 'Too many AI requests'. If the
burst-slot rollback on the daily-reject branch were missing, the first rejected call would
still consume (and leak) a burst slot without the user ever getting a successful call, and a
run of enough daily-rejected calls would eventually also trip the burst limiter and start
returning the *burst* message instead of the daily one. After removing the pre-seed, a fresh
call succeeds.
"""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from .conftest import api_url, login_client

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.db import db  # noqa: E402

AI_DAILY_LIMIT = int(os.environ.get("AI_DAILY_LIMIT", "60"))


def _register_fresh_volunteer():
    username = f"tscheck-dailyrb-{uuid.uuid4().hex[:8]}"
    pin = "432154"
    c = httpx.Client(timeout=30.0)
    resp = c.post(
        api_url("/auth/register"),
        json={"username": username, "pin": pin, "shop_password": "Oneofafind"},
    )
    assert resp.status_code in (200, 201), resp.text
    c.close()
    return username, pin


def _create_item(c, title: str):
    resp = c.post(
        api_url("/inventory"),
        json={
            "appraisal": {
                "title": title,
                "brand": "Test",
                "category": "Homewear",
                "description": "x",
                "condition": "Good",
                "peak_retail_price": 100,
                "market_average_price": 40,
                "recommended_price": 27.5,
                "currency": "GBP",
                "confidence": "Medium",
                "rationale": "x",
            },
            "donor_name": "QA Donor",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_daily_cap_reject_rolls_back_burst_slot_across_six_calls():
    username, pin = _register_fresh_volunteer()
    c = login_client(username, pin)
    created_id = None
    bucket = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        item = _create_item(c, "tscheck-daily-rollback-item")
        created_id = item["id"]

        await db.ai_quota.update_one(
            {"username": username, "bucket": bucket},
            {
                "$set": {
                    "count": AI_DAILY_LIMIT,
                    "expires_at": datetime.now(timezone.utc).replace(
                        hour=23, minute=59, second=59, microsecond=0
                    ),
                }
            },
            upsert=True,
        )

        for i in range(6):
            resp = c.post(api_url(f"/inventory/{created_id}/blurb"), json={"tone": "concise"})
            assert resp.status_code == 429, f"call {i}: {resp.status_code} {resp.text}"
            detail = resp.json()["detail"]
            assert detail.startswith("Daily AI quota reached"), f"call {i}: {detail}"

        await db.ai_quota.delete_one({"username": username, "bucket": bucket})

        recovered = c.post(api_url(f"/inventory/{created_id}/blurb"), json={"tone": "concise"})
        assert recovered.status_code == 200, recovered.text
    finally:
        await db.ai_quota.delete_one({"username": username, "bucket": bucket})
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
