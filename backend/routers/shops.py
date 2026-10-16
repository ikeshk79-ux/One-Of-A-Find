"""Shops + pricing-rules admin API.

Reads are open to any signed-in volunteer so the appraise/edit forms can list the active shops
and show adjustment previews. Writes (create / edit / disable / rule changes) require the
master role — the admin page under /more is gated to the master too.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import require_master, require_session
from lib.db import db
from lib.pricing import apply_adjustment, load_rules
from models.shop import (
    PriceAdjustmentPreview,
    PricingRules,
    PricingRulesUpdate,
    Shop,
    ShopCreate,
    ShopUpdate,
)

router = APIRouter(prefix="/shops", tags=["shops"])


def _aware(doc: dict) -> dict:
    for key in ("created_at", "updated_at"):
        value = doc.get(key)
        if isinstance(value, datetime) and value.tzinfo is None:
            doc[key] = value.replace(tzinfo=timezone.utc)
    return doc


# -----------------------------------------------------------------------------
# Shops CRUD
# -----------------------------------------------------------------------------
@router.get("", response_model=list[Shop])
async def list_shops(
    include_disabled: bool = Query(default=False),
    _: dict = Depends(require_session),
):
    """Any signed-in volunteer can list shops so the appraise form can populate its dropdown.
    Disabled shops are hidden by default; the admin page passes include_disabled=1."""
    q: dict = {} if include_disabled else {"disabled": {"$ne": True}}
    docs = await db.shops.find(q).sort("name", 1).to_list(500)
    return [Shop(**_aware(doc)) for doc in docs]


@router.post("", response_model=Shop, status_code=201)
async def create_shop(body: ShopCreate, session: dict = Depends(require_master)):
    name = body.name.strip()
    if await db.shops.find_one({"name": name}):
        raise HTTPException(status_code=409, detail="A shop with that name already exists")
    # Splat the payload, then re-set the stripped name — `model_dump()` already contains the
    # original key, so the two must not both be passed as kwargs.
    payload = {**body.model_dump(), "name": name}
    shop = Shop(**payload)
    await db.shops.insert_one(shop.model_dump())
    return shop


@router.patch("/{shop_id}", response_model=Shop)
async def update_shop(shop_id: str, body: ShopUpdate, session: dict = Depends(require_master)):
    update: dict = {}
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")
    # Zone changes clear the needs-review flag unless the admin explicitly re-raised it.
    if "zone" in changes and "needs_zone_review" not in changes:
        update["needs_zone_review"] = False
    if "outside_zones" in changes and changes["outside_zones"]:
        update["zone"] = None
    for field, value in changes.items():
        if field == "name" and isinstance(value, str):
            value = value.strip()
            if not value:
                raise HTTPException(status_code=422, detail="Name cannot be empty")
            # Prevent silent collisions with another shop.
            if await db.shops.find_one({"name": value, "id": {"$ne": shop_id}}):
                raise HTTPException(status_code=409, detail="Another shop already uses that name")
        update[field] = value
    update["updated_at"] = datetime.now(timezone.utc)
    doc = await db.shops.find_one_and_update(
        {"id": shop_id}, {"$set": update}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Shop not found")
    return Shop(**_aware(doc))


@router.delete("/{shop_id}")
async def delete_shop(
    shop_id: str,
    mode: str = Query(default="disable"),
    reassign_to: str | None = Query(default=None),
    _: dict = Depends(require_master),
):
    """Delete a shop. Defaults to a soft-disable so existing inventory items that reference
    this shop by name continue to render. Pass `?mode=remove` to hard-delete; the request is
    rejected with 409 if any inventory item still references the shop so the admin can either
    disable instead or reassign items first.

    To **merge a duplicate branch into another**, pass `?mode=remove&reassign_to=<target_shop_id>`:
    every inventory item (and pricing-ledger row) that currently points at this shop by name is
    moved to the target shop's name first, then the source shop is hard-deleted.
    """
    doc = await db.shops.find_one({"id": shop_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Shop not found")

    if mode == "remove":
        # Merge path: reassign every linked item/ledger row to the target shop first, then
        # proceed with the hard-delete. Both shops must exist and differ.
        if reassign_to:
            if reassign_to == shop_id:
                raise HTTPException(status_code=422, detail="Cannot merge a shop into itself")
            target = await db.shops.find_one({"id": reassign_to})
            if not target:
                raise HTTPException(status_code=404, detail="Target shop not found")
            await db.inventory.update_many(
                {"location": doc["name"]}, {"$set": {"location": target["name"]}}
            )
            await db.pricing_ledger.update_many(
                {"shop_id": shop_id},
                {"$set": {"shop_id": target["id"], "shop_name": target["name"]}},
            )
            await db.pricing_ledger.update_many(
                {"shop_name": doc["name"], "shop_id": None},
                {"$set": {"shop_name": target["name"]}},
            )
            await db.shops.delete_one({"id": shop_id})
            return Shop(**_aware(doc))

        linked = await db.inventory.count_documents({"location": doc["name"]})
        if linked > 0:
            raise HTTPException(
                status_code=409,
                detail=f"{linked} item{'s' if linked != 1 else ''} still reference this shop — merge into another branch, reassign them, or disable this shop instead",
            )
        await db.shops.delete_one({"id": shop_id})
        return Shop(**_aware(doc))

    # Default: soft-disable (back-compat with the previous DELETE contract).
    updated = await db.shops.find_one_and_update(
        {"id": shop_id},
        {"$set": {"disabled": True, "updated_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    return Shop(**_aware(updated))


# -----------------------------------------------------------------------------
# Pricing rules + preview
# -----------------------------------------------------------------------------
@router.get("/pricing-rules", response_model=PricingRules)
async def get_pricing_rules(_: dict = Depends(require_session)):
    return await load_rules()


@router.put("/pricing-rules", response_model=PricingRules)
async def update_pricing_rules(body: PricingRulesUpdate, session: dict = Depends(require_master)):
    """Bump the version every edit so each saved valuation is pinned to the rule-set it used."""
    current = await load_rules()
    merged = {**current.adjustments, **body.adjustments}
    new = PricingRules(
        version=current.version + 1,
        adjustments=merged,
        updated_by=session.get("username", ""),
    )
    await db.pricing_rules.insert_one(new.model_dump())
    return new


@router.get("/preview-adjustment", response_model=PriceAdjustmentPreview)
async def preview_adjustment(
    base_price: float = Query(ge=0.0),
    shop_id: str | None = Query(default=None),
    shop_name: str | None = Query(default=None),
    _: dict = Depends(require_session),
):
    """Advisory price preview the UI calls when the volunteer picks a shop — the canonical
    computation still happens on POST/PATCH /inventory."""
    result = await apply_adjustment(base_price, shop_id=shop_id, shop_name=shop_name)
    return PriceAdjustmentPreview(
        base_price=result["base_price"],
        adjusted_price=result["final_price"],
        adjustment_percent=result["adjustment_percent"],
        zone=result["zone"],
        rule_version=result["rule_version"],
        shop_id=result["shop_id"],
        shop_name=result["shop_name"],
    )
