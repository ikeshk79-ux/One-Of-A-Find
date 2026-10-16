"""Backend test for: shop merge into a disabled target is refused.

DELETE /api/shops/{src_id}?mode=remove&reassign_to=<disabled_target_id> must reject with 422
"Target shop is disabled — re-enable it before merging" and must NOT mutate anything: the
source shop and its items remain exactly as they were. Also regression-guards the happy path
(merge into a different, active target still succeeds).
"""

import uuid

from .conftest import api_url


def _create_shop(master_client, name: str, zone: int = 1):
    resp = master_client.post(api_url("/shops"), json={"name": name, "zone": zone})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_item(master_client, title: str, location: str):
    resp = master_client.post(
        api_url("/inventory"),
        json={
            "appraisal": {
                "title": title,
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
            "location": location,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_merge_into_disabled_target_rejected_with_422_no_mutation(master_client):
    suffix = uuid.uuid4().hex[:6]
    source_name = f"tscheck-mergedisabled-src-{suffix}"
    target_name = f"tscheck-mergedisabled-dst-{suffix}"

    source_id = _create_shop(master_client, source_name)
    target_id = _create_shop(master_client, target_name)
    item_id = _create_item(master_client, f"tscheck merge-disabled item {suffix}", source_name)

    try:
        # Soft-disable the target (default DELETE mode disables rather than removes).
        disable = master_client.delete(api_url(f"/shops/{target_id}"))
        assert disable.status_code == 200, disable.text

        merged = master_client.delete(
            api_url(f"/shops/{source_id}"),
            params={"mode": "remove", "reassign_to": target_id},
        )
        assert merged.status_code == 422, merged.text
        assert merged.json()["detail"] == "Target shop is disabled — re-enable it before merging"

        # Source shop and item untouched.
        listing = master_client.get(api_url("/shops"), params={"include_disabled": 1})
        ids = {s["id"] for s in listing.json()}
        assert source_id in ids
        assert target_id in ids

        got_item = master_client.get(api_url(f"/inventory/{item_id}"))
        assert got_item.status_code == 200, got_item.text
        assert got_item.json()["location"] == source_name
    finally:
        master_client.delete(api_url(f"/inventory/{item_id}"))
        master_client.delete(api_url(f"/shops/{source_id}"), params={"mode": "remove"})
        master_client.delete(api_url(f"/shops/{target_id}"), params={"mode": "remove"})


def test_merge_into_active_target_still_succeeds(master_client):
    suffix = uuid.uuid4().hex[:6]
    source_name = f"tscheck-mergeactive-src-{suffix}"
    target_name = f"tscheck-mergeactive-dst-{suffix}"

    source_id = _create_shop(master_client, source_name)
    target_id = _create_shop(master_client, target_name)
    item_id = _create_item(master_client, f"tscheck merge-active item {suffix}", source_name)

    try:
        merged = master_client.delete(
            api_url(f"/shops/{source_id}"),
            params={"mode": "remove", "reassign_to": target_id},
        )
        assert merged.status_code == 200, merged.text

        listing = master_client.get(api_url("/shops"), params={"include_disabled": 1})
        ids = {s["id"] for s in listing.json()}
        assert source_id not in ids
        assert target_id in ids

        got_item = master_client.get(api_url(f"/inventory/{item_id}"))
        assert got_item.status_code == 200, got_item.text
        assert got_item.json()["location"] == target_name
    finally:
        master_client.delete(api_url(f"/inventory/{item_id}"))
        master_client.delete(api_url(f"/shops/{target_id}"), params={"mode": "remove"})
