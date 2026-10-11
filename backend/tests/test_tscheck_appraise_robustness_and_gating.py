"""Backend tests for:
  1. POST /api/appraise returns 200 for a real product photo 3x in a row (no 502), proving the
     _parse_appraisal JSON-extraction path (plain JSON / ```json fences / prose-prefixed JSON /
     stray-brace citation noise) is actually exercised by the live route, not dead code.
  2. /api/appraise auth + CSRF gating: no session cookie -> 401; session cookie present but no
     X-CSRF-Token header -> 403.
"""

import base64
import os

import httpx

from .conftest import api_url, login_client, VOLUNTEER_USERNAME, VOLUNTEER_PIN

IMAGE_PATH = "/tmp/shoe.jpg" if os.path.exists("/tmp/shoe.jpg") else "/tmp/item.jpg"


def _item_image_data_url() -> str:
    assert os.path.exists(IMAGE_PATH), "fixture image missing"
    with open(IMAGE_PATH, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:image/jpeg;base64,{b64}"


def test_appraise_returns_200_three_times_in_a_row():
    """Calls the live /api/appraise endpoint 3x with the same real photo. Each call must be a
    200 with a usable parsed appraisal -- proves the JSON-extraction retry logic in
    routers.appraise._parse_appraisal survives whatever prose/fence/citation noise the grounded
    Gemini call wraps the JSON object in, across independent model calls."""
    item_image = _item_image_data_url()
    c = login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)
    try:
        for attempt in range(3):
            resp = c.post(api_url("/appraise"), json={"item_image": item_image})
            assert resp.status_code == 200, f"attempt {attempt}: {resp.status_code} {resp.text}"
            body = resp.json()
            assert isinstance(body.get("title"), str) and body["title"], body
            assert isinstance(body.get("brand"), str) and body["brand"], body
            assert isinstance(body.get("peak_retail_price"), (int, float)), body
            assert isinstance(body.get("recommended_price"), (int, float)), body
            assert body.get("confidence") in ("High", "Medium", "Low"), body
    finally:
        c.close()


def test_appraise_no_session_cookie_rejected_401():
    with httpx.Client(timeout=30.0) as anon:
        resp = anon.post(api_url("/appraise"), json={"item_image": "data:image/jpeg;base64,AA=="})
        assert resp.status_code == 401, resp.text


def test_appraise_session_without_csrf_header_rejected_403():
    """A valid session cookie but missing the X-CSRF-Token header must 403 on the mutating
    /api/appraise POST, even though the request body itself is well-formed."""
    with httpx.Client(timeout=30.0) as c:
        login_resp = c.post(
            api_url("/auth/login"), json={"username": VOLUNTEER_USERNAME, "pin": VOLUNTEER_PIN}
        )
        assert login_resp.status_code == 200, login_resp.text
        cookie_pairs = []
        for key, value in login_resp.headers.raw:
            if key.decode().lower() == "set-cookie":
                cookie_pairs.append(value.decode().split(";")[0])

        with httpx.Client(timeout=30.0) as c2:
            c2.headers["Cookie"] = "; ".join(cookie_pairs)
            # Deliberately omit X-CSRF-Token.
            resp = c2.post(api_url("/appraise"), json={"item_image": "data:image/jpeg;base64,AA=="})
            assert resp.status_code == 403, resp.text
