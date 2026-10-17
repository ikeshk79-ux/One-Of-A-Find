"""Server-side thumbnail generation for inventory photos.

The list endpoint used to ship the full base64 `item_image` for every row — a 7-item inventory
weighed 472 KB on the wire, 98% of which was photo bytes. At 500–2000 items that scales to
30–130 MB and 10–30 second loads on mobile. We generate a small JPEG thumbnail at upload time,
store it beside the full image, and serve only the thumb from the list.

Pillow is already in the pod's venv — no new dependency, no migration needed (Pydantic defaults
`thumb_image` to None on existing rows and the lifespan backfills them on first boot).
"""

from __future__ import annotations

import base64
import io
import logging
import re

from PIL import Image

LOGGER = logging.getLogger(__name__)

# 160 px long-edge balances crispness at the grid's ~50 px square (3x retina) against bytes on
# the wire. JPEG q80 is a well-known sweet spot for photographic content.
THUMB_MAX_EDGE = 160
THUMB_QUALITY = 80

_DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9+.-]+);base64,(.+)$", re.DOTALL)


def make_thumb(data_url: str | None) -> str | None:
    """Return a `data:image/jpeg;base64,…` thumbnail for `data_url`, or None if the input is
    missing, malformed, or decode fails. Never raises — a bad photo must never block an
    inventory save."""
    if not data_url:
        return None
    m = _DATA_URL_RE.match(data_url)
    if not m:
        return None
    try:
        raw = base64.b64decode(m.group(2), validate=False)
    except (ValueError, TypeError):
        return None
    try:
        with Image.open(io.BytesIO(raw)) as img:
            # Normalise to RGB so JPEG can encode (strips alpha from PNG/WebP transparency).
            if img.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((THUMB_MAX_EDGE, THUMB_MAX_EDGE), Image.LANCZOS)
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=THUMB_QUALITY, optimize=True)
    except Exception as e:  # noqa: BLE001 — any Pillow failure is a thumb we can skip, not a boot blocker
        LOGGER.debug("thumb generation failed: %s", e)
        return None
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode("ascii")
