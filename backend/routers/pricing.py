"""Pricing audit — master-only read model over the pricing_ledger collection.

Reads the ledger rows and enriches each with the item's current title/SKU/status so the master
dashboard can show "£X base → £Y final" per saved valuation. Two shapes:
- JSON list for the admin UI (newest first, with pagination hints)
- CSV export for records
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from lib.auth import require_master
from lib.db import db
from pydantic import BaseModel

router = APIRouter(prefix="/pricing", tags=["pricing"])


class LedgerRow(BaseModel):
    id: str
    created_at: datetime
    item_id: str
    item_title: str = ""
    item_sku: str = ""
    item_status: str = ""
    shop_name: str | None = None
    zone: int | str | None = None
    base_price: float
    adjustment_percent: float
    final_price: float
    rule_version: int
    actor: str = ""
    reason: str = ""


async def _rows(limit: int, skip: int) -> list[LedgerRow]:
    docs = (
        await db.pricing_ledger.find({}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    )
    # Batch-load every referenced item once so we don't fire a query per row.
    item_ids = list({d["item_id"] for d in docs if d.get("item_id")})
    items: dict[str, dict] = {}
    if item_ids:
        async for item in db.inventory.find(
            {"id": {"$in": item_ids}}, {"id": 1, "title": 1, "sku": 1, "status": 1}
        ):
            items[item["id"]] = item
    out: list[LedgerRow] = []
    for d in docs:
        it = items.get(d.get("item_id", ""), {})
        created = d.get("created_at")
        if isinstance(created, datetime) and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        out.append(
            LedgerRow(
                id=d["id"],
                created_at=created,
                item_id=d.get("item_id", ""),
                item_title=it.get("title", ""),
                item_sku=it.get("sku", ""),
                item_status=it.get("status", ""),
                shop_name=d.get("shop_name"),
                zone=d.get("zone"),
                base_price=float(d.get("base_price", 0)),
                adjustment_percent=float(d.get("adjustment_percent", 0)),
                final_price=float(d.get("final_price", 0)),
                rule_version=int(d.get("rule_version", 0)),
                actor=d.get("actor", "") or "",
                reason=d.get("reason", "") or "",
            )
        )
    return out


# Volunteer-authored text (item titles, reasons) lands in a spreadsheet the master opens locally.
# Excel/Sheets evaluate any cell starting with = + - @ (or a leading tab/CR) as a formula, so a
# crafted title could execute on the master's machine. Prefix those cells with an apostrophe to
# force literal text.
_CSV_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value: object) -> str:
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(_CSV_TRIGGERS) else text


@router.get("/audit", response_model=list[LedgerRow])
async def list_audit(
    limit: int = Query(default=50, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    _: dict = Depends(require_master),
):
    return await _rows(limit, skip)


@router.get("/audit.csv")
async def export_audit_csv(_: dict = Depends(require_master)):
    """Streams the whole ledger as a CSV, newest first. Caps at 50 000 rows to keep memory
    predictable — well above any realistic shop's annual throughput."""
    rows = await _rows(limit=50_000, skip=0)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "created_at",
            "item_sku",
            "item_title",
            "item_status",
            "shop_name",
            "zone",
            "base_price",
            "adjustment_percent",
            "final_price",
            "rule_version",
            "actor",
            "reason",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r.created_at.isoformat(),
                _csv_safe(r.item_sku),
                _csv_safe(r.item_title),
                _csv_safe(r.item_status),
                _csv_safe(r.shop_name or ""),
                r.zone if r.zone is not None else "",
                f"{r.base_price:.2f}",
                f"{r.adjustment_percent:.2f}",
                f"{r.final_price:.2f}",
                _csv_safe(r.rule_version),
                _csv_safe(r.actor),
                _csv_safe(r.reason),
            ]
        )
    buf.seek(0)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="pricing-audit-{today}.csv"'},
    )
