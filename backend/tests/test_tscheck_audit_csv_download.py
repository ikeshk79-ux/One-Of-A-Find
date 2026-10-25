"""Backend test for: GET /api/pricing/audit.csv (CSRF-key regression fix).

The Admin "Export CSV" button used to read its CSRF token from the wrong sessionStorage
key; harmless on this GET endpoint (CSRF middleware only enforces state-changing verbs)
but worth locking in that the route itself returns 200 with a CSV body for a master
session, and is rejected for a non-master (volunteer) session.
"""

from .conftest import api_url, master_client, volunteer_client  # noqa: F401 (fixtures)


def test_audit_csv_master_returns_200_csv(master_client):
    resp = master_client.get(api_url("/pricing/audit.csv"))
    assert resp.status_code == 200, resp.text
    content_type = resp.headers.get("content-type", "")
    assert "csv" in content_type.lower(), content_type
    # Header row + (possibly zero) data rows; just confirm it's real CSV content.
    assert "," in resp.text.splitlines()[0]


def test_audit_csv_volunteer_forbidden(volunteer_client):
    resp = volunteer_client.get(api_url("/pricing/audit.csv"))
    assert resp.status_code in (401, 403), resp.text
