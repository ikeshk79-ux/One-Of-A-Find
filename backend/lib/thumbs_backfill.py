"""One-shot background backfill: generate thumb_image for existing inventory rows that have an
item_image but no thumb_image yet. Idempotent — reruns on every boot touch nothing once the
collection is caught up. Processing is batched (100 rows per pass) with a short asyncio.sleep
between batches so Pillow decode doesn't starve the event loop on a 2000-row collection."""

from __future__ import annotations

import asyncio
import logging

from lib.db import db
from lib.thumbs import make_thumb

LOGGER = logging.getLogger(__name__)

BATCH_SIZE = 100


async def backfill_thumbs() -> dict[str, int]:
    """Return a {scanned, generated, skipped} counter for logs/tests."""
    scanned = 0
    generated = 0
    skipped = 0
    # Query by projection: only pull item_image + id for rows missing a thumb. Mongo returns
    # the cursor lazily so memory stays bounded.
    cursor = db.inventory.find(
        {"item_image": {"$ne": None}, "thumb_image": None},
        {"_id": 0, "id": 1, "item_image": 1},
    )
    batch: list[tuple[str, str]] = []
    async for doc in cursor:
        scanned += 1
        batch.append((doc["id"], doc["item_image"]))
        if len(batch) >= BATCH_SIZE:
            g, s = await _flush(batch)
            generated += g
            skipped += s
            batch.clear()
            await asyncio.sleep(0)  # yield to event loop between batches
    if batch:
        g, s = await _flush(batch)
        generated += g
        skipped += s
    if scanned:
        LOGGER.info(
            "thumbs backfill: scanned=%d generated=%d skipped=%d", scanned, generated, skipped,
        )
    return {"scanned": scanned, "generated": generated, "skipped": skipped}


async def _flush(batch: list[tuple[str, str]]) -> tuple[int, int]:
    generated = 0
    skipped = 0
    for item_id, item_image in batch:
        thumb = make_thumb(item_image)
        if thumb is None:
            skipped += 1
            continue
        await db.inventory.update_one({"id": item_id}, {"$set": {"thumb_image": thumb}})
        generated += 1
    return generated, skipped
