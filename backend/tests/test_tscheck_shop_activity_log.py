"""Backend test for: master destructive shop actions (merge / hard-delete / soft-disable)
each write an activity_log entry, attributed to the acting master, including the item count
moved on a merge."""

import uuid

from .conftest import MASTER_USERNAME, api_url, master_client  # noqa: F401 (fixture import)


def _make_shop(master_client, name: str, zone: int = 2):
    resp = master_client.post(api_url("/shops"), json={"name": name, "zone": zone})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _activity_entries(master_client):
    resp = master_client.get(api_url("/activity"))
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_shop_merge_writes_shop_merged_activity_entry(master_client):
    dup_name = f"tscheck-merge-log-dup-{uuid.uuid4().hex[:6]}"
    target_name = f"tscheck-merge-log-target-{uuid.uuid4().hex[:6]}"

    dup_id = _make_shop(master_client, dup_name)
    target_id = _make_shop(master_client, target_name)

    item = master_client.post(
        api_url("/inventory"),
        json={
            "appraisal": {
                "title": f"tscheck merge-log item {uuid.uuid4().hex[:6]}",
                "brand": "TestBrand",
                "category": "Women's tops",
                "description": "A test item",
                "condition": "Good",
                "peak_retail_price": 20.0,
                "market_average_price": 20.0,
                "recommended_price": 20.0,
                "confidence": "high",
                "rationale": "test fixture",
            },
            "location": dup_name,
        },
    )
    assert item.status_code == 201, item.text
    item_id = item.json()["id"]

    try:
        merged = master_client.delete(
            api_url(f"/shops/{dup_id}"),
            params={"mode": "remove", "reassign_to": target_id},
        )
        assert merged.status_code == 200, merged.text

        entries = _activity_entries(master_client)
        merge_entries = [e for e in entries if e.get("action") == "shop_merged"
                          and e.get("details", {}).get("shop_id") == dup_id]
        assert merge_entries, entries[:5]
        entry = merge_entries[0]
        assert entry["details"]["target_shop_name"] == target_name
        assert entry["details"]["items_reassigned"] >= 1
        assert entry["username"] == MASTER_USERNAME
    finally:
        master_client.delete(api_url(f"/inventory/{item_id}"))
        master_client.delete(api_url(f"/shops/{target_id}"), params={"mode": "remove"})


def test_shop_hard_delete_writes_shop_deleted_activity_entry(master_client):
    name = f"tscheck-harddelete-log-{uuid.uuid4().hex[:6]}"
    shop_id = _make_shop(master_client, name)

    resp = master_client.delete(api_url(f"/shops/{shop_id}"), params={"mode": "remove"})
    assert resp.status_code == 200, resp.text

    entries = _activity_entries(master_client)
    deleted_entries = [e for e in entries if e.get("action") == "shop_deleted"
                        and e.get("details", {}).get("shop_id") == shop_id]
    assert deleted_entries, entries[:5]
    assert deleted_entries[0]["details"]["shop_name"] == name
    assert deleted_entries[0]["username"] == MASTER_USERNAME


def test_shop_soft_disable_writes_shop_disabled_activity_entry(master_client):
    name = f"tscheck-disable-log-{uuid.uuid4().hex[:6]}"
    shop_id = _make_shop(master_client, name)

    try:
        resp = master_client.delete(api_url(f"/shops/{shop_id}"))  # default mode = soft-disable
        assert resp.status_code == 200, resp.text
        assert resp.json()["disabled"] is True

        entries = _activity_entries(master_client)
        disabled_entries = [e for e in entries if e.get("action") == "shop_disabled"
                             and e.get("details", {}).get("shop_id") == shop_id]
        assert disabled_entries, entries[:5]
        assert disabled_entries[0]["details"]["shop_name"] == name
        assert disabled_entries[0]["username"] == MASTER_USERNAME
    finally:
        master_client.delete(api_url(f"/shops/{shop_id}"), params={"mode": "remove"})
