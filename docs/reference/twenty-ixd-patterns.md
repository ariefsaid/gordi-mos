# Twenty CRM — interaction-grammar reference (for the MOS redesign)

> **What this is:** a reference extract of the Twenty CRM's (github.com/twentyHQ/twenty) interaction
> patterns, studied as the stated IxD target for the Gordi MOS redesign (ADR-0025 D3). Captured here
> so the patterns survive the conversation that produced them. This is *inspiration to adapt*, not a
> spec — MOS is not Twenty, and F&B management-OS has jobs CRM doesn't.
>
> **Sourced from:** the Twenty frontend (`packages/twenty-front/src/modules/...`) + official docs
> (docs.twenty.com), read 2026-07-09. Component/file names cited inline.

## The one consistency principle

> Everything is a record. A record is always rendered by one renderer (`PageLayoutRenderer`), opened by
> default in one right-hand slide-over that doubles as the command palette. Tables, boards, and calendars
> are just *views* over the same records. Every field — including relations — is an inline-editable cell
> governed by one commit contract. The whole app is metadata-driven: objects, fields, and views are all
> first-class customizable data.

The neatness comes from ruthless reuse: **one record renderer, one inline-cell component, one panel,
one view model, one command surface.**

## The 6 rules to adapt

### 1. Default open = right slide-over; escalate to full page only on "Open"
A record click opens a side panel (`useOpenRecordInSidePanel`) rendering the *same* `PageLayoutRecordPageRenderer`
as the full page (`isInSidePanel` flag). `View.openRecordIn` controls the default per view. The full page
is opt-in via an explicit "Open" action.
- **MOS adaptation:** the current scattered popovers/drawers/modals converge to **one right slide-over
  as the default record inspector**, with an "Open" escalation to the full editable page (γ). A quick
  field-edit (status/R/due) happens *inline in the list* (rule 3), not in a separate drawer.

### 2. The command palette IS the side panel
`⌘K` toggles the side panel (`useCommandMenuHotKeys`); `/` searches records, `@` opens AI. It's a
slide-over (`CommandMenuOpenContainer`), not a centered modal. Items are data-driven (nav links,
toggles, mini-forms) and can be dragged onto the nav rail.
- **MOS adaptation:** unify the command surface and the record-inspector into one stack-navigated
  panel. (MOS has no AI @ command today — skip that.)

### 3. One inline-cell governs all editing, everywhere
`RecordInlineCell` = `{displayMode, editMode}` with a uniform `FieldInputEventContext`:
- **Enter / Tab / Submit / click-outside → persist + close**
- **Escape → persist + close** (Escape does NOT discard — it persists current value)
The same cell is used in the table, the board card, and the record page. One `FieldDisplay`/`FieldInput`
pair per type (text, number, date, select, multi-select, currency, rating, boolean, rich-text, emails,
phones, links, files, address, relations). Nothing requires opening the full record to edit a field.
- **MOS adaptation:** a single field-edit primitive reused across table / board / page, with one commit
  contract. **Owner decision 2026-07-10 intentionally diverges on Escape:** MOS cancels the uncommitted
  edit and restores the saved value (ADR-0025 D3c / OD-REDESIGN-22). This is the rule that kills the
  "some popover, some drawer, some modal" scatter without importing Twenty's surprising cancel behavior.

### 4. Tables, boards, calendars are views over the same records
`RecordIndexContainer` switches on `recordIndexViewTypeState` (`TABLE | KANBAN | CALENDAR`); a `View` is
a saved bundle of `{type, viewFields (visible columns + order), viewFilters + viewFilterGroups (nested
AND/OR), viewSorts, viewGroups (groupings), layout params, openRecordIn, visibility}`. URL-synced
(filters/sorts in the URL → shareable by link).
- **MOS adaptation:** β's multi-view (Table/Kanban/Timeline) is exactly this — a `View` = saved
  {filters, sorts, layout, visible fields}; one record index, many renderers. Apply to Projects + Tasks.

### 5. Create = new record + immediate inline edit of the title cell
`useCreateNewIndexRecord` pre-fills from the current view's filters/RLS, then opens the record with the
label-identifier field focused (`isNewRecord: true` → `openNewRecordTitleCell`). No per-object create
modal — one flow, data-model-driven, that drops you into editing in place.
- **MOS adaptation:** kill the per-object create modals (create-task, capture). One create flow:
  click `+` → new record appears inline → title cell auto-focuses → type → Enter. For a Task, the
  R/A/Project inherit from context (current view's filter, current project if creating from one).

### 6. Everything is metadata-driven and customizable: objects, fields, views, nav
`settings/data-model` builds objects/fields/indexes; `object-metadata` drives ~20 field types each with
one display+input pair; nav is a user-editable folder structure you pin views/commands onto
(`navigation-menu-item`, layout-customization mode, drag-to-nav).
- **MOS adaptation:** the widget composer + saved views are the user-facing slice of this. Full
  data-model-builder (custom objects/fields) is a future slice; for now, the fixed object set
  (Objective/Project/Process/Task/Standard/Shift) + customizable views + composable Home/Work widgets
  carry the customisability story.

## Specific components/patterns to borrow

| Twenty component | What it does | MOS use |
|---|---|---|
| `RecordInlineCell` + `FieldInputEventContext` | inline edit primitive + commit contract | the one field-edit component, everywhere |
| `PageLayoutRecordPageRenderer` (`isInSidePanel`) | one record page, two shells (panel + page) | slide-over default + full-page escalation |
| `side-panel` (`sidePanelNavigationStackState`) | stack-navigated panel with back/forward | the slide-over + command surface |
| `View` + `ViewBar` + `ViewPickerDropdown` | saved {filters, sorts, layout, fields} + switcher | β's multi-view + saved views |
| `RecordIndexContainer` (switches on `ViewType`) | one index, TABLE/KANBAN/CALENDAR renderers | the multi-view database |
| `useCreateNewIndexRecord` | filter-aware create-then-edit-in-place | one create flow, no per-object modal |
| `CommandMenuOpenContainer` + `useCommandMenuHotKeys` | ⌘K slide-over command surface | unified command + inspect panel |
| `page-layout` (`PageLayoutRenderer`, tabs, react-grid cards) | draggable/resizable record-page layout | γ's editable page (lighter — fixed tabs, not full drag-grid) |
| `blocknote-editor` | Notion-style rich-text field | γ's `/` block editor (already built) |

## What MOS does NOT take from Twenty

- **No full data-model builder yet** — Twenty lets users create custom objects/fields; MOS has a fixed
  object set (Objective/Project/Process/Task/Standard/Shift) for now. Custom objects are a future slice.
- **No AI @ command** — Twenty's `@` opens Ask AI; MOS has no AI surface in the redesign scope.
- **Lighter page layout** — Twenty uses react-grid-layout (full drag-resize); MOS's editable pages use
  a simpler block-list (γ's editor.js) — the customisability is in views + widgets, not per-page layout drag.
- **Different domain** — Twenty is CRM (companies/people/deals); MOS is a management-OS
  (objectives/projects/tasks/standards/shifts + money/ops). The *grammar* transfers; the *objects* don't.

## Source links
- Repo: github.com/twentyHQ/twenty (`packages/twenty-front/src/modules/...`)
- Layout docs: docs.twenty.com/getting-started/core-concepts/layout
- Views docs: docs.twenty.com/user-guide/views-pipelines/overview
