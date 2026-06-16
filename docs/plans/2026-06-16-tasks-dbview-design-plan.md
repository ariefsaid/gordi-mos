# Tasks DB-view — UI Design-Plan (design-architect)

**Date:** 2026-06-16 · **Author:** design-architect · **Feature:** P3 Tasks redesign — full-bleed DB-view workspace
**Status:** Design-plan for eng-planner → ADR-0008 → build (PR-1/2/3). All visual direction LOCKED & render-verified.

## Oracles (binding inputs — do not re-decide)
- **Visual oracle (render-verified):** `docs/design-mockups/tasks-dbview-final.html` (context: `-A.html`, `-B.html`).
- **Decisions:** `docs/decisions.md` → **OD-P3-6** (full-bleed DB-view IA + grilled build-specs), **OD-P3-7** (navy+orange brand amendment), **OD-P3-8** (@tanstack/react-table), plus inherited OD-P3-2/3/4/5.
- **Design system being amended:** `DESIGN.md` (repo root) — the identity authority.
- **Lens-D oracle:** `docs/jtbd.md` → Tasks (`/tasks`) job: *"scan the work, filter by owner / RACI-role / status, spot what's off track, open the one that needs attention."*
- **Code being redesigned:** `mos-app/src/components/tasks/TasksTable.tsx` (+ `.css`), `mos-app/src/shell/PageFrame.tsx` (the 1080 cap), the shipped split-view (`TasksLayout` / `TaskDrawer` / `TaskSurface`, ADR-0007 — KEPT).

> **Scope note:** This plan turns LOCKED decisions into a buildable spec. It does **not** introduce net-new visual direction. Where the mockup uses a literal value, this plan names the DESIGN.md token it maps to; the four mockup inline literals that are genuinely new (navy, orange, and their tints/text) become the OD-P3-7 amendment tokens specified in §2. No raw hex/px decisions are made here that aren't already in the mockup or DESIGN.md.

---

## 1. Component breakdown

The shipped split-view shell (ADR-0007) is **kept verbatim** as the open paradigm; the table *inside* it is rebuilt. Routes are unchanged (`/tasks`, `/tasks/:id`, `/tasks/new` resolve through `TasksLayout` → `<Outlet>` drawer). The full-bleed change is in `PageFrame`; the DB-view IA (view-tabs + group-by) is new structure layered onto `TasksTable`.

### 1a. Layout / shell

| Component | File (new ◇ / changed ◆ / kept ●) | Role |
|---|---|---|
| `PageFrame` | ◆ `mos-app/src/shell/PageFrame.tsx` | Gains a `variant: 'data' \| 'prose'` prop (default `prose`). `data` removes the `maxWidth: 1080` cap and tightens horizontal padding to the toolbar/table gutter (`24px`, mockup `.titlerow`/`.toolbar` padding). `prose` keeps the 1080 readable cap (Weekly-update write stays prose). **Tasks passes `variant="data"`.** |
| `TasksLayout` | ● `mos-app/src/pages/TasksLayout.tsx` | Unchanged contract: owns `expanded` (`useExpandPref`), `statusOverrides`, `refreshKey`, renders `<TasksTable … drawerSlot={<Outlet/>}>`. Only change: `<PageFrame variant="data">`. |
| `TaskDrawer` / `TaskSurface` / `TaskDrawerHeader` / `TaskTabStrip` | ● (all in `components/tasks/`) | The side-peek editor — **kept**. One visual touch (PR-1, token-only): the drawer's active-tab underline switches from `primary` to **navy** (`--brand-navy`) per OD-P3-7 (structural, not action). No structural change. |

### 1b. The workspace (rebuilt `TasksTable` → `TasksWorkspace`)

`TasksTable.tsx` is renamed/refactored to a **`TasksWorkspace`** assembly. The ~23 hand-rolled `useState`/`useMemo` for filter/sort/group are replaced by a single `@tanstack/react-table` instance (OD-P3-8, headless — our markup). The keyboard layer (`useTasksKeyboard`), optimistic `statusOverrides`, and `@tanstack/react-virtual` window are **retained** and re-wired onto the TanStack row model.

| Component | File | Role | States it owns |
|---|---|---|---|
| `TasksWorkspace` | ◆ `components/tasks/TasksWorkspace.tsx` (from `TasksTable.tsx`) | The assembly: title row + view-tab strip + toolbar + grouped table / mobile cards + drawer slot. Holds the TanStack table instance. | loading · error · empty · no-results · zero-overdue header |
| `TitleCountLine` | ◇ (sub-component or inline) | `Tasks` H1 + count line (`11 tasks · 2 blocked · 3 overdue`). The **"N overdue"** segment is a **click-to-filter button** (sets status→overdue-only view, see §3/§5). | zero-overdue variant (no overdue segment) |
| `ViewTabStrip` | ◇ `components/tasks/ViewTabStrip.tsx` | Table (active) · Board (stub) · Calendar (stub). Roving-tabindex tablist. Stubs are `aria-disabled` with a "SOON" pill. | — (static; stubs non-interactive) |
| `TasksToolbar` | ◇ `components/tasks/TasksToolbar.tsx` | Group · Business unit · Person · [Mine/RACI/All segment] · Search · New task. Owns the **Person-overrides-segment** rule. | segment-disabled (when a Person is chosen) |
| `GroupByControl` | ◇ (within toolbar) | The navy-tinted group-by control (`Group: Status ▾`). Menu: Status (default) · Owner · BU. | — |
| `GroupedTable` | ◇ `components/tasks/GroupedTable.tsx` | Renders `getGroupedRowModel()` + `getExpandedRowModel()` over our `<table>` markup. Horizontal hairline gridlines only, 50px rows, hover quick-actions. Virtualized at 50+ leaf rows. | (delegates state rendering to workspace) |
| `GroupHeaderRow` | ◇ `components/tasks/GroupHeaderRow.tsx` | `<tr class="grp">` → caret + label + count + overdue subtotal + "+ Add task". Collapsible (`aria-expanded`). Overdue subtotal is **click-to-filter**. | collapsed · zero-overdue (no subtotal) |
| `MobileGroupedCards` | ◇ `components/tasks/MobileGroupedCards.tsx` | `<768px`: group headers + `TaskCard`s for the chosen group-by; **no view-tabs, no toolbar segment row collapses to a compact filter sheet**. Reuses existing `TaskCard`. | loading (skeleton cards) · empty · error · no-results |
| `StatusPill` | ◆ `components/tasks/StatusPill.tsx` (+ `.css`) | **Already soft-tinted and AA-correct** (see `StatusPill.css` — matches the mockup's `.pill.*` exactly). **No change needed** for the chip palette. Confirm the dot is ≥8px (see §5 a11y note — current dot is 6px; bump to 8px). | — |
| `OwnerCell` | ◆ `components/tasks/OwnerCell.tsx` | Grey avatar + first name + **"+N" with a hover/focus tooltip** revealing C/I people (new — see §1c). Avatar fill stays neutral grey (`secondary`), NOT navy. | tooltip open |
| `useGroupCollapsePref` | ◇ `components/tasks/useGroupCollapsePref.ts` | Per-user-global collapsed-group + view + group-by persistence (mirrors `useExpandPref`'s `useSyncExternalStore`-over-`localStorage`). Keys below. | — |
| `useTasksKeyboard` | ◆ `components/tasks/useTasksKeyboard.ts` | Retained; the row cursor must **skip group-header rows** (j/k iterate leaf rows only; the cursor index maps to the flat leaf-row array, group headers are not cursor targets). | — |

### 1c. The "+N" RACI tooltip (Lens-D + 4-lens finding)
The Owner cell's `+N` today is a silent glyph. Per the review finding it becomes an **accessible tooltip** revealing the Consulted/Informed people (and the A if not the R):
- Trigger: `+N` is a `<button>` (or `<span tabindex=0 role="button">`) — hover **and** keyboard-focus reveal.
- Content: a small popover listing each other RACI member as `R/A/C/I · Name` (reuse the drawer's `.raci-chip` `<k>` glyph convention).
- This is a **read-only disclosure**, not an editor (the drawer remains the editor). It satisfies "not a silent glyph" without adding an action.

### Persistence keys (mirror `mos.tasks.expandDefault`)
- `mos.tasks.view` → `'table'` (only valid value in v1; Board/Calendar are stubs).
- `mos.tasks.groupBy` → `'status' | 'owner' | 'bu'` (default `'status'`).
- `mos.tasks.collapsedGroups` → JSON `{ [groupBy]: string[] }` (collapsed group keys per dimension).

All three live in **one** `useSyncExternalStore` module (`useTasksViewPref`/`useGroupCollapsePref`) so multiple consumers re-render together — the exact C1-fix pattern `useExpandPref` already uses.

---

## 2. DESIGN.md amendment spec (apply in PR-1 — paste-ready)

> **Where it lands in DESIGN.md:** new entries in **§2 Colors** (the brand tokens + named rules), the **frontmatter `colors` block** (so the token table stays complete), **§5 Components** (new view-tab strip + group-header + dense-row + toolbar-control specs), and a new **"Gordi brand tokens (OD-P3-7)"** subsection after "Field-error tokens". This is the OD-P3-7/ADR-0008 identity amendment — the **first** sanctioned divergence from the adopted RIS palette, owner-ratified.

### 2.1 New color tokens (frontmatter `colors:` + §2)

```yaml
  # --- Gordi brand (OD-P3-7, ratified 2026-06-16; the first owner-approved
  #     divergence from the adopted RIS near-monochrome) ---
  brand-navy:        "hsl(218 46% 22%)"   # structural weight; NOT an action color
  brand-navy-text:   "hsl(218 42% 26%)"   # AA text/label on white & on navy-tint
  brand-orange:      "hsl(18 80% 48%)"    # brand sprinkle ONLY; never status, never action
```

Runtime `:root` triplets (bare `H S% L%` form, per "How to use these tokens"):
```css
  --brand-navy:      218 46% 22%;
  --brand-navy-text: 218 42% 26%;
  --brand-orange:    18 80% 48%;
```
- **Navy tint** (`brand-navy / 0.06`–`0.08`) is generated via the v4 slash-alpha modifier (`bg-brand-navy/6`) — no separate token, mirroring how `primary/10` works. Mockup uses `--navy-08` = `hsl(218 46% 22% / 0.06)`; standardize on **`brand-navy/6`** for fills.
- **No `brand-orange` tint/text token** — orange is only ever used at full strength as a tiny marker (logo dot, active view-tab underline); it never carries text or a fill behind text, so it needs no AA-darkened variant.

### 2.2 New §2 "Named Rules" (append after The Single-Border Rule)

> **The Structural-Navy Rule (OD-P3-7).** `brand-navy` carries *structural* weight the lone action-blue must not: the logo square + dot, the active nav indicator (inset-shadow rail marker), the group-by control, the drawer's active-tab underline, the avatar gradient (`navy → primary`). It is **never** an action color (no buttons, no links) and **never** a status. The One-Blue Rule is preserved — `primary` blue remains the *only* interactive/action color.
>
> **The Orange-Sprinkle Rule (OD-P3-7).** `brand-orange` is a brand sprinkle used **sparingly** (≤2 marks per screen): the logo dot and the **active view-tab underline marker**. It is kept **OFF all status semantics** (it sits hue-wise between the red/amber status hues and would be misread as a warning) and **OFF all actions**. Never a status, never a link, never a button.

### 2.3 Avatar gradient amendment (§5 Navigation / §2)
The §5/§Header avatar gradient changes from **blue→violet** to **navy→blue**:
```
.avatar { background: linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--primary))); }
```
Update the §5 "Top bar (header)" line "user chip (avatar gradient blue→violet …)" → **"avatar gradient navy→blue"**. (The categorical-violet avatar gradient was a PMO carry-over; OD-P3-7 makes the avatar a brand surface.) The §Categorical-Violet usage note stays for KPI/timeline dots; only the avatar moves to navy→blue.

### 2.4 Dense-row note (§5 Data Table)
Append to §5 Data Table → Body cells:
> **Dense DB-view variant (OD-P3-6).** On the full-bleed Tasks DB-view, body rows run **50px** (not the standard 54px) — an intentional density increase for the scan-many-rows workspace job, paired with horizontal hairline dividers (`border/70%`) and **no vertical column rules** (vertical "stripes" hurt scan-readability — owner). 54px remains the default for all other DataTables. The 50px figure is the only deliberate divergence from the 54px row token and is documented here so it isn't "drift."

### 2.5 NEW §5 component — View-tab strip
> **View-tab strip (OD-P3-6).** A horizontal tab strip above the toolbar selecting the workspace view (Table · Board · Calendar). 34px tall tabs, 13px/600, `0 12px` padding, 7px gap to a 15px icon. Inactive = `muted-foreground`; hover = `foreground`; **active = `brand-navy-text` + a 2px `brand-orange` bottom border** (the one orange sprinkle). Disabled/"SOON" stubs = `hsl(240 4% 62%)` text + `not-allowed` cursor + a small `secondary`/`muted-foreground` "SOON" pill, `aria-disabled="true"`. `role="tablist"` / `role="tab"` / `aria-selected`; roving tabindex. The strip is the "this is a database view, not a to-do list" signature.

### 2.6 NEW §5 component — Group header row
> **Group header row (OD-P3-6).** Inside the grouped DataTable, each group is introduced by a full-width `<tr>` rendered as a clean **hairline-separated** row (38px): top + bottom 1px `border`, transparent bg — **no navy band, no left-edge swatch** (left stripes removed as distracting — owner). Contents: a caret (`▾`/`▸`, `muted-foreground`, `aria-expanded`), the group **label** (13px/700, `brand-navy-text`, the structural-navy use), a plain **count** (`muted-foreground`, `tabular-nums`), an **overdue subtotal** when >0 (`· N overdue`, `--status-lost-text`, click-to-filter), and a trailing **"+ Add task"** ghost affordance (`muted-foreground`, pre-fills the grouped dimension). The whole header toggles collapse on click/Enter/Space. Groups are **always shown** (including empty ones) for layout stability.

### 2.7 NEW §5 note — Toolbar filter-control treatment (A's chrome)
> **DB-view toolbar controls (OD-P3-6).** The Tasks toolbar uses **bordered** filter controls (the existing `control` chip: 32px, 1px `input` border, 8px radius, `muted-foreground` label + `foreground` value + chevron) — A's bordered chrome, not borderless text triggers. The **group-by control is the exception**: it is tinted to read as the active "database" control — `brand-navy/6` bg + 1px `brand-navy` border + `brand-navy-text` text + 600 weight (the structural-navy use). The Mine/RACI/All `seg` segmented control is unchanged (`secondary` track, white "on" pill + lift). **The segment is disabled when a Person filter is set** (Person overrides it): disabled `seg` = `opacity: 0.5`, `aria-disabled`, with the segment visually reading "Person: me" — see §3 no-results / §5.

### 2.8 Confirm StatusPill (no change, just ratify the dot size)
The four soft-tinted chips already match the "Tinted-Status Rule" and the mockup (`StatusPill.css` `pill-inprogress/blocked/open/done`). **One a11y fix:** bump the `.dot` from 6px → **8px** (WCAG/visibility; see §5). DESIGN.md §5 "6px colored dot" stays the *default* for other surfaces; add: *"Task status chips use an 8px dot + always-present text label (never dot-only) so status stays perceivable when grouping ≠ Status (WCAG 1.4.1)."*

---

## 3. All states (copy + tokens)

| State | Trigger | Layout / copy | Tokens |
|---|---|---|---|
| **Loading** | initial fetch (`loading`) | Desktop: skeleton table — group-less, 5 shimmer rows (existing `SkeletonRow`), `aria-busy` + `role=status` "Loading tasks". Mobile: 3 skeleton cards. View-tabs + toolbar render immediately (chrome is static, not data-bound). | skeleton fill `secondary`; shimmer `accent`; `card` bg |
| **Empty — no tasks** | `sortedTasks.length === 0`, no filters | Centered empty block inside the scroll area: H3 + copy + primary CTA. Segment-aware copy (existing `emptyTitle`/`emptyCopy`): Mine → *"No tasks assigned to you"* / *"When a task names you as R or A it shows up here. Create one or switch to All."*; All → *"No tasks yet"* / *"Create the first task to start tracking work."* CTA: **`+ New task`** (`btn-primary`). View-tabs + toolbar stay visible. | `foreground` title; `muted-foreground` copy; `primary` CTA |
| **Error** | `error` set (fetch failed) | `role="alert"` banner inside the scroll area: *"Couldn't load tasks"* + **Retry** (re-runs `load()`). Existing `.error-banner` kept. Chrome stays. | `--status-lost-text` text; `input` border; `card` bg; `primary` Retry (outline) |
| **No results after filter** | `length === 0` **with** an active filter (BU/person/search/segment≠all) | Distinct from empty-no-tasks: *"No tasks match these filters"* + *"Clear filters to see all tasks."* + a **Clear filters** button (resets BU/status/person/search/segment→all) **plus** the `+ New task` CTA. Groups are NOT shown (there are no groups to show when zero leaf rows). | same as empty; **Clear filters** = `button-outline` |
| **Zero-overdue header** | page overdue count `=0` | Count line **omits** the overdue segment entirely (`11 tasks · 2 blocked` — no `· 0 overdue`). No green "all clear" badge (calm system — absence is the signal). Per-group headers likewise drop their `· N overdue` subtotal when 0. | count line `muted-foreground`; (no red token rendered) |
| **Empty group** | a group with 0 leaf rows (only possible grouping by Owner/BU) | Group header **still shown** (layout stability, OD-P3-6) with count `0`, caret present, "+ Add task" present, **no leaf rows** beneath it. No overdue subtotal. | header tokens as §2.6; count `muted-foreground` |
| **Segment-disabled** | a Person filter is chosen | The Mine/RACI/All `seg` greys to `opacity:.5`, `aria-disabled`, and reads as "Person: me" semantically (the Person filter is now the owner scope). Person control shows the chosen name. | `seg` track `secondary`; disabled `opacity:0.5` |
| **Selected row** | `/tasks/:id` open | Flat neutral-grey fill (`hsl(240 5% 91%)` → token `secondary` stepped, see token map), **no left bar, no blue/navy tint** (owner). `aria-current="true"`. | flat grey (secondary-ish); no accent stripe |

Copy is realistic Gordi data in mockups; live copy uses the strings above verbatim.

---

## 4. Responsive

Three existing breakpoint hooks are reused unchanged — **do not add new thresholds**:
- `useIsDesktop()` — `(min-width: 768px)` — table↔mobile-cards reflow (DESIGN.md OD-W4-4).
- `useIsNarrow()` — `(min-width: 920px)` — rail collapse (shell, unchanged).
- `useIsSplitWidth()` — `(min-width: 1100px)` — live push/squash split vs overlay drawer (ADR-0007).

| Width | Regime | Tasks DB-view behavior |
|---|---|---|
| **≥1100px** | Live split (`splitLayout=true`) | Full-bleed workspace. With a drawer open, the table **squashes to ~2/3** and **condenses** (drops the Activity column — existing `condensed` logic). View-tabs + toolbar + group headers all present. Group-by control, navy chrome, 50px rows. |
| **920–1100px** | Overlay drawer (`splitLayout=false`) | Full-bleed workspace stays full-width; the drawer floats as a modal overlay (no squash, table does **not** condense — keeps all columns). View-tabs + toolbar + groups unchanged. (Rail still present down to 920.) |
| **768–920px** | Rail collapsed, table still rendered | Rail collapses to hamburger (shell). Table view still renders (it's ≥768). Toolbar wraps (`flex-wrap`, mockup behavior). Drawer = overlay/full-screen. |
| **<768px** | **Mobile grouped cards** | `MobileGroupedCards`: **no view-tab strip** (OD-P3-6), the toolbar collapses to a compact filter affordance (group-by + segment in a sheet/row), then **group headers + `TaskCard`s** for the chosen group-by. Tapping a card → **full-screen task** (`/tasks/:id`, OD-P3-2 mobile = full-screen, no 1/3 drawer). Group headers carry the same caret/count/overdue-subtotal; collapse persists per-user-global. |

Reconciliation note: the full-bleed change (PageFrame `variant="data"`) only affects horizontal max-width; it does **not** change the split/overlay/mobile regimes, which remain governed by ADR-0007's `useIsSplitWidth` + the 768 card reflow. Prose surfaces (`variant="prose"`) keep the 1080 cap.

---

## 5. Accessibility (WCAG-AA)

### Focus order (DOM order = tab order; existing rail→header→main is preserved)
1. **View-tab strip** — `role="tablist"`, roving tabindex: only the active tab is `tabindex=0`, arrow keys move between tabs, Enter/Space activates. **Stubs (Board/Calendar)** are `role="tab" aria-disabled="true" tabindex="-1"` — focusable-skippable (announced "dimmed/SOON", not activatable). 
2. **Toolbar** — Group control → BU select → Person select → segment (`role="tablist"`, disabled when Person set: `aria-disabled="true"` + removed from tab order) → search input → New task.
3. **Group header rows** — each header is a `<button>` (or `tr` with a focusable toggle) carrying `aria-expanded={!collapsed}` and `aria-controls` pointing at its leaf-row group; the **overdue subtotal** and **"+ Add task"** are separate focusable controls within the header. Collapse toggles on Enter/Space.
4. **Leaf rows** — each row's primary link (`/tasks/:id`) is focusable; `+N` owner disclosure is a focusable button revealing the C/I tooltip on focus (not hover-only). Hover quick-actions must also be **focus-reachable** (not `display:none`-only — use a focus-within reveal so keyboard users get them; if quick-actions duplicate drawer actions they may be `aria-hidden` redundant controls — prefer exposing them).
5. **Drawer** — unchanged ADR-0007 focus management (Esc closes, focus trap when overlay).

### Keyboard (OD-P3-4 layer, retained; one change)
- `j` / `k` move the **leaf-row** cursor — **skips group-header rows** (cursor maps to the flat leaf-row array; collapsed groups' rows are excluded from the cursor sequence). `Enter` / `o` open. `Esc` close drawer. `n` new. `e` toggle expand. Single-letter hotkeys suppressed in text fields (existing behavior).
- Group-header collapse is keyboard-reachable independent of j/k (Tab to the header button, Enter/Space).

### The chip-label + dot rule (WCAG 1.4.1 — color is not the only channel)
- Status chips **always show the text label** (`In Progress`, `Blocked`, …) — **no dot-only compact variant**, ever (critical now that grouping by Owner/BU mixes statuses in one group). The dot is **8px** (bumped from 6px) and is a redundant cue, not the sole one.
- Overdue is signaled by **red text + the word "Overdue"** (`Overdue · Jun 12`), not red alone. The page "N overdue" and group subtotals carry the literal word "overdue."

### Contrast (all AA-verified, reusing DESIGN.md AA-darkened text tokens)
| Element | Fg / Bg | Ratio |
|---|---|---|
| In-Progress chip | `hsl(221 75% 38%)` on `primary/12%` | ≥4.5:1 (existing `--status-open-text`) |
| Blocked chip | `--status-lost-text` `hsl(0 72% 45%)` on `destructive/12%` | ≥4.5:1 |
| Open chip | `hsl(22 78% 26%)` on `warning/18%` | ≥4.5:1 (deep-brown on amber) |
| Done chip | `hsl(142 64% 30%)` on `success/14%` | ≥4.5:1 |
| Overdue date / "N overdue" | `--status-lost-text` on white | ≥4.5:1 |
| Group label | `brand-navy-text` `hsl(218 42% 26%)` on white | ≥7:1 (very dark navy) |
| Active view-tab text | `brand-navy-text` on white | ≥7:1 (orange is the 2px marker only — not relied on for contrast) |
| Group-by control | `brand-navy-text` on `brand-navy/6` | ≥6:1 |
| Disabled stub tab | `hsl(240 4% 62%)` on white | ~3:1 — **acceptable for disabled** (WCAG exempts disabled controls); paired with the "SOON" pill + `aria-disabled` so state isn't color-alone |

- **Orange is never a text/contrast carrier** — it's a 2px underline + an 8px logo dot only, so it has no AA text obligation. The active-tab *meaning* is carried by `brand-navy-text` + the underline together (1.4.1 safe).
- **Focus ring** — global `*:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px }` (primary blue) applies to view-tabs, group headers, the `+N` disclosure, rows, and toolbar controls. Keep it; do not override per-component.

### Semantics
- View-tabs: `tablist`/`tab`/`aria-selected`/`aria-disabled`. Group headers: `aria-expanded`/`aria-controls`. Selected row: `aria-current="true"`. Owner `+N`: `<button aria-label="Show other RACI members">` opening a labelled popover. Click-to-filter affordances ("N overdue", group subtotal): real `<button>`s with `aria-label` (e.g. "Filter to 3 overdue tasks").

---

## 6. Token map (element → DESIGN.md token)

| Element | Token(s) |
|---|---|
| App bg (full-bleed page) | `secondary/35%` (main scroll wash) |
| Card surfaces (table body, toolbar, drawer) | `card` |
| All hairlines / row dividers | `border` (rows soften to `border/70%`) |
| H1 "Tasks" | type `page-title` (24/700/-0.02em), `foreground` |
| Count line | type `body`/`label`, `muted-foreground`, `tabular-nums`; overdue segment `--status-lost-text` |
| **Logo square** | bg `brand-navy`, text `primary-foreground` |
| **Logo dot** | `brand-orange` (sprinkle) |
| Active nav indicator | `brand-navy/6` bg + `brand-navy-text` + inset `brand-navy` rail marker |
| **Avatar (header user)** | gradient `brand-navy → primary` |
| Owner row avatar | `secondary` bg + `brand-navy-text` initials (neutral grey, NOT navy fill) |
| **View-tab (active)** | text `brand-navy-text` + 2px `brand-orange` bottom border |
| View-tab (inactive / hover) | `muted-foreground` / `foreground` |
| View-tab stub "SOON" pill | `secondary` bg + `muted-foreground` |
| Toolbar filter controls | `card` bg + `input` border + `muted-foreground` label + `foreground` value |
| **Group-by control** | `brand-navy/6` bg + `brand-navy` border + `brand-navy-text` |
| Segment (Mine/RACI/All) | track `secondary`; "on" = `card` pill + pressed lift; disabled `opacity:0.5` |
| Search-mini | `card` bg + `input` border; placeholder `muted-foreground` |
| New task button | `button-primary` (`primary` bg + faint brand shadow) |
| Table header cells | `table-header-cell` (overline 11.5/600 uppercase, `muted-foreground`, sticky, `border` bottom) |
| Table body cells | `table-body-cell` **at 50px** (dense variant) + `border/70%` divider |
| Row hover | `accent/60%` |
| Selected row | flat `secondary` (stepped grey), no stripe |
| **Group header** | hairline `border` top+bottom; label `brand-navy-text`; count `muted-foreground`; overdue subtotal `--status-lost-text`; "+ Add task" `muted-foreground` |
| Status chips | `StatusPill` tokens (in-progress `primary/12`+`--status-open-text`; blocked `destructive/12`+`--status-lost-text`; open `warning/18`+`warning-foreground`; done `success/14`+`--status-won-text`); 8px dot |
| Due — overdue | `--status-lost-text`, `tabular-nums` |
| Due — soon/calm | `foreground` / `muted-foreground`, `tabular-nums` |
| Activity age | `muted-foreground`, `tabular-nums` |
| Quick-actions (hover) | `button-ghost`-like, `input` border, `muted-foreground` |
| Drawer | `card` + left `border`; active tab underline `brand-navy` (PR-1 token swap) |
| Focus ring | `ring` (= `primary`), 2px, 2px offset |
| Create-form field error | `--field-error-border` (=`destructive`) outline + `--field-error-text` (=`--status-lost-text`) helper |

---

## 7. Phasing alignment (owner's PR-1 / PR-2 / PR-3 split — OD-P3-8)

### PR-1 — Tokens + DESIGN.md amendment (no layout change)
- Apply §2 amendment to `DESIGN.md` verbatim (brand-navy / brand-navy-text / brand-orange + the two named rules + avatar gradient + dense-row note + view-tab/group-header/toolbar component specs + the 8px-dot/always-label note).
- Add the runtime `:root` triplets + Tailwind `@theme inline` mappings (`--color-brand-navy` etc.) per DESIGN.md "How to use these tokens."
- Token-only visual touches: logo navy+orange-dot, header avatar gradient → navy→blue, active nav indicator → navy tint, drawer active-tab underline → navy. StatusPill `.dot` 6px→8px.
- **No IA change, no engine change.** Verifiable by snapshot/contrast tests; the table still works exactly as today.

### PR-2 — Full-bleed layout + view-tab scaffold + toolbar (still hand-rolled engine)
- `PageFrame` gains `variant`; `TasksLayout` passes `variant="data"` (kill the 1080 cap for Tasks).
- Build `ViewTabStrip` (Table active; Board/Calendar `aria-disabled` stubs with SOON pill).
- Rebuild the toolbar: `GroupByControl` (navy-tinted, menu Status/Owner/BU — wired in PR-3) · BU · Person · segment (with the **Person-overrides-segment disable rule**) · Search · New task.
- Count line "N overdue" + (later) group subtotals become **click-to-filter** buttons.
- Add `useTasksViewPref`/`useGroupCollapsePref` persistence module (keys in §1).
- States: loading/empty/error/no-results/zero-overdue chrome all render with the new shell.
- Engine still the existing `useState`/`useMemo` filtering/sort (group-by select exists but renders flat until PR-3, or PR-2 ships group-by UI disabled — eng-planner's call; recommend wiring group-by in PR-3 to keep PR-2 a pure layout slice).

### PR-3 — TanStack refactor + group-by engine + group headers
- Refactor `TasksTable` → `TasksWorkspace` onto `@tanstack/react-table` headless row models: `getGroupedRowModel()` + `getExpandedRowModel()` for grouping/aggregation (group counts + overdue subtotals via aggregation fns), `getSortedRowModel()` (within-group **Due asc**, overdue first), `getFilteredRowModel()`, `getColumnVisibilityModel()` (the condense ladder). **Client-side** (`listTasks` fetches all).
- Build `GroupHeaderRow` (caret + label + count + overdue subtotal + "+ Add task" pre-filling the grouped dimension) and `GroupedTable`; **show all groups always** (incl. empty).
- Re-wire `useTasksKeyboard` so **j/k skip group headers** (leaf-row cursor) and `useTasksReactVirtual` windows leaf rows under the group structure.
- Re-wire `statusOverrides` (optimistic) + `refreshKey` onto the TanStack data path.
- `MobileGroupedCards` for `<768px` (group headers + cards, no view-tabs).
- `OwnerCell` `+N` → accessible C/I tooltip.
- **Re-verify** the freshly-shipped split-view (drawer open/expand/condense, keyboard, virtualization) against the new engine — the known one-time cost of OD-P3-8.

---

## Open questions for the owner
1. **Group-by in PR-2 vs PR-3.** PR-2 is cleanest as a pure layout/scaffold slice (group-by control visible but the actual grouping lands with TanStack in PR-3). Confirm the group-by **menu** may be present-but-flat in PR-2, or whether PR-2 should ship without the control until PR-3. *(Recommendation: scaffold the control in PR-2, wire grouping in PR-3.)*
2. **"+ Add task" pre-fill scope.** OD-P3-6 says it pre-fills the grouped dimension (status/owner/BU). When grouping by **Owner**, the pre-fill sets the new task's **R** (responsible) to that person — confirm R (not A) is the intended pre-fill target. *(Recommendation: R, matching the "Owner" column = R convention in jtbd §3.)*
3. **Click-to-filter target for "N overdue".** Page-level "N overdue" → does it (a) filter to overdue-only across all groups, or (b) collapse all non-overdue groups? *(Recommendation: (a) — a transient "overdue only" filter chip the user can clear, consistent with the no-results Clear-filters affordance.)*

---

## Summary
- **File written:** `docs/plans/2026-06-16-tasks-dbview-design-plan.md` (this file).
- **Token sets used:** the full adopted DESIGN.md palette (primary, secondary/muted/accent, border, status + AA-darkened text tokens, field-error pair).
- **Proposed token additions (OD-P3-7, ratified into DESIGN.md in PR-1):** `brand-navy`, `brand-navy-text`, `brand-orange` + The Structural-Navy Rule + The Orange-Sprinkle Rule + avatar gradient navy→blue + dense-row note + view-tab-strip / group-header-row / toolbar-control component specs + the 8px-dot/always-label chip a11y note.
- **States covered:** loading · empty (no tasks) · error · no-results-after-filter · zero-overdue header · empty-group (always shown) · segment-disabled · selected row.
- **Breakpoints:** ≥1100 split · 920–1100 overlay · 768–920 rail-collapsed-table · <768 mobile grouped cards — all on the three existing hooks (no new thresholds).
- **A11y:** focus order (view-tabs/stubs/group-headers/rows/drawer) · keyboard (j/k skips group headers; group collapse via Tab+Enter) · chip always-label + 8px dot (1.4.1) · AA contrast table for soft chips/overdue/navy · orange never a contrast carrier.
- **Phasing:** mapped to PR-1 (tokens) / PR-2 (full-bleed + view-tabs + toolbar) / PR-3 (TanStack + group-by + group headers).
- **Open questions:** 3 (group-by phasing, "+ Add task" pre-fill = R, "N overdue" filter behavior) — recommendations attached.
