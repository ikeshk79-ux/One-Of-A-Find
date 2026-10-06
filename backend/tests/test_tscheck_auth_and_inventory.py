"""Backend test for: username+PIN login (volunteer + master) + inventory/stats require auth."""

import uuid

import httpx

from .conftest import (
    MASTER_PIN,
    MASTER_USERNAME,
    SHOP_PASSWORD,
    VOLUNTEER_PIN,
    VOLUNTEER_USERNAME,
    api_url,
    login_client,
)


def test_login_with_correct_credentials_succeeds():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(api_url("/auth/login"), json={"username": VOLUNTEER_USERNAME, "pin": VOLUNTEER_PIN})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("authenticated") is True
        assert body.get("username") == VOLUNTEER_USERNAME
        assert body.get("is_master") is False


def test_master_login_reports_is_master_true():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(api_url("/auth/login"), json={"username": MASTER_USERNAME, "pin": MASTER_PIN})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("authenticated") is True
        assert body.get("is_master") is True


def test_login_with_wrong_pin_rejected():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(api_url("/auth/login"), json={"username": VOLUNTEER_USERNAME, "pin": "0000"})
        assert resp.status_code == 401, resp.text


def test_login_with_unknown_username_rejected():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(api_url("/auth/login"), json={"username": "tscheck-nonexistent-user", "pin": "1234"})
        assert resp.status_code == 401, resp.text


def test_register_requires_correct_shop_password_and_rejects_duplicate_username():
    unique_username = f"tscheck-{uuid.uuid4().hex[:10]}"
    with httpx.Client(timeout=30.0) as c:
        # wrong shop password rejected
        bad = c.post(
            api_url("/auth/register"),
            json={"shop_password": "wrong-password", "username": unique_username, "pin": "123456"},
        )
        assert bad.status_code == 401, bad.text

        # correct shop password + fresh username succeeds
        ok = c.post(
            api_url("/auth/register"),
            json={"shop_password": SHOP_PASSWORD, "username": unique_username, "pin": "123456"},
        )
        assert ok.status_code == 200, ok.text
        body = ok.json()
        assert body.get("authenticated") is True
        assert body.get("username") == unique_username

        # duplicate username rejected
        dup = c.post(
            api_url("/auth/register"),
            json={"shop_password": SHOP_PASSWORD, "username": unique_username, "pin": "678901"},
        )
        assert dup.status_code == 409, dup.text


def test_inventory_and_stats_require_and_return_after_auth():
    with httpx.Client(timeout=30.0) as c:
        # unauthenticated access rejected
        unauth = c.get(api_url("/inventory"))
        assert unauth.status_code == 401, unauth.text

        unauth_activity = c.get(api_url("/activity"))
        assert unauth_activity.status_code == 401, unauth_activity.text

    c = login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)
    try:
        inv = c.get(api_url("/inventory"))
        assert inv.status_code == 200, inv.text
        items = inv.json()
        assert isinstance(items, list)
        assert len(items) >= 1

        stats = c.get(api_url("/inventory/stats"))
        assert stats.status_code == 200, stats.text
        stats_body = stats.json()
        for key in ("total_items", "available_items", "sold_items", "all_time_raised", "potential_value"):
            assert key in stats_body
    finally:
        c.close()


def test_logout_revokes_session():
    c = login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)
    try:
        ok = c.get(api_url("/inventory"))
        assert ok.status_code == 200, ok.text

        logout_resp = c.post(api_url("/auth/logout"))
        assert logout_resp.status_code == 200, logout_resp.text

        after = c.get(api_url("/inventory"))
        assert after.status_code == 401, after.text
    finally:
        c.close()
