"""Backend test for: Concurrent AI burst limit holds under race, repeatably.

Retest of the TOCTOU fix in lib/ai_quota.py::enforce_ai_quota(). The burst slot is now
reserved (dq.append(now)) synchronously BEFORE the daily-cap await, so concurrent requests
from the same user observe each other's reservations and the limit holds. This test fires 6
concurrent POST /api/inventory/{id}/blurb calls (asyncio-free ThreadPoolExecutor, no awaiting
between them) twice back-to-back with a 10s drain wait in between, asserting the same shape
(5x200 + 1x429 'Too many AI requests') both times.
"""

import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from .conftest import api_url, login_client


def _register_fresh_volunteer():
    import httpx

    username = f"tscheck-burstrace-{uuid.uuid4().hex[:8]}"
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


def _fire_six_concurrent(c, item_id):
    def _call(_i):
        resp = c.post(api_url(f"/inventory/{item_id}/blurb"), json={"tone": "concise"})
        try:
            body = resp.json()
        except Exception:
            body = {}
        return resp.status_code, body

    with ThreadPoolExecutor(max_workers=6) as pool:
        return list(pool.map(_call, range(6)))


def _assert_shape(results):
    statuses = [r[0] for r in results]
    bodies = [r[1] for r in results]
    ok_count = statuses.count(200)
    rejected = [b for s, b in zip(statuses, bodies) if s == 429]
    assert ok_count == 5, statuses
    assert len(rejected) == 1, statuses
    assert rejected[0]["detail"].startswith("Too many AI requests"), rejected[0]


def test_burst_limit_holds_under_race_twice_back_to_back():
    username, pin = _register_fresh_volunteer()
    c = login_client(username, pin)
    created_id = None
    try:
        item = _create_item(c, "tscheck-burst-race-twice-item")
        created_id = item["id"]

        run1 = _fire_six_concurrent(c, created_id)
        _assert_shape(run1)

        # Let the 10s sliding window fully drain before the second run.
        time.sleep(10.5)

        run2 = _fire_six_concurrent(c, created_id)
        _assert_shape(run2)
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
