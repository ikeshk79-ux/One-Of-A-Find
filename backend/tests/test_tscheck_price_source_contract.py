"""Backend test for: POST /inventory honours price_source='peak'/'custom' as-entered and only
zone-adjusts 'charity'. Covers the criterion:
"Backend contract: POST /inventory with price_source='peak' or 'custom' never changes
recommended_price via zone adjustment" — Askew Road is seeded Zone 2 (-5%), so a non-zero
adjustment is guaranteed to apply for the 'charity' case, making the three payloads
distinguishable.
"""

import uuid

from .conftest import api_url

ASKEW_ROAD = "Askew Road"  # seeded Zone 2, -5%


def _appraisal(price_source: str, recommended_price: float, peak: float = 40.0) -> dict:
    return {
        "title": f"tscheck-price-source-{price_source}-{uuid.uuid4().hex[:6]}",
        "brand": "TestBrand",
        "category": "Women's tops",
        "description": "A test item",
        "condition": "Very good",
        "price_source": price_source,
        "peak_retail_price": peak,
        "market_average_price": peak,
        "recommended_price": recommended_price,
        "confidence": "high",
        "rationale": "test fixture",
    }


def test_charity_price_source_gets_zone_adjusted(master_client):
    """'charity' with base 20 at Zone 2 (-5%) -> round(20*0.95)=19, ledger reflects the -5%."""
    created_ids = []
    try:
        resp = master_client.post(
            api_url("/inventory"),
            json={"appraisal": _appraisal("charity", 20.0), "location": ASKEW_ROAD},
        )
        assert resp.status_code == 201, resp.text
        item = resp.json()
        created_ids.append(item["id"])
        assert item["recommended_price"] == 19, item["recommended_price"]

        from pathlib import Path
        import os

        from dotenv import load_dotenv
        from pymongo import MongoClient

        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        mongo = MongoClient(os.environ["MONGO_URL"])
        db = mongo[os.environ["DB_NAME"]]
        ledger_row = db.pricing_ledger.find_one({"item_id": item["id"]})
        assert ledger_row is not None
        assert ledger_row["reason"] == "create"
        assert ledger_row["base_price"] == 20
        assert ledger_row["adjustment_percent"] == -5
        assert ledger_row["final_price"] == 19
        assert ledger_row["zone"] == 2
        mongo.close()
    finally:
        for item_id in created_ids:
            master_client.delete(api_url(f"/inventory/{item_id}"))


def test_peak_and_custom_price_sources_bypass_zone_adjustment(master_client):
    """'peak' and 'custom' at the same Zone-2 shop with the same base (20) save verbatim —
    unlike 'charity' (which becomes 19 above), these stay at 20. Ledger rows exist with
    adjustment_percent == 0 and base_price == final_price."""
    created_ids = []
    try:
        for price_source in ("peak", "custom"):
            resp = master_client.post(
                api_url("/inventory"),
                json={
                    "appraisal": _appraisal(price_source, 20.0),
                    "location": ASKEW_ROAD,
                },
            )
            assert resp.status_code == 201, resp.text
            item = resp.json()
            created_ids.append(item["id"])
            assert item["recommended_price"] == 20, (price_source, item["recommended_price"])

        from pathlib import Path
        import os

        from dotenv import load_dotenv
        from pymongo import MongoClient

        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        mongo = MongoClient(os.environ["MONGO_URL"])
        db = mongo[os.environ["DB_NAME"]]
        for item_id in created_ids:
            ledger_row = db.pricing_ledger.find_one({"item_id": item_id})
            assert ledger_row is not None
            assert ledger_row["reason"] == "create"
            assert ledger_row["adjustment_percent"] == 0
            assert ledger_row["base_price"] == ledger_row["final_price"] == 20
        mongo.close()
    finally:
        for item_id in created_ids:
            master_client.delete(api_url(f"/inventory/{item_id}"))


def test_peak_custom_exact_values_honoured_with_decimals(master_client):
    """Peak RRP of 35.00 and a custom 17.00 at the same Zone-2 shop save exactly as entered
    (decimal precision preserved), matching the SuccessMoment hero expectation in the matrix."""
    created_ids = []
    try:
        resp_peak = master_client.post(
            api_url("/inventory"),
            json={
                "appraisal": _appraisal("peak", 35.0, peak=35.0),
                "location": ASKEW_ROAD,
            },
        )
        assert resp_peak.status_code == 201, resp_peak.text
        peak_item = resp_peak.json()
        created_ids.append(peak_item["id"])
        assert peak_item["recommended_price"] == 35.0

        resp_custom = master_client.post(
            api_url("/inventory"),
            json={
                "appraisal": _appraisal("custom", 17.0),
                "location": ASKEW_ROAD,
            },
        )
        assert resp_custom.status_code == 201, resp_custom.text
        custom_item = resp_custom.json()
        created_ids.append(custom_item["id"])
        assert custom_item["recommended_price"] == 17.0
    finally:
        for item_id in created_ids:
            master_client.delete(api_url(f"/inventory/{item_id}"))
