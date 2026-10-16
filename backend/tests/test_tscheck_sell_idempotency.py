"""Backend test for: replayed sell is rejected (one-way idempotency guard).

PATCH /inventory/{id}/sell on an already-sold item must reject with 409 'Item is already
marked sold' and must NOT overwrite sold_price/sold_at — preserving income reporting under
cross-device races. Returning a sold item to the floor (sold -> available) remains allowed
and does not trip the guard; only sold -> sold is rejected.
"""

from .conftest import api_url, login_client, VOLUNTEER_USERNAME, VOLUNTEER_PIN


def _authed_client():
    return login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)


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


def test_replayed_sell_rejected_with_409_and_preserves_original_sale():
    c = _authed_client()
    created_id = None
    try:
        item = _create_item(c, "tscheck-idempotency-sell-item")
        created_id = item["id"]

        first = c.patch(
            api_url(f"/inventory/{created_id}/sell"),
            json={"sold": True, "sold_price": 5.00},
        )
        assert first.status_code == 200, first.text
        first_body = first.json()
        assert first_body["status"] == "sold"
        assert first_body["sold_price"] == 5.00
        # Read back the canonical stored value (Mongo round-trip) rather than trusting the
        # PATCH response's in-memory datetime, which can differ in sub-millisecond precision.
        after_first = c.get(api_url(f"/inventory/{created_id}"))
        assert after_first.status_code == 200, after_first.text
        first_sold_at = after_first.json()["sold_at"]
        assert first_sold_at

        replay = c.patch(
            api_url(f"/inventory/{created_id}/sell"),
            json={"sold": True, "sold_price": 99.99},
        )
        assert replay.status_code == 409, replay.text
        assert replay.json()["detail"] == "Item is already marked sold"

        lookup = c.get(api_url(f"/inventory/{created_id}"))
        assert lookup.status_code == 200, lookup.text
        body = lookup.json()
        # The replay must not have overwritten the original sale price or timestamp.
        assert body["sold_price"] == 5.00
        assert body["sold_at"] == first_sold_at
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()


def test_sold_item_can_still_be_returned_to_floor_and_resold():
    c = _authed_client()
    created_id = None
    try:
        item = _create_item(c, "tscheck-idempotency-return-item")
        created_id = item["id"]

        sell = c.patch(
            api_url(f"/inventory/{created_id}/sell"),
            json={"sold": True, "sold_price": 10.00},
        )
        assert sell.status_code == 200, sell.text

        # sold -> available is explicitly allowed (not what the guard blocks).
        restore = c.patch(api_url(f"/inventory/{created_id}/sell"), json={"sold": False})
        assert restore.status_code == 200, restore.text
        restored = restore.json()
        assert restored["status"] == "available"
        assert restored["sold_price"] is None
        assert restored["sold_at"] is None

        # Having returned to the floor, selling again (available -> sold) succeeds (200, not 409).
        resell = c.patch(
            api_url(f"/inventory/{created_id}/sell"),
            json={"sold": True, "sold_price": 12.00},
        )
        assert resell.status_code == 200, resell.text
        assert resell.json()["sold_price"] == 12.00
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
