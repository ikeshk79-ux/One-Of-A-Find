"""Backend test for: Permissions-Policy header present on API responses (no regression on the
other security headers already set by the csrf_and_security_headers middleware).
"""

from .conftest import api_url


def test_permissions_policy_and_existing_security_headers_present(master_client):
    resp = master_client.get(api_url("/auth/me"))
    assert resp.status_code == 200, resp.text

    headers = {k.lower(): v for k, v in resp.headers.items()}

    pp = headers.get("permissions-policy", "")
    assert pp, "Permissions-Policy header missing"
    assert "camera=()" in pp
    assert "geolocation=()" in pp
    assert "microphone=()" in pp
    assert "*" not in pp  # no wildcard permission grants

    # Regression guard: pre-existing security headers still set.
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") == "no-referrer"
    assert "max-age" in headers.get("strict-transport-security", "")
    assert "default-src 'none'" in headers.get("content-security-policy", "")
