# Reference: Twenty's Product Design System (clean-room extraction)

> **Status:** reference only — NOT adopted. Nothing here changes `DESIGN.md` or the app.
> **Purpose:** a faithful, code-derived blueprint of Twenty's *product* design system
> (`packages/twenty-ui` in `twentyhq/twenty`), so the owner can decide how closely Gordi MOS
> should reflect it. Pairs with the §Gap analysis at the bottom.
> **Extracted:** 2026-06-18, from `twenty-ui/src/theme/constants/*` + the repo's canonical
> product screenshots (`twenty-website/public/images/readme/v2-*.webp`).

## Licensing firewall (read first)

Twenty is **AGPL-3.0** (root `LICENSE`), with some files under a separate `/* @license Enterprise */`
commercial license. This document records **design *decisions, values, and measurements*** — which are
facts, not copyrightable expression. It deliberately contains **no copied source code** and no Twenty
brand assets (logo, the "Twenty" wordmark, their illustrations). Any adoption must be a **clean-room
re-implementation** in our own pipeline (shadcn-HSL `:root` + Tailwind v4), never an import of their `.ts`.
See the licensing discussion in the session that produced this file.

---

## 0. One-paragraph characterization

Twenty's product UI is a **calm, dense, light-first records workspace** built on **styled-components +
a TS theme object + Radix color scales**. It is a very close philosophical cousin of our "Quiet Control
Surface": near-monochrome neutral ramp, one restrained accent, 4px spacing grid, border-first structure,
whisper-subtle shadows, Inter throughout. The defining differences from *our current* system are
mechanical, not philosophical: **Inter** (not Jakarta/DM), a **Radix-P3 color engine** with a full
categorical palette, an **indigo** accent used for *selection/highlight/focus* (their primary **button**
is near-black, not the accent), a **full dark theme**, a **rem-based type scale**, and a deep
**record-centric IA** (object views → record pages → side panel → command menu).

---

## 1. Color

### 1.1 Engine
- Palette is **Radix Colors, P3 variants** (`@radix-ui/colors`), plus a **custom 12-step gray scale**
  (not Radix's) authored directly in `color(display-p3 …)`.
- Two complete themes: **Light** and **Dark** (full counterpart scales — see 1.5).
- Color is addressed by **semantic role** (`background.primary`, `font.tertiary`, `border.medium`,
  `accent.accent11`) that resolves to a step on a scale — the same primitive→semantic indirection we use.

### 1.2 Gray scale (the workhorse) — Light, P3 → approx sRGB hex
| Step | ~hex | Typical role |
|---|---|---|
| gray1 | `#ffffff` | `background.primary` (page/cards) |
| gray2 | `#fcfcfc` | `background.secondary` |
| gray3 | `#f9f9f9` | subtle fill |
| gray4 | `#f1f1f1` | `background.tertiary`, `border.light` |
| gray5 | `#ebebeb` | `background.quaternary`, `border.medium` |
| gray6 | `#d6d6d6` | `border.strong` |
| gray7 | `#cccccc` | `font.extraLight` |
| gray8 | `#b3b3b3` | `font.light` |
| gray9 | `#999999` | `font.tertiary` (captions/placeholder) |
| gray10 | `#838383` | — |
| gray11 | `#666666` | `font.secondary` (secondary text) |
| gray12 | `#333333` | `font.primary` (primary text); inverted bg for dark buttons |

Note: their "black" text is **gray12 ≈ #333**, not true black — softer than our `foreground` (`240 10% 3.9%`).

### 1.3 Accent — indigo (selection/highlight, NOT the main button)
- `accent.*` maps to **Radix `indigoP3`** steps 1–12. `accent9` (`indigo9` ≈ `#3E63DD`) is the solid accent;
  `accent11` (≈ `#3A5BC7`) is the readable accent text/icon color (also `buttons.secondaryTextColor`).
- `accent.primary`/`secondary` = **`blue5`/indigo5** (≈ `#D2DEFF`, a *light tint*) → used as **selection /
  highlight backgrounds**, not as a saturated fill.
- **Important divergence from us:** Twenty's **primary button is near-black** (`background.primaryInverted`
  = gray12), with a radial-gradient variant for emphasis. Indigo is the *accent* (selected row, focus ring,
  active nav, links) — **not** "the one action color." We do the opposite (one saturated blue *is* the action).

### 1.4 Categorical + status palette
Full Radix-P3 families exposed as 12-step scales for **record tags, chips, and charts**: `red, ruby,
crimson, tomato, orange, amber, yellow, lime, grass, green, jade, mint, turquoise(teal), cyan, sky, blue(indigo),
iris, violet, purple, plum, pink, bronze, gold, brown, gray`. Status/semantics pull from these (e.g.
`border.danger` = `red5`, `font.danger` = `red`). Tags (the `Tag*` constants) pick a family per value —
this is how their "select"/"multi-select" record fields get their many soft-colored pills.

### 1.5 Dark theme (we have none today)
Same role structure, dark gray ramp: gray1 `#171717`-ish → gray12 `#ebebeb`-ish (inverted luminance).
Backgrounds darken, text lightens, borders use mid grays, accent indigo shifts to its dark-scale steps.
A faithful dark mode means **every token gets a dark counterpart** and **every component re-reviewed** —
this is the single largest net-new lift for us.

---

## 2. Typography

- **One family: `Inter, sans-serif`** across the entire product. (The serif you see in their *marketing*
  headlines is website-only; the product is Inter throughout.)
- **Weights:** `regular 400, medium 500, semiBold 600`. **No 700/bold.** Hierarchy comes from size + color
  (gray12/11/9), not weight — same instinct as ours.
- **Size scale (rem on 16px base):**
  | token | rem | ~px | use |
  |---|---|---|---|
  | xxs | 0.625 | 10 | micro labels |
  | xs | 0.85 | ~13.6 | dense UI, table cells |
  | sm | 0.92 | ~14.7 | body / controls |
  | md | 1.0 | 16 | base |
  | lg | 1.23 | ~19.7 | section headings |
  | xl | 1.54 | ~24.6 | page titles |
  | xxl | 1.85 | ~29.6 | display |
- **Line-height:** `lg 1.5` (prose), `md 1.1` (tight UI).
- They do **not** ship a documented `tabular-nums` mandate in the theme (we do — keep ours).

---

## 3. Spacing, radius, shadow, motion

- **Spacing:** base **4px** (`spacingMultiplicator: 4`, `spacing(n) = n*4px`). `betweenSiblingsGap: 2px`.
  Table: `horizontalCellPadding 8px`, `checkboxColumnWidth 32px`. `sidePanelWidth: 500px`.
- **Radius:** `xs 2 · sm 4 · md 8 · xl 20 · xxl 40 · pill 999 · rounded 100%`.
  Their default control/card radius reads as **md 8** (vs our 8 controls / 12 cards). No 10/12 mid-step.
- **Shadow (very subtle, gray-alpha — never black):**
  - `light` = `0 2px 4px grayA2, 0 0 4px grayA5`
  - `strong` = `2px 4px 16px grayA7, 0 2px 4px grayA5`
  - `underline` = `0 1px 0 grayA9` (the input/cell bottom-rule trick)
  - `superHeavy` = layered, for modals only
  Matches our No-Pure-Black-Shadow rule and our soft-rest instinct.
- **Motion:** durations (seconds) `instant .075 · fast .15 · normal .3 · slow 1.5`. Quiet, no bounce.
- **Icons:** Tabler-style, sizes `14/16/20/24`, stroke `1.6/2/2.5` (we standardize stroke-2; compatible).

---

## 4. Component standards (anatomy + states)

Derived from the `twenty-ui/src` directories (`components/ display/ input/ feedback/ layout/ navigation/`)
and the canonical product screenshots.

- **Buttons:** near-black **primary** (gray12 / inverted bg, optional radial-gradient for hero CTAs),
  **secondary** = bordered/transparent with indigo11 text, **ghost**. Small, ~Inter-sm, md(8) radius.
- **Record table (signature):** leading **checkbox column (32px)**, compact rows (~Inter-xs cells, 8px cell
  padding), **inline-editable cells**, soft tag pills in cells, column header row with sort/filter, hover
  row affordances. Denser than our 54px rows — closer to our 50px DB-view variant.
- **Kanban board:** columns with count, white record cards with title + soft tag chips + small meta; quiet.
- **Filters / Sorts:** **pill-shaped chip row** above the table (`+ Filter`, `+ Sort`, value chips) — a
  borderless/tinted-chip idiom (vs our bordered `control` chips).
- **Record detail page:** left **side panel** (record fields as label:value `<dl>`, inline-edit), main area
  with tabs (Timeline/Notes/Tasks/etc.), right activity feed. The `sidePanelWidth: 500px` token lives here.
- **Field editor / settings:** nested popover panels (Fields → Layout), toggles, "Done" affordance.
- **Command menu / "Ask AI":** a ⌘K-style center palette and an AI side panel (model picker, chat). We
  already have a ⌘K chip — their pattern is a deeper command surface.
- **Left nav (app shell):** workspace switcher at top → **Workspaces** group (Companies, People,
  Opportunities, Tasks, Notes, Dashboards, Workflows) → favorites/recents → settings foot. Overline group
  labels, count badges, indigo active state. Very close to our rail.
- **Feedback:** snackbars (`SnackBar*` constants), toasts; subtle.

---

## 5. IA / layout (the deepest, most valuable axis to reflect)

The whole product is **record-centric**:
`Objects (left nav) → Object view (table / kanban / + other views) → Record page (side panel + tabs + feed)
→ Command menu (⌘K) overlaying everything`.
Layouts are **customizable** (views, widgets, layout pages, fields) — that's their headline. For MOS we'd
reflect the *shape* (object view → record page → command menu, customizable views/fields) where it serves
our task/RACI/updates jobs — not clone the CRM objects.

---

## 6. Gap analysis — Twenty product vs our current `DESIGN.md`

| Axis | Twenty product | Our DESIGN.md (current) | Verdict |
|---|---|---|---|
| Base scheme | Light + **full dark** | Light only (by design) | **Missing: dark theme** (biggest lift) |
| Neutral ramp | Custom 12-step P3 gray, text=gray12 `#333` | shadcn HSL neutrals, text `240 10% 3.9%` | Diverge (ours is cooler/darker) |
| Color engine | **Radix P3 scales** + categorical families | shadcn HSL roles, narrow palette | Diverge (they have a full tag palette) |
| Accent | **Indigo** as selection/highlight/focus | One saturated **blue** as accent | Diverge (hue + indigo is brighter) |
| Primary action | **Near-black** button; indigo ≠ action | **Blue does all action** (One Blue Rule) | **Philosophical diverge** — decide deliberately |
| Font | **Inter** (one family, 400/500/600) | Plus Jakarta + DM Sans (Inter just retired OD-P3-9) | Diverge (full circle back to Inter) |
| Type scale | rem, xs 13.6 → xxl 29.6 | px, body 14 → page-title 24 | Close; minor |
| Tabular nums | Not in theme | **Mandated** (Tabular-Numbers Rule) | **Keep ours** (better) |
| Spacing | 4px grid | 4px grid | **Match** |
| Radius | sm4/md8 (no mid step) | controls 8 / cards 12 (OD-P3-10) | Diverge (they're tighter on cards) |
| Shadow | subtle gray-alpha, never black | subtle navy-tinted rest + state | **Match** (philosophy identical) |
| Borders | gray4/5/6 hairlines | single `border` value | Close (they use 3 weights) |
| Table density | compact (~xs cells, 8px pad) | 54px rows / 50px DB-view | Diverge (they're denser) |
| Filters chrome | tinted pill chips | bordered `control` chips | Diverge (idiom choice) |
| IA | record-centric: object view → record page (side panel) → ⌘K | task/RACI/updates screens | **Missing: record page + command surface depth** |
| Customization | views/fields/widgets/layout user-customizable | fixed views | Out of first-slice scope |

### Reading of the gap
Our **foundations already match** (light, near-mono, one accent, 4px, border-first, subtle non-black
shadows, no-bold hierarchy). To "closely reflect Twenty" the real, finite delta list is:
1. **Font** → back to Inter (one family).
2. **Color** → adopt Radix-P3 gray + indigo accent + a categorical tag palette.
3. **Action model** → decide: keep One-Blue-action, or move to near-black primary + indigo accent (their model).
4. **Dark theme** → net-new, scope as its own phase.
5. **Radius** → consider tightening cards 12→8 to match.
6. **Density + filter-chip idiom** → align table density and chip styling.
7. **IA depth** → record page (side panel + tabs) and a deeper command menu, where they serve MOS jobs.

Items 1–6 are token/component-level (ratifiable via Phase-0 mockups → DESIGN.md rewrite). Item 7 is a
product/IA decision that belongs in the roadmap, not just the design system.

---

## 7. Sources (all public, read-only)
- Theme constants: `twentyhq/twenty` → `packages/twenty-ui/src/theme/constants/` (Gray/Color/Accent/Font/
  Border/BoxShadow/Background/Theme/Tag/Animation/Text/Icon).
- Canonical product screenshots: `packages/twenty-website/public/images/readme/v2-*.webp` + `github-cover-light.webp`.
- License: `twentyhq/twenty/LICENSE` (AGPL-3.0 + Enterprise-marked files).
