"""Backend test for: POST /inventory auto-generates a thumb_image (160px long-edge JPEG) at
upload time, distinct from and much smaller than the full item_image, and the detail route
(GET /inventory/{id}) still returns the full-resolution item_image unchanged."""

import base64
import io
import uuid

from PIL import Image

from .conftest import api_url, volunteer_client  # noqa: F401 (fixture import)


def _make_data_url(size=(900, 900), color=(30, 120, 60)) -> str:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def test_create_generates_thumb_and_detail_route_keeps_full_image(volunteer_client):
    title = f"tscheck-thumbgen-{uuid.uuid4().hex[:8]}"
    full_image = _make_data_url()
    create_resp = volunteer_client.post(
        api_url("/inventory"),
        json={
            "appraisal": {
                "title": title,
                "brand": "TestBrand",
                "category": "Books",
                "description": "thumb fixture",
                "condition": "Good",
                "peak_retail_price": 15,
                "market_average_price": 8,
                "recommended_price": 4,
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

    # Creation response itself carries the generated thumb.
    assert created.get("thumb_image"), "create response missing generated thumb_image"
    assert created["thumb_image"].startswith("data:image/jpeg;base64,")
    assert created["thumb_image"] != full_image

    try:
        # Decode the thumb and assert its pixel dimensions are capped at 160px long-edge.
        header, b64data = created["thumb_image"].split(",", 1)
        raw = base64.b64decode(b64data)
        with Image.open(io.BytesIO(raw)) as thumb_img:
            assert max(thumb_img.size) <= 160, f"thumb not resized: {thumb_img.size}"

        # Detail route still returns the full, unshrunk item_image.
        detail_resp = volunteer_client.get(api_url(f"/inventory/{item_id}"))
        assert detail_resp.status_code == 200, detail_resp.text
        detail = detail_resp.json()
        assert detail["item_image"] == full_image
        assert detail.get("thumb_image") == created["thumb_image"]
    finally:
        volunteer_client.delete(api_url(f"/inventory/{item_id}"))
