"""Covers the Appraise.tsx four-stage refactor (capture/processing/results/saved).

- API-bearing part of "Appraising transitions Step01 -> processing; failure stays on Step01":
  POST /api/appraise with an invalid payload must 4xx, not silently succeed.
- Structural checks for the discard-button / results-back-button semantics and the removed
  'appraisal-empty' element, done by grepping the source (no UI surface to assert via API).
- No-regression checks for /api/shops, /api/shops/pricing-rules, /api/inventory,
  /api/inventory/stats still answering as before the refactor.
"""

from pathlib import Path

from .conftest import api_url

APPRAISE_TSX = Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages" / "Appraise.tsx"


def test_appraise_invalid_payload_is_rejected(master_client):
    resp = master_client.post(api_url("/appraise"), json={})
    assert resp.status_code in (400, 422), resp.text
    body = resp.json()
    assert "detail" in body


def test_appraise_tsx_stage_structure_and_discard_semantics():
    src = APPRAISE_TSX.read_text()

    # The obsolete empty-state block must be gone.
    assert 'data-testid="appraisal-empty"' not in src

    # Derived `stage` constant drives single-section rendering.
    assert '"capture" | "processing" | "results" | "saved"' in src
    assert 'stage === "saved" && savedItem' in src
    assert 'stage !== "saved"' in src
    assert 'stage === "capture"' in src
    assert '(stage === "processing" || stage === "results")' in src

    # Both discard buttons call the full reset; the results back-button only clears `result`.
    discard_occurrences = src.count("onClick={resetForNextItem}")
    assert discard_occurrences == 2, f"expected 2 occurrences of resetForNextItem wiring, found {discard_occurrences}"
    assert 'data-testid="capture-discard-button"' in src
    assert 'data-testid="discard-button"' in src
    assert 'data-testid="results-back-button"' in src
    assert "onClick={() => setResult(null)}" in src

    # Single-column layout per spec deviation.
    assert "flex flex-col gap-10" in src
    assert "grid gap-10 lg:grid-cols-[1fr_1.05fr]" not in src


def test_regression_shops_endpoint_still_answers(master_client):
    resp = master_client.get(api_url("/shops"))
    assert resp.status_code == 200, resp.text
    shops = resp.json()
    assert isinstance(shops, list)
    assert len(shops) == 14, len(shops)


def test_regression_pricing_rules_endpoint(master_client):
    resp = master_client.get(api_url("/shops/pricing-rules"))
    assert resp.status_code == 200, resp.text
    rules = resp.json()
    assert rules.get("version", 0) >= 1, rules


def test_regression_inventory_list_and_stats(master_client):
    resp = master_client.get(api_url("/inventory"))
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)

    stats_resp = master_client.get(api_url("/inventory/stats"))
    assert stats_resp.status_code == 200, stats_resp.text
    stats = stats_resp.json()
    assert "total_items" in stats
    assert "available_items" in stats
