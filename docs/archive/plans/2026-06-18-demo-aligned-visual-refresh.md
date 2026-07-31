# Demo-aligned visual refresh — UI Design-Plan (design-architect)

**Date:** 2026-06-18 · **Author:** design-architect · **For:** ui-implementer
**Status:** Design-plan anchoring the OD-P3-9..12 owner divergences (ratified 2026-06-18). DESIGN.md is updated; this is the buildable token+file change list.

## Oracles (binding inputs — do not re-decide)
- **Design system (amended):** `DESIGN.md` (repo root) — §3 Typography, §4 Elevation, §4b Gradients, §5 Components, §6 Do/Don'ts, implementer notes 1–9, and the new "Owner-ratified demo-aligned refresh" §. **The token values below are copied from there; do not invent new ones.**
- **Decisions:** OD-P3-9 (fonts), OD-P3-10 (radius), OD-P3-11 (soft elevation), OD-P3-12 (gradients). All four are ratified 2026-06-18.
- **Identity guard:** this is a *texture* refresh, NOT a re-skin. The One Blue Rule, near-monochrome palette, Single-Border Rule, density (16px card pad / 32px controls / roomy rows), Tinted-Status pattern, RACI/progress/ops/MOS-density tokens are **unchanged** — touch them only where a font/radius/elevation/gradient change mechanically requires it.

> **Scope note.** No net-new visual direction. Every value here names a DESIGN.md token. The one genuine open risk (DM Sans `tnum`) has a documented contingency (Task 9). The Director merges; the owner is told which `tnum` path the build took.

---

## The four token changes (authoritative values)

| OD | Token | Old | New |
|---|---|---|---|
| P3-9 | `--font-sans` (body/UI/table) | Inter Variable | `"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif` |
| P3-9 | `--font-display` (NEW; page-title/heading/subheading) | — (was Inter) | `"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif` |
| P3-9 | page-title weight / tracking | 700 / `-0.02em` | **600 / `-0.01em`** |
| P3-9 | heading tracking | `-0.01em` | **`normal`** |
| P3-10 | `--radius` | `0.5rem` (8px) | **`0.75rem` (12px)** |
| P3-10 | radius scale | lg 8 / md 6 / sm 4 | **lg 12 (cards/overlays) · md 10 · sm 8 (controls) · xs 4 (checkbox)** |
| P3-11 | `--shadow-rest` (NEW) | — | `0 1px 2px hsl(222 18% 12% / 0.05), 0 1px 3px hsl(222 18% 12% / 0.04)` |
| P3-12 | `--gradient-primary-sheen` (NEW) | — | `linear-gradient(180deg, hsl(221.2 83.2% 56%) 0%, hsl(221.2 83.2% 51%) 100%)` |
| P3-12 | `--gradient-surface-wash` (NEW) | — | `linear-gradient(180deg, hsl(218 46% 22% / 0.035) 0%, hsl(218 46% 22% / 0) 220px)` |

**Radius classification (OD-P3-10 taste guard — memorize this):**
- **Cards / containers / overlays → 12px** (`rounded-lg` / `var(--radius)`): the `bg-card border border-border` surfaces, KPI tiles, kanban cards, mobile reflow cards, the row-menu popover, toasts, modal dialogs.
- **Controls → 8px** (`rounded-sm` / `calc(var(--radius) - 4px)`): buttons, inputs, nav-items, segmented controls, filter chips, status/count badges, logo square.
- **Mid nesting → 10px** (`rounded-md`) only where a 10px inner corner is genuinely wanted; default to sm for controls and lg for surfaces.
- **Checkbox / tiny inner → 4px** (`rounded-xs`).

> Because the app sets `rounded-md` on its card surfaces today (and `rounded-md` resolves to `--radius-md`), a naive `--radius` bump would make cards 10px and leave controls at literal 8px — **wrong on both ends**. The fix is twofold: (a) bump `--radius`, (b) re-point the card surfaces from `rounded-md` → `rounded-lg` and pin literal-8px controls to `rounded-sm`/`var(--radius-sm)`. Tasks 2–4 do exactly this.

---

## Task 1 — Fonts: load Plus Jakarta Sans + DM Sans, retire Inter (OD-P3-9)
**File:** `mos-app/src/main.tsx` (font side-effect imports) + `package.json`
The app loads fonts via `@fontsource-variable/inter` (side-effect import in `main.tsx`). Mirror that pipeline — no Google `<link>` needed.

1. `cd mos-app && npm i @fontsource/plus-jakarta-sans @fontsource-variable/dm-sans` (DM Sans variable ships an optical-size axis; Plus Jakarta Sans static weights 500/600/700 are sufficient — we only use 600).
2. In `mos-app/src/main.tsx`, replace `import '@fontsource-variable/inter'` with:
   ```ts
   import '@fontsource-variable/dm-sans'
   import '@fontsource/plus-jakarta-sans/500.css'
   import '@fontsource/plus-jakarta-sans/600.css'
   import '@fontsource/plus-jakarta-sans/700.css'
   ```
   (Keep Inter installed but unimported for now — Task 9 may re-import it scoped if `tnum` fails.)
3. `mos-app/src/types/fontsource.d.ts`: add module declarations for the new side-effect imports (`@fontsource-variable/dm-sans`, `@fontsource/plus-jakarta-sans/*.css`).

**Verify:** `npm run build` succeeds; DevTools › Network shows DM Sans + Plus Jakarta Sans woff2 loading, no Inter request (unless Task 9 engaged).

## Task 2 — `:root` + `@theme inline`: radius bump, font vars, new shadow/gradient tokens
**File:** `mos-app/src/index.css`

1. In `:root` (after line 33 `--ring`, near `--violet`/brand block), and the Geometry block:
   - Change `--radius: 0.5rem;` → **`--radius: 0.75rem;`** (line 46).
   - Add the new composite tokens:
     ```css
     /* OD-P3-11 resting shadow — faintly navy-tinted near-black, ≤0.06 total alpha */
     --shadow-rest: 0 1px 2px hsl(222 18% 12% / 0.05), 0 1px 3px hsl(222 18% 12% / 0.04);
     /* OD-P3-12 gradients — navy-tinted whispers, never purple */
     --gradient-primary-sheen: linear-gradient(180deg, hsl(221.2 83.2% 56%) 0%, hsl(221.2 83.2% 51%) 100%);
     --gradient-surface-wash:  linear-gradient(180deg, hsl(218 46% 22% / 0.035) 0%, hsl(218 46% 22% / 0) 220px);
     ```
2. In `@theme inline` (lines 53–88):
   - Add the xs rung and keep the rest (they auto-recompute off the new `--radius`):
     ```css
     --radius-lg: var(--radius);              /* 12px — cards/containers/overlays */
     --radius-md: calc(var(--radius) - 2px);  /* 10px — mid nesting */
     --radius-sm: calc(var(--radius) - 4px);  /* 8px  — CONTROLS */
     --radius-xs: calc(var(--radius) - 8px);  /* 4px  — checkbox/tiny */
     ```
   - Replace the font vars (lines 86–87):
     ```css
     --font-sans:    "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
     --font-display: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
     --font-mono:    "SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace;
     ```
   - Expose the rest-shadow as a utility: `--shadow-rest: var(--shadow-rest);` (gives a `shadow-rest` class).
3. `@layer base`: add a display-font binding under the `html { font-family: var(--font-sans) }` rule:
   ```css
   h1, h2, h3, .page-head h1, .card-head-title, .heading, .subheading { font-family: var(--font-display); }
   ```
   (Body stays `--font-sans` = DM Sans.)

**Verify:** `npm run dev` — pick any card: corner radius reads 12px; pick any button: 8px (DevTools computed `border-radius`). Headings render in Plus Jakarta Sans, body/cells in DM Sans.

## Task 3 — Card surfaces: `rounded-md` → `rounded-lg` + add `shadow-rest` (OD-P3-10 + OD-P3-11)
**Files (each is a `bg-card border border-border rounded-md` surface):**
- `mos-app/src/pages/MyWeek.tsx` lines 121, 468, 485, 499, 514 (the dominant module + the home strips/modules — the auxiliary strips at 315/426 are flat utility strips; see note below)
- `mos-app/src/pages/UpdatesPage.tsx` line 90
- `mos-app/src/components/weekly/WeeklyUpdateWritePane.tsx` lines 377, 390, 415, 491
- `mos-app/src/components/weekly/WeeklyUpdateReviewPane.tsx` line 288
- `mos-app/src/auth/AuthShell.tsx` line 83 (AuthCard)

For each **card** surface: change `rounded-md` → `rounded-lg` and add `shadow-rest` to the className.

**Do NOT add `shadow-rest` to (Soft-Elevation Rule — flat utility surfaces stay flat):** the MyWeek auxiliary strips (`MyWeek.tsx` 315, 426 — these are the 56–64px ≤2 strips; keep them `rounded-lg` for corner coherence but **no resting shadow**), toolbars, group-header rows, inputs, the rail/header chrome, popover-internal rows. The login/recovery alert banners (`rounded-md` at LoginPage 227/261, RecoveryPage 65/106) are inline status banners, not cards — leave them `rounded-md`, no shadow.

**Verify:** MyWeek + Updates + Tasks-drawer cards show a faint resting lift (visible against the `secondary/35%` main) AND keep their 1px border; auxiliary strips stay flat. `npm test` (no snapshot churn beyond className).

## Task 4 — Controls: pin literal-8px radii to the control token (OD-P3-10)
These are controls; their absolute radius (8px) is **unchanged** by the bump — but they currently hard-code `8px` or `rounded-md`, which would silently drift to 10px or stay an un-tokened literal. Re-point them to the control rung so the scale stays coherent.

- `mos-app/src/components/ui/Button.css` line 9: `border-radius: 8px;` → `border-radius: var(--radius-sm);`
- `mos-app/src/components/tasks/TaskSurface.css`: the **control** rules at lines 54, 81, 152, 158, 181, 206, 316, 366, 435 (inputs, menu items, control chips, icon tiles) → `var(--radius-sm)`; the **dialog/popover** at line 100 (`.modal`, 10px) → `var(--radius-lg)`; the dropdown panel at 63 → `var(--radius-lg)`; the `.card` at lines 25, 120 → `var(--radius-lg)` + add `box-shadow: var(--shadow-rest)`.
- `mos-app/src/components/tasks/TasksWorkspace.css`: control chips/seg at lines 88, 94, 102, 109 → `var(--radius-sm)`; the workspace **frame/table card** at 33, 39 and the `.task-card`/mobile card at 246, 368 → `var(--radius-lg)` + add `box-shadow: var(--shadow-rest)` to the card surfaces (246, 368) only.
- `mos-app/src/components/weekly/ProgressMarker.css` line 25 (pill, control) → keep 8px via `var(--radius-sm)`; `WeeklyUpdateWritePane.css` line 15 (control input) → `var(--radius-sm)`.
- Header mobile-menu button `mos-app/src/shell/Header.tsx` line 33 `rounded-md` → `rounded-sm` (it's a 36px icon control).

> Rule of thumb while editing: **is it a card/overlay? → `var(--radius-lg)` / `rounded-lg`. Is it a control (≤36px tall, clickable chrome)? → `var(--radius-sm)` / `rounded-sm`.** When unsure, it's a control.

**Verify:** DevTools — every button/input/chip/badge computes `border-radius: 8px`; every card/popover/modal computes `12px`. Visual: controls look tight, not bubbly.

## Task 5 — PageHead: drop weight 700 → 600, tracking `-0.02em` → `-0.01em` (OD-P3-9)
**File:** `mos-app/src/shell/PageHead.tsx` line 30–34
- `className="font-bold text-foreground"` → `className="font-semibold text-foreground"` (700→600).
- inline style `letterSpacing: '-0.02em'` → `letterSpacing: '-0.01em'`.
- (Display font already applied via the Task 2 `h1` rule; no per-component family needed.)

**File:** `mos-app/src/components/ui/CardHead.css` line 10 — `.card-head-title` `letter-spacing: -0.01em` is acceptable for Jakarta at 18px; leave as-is (subheading tier tolerates it). KPI value weight: wherever a KPI/headline number is `font-bold`/700, drop to 600 (search `font-bold` in KPI/value contexts) to match the relaxed Jakarta heading weight.

**Verify:** Page titles render Plus Jakarta Sans 600 at `-0.01em`; no heading looks over-tight (counters not colliding).

## Task 6 — Primary-button sheen (optional, OD-P3-12)
**File:** `mos-app/src/components/ui/Button.css` `.btn-primary` (lines 18–22)
Add the sheen as a `background-image` over the solid fallback; keep `background-color` for hover-flatten:
```css
.btn-primary {
  background-color: hsl(var(--primary));
  background-image: var(--gradient-primary-sheen);
  color: hsl(var(--primary-foreground));
  box-shadow: 0 1px 2px hsl(var(--primary) / 0.25);
}
.btn-primary:hover:not(:disabled) {
  background-image: none;                 /* flatten to solid on hover */
  background-color: hsl(var(--primary) / 0.9);
}
```
**Bound (Restrained-Gradient Rule):** only `.btn-primary`. Do NOT add to `.btn-destructive` (status) or any other variant.

**Verify (AA — acceptance):** sample the **darkest** sheen stop (`hsl(221.2 83.2% 51%)`) vs `primary-foreground` (`hsl(0 0% 98%)`) → contrast ≥ 4.5:1. Record the ratio in the PR.

## Task 7 — Home/digest surface wash (OD-P3-12)
**File:** `mos-app/src/pages/MyWeek.tsx` (the page container) — and ONLY this surface (plus any future at-a-glance view).
Apply the wash to the MyWeek page root container as a `background-image: var(--gradient-surface-wash)` (top wash that fades to transparent within 220px). Keep the page's `background-color` as-is underneath.

**Bound:** never on Tasks/Updates/Ops list-detail surfaces, never on cards, never on status. The wash sits behind the content column.

**Verify (AA — acceptance):** sample `foreground` and `muted-foreground` text rendered in the top 220px band over the wash → both ≥ 4.5:1 (the 3.5%-navy band shifts white by <1.5 L, so the existing margins hold; confirm with a contrast picker on the rendered top strip). Record in PR.

## Task 8 — Sweep stray Inter / literal-radius / hard-coded shadow references
**Files:** repo-wide under `mos-app/src`
1. `grep -rn "Inter" mos-app/src` — every remaining `Inter` in a font stack must go (only the Task-9 scoped numeric fallback may keep it, if engaged). Update the `font-bold`/700 heading literals noted in Task 5.
2. `grep -rn "letter-spacing: -0.02em\|letterSpacing: '-0.02em'" mos-app/src` — relax any title-tier `-0.02em` to `-0.01em` (Jakarta).
3. `grep -rn "border-radius: 8px\|border-radius: 10px\|rounded-md\|rounded-lg" mos-app/src` — reconcile each against the Task-4 classification (card→lg, control→sm). Any literal `box-shadow: 0 1px 2px …` resting shadow already on a card should be replaced by `var(--shadow-rest)` (e.g. the kanban-card rest shadow if present).
4. Comments referencing `rounded.md` / `0.5rem` / "flat-by-default" as the card rule are now stale — update the inline comment to cite OD-P3-10/11 where you touch the line.

**Verify:** the three greps return only intentional matches (control-radius literals now tokenized, Inter gone or scoped, resting shadows tokenized).

## Task 9 — tnum verification + contingency (OD-P3-9 — REQUIRED, open risk)
**Files:** `mos-app/src/index.css` `.tabular` utility (lines 109–115) + (only if failing) `main.tsx` + a scoped `.tabular` font-family.
1. Run the app, open **Tasks** (the DB-view table with currency/percent/count/age columns). Confirm digits **column-align** (no horizontal jitter as values change width) in **DM Sans** with the existing `.tabular` utility (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum"`).
2. **If DM Sans tnum aligns:** done — record "DM Sans tnum OK" in the PR. No further change.
3. **If DM Sans tnum is weak/absent (columns jitter):** engage the documented fallback — re-import Inter scoped (`import '@fontsource-variable/inter'` in `main.tsx`) and scope the numeric utility to Inter-tabular ONLY:
   ```css
   .tabular { font-family: "Inter Variable", var(--font-sans); font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
   ```
   Proportional body/UI text stays DM Sans; ONLY numeric cells/KPI values fall back to Inter. Record "Inter-tabular fallback engaged" in the PR.

**Verify:** screenshot the Tasks money column with two rows of differing digit widths; columns must align to the pixel. This is the gating acceptance for OD-P3-9.

---

## Acceptance checklist (all must pass before the design-review)
- [ ] Plus Jakarta Sans on all headings (page-title/heading/subheading), DM Sans on all body/UI/table; **zero** unscoped `Inter` in font stacks. (T1, T2, T5, T8)
- [ ] Page title is 600 / `-0.01em` (not 700 / `-0.02em`); no heading reads over-tight. (T5)
- [ ] Every **card / overlay / modal** computes `border-radius: 12px`; every **control** (button/input/nav/seg/chip/badge/checkbox-host) computes `8px` (checkbox 4px). No bubbly controls. (T2, T3, T4)
- [ ] Cards / KPI / kanban / mobile-reflow cards carry `var(--shadow-rest)` **and** their 1px border; toolbars/strips/rows/inputs stay flat (no resting shadow). (T3, T4)
- [ ] Primary button optionally carries the sheen; **no other** element has a gradient; no gradient on any status element. (T6)
- [ ] MyWeek (and only at-a-glance surfaces) carries the faint navy surface wash; list/detail surfaces do not. (T7)
- [ ] **AA contrast (gates):** primary-foreground over the darkest sheen stop ≥ 4.5:1; `foreground` + `muted-foreground` over the top wash band ≥ 4.5:1 — both recorded in PR. (T6, T7)
- [ ] **tnum (gate):** Tasks money/percent columns align to the pixel — DM Sans tnum verified, or Inter-tabular fallback engaged and recorded. (T9)
- [ ] No identity drift: One Blue Rule intact (sheen is the same blue, no second action color, no purple); palette/border/density/Tinted-Status/RACI/ops tokens unchanged. (all)
- [ ] `npm run typecheck` 0 errors; `npm run lint` 0 errors; `npm test` green; `npm run build` succeeds.

## Responsive / states / a11y notes
- **Breakpoints unchanged:** 920px rail collapse, 768px table→card reflow (OD-W4-4). The mobile reflow cards take the 12px radius + resting shadow (Task 3/4); their `.touch-target` ≥44px affordances are untouched.
- **States unchanged:** loading (skeleton), empty, error, no-results all keep their existing StateKit treatment; only the *container* radius/shadow shift. Skeleton bars stay `secondary` at 6px inner radius (control-scale).
- **A11y:** focus ring (`2px ring`, 2px offset) untouched; font swap must not change line-heights enough to break the 44px touch targets (DM Sans 14/1.45 matches Inter's metrics closely — verify the phone submit bars still clear 44px). Gradient AA gates above are the only new a11y checks. No color-alone state introduced.
