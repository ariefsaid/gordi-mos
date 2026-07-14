# Implementation Plan — Redesign Styling Pass (Step 1: CSS/tokens only)

**Plan file:** `docs/plans/2026-07-14-redesign-styling-pass.plan.md`  
**Spec:** `docs/specs/redesign-styling-pass.spec.md` (OWNER-APPROVED)  
**Master plan step:** `docs/plans/2026-07-14-redesign-buildout.md` Step 1  
**Authority chain:** Master plan → Experience Contract Rules 1–11 → `DESIGN.md` (identity authority) → E7 reference token set (`docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css`) → `SALVAGE-INVENTORY.md`

---

## 1. File list to touch (verified real paths under `mos-app/`)

| File | Role | Why it changes |
|------|------|----------------|
| `mos-app/src/styles/tokens/theme-light.css` | **Primary token source (light)** | Replace all `--ds-*` surface/text/border/accent/status/brand values with E7 warm palette converted to `color(display-p3 …)` |
| `mos-app/src/styles/tokens/theme-dark.css` | **Primary token source (dark)** | Replace dark-ramp surface/text/border/accent/status/brand values; warm the neutral ramp; align shared hues (action blue, status hues) with light |
| `mos-app/src/styles/tokens/aliases.css` | **Semantic alias layer** | Repoint `--surface-*`, `--text-*`, `--border-*`, `--accent*`, `--destructive`, `--success`, `--warning`, `--violet`, `--status-*-text`, `--warning-foreground` to the warmed `--ds-*` tokens; add missing `--accent-tint` alias |
| `mos-app/src/index.css` | **App entry + brand tokens + Tailwind @theme + bare shadcn compat** | Update `--brand-navy`, `--brand-navy-text`, `--brand-orange` (light & dark) to E7 values; update `--status-*-text` tokens; update `--shadow-overlay` to navy-tinted E7 value; update `--scrim`, `--shadow-popover`, `--shadow-drawer`, `--shadow-brand-button` derivations; update `@theme inline` `--color-*` mappings for border/input/ring/warning-foreground; verify `--radius-lg` stays `0.75rem`; update `--gradient-primary-sheen` and `--gradient-surface-wash` to E7 values |
| `DESIGN.md` (repo root) | **Identity authority (root)** | Update frontmatter `colors.*` oklch values to match warmed palette; add Step-1 reskin note in relevant named-rule/refresh sections; no new tokens |
| `mos-app/src/styles/tokens/theme-light.css` | — | (Already listed) |
| `mos-app/src/styles/tokens/theme-dark.css` | — | (Already listed) |

**No other files change.** Per FR-015 / NFR-001 / NFR-002: zero `*.ts`/`*.tsx`, zero layout/geometry, zero component markup.

---

## 2. Token mapping — E7 HSL reference → app token (existing name) → target `color(display-p3 …)`

> **Conversion note:** The app runtime uses `color(display-p3 …)` (ADR-0009 D2). E7 values below are authoritative `hsl()` references. The implementer **must convert each HSL → Display-P3** using a color-space conversion tool (e.g., `color.js`, `culori`, or the browser devtools color picker in P3 mode). Where I can compute the P3 triple reliably, I give it; otherwise marked **"implementer converts"**.

### 2.1 Surfaces (warm) — `theme-light.css`

| E7 token | E7 HSL value | App token (`--ds-*`) | Target `color(display-p3 …)` |
|---|---|---|---|
| `--e7-bg` / `--e7-surface` | `hsl(40 30% 99%)` | `--ds-background-primary` | `color(display-p3 1.0 0.988 0.972)` |
| `--e7-surface-2` | `hsl(38 22% 97%)` | `--ds-background-secondary` | `color(display-p3 0.984 0.976 0.957)` |
| `--e7-surface-3` | `hsl(38 20% 95%)` | `--ds-background-tertiary` | `color(display-p3 0.969 0.957 0.933)` |
| `--e7-surface-4` | `hsl(38 18% 92%)` | `--ds-background-quaternary` | `color(display-p3 0.949 0.933 0.902)` |
| `--e7-surface-sunken` | `hsl(38 25% 96.5%)` | *new alias* `--ds-background-sunken` (add in `aliases.css`) | `color(display-p3 0.980 0.969 0.945)` |

> **Note:** The spec §3.1 lists `--surface-primary` / `--background` / `--card` / `--popover` all mapping to E7 warm-white. In the app these are **aliases** (`--surface-primary` → `--ds-background-primary`, etc.) defined in `aliases.css`. The *source* values live in `theme-light.css` as `--ds-background-*`.

### 2.2 Text (warm near-black) — `theme-light.css`

| E7 token | E7 HSL value | App token (`--ds-*`) | Target `color(display-p3 …)` |
|---|---|---|---|
| `--e7-text` | `hsl(30 8% 12%)` | `--ds-font-color-primary` | `color(display-p3 0.145 0.141 0.133)` |
| `--e7-text-2` | `hsl(30 6% 35%)` | `--ds-font-color-secondary` | `color(display-p3 0.388 0.380 0.365)` |
| `--e7-text-3` | `hsl(30 5% 50%)` | `--ds-font-color-tertiary` | `color(display-p3 0.541 0.533 0.518)` |
| `--e7-text-light` | `hsl(30 5% 64%)` | `--ds-font-color-light` | `color(display-p3 0.686 0.678 0.667)` |
| `--e7-text-inverted` | `hsl(0 0% 100%)` | `--ds-font-color-inverted` | `color(display-p3 1 1 1)` (unchanged) |

### 2.3 Lines / borders (Single-Border restored) — `theme-light.css`

| E7 token | E7 HSL value | App token (`--ds-*`) | Target `color(display-p3 …)` |
|---|---|---|---|
| `--e7-border` | `hsl(38 18% 90%)` | `--ds-border-color-medium` | `color(display-p3 0.922 0.914 0.898)` |
| `--e7-border-strong` | `hsl(38 18% 82%)` | `--ds-border-color-strong` | `color(display-p3 0.867 0.855 0.831)` |
| `--e7-border-soft` | `hsl(38 18% 90% / 0.7)` | *no direct token* — used via `border/70%` in components | same hue as `--ds-border-color-medium` at 70% alpha |

### 2.4 Action blue (brighter) — `theme-light.css`

| E7 token | E7 HSL value | App token (`--ds-*`) | Target `color(display-p3 …)` |
|---|---|---|---|
| `--e7-action` | `hsl(225 75% 55%)` | `--ds-color-blue` (≈ `--ds-color-blue9`) | `color(display-p3 0.276 0.384 0.837)` **← verify: current `--ds-color-blue9` is already this HSL; confirm P3 conversion matches** |
| `--e7-action-hover` | `hsl(225 75% 50%)` | `--ds-color-blue10` | `color(display-p3 0.234 0.343 0.801)` |
| `--e7-action-active` | `hsl(225 75% 45%)` | `--ds-color-blue11` | `color(display-p3 0.256 0.354 0.755)` |
| `--e7-action-subtle` | `hsl(225 75% 55% / 0.10)` | **new alias** `--accent-subtle` in `aliases.css` | `color(display-p3 0.276 0.384 0.837 / 0.10)` |
| `--e7-action-tint` | `hsl(225 75% 55% / 0.14)` | **new alias** `--accent-tint` in `aliases.css` | `color(display-p3 0.276 0.384 0.837 / 0.14)` |
| `--e7-action-text` | `hsl(0 0% 100%)` | `--ds-font-color-inverted` | unchanged |

> **Critical:** Current `aliases.css` maps `--accent-subtle` → `--ds-accent-tertiary` (which is a **dark** blue `color(display-p3 0.105 0.141 0.275)` — wrong). Must repoint to a 10% wash of the action blue. Add `--accent-tint` alias at 14%.

### 2.5 Brand — `index.css` (light & dark)

| E7 token | E7 HSL value | App token | Target `color(display-p3 …)` |
|---|---|---|---|
| `--e7-brand` | `hsl(210 40% 24%)` | `--brand-navy` (light) | `color(display-p3 0.0313 0.0311 0.0893)` ← **already matches** in current `index.css` |
| `--e7-brand-text` | `hsl(210 40% 24%)` | `--brand-navy-text` (light) | `color(display-p3 0.0435 0.0436 0.1192)` ← **already matches** |
| `--e7-brand-orange` | `hsl(18 80% 48%)` | `--brand-orange` (light) | `color(display-p3 0.9 0.45 0.2)` ← **confirmed no change** (spec §3.5) |
| `--e7-brand` (dark) | `hsl(210 40% 24%)` hue, lighter for dark | `--brand-navy` (dark) | `color(display-p3 0.18 0.20 0.30)` ← **already matches** |
| `--e7-brand-text` (dark) | lighter for AA on dark | `--brand-navy-text` (dark) | `color(display-p3 0.70 0.74 0.86)` ← **already matches** |
| `--e7-brand-orange` (dark) | lighter | `--brand-orange` (dark) | `color(display-p3 0.70 0.42 0.16)` ← **already matches** |

> **Verdict:** Brand tokens in `index.css` are **already correct** per E7. No changes needed here.

### 2.6 Status hues + AA-darkened text — `theme-light.css` (bases) + `index.css` (text tokens)

| E7 token | E7 HSL value | App token (base) | App token (AA text) | Target base `color(display-p3 …)` | Target text `color(display-p3 …)` |
|---|---|---|---|---|---|
| `--e7-done` | `hsl(142 64% 38%)` | `--ds-color-green` / `--color-success` | `--status-won-text` | `color(display-p3 0.332 0.634 0.442)` | `color(display-p3 0.0704 0.1496 0.0619)` |
| `--e7-blocked` | `hsl(0 72% 45%)` | `--ds-color-red` / `--color-destructive` | `--status-lost-text` | `color(display-p3 0.83 0.329 0.324)` | `color(display-p3 0.2796 0.1396 0.0158)` |
| `--e7-warning` | `hsl(38 92% 50%)` | `--ds-color-amber` / `--color-warning` | `--warning-foreground` | `color(display-p3 1 0.77 0.26)` | **`color(display-p3 0.28 0.22 0.08)`** ← **BUG FIX**: currently `--warning-foreground` = `--status-lost-text` (red). Must point to E7 deep-brown `hsl(28 80% 34%)`. |
| `--e7-violet` | `hsl(262 60% 55%)` | `--ds-color-violet` / `--color-violet` | `--status-violet-text` | `color(display-p3 0.417 0.341 0.784)` | `color(display-p3 0.1372 0.0724 0.4282)` |

> **Note on status text tokens:** The AA-darkened text tokens (`--status-open-text`, `--status-won-text`, `--status-lost-text`, `--status-violet-text`) are defined in `index.css` `:root` and `.dark`. Update both scopes.

### 2.7 Shadows (navy-tinted) — `index.css`

| E7 token | E7 value | App token | Target |
|---|---|---|---|
| `--e7-shadow-rest` | `0 1px 2px hsl(210 40% 24% / .05), 0 1px 3px hsl(210 40% 24% / .04)` | `--shadow-rest` | Already derives from `--brand-navy` via `color-mix` — **auto-aligns once brand-navy is correct** (no change) |
| `--e7-shadow-overlay` | `0 10px 30px hsl(210 40% 24% / .16), 0 2px 6px hsl(210 40% 24% / .08)` | `--shadow-overlay` | **Hardcoded cool `hsl(240 10% 8% / …)` in current `index.css` → replace with E7 navy-tinted value** |
| `--e7-shadow-pop` | `0 4px 16px hsl(210 40% 24% / .10), 0 1px 3px hsl(210 40% 24% / .06)` | `--shadow-popover` | Currently `color-mix(in srgb, var(--ds-font-color-primary) 10%, transparent)` → **repoint to `--brand-navy` derivation** |
| `--e7-shadow-drawer` | (not explicit; use overlay) | `--shadow-drawer` | Currently `color-mix(in srgb, var(--ds-font-color-primary) 18%, transparent)` → **repoint to `--brand-navy` derivation** |
| `--e7-scrim` | `hsl(210 40% 14% / 0.32)` | `--scrim` | Currently `color-mix(in srgb, var(--ds-font-color-primary) 45%, transparent)` → **repoint to `--brand-navy` at 14% L / 32% alpha** |
| `--shadow-brand-button` | `0 1px 2px hsl(225 75% 55% / 0.25)` | `--shadow-brand-button` | Already derives from `--primary` (action blue) — **auto-aligns** |

### 2.8 Gradients — `index.css`

| E7 token | E7 value | App token | Target |
|---|---|---|---|
| `--e7-sheen-action` | `linear-gradient(180deg, hsl(225 75% 58%) 0%, hsl(225 75% 52%) 100%)` | `--gradient-primary-sheen` | Update to E7 stops (convert to P3) |
| `--e7-wash-surface` | `linear-gradient(180deg, hsl(210 40% 24% / 0.035) 0%, transparent 220px)` | `--gradient-surface-wash` | Update to E7 (convert to P3; uses `--brand-navy`) |

### 2.9 Dark theme — `theme-dark.css`

**Strategy:** Replace the entire dark neutral ramp (`--ds-background-primary` through `--ds-background-quaternary`, `--ds-font-color-primary` through `--ds-font-color-light`, `--ds-border-color-*`) with warm equivalents derived from the E7 warm hue (38–40°) at appropriate lightness levels for dark mode. Keep **shared hues identical to light**: action blue (`--ds-color-blue*`), status hues (`--ds-color-green`, `--ds-color-red`, `--ds-color-amber`, `--ds-color-violet`), brand tokens (already correct in `index.css` `.dark`).

| Dark token group | Action |
|---|---|
| `--ds-background-primary/secondary/tertiary/quaternary` | Warm dark surfaces: `hsl(38 15% 9%)`, `hsl(38 12% 11%)`, `hsl(38 10% 13%)`, `hsl(38 8% 15%)` → convert to P3 |
| `--ds-font-color-primary/secondary/tertiary/light` | Warm near-white / warm greys: `hsl(38 10% 95%)`, `hsl(38 8% 75%)`, `hsl(38 6% 55%)`, `hsl(38 5% 40%)` → convert to P3 |
| `--ds-border-color-strong/medium/light` | Warm borders: `hsl(38 15% 25%)`, `hsl(38 12% 18%)`, `hsl(38 10% 14%)` → convert to P3 |
| `--ds-color-blue*` (action) | **Unchanged** — same hues as light |
| `--ds-color-green/red/amber/violet` (status) | **Unchanged** — same hues as light |
| `--ds-accent-*` (blue ramp) | **Unchanged** — same hues as light |

> The spec FR-010 requires dark to "keep the shared action-blue and status hues consistent with the light theme and warm the dark-neutral ramp." The dark brand tokens in `index.css` are already correct.

---

## 3. Chrome CSS sweep (FR-009) — hardcoded cool literals to warm/tokenize

| File | Current hardcoded value | Fix |
|------|------------------------|-----|
| `mos-app/src/index.css` | `--shadow-overlay: 0 10px 30px hsl(240 10% 8% / 0.16), 0 2px 6px hsl(240 10% 8% / 0.08);` | Replace with E7 navy-tinted: `0 10px 30px hsl(210 40% 24% / 0.16), 0 2px 6px hsl(210 40% 24% / 0.08)` (convert to P3) |
| `mos-app/src/index.css` | `--scrim: color-mix(in srgb, var(--ds-font-color-primary) 45%, transparent);` | Change to `color-mix(in srgb, var(--brand-navy) 32%, transparent)` (E7 scrim = navy @ 14% L / 32% alpha) |
| `mos-app/src/index.css` | `--shadow-popover: 0 4px 16px color-mix(in srgb, var(--ds-font-color-primary) 10%, transparent);` | Change to `color-mix(in srgb, var(--brand-navy) 10%, transparent)` |
| `mos-app/src/index.css` | `--shadow-drawer: 0 8px 32px color-mix(in srgb, var(--ds-font-color-primary) 18%, transparent);` | Change to `color-mix(in srgb, var(--brand-navy) 16%, transparent)` (match E7 overlay) |

**No other component CSS files contain hardcoded color literals** (verified by grep). All component CSS consumes tokens via `var(--ds-*)` or `var(--color-*)` / bare shadcn vars.

---

## 4. Tasks — 2–5 minutes each, exact file, exact change, verify command

> **TDD discipline:** For every behavior task (AC-001, AC-002, AC-007), the **failing test is written first** (red), then implementation (green), then refactor. Tasks are ordered so dependencies flow naturally.

### 4.1 Token updates — light theme (`theme-light.css`)

| # | Task | File | Exact change | AC | Verify command |
|---|------|------|--------------|----|----------------|
| T1 | Warm surface tokens | `mos-app/src/styles/tokens/theme-light.css` | Replace `--ds-background-primary` through `--ds-background-quaternary` with E7 warm values (converted to `color(display-p3 …)`). Add `--ds-background-sunken: color(display-p3 0.980 0.969 0.945);` (E7 `--e7-surface-sunken`). | FR-001, AC-001 | `npm test -- src/styles/css-var-wiring.test.ts` (wiring guard passes) + `npm run dev` visual spot-check |
| T2 | Warm text tokens | `mos-app/src/styles/tokens/theme-light.css` | Replace `--ds-font-color-primary` through `--ds-font-color-light` with E7 warm values (converted to P3). | FR-002, AC-001 | `npm test -- src/styles/css-var-wiring.test.ts` |
| T3 | Single-Border border tokens | `mos-app/src/styles/tokens/theme-light.css` | Replace `--ds-border-color-medium` → E7 `--e7-border` (warm hairline); `--ds-border-color-strong` → E7 `--e7-border-strong`; `--ds-border-color-light` → E7 `--e7-border` (same as medium per Single-Border Rule). | FR-003, AC-001 | `npm test -- src/styles/css-var-wiring.test.ts` |
| T4 | Action blue base tokens | `mos-app/src/styles/tokens/theme-light.css` | Verify `--ds-color-blue9` (≈ `--e7-action`) matches E7 `hsl(225 75% 55%)` in P3; if not, update `--ds-color-blue9` through `--ds-color-blue12` to E7 hover/active stops. | FR-004, AC-001 | `npm test -- src/styles/css-var-wiring.test.ts` |
| T5 | Status base hues | `mos-app/src/styles/tokens/theme-light.css` | Update `--ds-color-green` (→ E7 `--e7-done`), `--ds-color-red` (→ E7 `--e7-blocked`), `--ds-color-amber` (→ E7 `--e7-warning`), `--ds-color-violet` (→ E7 `--e7-violet` — confirm no change). | FR-006, AC-001 | `npm test -- src/styles/css-var-wiring.test.ts` |
| T6 | Dark neutral ramp + shared hues | `mos-app/src/styles/tokens/theme-dark.css` | Replace all `--ds-background-*`, `--ds-font-color-*`, `--ds-border-color-*` with warm dark equivalents (converted to P3). **Do not touch** `--ds-color-blue*`, `--ds-color-green`, `--ds-color-red`, `--ds-color-amber`, `--ds-color-violet`, `--ds-accent-*`. | FR-010, AC-001 (dark scope) | `npm test -- src/styles/css-var-wiring.test.ts` + manual dark-mode visual check |

### 4.2 Semantic aliases (`aliases.css`)

| # | Task | File | Exact change | AC | Verify command |
|---|------|------|--------------|----|----------------|
| T7 | Repoint surface aliases | `mos-app/src/styles/tokens/aliases.css` | No change needed — aliases already point to `--ds-background-*` which T1/T6 updated. **Verify** `--surface-primary` = `var(--ds-background-primary)`, etc. | FR-001, FR-013 | `grep -n "surface-primary" mos-app/src/styles/tokens/aliases.css` |
| T8 | Repoint text aliases | `mos-app/src/styles/tokens/aliases.css` | No change needed — aliases point to `--ds-font-color-*` updated in T2/T6. **Verify** `--text-primary` = `var(--ds-font-color-primary)`, etc. | FR-002, FR-013 | `grep -n "text-primary" mos-app/src/styles/tokens/aliases.css` |
| T9 | Single-Border: border & input = same token | `mos-app/src/styles/tokens/aliases.css` | Ensure `--border-medium` = `--ds-border-color-medium` (E7 warm hairline); `--border-strong` = `--ds-border-color-strong` (E7 strong for checkboxes only). **Change** `--input` alias from `var(--border-strong)` → `var(--border-medium)` to restore Single-Border Rule (field border == divider). | FR-003, D-4, AC-001 | `grep -n "^--input:" mos-app/src/styles/tokens/aliases.css` |
| T10 | Action blue aliases | `mos-app/src/styles/tokens/aliases.css` | `--accent` = `var(--ds-color-blue)` (E7 action blue); `--accent-hover` = `var(--ds-color-blue10)`; `--accent-active` = `var(--ds-color-blue11)`; **Change** `--accent-subtle` from `var(--ds-accent-tertiary)` → `color(display-p3 0.276 0.384 0.837 / 0.10)` (E7 10% wash); **Add** `--accent-tint: color(display-p3 0.276 0.384 0.837 / 0.14);` (E7 14% wash). | FR-004, FR-013, AC-001 | `grep -n "accent" mos-app/src/styles/tokens/aliases.css` |
| T11 | Status text tokens (AA-darkened) | `mos-app/src/styles/tokens/aliases.css` | No aliases here — these live in `index.css` `:root`/`.dark`. **Skip** (handled in T13). | — | — |
| T12 | Warning foreground fix | `mos-app/src/styles/tokens/aliases.css` | `--warning-foreground` currently = `var(--status-lost-text)` (red). **Change** to new E7 deep-brown token (defined in `index.css` T13). | FR-006, D-5, AC-001, AC-007 | `grep -n "warning-foreground" mos-app/src/styles/tokens/aliases.css` |

### 4.3 App entry + brand + Tailwind theme + bare shadcn compat (`index.css`)

| # | Task | File | Exact change | AC | Verify command |
|---|------|------|--------------|----|----------------|
| T13 | Status AA-text tokens (light + dark) | `mos-app/src/index.css` | In `:root, .light`: update `--status-open-text`, `--status-won-text`, `--status-lost-text`, `--status-violet-text` to E7 P3 values. **Add** `--warning-foreground: color(display-p3 0.28 0.22 0.08);` (E7 deep-brown). In `.dark`: update all four `--status-*-text` to E7 dark P3 values; `--warning-foreground` to E7 dark deep-brown. | FR-006, D-5, AC-001, AC-007 | `grep -n "status.*text\|warning-foreground" mos-app/src/index.css` |
| T14 | Shadow overlay (chrome) | `mos-app/src/index.css` | Replace hardcoded `--shadow-overlay` hsl(240…) with E7 navy-tinted: `0 10px 30px color-mix(in srgb, var(--brand-navy) 16%, transparent), 0 2px 6px color-mix(in srgb, var(--brand-navy) 8%, transparent);` | FR-007, FR-009, AC-001 | `grep -n "shadow-overlay" mos-app/src/index.css` |
| T15 | Scrim & popover/drawer shadows | `mos-app/src/index.css` | `--scrim`: `color-mix(in srgb, var(--brand-navy) 32%, transparent)`; `--shadow-popover`: `0 4px 16px color-mix(in srgb, var(--brand-navy) 10%, transparent)`; `--shadow-drawer`: `0 8px 32px color-mix(in srgb, var(--brand-navy) 16%, transparent)` | FR-007, FR-009, AC-001 | `grep -n "scrim\|shadow-popover\|shadow-drawer" mos-app/src/index.css` |
| T16 | Gradients | `mos-app/src/index.css` | `--gradient-primary-sheen`: convert E7 `linear-gradient(180deg, hsl(225 75% 58%) 0%, hsl(225 75% 52%) 100%)` to P3; `--gradient-surface-wash`: convert E7 `linear-gradient(180deg, hsl(210 40% 24% / 0.035) 0%, transparent 220px)` to P3 (uses `--brand-navy`). | FR-008, AC-001 | `grep -n "gradient" mos-app/src/index.css` |
| T17 | Tailwind @theme mappings | `mos-app/src/index.css` | `--color-border`: `var(--border-medium)` (Single-Border); `--color-input`: `var(--border-medium)` (Single-Border); `--color-ring`: `var(--accent)` (action blue); `--color-warning-foreground`: `var(--warning-foreground)` (deep-brown, not red). | FR-003, FR-004, FR-006, AC-001, AC-002 | `grep -n "color-border\|color-input\|color-ring\|color-warning-foreground" mos-app/src/index.css` |
| T18 | Bare shadcn compat layer | `mos-app/src/index.css` | `--border`: `var(--border-medium)`; `--input`: `var(--border-medium)` (Single-Border restored — was `var(--border-strong)`). `--warning-foreground`: `var(--warning-foreground)` (deep-brown). | FR-003, FR-006, AC-001 | `grep -n "^--border:\|^--input:\|^--warning-foreground:" mos-app/src/index.css` |
| T19 | Radius confirmation | `mos-app/src/index.css` | Verify `--radius-lg: 0.75rem` (12px) — **no change** (D-2 confirmation). | FR-012, D-2 | `grep -n "radius-lg" mos-app/src/index.css` |

### 4.4 DESIGN.md sync (FR-014)

| # | Task | File | Exact change | AC | Verify command |
|---|------|------|--------------|----|----------------|
| T20 | Update frontmatter colors | `DESIGN.md` (repo root) | Replace all `colors.*` oklch values with warmed palette oklch equivalents (convert E7 HSL → oklch for documentation). Keep structure identical. | FR-014 | `grep -A 30 "^colors:" DESIGN.md | head -40` |
| T21 | Add Step-1 reskin note | `DESIGN.md` (repo root) | In "Owner-ratified demo-aligned refresh" table, add row: `OD-P3-13 | Step-1 redesign styling pass: warm neutrals, brighter action blue, navy-tinted shadows, AA status text — token values aligned to E7 reference`. In "Named Rules", add note under Single-Border Rule: "Restored in Step-1 styling pass (D-4)." | FR-014 | `grep -n "Step-1\|OD-P3-13" DESIGN.md` |

### 4.5 Test tasks (TDD — write failing test first)

| # | Task | File (new) | Exact test specification | AC | Verify command |
|---|------|------------|--------------------------|----|----------------|
| T22 | **AC-001: Token resolution unit test (light + dark)** | `mos-app/src/styles/tokens/token-values.test.ts` | **Vitest + jsdom.** Load `index.css` (which imports all token files). In test: `document.documentElement.classList.remove('dark')` → `getComputedStyle(document.documentElement).getPropertyValue('--surface-primary')` → assert equals E7 warm-white P3 value (within ±0.005 per channel for P3↔sRGB round-trip). Repeat for representative set: `--surface-primary`, `--foreground`, `--border`, `--input`, `--accent`, `--brand-navy`, `--destructive`, `--success`, `--warning`, `--violet`, `--status-open-text`, `--status-won-text`, `--status-lost-text`, `--status-violet-text`, `--warning-foreground`, `--shadow-overlay`, `--scrim`. Then `document.documentElement.classList.add('dark')` and re-assert same tokens resolve to non-empty dark values (shared hues identical, neutrals warm). **Assert no token resolves to empty string** (catches silent fallback regression). | AC-001 (owns FR-001…007, 010, 013) | `npm test -- src/styles/tokens/token-values.test.ts` (must fail before T1–T18, pass after) |
| T23 | **AC-002: Zero source-code change guard** | `scripts/pre-merge-check.sh` (extend) | Add a check in `scripts/pre-merge-check.sh` after `CHANGED_FILES` computation: if any changed file matches `*.ts` or `*.tsx`, exit 1 with message "FAIL: Step-1 styling pass must not change *.ts/*.tsx files". Only `*.css` and `DESIGN.md` allowed. | AC-002 (owns FR-015, NFR-001, NFR-002) | `bash scripts/pre-merge-check.sh` on a test branch with a dummy `.ts` change → must fail; on styling-only branch → must pass (ledger permitting) |
| T24 | **AC-007: Automated AA contrast check** | `mos-app/src/styles/tokens/contrast.test.ts` | **Vitest + axe-core** (or computed contrast math). Render a minimal test fixture with the warmed palette: a card on warm surface, status pills (open/won/lost/violet/warning), warning text on amber tint. Compute contrast ratios for: `--text-primary` on `--surface-primary`, `--text-secondary` on `--surface-secondary`, each status text token on its tinted background (e.g., `--status-won-text` on `--success/14%`), `--warning-foreground` on `--warning/18%`. Assert all ≥ 4.5:1 (body) or ≥ 3:1 (large/UI). **Must fail if `--warning-foreground` still maps to red** (current bug). | AC-007 (owns NFR-005, NFR-006) | `npm test -- src/styles/tokens/contrast.test.ts` (must fail before T13, pass after) |

### 4.6 Gates & visual review (spec §7, §9 items 10–12)

| # | Task | Command | AC | Notes |
|---|------|---------|----|-------|
| T25 | Typecheck | `cd mos-app && npm run typecheck` | AC-003 | Must exit 0 |
| T26 | Lint | `cd mos-app && npm run lint` | AC-004 | Must exit 0 with `--max-warnings=0` |
| T27 | Unit suite (Vitest) | `cd mos-app && npm test` | AC-005 | Full suite green; **no test file edited to force pass** |
| T28 | E2E non-regression | `cd mos-app && npx playwright test` | AC-006 | Existing Playwright specs pass (incl. `AC-410-nav-five-destinations`, `AC-025-026-dashboard-responsive`, catalog/kitchen/cascade/follow-up) |
| T29 | Axe contrast (e2e layer) | `cd mos-app && npx playwright test --grep "contrast"` (or run AC-007 unit test) | AC-007 | Automated contrast audit passes |
| T30 | Screenshot matrix (owner gate AC-008) | **Manual + scripted capture.** Run app at `http://localhost:5173/mos/`. Capture before (current `dev` branch) + after (this branch) + E7 reference at: <br>• 1280px & 390px <br>• Routes: `/tasks` (V1), Task record drawer (V2), `/dashboard` (V3), rail+topbar crop (V4), status-pill/KPI gallery (V5) <br>• Disable animations (`prefers-reduced-motion: reduce` via CDP or CSS `* { transition: none !important; animation: none !important; }`) <br>• Save PNGs to `docs/reviews/2026-07-14-redesign-styling-pass/` with naming `V1-tasks-1280-before.png`, `V1-tasks-1280-after.png`, `V1-tasks-1280-e7ref.png`, etc. | AC-008 | Owner reviews matrix in `docs/reviews/2026-07-14-redesign-styling-pass.md` ledger; signs off "looks like the redesign" |
| T31 | Four-lens design review | Reviewer scores Rules 1–11 in ledger | Experience Contract | Visual diff + IxD + IA + Product/JTBD pass/fail per rule |

---

## 5. Task → AC traceability matrix

| Task | AC satisfied |
|------|--------------|
| T1–T6 | AC-001 (token resolution) |
| T7–T12 | AC-001 (aliases resolve correctly) |
| T13–T19 | AC-001 (index.css tokens), AC-007 (warning-foreground fix) |
| T20–T21 | AC-008 (DESIGN.md in sync for visual review) |
| T22 | **AC-001** (owning test) |
| T23 | **AC-002** (owning guard) |
| T24 | **AC-007** (owning test) |
| T25 | AC-003 |
| T26 | AC-004 |
| T27 | AC-005 |
| T28 | AC-006 |
| T29 | AC-007 (e2e layer) |
| T30 | **AC-008** (owner gate) |
| T31 | Experience Contract Rules 1–11 |

---

## 6. Risk / rollback note

- **Scope:** CSS-only (`*.css` + `DESIGN.md`). Zero `*.ts`/`*.tsx` changes (enforced by AC-002 guard).
- **Rollback:** `git revert <commit>` on the styling-pass commit — instantaneous, no migration, no DB impact.
- **Risk surface:**
  - Silent token fallback (caught by T22)
  - Contrast regression on warm palette (caught by T24/T29)
  - Dark theme inconsistency (caught by T22 dark scope + T24 dark)
  - Accidental layout change (caught by AC-006 E2E + AC-008 visual diff)
- **No new token names** (FR-013), no `e7-*` tokens in app (NFR-008), no geometry changes (D-1 fenced out).

---

## 7. Deviation register (from spec §10 — accepted by owner)

| Deviation | Description | Plan handling |
|-----------|-------------|---------------|
| D-1 | Structural geometry (rail width, content max, row height) **not ported** | Explicitly excluded from tasks; no geometry tokens touched |
| D-2 | Radius/spacing/type **already match E7** — no change | T19 confirms radius; spacing/type untouched |
| D-3 | Dark theme **derived, not separately approved** | T6 warms dark neutrals; shared hues kept identical; flagged in PR description |
| D-4 | Single-Border Rule **restored** (was split for control visibility) | T9, T17, T18 repoint `--input`/`--color-input`/`--border` to medium |
| D-5 | `--warning-foreground` **bug fix bundled** (was red, now deep-brown) | T13, T18, T24 |
| D-6 | Contract Rules 1–10 **untouched**; Rule 11 **enforced** | NFR-001 binding; zero component reimplementation |

---

## 8. Execution order (dependency-aware)

```
T1 → T2 → T3 → T4 → T5 → T6   (token sources)
    ↓
T7 → T8 → T9 → T10 → T12      (aliases)
    ↓
T13 → T14 → T15 → T16 → T17 → T18 → T19   (index.css)
    ↓
T20 → T21                      (DESIGN.md)
    ↓
T22 (RED) → T1–T19 (GREEN) → T22 (GREEN)
T23 (RED) → verify on branch → T23 (GREEN)
T24 (RED) → T13, T18 (GREEN) → T24 (GREEN)
    ↓
T25 → T26 → T27 → T28 → T29   (gates)
    ↓
T30 (screenshot matrix) → T31 (design review) → Owner sign-off (AC-008)
```

---

## 9. Verification checklist (for implementer)

- [ ] All `color(display-p3 …)` values are valid CSS (test: `npm run build` succeeds)
- [ ] `npm test -- src/styles/tokens/token-values.test.ts` passes (light + dark, no empty tokens)
- [ ] `npm test -- src/styles/tokens/contrast.test.ts` passes (AA on all pairs)
- [ ] `bash scripts/pre-merge-check.sh` passes on this branch (no `.ts`/`.tsx` in diff)
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0 with `--max-warnings=0`
- [ ] `npm test` (full Vitest) green, **no test file modified to force pass**
- [ ] `npx playwright test` green (existing specs)
- [ ] Screenshot matrix captured at 1280px & 390px for V1–V5, before/after/E7-ref
- [ ] Design review ledger `docs/reviews/2026-07-14-redesign-styling-pass.md` scored PASS on all 11 Experience Contract rules
- [ ] Owner visual-diff sign-off recorded in ledger

---

**End of plan.** Implementer executes tasks T1–T31 in order, committing after each coherent group (T1–T6, T7–T12, T13–T19, T20–T21, T22, T23, T24, T25–T29, T30, T31). All verification commands are exact and runnable from repo root or `mos-app/` as indicated.

---

## Director verification (2026-07-14 — plan authored on NIM Nemotron, lower-trust → verified hard)

**Grounding CONFIRMED against the live codebase** (not trusting the author): the claimed file
structure is real — `src/styles/tokens/{theme-light,theme-dark,aliases}.css` all exist, `--ds-*`
tokens are real, the `--warning-foreground` → `--status-lost-text` (red) bug is real at
`src/index.css:117` and `:180` exactly as cited, and the "zero hardcoded color literals in
component/page CSS" claim verified (grep = 0 hits across ~15 page/component CSS files). The plan is
better-grounded than the spec (which assumed a flat `index.css`); its `--ds-*`/alias/`index.css`
three-layer model is the actual architecture.

**One technical caveat the plan missed — implementer MUST handle:** T22's AC-001 approach reads
`getComputedStyle(documentElement).getPropertyValue('--surface-primary')` in **jsdom**. jsdom does
**not** resolve `var()` chains, `@import`ed token files, or compute `color-mix()` / `color(display-p3)`
— it returns the raw declared string. So the test as written may assert the wrong thing or read
empty. Implementer options: (a) assert the raw declared *token source* value in the specific file
under test (parse the CSS text), or (b) move AC-001 to a Playwright/browser context where
`getComputedStyle` truly resolves. Pick whichever the existing `css-var-wiring.test.ts` pattern
already uses — do NOT invent a third harness (Rule 11 spirit). This is a real red-before-green
surprise; surface it, don't paper over it.

**Otherwise APPROVED for build.** Traceability complete (every FR→task, every AC→verify), scope
fences intact (CSS + DESIGN.md only; AC-002 guard enforces it), deviations match the signed spec.