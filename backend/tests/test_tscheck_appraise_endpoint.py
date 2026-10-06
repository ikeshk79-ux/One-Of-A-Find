"""Backend test for: /api/appraise happy path (real image, called at most once) + negative cases."""

import base64
import os

import httpx

from .conftest import api_url, login_client, VOLUNTEER_USERNAME, VOLUNTEER_PIN

FIXED_CATEGORIES = {
    "Women's tops",
    "Women's knitwear",
    "Women's skirts",
    "Women's trousers",
    "Women's accessories",
    "Women's jackets/coats",
    "Women's shoes",
    "Men's general",
    "Men's accessories",
    "Homewear",
    "Children",
    "Books",
    "Media (DVD/CD)",
    "Jewellery",
}

IMAGE_PATH = "/tmp/item.jpg"


def _logged_in_client() -> httpx.Client:
    return login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)


def test_appraise_malformed_body_and_no_session_rejected():
    # No session cookie at all. Since the CSRF double-submit guard only applies to
    # cookie-authenticated requests (SEC-002 fix), an anonymous POST skips CSRF and is rejected
    # by the auth dependency with 401 Unauthorized.
    with httpx.Client(timeout=30.0) as anon:
        resp = anon.post(api_url("/appraise"), json={})
        assert resp.status_code == 401, resp.text

    # Authenticated but empty JSON body (no item_image) -> 422
    c = _logged_in_client()
    try:
        resp = c.post(api_url("/appraise"), json={})
        assert resp.status_code == 422, resp.text
    finally:
        c.close()


def test_appraise_with_real_image_returns_valid_appraisal():
    """Calls the live /api/appraise endpoint EXACTLY ONCE (costs model credits)."""
    assert os.path.exists(IMAGE_PATH), "fixture image missing"
    with open(IMAGE_PATH, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    item_image = f"data:image/jpeg;base64,{b64}"

    c = _logged_in_client()
    try:
        resp = c.post(api_url("/appraise"), json={"item_image": item_image})
        assert resp.status_code == 200, resp.text
        body = resp.json()

        for key in (
            "title",
            "brand",
            "description",
            "condition",
            "peak_retail_price",
            "market_average_price",
            "recommended_price",
            "price_source",
            "category",
        ):
            assert key in body, body

        assert isinstance(body["peak_retail_price"], (int, float))
        assert isinstance(body["market_average_price"], (int, float))
        assert isinstance(body["recommended_price"], (int, float))

        # Charity base = market average capped at 50% of RRP, rounded to the nearest 50p.
        peak = body["peak_retail_price"]
        avg = body["market_average_price"]
        base = min(avg, peak * 0.5) if peak > 0 else avg
        expected_recommended = round(base * 2) / 2
        assert body["recommended_price"] == expected_recommended, body
        assert body["price_source"] == "charity", body

        assert body["category"] in FIXED_CATEGORIES, body["category"]
    finally:
        c.close()
