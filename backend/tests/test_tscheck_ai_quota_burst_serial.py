"""Backend test for: Serial calls still succeed up to AI_BURST_LIMIT.

Fires AI_BURST_LIMIT (default 5) blurb calls one at a time (await each before firing the
next), then a 6th immediately after, then (after draining the 10s window) a 7th. Each call
is a real Gemini-backed round trip (~3-6s observed), which is slower than the fix under test
is concerned with -- recorded here as groundwork/evidence either way.
"""

import os
import time
import uuid

from .conftest import api_url, login_client

AI_BURST_LIMIT = int(os.environ.get("AI_BURST_LIMIT", "5"))
AI_BURST_WINDOW_SECONDS = int(os.environ.get("AI_BURST_WINDOW_SECONDS", "10"))


def _register_fresh_volunteer():
    import httpx

    username = f"tscheck-burstserial-{uuid.uuid4().hex[:8]}"
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


def test_serial_burst_calls_then_drain_and_recover():
    username, pin = _register_fresh_volunteer()
    c = login_client(username, pin)
    created_id = None
    try:
        item = _create_item(c, "tscheck-burst-serial-item")
        created_id = item["id"]

        t0 = time.monotonic()
        serial_results = []
        for _ in range(AI_BURST_LIMIT):
            resp = c.post(api_url(f"/inventory/{created_id}/blurb"), json={"tone": "concise"})
            serial_results.append(resp.status_code)
        elapsed = time.monotonic() - t0

        # The first AI_BURST_LIMIT serial calls must always succeed regardless of timing.
        assert serial_results == [200] * AI_BURST_LIMIT, serial_results

        sixth = c.post(api_url(f"/inventory/{created_id}/blurb"), json={"tone": "concise"})

        if elapsed < AI_BURST_WINDOW_SECONDS:
            # All 5 prior calls landed inside the window -> 6th must be rejected by the burst cap.
            assert sixth.status_code == 429, sixth.text
            assert sixth.json()["detail"].startswith("Too many AI requests"), sixth.json()
        else:
            # Real per-call LLM latency (~3-6s observed) means 5 fully-sequential calls can
            # exceed the 10s window on their own, draining early entries before the 6th lands --
            # this is an inherent product-latency property, not a regression of the TOCTOU fix
            # (which only targets same-instant concurrent requests). Documented, not asserted
            # as a failure here since it is outside the fix's stated scope.
            pass

        # After waiting out the window from the last recorded timestamp, a fresh call recovers.
        time.sleep(AI_BURST_WINDOW_SECONDS + 1)
        recovered = c.post(api_url(f"/inventory/{created_id}/blurb"), json={"tone": "concise"})
        assert recovered.status_code == 200, recovered.text
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
