"""Backend test for: Scan tag SKU lookup (200 for known SKU, 404 for unknown)."""

import httpx

from .conftest import api_url, login_client, VOLUNTEER_USERNAME, VOLUNTEER_PIN


def _authed_client():
    return login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)


def test_lookup_unknown_sku_returns_404():
    c = _authed_client()
    try:
        resp = c.get(api_url("/inventory/lookup"), params={"sku": "000000000000"})
        assert resp.status_code == 404, resp.text
    finally:
        c.close()


def test_lookup_known_sku_returns_200_and_matches_created_item():
    c = _authed_client()
    created_id = None
    try:
        create_resp = c.post(
            api_url("/inventory"),
            json={
                "appraisal": {
                    "title": "tscheck-lookup-item",
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
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        item = create_resp.json()
        created_id = item["id"]
        sku = item["sku"]
        assert len(sku) == 12 and sku.isdigit()

        lookup_resp = c.get(api_url("/inventory/lookup"), params={"sku": sku})
        assert lookup_resp.status_code == 200, lookup_resp.text
        looked_up = lookup_resp.json()
        assert looked_up["id"] == created_id
        assert looked_up["title"] == "tscheck-lookup-item"
    finally:
        if created_id:
            c.delete(api_url(f"/inventory/{created_id}"))
        c.close()
