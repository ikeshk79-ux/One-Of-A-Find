"""Backend tests for shop hard-delete (?mode=remove) vs default soft-disable.

Covers:
- Admin can hard-delete a shop with no inventory references.
- Admin cannot hard-delete a shop that still has inventory items pointing at it (409).
- Default DELETE (no mode) still soft-disables in both scenarios.
- Non-master cannot delete shops in either mode (401/403).
"""

import uuid

import httpx

from .conftest import api_url


def test_hard_delete_free_shop_succeeds_and_disable_default_still_works(master_client):
    # Free shop: hard-delete should succeed and remove it from include_disabled listing.
    free_name = f"tscheck-remove-free-{uuid.uuid4().hex[:6]}"
    created = master_client.post(api_url("/shops"), json={"name": free_name, "zone": 1})
    assert created.status_code == 201, created.text
    shop_id = created.json()["id"]

    deleted = master_client.delete(api_url(f"/shops/{shop_id}"), params={"mode": "remove"})
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["id"] == shop_id

    listing = master_client.get(api_url("/shops"), params={"include_disabled": 1})
    ids = {s["id"] for s in listing.json()}
    assert shop_id not in ids

    # Default DELETE (no mode) still soft-disables a separate temp shop.
    disable_name = f"tscheck-disable-free-{uuid.uuid4().hex[:6]}"
    created2 = master_client.post(api_url("/shops"), json={"name": disable_name, "zone": 1})
    assert created2.status_code == 201, created2.text
    shop_id2 = created2.json()["id"]

    deleted2 = master_client.delete(api_url(f"/shops/{shop_id2}"))
    assert deleted2.status_code == 200, deleted2.text
    assert deleted2.json()["disabled"] is True

    listing2 = master_client.get(api_url("/shops"), params={"include_disabled": 1})
    ids2 = {s["id"] for s in listing2.json()}
    assert shop_id2 in ids2

    # Cleanup: hard-delete the now-disabled shop to not leave residue.
    cleanup = master_client.delete(api_url(f"/shops/{shop_id2}"), params={"mode": "remove"})
    assert cleanup.status_code == 200, cleanup.text


def test_hard_delete_blocked_when_inventory_references_shop(master_client):
    shop_name = f"tscheck-remove-with-items-{uuid.uuid4().hex[:6]}"
    created = master_client.post(api_url("/shops"), json={"name": shop_name, "zone": 1})
    assert created.status_code == 201, created.text
    shop_id = created.json()["id"]

    item = master_client.post(
        api_url("/inventory"),
        json={
            "appraisal": {
                "title": f"tscheck hard-delete guard item {uuid.uuid4().hex[:6]}",
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
            "location": shop_name,
        },
    )
    assert item.status_code == 201, item.text
    item_id = item.json()["id"]

    blocked = master_client.delete(api_url(f"/shops/{shop_id}"), params={"mode": "remove"})
    assert blocked.status_code == 409, blocked.text
    assert "still reference this shop" in blocked.json()["detail"]

    # Default DELETE (no mode) still succeeds (soft-disable) even with items attached.
    disabled = master_client.delete(api_url(f"/shops/{shop_id}"))
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["disabled"] is True

    # Cleanup: hard-delete the inventory item, then hard-delete the shop.
    del_item = master_client.delete(api_url(f"/inventory/{item_id}"))
    assert del_item.status_code in (200, 204), del_item.text

    cleanup_shop = master_client.delete(api_url(f"/shops/{shop_id}"), params={"mode": "remove"})
    assert cleanup_shop.status_code == 200, cleanup_shop.text


def test_delete_shop_404_for_unknown_id(master_client):
    resp = master_client.delete(api_url("/shops/not-a-real-shop-id"), params={"mode": "remove"})
    assert resp.status_code == 404, resp.text


def test_nonmaster_cannot_delete_shop_either_mode():
    with httpx.Client(timeout=30.0) as c:
        resp1 = c.delete(api_url("/shops/does-not-matter"))
        assert resp1.status_code in (401, 403), resp1.text
        resp2 = c.delete(api_url("/shops/does-not-matter"), params={"mode": "remove"})
        assert resp2.status_code in (401, 403), resp2.text


def test_volunteer_cannot_delete_shop_either_mode(volunteer_client):
    resp1 = volunteer_client.delete(api_url("/shops/does-not-matter"))
    assert resp1.status_code in (401, 403), resp1.text
    resp2 = volunteer_client.delete(api_url("/shops/does-not-matter"), params={"mode": "remove"})
    assert resp2.status_code in (401, 403), resp2.text
