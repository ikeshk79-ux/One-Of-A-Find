"""Backend test for: AI burst limiter blocks a rapid retry loop.

/api/inventory/{id}/blurb and /api/appraise share an in-memory sliding-window burst limiter
(AI_BURST_LIMIT=5 within AI_BURST_WINDOW_SECONDS=10, lib/ai_quota.py). Firing 6 blurb calls
back-to-back for the same session must succeed the first 5 and 429 the 6th with a detail
starting "Too many AI requests". Rate-limit state is per-username and shared across sessions,
so we create a fresh volunteer user for this test to avoid cross-test interference with the
shared VOLUNTEER_USERNAME account used elsewhere in the suite.
"""

import uuid
from concurrent.futures import ThreadPoolExecutor

from .conftest import api_url, login_client


def _register_fresh_volunteer() -> tuple[str, str]:
    import httpx

    username = f"tscheck-burst-{uuid.uuid4().hex[:8]}"
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


def test_burst_limit_blocks_sixth_rapid_blurb_call():
    username, pin = _register_fresh_volunteer()
    c = login_client(username, pin)
    created_id = None
    try:
        item = _create_item(c, "tscheck-burst-limit-item")
        created_id = item["id"]

        # The blurb call is a real (slow, several-second) LLM round trip. Fired sequentially,
        # 6 calls can take 30+s — long enough for the 10s sliding window to drain early entries
        # before the 6th call lands, masking the limiter. Fire them concurrently instead so all
        # 6 land well inside the AI_BURST_WINDOW_SECONDS=10 window, as a real rapid-retry loop
        # (or a frantic double-click) would.
        def _call(_i):
            resp = c.post(api_url(f"/inventory/{created_id}/blurb"), json={"tone": "concise"})
            return resp.status_code, resp.json()

        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(_call, range(6)))

        statuses = [r[0] for r in results]
        bodies = [r[1] for r in results]

        # Exactly AI_BURST_LIMIT(=5) of the 6 concurrent calls succeed; the rest are rejected
        # by the burst window with the 429 "Too many AI requests" detail.
        ok_count = statuses.count(200)
        rejected = [b for s, b in zip(statuses, bodies) if s == 429]
        assert ok_count == 5, statuses
        assert len(rejected) == 1, statuses
        assert rejected[0]["detail"].startswith("Too many AI requests"), rejected[0]
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
