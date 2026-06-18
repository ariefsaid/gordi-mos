# Spec — Design system adoption: mos-design-kit tokens + light/dark theme

- Feature: **Design-system token layer** — adopt the clean-room `mos-design-kit` (`docs/reference/mos-design-kit/`)
  as the app's token source of truth; port its `--ds-*` `color(display-p3 …)` tokens, semantic aliases,
  and 30-color tag palette; add an opt-in `.dark` theme; remap Tailwind v4 `@theme inline`; mechanically
  convert every `hsl(var(--t))` call-site to `var(--t)`; preserve Gordi brand tokens on top. Rewrite the
  repo-root `DESIGN.md` to conform to the [Google design.md spec](https://github.com/google-labs-code/design.md).
- Status: **Proposed** (awaiting owner spec sign-off — OWNER GATE 1).
- Authority: `docs/decisions.md` **OD-DIR-8** (DESIGN.md = identity authority, divergence only via
  owner-approved additions), **OD-P3-7** (brand tokens), **OD-P3-9..12** (fonts/radius/shadow/gradients —
  ratified in DESIGN.md 2026-06-18, back-filled into `decisions.md` by this issue's ADR-0009).
  Architecture: **ADR-0008** (the prior identity-authority amendment — the precedent this follows).
  New architecture: **ADR-0009** (adopt mos-design-kit tokens + dark theme).
- Vocabulary: `CONTEXT.md` (**untouched** — token/radius/font/shadow names are UI mechanics, not domain
  vocabulary; per ADR-0008 `Related:` and OD-P3-5/8). Lens-D oracle: N/A (no UX/IA change in this issue —
  token plumbing + theme seam only; visual delta is intentionally ~zero).

> This spec is the token-layer keystone. Issues 2–5 (primitives, sidebar, record-table, record-page/kanban)
> layer on top of it. No visible UI/UX change is introduced by **this** issue — its goal is a grep-proven,
> lint-clean, AA-safe re-plumbing of the token system with dark-mode capability, after which the visible
> reskin (Issues 2–5) is cheap.

## Out of scope

- **Any visible UI/UX change.** Component visuals, sidebar structure, table density, new primitives —
  all deferred to Issues 2–5. This issue must render ~identically to today (light) at the pixel level.
- **Schema / RLS / migration / `lib/db/*.ts` signatures** — none. Presentation + tokens + one theme hook only.
  The P2-1 pgTAP suite and all `lib/db/tasks.ts` signatures are untouched (ADR-0008 scope discipline).
- **Sidebar content decisions** (workspace switcher / ⌘K / Favorites) — Issue 3 mockup gate, not here.
- **Component API changes** (Button/Tag/etc.) — Issue 2.
- **AGPL-licensed source** — nothing is copied from `Twenty Design System/`. Token *values* are re-expressed
  as facts (anatomy/dimensions/color ramps) into our own `--ds-*` names, per the kit's provenance note.
- **Behavior changes** — ADR-0007 AC-100..114 (keyboard, optimistic status, virtualization, condense ladder,
  modal/non-modal regimes) must remain green, byte-for-behavior.

---

## 1. Overview & user value

The app ships a mature, owner-approved design system (`DESIGN.md` + `mos-app/src/index.css`): shadcn-style
HSL triplets consumed as `hsl(var(--token))`, a single light theme, Plus Jakarta Sans + DM Sans. The
`mos-design-kit` (clean-room, verified AGPL-safe) is a richer reference expansion of the *same* aesthetic:
`--ds-*` tokens authored in `color(display-p3 …)`, a 30-color soft tag palette, semantic aliases
(`--surface-*`/`--text-*`/`--border-*`/`--accent`), and a full light + dark theme pair. The two share the
identical font pairing (OD-P3-9) and the one-blue-accent philosophy; the kit is a superset, not a competitor.

This issue promotes the kit to the app's token authority. The single structural change is the token *format*:
bare HSL triplets (`0 0% 100%`, consumed via `hsl(var(--t))`) → resolved `color(display-p3 …)` values. That
format shift is the whole migration: once the token layer is ported and `@theme inline` is remapped, every
`hsl(var(--t))` call-site becomes `var(--t)` — a mechanical, grep-driven codemod. The payoff is dark-mode
capability (the `.dark` scope flips every `--ds-*` token) and the richer palette/patterns Issues 2–5 consume.

User value is indirect but real: a token system that can express dark mode + dense record surfaces + a
full tag palette, without the HSL-triplet friction that blocks all three today.

## 2. Domain model & vocabulary

No domain model change. Token names (`--ds-*`, `--surface-*`, `--brand-navy`, `--radius-sm`, `--font-display`)
are UI mechanics, not domain vocabulary, and are excluded from `CONTEXT.md` by established rule (ADR-0008,
OD-P3-5/8). This spec uses the kit's `--ds-*` taxonomy as-is.

## 3. Functional requirements (EARS)

- **FR-129** The app's runtime token source of truth SHALL be the mos-design-kit `--ds-*` tokens, authored in
  `color(display-p3 …)` and defined in `mos-app/src/index.css` `:root`, replacing the bare-HSL-triplet block.
- **FR-130** The token system SHALL provide a `.dark` opt-in theme (scoped via `class="dark"` on a container,
  not `prefers-color-scheme`) that re-expresses every `--ds-*` token for dark surfaces.
- **FR-131** The token system SHALL provide the kit's semantic aliases (`--surface-*`, `--text-*`, `--border-*`,
  `--accent`, `--radius-*`, `--shadow-*`) and the full 30-color tag palette
  (`--ds-tag-background-*` + `--ds-tag-text-*`).
- **FR-132** Gordi brand tokens (`--brand-navy`, `--brand-navy-text`, `--brand-orange`, OD-P3-7) SHALL be
  preserved as **additions** on top of the kit tokens, in `color(display-p3 …)` form, and SHALL be present in
  both light and dark themes.
- **FR-133** The Tailwind v4 `@theme inline` block SHALL map every `--color-*` utility to a `var(--ds-*)` alias
  (or `var(--brand-*)`), with no `hsl(var(…))` wrapper, so Tailwind's `/alpha` modifier generates `color-mix`
  correctly from the resolved color.
- **FR-134** The app SHALL expose a `useTheme()` hook (persisted to `localStorage`, default `'light'`) that
  toggles `class="dark"` on `document.documentElement`.
- **FR-135** Repo-root `DESIGN.md` SHALL be rewritten to conform to the Google design.md spec
  (YAML `name`/`colors`/`typography`/`rounded`/`spacing`/`shadows`/`components`, colors in `color(display-p3 …)`),
  and SHALL pass `npx @google/design.md lint` with zero errors.
- **FR-136** Every `hsl(var(--token))` and `hsl(var(--token) / <alpha>)` CSS call-site in `mos-app/src/` SHALL be
  converted to `var(--token)` (alpha via `color-mix(in srgb, var(--token) <pct>%, transparent)`).
- **FR-137** Every raw `hsl(<numbers>)` literal in `mos-app/src/` (excluding the token-definition block itself)
  SHALL be promoted to a named token or pointed at an existing one (no bare `hsl()` in component CSS).

## 4. Non-functional requirements

- **NFR-125 (AA contrast)** Every color-carrying token SHALL meet WCAG AA (≥4.5:1 for text, ≥3:1 for UI)
  at its worst-case stop, in **both** light and dark themes. Contrast evidence recorded in ADR-0009, mirroring
  the ADR-0008 D4 navy-text (≥7:1) precedent.
- **NFR-126 (Zero behavior change)** ADR-0007 AC-100..114 (split-view keyboard, optimistic status,
  virtualization, condense ladder, modal/non-modal regimes) SHALL remain green with no test edits beyond
  literal-token-value assertions.
- **NFR-127 (No-Pure-Black-Shadow, preserved)** Shadow token colors SHALL remain desaturated near-black /
  faintly navy-tinted per OD-P3-11; no `#000`-channel shadows introduced by the dark theme.
- **NFR-128 (graceful degradation)** Colors authored in Display-P3 SHALL degrade to sRGB on non-P3 displays
  (the kit's `color(display-p3 …)` syntax does this natively; no extra work, but asserted).
- **NFR-129 (reversibility)** The migration SHALL be reversible: `git revert` of the issue's commit restores
  the HSL-triplet system. ADR-0009 records the reversal path (ADR-0008 template).

## 5. Acceptance criteria (Given/When/Then; each AC owns one test at its lowest sufficient layer)

Unit (Vitest) — `src/theme/useTheme.test.tsx`:
- **AC-135** Given the app; When `useTheme()` sets `'dark'`; Then `document.documentElement` has `class="dark"`
  and the value persists across reload via `localStorage`.
- **AC-136** Given `class="dark"` on `<html>`; When `getComputedStyle(documentElement)` reads
  `--ds-background-primary`; Then it resolves to the dark value (near-black), distinct from the light value (white).

Unit (Vitest) — `src/index.css.test.ts` (token-shape guard):
- **AC-137** Given `mos-app/src/index.css`; When loaded; Then `:root` defines every kit `--ds-*` token used by
  the app and `.dark` re-defines each that differs by theme.

Lint — DESIGN.md conformance:
- **AC-138** Given repo-root `DESIGN.md`; When `npx @google/design.md lint DESIGN.md` runs; Then exit code is 0.

Grep-proof codemod (run in CI / verify step, lowest sufficient layer = shell grep):
- **AC-139** Given `mos-app/src/`; When `grep -rn "hsl(var(" mos-app/src | grep -v "index.css.*:root"` runs;
  Then **0 hits** (zero `hsl(var(…))` call-sites outside the migrated definition block).
- **AC-140** Given `mos-app/src/`; When `grep -rEn "hsl\([0-9]" mos-app/src` runs; Then **0 hits**
  (zero raw `hsl(<numbers>)` literals anywhere, including the 22 previously identified and the inline
  `<style>` blocks in `OpsPage.tsx` / `OpsAddForm.tsx`).
- **AC-141** Given `mos-app/src/index.css`; When the `@theme inline` block is inspected; Then every `--color-*`
  line resolves to a `var(--ds-*)` or `var(--brand-*)` alias with no `hsl(` wrapper.

E2E (Playwright) — `e2e/design-system.spec.ts`:
- **AC-142** Given the running app in light; When the user toggles to dark; Then the rendered canvas background
  flips and the text remains AA-legible (no invisible-on-background regression on My Week + Tasks).

Regression (existing suites, no edits to behavior assertions):
- **AC-143** `npm run typecheck && npm run lint:ci && npm test && npm run build && npx playwright test` →
  all green; ADR-0007 AC-100..114 suites unchanged.

## 6. Constraints / invariants preserved

One-Blue Rule · Structural-Navy Rule · Orange-Sprinkle Rule · Tinted-Status Rule · Single-Border Rule ·
Soft-Elevation Rule · Restrained-Gradient Rule · No-Pure-Black-Shadow Rule · tabular-nums on all metrics.
All preserved verbatim (OD-P3-7, OD-P3-11, OD-P3-12, DESIGN.md §6). The blue action color
(`--ds-color-blue` = `color(display-p3 0.276 0.384 0.837)`) is the One Blue; brand-navy/orange keep their
structural/sprinkle roles unchanged.

## 7. Risks

- **Codemod completeness** — the 22 raw `hsl(<nums>)` literals and the 54 call-sites hidden in TSX `<style>`
  blocks are easy to miss. Mitigated by AC-140 (the `hsl\([0-9]` grep catches both classes).
- **Dark-theme contrast** — the kit's dark palette is reference; some stops may need nudging to clear AA on
  Gordi's specific surfaces. Mitigated by NFR-125 + Director render-review of every page in both themes.
- **P3 support** — older browsers. Mitigated by NFR-128 (native sRGB degradation) + the kit already proves this.
- **Test fragility** — any test asserting a literal HSL value (e.g. `brandTokens.test.tsx`) needs its literal
  updated, not the assertion weakened (BDD rule). Flagged for the build phase.

## 8. Open questions (owner)

- **Gate 1 (this spec)** — sign off, or amend scope?
- *(Deferred to Issue 3 mockup gate)* Sidebar content: adopt the kit's workspace-switcher/⌘K/Favorites, or
  keep current nav and reskin only?
