"""Backend test for: Till mode one-tap sell — PATCH /inventory/{id}/sell at the tag price,
and rejecting a second sell on an already-sold item."""

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


def test_sell_marks_item_sold_at_recommended_price():
    c = _authed_client()
    created_id = None
    try:
        item = _create_item(c, "tscheck-till-sell-item")
        created_id = item["id"]
        recommended = item["recommended_price"]

        sell_resp = c.patch(
            api_url(f"/inventory/{created_id}/sell"),
            json={"sold": True, "sold_price": round(recommended * 100) / 100},
        )
        assert sell_resp.status_code == 200, sell_resp.text
        sold = sell_resp.json()
        assert sold["status"] == "sold"
        assert sold["sold_price"] == recommended

        # un-sell to restore item state (per seed_facts reversible-sell note)
        restore = c.patch(api_url(f"/inventory/{created_id}/sell"), json={"sold": False})
        assert restore.status_code == 200, restore.text
        assert restore.json()["status"] == "available"
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()


def test_unsell_restores_available_status():
    """The reversible-sell note in seed_facts: {"sold": false} un-sells cleanly, which is what
    every other check in this run relies on to restore state after exercising the till."""
    c = _authed_client()
    created_id = None
    try:
        item = _create_item(c, "tscheck-till-unsell-item")
        created_id = item["id"]
        recommended = item["recommended_price"]

        sell_resp = c.patch(
            api_url(f"/inventory/{created_id}/sell"),
            json={"sold": True, "sold_price": round(recommended * 100) / 100},
        )
        assert sell_resp.status_code == 200, sell_resp.text
        assert sell_resp.json()["status"] == "sold"

        lookup = c.get(api_url(f"/inventory/{created_id}"))
        assert lookup.status_code == 200
        assert lookup.json()["sold_price"] == recommended

        restore = c.patch(api_url(f"/inventory/{created_id}/sell"), json={"sold": False})
        assert restore.status_code == 200, restore.text
        restored = restore.json()
        assert restored["status"] == "available"
        assert restored["sold_price"] is None
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
