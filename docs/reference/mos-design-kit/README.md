# MOS Design Kit

A design reference for the **Gordi MOS** visual direction: calm, neutral, information-dense, light + dark.
It provides design **tokens** (light/dark), foundation **guidelines** (color, type, spacing, elevation),
and **IA/IxD patterns** (rail, record page, record table, kanban). Use it to design MOS screens and
prototypes — and as the source the app's real `DESIGN.md` can adopt from.

> **Provenance & licensing.** The neutral-ramp, scale, and elevation **values** here are derived from an
> open-source CRM's published design tokens — *factual values*, re-expressed under our own `--ds-*` names
> with our adopted fonts. This kit contains **no copied source code and no third-party brand assets**
> (no logos, no illustrations, no vendor icons). For production, **re-implement** tokens/components in the
> app's own pipeline (shadcn-HSL `:root` + Tailwind v4); do not ship this kit's files as product code.
> The upstream CRM is AGPL-3.0 — keep the firewall: values are facts, their code is not. See
> the source-extraction notes under `docs/reference/` for the full analysis vs `DESIGN.md`.

## Direction in one paragraph

A **data workspace**: customizable records rendered as dense **tables** and **kanban boards**, with rich
**record pages**. The aesthetic is calm, neutral, and information-dense — closer to Linear/Notion than to
legacy enterprise tools. Light + flat + tightly-spaced; color is used sparingly and functionally (mostly
through record **tags**). Sentence case throughout; the user is addressed as an implied "you."

## Foundations

- **Type.** Plus Jakarta Sans (display/headings), DM Sans (UI/body/table), SF Mono (IDs/code). Three
  weights only — 400 / 500 / 600. Hierarchy leans on size + color, not bold. `tabular-nums` on all
  money/metrics. Scale is rem-based and modest (body ≈ 1rem; largest in-app ≈ 1.85rem).
- **Color.** Neutral gray ramp for almost everything; text is soft near-black (`gray12 ≈ #333`), not pure
  black. One **blue** accent (`--ds-color-blue`) for the primary action / focus / links. Soft **tag
  palette** (`--ds-tag-background-*` + `--ds-tag-text-*`) carries record color. Purple/violet allowed
  **sparingly** for highlights, selections, charts. Colors authored in Display-P3, degrade to sRGB.
- **Density & spacing.** Strict **4px** base unit. Controls are short (**32px** medium, **24px** small);
  table rows ~**33px**; nav items **28px**. Tight, grid-aligned — calm density, not generous whitespace.
- **Corner radii.** Tight: **4px** default control radius, **2px** checkboxes, **8px** cards/menus/modals,
  pill for tags/toggles. No large playful rounding.
- **Borders.** Hairline 1px borders in near-white grays (`gray4`–`gray6`) define structure more than
  shadows do.
- **Elevation.** Soft, low-contrast shadows reserved for floating surfaces: `light` (cards/kanban),
  `strong` (menus), `super-heavy` (modals). Resting UI is mostly flat.
- **Surfaces.** Flat solid grays — white canvas (`gray1`), faint-grey sidebar/panels (`gray2`), hover
  fills step up the ramp. No decorative gradients or photography in product chrome.
- **Hover/press/focus.** Hover = faint transparent overlay or a step up the gray ramp; press = one step
  further. Focus = accent border + a soft 3px accent-tertiary ring (quiet, not a glow).
- **Motion.** Minimal and fast — instant 75ms / fast 150ms / normal 300ms; simple ease transitions. No
  spring, bounce, or decorative looping.
- **Icons.** [Tabler Icons](https://tabler.io/icons) — outline, **2px stroke**, 16px (medium) / 14px
  (small). Use `@tabler/icons-react` in production. Icons inherit `currentColor`. No emoji.

## Contents

**Root**
- `styles.css` — single entry point consumers link (`@import`-only manifest).
- `README.md` — this guide. `SKILL.md` — invocable skill wrapper.

**`tokens/`**
- `theme-light.css` — full `--ds-*` light theme (default, on `:root`).
- `theme-dark.css` — full `--ds-*` dark theme (opt-in via `class="dark"`).
- `fonts.css` — Plus Jakarta Sans + DM Sans (Google Fonts); SF Mono is system.
- `aliases.css` — friendly semantic names (`--surface-*`, `--text-*`, `--accent`, `--radius-*`, …).

**`guidelines/`** — standalone HTML cards visualizing each foundation:
- Color: `color-accent`, `color-functional`, `color-neutrals`, `color-surfaces`, `color-tags`.
- Spacing/elevation: `spacing-scale`, `spacing-radii`, `spacing-elevation`.
- Type: `type-families`, `type-scale`, `type-weights`.
- **`ia-patterns.md`** — IA/IxD reference: rail, record page, record table, kanban (measured anatomy).

## Use

Link `styles.css`, then use the `--ds-*` tokens (or the friendlier `--surface-*` / `--text-*` / `--accent`
aliases). Default to **sentence case, tight spacing, neutral grays, one blue accent for the primary
action, and soft tags for color.** Light is default; add `class="dark"` for dark mode.
