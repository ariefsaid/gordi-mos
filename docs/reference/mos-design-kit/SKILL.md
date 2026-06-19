---
name: mos-design-kit
description: Design reference for the Gordi MOS visual direction — calm, neutral, information-dense, light + dark. Provides design tokens (light/dark themes), foundation guidelines (color, type, spacing, elevation), and IA/IxD patterns (rail, record page, record table, kanban) to design MOS screens and prototypes. Tokens are facts; re-implement in the app's own pipeline.
user-invocable: true
---

Read `README.md`, then explore `tokens/`, `guidelines/`, and `guidelines/ia-patterns.md`.
When creating visual artifacts (mocks, throwaway prototypes), link `styles.css` and build static HTML.
For production work, read the rules here and re-implement tokens/components in the app's own
pipeline (shadcn-HSL `:root` + Tailwind v4) — do NOT copy values verbatim as a shipped asset.
If invoked without guidance, ask what to design, then act as an expert designer to this direction.

## Quick reference
- **Tokens:** link `styles.css`; use `--ds-*` variables (or the `--surface-*` / `--text-*` / `--accent`
  aliases in `tokens/aliases.css`). Light theme is the default on `:root`; dark is opt-in via `class="dark"`.
- **Type:** Plus Jakarta Sans (display/headings) + DM Sans (UI/body/table) + SF Mono (IDs/code);
  weights 400/500/600 only; sentence case. `tabular-nums` on all money/metrics.
- **Color:** neutral gray ramp for almost everything; one **blue** accent (`--ds-color-blue`) for the
  primary action / focus / links; soft **tag palette** (`--ds-tag-background-*` + `--ds-tag-text-*`) for
  record color; purple/violet allowed sparingly for highlights, selections, charts.
- **Shape:** tight radii (4px controls, 8px cards, pill tags), 1px gray borders, soft low shadows,
  4px spacing unit, short controls (24/32px), dense rows (~33px), 28px nav items.
- **Icons:** Tabler Icons (`@tabler/icons-react` in production). No emoji.
- **IA / IxD:** see `guidelines/ia-patterns.md` — grey rail (workspace switcher + ⌘K + sections),
  two-column record page (details panel + tabbed feed), dense record table, kanban board.

Provenance: neutral-ramp + scale values derived from an open-source CRM's published design tokens
(factual values), re-expressed under `--ds-*` names with our adopted fonts. No third-party brand assets.
