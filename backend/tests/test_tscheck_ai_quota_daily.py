"""Backend test for: AI daily quota blocks when exhausted.

Pre-seeds db.ai_quota with a count already at AI_DAILY_LIMIT for a fresh test user so the very
next /inventory/{id}/blurb call is the one that trips the daily cap (avoids actually burning 60
real calls). Expects 429 "Daily AI quota reached...". After removing the pre-seeded row, a fresh
call succeeds again (200).
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


def _register_fresh_volunteer() -> tuple[str, str]:
    username = f"tscheck-daily-{uuid.uuid4().hex[:8]}"
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
async def test_daily_quota_blocks_when_already_at_cap_then_recovers_after_removal():
    username, pin = _register_fresh_volunteer()
    c = login_client(username, pin)
    created_id = None
    bucket = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        item = _create_item(c, "tscheck-daily-quota-item")
        created_id = item["id"]

        # Pre-seed the user already at the daily cap.
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

        blocked = c.post(api_url(f"/inventory/{created_id}/blurb"), json={"tone": "concise"})
        assert blocked.status_code == 429, blocked.text
        assert blocked.json()["detail"].startswith("Daily AI quota reached"), blocked.json()

        # Remove the pre-seed and confirm a fresh call succeeds again.
        await db.ai_quota.delete_one({"username": username, "bucket": bucket})

        ok = c.post(api_url(f"/inventory/{created_id}/blurb"), json={"tone": "concise"})
        assert ok.status_code == 200, ok.text
    finally:
        await db.ai_quota.delete_one({"username": username, "bucket": bucket})
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
