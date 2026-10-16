"""Backend tests for merging a duplicate shop into another branch.

Covers:
- DELETE /api/shops/{id}?mode=remove&reassign_to=<target> reassigns inventory + pricing_ledger
  rows pointing at the source shop's name to the target shop's name, then hard-deletes the
  source shop.
- PATCH collision detail string ("Another shop already uses that name") surfaces verbatim so
  the frontend's detailOf() can render it instead of a generic 409 message.
"""

import uuid

from .conftest import api_url


def test_merge_reassigns_inventory_and_deletes_source(master_client):
    source_name = f"tscheck-merge-src-{uuid.uuid4().hex[:6]}"
    target_name = f"tscheck-merge-dst-{uuid.uuid4().hex[:6]}"

    src = master_client.post(api_url("/shops"), json={"name": source_name, "zone": 2})
    assert src.status_code == 201, src.text
    source_id = src.json()["id"]

    dst = master_client.post(api_url("/shops"), json={"name": target_name, "zone": 2})
    assert dst.status_code == 201, dst.text
    target_id = dst.json()["id"]

    item = master_client.post(
        api_url("/inventory"),
        json={
            "appraisal": {
                "title": f"tscheck merge guard item {uuid.uuid4().hex[:6]}",
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
            "location": source_name,
        },
    )
    assert item.status_code == 201, item.text
    item_id = item.json()["id"]

    try:
        merged = master_client.delete(
            api_url(f"/shops/{source_id}"),
            params={"mode": "remove", "reassign_to": target_id},
        )
        assert merged.status_code == 200, merged.text

        # Source shop is gone.
        listing = master_client.get(api_url("/shops"), params={"include_disabled": 1})
        ids = {s["id"] for s in listing.json()}
        assert source_id not in ids
        assert target_id in ids

        # Item's location was migrated to the target shop's name.
        got_item = master_client.get(api_url(f"/inventory/{item_id}"))
        assert got_item.status_code == 200, got_item.text
        assert got_item.json()["location"] == target_name
    finally:
        master_client.delete(api_url(f"/inventory/{item_id}"))
        master_client.delete(api_url(f"/shops/{target_id}"), params={"mode": "remove"})


def test_merge_into_self_rejected_and_merge_requires_existing_target(master_client):
    name = f"tscheck-merge-selfcheck-{uuid.uuid4().hex[:6]}"
    created = master_client.post(api_url("/shops"), json={"name": name, "zone": 1})
    assert created.status_code == 201, created.text
    shop_id = created.json()["id"]

    try:
        self_merge = master_client.delete(
            api_url(f"/shops/{shop_id}"),
            params={"mode": "remove", "reassign_to": shop_id},
        )
        assert self_merge.status_code == 422, self_merge.text

        bad_target = master_client.delete(
            api_url(f"/shops/{shop_id}"),
            params={"mode": "remove", "reassign_to": "not-a-real-shop-id"},
        )
        assert bad_target.status_code == 404, bad_target.text
    finally:
        master_client.delete(api_url(f"/shops/{shop_id}"), params={"mode": "remove"})


def test_patch_name_collision_surfaces_backend_detail_string(master_client):
    name_a = f"tscheck-collide-a-{uuid.uuid4().hex[:6]}"
    name_b = f"tscheck-collide-b-{uuid.uuid4().hex[:6]}"

    a = master_client.post(api_url("/shops"), json={"name": name_a, "zone": 1})
    b = master_client.post(api_url("/shops"), json={"name": name_b, "zone": 1})
    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text
    a_id = a.json()["id"]
    b_id = b.json()["id"]

    try:
        collide = master_client.patch(api_url(f"/shops/{b_id}"), json={"name": name_a})
        assert collide.status_code == 409, collide.text
        assert collide.json()["detail"] == "Another shop already uses that name"
    finally:
        master_client.delete(api_url(f"/shops/{a_id}"), params={"mode": "remove"})
        master_client.delete(api_url(f"/shops/{b_id}"), params={"mode": "remove"})
