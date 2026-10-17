"""Backend test for: GET /inventory (list) ships thumb_image instead of the full item_image
to keep the mobile payload compact (inventory list performance fix)."""

import base64
import io
import uuid

from PIL import Image

from .conftest import api_url, volunteer_client  # noqa: F401 (fixture import)


def _make_data_url(size=(800, 800), color=(200, 30, 30)) -> str:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def test_list_endpoint_excludes_item_image_and_ships_small_thumb(volunteer_client):
    sku_title = f"tscheck-listperf-{uuid.uuid4().hex[:8]}"
    full_image = _make_data_url()
    create_resp = volunteer_client.post(
        api_url("/inventory"),
        json={
            "appraisal": {
                "title": sku_title,
                "brand": "TestBrand",
                "category": "Homewear",
                "description": "perf fixture",
                "condition": "Good",
                "peak_retail_price": 20,
                "market_average_price": 10,
                "recommended_price": 5,
                "currency": "GBP",
                "confidence": "high",
                "rationale": "fixture",
            },
            "item_image": full_image,
            "location": "West Hampstead",
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    item_id = created["id"]

    try:
        list_resp = volunteer_client.get(api_url("/inventory"))
        assert list_resp.status_code == 200, list_resp.text
        rows = list_resp.json()
        row = next((r for r in rows if r["id"] == item_id), None)
        assert row is not None, "created fixture item not found in /inventory list"

        # Core performance fix: the list response must NOT carry the full base64 photo.
        assert row.get("item_image") is None, "list endpoint should not ship full item_image"
        assert row.get("label_image") is None
        assert row.get("extra_images") in (None, [])

        # It should carry a small generated thumbnail instead.
        thumb = row.get("thumb_image")
        assert thumb is not None, "list row missing thumb_image"
        assert thumb.startswith("data:image/jpeg;base64,")
        thumb_bytes = len(thumb)
        assert thumb_bytes < len(full_image) / 4, (
            f"thumb ({thumb_bytes} chars) should be much smaller than full image "
            f"({len(full_image)} chars)"
        )
    finally:
        volunteer_client.delete(api_url(f"/inventory/{item_id}"))
