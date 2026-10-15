"""Backend test for: zone-adjustment preview endpoint returns correct math."""

import httpx

from .conftest import api_url


def test_preview_adjustment_math(master_client):
    tooting = master_client.get(
        api_url("/shops/preview-adjustment"), params={"base_price": 50, "shop_name": "Tooting"}
    )
    assert tooting.status_code == 200, tooting.text
    body = tooting.json()
    assert body["base_price"] == 50
    assert body["adjusted_price"] == 45
    assert body["adjustment_percent"] == -10
    assert body["zone"] == 3
    assert body["rule_version"] >= 1

    brompton = master_client.get(
        api_url("/shops/preview-adjustment"),
        params={"base_price": 50, "shop_name": "Brompton Road"},
    )
    assert brompton.status_code == 200, brompton.text
    assert brompton.json()["adjusted_price"] == 50

    ealing = master_client.get(
        api_url("/shops/preview-adjustment"), params={"base_price": 50, "shop_name": "Ealing"}
    )
    assert ealing.status_code == 200, ealing.text
    assert ealing.json()["adjusted_price"] == 45

    rounded = master_client.get(
        api_url("/shops/preview-adjustment"), params={"base_price": 37, "shop_name": "Tooting"}
    )
    assert rounded.status_code == 200, rounded.text
    assert rounded.json()["adjusted_price"] == 33

    no_shop = master_client.get(api_url("/shops/preview-adjustment"), params={"base_price": 50})
    assert no_shop.status_code == 200, no_shop.text
    no_shop_body = no_shop.json()
    assert no_shop_body["adjusted_price"] == 50
    assert no_shop_body["zone"] is None
    assert no_shop_body["adjustment_percent"] == 0


def test_preview_adjustment_requires_auth():
    with httpx.Client(timeout=30.0) as c:
        resp = c.get(api_url("/shops/preview-adjustment"), params={"base_price": 50})
        assert resp.status_code == 401, resp.text
