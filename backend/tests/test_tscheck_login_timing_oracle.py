"""Login timing-oracle narrowed: unknown vs known username both run a PBKDF2 pass before
returning 401. Both branches must return the SAME 401 shape/detail string, proving the server
doesn't short-circuit on "user not found" (the actual latency comparison is intentionally not
asserted here -- this is a shared pod where absolute timing is unreliable; see spec_deviations).
"""

from .conftest import MASTER_USERNAME, api_url


def test_known_username_wrong_pin_returns_401(client):
    resp = client.post("/auth/login", json={"username": MASTER_USERNAME, "pin": "not-the-real-pin"})
    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"] == "Incorrect username or PIN"


def test_unknown_username_returns_same_401_shape(client):
    resp = client.post("/auth/login", json={"username": "definitelynotauser", "pin": "anything123"})
    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"] == "Incorrect username or PIN"


def test_both_branches_share_identical_error_detail(client):
    known = client.post("/auth/login", json={"username": MASTER_USERNAME, "pin": "wrong-pin-value"})
    unknown = client.post("/auth/login", json={"username": "definitelynotauser2", "pin": "wrong-pin-value"})
    assert known.status_code == unknown.status_code == 401
    assert known.json()["detail"] == unknown.json()["detail"] == "Incorrect username or PIN"
