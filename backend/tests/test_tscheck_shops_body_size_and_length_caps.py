"""Backend test for: SEC-001 body-size cap and model length caps still fire on /api/shops."""

from .conftest import api_url

OVERSIZE = 20 * 1024 * 1024 + 1024  # just over the 20 MiB cap


def _oversized_body() -> bytes:
    return b'{"name": "' + (b"a" * OVERSIZE) + b'"}'


def test_oversized_content_length_rejected_with_413(master_client):
    resp = master_client.post(
        api_url("/shops"),
        content=_oversized_body(),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 413, resp.text[:200]


def test_overlong_name_rejected_with_422(master_client):
    long_name = "x" * 200
    resp = master_client.post(api_url("/shops"), json={"name": long_name})
    assert resp.status_code == 422, resp.text


def test_invalid_zone_rejected_with_422(master_client):
    resp = master_client.post(api_url("/shops"), json={"name": "tscheck-badzone", "zone": 99})
    assert resp.status_code == 422, resp.text
