import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require_session
from lib.activity import log_activity
from lib.ai_quota import enforce_ai_quota
from lib.db import db
from lib.thumbs import make_thumb
from lib.pricing import apply_adjustment
from models.appraisal import (
    BlurbRequest,
    InventoryCreate,
    InventoryItem,
    InventoryStats,
    ItemUpdate,
    SellRequest,
)
from models.shop import PricingLedgerEntry
from routers.appraise import CATEGORIES, CONDITIONS, draft_blurb


async def _active_shop_names() -> set[str]:
    """Shop names currently valid for a volunteer to pick — DB-backed replacement for the
    old hard-coded LOCATIONS tuple. Disabled shops are excluded so a new item can't be filed
    to a retired branch, but existing items keep their stored name on display."""
    docs = await db.shops.find({"disabled": {"$ne": True}}, {"name": 1}).to_list(500)
    return {doc["name"] for doc in docs}


router = APIRouter(prefix="/inventory", tags=["inventory"])


def _sku() -> str:
    # 12 digits → valid EAN-13 payload once JsBarcode appends the check digit.
    return "".join(secrets.choice(string.digits) for _ in range(12))


async def _unique_sku() -> str:
    # Guard against duplicate SKUs so a scanned barcode always maps to exactly one item.
    for _ in range(10):
        sku = _sku()
        if not await db.inventory.find_one({"sku": sku}):
            return sku
    raise HTTPException(status_code=500, detail="Could not allocate a unique SKU")


def _aware(doc: dict) -> dict:
    # motor returns naive datetimes; normalise to aware UTC before Pydantic serialises them.
    for key in ("created_at", "sold_at"):
        value = doc.get(key)
        if isinstance(value, datetime) and value.tzinfo is None:
            doc[key] = value.replace(tzinfo=timezone.utc)
    return doc


# Gift Aid references are printed on the price tag, so they are no longer redacted; the donor-name
# field has been removed entirely. No per-role field redaction remains.
_SENSITIVE_FIELDS: tuple[str, ...] = ()


def _redact(item: InventoryItem, session: dict) -> InventoryItem:
    if session.get("is_master"):
        return item
    return item.model_copy(update={k: None for k in _SENSITIVE_FIELDS})


def _week_start() -> datetime:
    now = datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight - timedelta(days=midnight.weekday())  # Monday 00:00 UTC


@router.get("", response_model=list[InventoryItem])
async def list_items(session: dict = Depends(require_session)):
    # Trim heavy fields the grid never shows (label + detail photos); the detail page fetches the full doc.
    docs = (
        await db.inventory.find({}, {"item_image": 0, "label_image": 0, "extra_images": 0})
        .sort("created_at", -1)
        .to_list(2500)
    )
    return [_redact(InventoryItem(**_aware(d)), session) for d in docs]


@router.get("/stats", response_model=InventoryStats)
async def stats(_: bool = Depends(require_session)):
    # Project only the fields the totals need — never pull base64 images into an aggregate scan.
    docs = await db.inventory.find(
        {}, {"_id": 0, "status": 1, "sold_price": 1, "recommended_price": 1, "sold_at": 1}
    ).to_list(5000)
    start = _week_start()
    week_raised = 0.0
    week_count = 0
    all_time = 0.0
    potential = 0.0
    sold = 0
    for d in docs:
        _aware(d)
        if d.get("status") == "sold":
            # Use the actual sold price — an explicit £0 (giveaway/damaged) must count as 0,
            # not silently fall back to the recommended price. Only a missing (None) sold
            # price falls back to recommended.
            sp = d.get("sold_price")
            price = float(sp if sp is not None else (d.get("recommended_price") or 0))
            sold += 1
            all_time += price
            sold_at = d.get("sold_at")
            if isinstance(sold_at, datetime) and sold_at >= start:
                week_raised += price
                week_count += 1
        else:
            potential += float(d.get("recommended_price") or 0)
    return InventoryStats(
        total_items=len(docs),
        available_items=len(docs) - sold,
        sold_items=sold,
        week_start=start.date().isoformat(),
        week_raised=round(week_raised, 2),
        week_sold_count=week_count,
        all_time_raised=round(all_time, 2),
        potential_value=round(potential, 2),
    )


@router.get("/lookup", response_model=InventoryItem)
async def lookup_by_sku(sku: str, session: dict = Depends(require_session)):
    doc = await db.inventory.find_one({"sku": sku.strip()})
    if not doc:
        raise HTTPException(status_code=404, detail="No item with that barcode")
    return _redact(InventoryItem(**_aware(doc)), session)


@router.post("", response_model=InventoryItem, status_code=201)
async def create_item(body: InventoryCreate, session: dict = Depends(require_session)):
    appraisal = body.appraisal.model_dump()
    # Mirror the edit path: only accept a known category so a non-UI client (or an older client
    # still sending retired labels like "Men's general") can't persist an unknown bucket.
    if appraisal.get("category") not in CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown category")
    # Match the edit path: never persist a negative price (e.g. a hand-typed custom price) and
    # always round to pence so it can't skew potential_value / all_time_raised totals. Also
    # clamp the peak/market numbers the client sends — the AI returns 2-3 figure GBP values, so
    # £100k is a safe cosmetic ceiling that catches a non-UI client from skewing dashboards.
    _PRICE_CEILING = 100_000.0
    # Clamp all three prices to [0, _PRICE_CEILING] so a scripted client can't skew dashboard
    # totals by storing an absurdly large recommended_price (SEC-002 hardening, 2026-10-26).
    appraisal["recommended_price"] = round(
        max(0.0, min(_PRICE_CEILING, float(appraisal.get("recommended_price") or 0))), 2
    )
    appraisal["peak_retail_price"] = round(
        max(0.0, min(_PRICE_CEILING, float(appraisal.get("peak_retail_price") or 0))), 2
    )
    appraisal["market_average_price"] = round(
        max(0.0, min(_PRICE_CEILING, float(appraisal.get("market_average_price") or 0))), 2
    )
    if appraisal.get("price_source") not in {"charity", "peak", "custom"}:
        appraisal["price_source"] = "charity"
    # Gift Aid numbers are digits only — mirror the edit path so a non-UI client can't store junk.
    giftaid = body.giftaid_ref
    if giftaid is not None:
        giftaid = "".join(ch for ch in giftaid if ch.isdigit())[:40] or None
    # Mirror the edit path: only accept a known branch so a non-UI client can't store a junk location.
    active_shops = await _active_shop_names()
    if body.location is not None and body.location not in active_shops:
        raise HTTPException(status_code=422, detail="Unknown location")

    # Apply the TfL-zone adjustment on the backend before persisting ONLY when the volunteer
    # chose the Charity Price option. For "peak" (RRP) and "custom" the volunteer explicitly set
    # the price — honour it as-sent so the hero number on the valuation screen matches what
    # lands on the tag. The frontend applies the same zone adjustment to the Charity Price
    # before posting, so for `price_source == "charity"` this call is idempotent (base ≈ final)
    # on normal input; running it here is the authoritative belt-and-braces against a client
    # that didn't pre-adjust.
    base_price = appraisal["recommended_price"]
    if appraisal["price_source"] == "charity":
        adjustment = await apply_adjustment(base_price, shop_name=body.location)
        appraisal["recommended_price"] = adjustment["final_price"]
    else:
        # Non-charity price — bypass the zone adjustment; audit it as a 0% adjustment so the
        # ledger still records the sale location + rule version it was priced under.
        from lib.pricing import load_rules  # local import to avoid a cycle at module load
        rules = await load_rules()
        adjustment = {
            "base_price": base_price,
            "final_price": base_price,
            "adjustment_percent": 0.0,
            "zone": None,
            "rule_version": rules.version,
            "shop_id": None,
            "shop_name": body.location,
        }

    item = InventoryItem(
        sku=await _unique_sku(),
        item_image=body.item_image,
        # Generate the list-view thumbnail now so the grid never ships the full image.
        thumb_image=make_thumb(body.item_image),
        label_image=body.label_image,
        extra_images=body.extra_images,
        giftaid_ref=giftaid,
        location=body.location,
        size=body.size,
        **appraisal,
    )
    await db.inventory.insert_one(item.model_dump())
    # Audit row — one per saved valuation per spec #7.
    ledger = PricingLedgerEntry(
        item_id=item.id,
        shop_id=adjustment["shop_id"],
        shop_name=adjustment["shop_name"],
        zone=adjustment["zone"],
        base_price=adjustment["base_price"],
        adjustment_percent=adjustment["adjustment_percent"],
        final_price=adjustment["final_price"],
        rule_version=adjustment["rule_version"],
        actor=session.get("username", ""),
        reason="create",
    )
    await db.pricing_ledger.insert_one(ledger.model_dump())
    await log_activity(session.get("username"), "created", item=item.model_dump())
    return item


@router.get("/{item_id}", response_model=InventoryItem)
async def get_item(item_id: str, session: dict = Depends(require_session)):
    doc = await db.inventory.find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    return _redact(InventoryItem(**_aware(doc)), session)


@router.get("/{item_id}/location-preview")
async def preview_location_change(
    item_id: str,
    location: str,
    _: dict = Depends(require_session),
):
    """Preview what the recommended price would become if this item's shop changed to
    `location`. Matches the PATCH /inventory/{id} re-pricing contract: starts from the item's
    last ledger entry's base_price (or the current recommended_price if no ledger exists), then
    applies apply_adjustment() against the new shop. Advisory — saving the PATCH still runs the
    canonical computation on the backend."""
    doc = await db.inventory.find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    if location not in await _active_shop_names():
        raise HTTPException(status_code=422, detail="Unknown location")
    last_ledger = await db.pricing_ledger.find_one(
        {"item_id": item_id}, sort=[("created_at", -1)]
    )
    base_price = (
        float(last_ledger["base_price"]) if last_ledger else float(doc.get("recommended_price", 0))
    )
    return await apply_adjustment(base_price, shop_name=location)


@router.patch("/{item_id}", response_model=InventoryItem)
async def update_item(item_id: str, body: ItemUpdate, session: dict = Depends(require_session)):
    """Edit an existing item: title, recommended price, category, shop location and/or size."""
    update: dict = {}
    if body.category is not None:
        if body.category not in CATEGORIES:
            raise HTTPException(status_code=422, detail="Unknown category")
        update["category"] = body.category
    if body.location is not None:
        if body.location not in await _active_shop_names():
            raise HTTPException(status_code=422, detail="Unknown location")
        update["location"] = body.location
    if body.title is not None:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="Title cannot be empty")
        update["title"] = title[:80]
    if body.recommended_price is not None:
        if body.recommended_price < 0:
            raise HTTPException(status_code=422, detail="Price cannot be negative")
        if body.recommended_price > 100_000:
            raise HTTPException(status_code=422, detail="Price exceeds limit")
        update["recommended_price"] = round(float(body.recommended_price), 2)
    if body.size is not None:
        update["size"] = body.size.strip()[:40] or None  # empty string clears the size
    if body.condition is not None:
        if body.condition not in CONDITIONS:
            raise HTTPException(status_code=422, detail="Unknown condition")
        update["condition"] = body.condition
    if body.price_source is not None:
        if body.price_source not in ("charity", "peak", "custom"):
            raise HTTPException(status_code=422, detail="Unknown price source")
        update["price_source"] = body.price_source
    if body.giftaid_ref is not None:
        # Gift Aid numbers are digits only; strip anything else, empty clears the ref.
        digits = "".join(ch for ch in body.giftaid_ref if ch.isdigit())[:40]
        update["giftaid_ref"] = digits or None
    if body.pat_passed is not None:
        update["pat_passed"] = bool(body.pat_passed)
    if body.is_electrical is not None:
        update["is_electrical"] = bool(body.is_electrical)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    doc = await db.inventory.find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")

    # If the shop/location is being changed and the volunteer isn't manually overriding the
    # price in the same PATCH, re-run the zone adjustment from the item's original base price
    # (pulled from its last ledger entry) so we don't double-adjust.
    location_changed = "location" in update and update["location"] != doc.get("location")
    will_be_charity = (update.get("price_source") or doc.get("price_source", "charity")) == "charity"
    if location_changed and will_be_charity and body.recommended_price is None:
        last_ledger = await db.pricing_ledger.find_one(
            {"item_id": item_id}, sort=[("created_at", -1)]
        )
        base_price = (
            float(last_ledger["base_price"]) if last_ledger else float(doc.get("recommended_price", 0))
        )
        adjustment = await apply_adjustment(base_price, shop_name=update["location"])
        update["recommended_price"] = adjustment["final_price"]
        # Audit the re-price.
        await db.pricing_ledger.insert_one(
            PricingLedgerEntry(
                item_id=item_id,
                shop_id=adjustment["shop_id"],
                shop_name=adjustment["shop_name"],
                zone=adjustment["zone"],
                base_price=adjustment["base_price"],
                adjustment_percent=adjustment["adjustment_percent"],
                final_price=adjustment["final_price"],
                rule_version=adjustment["rule_version"],
                actor=session.get("username", ""),
                reason="update:location",
            ).model_dump()
        )
    # Capture before/after for the audit log (master-only view).
    changes = {
        field: {"from": doc.get(field), "to": value}
        for field, value in update.items()
        if doc.get(field) != value
    }
    await db.inventory.update_one({"id": item_id}, {"$set": update})
    doc.update(update)
    # A PAT-test tick gets its own audit action so the master can see who cleared it and when.
    pat_change = changes.pop("pat_passed", None)
    if pat_change is not None:
        await log_activity(
            session.get("username"),
            "pat_tested",
            item=doc,
            details={"pat_passed": pat_change["to"]},
        )
    if changes:
        await log_activity(session.get("username"), "edited", item=doc, details={"changes": changes})
    return _redact(InventoryItem(**_aware(doc)), session)


@router.post("/{item_id}/blurb", response_model=InventoryItem)
async def redraft_blurb(item_id: str, body: BlurbRequest, session: dict = Depends(require_session)):
    """Re-draft the item's resale listing in a chosen tone and persist it."""
    # Shares the same AI quota bucket as /appraise so an attacker can't bypass by swapping
    # endpoints — both count toward the same per-user daily cap.
    await enforce_ai_quota(session.get("username"))
    doc = await db.inventory.find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    blurb = await draft_blurb(
        title=doc.get("title", ""),
        brand=doc.get("brand", ""),
        category=doc.get("category", ""),
        condition=doc.get("condition", ""),
        description=doc.get("description", ""),
        tone=body.tone,
    )
    await db.inventory.update_one({"id": item_id}, {"$set": {"resale_blurb": blurb}})
    doc["resale_blurb"] = blurb
    return _redact(InventoryItem(**_aware(doc)), session)


@router.patch("/{item_id}/sell", response_model=InventoryItem)
async def mark_sold(item_id: str, body: SellRequest, session: dict = Depends(require_session)):
    doc = await db.inventory.find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    if body.sold:
        # Idempotency: a till scan on a second device or a replayed POST must not overwrite the
        # original sale (which may have been at an overridden/discounted price) and shift its
        # timestamp into the current reporting week — that would silently corrupt the
        # weekly/all-time "raised" dashboards. Reject with 409 so the till UI shows a clear
        # "already sold" message instead of charging a second time.
        if doc.get("status") == "sold":
            raise HTTPException(status_code=409, detail="Item is already marked sold")
        price = body.sold_price if body.sold_price is not None else doc.get("recommended_price", 0)
        update = {
            "status": "sold",
            "sold_price": round(max(0.0, float(price)), 2),
            "sold_giftaid_ref": doc.get("giftaid_ref"),  # allocate the sale to the item's gift aid number
            "sold_at": datetime.now(timezone.utc),
        }
    else:
        update = {
            "status": "available",
            "sold_price": None,
            "sold_giftaid_ref": None,
            "sold_at": None,
        }
    await db.inventory.update_one({"id": item_id}, {"$set": update})
    doc.update(update)
    if body.sold:
        await log_activity(
            session.get("username"),
            "marked_sold",
            item=doc,
            details={"sold_price": update["sold_price"], "giftaid_ref": update["sold_giftaid_ref"]},
        )
    else:
        await log_activity(session.get("username"), "returned_to_floor", item=doc)
    return _redact(InventoryItem(**_aware(doc)), session)


@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: str, session: dict = Depends(require_session)):
    doc = await db.inventory.find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.inventory.delete_one({"id": item_id})
    await log_activity(session.get("username"), "deleted", item=doc)
    return None
