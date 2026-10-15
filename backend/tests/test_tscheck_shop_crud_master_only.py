"""Backend test for: shop CRUD is master-only and preserves data integrity."""

import uuid

import httpx

from .conftest import api_url


def test_nonmaster_cannot_create_edit_delete_shops(volunteer_available=None):
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(api_url("/shops"), json={"name": f"tscheck-nm-{uuid.uuid4().hex[:6]}"})
        assert resp.status_code in (401, 403), resp.text
        resp2 = c.patch(api_url("/shops/does-not-matter"), json={"name": "x"})
        assert resp2.status_code in (401, 403), resp2.text
        resp3 = c.delete(api_url("/shops/does-not-matter"))
        assert resp3.status_code in (401, 403), resp3.text


def test_master_shop_crud_lifecycle(master_client):
    name = f"tscheck-shop-{uuid.uuid4().hex[:8]}"
    created = master_client.post(
        api_url("/shops"),
        json={"name": name, "zone": 2, "address": "1 Test St", "postcode": "TE1 1ST"},
    )
    assert created.status_code == 201, created.text
    shop = created.json()
    shop_id = shop["id"]
    assert shop["name"] == name
    assert shop["zone"] == 2

    try:
        # Duplicate name rejected
        dup = master_client.post(api_url("/shops"), json={"name": name})
        assert dup.status_code == 409, dup.text

        # PATCH: set outside_zones=true clears zone to null
        patch_outside = master_client.patch(
            api_url(f"/shops/{shop_id}"), json={"outside_zones": True}
        )
        assert patch_outside.status_code == 200, patch_outside.text
        body = patch_outside.json()
        assert body["outside_zones"] is True
        assert body["zone"] is None

        # PATCH: setting a zone implicitly clears needs_zone_review
        patch_review_set = master_client.patch(
            api_url(f"/shops/{shop_id}"), json={"zone": 3, "needs_zone_review": True}
        )
        assert patch_review_set.status_code == 200, patch_review_set.text
        assert patch_review_set.json()["needs_zone_review"] is True

        patch_zone_only = master_client.patch(api_url(f"/shops/{shop_id}"), json={"zone": 4})
        assert patch_zone_only.status_code == 200, patch_zone_only.text
        body2 = patch_zone_only.json()
        assert body2["zone"] == 4
        assert body2["needs_zone_review"] is False

        # DELETE soft-disables
        deleted = master_client.delete(api_url(f"/shops/{shop_id}"))
        assert deleted.status_code == 200, deleted.text
        assert deleted.json()["disabled"] is True

        listing = master_client.get(api_url("/shops"))
        assert shop_id not in {s["id"] for s in listing.json()}

        listing_incl = master_client.get(api_url("/shops"), params={"include_disabled": 1})
        ids_incl = {s["id"] for s in listing_incl.json()}
        assert shop_id in ids_incl
    finally:
        # best-effort cleanup: ensure it stays disabled (already is), nothing further needed
        pass
