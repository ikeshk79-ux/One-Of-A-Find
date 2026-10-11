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
  "Men's general",
  "Women's accessories",
  "Women's dresses",
  "Women's jackets/coats",
  "Women's knitwear",
  "Women's shoes",
  "Women's skirts",
  "Women's tops",
  "Women's trousers",
] as const;

// Categories that take an alpha clothing size (XXS–XXL). "Women's shoes" uses shoe sizes; all other
// categories (accessories, homewear, books, media, jewellery) have no size.
export const CLOTHING_SIZE_CATEGORIES = [
  "Women's tops",
  "Women's knitwear",
  "Women's skirts",
  "Women's trousers",
  "Women's dresses",
  "Women's jackets/coats",
  "Children",
] as const;

// Men's general uses letter sizes XXS–XXXL only (no numeric equivalent).
export const MENS_SIZE_CATEGORY = "Men's general";
export const MENS_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

export const SHOE_SIZE_CATEGORY = "Women's shoes";

// Alpha size with its approximate UK number (stored as-is and printed on the tag).
export const CLOTHING_SIZES = [
  "XXS (UK 4)",
  "XS (UK 6)",
  "S (UK 8)",
  "M (UK 10)",
  "L (UK 12)",
  "XL (UK 14)",
  "XXL (UK 16)",
] as const;

// UK shoe size with its approximate European equivalent.
export const SHOE_SIZES = [
  "UK 4 (EU 37)",
  "UK 5 (EU 38)",
  "UK 6 (EU 39)",
  "UK 7 (EU 40)",
  "UK 8 (EU 42)",
  "UK 9 (EU 43)",
  "UK 10 (EU 44)",
  "UK 11 (EU 45)",
  "UK 12 (EU 46)",
  "UK 13 (EU 47)",
] as const;

// Returns the size dropdown config for a category, or null if the category has no size.
export function sizeOptionsFor(
  category: string,
): { kind: "clothing" | "shoe"; label: string; options: readonly string[] } | null {
  if (category === SHOE_SIZE_CATEGORY)
    return { kind: "shoe", label: "Shoe size", options: SHOE_SIZES };
  if (category === MENS_SIZE_CATEGORY)
    return { kind: "clothing", label: "Size", options: MENS_SIZES };
  if ((CLOTHING_SIZE_CATEGORIES as readonly string[]).includes(category))
    return { kind: "clothing", label: "Size", options: CLOTHING_SIZES };
  return null;
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

// Shop branch locations, alphabetical. Used on the appraisal card and the inventory filter.
export const LOCATIONS = [
  "Askew Road",
  "Brompton Road",
  "Chiswick",
  "Ealing",
  "Finchley",
  "Fulham Road",
  "Kentish Town",
  "King's Road",
  "Olympia",
  "South Kensington",
  "Tooting",
  "Victoria",
  "West Hampstead",
] as const;

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
