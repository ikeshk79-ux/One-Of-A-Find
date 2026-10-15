"""SEC-001 fix: /api endpoints reject oversized request bodies with 413 before parsing.

Sends a Content-Length header declaring a body > MAX_API_BODY_BYTES (20 MiB) without actually
streaming that many bytes -- the middleware must reject based on the declared Content-Length
alone, before it tries to buffer/parse the body. A normal, well-formed body stays under the cap
and gets the usual 200/401/422.
"""

import httpx
import pytest

from .conftest import MASTER_PIN, MASTER_USERNAME, SHOP_PASSWORD, api_url

OVERSIZE = 20 * 1024 * 1024 + 1024  # just over the 20 MiB cap


def _oversized_body() -> bytes:
    # httpx (via h11) validates that Content-Length matches the bytes actually sent, so we
    # genuinely send >20 MiB of padding bytes wrapped around a tiny JSON-looking payload. The
    # middleware must reject based on the declared Content-Length before buffering/parsing it.
    return b"{\"pad\": \"" + (b"a" * OVERSIZE) + b"\"}"


@pytest.mark.parametrize(
    "path",
    ["/auth/register", "/auth/login", "/auth/roster"],
)
def test_oversized_content_length_rejected_with_413(path):
    resp = httpx.post(
        api_url(path),
        content=_oversized_body(),
        headers={"Content-Type": "application/json"},
        timeout=60.0,
    )
    assert resp.status_code == 413, resp.text[:200]


def test_oversized_content_length_rejected_for_inventory_create(master_client):
    resp = master_client.post(
        api_url("/inventory"),
        content=_oversized_body(),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 413, resp.text[:200]


def test_oversized_content_length_rejected_for_inventory_patch(master_client):
    resp = master_client.patch(
        api_url("/inventory/some-fake-id"),
        content=_oversized_body(),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 413, resp.text[:200]


def test_normal_sized_login_still_works_under_cap():
    resp = httpx.post(
        api_url("/auth/login"),
        json={"username": MASTER_USERNAME, "pin": MASTER_PIN},
        timeout=30.0,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["authenticated"] is True


def test_normal_sized_register_under_cap_still_gated_by_shop_password():
    # Under the cap, a well-formed register call reaches real validation logic (401 for wrong
    # shop password), proving the cap gate isn't swallowing legitimate requests.
    resp = httpx.post(
        api_url("/auth/register"),
        json={"shop_password": "wrong-value", "username": "tscheck-bodycap-normal", "pin": "123456"},
        timeout=30.0,
    )
    assert resp.status_code == 401, resp.text
