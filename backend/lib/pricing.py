"""Backend-anchored price adjustment: given a base charity price and a shop, return the final
price (rounded to £1 when an adjustment applies) and the audit payload to persist alongside the
item. The volunteer's browser can preview this via GET /api/shops/preview-adjustment, but the
canonical computation always happens here on save — the UI value is advisory only.
"""
from __future__ import annotations

from typing import Any

from lib.db import db
from models.shop import PricingRules


async def _load_shop(shop_id: str | None, shop_name: str | None) -> dict[str, Any] | None:
    """Resolve a shop either by its stored id or by its canonical name — items store a name
    today, but the admin UI will create items pointing at new ids. Falling back to name keeps
    the migration backwards compatible without a one-off data patch."""
    if shop_id:
        shop = await db.shops.find_one({"id": shop_id})
        if shop:
            return shop
    if shop_name:
        return await db.shops.find_one({"name": shop_name})
    return None


async def load_rules() -> PricingRules:
    """Current pricing-rule document, seeded on first read so the live app never 500s if the
    master hasn't opened the admin screen yet."""
    doc = await db.pricing_rules.find_one(sort=[("version", -1)])
    if doc:
        return PricingRules(**doc)
    seeded = PricingRules()  # defaults from the model
    await db.pricing_rules.insert_one(seeded.model_dump())
    return seeded


def _zone_key(shop: dict[str, Any] | None) -> str | None:
    """Which adjustment key applies to this shop: "1"–"6", "outside", or None (no mapping)."""
    if not shop:
        return None
    if shop.get("outside_zones"):
        return "outside"
    zone = shop.get("zone")
    if isinstance(zone, int) and 1 <= zone <= 6:
        return str(zone)
    return None


async def apply_adjustment(
    base_price: float,
    *,
    shop_id: str | None = None,
    shop_name: str | None = None,
) -> dict[str, Any]:
    """Returns the computed final price plus the metadata required for the audit ledger.
    If no shop is given, or the shop has no mapped zone, the final price equals base_price.
    When an adjustment applies the final price is rounded to the nearest whole pound per spec.
    """
    rules = await load_rules()
    shop = await _load_shop(shop_id, shop_name)
    zone_key = _zone_key(shop)
    pct = float(rules.adjustments.get(zone_key, 0.0)) if zone_key else 0.0

    base = round(max(0.0, float(base_price)), 2)
    if pct == 0.0:
        final = base  # no adjustment → keep the 50p rounding the base already carries
    else:
        final = round(base * (1 + pct / 100.0))  # spec: round to nearest £1
        final = max(0.0, float(final))

    return {
        "base_price": base,
        "final_price": final,
        "adjustment_percent": pct,
        "zone": shop.get("zone") if shop and not shop.get("outside_zones") else ("outside" if shop and shop.get("outside_zones") else None),
        "rule_version": rules.version,
        "shop_id": shop.get("id") if shop else None,
        "shop_name": shop.get("name") if shop else shop_name,
    }
