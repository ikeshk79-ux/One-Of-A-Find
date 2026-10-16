"""Backend test for: activity audit log — role gating, and full CRUD lifecycle attribution/logging."""


from .conftest import (
    MASTER_PIN,
    MASTER_USERNAME,
    VOLUNTEER_PIN,
    VOLUNTEER_USERNAME,
    api_url,
    login_client,
)

ITEM_PAYLOAD = {
    "appraisal": {
        "title": "tscheck-activity-item",
        "brand": "Test",
        "category": "Homewear",
        "description": "x",
        "condition": "Good",
        "peak_retail_price": 100,
        "market_average_price": 40,
        "recommended_price": 46,
        "currency": "GBP",
        "confidence": "Medium",
        "rationale": "x",
    },
    "donor_name": "QA Donor",
}


def test_volunteer_gets_403_from_activity_master_gets_200():
    volunteer = login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)
    try:
        resp = volunteer.get(api_url("/activity"))
        assert resp.status_code == 403, resp.text
    finally:
        volunteer.close()

    master = login_client(MASTER_USERNAME, MASTER_PIN)
    try:
        resp = master.get(api_url("/activity"))
        assert resp.status_code == 200, resp.text
        assert isinstance(resp.json(), list)
    finally:
        master.close()


def test_full_item_lifecycle_is_logged_and_attributed_to_volunteer():
    volunteer = login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)
    master = login_client(MASTER_USERNAME, MASTER_PIN)
    created_id = None
    try:
        create_resp = volunteer.post(api_url("/inventory"), json=ITEM_PAYLOAD)
        assert create_resp.status_code == 201, create_resp.text
        item = create_resp.json()
        created_id = item["id"]

        edit_resp = volunteer.patch(
            api_url(f"/inventory/{created_id}"),
            json={"title": "tscheck-activity-item-EDITED", "recommended_price": 55},
        )
        assert edit_resp.status_code == 200, edit_resp.text

        sell_resp = volunteer.patch(
            api_url(f"/inventory/{created_id}/sell"), json={"sold": True, "sold_price": 30}
        )
        assert sell_resp.status_code == 200, sell_resp.text

        return_resp = volunteer.patch(
            api_url(f"/inventory/{created_id}/sell"), json={"sold": False}
        )
        assert return_resp.status_code == 200, return_resp.text

        delete_resp = volunteer.delete(api_url(f"/inventory/{created_id}"))
        assert delete_resp.status_code in (200, 204), delete_resp.text
        created_id = None  # already deleted, skip cleanup

        activity_resp = master.get(api_url("/activity"))
        assert activity_resp.status_code == 200, activity_resp.text
        entries = activity_resp.json()
        item_entries = [e for e in entries if e.get("item_id") == item["id"]]
        actions = {e["action"] for e in item_entries}

        assert {"created", "edited", "marked_sold", "returned_to_floor", "deleted"} <= actions, item_entries
        for e in item_entries:
            assert e.get("username") == VOLUNTEER_USERNAME, e

        edited_entry = next(e for e in item_entries if e["action"] == "edited")
        changes = edited_entry.get("details", {}).get("changes", {})
        assert "title" in changes
        assert changes["title"]["from"] == "tscheck-activity-item"
        assert changes["title"]["to"] == "tscheck-activity-item-EDITED"
    finally:
        if created_id:
            volunteer.delete(api_url(f"/inventory/{created_id}"))
        volunteer.close()
        master.close()
