import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field, model_validator


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Guards against oversized/too-many base64 images (storage bloat, Mongo's 16 MB doc cap, AI cost).
MAX_IMAGE_CHARS = 4_000_000  # ~3 MB decoded per image
MAX_EXTRA_IMAGES = 6
MAX_TOTAL_IMAGE_CHARS = 12_000_000  # keeps the stored inventory doc well under 16 MB


def _check_images(primary: list[str | None], extra: list[str]) -> None:
    if len(extra) > MAX_EXTRA_IMAGES:
        raise ValueError(f"Too many detail photos (max {MAX_EXTRA_IMAGES})")
    total = 0
    for img in [*primary, *extra]:
        if not img:
            continue
        if len(img) > MAX_IMAGE_CHARS:
            raise ValueError("An image is too large (max ~3 MB each)")
        total += len(img)
    if total > MAX_TOTAL_IMAGE_CHARS:
        raise ValueError("Combined image payload is too large")


class AppraiseRequest(BaseModel):
    item_image: str  # data URL or raw base64 of the item photo
    label_image: str | None = None  # data URL or raw base64 of the brand label
    extra_images: list[str] = []  # detail shots: damage, hallmarks, wear
    notes: str | None = Field(default=None, max_length=2000)  # bounded to cap AI cost/DoS

    @model_validator(mode="after")
    def _validate_images(self):
        _check_images([self.item_image, self.label_image], self.extra_images)
        return self


class Appraisal(BaseModel):
    title: str
    brand: str
    category: str
    description: str
    condition: str
    is_electrical: bool = False  # AI-flagged electrical item needing a PAT test before resale
    price_source: str = "charity"  # how the tag price was chosen: "charity" | "peak" | "custom"
    peak_retail_price: float
    market_average_price: float
    recommended_price: float
    currency: str = "GBP"
    confidence: str
    rationale: str
    resale_blurb: str = ""  # Gemini-drafted eBay/Vinted listing description


class InventoryCreate(BaseModel):
    appraisal: Appraisal
    item_image: str | None = None
    label_image: str | None = None
    extra_images: list[str] = []
    giftaid_ref: str | None = None
    location: str | None = None
    size: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def _validate_images(self):
        _check_images([self.item_image, self.label_image], self.extra_images)
        return self


class InventoryItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku: str
    title: str
    brand: str
    category: str
    description: str
    condition: str
    peak_retail_price: float
    market_average_price: float
    recommended_price: float
    currency: str = "GBP"
    confidence: str
    rationale: str
    resale_blurb: str = ""  # Gemini-drafted eBay/Vinted listing description
    is_electrical: bool = False  # electrical item that needs a PAT test before it can be tagged
    pat_passed: bool = False  # ticked once the electrical item has passed its PAT safety test
    price_source: str = "charity"  # how the tag price was chosen: "charity" | "peak" | "custom"
    item_image: str | None = None
    label_image: str | None = None
    extra_images: list[str] = []
    giftaid_ref: str | None = None
    location: str | None = None
    size: str | None = None  # clothing/shoe size label, e.g. "M (UK 10)" or "UK 6 (EU 39)"
    status: str = "available"  # "available" | "sold"
    sold_price: float | None = None
    sold_giftaid_ref: str | None = None  # gift aid number the sale was allocated to
    sold_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)


class SellRequest(BaseModel):
    sold: bool = True
    sold_price: float | None = None


class ItemUpdate(BaseModel):
    category: str | None = None
    location: str | None = None
    title: str | None = None
    recommended_price: float | None = None
    price_source: str | None = None  # "charity" | "peak" | "custom"
    size: str | None = None  # "" clears the size; a value sets it
    condition: str | None = None  # one of the known condition grades
    giftaid_ref: str | None = None  # digits only; "" clears it
    pat_passed: bool | None = None  # marks an electrical item as having passed its PAT test
    is_electrical: bool | None = None  # volunteer override of the AI electrical flag


# Tones the resale-listing redraft can be requested in (mirror of frontend BLURB_TONES).
BLURB_TONES = ("warm", "concise", "luxury", "playful")


class BlurbRequest(BaseModel):
    tone: str = "warm"

    @model_validator(mode="after")
    def _validate_tone(self):
        if self.tone not in BLURB_TONES:
            raise ValueError("Unknown tone")
        return self


class InventoryStats(BaseModel):
    total_items: int
    available_items: int
    sold_items: int
    week_start: str
    week_raised: float
    week_sold_count: int
    all_time_raised: float
    potential_value: float


# Avatar palette (pastels that read well on the obsidian theme) — mirror of frontend AVATAR_COLORS.
AVATAR_COLORS = [
    "#D9B48F",
    "#E0A5A5",
    "#A5C7E0",
    "#A8D5B5",
    "#C9A9E0",
    "#E0C99A",
    "#9AD7D0",
    "#E0AEC4",
]
MAX_AVATAR_CHARS = 2_000_000  # ~1.5 MB base64; avatars are shrunk client-side


def default_avatar_color(username: str) -> str:
    return AVATAR_COLORS[sum(username.encode()) % len(AVATAR_COLORS)]


def _validate_color(color: str | None) -> None:
    if color is not None and color not in AVATAR_COLORS:
        raise ValueError("Unknown colour")


def _validate_avatar(avatar: str | None) -> None:
    if not avatar:
        return
    if len(avatar) > MAX_AVATAR_CHARS:
        raise ValueError("Avatar image is too large")
    if not avatar.startswith("data:image/"):
        raise ValueError("Avatar must be an image")


class RegisterRequest(BaseModel):
    shop_password: str
    username: str
    pin: str
    color: str | None = None
    avatar: str | None = None

    @model_validator(mode="after")
    def _validate_profile(self):
        _validate_color(self.color)
        _validate_avatar(self.avatar)
        return self


class ProfileUpdate(BaseModel):
    color: str | None = None
    avatar: str | None = None  # "" clears the photo; None leaves it unchanged

    @model_validator(mode="after")
    def _validate_profile(self):
        _validate_color(self.color)
        _validate_avatar(self.avatar)
        return self


class StaffMember(BaseModel):
    id: str | None = None
    username: str
    color: str
    avatar: str | None = None
    created_at: datetime | None = None


class StaffUpdate(BaseModel):
    new_username: str | None = None
    color: str | None = None
    avatar: str | None = None

    @model_validator(mode="after")
    def _validate_profile(self):
        _validate_color(self.color)
        _validate_avatar(self.avatar)
        return self


class PinReset(BaseModel):
    pin: str


class StaffCreate(BaseModel):
    username: str
    pin: str
    color: str | None = None
    avatar: str | None = None

    @model_validator(mode="after")
    def _validate_profile(self):
        _validate_color(self.color)
        _validate_avatar(self.avatar)
        return self


class LoginRequest(BaseModel):
    username: str
    pin: str


class SessionInfo(BaseModel):
    authenticated: bool
    username: str | None = None
    is_master: bool = False
    shop: str = "One Of A Find"
    color: str | None = None  # roster tile colour
    avatar: str | None = None  # roster tile photo (base64 data URL), optional
    token: str | None = None  # raw session token, returned only to native (Bearer) clients on login
    csrf: str | None = None  # CSRF double-submit token echoed in-body for cookie-restricted iframes


class RosterEntry(BaseModel):
    username: str
    color: str
    avatar: str | None = None


class Roster(BaseModel):
    # Volunteer tiles for the till lock screen (master excluded).
    volunteers: list[RosterEntry]


class RosterUnlock(BaseModel):
    # Shared shop password that gates the till roster so staff names/photos aren't public.
    shop_password: str


class ActivityDeleteRequest(BaseModel):
    # Master-selected activity-log entry ids to purge.
    ids: list[str]


class ActivityEntry(BaseModel):
    id: str
    timestamp: datetime
    username: str
    action: str
    item_id: str | None = None
    item_title: str | None = None
    item_sku: str | None = None
    details: dict | None = None
