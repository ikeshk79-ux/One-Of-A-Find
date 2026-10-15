"""Shop / pricing-rule / valuation-ledger models.

Replaces the hard-coded LOCATIONS tuple with a Mongo-backed `shops` collection the master
can edit, plus a versioned `pricing_rules` document that drives the zone-based price
adjustment and a `pricing_ledger` audit record for every valuation that applies one.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# TfL zone values the admin may set. "outside" means the shop falls outside the mapped
# fare zones (no adjustment). None means the admin hasn't verified a zone yet.
Zone = Literal[1, 2, 3, 4, 5, 6]
_ALLOWED_ZONES: set[int] = {1, 2, 3, 4, 5, 6}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Shop(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(min_length=1, max_length=80)
    address: str = Field(default="", max_length=200)
    postcode: str = Field(default="", max_length=16)
    phone: str = Field(default="", max_length=24)
    # None until the master verifies the TfL zone; "outside" when the shop is outside Z1–6.
    zone: Zone | None = None
    nearest_station: str = Field(default="", max_length=80)
    outside_zones: bool = False
    needs_zone_review: bool = False  # true for boundary stations the seed couldn't pin
    disabled: bool = False  # soft-delete so existing items referencing this shop still render
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ShopCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    address: str = Field(default="", max_length=200)
    postcode: str = Field(default="", max_length=16)
    phone: str = Field(default="", max_length=24)
    zone: int | None = None
    nearest_station: str = Field(default="", max_length=80)
    outside_zones: bool = False
    needs_zone_review: bool = False

    @field_validator("zone")
    @classmethod
    def _zone_in_range(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if v not in _ALLOWED_ZONES:
            raise ValueError("zone must be 1-6 or null")
        return v


class ShopUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    address: str | None = Field(default=None, max_length=200)
    postcode: str | None = Field(default=None, max_length=16)
    phone: str | None = Field(default=None, max_length=24)
    zone: int | None = None  # pass null to clear; serialiser can't distinguish "not sent" from "null" so we always treat as a write
    nearest_station: str | None = Field(default=None, max_length=80)
    outside_zones: bool | None = None
    needs_zone_review: bool | None = None
    disabled: bool | None = None

    @field_validator("zone")
    @classmethod
    def _zone_in_range(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if v not in _ALLOWED_ZONES:
            raise ValueError("zone must be 1-6 or null")
        return v


class PricingRules(BaseModel):
    """Single, versioned document in `pricing_rules`. Only one row at a time; master edits bump
    the version. Percentages are expressed as negatives, e.g. -5 means take 5% off the base."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    version: int = 1
    # Keyed by stringified zone number plus "outside". Values are percentage adjustments
    # (negatives = discount). Spec defaults: Z1 0, Z2 -5, Z3 -10, Z4 -15, Z5 -20, Z6 -25,
    # unmapped/outside 0.
    adjustments: dict[str, float] = Field(
        default_factory=lambda: {
            "1": 0.0,
            "2": -5.0,
            "3": -10.0,
            "4": -15.0,
            "5": -20.0,
            "6": -25.0,
            "outside": 0.0,
        }
    )
    updated_at: datetime = Field(default_factory=_now)
    updated_by: str = ""


class PricingRulesUpdate(BaseModel):
    adjustments: dict[str, float]

    @field_validator("adjustments")
    @classmethod
    def _keys_and_bounds(cls, v: dict[str, float]) -> dict[str, float]:
        allowed = {"1", "2", "3", "4", "5", "6", "outside"}
        if set(v.keys()) - allowed:
            raise ValueError(f"adjustments may only contain keys {sorted(allowed)}")
        for key, pct in v.items():
            # Cap to +/- 100% so a slip of the finger can't zero or double every price.
            if not (-100.0 <= float(pct) <= 100.0):
                raise ValueError(f"adjustment for {key} must be between -100 and 100")
        return {k: float(pct) for k, pct in v.items()}


class PricingLedgerEntry(BaseModel):
    """Audit row written every time a backend-computed price is persisted on an item."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_id: str
    shop_id: str | None
    shop_name: str | None
    zone: int | str | None  # 1-6, "outside", or null when the shop has no mapped zone
    base_price: float  # pre-adjustment, pre-£1-round
    adjustment_percent: float
    final_price: float  # rounded to the nearest £1 when an adjustment applied, else = base
    rule_version: int
    actor: str = ""
    reason: str = ""  # e.g. "create", "update:location", "update:price"
    created_at: datetime = Field(default_factory=_now)


class PriceAdjustmentPreview(BaseModel):
    base_price: float
    adjusted_price: float
    adjustment_percent: float
    zone: int | str | None
    rule_version: int
    shop_id: str | None = None
    shop_name: str | None = None
