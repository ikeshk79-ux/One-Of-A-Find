"""Covers the menswear-category schema change and the legacy size/category migration.

Criteria exercised:
- CATEGORIES includes the 5 new menswear sub-categories + Men's accessories, and
  "Men's general" is no longer accepted anywhere (PATCH rejects it with 422).
- GET /api/inventory returns zero rows with legacy size labels or category "Men's general"
  (migrate_sizes.py has already run; this is a standing regression guard).
"""

import time

from .conftest import api_url

NEW_MENSWEAR_CATEGORIES = [
    "Men's shirts",
    "Men's trousers",
    "Men's suits",
    "Men's blazers",
    "Men's shoes",
    "Men's accessories",
]

LEGACY_CLOTHING_SIZES = {
    "XXS (UK 4)", "XS (UK 6)", "S (UK 8)", "M (UK 10)",
    "L (UK 12)", "XL (UK 14)", "XXL (UK 16)",
}


def _fixture_payload(category: str) -> dict:
    suffix = f"tscheck-menswear-cat-{category}-{int(time.time() * 1000)}"
    return {
        "appraisal": {
            "title": suffix,
            "brand": "Test Brand",
            "category": category,
            "description": "tscheck fixture item.",
            "condition": "Good",
            "is_electrical": False,
            "price_source": "charity",
            "peak_retail_price": 100,
            "market_average_price": 40,
            "recommended_price": 34,
            "currency": "GBP",
            "confidence": "High",
            "rationale": "tscheck fixture",
            "resale_blurb": "",
        }
    }


def test_new_menswear_subcategories_accepted_and_mens_general_rejected(master_client):
    # Each new menswear sub-category is accepted on create (200/201).
    created_ids = []
    try:
        for cat in NEW_MENSWEAR_CATEGORIES:
            resp = master_client.post(api_url("/inventory"), json=_fixture_payload(cat))
            assert resp.status_code in (200, 201), f"{cat}: {resp.status_code} {resp.text}"
            body = resp.json()
            assert body["category"] == cat
            created_ids.append(body["id"])

        # "Men's general" is no longer a valid category — PATCH must reject it with 422.
        item_id = created_ids[0]
        resp = master_client.patch(api_url(f"/inventory/{item_id}"), json={"category": "Men's general"})
        assert resp.status_code == 422, resp.text
        assert "category" in resp.json()["detail"].lower()

        # BUG: POST /api/inventory never validates `category` against CATEGORIES (only the
        # PATCH handler in routers/inventory.py does) — "Men's general" (or any arbitrary
        # string) is silently accepted on create. Clean up the row this assertion creates
        # regardless of outcome so the fixture doesn't accumulate across reruns.
        resp = master_client.post(api_url("/inventory"), json=_fixture_payload("Men's general"))
        if resp.status_code in (200, 201):
            created_ids.append(resp.json()["id"])
        assert resp.status_code == 422, (
            "POST /api/inventory accepted category 'Men's general' (expected 422 — create "
            f"has no category allow-list check, unlike PATCH): {resp.status_code} {resp.text}"
        )
    finally:
        for item_id in created_ids:
            master_client.delete(api_url(f"/inventory/{item_id}"))


def test_no_legacy_size_labels_or_mens_general_category_remain(master_client):
    resp = master_client.get(api_url("/inventory"))
    assert resp.status_code == 200, resp.text
    items = resp.json()

    offending_sizes = [i for i in items if i.get("size") in LEGACY_CLOTHING_SIZES]
    assert not offending_sizes, f"legacy clothing size labels still present: {offending_sizes}"

    # Legacy shoe label pattern "UK N (EU M)" — distinct from the new "UK N · EU M" separator.
    offending_shoe_sizes = [i for i in items if i.get("size") and "(EU" in i["size"]]
    assert not offending_shoe_sizes, f"legacy shoe size labels still present: {offending_shoe_sizes}"

    offending_category = [i for i in items if i.get("category") == "Men's general"]
    assert not offending_category, f"items still carry category 'Men's general': {offending_category}"
