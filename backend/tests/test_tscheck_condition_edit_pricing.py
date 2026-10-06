"""Backend tests for: PATCH /api/inventory/{id} condition + price_source edit semantics.

Covers the API-bearing parts of the "condition edit / re-price" acceptance matrix:
  - A condition-only PATCH (no price_source) leaves recommended_price and price_source untouched.
  - A PATCH that mirrors "Re-price from condition" (new condition + price_source="charity" +
    a recomputed recommended_price) persists all three fields.
  - A PATCH that mirrors a manual price edit (price_source="custom") persists price_source=custom.
  - All 7 condition grades are accepted and persisted; an unknown grade is rejected (422).
"""

from .conftest import api_url, volunteer_client  # noqa: F401 (fixture import)

ITEM_PAYLOAD = {
    "appraisal": {
        "title": "tscheck-condition-edit jacket",
        "brand": "Test Brand",
        "category": "Women's jackets/coats",
        "description": "A test jacket for condition-edit checks.",
        "condition": "Good",
        "is_electrical": False,
        "price_source": "charity",
        "peak_retail_price": 100.0,
        "market_average_price": 40.0,
        "recommended_price": 20.0,
        "currency": "GBP",
        "confidence": "high",
        "rationale": "test fixture",
        "resale_blurb": "",
    }
}


def _create_item(client):
    resp = client.post(api_url("/inventory"), json=ITEM_PAYLOAD)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_condition_only_edit_does_not_touch_price_or_source(volunteer_client):
    item = _create_item(volunteer_client)
    item_id = item["id"]
    assert item["recommended_price"] == 20.0
    assert item["price_source"] == "charity"

    # Mirror: volunteer changes ONLY the Condition dropdown (frontend sends condition alone,
    # no price_source), WITHOUT tapping "Re-price from condition".
    resp = volunteer_client.patch(api_url(f"/inventory/{item_id}"), json={"condition": "Fair"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["condition"] == "Fair"
    # Price and price_source must be unchanged by a condition-only edit at the API layer.
    assert body["recommended_price"] == 20.0, body
    assert body["price_source"] == "charity", body


def test_reprice_from_condition_persists_new_price_and_charity_source(volunteer_client):
    item = _create_item(volunteer_client)
    item_id = item["id"]

    # Mirror: volunteer picks "Fair" then taps "Re-price from Fair condition". Guide base =
    # round_to_nearest_50p(min(40, 0.5*100)) = 40; Fair multiplier 0.65 -> 40*0.65=26 -> round to 50p = 26.0
    resp = volunteer_client.patch(
        api_url(f"/inventory/{item_id}"),
        json={"condition": "Fair", "recommended_price": 26.0, "price_source": "charity"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["condition"] == "Fair"
    assert body["recommended_price"] == 26.0, body
    assert body["price_source"] == "charity", body


def test_manual_price_edit_sets_custom_source(volunteer_client):
    item = _create_item(volunteer_client)
    item_id = item["id"]

    # Mirror: volunteer types a new number directly into the price input (frontend always sends
    # price_source="custom" alongside a manual recommended_price change).
    resp = volunteer_client.patch(
        api_url(f"/inventory/{item_id}"),
        json={"recommended_price": 17.5, "price_source": "custom"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["recommended_price"] == 17.5, body
    assert body["price_source"] == "custom", body


def test_all_seven_condition_grades_accepted_and_persist(volunteer_client):
    item = _create_item(volunteer_client)
    item_id = item["id"]

    grades = [
        "New with tags",
        "New without tags",
        "Excellent",
        "Very good",
        "Good",
        "Fair",
        "Poor/for repair",
    ]
    for grade in grades:
        resp = volunteer_client.patch(api_url(f"/inventory/{item_id}"), json={"condition": grade})
        assert resp.status_code == 200, resp.text
        assert resp.json()["condition"] == grade, resp.json()

    # Changes persist on re-fetch (GET), not just in the PATCH response.
    get_resp = volunteer_client.get(api_url(f"/inventory/{item_id}"))
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["condition"] == "Poor/for repair"


def test_unknown_condition_grade_rejected(volunteer_client):
    item = _create_item(volunteer_client)
    item_id = item["id"]
    resp = volunteer_client.patch(
        api_url(f"/inventory/{item_id}"), json={"condition": "Mint-ish ish"}
    )
    assert resp.status_code == 422, resp.text
