"""Core auth + CSRF regression: unchanged flows still work after the body-size-cap middleware
addition.

- master login -> GET /api/auth/me returns authenticated=true with a csrf token in the body.
- POST /api/appraise without X-CSRF-Token header -> 403.
- POST /api/appraise with a valid CSRF header -> succeeds (status < 400; content not asserted,
  it's a live AI call).
- logout clears the cookie -> GET /me after logout returns authenticated:false.
"""

import httpx

from .conftest import MASTER_PIN, MASTER_USERNAME, api_url

TINY_PNG_DATA_URL = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def _parse_set_cookies(resp: httpx.Response) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for key, value in resp.headers.raw:
        if key.decode().lower() == "set-cookie":
            pair = value.decode().split(";")[0]
            name, _, val = pair.partition("=")
            cookies[name] = val
    return cookies


def test_master_login_me_csrf_appraise_gate_and_logout():
    with httpx.Client(timeout=60.0) as c:
        login_resp = c.post(api_url("/auth/login"), json={"username": MASTER_USERNAME, "pin": MASTER_PIN})
        assert login_resp.status_code == 200, login_resp.text
        cookies = _parse_set_cookies(login_resp)
        c.headers["Cookie"] = f"ooaf_session={cookies['ooaf_session']}; ooaf_csrf={cookies['ooaf_csrf']}"

        me_resp = c.get(api_url("/auth/me"))
        assert me_resp.status_code == 200, me_resp.text
        me_body = me_resp.json()
        assert me_body["authenticated"] is True
        assert isinstance(me_body.get("csrf"), str) and len(me_body["csrf"]) > 0

        # No CSRF header at all -> 403.
        no_csrf_resp = c.post(api_url("/appraise"), json={"item_image": TINY_PNG_DATA_URL})
        assert no_csrf_resp.status_code == 403, no_csrf_resp.text

        # Valid CSRF header -> real call succeeds (status < 400). Live AI call, content not
        # asserted beyond success/failure status.
        c.headers["X-CSRF-Token"] = cookies["ooaf_csrf"]
        ok_resp = c.post(api_url("/appraise"), json={"item_image": TINY_PNG_DATA_URL})
        assert ok_resp.status_code < 400, ok_resp.text

        # Logout clears the session; subsequent /me reports authenticated:false.
        logout_resp = c.post(api_url("/auth/logout"))
        assert logout_resp.status_code in (200, 204), logout_resp.text

        with httpx.Client(timeout=30.0) as c2:
            c2.headers["Cookie"] = f"ooaf_session={cookies['ooaf_session']}"
            me_after_resp = c2.get(api_url("/auth/me"))
            assert me_after_resp.status_code == 200, me_after_resp.text
            assert me_after_resp.json()["authenticated"] is False
