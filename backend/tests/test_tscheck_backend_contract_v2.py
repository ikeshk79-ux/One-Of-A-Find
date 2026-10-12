"""Backend test for: contract preserved after the new 4-tab nav / Scan-page frontend rewrite.

Covers: GET /api/ health, unauthenticated /api/auth/me, master login + cookies, authenticated
GET /api/inventory + /api/inventory/stats + /api/activity (master) + /api/staff (master), and
a full POST -> GET -> DELETE -> 404 lifecycle on /api/inventory with a valid Appraisal payload
and a tiny base64 PNG item_image.
"""

import uuid

import httpx

from .conftest import api_url, login_client, MASTER_USERNAME, MASTER_PIN

# 1x1 transparent PNG, base64-encoded, as a data URL (tiny valid "photo").
TINY_PNG_DATA_URL = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def test_health_endpoint_ok():
    with httpx.Client(timeout=30.0) as c:
        resp = c.get(api_url("/"))
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"status": "ok"}


def test_unauthenticated_auth_me_returns_authenticated_false():
    with httpx.Client(timeout=30.0) as c:
        resp = c.get(api_url("/auth/me"))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("authenticated") is False


def test_master_login_sets_session_and_csrf_cookies():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(api_url("/auth/login"), json={"username": MASTER_USERNAME, "pin": MASTER_PIN})
        assert resp.status_code == 200, resp.text
        set_cookie_names = set()
        for key, value in resp.headers.raw:
            if key.decode().lower() == "set-cookie":
                set_cookie_names.add(value.decode().split("=", 1)[0])
        assert "ooaf_session" in set_cookie_names, set_cookie_names
        assert "ooaf_csrf" in set_cookie_names, set_cookie_names


def test_master_authenticated_endpoints_return_expected_shapes(master_client):
    inv = master_client.get(api_url("/inventory"))
    assert inv.status_code == 200, inv.text
    assert isinstance(inv.json(), list)

    stats = master_client.get(api_url("/inventory/stats"))
    assert stats.status_code == 200, stats.text
    stats_body = stats.json()
    assert isinstance(stats_body, dict)
    assert "week_raised" in stats_body
    assert "potential_value" in stats_body

    activity = master_client.get(api_url("/activity"))
    assert activity.status_code == 200, activity.text
    assert isinstance(activity.json(), list)

    staff = master_client.get(api_url("/staff"))
    assert staff.status_code == 200, staff.text
    assert isinstance(staff.json(), list)


def test_inventory_create_get_delete_lifecycle(master_client):
    unique = uuid.uuid4().hex[:8]
    payload = {
        "appraisal": {
            "title": f"tscheck-contract-item-{unique}",
            "brand": "TestBrand",
            "category": "Homewear",
            "description": "A test item for backend contract verification.",
            "condition": "Good",
            "is_electrical": False,
            "price_source": "charity",
            "peak_retail_price": 50.0,
            "market_average_price": 20.0,
            "recommended_price": 13.0,
            "currency": "GBP",
            "confidence": "medium",
            "rationale": "Test rationale for contract check.",
            "resale_blurb": "A lovely test item.",
        },
        "item_image": TINY_PNG_DATA_URL,
    }
    create_resp = master_client.post(api_url("/inventory"), json=payload)
    assert create_resp.status_code in (200, 201), create_resp.text
    created = create_resp.json()
    item_id = created["id"]
    assert created["title"] == payload["appraisal"]["title"]
    assert created["recommended_price"] == 13.0

    get_resp = master_client.get(api_url(f"/inventory/{item_id}"))
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["id"] == item_id

    delete_resp = master_client.delete(api_url(f"/inventory/{item_id}"))
    assert delete_resp.status_code in (200, 204), delete_resp.text

    final_get = master_client.get(api_url(f"/inventory/{item_id}"))
    assert final_get.status_code == 404, final_get.text
