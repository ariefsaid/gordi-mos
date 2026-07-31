# Plan — Design system adoption (mos-design-kit tokens + light/dark theme) — Issue 1

- Spec: `docs/specs/design-system-adoption.spec.md` (FR-129..137, NFR-125..129, AC-135..143).
- ADR: `docs/adr/0009-adopt-mos-design-kit-tokens-and-dark-theme.md`.
- Scope: **token plumbing + theme seam + DESIGN.md rewrite only.** No visible UI/UX change (light renders
  ~identical to today). Issues 2–5 layer on top.
- Worktree: `/Users/ariefsaid/Coding/gordi-mos-worktrees/design-system-adoption` (branch `feat/design-system-adoption`).
- Verify gates (every task ends green): `cd mos-app && npm run typecheck && npm run lint:ci && npm test`.

## Live codemod substrate (re-confirmed in this worktree)

- **457** `hsl(var(--t))` call-sites across **20** files (294 `.css` + 108 `.tsx`).
- **54** are the alpha branch `hsl(var(--t) / <a>)` → `color-mix(in srgb, var(--t) <a×100>%, transparent)`.
- **403** are the simple `hsl(var(--t))` → `var(--t)` swap.
- **54** of the 457 live inside the 2 TSX `<style>` template-literals: `pages/OpsPage.tsx` (block lines
  497–749, 38 sites) + `pages/OpsAddForm.tsx` (block lines 338–405, 16 sites). Same string substitution;
  flag as review hotspots.
- **25 raw `hsl(<nums>)` literal lines** across 8 files (TasksWorkspace.css ×12, TimingChip.css ×6,
  UpdatesPage.tsx ×3, WeeklyUpdateReviewPane.tsx ×2, OpsAddForm ×1, UserChip ×1 [2 on the line],
  ProgressMarker.css excluded=defs). **Exclude** the 3 token *definitions* in `index.css:50/52/53` and the
  1 test comment in `WeeklyUpdateWritePane.test.tsx:55` — the codemod regex must not touch those.
- **844 of 990 `--ds-*` tokens flip** light↔dark → the `.dark` scope redefines exactly those 844; the 146
  identical tokens (all spacing/radii/font-size/icon metrics, all `--ds-color-*9` + base hues, 3 box-shadows)
  are left out to keep `.dark` minimal.

---

## Phase A — Token foundation (AC-137, AC-141)

### Task A1 — Port the kit's `--ds-*` light tokens into `index.css` `:root` *(AC-137)*
Replace the current `:root` bare-HSL-triplet block (`mos-app/src/index.css` lines 5–54) with the kit's
`--ds-*` values from `docs/reference/mos-design-kit/tokens/theme-light.css`. Port: surfaces
(`--ds-background-*`), font-colors (`--ds-font-color-*`), borders (`--ds-border-color-*`), accent
(`--ds-accent-*`), the full color ramps (`--ds-color-*` × 31 hues × 12 steps), the 30-color tag palette
(`--ds-tag-background-*` + `--ds-tag-text-*`), spacing (`--ds-spacing-*`), radii
(`--ds-border-radius-*`), shadows (`--ds-box-shadow-*`), fonts (`--ds-font-family/display/code-font-family`,
sizes, weights), animation. Keep the kit's file comments (provenance note) trimmed to a one-line reference.
**Verify:** `npm run build` succeeds (no unresolved `var()`).

### Task A2 — Add brand tokens as additions in P3 *(FR-132)*
Convert the 3 Gordi brand tokens from HSL to `color(display-p3 …)` and add to `:root` alongside the kit
tokens: `--brand-navy` (from `218 46% 22%`), `--brand-navy-text` (`218 42% 26%`), `--brand-orange`
(`18 80% 48%`). Use an HSL→P3 converter (e.g. `npx convert-color` or a manual `oklch` round-trip); record
the exact converted values in a comment. Also port `--status-open-text/-won-text/-lost-text/-violet-text`
(the AA-darkened status text tokens, ADR-0008 D4) in P3. Keep `--rail-w: 224px` (Issue 3 bumps to 236px)
and `--header-h: 56px` as raw px (layout dims, not colors).
**Verify:** grep `--brand-navy:` `index.css` shows a `color(display-p3 …)` value.

### Task A3 — Add the `.dark` scope *(AC-137, FR-130)*
Append a `.dark { … }` block to `index.css` porting the 844 flipping tokens from
`docs/reference/mos-design-kit/tokens/theme-dark.css`. **Do NOT** redefine the 146 identical tokens
(spacing/radii/font-size/icon-metrics/color-*9/base-hues/3-shadows). Scope is `class="dark"` on a container
(matching the kit), **not** `prefers-color-scheme`. Re-express the 3 brand tokens for dark (navy/orange stay
the same hue; navy-text may need a lighter stop for AA on dark — check contrast, NFR-125).
**Verify:** in a scratch HTML, `getComputedStyle` of `--ds-background-primary` under `.dark` ≠ under `:root`.

### Task A4 — Port the semantic aliases *(FR-131)*
Port `docs/reference/mos-design-kit/tokens/aliases.css` (`--surface-*`, `--text-*`, `--border-*`, `--accent`,
`--accent-hover/-active/-subtle`, `--radius-*`, `--shadow-*`, `--text-size-*`) into `index.css`, mapping onto
the `--ds-*` tokens. These become the preferred call-site names for new work; existing call-sites keep using
`--ds-*` directly (no churn).
**Verify:** every alias resolves (no `var(--surface-primary)` returning empty).

### Task A5 — Remap `@theme inline` to `var(--ds-*)` *(AC-141, FR-133)*
Rewrite the `@theme inline` block (lines 58–98): every `--color-*` drops `hsl(var(…))` and resolves to a
`var(--ds-*)` or `var(--brand-*)` alias. Map shadcn-role names → kit aliases: `--color-background →
var(--surface-primary)`, `--color-foreground → var(--text-primary)`, `--color-card → var(--surface-primary)`,
`--color-border → var(--border-medium)`, `--color-primary → var(--accent)`, `--color-ring → var(--accent)`,
`--color-destructive → var(--ds-color-red)`, etc. (record the full mapping table in ADR-0009 appendix).
Radii: `--radius-sm → var(--ds-border-radius-sm)` (4px controls), `--radius-md → var(--ds-border-radius-md)`
(8px), `--radius-lg → 12px` (cards, OD-P3-10 — note kit md is 8, our card radius stays 12 per the ratified
decision; add a literal with a comment). Fonts unchanged (same stacks).
**Verify:** `npm run build`; Tailwind generates `/alpha` utilities via `color-mix` (spot-check `bg-primary/50`
compiles).

---

## Phase B — The codemod (AC-139, AC-140)

### Task B1 — Write the codemod *(mechanical hat)*
A single `scripts/codemod-hsl-to-var.mjs` (or an inline `sed`-pipeline) that, across `mos-app/src/**/*.{css,tsx}`:
1. `hsl(var(--t))` → `var(--t)` (403 sites).
2. `hsl(var(--t) / <a>)` → `color-mix(in srgb, var(--t) <a×100>%, transparent)` (54 sites). Handle the alpha
   being a decimal (`0.45` → `45%`).
3. Does **not** touch `index.css` lines 50/52/53 (token defs) or the test comment
   (`WeeklyUpdateWritePane.test.tsx:55`).
**Verify:** dry-run the script, eyeball the diff on `Pill.css` (has both forms).

### Task B2 — Run the codemod + promote the 25 literals *(AC-139, AC-140, FR-137)*
Run the codemod. Then hand-fix the 25 raw `hsl(<nums>)` literal lines (the codemod deliberately skips them —
regex `hsl\([0-9]` is separate from `hsl\(var`). Promote each to its named token:
- `hsl(240 4% 40%)` (muted-foreground) → `var(--muted-foreground)` (UpdatesPage ×3, WeeklyUpdateReviewPane ×2).
- `hsl(0 72% 45%)` / `hsl(0 72% 35%)` (overdue red) → `var(--status-lost-text)` (TasksWorkspace ×4).
- `hsl(22 78% 26%)` (warning-fg) → `var(--warning-foreground)` (TasksWorkspace ×1, OpsAddForm ×1, TimingChip ×1).
- `hsl(142 71% 45%)` / `hsl(142 64% 30%)` (success) → `var(--success)` / `var(--status-won-text)` (TimingChip ×3).
- `hsl(43 96% 56%)` (warning) → `var(--warning)` (TimingChip ×2).
- `hsl(240 10% 3.9% / 0.45)` (scrim) → `color-mix(in srgb, var(--ds-font-color-primary) 45%, transparent)`
  or a new `--scrim` token (decide: add `--scrim` to `:root`+`.dark` — cleaner; record in ADR).
- `hsl(240 x% y% / 0.12-0.18)` (shadows) → `var(--ds-box-shadow-strong)` / a new `--shadow-popover` token.
- `hsl(240 4.8% 95.9% / 0.6)` (row hover) → `color-mix(in srgb, var(--ds-background-secondary) 60%, transparent)`.
**Verify:** `rg "hsl\(var\(" mos-app/src | wc -l` → 0; `rg "hsl\([0-9]" mos-app/src | wc -l` → 0 (both AC-139/140).

### Task B3 — Update test literals *(NFR-126)*
Grep tests for HSL literal assertions: `rg "hsl\(" mos-app/src --glob '*.test.*'`. For each (e.g.
`brandTokens.test.tsx`), update the expected literal to the new P3 value — **assertion unchanged, only the
expected value** (BDD rule). If a test asserts `--primary` equals `221.2 83.2% 53.3%`, it now asserts the P3
equivalent.
**Verify:** `npm test` green.

---

## Phase C — Theme seam (AC-135, AC-136)

### Task C1 — `useTheme()` hook *(FR-134, AC-135)*
Create `mos-app/src/theme/useTheme.ts`: a `useTheme()` returning `['light'|'dark', setTheme]`, persisted to
`localStorage` key `mos-theme`, default `'light'`, that adds/removes `class="dark"` on
`document.documentElement`. SSR-safe guard (check `typeof document`). No toggle UI ships here (Issue 3 adds
a control).
**Verify:** `useTheme.test.tsx` — AC-135 (sets class + persists).

### Task C2 — Wire the hook into the app *(FR-134)*
Call `useTheme()` once at the app root (`App.tsx` or a new `ThemeProvider`) so the class is applied on mount
from the persisted preference. Default light = no visible change.
**Verify:** `npm run dev`, confirm `<html>` has no `dark` class by default; AC-136 (computed token flips
under `.dark`) in `index.css.test.ts`.

---

## Phase D — DESIGN.md rewrite (AC-138, FR-135)

### Task D1 — Rewrite DESIGN.md to the Google design.md spec *(design-architect hat)*
Restructure `/Users/ariefsaid/.../DESIGN.md` (worktree root) to the Google format: YAML frontmatter
(`name`, `colors` as `color(display-p3 …)` mapping every current token, `typography`, `rounded`, `spacing`,
`shadows`, `gradients`, `components`), then prose Overview → Colors → Typography → Layout → Elevation →
Components → Do's/Don'ts. **Preserve every named rule** (One-Blue, Structural-Navy, Orange-Sprinkle,
Tinted-Status, Single-Border, Soft-Elevation, Restrained-Gradient, No-Pure-Black-Shadow, Tabular-Numbers)
and every value. Brand tokens as additions. Source the exact P3 values from the ported `index.css`.
**Verify:** `cd <worktree-root> && npx @google/design.md lint DESIGN.md` → exit 0 (AC-138).

---

## Phase E — Review, accept, ship (AC-142, AC-143)

### Task E1 — Self-review (spec-reviewer + code-quality-reviewer hats)
Read the full `git diff main..HEAD`. Confirm: (a) every AC in the spec is evidenced; (b) no behavior change
(ADR-0007 AC-100..114 suites green); (c) the 22→25 literals and 54 TSX-embedded sites are all converted; (d)
no `git add -A` (stage only this issue's files).
**Verify:** `git diff --stat main..HEAD` scoped to `mos-app/src`, `docs/`, `DESIGN.md`.

### Task E2 — Render verify light + dark (Director, non-delegable)
`cd mos-app && npm run dev`; `agent-browser open http://localhost:5173/mos/`. Screenshot My Week + Tasks +
Login in **light** (must look ~identical to pre-migration) and **dark** (toggle via `useTheme` or by manually
adding `class="dark"` on `<html>` via `agent-browser eval`). Check AA legibility (no invisible-on-bg).
**Verify:** screenshots saved; no console errors.

### Task E3 — Accept (qa-acceptance hat)
Run every AC: AC-135/136 (unit), AC-137/141 (token-shape grep), AC-138 (design.md lint), AC-139/140
(the two grep-proofs — **re-run live**, don't trust the build run), AC-142 (e2e dark toggle), AC-143 (full
gate suite).
**Verify:** per-AC pass matrix green.

### Task E4 — Ship (release-engineer hat)
Fresh full verification (`typecheck && lint:ci && test && build && playwright`). Stage only this issue's
files (NOT `Twenty Design System/`). Commit (trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
`git push -u origin feat/design-system-adoption`. `gh pr create` with the spec + ADR + AC matrix linked.
**→ OWNER GATE 2** (DESIGN.md ratification) before Director merges.

---

## Owner gates staged for your return

- **GATE 1 — Spec sign-off**: `docs/specs/design-system-adoption.spec.md`. Read it; sign off or amend.
- **GATE 2 — DESIGN.md ratification**: the rewritten DESIGN.md (Task D1) + the rendered light/dark
  screenshots (Task E2). Confirm the identity carried over correctly before merge.

If you sign off Gate 1, I proceed straight through to Gate 2 (no further input needed until then).
