"""Backend test for: inventory PATCH re-prices on location change, but not when price_source is custom."""

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


def test_patch_location_reprices_item(master_client):
    created = master_client.post(
        api_url("/inventory"), json={"appraisal": _appraisal(100), "location": "Tooting"}
    )
    assert created.status_code == 201, created.text
    item = created.json()
    item_id = item["id"]
    try:
        assert item["recommended_price"] == 90  # Z3 -10%

        patched = master_client.patch(
            api_url(f"/inventory/{item_id}"), json={"location": "Brompton Road"}
        )
        assert patched.status_code == 200, patched.text
        assert patched.json()["recommended_price"] == 100  # Z1 0%, base restored

        ledger_row = _db.pricing_ledger.find_one(
            {"item_id": item_id, "reason": "update:location"}
        )
        assert ledger_row is not None
        assert ledger_row["base_price"] == 100
        assert ledger_row["adjustment_percent"] == 0
        assert ledger_row["final_price"] == 100
        assert ledger_row["zone"] == 1
    finally:
        master_client.delete(api_url(f"/inventory/{item_id}"))


def test_patch_custom_price_source_blocks_reprice(master_client):
    created = master_client.post(
        api_url("/inventory"), json={"appraisal": _appraisal(100), "location": "Tooting"}
    )
    assert created.status_code == 201, created.text
    item = created.json()
    item_id = item["id"]
    try:
        assert item["recommended_price"] == 90

        custom = master_client.patch(
            api_url(f"/inventory/{item_id}"),
            json={"price_source": "custom", "recommended_price": 77},
        )
        assert custom.status_code == 200, custom.text
        assert custom.json()["recommended_price"] == 77

        moved = master_client.patch(
            api_url(f"/inventory/{item_id}"), json={"location": "Brompton Road"}
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["recommended_price"] == 77  # custom override wins, unchanged

        extra_ledger_row = _db.pricing_ledger.find_one(
            {"item_id": item_id, "reason": "update:location"}
        )
        assert extra_ledger_row is None, "no re-price ledger row expected when price_source is custom"
    finally:
        master_client.delete(api_url(f"/inventory/{item_id}"))
