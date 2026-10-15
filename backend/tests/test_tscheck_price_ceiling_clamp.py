"""Inventory create still clamps peak_retail_price/market_average_price to a sane ceiling
(100000 GBP). POST with absurd prices succeeds (201) but the stored item is clamped;
recommended_price stays non-negative; GET /api/inventory/stats stays finite. Cleans up the
test item after assertion.
"""

from .conftest import api_url

PRICE_CEILING = 100000.0


def _payload():
    return {
        "appraisal": {
            "title": "tscheck-price-ceiling item",
            "brand": "tscheck-brand",
            "category": "Books",
            "description": "A test item for the price ceiling check.",
            "condition": "Good",
            "is_electrical": False,
            "price_source": "charity",
            "peak_retail_price": 99999999,
            "market_average_price": 99999999,
            "recommended_price": 99999999,
            "currency": "GBP",
            "confidence": "high",
            "rationale": "test fixture",
            "resale_blurb": "",
        }
    }


def test_oversized_prices_clamped_to_ceiling(master_client):
    resp = master_client.post(api_url("/inventory"), json=_payload())
    try:
        assert resp.status_code == 201, resp.text
        item = resp.json()
        assert item["peak_retail_price"] <= PRICE_CEILING
        assert item["market_average_price"] <= PRICE_CEILING
        assert item["recommended_price"] >= 0

        stats_resp = master_client.get(api_url("/inventory/stats"))
        assert stats_resp.status_code == 200, stats_resp.text
        potential_value = stats_resp.json().get("potential_value")
        assert potential_value is not None
        assert potential_value == potential_value  # not NaN
        assert potential_value not in (float("inf"), float("-inf"))
    finally:
        if resp.status_code == 201:
            del_resp = master_client.delete(api_url(f"/inventory/{resp.json()['id']}"))
            assert del_resp.status_code == 204
