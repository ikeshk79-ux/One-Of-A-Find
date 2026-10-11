# One Of A Find — Gap Audit vs. Full Redesign Brief

_Second analysis pass. The previous two turns already shipped a large portion of this brief; this
document audits what is already in place and lists only the genuine remaining gaps._

## 1. Baseline (unchanged by any gap work)

### Stack
React 19 + Vite + TypeScript strict · Tailwind v4 · shadcn/ui · TanStack Query · FastAPI +
Pydantic v2 + Motor (MongoDB) · Gemini 3 Flash via `emergentintegrations`.

### Routes
- Gated (through `RequireAuth` → Lock + `AppShell`):
  `/` Home · `/scan` capture + appraise · `/finds` card grid · `/more` settings · `/inventory`
  (legacy admin) · `/tag/:id` printable price tag · `/print-tags` A4 bulk sheet · `/activity`
  (master) · `/volunteers` (master)
- Ungated previews: `/demo/sunroom`, `/demo/session-location`, `/demo/scan-progress`

### APIs (all under `/api`, unchanged)
Auth: `/auth/register | /auth/login | /auth/logout | /auth/me | /auth/profile | /auth/roster`
Appraise: `POST /appraise` (Gemini call, returns `Appraisal` — see below)
Inventory: `GET /inventory | GET /inventory/stats | GET /inventory/lookup | GET /inventory/{id}
| POST /inventory | PATCH /inventory/{id} | POST /inventory/{id}/blurb |
PATCH /inventory/{id}/sell | DELETE /inventory/{id}`
Activity (master): `GET /activity | POST /activity/delete`
Staff (master): `GET /staff | POST /staff | PATCH /staff/{username} | PATCH /staff/{username}/pin
| DELETE /staff/{username}`

### Database collections
`users`, `sessions`, `inventory`, `activity`, `login_failures`, `shop_gate_failures`.

### Appraisal response fields (what the backend actually returns — do not invent beyond this)
`title · brand · category · description · condition · is_electrical · price_source ·
peak_retail_price · market_average_price · recommended_price · currency · confidence ·
rationale · resale_blurb`
**No `sources`, no `evidence_urls`, no `comparables`, no `favourite` flag.** Any "evidence" in
the UI must be sourced from `rationale` + `description` + `confidence` — otherwise an honest
"no supporting sources returned" message.

### Camera
`components/CameraCapture.tsx` — camera-only (`getUserMedia({ facingMode: 'environment' })`),
torch, hardware zoom with digital fallback, 3:4 portrait/full-frame, luminance + Laplacian
quality heuristics. **No gallery / file-picker / drag-drop path exists anywhere in the tree.**

### Auth
Cookie session + CSRF double-submit + optional Bearer. Master seeded from env.

### AI flow
`POST /api/appraise` → `emergentintegrations.llm.chat.LlmChat` with
`gemini/gemini-3-flash-preview` and `EMERGENT_LLM_KEY` — strict-JSON prompt, response clamped to
recommended = min(market_avg, peak × 0.5), 50 p rounded.

---

## 2. Brief ↔ Current state matrix

| # | Brief section | Status |
|---|---|---|
| 2 | Camera-only input (no gallery/upload) | ✅ Already true — no upload path has ever existed |
| 3 | Premium modern visual direction | ✅ Forest/sage/terracotta applied across shell + pages |
| 4 | Brand palette (forest `#123C35`, cream, sage, terracotta, charcoal text) | ✅ CSS vars in `src/index.css` as the default `:root` |
| 5 | Inter typography, hero scale, strong numeric values | ✅ `@fontsource-variable/inter` loaded; `--font-sans/--font-heading` wired |
| 6 | Global padding/radius/touch-target rules | ✅ `.touch-target` utility (48 px), card radii standardised |
| 7 | Home: hero, scan card, recent finds, mission tiles | ✅ `pages/Home.tsx` |
| 8 | Bottom nav Home/Scan/Finds/More, floating Scan | ✅ `components/common/BottomNavigation.tsx` + top nav in `AppShell` |
| 9 | Item camera UI — fullscreen, scan frame, large shutter, "Good lighting…" copy | 🟡 Dialog is bare; needs titled framing + helper copy |
| 10 | Brand camera auto-transition after item capture | 🟡 Two separate slots today — brief wants one guided flow |
| 11 | Processing: ✓ Identifying / ✓ Checking brand / ○ Comparing / ○ Searching | ✅ `ProcessingSteps` + `/demo/scan-progress` |
| 12 | Dedicated **Result screen** (photo, confidence, item name, value card, item details, market details, evidence, save) | 🟡 Today the result renders inline inside `Appraise`; needs promoting to a proper result layout |
| 13 | Big sage value card "ESTIMATED VALUE £xx–£yy" | 🟡 Currently a 3-tile Peak/Charity/Custom chooser — the chooser must stay (volunteers pick), but the headline value needs a hero value card above it |
| 14 | "Why this estimate?" accordion | ❌ Not present — need an expandable surface over `rationale` + confidence + condition + "no external sources available" honesty line |
| 15 | Save feedback (heart animation + "Saved to Finds" toast) | 🟡 Toast exists; a small animation + language tweak remain |
| 16 | My Finds — card list with image/title/value/confidence/date | ✅ `pages/Finds.tsx` (filters are PAT / status today — see note under gaps) |
| 17 | Settings — Settings/Help/About sections | ✅ `pages/More.tsx` (Help & About present) |
| 18 | Empty states | ✅ `EmptyState` primitive used in Home + Finds |
| 19 | Error states | ✅ `ErrorState` primitive used in Finds; need to confirm Appraise/Scan paths use it |
| 20 | Dark mode (light/dark/**system**) | 🟡 Four themes exist (`forest-light / forest-dark / obsidian / sunroom`) but no "follow system" option — need a System toggle |
| 21 | Responsive 320/375/390/430/768/1024/1440 | ✅ All breakpoints covered by Tailwind + current layouts |
| 22 | Accessibility (44 px, ARIA, focus, reduced motion) | ✅ Baseline present; audit still worth a pass |
| 23 | Performance (lazy load, light bundle) | 🟡 Lazy-loading not applied to heavy routes yet (Appraise, Inventory, PrintTags) — easy win |
| 24 | Progressive visual replacement | ✅ Legacy routes still mount their legacy UIs, new routes own the new look |
| 25 | Full QA pass | 🟡 Not yet run after this round of changes |

### Additional brief sections

| # | Brief section | Status |
|---|---|---|
| 16 (Discovery) | "You found a good one!" celebration after save | ❌ Save currently routes straight to `/tag/{id}` printable — no success moment |
| 17 (My Finds) | "All \| Favourites \| Saved" filter | ❌ Backend has no `favourite` field — would require either backend change or we drop the Favourites filter and keep current `All / Available / Sold / PAT pending` |
| 19 (Charity mission) | "Good finds support great causes." card | ❌ Not present |
| 20 (Onboarding) | 3-screen welcome before Lock | 🟡 `FirstRunGuide` exists as a modal inside Appraise but is not a dedicated welcome flow before auth |
| 36 (Brand copy) | "Find it. Identify it. Discover its value." tagline | 🟡 Partially present in hero copy |

---

## 3. What I propose to change (delta scope)

Grouped by the smallest safe refactors. Nothing listed here touches a Pydantic model, a backend
router, auth, CSRF, CORS, the camera capture pipeline, or any other existing feature
(PAT gating, Giftaid, condition grading, bulk tag printing, master screens, barcode SKU,
price-source choice all remain exactly as they are).

### 3.1 Dedicated Result layout (brief §12–§15)
- New section inside `Appraise` (not a new route — keep the capture + result on `/scan`) that
  renders the appraisal in the brief's layout: large hero photo, confidence badge, item name,
  **sage ValueDisplay** showing the currently-selected price with "ESTIMATED VALUE" eyebrow,
  then the existing Peak/Charity/Custom chooser (unchanged logic), item details grid, market
  details grid, resale-blurb card, and a new **"Why this estimate?" accordion**.
- The accordion renders `rationale + description + confidence + condition + price_source`
  plus an honest footer: "This estimate is based on Gemini's analysis of your photos; no
  external market URLs are returned by the appraisal API."

### 3.2 Dedicated success moment (brief §16)
- After `POST /api/inventory` succeeds, instead of jumping straight to `/tag/{id}`, show a
  short **success state** inline — "You found a good one!" + value + two CTAs:
  **Print price tag** (goes to `/tag/{id}`) and **Scan another item** (resets the form).
  Preserves the existing save flow and keeps the printable tag reachable.

### 3.3 Camera chrome (brief §9–§10)
- Add a titled header + instruction copy to the `CameraCapture` dialog based on the slot
  (`"Scan the item"` + `"Make sure the item is clear and well lit."` for the item slot;
  `"Now scan the brand"` + `"Take a photo of the label or logo."` for the label slot).
- Keep the shutter / torch / zoom / portrait toggle / retake buttons exactly where they are.
- Auto-transition: when the item photo is captured and no label photo exists yet, prompt
  "Now capture the brand label" with a one-tap button to open the label camera.

### 3.4 Theme: add "System" option (brief §20)
- `lib/theme.ts` gains a `"system"` entry that follows `prefers-color-scheme` live. The More
  page picker becomes **System · Forest Light · Forest Dark · Obsidian · Sunroom**.

### 3.5 Charity-mission card (brief §19)
- A small sage card on `More` (not the Home hero) with the "Good finds support great causes."
  copy. Non-intrusive, no fake statistics.

### 3.6 Light performance pass (brief §23)
- `React.lazy` for the three heavy routes: `Inventory`, `PrintTags`, `Appraise/Scan`. Keeps the
  initial Home chunk small.

### 3.7 QA pass + testing (brief §25, §39)
- After the above lands, run the testing subagent against the full journey (launch → scan →
  capture → brand → processing → result → save → finds → saved detail), with the usual edge
  cases (permissions denied, PAT item, sold item, dark mode, mobile + desktop).

### 3.8 Explicitly NOT doing
- No "Favourites" field (would require a backend schema change the brief says not to make).
  The existing filters (All / Available / Sold / PAT pending) stay — they're more useful for a
  charity shop than a Favourites toggle.
- No pre-auth 3-screen onboarding — the existing `FirstRunGuide` + Lock flow is adequate for a
  shop-tablet context, and a sign-in gate must still come first for data integrity. I can
  revisit if you'd like a Welcome strip above the Lock screen as a lower-risk alternative.
- No fabricated evidence URLs or sale comparables — the "Why this estimate?" accordion is
  limited to what the backend actually returns, with an honest "no external sources" note.

---

## 4. Risk & verification plan

| Risk | Mitigation |
|---|---|
| Result-screen refactor disrupts save flow | Keep every existing mutation (`POST /inventory`, `PATCH /inventory/{id}`, `/sell`, `/blurb`) wired through the same handlers; only the surrounding JSX changes |
| Lazy loading breaks preview CDN build | Verify with `yarn build` before shipping; keep Home eager so first paint is unaffected |
| Camera-chrome copy slot breaks existing testids | Preserve every existing `data-testid` on the dialog; add new testids rather than renaming |
| System-theme listener fires during SSR | Guard with `typeof window` as the existing code already does |

Verification after implementation:
1. `yarn typecheck` + backend readiness probe.
2. curl smoke over the key endpoints.
3. Browser pass through Lock → Home → Scan → camera → result → save → success → Finds → tag/{id}, mobile + desktop + dark.
4. Testing subagent for the full acceptance matrix.
