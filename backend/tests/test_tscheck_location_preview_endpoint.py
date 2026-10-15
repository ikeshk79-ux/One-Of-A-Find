"""Backend test for: GET /api/inventory/{item_id}/location-preview rebases price without
mutating DB state."""

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
        "title": f"tscheck-location-preview-{uuid.uuid4().hex[:6]}",
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


def test_location_preview_rebases_without_mutating(master_client):
    # Seed an item at Tooting (Zone 3, -10%): 80 -> 72
    resp = master_client.post(
        api_url("/inventory"),
        json={"appraisal": _appraisal(80), "location": "Tooting"},
    )
    assert resp.status_code == 201, resp.text
    item = resp.json()
    item_id = item["id"]
    try:
        assert item["recommended_price"] == 72
        ledger_count_before = _db.pricing_ledger.count_documents({"item_id": item_id})

        # Preview against Brompton Road (Zone 1, 0%) -> base 80, final 80
        r1 = master_client.get(
            api_url(f"/inventory/{item_id}/location-preview"),
            params={"location": "Brompton Road"},
        )
        assert r1.status_code == 200, r1.text
        p1 = r1.json()
        assert p1["base_price"] == 80
        assert p1["final_price"] == 80
        assert p1["zone"] == 1
        assert p1["adjustment_percent"] == 0

        # Preview against Ealing (Zone 3, -10%) -> base 80, final 72
        r2 = master_client.get(
            api_url(f"/inventory/{item_id}/location-preview"),
            params={"location": "Ealing"},
        )
        assert r2.status_code == 200, r2.text
        p2 = r2.json()
        assert p2["base_price"] == 80
        assert p2["final_price"] == 72
        assert p2["zone"] == 3
        assert p2["adjustment_percent"] == -10

        # Unknown location -> 422
        r3 = master_client.get(
            api_url(f"/inventory/{item_id}/location-preview"),
            params={"location": "Nowhere"},
        )
        assert r3.status_code == 422, r3.text

        # Bogus item id -> 404
        r4 = master_client.get(
            api_url("/inventory/not-a-real-item-id/location-preview"),
            params={"location": "Ealing"},
        )
        assert r4.status_code == 404, r4.text

        # Item itself unchanged, no new ledger rows written by preview calls
        doc = _db.inventory.find_one({"id": item_id})
        assert doc["recommended_price"] == 72
        assert doc["location"] == "Tooting"
        ledger_count_after = _db.pricing_ledger.count_documents({"item_id": item_id})
        assert ledger_count_after == ledger_count_before
    finally:
        master_client.delete(api_url(f"/inventory/{item_id}"))
