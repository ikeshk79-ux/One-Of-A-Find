"""Backend test for: inventory create applies the zone adjustment and writes a pricing_ledger row."""

import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

from .conftest import api_url

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
_mongo = MongoClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]


def _appraisal(recommended_price: float) -> dict:
    return {
        "title": f"tscheck item {uuid.uuid4().hex[:6]}",
        "brand": "TestBrand",
        "category": "Women's tops",
        "description": "A test item",
        "condition": "Good",
        "peak_retail_price": recommended_price,
        "market_average_price": recommended_price,
        "recommended_price": recommended_price,
        "confidence": "high",
        "rationale": "test fixture",
    }


def test_inventory_create_applies_zone_adjustment_and_ledger(master_client):
    created_ids = []
    try:
        # With location -> Tooting (Zone 3, -10%): 80 * 0.9 = 72
        resp = master_client.post(
            api_url("/inventory"),
            json={"appraisal": _appraisal(80), "location": "Tooting"},
        )
        assert resp.status_code == 201, resp.text
        item = resp.json()
        created_ids.append(item["id"])
        assert item["recommended_price"] == 72

        ledger_row = _db.pricing_ledger.find_one({"item_id": item["id"]})
        assert ledger_row is not None, "expected a pricing_ledger row for the new item"
        assert ledger_row["reason"] == "create"
        assert ledger_row["base_price"] == 80
        assert ledger_row["adjustment_percent"] == -10
        assert ledger_row["final_price"] == 72
        assert ledger_row["zone"] == 3
        assert ledger_row["rule_version"] >= 1

        # Without location -> recommended_price unchanged
        resp2 = master_client.post(
            api_url("/inventory"),
            json={"appraisal": _appraisal(80)},
        )
        assert resp2.status_code == 201, resp2.text
        item2 = resp2.json()
        created_ids.append(item2["id"])
        assert item2["recommended_price"] == 80
    finally:
        for item_id in created_ids:
            master_client.delete(api_url(f"/inventory/{item_id}"))

