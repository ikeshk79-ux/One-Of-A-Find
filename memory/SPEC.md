# One Of A Find — Spec

## Forest Thrift Vision (visual overhaul — this fork)
Default visual language is **Forest Thrift Vision**: forest-green (`#123C35`), cream background
(`#FAF7F0`), sage accents (`#DCE9DF`), terracotta (`#D96C4F`). Typography is **Inter Variable**
(Manrope fallback), with Space Grotesk reserved for display accents only. The dark variant uses
`#101816 / #18211E / #F5F7F5 / #A8B4AF`. Legacy **Obsidian** (dark cinematic gold-on-black) and
**Sunroom** (cream/mustard) themes are retained and switchable from `/more` — no previous theme
choice is unreachable. Design tokens live in `src/design-system/{colors,spacing,radius,typography}.ts`;
CSS variables in `src/index.css` are the runtime source of truth (`:root` is the light default,
`.dark` is the dark variant, `.theme-obsidian` and `.theme-sunroom` opt in to the legacy palettes).

### Navigation shell (mobile + desktop)
Four tabs — **Home / Scan / Finds / More** — rendered in a top nav on desktop and a bottom tab bar
on mobile with Scan floating as a large central circular CTA. All legacy URLs (`/inventory`,
`/activity`, `/volunteers`, `/tag/:id`, `/print-tags`) remain routable — no bookmark breaks.

### New pages
- `pages/Home.tsx` — hero "What have you found today?", **quick-find bar** (the same
  `QuickFind` component as Finds, `testidPrefix="home-find"`) so staff can look an item up or scan a
  tag straight from the landing screen, large tap-to-scan card, weekly/all-time
  value tiles sourced from `GET /inventory/stats`, Recent finds list (first 5 from `GET /inventory`).
- `pages/Scan.tsx` — thin wrapper around the existing `Appraise` component (same `POST /api/appraise`
  flow, same `CameraCapture` dialog — camera-only, no file-upload path has ever existed).
- `pages/Finds.tsx` — card grid over `GET /inventory`; **quick-find** search box
  (`components/common/QuickFind.tsx`): typeahead dropdown of up to 6 matches on title/brand/category/SKU
  (prefix hits first) — tap or press Enter to jump straight to `/tag/:id`; arrow-key navigation; when the
  box is empty it lists the last 4 **recently opened** items (ids kept in `localStorage` under
  `recent-items` by `lib/recentItems.ts`, written from `TagPage`); a scan button opens `BarcodeScanner`
  and resolves the tag's barcode/QR via `lib/scan.ts` → `resolveScannedCode()` (QR deep-link `/tag/<uuid>`
  or SKU through `GET /inventory/lookup?sku=`, shared with `/inventory`). Status filter (`all / available
  / sold / PAT pending`); mobile users jump to `/inventory` for the full admin view.
- `pages/More.tsx` — settings hub: profile (reuses `/auth/profile` PATCH), branch via
  `LocationSwitcher`, theme picker (forest-light/forest-dark/obsidian/sunroom), shortcuts, master-only
  entries to `/activity` and `/volunteers`, Help, About, Sign out.

### Common primitives
Under `src/components/common/`: `SectionHeader`, `ValueDisplay`, `ConfidenceBadge`, `LoadingCard`,
`EmptyState`, `ErrorState`, `BottomNavigation`, `CameraFrame`. Every interactive element meets the
48 px touch-target rule (`.touch-target` utility).

### What did NOT change
Pydantic models, FastAPI routers, CSRF/CORS middleware, `CameraCapture` capture pipeline,
`lib/api.ts`, `lib/session.ts`, `BarcodeScanner`, `PriceTag`, `/demo/*` previews, master credentials.

---

## Original spec

AI appraisal terminal for charity shops. Volunteers photograph a donated item + its brand
label; Gemini 3 Flash (via Emergent LLM key) identifies it and estimates GBP pricing. The
recommended charity price = the typical second-hand market price (`market_average_price`), capped at
50% of the original RRP and rounded to the nearest 50p (computed server-side in routers/appraise.py;
previously `market_average_price * 1.15`). On the appraisal panel the volunteer then picks the item's
**condition** from a dropdown (New with tags 100% · Excellent 95% · Good 85% · Fair 65%); the chosen
grade's multiplier is applied to that server base and re-rounded to the nearest 50p (frontend
`adjustedCharityPrice` in lib/types.ts), recalculating the "Charity price" tile and tag price live.
The chosen condition is saved onto the inventory item. Each appraisal also returns a
`resale_blurb` — a ready-to-paste eBay/Vinted listing description drafted by Gemini in the same call,
stored on the item.

### Categories & sizing (2026-10-12)
Appraisal **categories** split menswear into dedicated sub-categories — `Men's shirts`, `Men's trousers`,
`Men's suits`, `Men's blazers`, `Men's shoes` (plus `Men's accessories` for ties/belts/wallets).
The legacy catch-all `Men's general` was retired; existing items were migrated to `Men's shirts`
via `backend/migrate_sizes.py` (idempotent, re-runnable). Women's categories unchanged.

**Sizing**: one aligned dropdown per category, each row showing every system on one line so the
volunteer taps whichever is on the garment label:
- Women's clothing / Children: `UK 4 · XS · EU 32` … `UK 20 · XXL · EU 48`
- Women's shoes: `UK 4 · EU 37` … `UK 13 · EU 47`
- Men's shirts (collar-led): `XS · 14" · EU 36` … `XXL · 18.5" · EU 46`
- Men's trousers (waist-led): `W28 · S · EU 44` … `W40 · XXL · EU 56`
- Men's suits / blazers (chest-led, R fit): `34R · XS · EU 44` … `46R · XXL · EU 56`
- Men's shoes (men's UK→EU runs higher than women's for the same UK number): `UK 6 · EU 40` … `UK 13 · EU 47`

The lists live in `frontend/src/lib/types.ts` (`WOMENS_SIZES`, `WOMENS_SHOE_SIZES`,
`MENS_SHIRT_SIZES`, `MENS_TROUSER_SIZES`, `MENS_SUIT_SIZES`, `MENS_SHOE_SIZES`, plus `ALL_SIZES`
union for the inventory filter). The frontend `sizeOptionsFor(category)` returns `{kind,label,options}`,
unchanged shape — every consumer (`Appraise`, `TagPage`, `Inventory`) picks it up without any UI
rework. Backend `routers/appraise.py` mirrors the CATEGORIES list and the appraisal prompt hints the
model to pick the specific menswear sub-category instead of a catch-all.

## Appraisal response parsing (grounded Gemini)
`POST /api/appraise` runs Gemini 3 Flash **with Google Search grounding**, which sometimes makes the
model wrap its JSON in citation prose or code fences. `_parse_appraisal()` in
`routers/appraise.py` strips fences, then tries a brace-span slice, then a balanced-brace scan. If the
grounded reply still yields no JSON object the route retries **once ungrounded** before returning 502
("AI returned an unreadable response"). A grounded call that *throws* also retries ungrounded.

## Electrical items & PAT gate
During appraisal Gemini flags likely electrical appliances (`is_electrical`); the Appraise panel shows
an "Electrical item" toggle the volunteer can override, saved onto the item. On the Tag page an
electrical item shows a PAT banner and the "Print tag" button is disabled until a volunteer ticks
"PAT test passed" (PATCH `/inventory/{id}` with `pat_passed:true`). `is_electrical` and `pat_passed`
live on InventoryItem; the printed tag shows the condition and its price-adjustment % of guide.
The inventory grid shows a red "PAT required" badge on electrical items until they pass. Ticking
"PAT test passed" records a dedicated `pat_tested` entry in the activity log (actor + timestamp +
pass/clear), shown on the master-only Activity page.

## Bulk tag printing
The Inventory page has a "Print tags" selection mode: tapping cards (or "Select visible") picks items,
a sticky bar shows the count, and "Print N tags" opens `/print-tags?ids=…` (PrintTags.tsx) which
renders every selected tag in a `.print-tags-grid` laid out two-per-row on A4 (`@page size:A4`) with
`break-inside:avoid`. PAT-blocked electrical items can't be selected and are skipped from the sheet.

## Auth (individual accounts + master)
Each volunteer has their own account: username + PIN (new PINs >=6 chars; existing 4-char PINs still
work at login). Registration requires the shared
shop password (`SHOP_PASSWORD` in .env, `oneofafind`) as a gate, then creates the account and logs
in. Login is username + PIN. PINs are pbkdf2-hashed in the `users` collection. Sessions are random
opaque tokens in the `sessions` collection (14-day TTL) set as an httpOnly + Secure cookie
`ooaf_session`, carrying `username` + `is_master`. Routes: `POST /api/auth/register`,
`POST /api/auth/login`, `GET /api/auth/me` (-> {authenticated, username, is_master}),
`POST /api/auth/logout`. `require_session` returns the session; `require_master` gates master-only
routes (403 otherwise).

Brute-force lockout: `/api/auth/login` counts failed attempts per username in the `login_attempts`
collection. After 5 failures within a 15-minute rolling window the username is locked for 15 minutes
(returns 429 with a "Try again in N minutes." message + `Retry-After` header); attempts while locked
don't extend it, and any successful login clears the counter. `verify_pin` returns False (never 500)
on a malformed stored hash. Helpers live in `backend/lib/auth.py`.

Shop-password gate (SEC hardening): the shared shop password (`SHOP_PASSWORD`) has NO built-in
default — if it is unset, `/api/auth/register` and `/api/auth/roster` fail closed (503 / refuse)
rather than accepting a well-known value. Both endpoints are throttled per client IP via the
`shop_attempts` collection (10 wrong shop-password attempts in 15 min → 15-min 429 lock; a correct
attempt clears it). Logout is no longer CSRF-exempt.

Gift Aid refs (`giftaid_ref`, `sold_giftaid_ref`) are visible to ALL volunteers (no longer redacted):
the Gift Aid number prints on the price tag and rides in the barcode/QR payload. `_SENSITIVE_FIELDS`
is now empty, so `routers/inventory.py:_redact` is a no-op. The donor-name field has been removed
entirely — no `donor_name` on any model, API, or UI. The shop-gate IP
throttle keys on the LAST (trusted-proxy) X-Forwarded-For hop, not the first, to resist spoofing. Gift Aid numbers are DIGITS-ONLY in the UI
(the appraisal field and the Tag "Edit details" dialog strip non-digits live) and digit-filtered
server-side; the edit dialog can add, change, or clear (`giftaid_ref:""`) the Gift Aid number on any
existing item.

## Security audit (accepted-risk log)
Last audit: CONDITIONAL PASS — no critical/high. Auth is sound (PBKDF2 100k+salt PINs, TTL Mongo
sessions, httpOnly cookie token, CSRF double-submit on cookie mutations, master gates on staff +
activity bulk-delete, fail-closed shop-password gate). One MEDIUM (SEC-001): `giftaid_ref`/
`sold_giftaid_ref` are visible to all volunteers and printed in plaintext + barcode/QR on tags
(`_SENSITIVE_FIELDS=()`). OWNER-ACCEPTED as intended (Gift Aid on tag was an explicit request) — do
NOT silently revert; only gate to master if the owner later flags donor references as identifying.
Documented P3 hardening backlog (NOT yet done): (1) CORS reflects any origin with credentials —
mitigated by SameSite=lax + CSRF, but replace `.*` with an explicit allowlist; (2) per-username login
lockout enables targeted lockout DoS — consider IP+username keying; (3) no per-branch ownership model
on inventory mutate/delete — acceptable for a single trusted chain. RESOLVED this pass: the
create path (`POST /api/inventory`) now allowlists `location` against `LOCATIONS` (422 on unknown),
mirroring the edit path.

Master (admin) account: seeded at startup from env `ADMIN_USERNAME` (`master`) / `ADMIN_PASSWORD`.
Only the master sees the Activity + Staff/Volunteers nav links + their pages.

### Staff/Volunteers management (master-only)
`/volunteers` page (`frontend/src/pages/Staff.tsx`), gated to the master, backed by a master-only
router `backend/routers/staff.py` (prefix `/api/staff`, all endpoints `require_master`):
- `GET /api/staff` -> list volunteers (`StaffMember`: id, username, color, avatar, created_at).
- `POST /api/staff` {username, pin, color?, avatar?} -> master creates a volunteer directly, no shop
  password gate (422 bad name / short PIN, 409 taken).
- `PATCH /api/staff/{username}` {new_username?, color?, avatar?} -> rename and/or recolour/rephoto.
  A rename also updates `sessions.username` (active sessions stay valid) and rewrites
  `activity.username` so past audit entries show the new name (422 bad name, 409 taken).
- `PATCH /api/staff/{username}/pin` {pin} -> reset a forgotten PIN (min 6); revokes the volunteer's
  existing sessions so a reset forces re-login.
- `DELETE /api/staff/{username}` -> remove the account + delete their sessions (past activity is
  kept). The master account itself cannot be managed here (403).

### Lock screen (till roster)
The roster is **gated by the shared shop password** (no longer public): the lock screen first shows
an **Unlock this till** step. `POST /api/auth/roster {shop_password}` validates the password and
returns volunteer tiles — `{username, color, avatar}` — (master excluded); the entered password is
held in memory only (never persisted), so the tiles show for the current SPA session and a fresh
page load re-shows the unlock step. Once unlocked, tapping a name
opens an on-screen numeric **keypad** to enter the PIN (min 4), then logs in. A wrong PIN clears the
entry and shakes the keypad (`animate-shake` in index.css) so a mistype is obvious at the till.
"Manager sign in" / "Sign in another way" opens the typed username+PIN form (used for the master
account or names not on the roster), and "Create an account" opens registration. All five states
(`unlock` / `roster` / `pin` / `signin` / `register`) live in `frontend/src/pages/Lock.tsx`.

### Clothing / shoe size (appraisal + inventory)
A size dropdown appears in TWO places on the appraisal screen — a "Category & size" selector in
Step 01 (before appraisal, so a size can be set up-front) AND on the Step 02 result panel — both
bound to the same `category`/`size` state (`sizeOptionsFor` in types.ts). A pre-picked size is kept
after the AI result if it's still valid for the resulting category, otherwise cleared. The Inventory
tab always shows an "All sizes" filter dropdown (full canonical list, even before any sized items
exist). Saving a clothing/shoe item with no size chosen opens a gentle "Add a size first?" dialog
(Add a size / Save without size) so nothing is filed unsized by accident. Options by category:
- Clothing categories (`CLOTHING_SIZE_CATEGORIES` in types.ts: women's tops/knitwear/skirts/trousers/
  jackets-coats, Men's general, Children) -> alpha sizes XXS..XXL each with a UK number, e.g. "M (UK 10)".
- `Women's shoes` -> UK 4..13 each with the EU size, e.g. "UK 6 (EU 39)".
- All other categories -> no size dropdown.
Size is stored as the display string on the item (`InventoryCreate.size` / `InventoryItem.size` /
`ItemUpdate.size`, max 40 chars, optional), cleared when the category changes, and printed on the
price tag next to the category. It also shows on each Inventory list card and in a "All sizes"
Inventory filter (options derived from sizes actually present), on the Tag item-record, and is
editable from the Tag "Edit details" dialog (a size dropdown appears for clothing/shoe categories,
with a "No size" option; sending `size:""` to `PATCH /api/inventory/{id}` clears it).
`sizeOptionsFor(category)` (types.ts) drives the mapping; backend mirror lives in models.

### Avatars (roster tile colour + photo)
Each volunteer has a tile `color` (one of a fixed 8-colour palette, `AVATAR_COLORS`, mirrored in
backend `models/appraisal.py` and frontend `src/lib/types.ts`) and an optional `avatar` (base64 photo
data URL — must be an `data:image/` MIME, shrunk client-side, capped ~1.5 MB). Both are set at registration (`POST /api/auth/register`
with optional `color`/`avatar`) and editable anytime via `PATCH /api/auth/profile` (auth required;
`avatar:""` clears the photo). Colour defaults deterministically from the username when unset. The
`users` collection stores `color` + `avatar`; `SessionInfo` (`/me`, login, register, profile) carries
them so the header chip and roster render consistently. Shared UI: `components/Avatar.tsx` (photo-or-
initial) and `components/AvatarPicker.tsx` (colour swatches + take/upload/remove photo, reused by the
registration form and the AppShell profile dialog).

## Activity log (master-only audit)
Every inventory write is recorded to the `activity` collection by `lib/activity.log_activity`:
logged_in (successful sign-ins, with `details.master`), created, edited (with before/after
`details.changes`), marked_sold (price + gift aid), returned_to_floor, deleted — each with timestamp,
actor username, and item title/SKU (login rows have no item).
`GET /api/activity` is master-only (403 for volunteers); the `/activity` page renders it as a table
with three client-side filters — by volunteer (derived from the log's actors), by action, and by
date range (All time / Today / Last 7 days / This month) — plus a "Clear filters" link and an
"N of M" match count. The master can also tick individual rows (or a select-all-visible header box)
and bulk-delete them via `POST /api/activity/delete {ids}` (master-only) behind a confirm dialog.

## Data model (Mongo `inventory`)
InventoryItem: id (uuid), sku (12-digit, unique — server regenerates on collision, unique index),
title, brand, category, description, condition, peak_retail_price, market_average_price,
recommended_price, currency ("GBP"), confidence, rationale, item_image, label_image,
extra_images[], giftaid_ref, location (shop branch — one of a fixed alphabetical list,
mirrored in frontend src/lib/types.ts LOCATIONS: Askew Road, Brompton Road, Chiswick, Ealing,
Finchley, Fulham Road, Kentish Town, King's Road, Olympia, South Kensington, Tooting, Victoria,
West Hampstead), status ("available"|"sold"), sold_price,
sold_giftaid_ref, sold_at, created_at. Images are base64 data URLs.

Category is one of a fixed list (backend CATEGORIES in routers/appraise.py, mirrored in
frontend src/lib/types.ts CATEGORIES): Women's tops, Women's knitwear, Women's skirts, Women's
trousers, Women's accessories, Women's jackets/coats, Women's shoes, Men's general, Men's
accessories, Homewear, Children, Books, Media (DVD/CD), Jewellery. The appraisal prompt tells
Gemini to pick one verbatim; the backend snaps any off-list value to "Homewear"; the volunteer can
override via a category dropdown on the appraisal card before saving; the inventory category filter
uses this same fixed list.

## API
- POST /api/appraise {item_image, label_image?, extra_images[], notes?} -> Appraisal
- GET/POST /api/inventory, GET/DELETE /api/inventory/{id}
- GET /api/inventory/lookup?sku=... -> InventoryItem (till barcode lookup; 404 if unknown)
- GET /api/inventory/stats -> weekly + all-time fundraising totals (week = Monday 00:00 UTC)
- PATCH /api/inventory/{id}/sell {sold, sold_price?} -> mark sold / return to floor
- PATCH /api/inventory/{id} {category?, location?, title?, recommended_price?, size?, giftaid_ref?}
  -> edit an existing item (category/location validated against fixed lists; title non-empty; price
  >= 0; size "" clears it; giftaid_ref is digit-filtered and "" clears it; 422 otherwise)
- POST /api/inventory/{id}/blurb {tone} -> Gemini re-drafts the item's resale listing (text-only) in
  a chosen tone (warm/concise/luxury/playful; 422 on unknown tone, 404 on unknown item) and persists
  it, returning the updated InventoryItem. Uses `draft_blurb` + `BLURB_SYSTEM` in routers/appraise.py.

## Session location (shop branch)
Each volunteer picks their shop branch at sign-on: a "Your shop branch" `LocationSwitcher`
(`lock-location-switcher`) on the Lock screen, backed by a small reactive store in
`lib/sessionLocation.ts` (localStorage key `ooaf-location`, defaults to `LOCATIONS[0]`, exposed via
`useSessionLocation()` + `getSessionLocation()`/`setSessionLocation()`). New appraisals default their
`location` from this store and re-sync when it changes; the per-item Shop location dropdown on the
appraisal result panel still overrides it. A **Quick Switch** copy of the same switcher sits in the
AppShell header (`header-location-switcher`) so a volunteer can change branch mid-session without
signing out — the change immediately re-files subsequent new listings. No backend change: the chosen
branch is just the default sent as `InventoryCreate.location`. The Inventory "All locations" filter is
independent of the session branch.

## Flows
1. `/` Appraise — item + label camera slots, "Detail shots" row, notes -> Appraise -> valuation;
   The camera dialog (`components/CameraCapture.tsx`) offers pinch/slider zoom and, on devices whose
   rear camera exposes the `torch` capability, a flashlight toggle (`camera-torch`) that switches the
   LED on/off via `track.applyConstraints({advanced:[{torch}]})`; it hides when unsupported and resets
   off when the dialog closes. A subtle rule-of-thirds framing grid (`camera-grid`) overlays the live
   preview to help line items up straight. The valuation panel also shows a Gemini-drafted resale
   listing draft (`resale-blurb`) with a one-tap **Copy** button (`copy-blurb-button`) — a ready-to-
   paste eBay/Vinted description generated inline by the appraisal (`Appraisal.resale_blurb`, stored
   on the item).
   optional Gift Aid reference field, plus Category and Shop location dropdowns
   (location = alphabetical branch list) -> Save & make tag.
2. `/inventory` — stats header; "Scan tag" barcode scanner (parses either a QR /tag/<id>?ga= URL
   or a "SKU*GIFTAID" CODE128 payload) that opens the item; search + category dropdown + sort
   (newest / price high→low / price low→high / category) + availability toggle; card click → /tag/:id.
   Each card has a corner expand icon (`enlarge-{id}`) that opens `ImageLightbox` — a zoomable photo
   viewer (all of the item's photos: main + label + detail shots, fetched full on demand via
   GET /api/inventory/{id}) with next/prev paging, a clickable thumbnail strip, scroll/pinch/button
   zoom (1×–5×), drag-to-pan and reset. It is reused by the Tag page gallery. The icon stops
   propagation so it never triggers the card's open-item navigation.
3. `/tag/:id` — printable tag (barcode + QR), photo gallery (click any photo to open the same
   zoom viewer), item record (incl. Category +
   Location), a **Resale listing** card (`resale-listing-card`) showing the saved `resale_blurb`
   with a Copy button (`tag-copy-blurb-button`) and one-tap **Redraft in a tone** buttons
   (`blurb-tone-{warm|concise|luxury|playful}`) that call `POST /api/inventory/{id}/blurb {tone}`
   (Gemini text-only redraft, persisted), "Edit details" dialog to correct title, recommended price, category and location on
   any item, Mark sold / Return to floor.

## Security & hardening
- `seed_master` seeds the master account ONLY when absent and a password is configured — it never
  overwrites an existing PIN (rotate by updating `ADMIN_PASSWORD`, deleting the master user doc,
  then restarting). No default admin password in code.
- CSRF: double-submit-cookie. `ooaf_csrf` (non-HttpOnly, Secure, SameSite=lax) is issued at
  login/register and bootstrapped on `/me` only when absent (never rotated mid-session, to avoid
  racing in-flight writes). Unsafe methods on `/api` must echo it as `X-CSRF-Token`; a middleware
  in server.py returns 403 on mismatch. Auth endpoints (login/register/logout) are exempt, and
  requests carrying an `Authorization: Bearer` header skip CSRF entirely (token auth is not sent
  ambiently by browsers).
- Dual auth (web + native mobile): `require_session`/`/me`/`logout` accept the session either from
  the HttpOnly `ooaf_session` cookie (web) OR an `Authorization: Bearer <token>` header (mobile),
  via `lib/auth.token_from`. Both resolve the same random opaque token in the `sessions` collection.
  `POST /api/auth/login?token=true` and `?register?token=true` additionally return the raw token in
  the response body (`SessionInfo.token`) so a native app can store it; web clients omit `?token`
  and keep using the cookie only (token stays null, so it's never exposed to browser JS).
- Security headers (server.py middleware): X-Content-Type-Options nosniff, X-Frame-Options DENY,
  Referrer-Policy no-referrer, HSTS, CSP default-src 'none'.
- Image limits (models/appraisal.py): per-image ~3 MB, max 6 detail shots, ~12 MB total; over-limit
  requests are rejected 422 on both /appraise and POST /inventory.
- Login brute-force lockout is intentionally NOT implemented (owner-accepted risk).

## Behaviour notes (correctness)
- Sold price of £0 is honoured end-to-end (giveaway/damaged): frontend sends 0 (not null), and the
  stats aggregation uses the actual `sold_price` when present so a £0 sale never inflates totals.
- Deleting an inventory item requires a confirmation dialog (no instant delete).

## Theme
Two switchable colour schemes, toggled via `components/ThemeToggle.tsx` (in the AppShell header on
every app page AND top-right of the Lock screen) and persisted in localStorage (`ooaf-theme`,
applied as a class on `<html>` by `lib/theme.ts`, initialised in main.tsx before render to avoid a
flash):
- **Obsidian** (default, dark): #0B0C0E bg, #16181C cards, #D9B48F gold.
- **Sunroom** (light): #FBF6EE cream bg, #D9E2CE sage cards, #BFCDAF sage borders, mustard accent
  (#C7902A text/buttons, #E0A93A ring), #33362C ink.
Both are driven by CSS variables in index.css. Brand utilities (`gold`/`charcoal`/`hairline`/
`obsidian`/`gold-ink`) are routed through intermediate vars (`--gold`, `--charcoal`, …) defined on
`:root`/`.dark` and overridden in `.theme-sunroom`, so a runtime class swap re-skins the whole app
despite `@theme inline`. Gold-button ink uses `text-gold-ink` (dark in both themes; was `text-obsidian`). In Sunroom the
`.glow-radial` top wash and `.gold-ring` card halo are overridden (unlayered `.theme-sunroom` rules)
to warm golden-hour amber tones with a soft sunlit top highlight. For WCAG AA, `--gold` stays bright
mustard (#E0A93A) for fills/borders/icons/buttons, but `text-gold`/`/70`/`/80` are overridden to a
deep goldenrod (#8A6410, ~5-6:1 on cream/sage) and `--muted-foreground` is darkened (#565A48).
`applyTheme` toggles BOTH classes — `theme-sunroom` on and `dark` off in light mode (so sonner
toasts and shadcn `dark:` variants follow) — and an inline script in index.html applies the saved
theme before first paint to avoid a flash.
Fonts: Space Grotesk headers, Geist body, Geist Mono numerics. There is also a standalone static
preview of the Sunroom palette at the ungated route `/demo/sunroom` (`pages/SunroomDemo.tsx`).

Responsive/mobile: the AppShell header wraps on small screens — brand + profile/sign-out on the top
row, and the nav drops to its own full-width horizontally-scrollable row below (sign-out is icon-only
on mobile). Page padding tightens on mobile; filter dropdowns go full-width and stack; wide tables
(inventory/activity) scroll inside the shadcn Table wrapper. No page has horizontal overflow at 390px.
On phones the header nav is hidden and replaced by a fixed bottom tab bar (`mobile-tabbar`) for
one-handed section switching; the sign-in keypad buttons enlarge to ~80px for easier PIN entry. The
app is installable as a PWA (`public/manifest.webmanifest`, standalone display, obsidian theme, 192/
512 + maskable icons) so the till can be added to a home screen and opened full-screen.

Sizing note: "Men's general" uses letter sizes only (XXS–XXXL, `MENS_SIZES`, no UK numbers); women's
clothing keeps its UK-numbered labels (XXS (UK 4)–XXL (UK 16)); Women's shoes use UK (EU) sizes.
Categories are alphabetical and include "Women's dresses" (letter-sized like other womenswear).
After appraisal the volunteer taps one of the four price panels (Peak RRP / Market avg / Charity
price, `price-option-*`, or "Set my own price" — `price-option-custom` with `custom-price-input`,
a bespoke number field) to choose which value becomes the item's tag price on save. Saving with the
custom panel selected but no value entered is blocked with a toast.
