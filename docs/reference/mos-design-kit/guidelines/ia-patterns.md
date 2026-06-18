# IA / IxD patterns

Measured layout + interaction patterns for the MOS direction, captured as **facts** (dimensions, structure,
states) from an open-source CRM's product surface and re-expressed in entity-neutral terms. Re-implement in
the app's own components; these are the spec, not shipped code. All values reference `--ds-*` / alias tokens.

## App shell

`[ left rail (fixed) ] [ main area (table / kanban / record page) ]` — the rail is persistent; the main
area swaps view. A command menu (⌘K) overlays everything.

## Left rail (sidebar)

- **Width ~236px**, full height, `background-secondary` (faint grey — *not* white; the white canvas sits to
  its right), `1px border-light` on the right, `spacing-2` padding, column flex.
- **Top: workspace switcher** — small logo mark + workspace name (`font-size-md`, weight 600) + a
  `chevron-down`. Click opens workspace/menu.
- **Search row** — 32px, `1px border-medium`, `radius-sm`, search icon + "Search" + a `⌘K` chip; reads as a
  text field, opens the command menu.
- **Utility items** — Search, Notifications, Settings (same NavItem shape as below).
- **Sections** — overline-ish labels (`font-size-xs`, weight 500, `font-color-light`, padded): a
  **Favorites** group, then a **Workspace** group listing the primary entities.
- **NavItem** — **28px tall**, `radius-sm`, `font-size-sm`, 16px leading icon, optional trailing count
  (`font-size-xs`, light, right-aligned). States:
  - *inactive* → `font-color-secondary` text, `font-color-tertiary` icon, transparent bg, weight 400.
  - *hover* → `background-transparent-light` fill.
  - *active* → `background-transparent-light` fill, `font-color-primary` text, **icon tinted to the accent
    (`--ds-color-blue`)**, weight 500.
- **Bottom: user chip** — pinned to the rail foot (spacer pushes it down), ~36px: avatar + name. *(Note: our
  current rail puts the user in the top bar — reflecting this pattern moves it into the rail foot.)*

## Record table (signature)

White page (`background-primary`), `font-size-sm`.
- **Header row** — entity icon + title (`font-size-md`, weight 600) + a **count chip** (`font-size-xs`,
  `font-color-tertiary`, `background-tertiary`, pill, `1px 8px`). Bottom `border-light`.
- **Toolbar row** — view tabs / filter / sort as chips (`radius-sm`, `font-size-sm`, weight 500, `4px 8px`).
  Bottom `border-light`.
- **`th`** — sticky top, `background-primary`, **32px**, left-aligned, weight **400** (not bold),
  `font-size-xs`, `font-color-light`, optional 14px leading icon, bottom `border-light`.
- **`td`** — **~33px tall** (dense), `0 spacing-2` padding, bottom `border-light`, `font-color-primary`.
- **Checkbox column** — **32px** wide, `paddingLeft 12`; the checkbox is **hidden until row hover or
  selected** (`visibility`). "Select all" supports an indeterminate state.
- **Cells** — the primary-name cell is a clickable **Chip** that opens the record; secondary text cells use
  `font-color-secondary` with a 14px leading glyph; numeric cells use **`tabular-nums`**; status/category
  cells render a soft colored **Tag**.
- **Row hover** → `background-secondary`.

## Record page (signature)

`[ breadcrumb ] / [ left details panel | right tabbed feed ]`
- **Breadcrumb row** — entity (icon + name, click = back) → `chevron-right` → current record name
  (`font-color-primary`). Bottom `border-light`.
- **Left details panel** — **~332px**, fixed, `1px border-right`, `spacing-4` padding, `spacing-4` gap,
  scrolls:
  - *Identity row* — `xl` avatar + name (`font-size-xl`, weight 600, `letter-spacing -0.01em`) + a sub line
    (`font-size-sm`, tertiary).
  - *Actions* — small icon buttons.
  - *Field sections* — section label (`font-size-xs`, UPPERCASE, `letter-spacing .05em`, weight 500, light);
    then field rows: `min-height 30`, label column **104px** (`font-color-tertiary` + 14px glyph), value
    (`font-color-primary`), inline-editable.
- **Right feed** — tab strip (`font-size-sm`, weight 500; active = `font-color-primary` + **2px accent
  bottom-border**; inactive = tertiary). Tabs e.g. Timeline / Tasks / Notes / Files. Feed = list of events
  (glyph + secondary text + light timestamp); notes render in a soft `color-yellow1` card.

> **MOS mapping.** This two-column record page is the highest-value IxD pattern to reflect. Map "record" to
> the MOS entity that earns a detail view (e.g. **Task** or **Project**): left panel = its fields (owner,
> RACI, status, dates) + tags + related people; right feed = activity / updates / comments. Which entities
> get this treatment is a roadmap decision, not a token one.

## Kanban board

- **Board** — horizontal scroll, `spacing-3` gap + padding, columns top-aligned.
- **Column** — **~248px** wide, `spacing-2` gap. Head: name (`font-size-sm`, weight 500) + count
  (`font-size-xs`, light) + a right-aligned **sum** (`font-size-xs`, tertiary, `tabular-nums`).
- **Card** — `background-primary`, `1px border-medium`, `radius-md` (8px), `spacing-2` padding,
  `box-shadow-light`. *Hover* → `border-strong` + `box-shadow-strong`. Content: name (`font-size-sm`,
  weight 500), a headline value (`font-size-sm`, weight 600, `tabular-nums`), and a meta row (xs avatar +
  label + a dated glyph). A small colored **dot** per column maps the stage.

## Cross-cutting IxD notes

- **Affordances appear on hover** (row checkbox, card border lift, row menu) — quiet at rest.
- **One accent does interaction** — the blue marks active nav, focus, links, primary action; everything
  else is neutral or a soft tag.
- **Tabular numerics everywhere** money/counts appear.
- **Sentence case**, tight spacing, hairline borders over shadows.
