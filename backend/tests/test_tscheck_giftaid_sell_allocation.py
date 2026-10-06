"""Backend test for: Gift Aid sale allocation via PATCH /api/inventory/{id}/sell."""

import httpx

from .conftest import api_url, login_client, VOLUNTEER_USERNAME, VOLUNTEER_PIN


def _authed_client():
    return login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)


def test_sell_with_giftaid_ref_sets_and_clears_allocation():
    c = _authed_client()
    created_id = None
    try:
        create_resp = c.post(
            api_url("/inventory"),
            json={
                "appraisal": {
                    "title": "tscheck-giftaid-sell-item",
                    "brand": "Test",
                    "category": "Homeware",
                    "description": "x",
                    "condition": "Good",
                    "peak_retail_price": 100,
                    "market_average_price": 40,
                    "recommended_price": 46,
                    "currency": "GBP",
                    "confidence": "Medium",
                    "rationale": "x",
                },
                "donor_name": "QA Donor",
                # Gift Aid refs are numeric-only (digits are extracted server-side too).
                "giftaid_ref": "GA-99887",
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        item = create_resp.json()
        created_id = item["id"]
        assert item["giftaid_ref"] == "99887"
        assert item["sold_giftaid_ref"] is None

        sell_resp = c.patch(
            api_url(f"/inventory/{created_id}/sell"),
            json={"sold": True, "sold_price": 50},
        )
        assert sell_resp.status_code == 200, sell_resp.text
        sold_item = sell_resp.json()
        assert sold_item["status"] == "sold"
        assert sold_item["sold_giftaid_ref"] == "99887"
        assert sold_item["sold_price"] == 50.0

        unsell_resp = c.patch(
            api_url(f"/inventory/{created_id}/sell"),
            json={"sold": False},
        )
        assert unsell_resp.status_code == 200, unsell_resp.text
        unsold_item = unsell_resp.json()
        assert unsold_item["status"] == "available"
        assert unsold_item["sold_giftaid_ref"] is None
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
