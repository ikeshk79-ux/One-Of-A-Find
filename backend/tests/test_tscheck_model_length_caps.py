"""Public auth model length caps: oversized string fields are rejected pre-logic with 422.

LoginRequest.username max_length=40, RegisterRequest.pin max_length=64, RosterUnlock
.shop_password max_length=200 (see models/appraisal.py). Legitimate short payloads still work.
"""

from .conftest import MASTER_PIN, MASTER_USERNAME, api_url


def test_login_username_over_40_chars_rejected_422(client):
    resp = client.post("/auth/login", json={"username": "a" * 200, "pin": "123456"})
    assert resp.status_code == 422, resp.text


def test_register_pin_over_64_chars_rejected_422(client):
    resp = client.post(
        "/auth/register",
        json={"shop_password": "Oneofafind", "username": "tscheck-lencap-user", "pin": "p" * 100},
    )
    assert resp.status_code == 422, resp.text


def test_roster_shop_password_over_200_chars_rejected_422(client):
    resp = client.post("/auth/roster", json={"shop_password": "x" * 500})
    assert resp.status_code == 422, resp.text


def test_legitimate_short_login_still_works(client):
    resp = client.post("/auth/login", json={"username": MASTER_USERNAME, "pin": MASTER_PIN})
    assert resp.status_code == 200, resp.text
    assert resp.json()["authenticated"] is True
