// Mirrors backend/models/appraisal.py — keep the two in sync in the same edit.
export interface Appraisal {
  title: string;
  brand: string;
  category: string;
  description: string;
  condition: string;
  is_electrical: boolean;
  price_source: string; // "charity" | "peak" | "custom" — how the tag price was chosen
  peak_retail_price: number;
  market_average_price: number;
  recommended_price: number;
  currency: string;
  confidence: string;
  rationale: string;
  resale_blurb: string; // Gemini-drafted eBay/Vinted listing description
}

export interface InventoryItem extends Appraisal {
  id: string;
  sku: string;
  pat_passed: boolean; // true once an electrical item has passed its PAT safety test
  item_image: string | null;
  label_image: string | null;
  extra_images: string[];
  giftaid_ref: string | null;
  location: string | null;
  size: string | null; // clothing/shoe size label, e.g. "M (UK 10)"
  status: string; // "available" | "sold"
  sold_price: number | null;
  sold_giftaid_ref: string | null;
  sold_at: string | null;
  created_at: string;
}

export interface InventoryStats {
  total_items: number;
  available_items: number;
  sold_items: number;
  week_start: string;
  week_raised: number;
  week_sold_count: number;
  all_time_raised: number;
  potential_value: number;
}

export interface SessionInfo {
  authenticated: boolean;
  username: string | null;
  is_master: boolean;
  shop: string;
  color?: string | null; // roster tile colour
  avatar?: string | null; // roster tile photo (base64 data URL)
  token?: string | null; // raw session token — only returned to native (Bearer) clients on login
  csrf?: string | null; // CSRF double-submit token echoed in-body for cookie-restricted iframes
}

export interface RosterEntry {
  username: string;
  color: string;
  avatar: string | null;
}

export interface StaffMember {
  id: string | null;
  username: string;
  color: string;
  avatar: string | null;
  created_at: string | null;
}

export interface Roster {
  volunteers: RosterEntry[];
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  item_id: string | null;
  item_title: string | null;
  item_sku: string | null;
  details: Record<string, unknown> | null;
}

export const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);

// Fixed appraisal categories — mirror of backend CATEGORIES in routers/appraise.py.
export const CATEGORIES = [
  "Books",
  "Children",
  "Homewear",
  "Jewellery",
  "Media (DVD/CD)",
  "Men's accessories",
  "Men's blazers",
  "Men's shirts",
  "Men's shoes",
  "Men's suits",
  "Men's trousers",
  "Women's accessories",
  "Women's dresses",
  "Women's jackets/coats",
  "Women's knitwear",
  "Women's shoes",
  "Women's skirts",
  "Women's tops",
  "Women's trousers",
] as const;

// Combined size labels: each option shows all systems on one line so volunteers tap whichever
// system is on the garment label (UK number, alpha, EU, collar/waist/chest). The selected string
// is stored and printed verbatim on the tag.
export const WOMENS_SIZES = [
  "UK 4 · XS · EU 32",
  "UK 6 · XS · EU 34",
  "UK 8 · S · EU 36",
  "UK 10 · M · EU 38",
  "UK 12 · M · EU 40",
  "UK 14 · L · EU 42",
  "UK 16 · XL · EU 44",
  "UK 18 · XL · EU 46",
  "UK 20 · XXL · EU 48",
] as const;

// Women's / unisex shoes: UK → EU mapping.
export const WOMENS_SHOE_SIZES = [
  "UK 4 · EU 37",
  "UK 5 · EU 38",
  "UK 6 · EU 39",
  "UK 7 · EU 40",
  "UK 8 · EU 42",
  "UK 9 · EU 43",
  "UK 10 · EU 44",
  "UK 11 · EU 45",
  "UK 12 · EU 46",
  "UK 13 · EU 47",
] as const;

// Men's shirts — collar-led (inches) aligned to alpha + EU.
export const MENS_SHIRT_SIZES = [
  'XS · 14" · EU 36',
  'S · 14.5" · EU 37',
  'M · 15.5" · EU 39',
  'L · 16.5" · EU 42',
  'XL · 17.5" · EU 44',
  'XXL · 18.5" · EU 46',
] as const;

// Men's trousers — waist (W) led aligned to alpha + EU.
export const MENS_TROUSER_SIZES = [
  "W28 · S · EU 44",
  "W30 · S · EU 46",
  "W32 · M · EU 48",
  "W34 · L · EU 50",
  "W36 · L · EU 52",
  "W38 · XL · EU 54",
  "W40 · XXL · EU 56",
] as const;

// Men's suits & blazers — chest-led (regular fit) aligned to alpha + EU.
export const MENS_SUIT_SIZES = [
  "34R · XS · EU 44",
  "36R · S · EU 46",
  "38R · M · EU 48",
  "40R · L · EU 50",
  "42R · XL · EU 52",
  "44R · XXL · EU 54",
  "46R · XXL · EU 56",
] as const;

// Men's shoes — UK → EU (men's EU runs higher than women's for the same UK number, so kept separate).
export const MENS_SHOE_SIZES = [
  "UK 6 · EU 40",
  "UK 7 · EU 41",
  "UK 8 · EU 42",
  "UK 9 · EU 43",
  "UK 10 · EU 44",
  "UK 11 · EU 45",
  "UK 12 · EU 46",
  "UK 13 · EU 47",
] as const;

// Union of every current size label, de-duplicated — fuels the inventory filter dropdown.
// Women's and men's shoes share identical "UK N · EU M" labels for the overlapping UK 8-13 rows,
// so collapsing them avoids React duplicate-key warnings in the filter <Select>.
export const ALL_SIZES = Array.from(
  new Set<string>([
    ...WOMENS_SIZES,
    ...WOMENS_SHOE_SIZES,
    ...MENS_SHIRT_SIZES,
    ...MENS_TROUSER_SIZES,
    ...MENS_SUIT_SIZES,
    ...MENS_SHOE_SIZES,
  ]),
);

// Returns the size dropdown config for a category, or null if the category has no size.
export function sizeOptionsFor(
  category: string,
): { kind: "clothing" | "shoe"; label: string; options: readonly string[] } | null {
  switch (category) {
    case "Women's tops":
    case "Women's knitwear":
    case "Women's skirts":
    case "Women's trousers":
    case "Women's dresses":
    case "Women's jackets/coats":
    case "Children":
      return { kind: "clothing", label: "Size", options: WOMENS_SIZES };
    case "Women's shoes":
      return { kind: "shoe", label: "Shoe size (UK · EU)", options: WOMENS_SHOE_SIZES };
    case "Men's shirts":
      return { kind: "clothing", label: "Collar (alpha · inches · EU)", options: MENS_SHIRT_SIZES };
    case "Men's trousers":
      return { kind: "clothing", label: "Waist (W · alpha · EU)", options: MENS_TROUSER_SIZES };
    case "Men's suits":
    case "Men's blazers":
      return { kind: "clothing", label: "Chest (alpha · UK · EU)", options: MENS_SUIT_SIZES };
    case "Men's shoes":
      return { kind: "shoe", label: "Shoe size (UK · EU)", options: MENS_SHOE_SIZES };
    default:
      return null;
  }
}

// Tones the Tag-page "redraft listing" action can request (mirror of backend BLURB_TONES).
export const BLURB_TONES = [
  { id: "warm", label: "Warm" },
  { id: "concise", label: "Concise" },
  { id: "luxury", label: "Luxury" },
  { id: "playful", label: "Playful" },
] as const;

// Volunteer-selectable item condition (mirror of backend condition labels) and the multiplier
// applied to the base charity price for each grade.
export const CONDITION_OPTIONS = [
  "New with tags",
  "New without tags",
  "Excellent",
  "Very good",
  "Good",
  "Fair",
  "Poor/for repair",
] as const;

export const CONDITION_MULTIPLIERS: Record<string, number> = {
  "New with tags": 1,
  "New without tags": 0.98,
  Excellent: 0.95,
  "Very good": 0.9,
  Good: 0.85,
  Fair: 0.65,
  "Poor/for repair": 0.45,
};

// The 100%-condition charity "guide" price derived from the appraisal, mirroring the backend:
// the typical market price capped at 50% of RRP, rounded to the nearest 50p. Used to re-price an
// item from its condition grade in the edit dialog.
export function charityGuidePrice(peakRetail: number, marketAverage: number): number {
  const avg = marketAverage > 0 ? marketAverage : Math.round(peakRetail * 0.4 * 100) / 100;
  const base = peakRetail > 0 ? Math.min(avg, peakRetail * 0.5) : avg;
  return Math.round(base * 2) / 2;
}

// Charity price adjusted for the chosen condition: multiplier applied first, then rounded to the
// nearest 50p for a tidy tag. Falls back to the "Good" multiplier for any unknown grade.
export function adjustedCharityPrice(base: number, condition: string): number {
  const m = CONDITION_MULTIPLIERS[condition] ?? CONDITION_MULTIPLIERS.Good;
  return Math.round(base * m * 2) / 2;
}

// Shop branch locations, alphabetical. Legacy fallback for the dropdowns on first render —
// the live list is read from /api/shops via `useShops()`, which includes zone + review flags.
export const LOCATIONS = [
  "Askew Road",
  "Brompton Road",
  "Chiswick High Road",
  "Ealing",
  "Finchley Road",
  "Fulham Road",
  "Hampstead",
  "Kentish Town",
  "King's Road",
  "Olympia",
  "South Kensington",
  "Tooting",
  "Victoria",
  "West Hampstead",
] as const;

// Mirror of backend models/shop.py — kept hand-authored per the typed-fetch boundary.
export interface Shop {
  id: string;
  name: string;
  address: string;
  postcode: string;
  phone: string;
  zone: number | null;
  nearest_station: string;
  outside_zones: boolean;
  needs_zone_review: boolean;
  disabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PricingRules {
  id: string;
  version: number;
  adjustments: Record<string, number>; // keys: "1".."6" and "outside"
  updated_at: string;
  updated_by: string;
}

export interface PriceAdjustmentPreview {
  base_price: number;
  adjusted_price: number;
  adjustment_percent: number;
  zone: number | string | null;
  rule_version: number;
  shop_id: string | null;
  shop_name: string | null;
}

// Roster tile colours — pastels that read well on the obsidian theme. Mirror of backend AVATAR_COLORS.
export const AVATAR_COLORS = [
  "#D9B48F",
  "#E0A5A5",
  "#A5C7E0",
  "#A8D5B5",
  "#C9A9E0",
  "#E0C99A",
  "#9AD7D0",
  "#E0AEC4",
] as const;
