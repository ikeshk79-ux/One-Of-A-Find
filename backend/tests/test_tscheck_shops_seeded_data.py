"""Backend test for: Shops collection seeded with 14 Octavia Foundation branches + verified addresses."""

import pytest

from .conftest import VOLUNTEER_PIN, VOLUNTEER_USERNAME, api_url, login_client


def test_shops_seeded_with_14_known_branches(master_client):
    resp = master_client.get(api_url("/shops"))
    assert resp.status_code == 200, resp.text
    shops = resp.json()
    assert len(shops) == 14, shops

    by_name = {s["name"]: s for s in shops}

    askew = by_name["Askew Road"]
    assert askew["postcode"] == "W12 9BJ"
    assert askew["zone"] == 2
    assert askew["nearest_station"] == "Shepherd's Bush Market"

    brompton = by_name["Brompton Road"]
    assert brompton["postcode"] == "SW3 2EJ"
    assert brompton["zone"] == 1

    tooting = by_name["Tooting"]
    assert tooting["postcode"] == "SW17 0RG"
    assert tooting["zone"] == 3

    chiswick = by_name["Chiswick High Road"]
    assert chiswick["postcode"] == "W4 1PA"
    assert chiswick["zone"] == 2
    assert chiswick["needs_zone_review"] is True

    fulham = by_name["Fulham Road"]
    assert fulham["postcode"] == "SW10 9PZ"
    assert fulham["zone"] == 2
    assert fulham["needs_zone_review"] is True

    west_hampstead = by_name["West Hampstead"]
    assert west_hampstead["zone"] == 2

    kings_road = by_name["King's Road"]
    assert kings_road["postcode"] == "SW3 5EP"
    assert kings_road["zone"] == 1

    assert "Chiswick" not in by_name  # old pre-import name must be gone

    for name, shop in by_name.items():
        if name == "West Hampstead":
            continue
        assert shop["postcode"], f"{name} missing postcode"


def test_volunteer_can_read_shops():
    try:
        c = login_client(VOLUNTEER_USERNAME, VOLUNTEER_PIN)
    except AssertionError:
        pytest.skip("SarahTest login unavailable (rate-limited/locked per seed_facts) - skipping volunteer read check")
        return
    try:
        resp = c.get(api_url("/shops"))
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) >= 14
    finally:
        c.close()
