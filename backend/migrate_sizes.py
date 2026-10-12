"""One-off migration from the old category/size labels to the new combined-system scheme.

Run with:   python migrate_sizes.py
Idempotent — items already using the new labels (or lacking size entirely) are left alone.

Mapping rationale (per fork session on 2026-10-12):
- The old women's/kids CLOTHING_SIZES anchored on UK number; new women's label anchors on UK too,
  so each old row maps cleanly to the new row with the same UK number. Alpha only widens
  (XS now covers UK 4-6, M covers UK 10-12, L=UK 14, XL=UK 16-18, XXL=UK 20) which is why volunteers
  still pick by UK number.
- The old shoe label 'UK X (EU Y)' simply gets re-separated to 'UK X · EU Y'.
- 'Men's general' is removed. We migrate those items to 'Men's shirts' (the most common menswear
  donation) and map the alpha letter to the shirt row with that alpha. XXS/XXXL have no shirt row
  so their size is cleared (volunteer re-picks from the new menu on edit).
"""
import asyncio
import os
import sys
from typing import cast

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from lib.db import db  # noqa: E402

WOMENS_SIZE_MIGRATION: dict[str, str] = {
    "XXS (UK 4)": "UK 4 · XS · EU 32",
    "XS (UK 6)": "UK 6 · XS · EU 34",
    "S (UK 8)": "UK 8 · S · EU 36",
    "M (UK 10)": "UK 10 · M · EU 38",
    "L (UK 12)": "UK 12 · M · EU 40",
    "XL (UK 14)": "UK 14 · L · EU 42",
    "XXL (UK 16)": "UK 16 · XL · EU 44",
}

WOMENS_SHOE_MIGRATION: dict[str, str] = {
    "UK 4 (EU 37)": "UK 4 · EU 37",
    "UK 5 (EU 38)": "UK 5 · EU 38",
    "UK 6 (EU 39)": "UK 6 · EU 39",
    "UK 7 (EU 40)": "UK 7 · EU 40",
    "UK 8 (EU 42)": "UK 8 · EU 42",
    "UK 9 (EU 43)": "UK 9 · EU 43",
    "UK 10 (EU 44)": "UK 10 · EU 44",
    "UK 11 (EU 45)": "UK 11 · EU 45",
    "UK 12 (EU 46)": "UK 12 · EU 46",
    "UK 13 (EU 47)": "UK 13 · EU 47",
}

MENS_GENERAL_TO_SHIRT: dict[str, str] = {
    "XS": 'XS · 14" · EU 36',
    "S": 'S · 14.5" · EU 37',
    "M": 'M · 15.5" · EU 39',
    "L": 'L · 16.5" · EU 42',
    "XL": 'XL · 17.5" · EU 44',
    "XXL": 'XXL · 18.5" · EU 46',
    # XXS / XXXL have no shirt-row equivalent — cleared to blank.
    "XXS": "",
    "XXXL": "",
}


async def _apply(filter_q: dict, update: dict, label: str) -> int:
    res = await db.inventory.update_many(filter_q, update)
    if res.modified_count:
        print(f"  {label}: migrated {res.modified_count} item(s)")
    return cast(int, res.modified_count)


async def migrate() -> None:
    total = 0

    # 1) Women's / Children clothing size relabel (any category — only touches rows whose
    #    `size` matches an old label, so we don't need to filter by category).
    for old, new in WOMENS_SIZE_MIGRATION.items():
        total += await _apply({"size": old}, {"$set": {"size": new}}, f"size {old!r} → {new!r}")

    # 2) Women's shoe size relabel.
    for old, new in WOMENS_SHOE_MIGRATION.items():
        total += await _apply({"size": old}, {"$set": {"size": new}}, f"shoe {old!r} → {new!r}")

    # 3) Men's general → Men's shirts (with letter-to-shirt-row mapping).
    for old_size, new_size in MENS_GENERAL_TO_SHIRT.items():
        total += await _apply(
            {"category": "Men's general", "size": old_size},
            {"$set": {"category": "Men's shirts", "size": new_size}},
            f"Men's general {old_size!r} → Men's shirts {new_size or '(blank)'!r}",
        )
    # Any remaining Men's general item (unknown/null size) just moves category.
    total += await _apply(
        {"category": "Men's general"},
        {"$set": {"category": "Men's shirts"}},
        "Men's general (other) → Men's shirts",
    )

    print(f"\nMigration complete. Rows touched: {total}.")


if __name__ == "__main__":
    asyncio.run(migrate())
