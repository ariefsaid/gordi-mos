# Spec — Redesign Styling Pass (Step 1: CSS/tokens only)

| | |
|---|---|
| **Status** | OWNER-APPROVED 2026-07-14 (spec sign-off; D-3 derived-dark + D-4 single-border accepted) → plan phase |
| **Workstream** | Redesign buildout — `docs/plans/2026-07-14-redesign-buildout.md`, Step 1 |
| **Scope source (verbatim)** | _"Align the app's tokens/chrome to the redesign look; CSS/`DESIGN.md` only, zero behavior change — pure visual diff, easy sign-off."_ |
| **Spec discipline** | feature-forge (requirements + acceptance) |
| **Authority chain** | Master plan Step-1 line → `docs/experience-contract.md` Rules 1–11 → `DESIGN.md` (identity authority) → E7 reference token set (`e7-prototype.css` `:root`) → `SALVAGE-INVENTORY.md` (e7 OWNS the visual system) |
| **Build layers touched** | `*.css` token files + component `*.css` + `DESIGN.md`. **Zero `*.ts`/`*.tsx`.** |
| **Owner gate** | Visual diff sign-off (before/after screenshot matrix vs the E7 reference) |

---

## 1. Overview & user value

The redesign direction (ADR-0025 / OD-REDESIGN) settled on a **warmer, brighter "Quiet Control
Surface."** The E7 prototype is the standing reference implementation for that look, and per
`SALVAGE-INVENTORY.md` it **owns the visual system** — the `--e7-*` token set, the type scale, the
chrome, and the card/pill/table primitives (all three design reviews agreed the visual system is
consistent). The shipped `mos-app` currently renders the **older, cooler** identity: achromatic
near-white surfaces, cool-grey text, a single deeper action blue, and cool-near-black shadows.

**This step closes that gap with a pure token/chrome reskin.** No route, no nav structure, no
component markup, and no behavior changes — only the resolved values of the app's existing design
tokens and the literal colors hardcoded into chrome CSS. The user (owner) value is a fast, low-risk,
visually obvious sign-off: the app simply _looks like the redesign_ while behaving identically.

**The single load-bearing idea:** the E7 `--e7-*` values are ported onto the app's **existing token
names** (no `e7-*` tokens enter the app). Components keep consuming the same Tailwind utilities and
bare role vars they already do; only what those names _resolve to_ changes.

## 2. Scope

### 2.1 IN SCOPE (token groups that change — Step 1)

| Group | Change |
|---|---|
| **Neutral surfaces** | Warm-white canvas/cards/popover + warm quiet-fill / hover / pressed / sunken-main tiers |
| **Text** | Warm near-black foreground + warm grey secondary/tertiary/placeholder tiers |
| **Lines (borders)** | Warm hairline + restore the Single-Border Rule (field border == divider); strong line for checkboxes only |
| **Action blue** | Brighter E7 action blue (`--accent`/`--primary`/`--ring`) + hover/active/subtle/tint companions |
| **Brand** | `--brand-navy` → E7 navy; `--brand-navy-text` aligned; `--brand-orange` confirmed |
| **Status hues + AA text** | success/warning/destructive/violet bases + their AA-darkened text variants (incl. fixing `--warning-foreground`, currently mis-mapped to red) |
| **Shadow tints** | Overlay/popover/drawer/scrim/brand-button shadows warmed from cool near-black to navy-tinted |
| **Gradients** | Primary-button sheen + home/digest surface wash aligned to E7 (wash stays home-only) |
| **Chrome surfaces** | Header / rail / table-header / card / pill resolved values warmed; no hardcoded cool literals remain in chrome CSS |
| **`DESIGN.md`** | Documented `oklch`/HSL values + named-rule prose updated to match the warm palette (identity authority stays in sync) |

### 2.2 CONFIRMATIONS — already aligned, MUST NOT change (do not invent drift)

The app already matches the E7 reference on these (via OD-P3-9 / OD-P3-10). They are **explicitly
no-change**; a build that alters them is out of scope and a regression:

| Group | Status |
|---|---|
| **Radius scale** | 12px cards/overlays · 8px controls · 4px tiny · 999px pill — already matches E7 (`--radius: 0.75rem`) |
| **Spacing scale** | 4 / 8 / 12 / 16 / 20 / 24 … — already matches E7 |
| **Type families** | Plus Jakarta Sans (display) · DM Sans (body/UI/table) · Inter-tabular (numeric only) · SF Mono (IDs) — already matches E7 (OD-P3-9) |
| **Type scale** | 24 / 20 / 18 / 14 / 12 / 11 px page→overline — already matches E7 |
| **Focus contract** | Global `:focus-visible` = 2px action ring, 2px offset — already matches E7 |

### 2.3 OUT OF SCOPE — fenced to Steps 2–3 (structural / behavioral)

Step 1 touches **NONE** of the structural or behavioral concerns. These are fenced out and may not
appear in the Step-1 diff:

- **Layout & geometry dimensions:** rail width, content max-width, panel/drawer width, header/tabbar
  height, control height, tap-target height, and **table row height / density** (the 50px DB-view row
  is owned by Step 3's Tasks re-home, per `DESIGN.md` "Dense DB-view variant"). E7's `232px` rail /
  `1180px` content-max / `460px` panel / `52px` row are **not ported this step.**
- **Routes, URL grammar, nav structure, page anatomy, aria-state mechanics, action grammar, capture
  disclosure** — all Steps 2–3.
- **Component markup / any `*.tsx` or `*.ts` logic change** — Contract Rule 11 (see §5).
- **`SALVAGE-INVENTORY` structural overrides** (single-`#/work` URL, co-active `aria-current`, the
  Work rail shape, generic `Create`, the long composer, mobile selector-stacking, "Process Run" noun,
  gated Money stub) — none are addressed here; they are Step 2–7 work.

### 2.4 Experience-Contract posture (Rules 1–11)

- **Rules 1, 3, 4, 5, 6, 7, 8, 9, 10** are **structural / behavioral and are NOT touched this step.**
  A Step-1 diff that attempts to satisfy or alter any of them is out of scope.
- **Rule 2 (UI families over contracts)** — no new surfaces; reuse only.
- **Rule 11 (component reuse — never re-implement)** is the **binding NFR of this step** (§5, NFR-001):
  the diff is CSS/tokens only; no surface or component is re-implemented.

## 3. Token mapping — E7 reference value → app token (existing name)

> **De-reference firewall.** The E7 `--e7-*` names are the **reference vocabulary only**. They do
> **not** enter the app — no `e7-*` token is created. The table says which **existing app token**
> takes which E7 value. The app runtime color space is `color(display-p3 …)` (ADR-0009 D2); the E7
> values below are the authoritative `hsl()` reference the implementer converts to Display-P3 (and
> `DESIGN.md` records the `oklch` documentation form). "Current ≈" is the resolved value today.

### 3.1 Surfaces (warm)

| App token (existing name) | E7 reference value | Current ≈ | Also consumed via |
|---|---|---|---|
| `--surface-primary` / `--background` / `--card` / `--popover` | `hsl(40 30% 99%)` | pure white | `--color-background`/`--color-card`/`--color-popover` |
| `--surface-secondary` / `--secondary` / `--muted` / `--accent`(hover wash) | `hsl(38 22% 97%)` | cool `0.988` grey | `--color-secondary`/`--color-muted`/`--color-accent` |
| `--surface-tertiary` (hover fill) | `hsl(38 20% 95%)` | cool `0.945` | — |
| `--surface-quaternary` (pressed fill) | `hsl(38 18% 92%)` | cool `0.922` | — |
| main scroll-area sunken tint | `hsl(38 25% 96.5%)` | cool `secondary/35%` | (chrome CSS) |

### 3.2 Text (warm near-black)

| App token | E7 reference value | Current ≈ |
|---|---|---|
| `--text-primary` / `--foreground` (`--color-foreground`) | `hsl(30 8% 12%)` | cool `0.2` grey |
| `--text-secondary` / `--muted-foreground` | `hsl(30 6% 35%)` | cool `0.4` |
| `--text-tertiary` | `hsl(30 5% 50%)` | cool `0.6` |
| `--text-light` (placeholder) | `hsl(30 5% 64%)` | cool `0.702` |
| `--text-inverted` / `--primary-foreground` | `hsl(0 0% 100%)` | white (unchanged) |

### 3.3 Lines (warm; restore Single-Border)

| App token | E7 reference value | Current ≈ | Note |
|---|---|---|---|
| `--border` / `--input` (`--color-border`/`--color-input`) | `hsl(38 18% 90%)` | controls `0.839`, dividers `0.922` (split) | **Restores Single-Border Rule:** field border == divider |
| `--border-strong` (`--input` strong uses) | `hsl(38 18% 82%)` | `0.839` | checkboxes / pressed edges only |
| table-row soft divider | `hsl(38 18% 90% / 0.7)` | `border/70%` | tracks new border |

### 3.4 Action blue (brighter)

| App token | E7 reference value | Current ≈ |
|---|---|---|
| `--accent` / `--primary` / `--ring` (`--color-primary`/`--color-ring`) | `hsl(225 75% 55%)` | deeper `~hsl(230 62% 55%)` |
| `--accent-hover` / primary hover | `hsl(225 75% 50%)` | `blue10` |
| `--accent-active` | `hsl(225 75% 45%)` | `blue12` (dark navy-ish) |
| `--accent-subtle` (10% wash) | `hsl(225 75% 55% / 0.10)` | pale blue wash |
| `--accent-tint` (14% wash) | `hsl(225 75% 55% / 0.14)` | — |
| `--primary-foreground` / action text | `hsl(0 0% 100%)` | white (unchanged) |

### 3.5 Brand

| App token | E7 reference value | Current ≈ | Note |
|---|---|---|---|
| `--brand-navy` | `hsl(210 40% 24%)` | `hsl(218 46% 22%)` | structural weight |
| `--brand-navy-text` | `hsl(210 40% 24%)` | `hsl(218 42% 26%)` | E7 collapses text==navy |
| `--brand-orange` | `hsl(18 80% 48%)` | `~hsl(18 80% 48%)` | **confirmed — no change** |

### 3.6 Status hues + AA-darkened text

| App token | E7 reference value | Current ≈ |
|---|---|---|
| `--destructive` (`--color-destructive`) | `hsl(0 72% 45%)` | `~hsl(0 60% 56%)` |
| `--success` (`--color-success`) | `hsl(142 64% 38%)` | `~hsl(142 31% 48%)` |
| `--warning` (`--color-warning`) | `hsl(38 92% 50%)` | `~hsl(38 96% 56%)` |
| `--violet` (`--color-violet`) | `hsl(262 60% 55%)` | `~hsl(262 52% 58%)` |
| `--status-open-text` | `hsl(225 75% 45%)` (open-pill = action-active) | `hsl(221 75% 38%)` |
| `--status-won-text` | `hsl(142 64% 28%)` | `hsl(142 64% 30%)` |
| `--status-lost-text` | `hsl(0 72% 38%)` | `hsl(0 72% 45%)` |
| `--status-violet-text` | `hsl(262 60% 42%)` | `hsl(262 60% 42%)` (**no change**) |
| `--warning-foreground` | `hsl(28 80% 34%)` (deep brown) | **BUG: currently `--status-lost-text` (red)** — corrected |

### 3.7 Shadows (navy-tinted)

| App token | E7 reference value | Current ≈ |
|---|---|---|
| `--shadow-rest` | `0 1px 2px hsl(210 40% 24% / .05), 0 1px 3px hsl(210 40% 24% / .04)` | tracks `--brand-navy` via `color-mix` (auto-aligns once navy moves) |
| overlay / `--shadow-overlay` / `--shadow-popover` / `--shadow-drawer` | `0 10px 30px hsl(210 40% 24% / .16), 0 2px 6px hsl(210 40% 24% / .08)` | cool `hsl(240 10% 8% / …)` |
| `--scrim` | `hsl(210 40% 14% / 0.32)` | cool grey `45%` |
| `--shadow-brand-button` | `0 1px 2px hsl(225 75% 55% / 0.25)` | tracks `--primary` (auto-aligns) |

### 3.8 Gradients

| App token | E7 reference value | Note |
|---|---|---|
| `--gradient-primary-sheen` | `linear-gradient(180deg, hsl(225 75% 58%) 0%, hsl(225 75% 52%) 100%)` | optional primary-button sheen; app's `color-mix(accent,+3%white)` form is equivalent once `--accent` aligns |
| `--gradient-surface-wash` | `linear-gradient(180deg, hsl(210 40% 24% / 0.035) 0%, transparent 220px)` | **home/digest surface only** (Restrained-Gradient Rule) |

### 3.9 Type / radius / spacing — CONFIRMATIONS (no change; see §2.2)

Already aligned to E7. Listed for completeness; the build must not alter them.

---

## 4. Functional Requirements (EARS)

> All FRs are CSS / token-value / `DESIGN.md` changes only. "The application" = the rendered
> `mos-app`. "The E7 reference value" = the `hsl()` in §3.

- **FR-001 (warm surfaces).** The application shall render the primary surface tokens
  (`--surface-primary`, `--background`, `--card`, `--popover`) at the E7 warm-white value, and the
  quiet-fill / hover / pressed / sunken-main tiers at their E7 warm values, at both the bare-role and
  Tailwind `--color-*` seams.
- **FR-002 (warm text).** The application shall render the foreground and de-emphasised text tiers at
  the E7 warm near-black / warm grey values, preserving the existing tier ordering (primary > secondary
  > tertiary > placeholder).
- **FR-003 (warm borders + restore Single-Border).** The application shall render `--border` and
  `--input` at the single E7 hairline value (field border == divider), reserving `--border-strong` for
  checkboxes and pressed edges only.
- **FR-004 (brighter action blue).** The application shall render the action blue tokens
  (`--accent`/`--primary`/`--ring` and their hover/active/subtle/tint companions) at the E7 action-blue
  values, and the focus ring shall remain the action blue at 2px / 2px offset.
- **FR-005 (brand alignment).** The application shall render `--brand-navy` and `--brand-navy-text` at
  the E7 navy value, and `--brand-orange` shall remain at its current value (confirmed match).
- **FR-006 (status hues + AA text).** The application shall render the success / warning / destructive
  / violet status bases and their AA-darkened text variants at the E7 values, and `--warning-foreground`
  shall resolve to the E7 deep-brown amber text (not red).
- **FR-007 (navy-tinted shadows).** The application shall render overlay / popover / drawer / scrim
  shadows with the E7 navy-tinted shadow colors; `--shadow-rest` and `--shadow-brand-button` shall
  continue to derive from `--brand-navy` / `--primary` so they track the new hues automatically.
- **FR-008 (gradients).** The application shall align `--gradient-primary-sheen` and
  `--gradient-surface-wash` to the E7 values, and the surface wash shall be applied to the home/digest
  surface only.
- **FR-009 (chrome surfaces consume tokens).** The header, rail, table-header, card, and pill chrome
  shall render using the warmed tokens, and no chrome CSS shall retain a hardcoded cool literal that
  contradicts §3.
- **FR-010 (dark-theme consistency).** Where the dark scope (`.dark`) is active, the application shall
  keep the shared action-blue and status hues consistent with the light theme and shall warm the
  dark-neutral ramp so the alias layer does not reference stale cool values.
- **FR-011 (type stack confirmed).** The application shall keep Plus Jakarta Sans on the display/heading
  tier, DM Sans on the body/UI/table tier, Inter-tabular on numeric cells only, and SF Mono on
  identifiers — unchanged from the current OD-P3-9 pairing.
- **FR-012 (radius scale confirmed).** The application shall keep the radius scale at 12px
  cards/overlays, 8px controls, 4px tiny, 999px pill — unchanged.
- **FR-013 (token names unchanged).** The application shall introduce no new token names and no `e7-*`
  token; every E7 value shall be ported onto an existing app token name.
- **FR-014 (`DESIGN.md` in sync).** `DESIGN.md` shall document the warmed palette (frontmatter
  `oklch`/HSL values) and shall note, in the relevant named-rule / refresh sections, the Step-1
  reskin so the identity authority matches the runtime.
- **FR-015 (no structural/behavior change).** The Step-1 diff shall alter only `*.css` and
  `DESIGN.md`; it shall not change layout geometry, routes, nav structure, page anatomy, aria-state
  mechanics, action grammar, capture disclosure, or any component markup/logic.

## 5. Non-Functional Requirements

- **NFR-001 (Rule 11 — no re-implementation).** The diff shall not re-implement any existing surface
  or component; it shall not create a new component. All change is token values + chrome CSS literals.
  (Experience Contract Rule 11 — the binding guardrail of this step.)
- **NFR-002 (zero code change).** The diff shall contain **no `*.ts` or `*.tsx` changes.** Only
  `*.css` and `DESIGN.md` (and, if needed, `index.html` font links — though none are required since
  fonts already load via `@fontsource` in `main.tsx`, which is itself unchanged).
- **NFR-003 (gates green, unchanged).** `npm run typecheck` shall exit 0; ESLint (`--max-warnings=0`)
  shall exit 0; `npm test` (Vitest) shall pass with **no test file modified to force a pass.**
- **NFR-004 (no behavioral / DOM-structure diff).** The rendered DOM tree, all ARIA attributes, all
  URLs, and all interactive behavior shall be byte-identical to the pre-Step-1 build; only computed
  style (color/radius/shadow/font) shall differ.
- **NFR-005 (AA contrast preserved).** All warm text-on-warm-surface pairs and all status AA text
  variants shall meet WCAG AA (≥4.5:1 for body text; ≥3:1 for large/UI), verified at the worst-case
  gradient stop where applicable.
- **NFR-006 (dark theme not broken).** The opt-in dark scope shall remain internally consistent and
  AA-compliant after the shared-hue changes.
- **NFR-007 (coverage gate).** If any code line changes, coverage on changed lines shall be ≥80%.
  Expected code delta is ~0 lines (CSS-only); the gate applies vacuously but is re-checked.
- **NFR-008 (de-reference firewall).** The spec text, the token names, and the diff shall contain no
  external brand/product references; no `e7-*` name shall enter the app token namespace.

## 6. Acceptance Criteria (Given/When/Then; each owned by ONE test at the lowest sufficient layer)

> Tag each owning test's title with its AC id so `grep -r AC-###` finds the proof (project convention).

### AC-001 — Resolved token values equal the E7 targets (owns FR-001…007, 010, 013) — **Unit (Vitest, jsdom)**
**Given** the application's global CSS is loaded in a jsdom environment,
**When** the test reads `getComputedStyle(document.documentElement)` for the representative token set
(`--surface-primary`, `--foreground`, `--border`, `--input`, `--accent`, `--brand-navy`,
`--destructive`, `--success`, `--warning`, `--violet`, `--status-*-text`, `--warning-foreground`,
`--shadow-overlay`, `--scrim`) in both the default (light) and `.dark` scopes,
**Then** each resolves to a non-empty value that equals the E7 target (within a tolerance for the
display-p3↔srgb round-trip), and **none** resolves to empty/initial (the silent-fallback regression
class). *Rationale: the app previously lost bare vars and silently fell back; this test owns that
risk directly.*

### AC-002 — Zero source-code change (owns FR-015, NFR-001, NFR-002) — **CI / repo guard (`scripts/pre-merge-check.sh` path filter)**
**Given** the Step-1 branch diff against `dev`,
**When** the guard enumerates changed files,
**Then** every changed file is `*.css` or `DESIGN.md` (allow-list), and **zero** `*.ts`/`*.tsx` files
appear in the diff.

### AC-003 — Typecheck clean (owns NFR-003) — **Mechanical**
**Given** the Step-1 branch checked out,
**When** `npm run typecheck` runs,
**Then** it exits 0 with no errors.

### AC-004 — Lint clean (owns NFR-003) — **Mechanical**
**Given** the Step-1 branch checked out,
**When** ESLint runs with `--max-warnings=0`,
**Then** it exits 0 with no errors and no warnings.

### AC-005 — Unit suite green & unmodified (owns NFR-003, NFR-004) — **Mechanical (Vitest)**
**Given** the Step-1 branch,
**When** `npm test` runs,
**Then** the full Vitest suite passes and **no existing test file was edited** to make it pass (proof
the behavior did not shift to fit the tests — BDD authoring rule).

### AC-006 — Behavioral e2e non-regression (owns NFR-004; fences Contract Rules 1,3,4,5,7,8) — **E2E (Playwright, existing suite)**
**Given** the Step-1 build running,
**When** the existing Playwright suite runs (incl. `AC-410-nav-five-destinations`, `AC-025-026-dashboard-responsive`,
catalog/kitchen/cascade/follow-up specs),
**Then** every spec passes green (no aria/URL/selector/interaction assertion breaks), proving the DOM
structure, routes, aria-state mechanics, and interactions are unchanged.

### AC-007 — AA contrast holds on the warm palette (owns NFR-005, NFR-006) — **Automated a11y (axe-core in e2e, or computed-contrast unit)**
**Given** the warmed palette rendered on Tasks, a record drawer, and Home at 1280px and 390px, in
light and dark,
**When** an automated contrast audit runs,
**Then** no text/interactive pair falls below WCAG AA, and `--warning-foreground` no longer flags as a
red-on-amber failure.

### AC-008 — Visual diff matches the E7 reference; owner sign-off (owns FR-001…009, FR-014; the Step-1 gate) — **Curated visual screenshot review (review ledger `docs/reviews/<branch>.md`)**
**Given** before (current cool) and after (warmed) captures of the screenshot matrix in §7,
**When** the owner reviews the after captures side-by-side with the E7 reference shots,
**Then** the owner signs off that the app "looks like the redesign," and the review ledger records
pass/fail per surface. **This AC is the Step-1 owner gate.**

## 7. Visual screenshot review checklist (defines AC-008's matrix)

**Widths:** `1280px` (desktop) and `390px` (phone).
**States:** `before` (current build) and `after` (Step-1 build), with the **E7 reference shot** shown
beside `after` for direct comparison.
**Capture tool:** Playwright screenshot (or the `agent-browser` CLI) at the exact widths, same fixture
data, same route, deterministic (disable animations + `prefers-reduced-motion`).

| # | Screen | Route / action | 1280px | 390px | Compare vs E7 shot |
|---|---|---|---|---|---|
| V1 | **Tasks workspace** | `/tasks` (table + toolbar + one grouped row) | before·after | before·after | `f3-overdue-desktop/phone` |
| V2 | **Task record drawer** | open a Task → right record panel | before·after | before·after | `frame-desktop` |
| V3 | **Home / dashboard** | `/dashboard` (KPI strip + table + freshness) | before·after | before·after | `f1-posted-desktop/phone`, `signals-desktop` |
| V4 | **App chrome** | cropped rail + top bar (brand, nav items, ⌘K, persona) | before·after | before·after | `frame-desktop`, `palette-desktop` |
| V5 | **Status-pill / KPI gallery** | a view showing open/won/lost/overdue pills + a KPI tile + delta | before·after | before·after | `palette-desktop` |

**Pass bar per capture:** warm (not cool) neutrals; brighter action blue; navy-tinted shadows; AA
status pills; identical layout/density/structure to `before` (only color/texture differs). Any
structural drift in an `after` capture is a fail and blocks sign-off.

## 8. Error / regression handling

| Risk | Trigger / symptom | Detection (AC) | Mitigation |
|---|---|---|---|
| Silent token fallback | a renamed/undefined var → browser discards → invisible border/fill | AC-001 | assert computed value ≠ empty; keep all existing token names (FR-013) |
| Contrast failure | warm text too light on warm surface; status text < AA | AC-007 | use the E7 AA-darkened text variants (FR-006); never base hue as pill text |
| Accidental structure change | a CSS edit alters grid/flex/position/width/height/display | AC-002, AC-006 | review forbids layout-property edits; only color/radius/shadow/font values |
| `--warning-foreground` still red | amber caution text renders red | AC-001, AC-007 | repoint to E7 deep-brown (FR-006) |
| Dark theme break | shared-hue change leaves dark inconsistent | AC-001 (.dark), AC-007 | FR-010 consistency derivation |
| `e7-*` token leaks into app | a new `--e7-*` var is introduced | AC-001 (no such name asserted), NFR-008 | port onto existing names only (FR-013) |
| Font fallback | DM Sans/Plus Jakarta not loaded → system-ui | AC-008 (visual) | leave `@fontsource` loading in `main.tsx` untouched (NFR-002) |
| Density drift | row height/rail width silently changed | AC-006, AC-008 | geometry fenced out (§2.3); row height owned by Step 3 |

## 9. Implementation TODO checklist (handed to the plan; 2–5 min tasks)

1. Choose the seam: repoint the **semantic aliases + bare role vars + Tailwind `--color-*`** to the
   E7 values (single seam so both Tailwind utilities and hand-CSS warm together). Convert each E7
   `hsl()` → `color(display-p3 …)` (ADR-0009 D2). (FR-001…007, FR-013)
2. Restore Single-Border: `--border`/`--input` ← E7 hairline; `--border-strong` ← E7 strong for
   checkboxes/pressed only. (FR-003)
3. Correct `--warning-foreground` → E7 deep-brown (FR-006).
4. Warm shadow tints: overlay/popover/drawer/scrim ← E7 navy-tinted; confirm `--shadow-rest` and
   `--shadow-brand-button` still derive from the moved `--brand-navy`/`--primary`. (FR-007)
5. Align gradients (FR-008); keep `--gradient-surface-wash` on home/digest only.
6. Sweep chrome CSS (header/rail/table-header/card/pill + TasksWorkspace.css etc.) for hardcoded cool
   literals; warm them or route through tokens. (FR-009)
7. Update dark theme for consistency: adopt the new action blue + status hues (shared via aliases) and
   warm the dark-neutral ramp. (FR-010) — derived, not separately approved (see deviation D-3).
8. Update `DESIGN.md` frontmatter `oklch`/HSL values + named-rule/refresh prose to the warm palette;
   add a Step-1 reskin note. (FR-014)
9. Add the AC-001 token-resolution unit test (light + dark).
10. Run gates: typecheck, lint, vitest, Playwright, axe contrast (AC-003…007).
11. Capture the §7 screenshot matrix (before + after + E7 reference); write the review ledger.
12. Four-lens design review (Visual · IxD · IA · Product/JTBD) + **owner visual-diff sign-off (AC-008)**.

## 10. Deviations & self-check (verify-the-work register)

**Every FR is CSS/token/`DESIGN.md`-only.** FR-001…009 are resolved color/shadow/font/radius values
(confirmations for 011/012); FR-013 forbids new token names; FR-014 is a doc update; FR-015 + NFR-001/002
enforce zero code/structure change. **Every AC names its owning layer** (Unit / CI guard / Mechanical /
E2E / a11y / Visual-review).

**Deliberate deviations from the verbatim scope / reference (flagged for owner awareness):**

- **D-1 — Structural geometry fenced OUT.** E7 defines rail-width `232`, content-max `1180`, panel
  `460`, row-height `52`. These are **not ported** this step (kept at app current: rail `236`,
  archetype caps `1280/1080`, DB-view row `50`). Rationale: Step 1 is a pure color/texture diff;
  shell/routes are Step 2 and Tasks density is Step 3. Porting geometry now would mix structure into a
  sign-off meant to be trivially visual.
- **D-2 — Radius / spacing / type are CONFIRMATIONS, not changes.** The scope brief lists these under
  "token groups that change," but the app already matches E7 here (OD-P3-9/10). The honest finding is
  **no change**; this spec refuses to invent drift to match the brief's wording (FR-011/012).
- **D-3 — Dark theme is a consistency derivation.** The E7 reference is light-only. This spec requires
  dark to track the new shared hues + warm neutrals (FR-010) so the alias layer is not left stale, but
  the dark values are **not separately owner-approved** (the sign-off surface is light). Flagged.
- **D-4 — Single-Border Rule restored.** Controls currently use a split `--input: var(--border-strong)`
  for visibility (an unratified divergence noted in `index.css`). E7 restores one border value. This
  reverses that unratified tweak and re-aligns with `DESIGN.md`'s Single-Border Rule — within visual
  scope, but flagged because it changes control-border contrast.
- **D-5 — `--warning-foreground` bug fix bundled in.** It currently resolves to red
  (`--status-lost-text`); E7/`DESIGN.md` require deep-brown. Corrected here (FR-006) as it is a
  token-value fix squarely in scope.
- **D-6 — Contract Rules 1–10 explicitly untouched; Rule 11 actively enforced.** Rules 1,3,4,5,6,7,8,9,10
  are fenced out (§2.3–2.4). Rule 11 (no re-implementation) is the binding NFR-001.

