# ADR-0009 — Adopt the mos-design-kit token system (`--ds-*`, Display-P3) + light/dark theme

- Status: **Proposed** (2026-06-19; awaiting owner spec sign-off — the spec at
  `docs/specs/design-system-adoption.spec.md` is OWNER GATE 1; this ADR is the architecture record behind it).
- Deciders: Owner (Arief) + Director
- Related: `docs/specs/design-system-adoption.spec.md` (the SDD this records); **OD-DIR-8** (DESIGN.md =
  identity authority, divergence only via owner-approved additions), **OD-P3-7** (brand tokens — preserved
  here as additions), **OD-P3-9..12** (fonts/radius/shadow/gradients — back-filled into `decisions.md` by
  this issue, see below); **ADR-0008** (the prior identity-authority amendment — the precedent this follows);
  `docs/reference/mos-design-kit/` (the clean-room kit being adopted); `DESIGN.md` (the identity authority
  this **rewrites** to the [Google design.md spec](https://github.com/google-labs-code/design.md));
  `CONTEXT.md` (vocabulary — **untouched**: token names are UI mechanics).
- Scope note: **UI + design-system + token plumbing only. No schema, RLS, grant, migration, or
  `lib/db/*.ts` signature change.** ADR-0007's behavior suite (AC-100..114) is the regression oracle and must
  stay green. Security-auditor scope: none — no new data/auth/RLS seam (a CSS theme class is not a security
  boundary).

## Context

The app ships a mature, owner-approved design system (`DESIGN.md` + `mos-app/src/index.css`): shadcn-style
**bare HSL triplets** (`0 0% 100%`) consumed as `hsl(var(--token))`, a single light theme, Plus Jakarta Sans +
DM Sans. A clean-room reference expansion of that same aesthetic — the `mos-design-kit`
(`docs/reference/mos-design-kit/`, verified AGPL-safe, derived as factual values from an open-source CRM and
re-expressed under our own `--ds-*` names) — is a **superset**: `--ds-*` tokens authored in
`color(display-p3 …)`, a 30-color soft tag palette, semantic aliases (`--surface-*`/`--text-*`/`--border-*`/
`--accent`), and a full **light + dark** theme pair. The two share the identical font pairing (OD-P3-9) and
the one-blue-accent philosophy.

Three facts shape the decision:

1. **The HSL-triplet format blocks dark mode and the dense-record patterns Issues 2–5 need.** A bare
   `0 0% 100%` triplet must be wrapped in `hsl(var(--t))` at every call-site (432 of them across 25 files),
   and the `/alpha` modifier requires the wrapper. Adopting resolved `color(display-p3 …)` values lets the
   token layer carry both themes cleanly (a `.dark` scope flips every token), and lets Tailwind v4's
   `/alpha` use native `color-mix` — unblocking the 30-color tag palette, the dark theme, and the
   record-table/record-page patterns.

2. **DESIGN.md is an "identity authority, never re-invent" doc, and this rewrites its *format*, not its
   *identity*.** The colors, fonts, radii, shadows, gradients, and every named rule (One-Blue, Structural-Navy,
   Orange-Sprinkle, Tinted-Status, Single-Border, Soft-Elevation, Restrained-Gradient, No-Pure-Black-Shadow)
   are preserved. What changes is the *expression*: HSL triplets → Display-P3, plus the Google design.md
   schema (YAML `name/colors/typography/rounded/spacing/shadows/components`) so the file is
   agent-consumable and `npx @google/design.md lint`-clean. This earns an ADR because the format change is
   cross-cutting (every CSS call-site) and the dark-theme addition is a new capability.

3. **OD-P3-9..12 are ratified but not recorded in `decisions.md`.** The 2026-06-18 visual refresh
   (`docs/plans/2026-06-18-demo-aligned-visual-refresh.md`) ratified four decisions — fonts (Plus Jakarta +
   DM Sans), radius (8→12px cards), soft elevation (resting shadow), gradients (navy sheen) — directly into
   `DESIGN.md`, but they were never back-filled into the Owner Decisions Log. This ADR corrects that gap
   (mirrors how OD-P3-7/8 were recorded) so the source-of-truth log is consistent.

## Decision

### D1 — `--ds-*` Display-P3 tokens become the runtime source of truth

`mos-app/src/index.css` `:root` is rewritten from bare HSL triplets to the kit's `--ds-*` tokens in
`color(display-p3 …)`. The full token set (surfaces, font-colors, borders, the 12-step color ramps, the
30-color tag palette, spacing, radii, shadows, fonts, animation) is ported verbatim from the kit's
`tokens/theme-light.css`. A `.dark` scope (opt-in via `class="dark"` on a container, **not**
`prefers-color-scheme`) re-expresses every token that differs by theme, ported from `theme-dark.css`.
Semantic aliases (`--surface-*`, `--text-*`, `--border-*`, `--accent`, `--radius-*`, `--shadow-*`) are
ported from `aliases.css`.

### D2 — Gordi brand tokens are preserved as additions on top of the kit

The kit has **no** brand tokens. `--brand-navy`, `--brand-navy-text`, `--brand-orange` (OD-P3-7, ADR-0008 D4)
are kept as **additions**, re-expressed in `color(display-p3 …)` (converted from their HSL values), present in
**both** light and dark themes, and their two named rules (**Structural-Navy**, **Orange-Sprinkle**) are
preserved verbatim. This is the one deliberate deviation from "adopt the kit verbatim" — it protects a
ratified owner identity decision.

### D3 — Tailwind v4 `@theme inline` is remapped to `var(--ds-*)`

Every `--color-*` utility line drops its `hsl(var(…))` wrapper and resolves to a `var(--ds-*)` alias (or
`var(--brand-*)`). This is what lets Tailwind v4 generate the `/alpha` modifier via `color-mix` from the
resolved color (v4 does this natively; the current HSL-wrapper form actually defeats it). The `--radius-*`
and `--font-*` mappings move to the kit's scale (2/4/8/pill radii; Plus Jakarta + DM Sans + SF Mono fonts —
**same fonts as today**, OD-P3-9, so zero font churn).

### D4 — The `/alpha` convention is `color-mix`, not bare-token division

Tokens are now resolved `color(display-p3 …)` values, so `hsl(var(--t) / 0.45)` cannot apply. Call-sites that
need alpha use the Tailwind-v4-native **`color-mix(in srgb, var(--token) N%, transparent)`** (where
`N = alpha × 100`). This is specified here, not guessed at build time, and is the same mechanism Tailwind v4
itself uses for the `/alpha` utility modifier.

### D5 — Every `hsl(var(--t))` call-site and every raw `hsl(<nums>)` literal is converted

The codemod covers three categories (grep-proven in the spec's AC-139/140):
- **432** `hsl(var(--token))` / `hsl(var(--token) / <alpha>)` call-sites across 25 files → `var(--token)`
  (or `color-mix(...)` for the alpha branch).
- **54** of those live inside two TSX `<style>` template-literal blocks (`OpsPage.tsx`, `OpsAddForm.tsx`) —
  same string substitution, flagged as review hotspots.
- **22** raw `hsl(<numbers>)` literals across 7 files (scrim alpha, overdue-red, warning fills, popover
  shadow, etc.) that bypass tokens today — each is promoted to a named token or pointed at an existing one.

### D6 — `DESIGN.md` is rewritten to the Google design.md spec

The repo-root `DESIGN.md` is restructured to the [Google design.md format](https://github.com/google-labs-code/design.md):
YAML frontmatter (`name`, `colors`, `typography`, `rounded`, `spacing`, `shadows`, `components`) with colors
in `color(display-p3 …)`, followed by the Overview → Colors → Typography → Layout → Elevation → Components →
Do's/Don'ts prose. All current values, named rules, and the brand-token additions are preserved. The file must
pass `npx @google/design.md lint` with zero errors (AC-138). This makes the identity authority
agent-consumable (the reason the format exists).

### D7 — A `useTheme()` hook toggles `class="dark"` on `<html>`

`src/theme/useTheme.ts` exposes a persisted (localStorage, default `'light'`) theme controller that adds/removes
`class="dark"` on `document.documentElement`. The app default stays **light** (no behavior change for existing
users); dark is opt-in. (A visible toggle UI is a later issue; this issue ships the capability + the hook.)

## Alternatives considered

- **Keep HSL triplets; add dark theme by forking the `:root` into a second HSL block.** Rejected: doubles the
  token surface, keeps the `hsl(var(…))` friction that blocks the 30-color tag palette and the `/alpha`
  utility, and leaves DESIGN.md in a non-agent-consumable format. The kit's P3 form is strictly more capable.
- **Adopt the kit verbatim and *retire* the Gordi brand tokens.** Rejected: OD-P3-7 is a ratified owner
  identity decision (navy/orange are the real Gordi brand, with named usage rules). Retiring them is an
  owner call, not a technical one; D2 preserves them instead.
- **Author new `--ds-*` tokens from scratch instead of porting the kit.** Rejected: the kit is already
  verified (AGPL-safe, console-clean, all 30 tag colors + light/dark complete). Re-deriving duplicates work
  and risks drift. The kit *is* the spec; we port its values.
- **Ship dark mode in a later issue.** Rejected by the owner (this pass adopts dark). The `.dark` scope is
  cheap to port alongside light (same file) and avoids a second cross-cutting pass over every CSS file later.

## Consequences

- **Positive — one token system, both themes, P3-wide.** Surfaces, text, borders, the tag palette, and brand
  tokens all carry light + dark values; Issues 2–5 consume them directly without further token work.
- **Positive — DESIGN.md is agent-consumable and lint-clean.** The Google design.md format means coding agents
  (and the design-architect/ui-implementer roles) read a structured spec instead of parsing prose; the lint
  gate (AC-138) catches drift on every change.
- **Positive — Tailwind `/alpha` works natively.** Remapping `@theme inline` to resolved colors lets v4's
  `color-mix`-based alpha work as designed (today's HSL-wrapper form partially defeats it).
- **Positive — decisions.md is consistent.** Back-filling OD-P3-9..12 (below) closes the gap where ratified
  decisions lived only in DESIGN.md.
- **Negative / accepted — a 432-site codemod is the central risk.** Mitigated by grep-proof ACs (AC-139/140
  catch any surviving `hsl(var(` or bare `hsl(<nums>)`), and by the behavior oracle (ADR-0007 AC-100..114)
  staying green. The 22 raw literals and the 54 TSX-embedded sites are the easy-to-miss cases; the
  `hsl\([0-9]` grep catches both classes.
- **Negative / accepted — P3 color on non-P3 displays.** `color(display-p3 …)` degrades to sRGB natively
  (NFR-128); the kit already proves this across its gallery + app prototype.
- **Negative / accepted — test literal updates.** Any test asserting a literal HSL value (e.g. a token-equality
  check) needs its literal updated to the P3 value — **the assertion is not weakened** (BDD rule), only the
  expected literal changes. `brandTokens.test.tsx` (AC-120) is built for exactly this: it guards *role*
  stability through a token swap.

## Reversibility / migration note

- **No data migration exists** — nothing in the database changes; there is nothing to roll back at the DB
  layer. This ADR records UI + design-system + token-plumbing decisions only (ADR-0008 scope discipline).
- **The codemod is reversible by `git revert`** of the issue's commit — restoring the `hsl(var(--t))`
  call-sites and the HSL-triplet `:root` block. The conversion is mechanical and grep-verifiable in both
  directions.
- **The DESIGN.md rewrite preserves all values + named rules** — only the *format* (HSL → P3, schema → Google
  design.md) changes; a revert restores the prior prose + HSL frontmatter.
- **The brand-token additions are additive** (D2) — removing them restores the kit-pure palette without
  structural change, exactly as in ADR-0008's D4 reversibility note.
- **`useTheme()` is additive** — the default is `'light'` (today's behavior); the hook can be removed without
  affecting any caller since no toggle UI ships in this issue.

---

## Appendix — OD-P3-9..12 back-fill (to be recorded in `docs/decisions.md` by this issue)

These four decisions were ratified 2026-06-18 (design-plan
`docs/plans/2026-06-18-demo-aligned-visual-refresh.md`) and live in `DESIGN.md`, but were never recorded in
the Owner Decisions Log. This issue back-fills them (mirroring how OD-P3-7/8 were recorded) so the log is
consistent. Verbatim from DESIGN.md:

- **OD-P3-9 — Fonts: Plus Jakarta Sans (display) + DM Sans (body/UI/table).** Inter retired as primary
  family (kept only as the `.tabular` numeric fallback). Jakarta wants looser tracking than Inter — title
  tracking relaxed from `-0.02em`/`-0.01em` toward `-0.01em`/normal. Mono unchanged (SF Mono, IDs/codes only).
- **OD-P3-10 — Radius: `--radius` 8px → 12px for cards/containers/overlays.** Controls (buttons/inputs/badges/
  nav-items) stay tight at 8px (taste guard — don't let 32px controls go bubbly). Scale: xs 4px / sm 8px
  (control) / md 10px / lg 12px (card).
- **OD-P3-11 — Soft-Elevation: a single subtle resting shadow is permitted on cards/KPI/kanban** (alongside,
  not instead of, the border). All colors stay desaturated near-black / faintly navy-tinted —
  No-Pure-Black-Shadow Rule preserved. Hover/pressed/overlay vocabulary unchanged.
- **OD-P3-12 — Restrained-Gradient: subtle navy gradients only (never purple).** Two bounded uses:
  `primary-sheen` (optional button fill, ±3% L of primary) + `surface-wash` (home/digest only, 3.5% alpha navy,
  fades to transparent at 220px). Both reuse brand-navy + primary; the gradient is a sheen, not a new hue —
  the One-Blue Rule preserved.
