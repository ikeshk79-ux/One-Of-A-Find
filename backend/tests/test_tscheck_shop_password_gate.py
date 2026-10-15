"""Shop password now compared constant-time (secrets.compare_digest); still rejects wrong
passwords with 401. Correct password still allows the gated action (register may 409 if the
username is already taken -- that's also acceptable, it proves the gate passed).
"""

import uuid

from .conftest import SHOP_PASSWORD, api_url


def test_register_wrong_shop_password_rejected_401(client):
    resp = client.post(
        "/auth/register",
        json={"shop_password": "wrongvalue", "username": f"tscheck-shopgate-{uuid.uuid4().hex[:8]}", "pin": "123456"},
    )
    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"] == "Incorrect shop password"


def test_roster_wrong_shop_password_rejected_401(client):
    resp = client.post("/auth/roster", json={"shop_password": "wrongvalue"})
    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"] == "Incorrect shop password"


def test_register_correct_shop_password_passes_gate(client):
    # Gate passes with the real shared shop password; the action may still legitimately fail
    # downstream (e.g. 409 username taken, 429 throttled) -- what matters is it's NOT the
    # "Incorrect shop password" 401.
    resp = client.post(
        "/auth/register",
        json={
            "shop_password": SHOP_PASSWORD,
            "username": f"tscheck-shopgate-ok-{uuid.uuid4().hex[:8]}",
            "pin": "123456",
        },
    )
    assert resp.status_code in (200, 201, 409, 429), resp.text
    if resp.status_code != 429:
        assert resp.json().get("detail") != "Incorrect shop password"
