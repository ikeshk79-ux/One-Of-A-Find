"""Backend test for: pricing_ledger/pricing_rules/shops indexes declared in lib/db.py
INDEXES are actually applied to the running Mongo instance by ensure_indexes().

Also a quick sanity check that /api/pricing/audit still returns 200 for master.
"""

import sys
from pathlib import Path

import pytest

from .conftest import api_url, master_client  # noqa: F401 (fixture import)

# backend/ is the pytest rootdir/cwd, so "lib.db" resolves the same module the running
# server imports — this does not import the FastAPI app, only the shared Motor handle.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.db import db  # noqa: E402


@pytest.mark.asyncio
async def test_pricing_ledger_and_rules_and_shops_indexes_exist():
    ledger_idx = await db.pricing_ledger.index_information()
    assert "item_created_desc" in ledger_idx, ledger_idx
    spec = dict(ledger_idx["item_created_desc"]["key"])
    assert spec.get("item_id") == 1
    assert spec.get("created_at") == -1

    rules_idx = await db.pricing_rules.index_information()
    assert "version_desc" in rules_idx, rules_idx
    assert dict(rules_idx["version_desc"]["key"]).get("version") == -1

    shops_idx = await db.shops.index_information()
    assert "id" in shops_idx, shops_idx
    assert shops_idx["id"].get("unique") is True


def test_pricing_audit_endpoint_sanity(master_client):
    resp = master_client.get(api_url("/pricing/audit"))
    assert resp.status_code == 200, resp.text
