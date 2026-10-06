# One Of A Find — Current App Analysis

_Snapshot taken before the redesign. This document maps every piece we must preserve._

## 1. Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite + TypeScript (strict) + Tailwind v4 + shadcn/ui (base-nova on @base-ui/react) |
| State | TanStack Query (`@tanstack/react-query`) — one `QueryClientProvider` in `src/main.tsx` |
| Routing | `react-router-dom` — single `<BrowserRouter>` in `main.tsx`, route table in `src/App.tsx` |
| Theming | CSS vars in `src/index.css`, `.dark` + `.theme-sunroom` classes toggled from `src/lib/theme.ts` |
| Backend | FastAPI (async) + Pydantic v2 + Motor (MongoDB) + python-dotenv |
| AI | Gemini 3 Flash via `emergentintegrations` using `EMERGENT_LLM_KEY` |

## 2. Routes (frontend)

All gated screens pass through `RequireAuth`, which renders `Lock.tsx` when `/auth/me` is unauthenticated, otherwise wraps the child in `AppShell` (header + mobile tab bar).

| Path | Component | Gated | Purpose |
|---|---|---|---|
| `/` | `pages/Appraise.tsx` | yes | Capture item + brand label + extras → calls `POST /api/appraise` → saves to inventory. **Primary camera flow.** |
| `/inventory` | `pages/Inventory.tsx` | yes | Grid of items with filter/edit/sell/re-price/bulk-select. |
| `/tag/:id` | `pages/TagPage.tsx` | yes | Printable single price-tag page (QR + barcode + condition). |
| `/print-tags` | `pages/PrintTags.tsx` | yes | A4 bulk-tag sheet from `?ids=` query. |
| `/activity` | `pages/Activity.tsx` | yes, **master-only** | Audit log viewer. |
| `/volunteers` | `pages/Staff.tsx` | yes, **master-only** | Staff CRUD, PIN reset, avatar/colour. |
| `/demo/sunroom` | `pages/SunroomDemo.tsx` | **no** | Ungated preview mock — do not touch. |
| `/demo/session-location` | `pages/SessionLocationDemo.tsx` | **no** | Ungated preview mock — do not touch. |

The Lock page itself is rendered inline by `RequireAuth` (not a routed page). Flow: `unlock` → `roster` → `pin` → `signin`/`register`.

## 3. Reusable components

Under `src/components/`:

- `AppShell.tsx` — top header + mobile bottom tab bar + profile dialog + theme/location switchers + logout.
- `RequireAuth.tsx` — session gate.
- `CameraCapture.tsx` — **critical, do not break.** Uses `getUserMedia({ facingMode: "environment" })`, torch, hardware zoom with digital fallback, 3:4 portrait or full-frame crop, quality heuristic (dark/blurry), returns a JPEG data URL via `onCapture`. **No file-upload path exists; camera-only is already enforced.**
- `BarcodeScanner.tsx` — SKU scanning on Inventory.
- `PriceTag.tsx` — tag render used by `TagPage` and `PrintTags`.
- `Avatar.tsx`, `AvatarPicker.tsx` — roster tile avatars.
- `ThemeToggle.tsx` — obsidian ↔ sunroom switch.
- `LocationSwitcher.tsx` — session branch (stored in `lib/sessionLocation.ts`).
- `FirstRunGuide.tsx` — onboarding cards on `/`.
- `ImageLightbox.tsx` — zoomed image viewer.

shadcn primitives in `components/ui/`: badge, button, calendar, card, checkbox, dialog, dropdown-menu, input, label, popover, select, sheet, sonner, table, tabs, textarea.

## 4. API endpoints

All under `/api`.

### Auth (`routers/auth.py`) — `/api/auth/*`

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create volunteer (needs shop password). Sets httpOnly cookie + CSRF cookie. |
| POST | `/auth/login` | Sign in with username + PIN. Sets httpOnly cookie + CSRF cookie. |
| POST | `/auth/logout` | Revoke session + clear cookie. |
| GET | `/auth/me` | Current session (`SessionInfo`); non-blocking probe. |
| PATCH | `/auth/profile` | Update own tile colour/photo. |
| POST | `/auth/roster` | Volunteer tiles for the lock screen (shop-password gated, not public). |

### Appraise (`routers/appraise.py`) — `/api/appraise`

| Method | Path | Purpose |
|---|---|---|
| POST | `/appraise` | Multi-image Gemini call. Returns `Appraisal` (title, brand, category, condition, is_electrical, peak_retail_price, market_average_price, recommended_price, confidence, rationale, resale_blurb). |

### Inventory (`routers/inventory.py`) — `/api/inventory/*`

| Method | Path | Purpose |
|---|---|---|
| GET | `/inventory` | List (trims heavy images). |
| GET | `/inventory/stats` | Totals, week raised, potential value. |
| GET | `/inventory/lookup?sku=` | Barcode lookup. |
| GET | `/inventory/{id}` | Full item (with images). |
| POST | `/inventory` | Save appraised item (assigns SKU). |
| PATCH | `/inventory/{id}` | Edit title/price/category/location/size/condition/price_source/giftaid_ref/pat_passed/is_electrical. |
| POST | `/inventory/{id}/blurb` | Re-draft resale blurb with a tone. |
| PATCH | `/inventory/{id}/sell` | Mark sold / return to floor. |
| DELETE | `/inventory/{id}` | Remove. |

### Activity (`routers/activity.py`, master-only) — `/api/activity/*`

| Method | Path | Purpose |
|---|---|---|
| GET | `/activity` | Audit log. |
| POST | `/activity/delete` | Purge selected ids. |

### Staff (`routers/staff.py`, master-only) — `/api/staff/*`

| Method | Path | Purpose |
|---|---|---|
| GET | `/staff` | List volunteers. |
| POST | `/staff` | Create volunteer. |
| PATCH | `/staff/{username}` | Rename/recolour/rephoto. |
| PATCH | `/staff/{username}/pin` | Reset PIN (revokes sessions). |
| DELETE | `/staff/{username}` | Remove. |

### Health — `GET /api/` (unauthenticated readiness probe).

## 5. Database collections (MongoDB)

- `users` — `{id, username, pin_hash, is_master, color, avatar, created_at}`
- `sessions` — session token docs (TTL managed by `lib/auth.py`)
- `inventory` — see `InventoryItem` in `backend/models/appraisal.py`: `{id, sku, title, brand, category, description, condition, peak_retail_price, market_average_price, recommended_price, currency, confidence, rationale, resale_blurb, is_electrical, pat_passed, price_source, item_image, label_image, extra_images, giftaid_ref, location, size, status, sold_price, sold_giftaid_ref, sold_at, created_at}`
- `activity` — `{id, timestamp, username, action, item_id, item_title, item_sku, details}`
- `login_failures` / `shop_gate_failures` — rate-limit state

## 6. Authentication

Dual auth, cookie-first:

- **Login response** sets `ooaf_session` (httpOnly, SameSite=lax) + `ooaf_csrf` (readable by JS so the frontend can echo it back in `X-CSRF-Token`).
- Every unsafe method (`POST/PUT/PATCH/DELETE`) under `/api` must present a matching `X-CSRF-Token` header **when a session cookie is present**. Login/register/roster are CSRF-exempt (pre-session).
- Bearer-token path is accepted (`Authorization: Bearer <token>`) for a future native mobile app; `token_from(cookie, header)` prefers the cookie.
- Master account seeded at startup (`seed_master` in `lib/auth.py`) from `ADMIN_USERNAME` + `ADMIN_PASSWORD` env.
- Lock screen flow: shop password → roster (tap tile) → PIN → signed in. "Create a new volunteer" branches to the register path (same shop password gate).

**CORS**: `CORS_ORIGINS="*"` ⇒ wildcard **without credentials** (safe since the web app is same-origin and Bearer uses no cookies). An explicit allowlist re-enables credentials. **Do not loosen.**

## 7. Camera flow

Implemented entirely in `components/CameraCapture.tsx` as a dialog, instantiated three times on `/` (item, label, extras):

1. On open → `getUserMedia({ video: { facingMode: "environment", width: 1080, height: 1440, aspectRatio: 3/4 } })`.
2. Live preview with grid overlay, torch toggle (when `track.getCapabilities().torch === true`), zoom slider (hardware zoom caps or 1×–4× digital fallback), portrait/full-frame toggle.
3. Shutter → draws current video frame to canvas, crops to 3:4 centre (or full), downscales to ≤900 px long edge, encodes JPEG at 0.82, runs cheap luminance + Laplacian heuristics, surfaces "a little dark/blurry" warning. Returns data URL via `onCapture`.
4. Retake / Use photo buttons; Cancel closes.

**No file picker / drag-drop / gallery path exists.** Already camera-only; the brief's "remove gallery" step is a no-op.

## 8. AI flow

- `POST /api/appraise` composes `SYSTEM` + `PROMPT` with the allowed category list, attaches 1–8 base64 images (item + optional label + up to 6 extras), sends to `gemini/gemini-3-flash-preview` via `emergentintegrations.llm.chat.LlmChat`. Strict JSON response is cleaned (strip code fences), parsed, normalised, and clamped (recommended = min(market_avg, peak × 0.5), rounded to the nearest 50p).
- `POST /api/inventory/{id}/blurb` reuses the same chat primitive to redraft the listing in a tone (`warm | concise | luxury | playful`).

## 9. State management

- `TanStack Query` is the sole data layer. Keys in use: `["auth","me"]`, `["inventory"]`, `["inventory","stats"]`, `["activity"]`, `["staff"]`, `["roster"]`, `["item", id]`.
- Mutations invalidate the relevant keys; `endSession()` calls `qc.clear()` on logout to prevent cache leakage between volunteers.
- Session location (branch) is persisted locally via `lib/sessionLocation.ts`.

## 10. Design system (current)

- Dark cinematic "Obsidian" default (`:root` + `.dark`) + light "Sunroom" option (`.theme-sunroom`).
- Palette: `--obsidian #0B0C0E`, `--charcoal #16181C`, `--gold #D9B48F`, hairline borders, radial glow.
- Fonts: Space Grotesk (heading), Geist (body), Geist Mono.

---

# Proposed Redesign — What Will Change

The redesign brief introduces a new "Thrift Vision" visual language (forest green + cream + terracotta + sage, Inter type) with a mobile-first home / scan / finds / more shell. We map it onto the existing app **without renaming routes or removing features**, keeping charity-shop features (PAT gating, bulk tags, master screens, etc.) accessible.

## 10.1 Route mapping (keeps old URLs as aliases)

| Brief's route | Our route | Notes |
|---|---|---|
| `/home` | `/` (now a true **Home** page) | New hero + "Scan an item" card + Recent finds + stats tile. The old appraisal flow moves to `/scan`. |
| `/scan` | `/scan` **(new)** | Full-screen camera capture + brand capture + processing + results. Reuses `CameraCapture` and the existing `/api/appraise` logic. |
| `/finds` | `/finds` **(new)** → alias of existing `/inventory` | Keep `/inventory` as a redirect so bookmarks and deep links don't break. |
| `/more` | `/more` **(new)** | Settings-style hub: location, theme, profile, bulk print, master-only Activity + Staff, Help, About, Sign out. |

Deep links kept exactly as-is: `/tag/:id`, `/print-tags`, `/activity`, `/volunteers`, the `/demo/*` previews.

## 10.2 Theme

- Add a new `.theme-forest` class (default) with the brief's palette:
  `--primary #123C35` forest, `--background #FAF7F0` cream, `--card #FFFFFF`, `--terracotta #D96C4F`, `--sage #DCE9DF`, `--text #18201E`, `--text-secondary #5E786F`, dark variant `#101816 / #18211E / #F5F7F5 / #A8B4AF`.
- `ThemeToggle` becomes **Light / Dark** (System) toggle; old `obsidian` / `sunroom` remain accessible via settings for anyone used to them (zero-regression option).
- Load **Inter** (variable) as the primary sans; keep Space Grotesk retired or secondary (both are preinstalled). Headings 700, body 400–500, numeric values 700–800.

## 10.3 New shared primitives (`src/components/ui/*` + `src/design-system/*`)

- Light-touch design tokens: `src/design-system/{colors.ts, spacing.ts, radius.ts, typography.ts}` for TS-side use. (CSS vars remain the source of truth.)
- New wrappers / components, re-exportable from `src/components/common/`:
  `SectionHeader`, `ValueDisplay`, `ConfidenceBadge`, `LoadingCard`, `EmptyState`, `ErrorState`, `BottomNavigation`, `CameraFrame`, `Modal` (thin wrapper on existing `Dialog`), `Toast` (we keep `sonner`).
- Button variants: adjust existing `button.tsx` CVA to add a `primary` style = forest green + cream text + rounded; `secondary` = white with forest border; `ghost` stays. Minimum touch target 48 px.

## 10.4 Page refactors (visuals only; APIs/logic untouched)

- **New `pages/Home.tsx`** — hero "What have you found today?", big scan card, "Recent finds" (first 5 from `GET /inventory`), weekly raised tile (from `GET /inventory/stats`), bottom nav.
- **`pages/Scan.tsx`** — fullscreen camera flow in three steps: Item capture → Brand capture (auto-transition) → Processing card (`✓ Identifying item`, `✓ Checking brand`, `○ Comparing prices`, `○ Searching market` — simulated progress, no backend change). Then redirect to a results view backed by the saved `InventoryItem`. The current `/` behaviour (big Appraise form with extras + condition + save) remains fully reachable from `/scan`'s "More details" view.
- **`pages/Finds.tsx`** — new card list (image, title, value, confidence, date) powered by the current `GET /inventory`. Preserves filters, bulk selection, re-price, mark-sold, delete, bulk print, condition filter can slot in later (P1 backlog item).
- **`pages/Results.tsx`** (view of a saved item) — refactor of `TagPage` into a two-tabbed screen: _Appraisal_ (photo, confidence, value card, item details, market details, evidence accordion, save/edit) and _Price tag_ (the existing tag/print surface). Keeps all current mutations: `PATCH /inventory/{id}`, `/sell`, `/blurb`, `DELETE`, bulk print.
- **`pages/More.tsx`** — settings hub replacing the AppShell dropdown. Preserves profile dialog, theme toggle, branch switcher, logout; adds entry points to **Activity** and **Staff** when `is_master`.
- **`pages/Lock.tsx`** — restyle only (new palette, bigger PIN pad touch targets, new tile layout). Flow logic untouched.

Legacy pages stay on disk and are still routable at their old URLs to guarantee zero regression; the new `/scan` and `/finds` are additive. Once the user signs off, we can collapse `/` + `/inventory` into the new pages behind redirects.

## 10.5 Error / empty / loading states

Consistent surfaces (`LoadingCard`, `EmptyState`, `ErrorState`) wrap API calls — no raw stack traces. The template's rule (never gate the whole page on a fetch) is honoured so the preview CDN build still renders when the backend is paused.

## 10.6 Accessibility & perf

- 44 px+ touch targets, ARIA labels on every interactive, visible focus rings, `prefers-reduced-motion` respected (already in `index.css`).
- Lazy-load heavy routes with `React.lazy` (new).
- Keep images downscaled to ≤900 px (already in `CameraCapture`).
- Bundle-size impact: Inter adds ~1 variable font file; everything else re-uses installed primitives.

## 10.7 What we will NOT touch

- `backend/models/appraisal.py` (no schema changes)
- Any route in `backend/routers/*.py` (no API changes)
- `CameraCapture.tsx` capture logic / canvas pipeline (visual chrome only may change)
- `lib/api.ts`, `lib/session.ts`, CSRF/cookie handling
- `BarcodeScanner.tsx`, `PriceTag.tsx` (used by the print paths — reused as-is)
- `backend/server.py` CORS/CSRF middleware
- `/app/memory/SPEC.md` seed credentials
- The two `/demo/*` previews

## 10.8 Risks & mitigations

| Risk | Mitigation |
|---|---|
| Button CVA change ripples to legacy pages | Add a new `primary` variant, leave `default` intact; migrate legacy pages one at a time. |
| New routes conflict with existing bookmarks | Keep old routes as aliases/redirects. |
| Theme vars drift breaks `base-nova` shadcn components | Only override tokens that already exist; don't remove any. |
| PAT gating / Giftaid / bulk-print nuances lost in a visual rewrite | We refactor the existing `Inventory`/`TagPage` into new shells but keep all their mutation hooks and conditional UI (price_source wording, PAT red banner, GiftAid ref etc.). |

## 11. Implementation plan (incremental)

1. **Tokens**: add `.theme-forest` palette + Inter import + updated `--font-sans/--font-heading` in `index.css`; keep obsidian/sunroom intact; wire `theme.ts` to a new default `"forest"`.
2. **Primitives**: create `src/design-system/{colors,spacing,radius,typography}.ts`; add new `components/common/{SectionHeader,ValueDisplay,ConfidenceBadge,LoadingCard,EmptyState,ErrorState,BottomNavigation,CameraFrame}.tsx`; extend `button.tsx` with `primary`.
3. **Shell**: new `pages/Home.tsx` + new `BottomNavigation` with Home / Scan / Finds / More. Mount under `/`. Old `/` (Appraise) moves to `/scan` as `Scan.tsx` wrapping `Appraise`'s existing component.
4. **Finds**: new `pages/Finds.tsx` reusing Inventory data hooks; `/inventory` kept as alias.
5. **Results**: `pages/Results.tsx` tabbed view that embeds the existing `TagPage` subtree for print.
6. **More**: `pages/More.tsx` with links to Activity (master), Staff (master), bulk print, profile dialog, theme, branch, sign out.
7. **Lock**: restyle only.
8. **Verify**: tier-1 gate (curl smoke, `yarn typecheck`, one happy path), then testing subagent.

Every step preserves the API surface documented in sections 4–8 above.
