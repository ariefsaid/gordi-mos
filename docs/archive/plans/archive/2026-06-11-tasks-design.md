# Design-plan — P2-1 Tasks pages (list · detail · create/edit · archive)

- **Date:** 2026-06-11
- **Feature:** `mos.tasks` UI surfaces — Tasks list, Task detail, Create/Edit form, archive control.
- **Spec:** `docs/specs/tasks-raci.spec.md` (FR-020..056, AC-060..091).
- **Signed visual authority:** `docs/design-mockups/mock-tasks-list.html` + `docs/design-mockups/mock-task-detail.html`.
  This plan **implements** those mockups; it does not re-skin or re-compose them.
- **Identity authority:** `DESIGN.md` (adopted from PMO). Every value below names a token; **no raw hex/px** introduced beyond the shell's already-established inline-style hybrid (PageFrame / MyWeek precedent).
- **Density rule:** OD-P0-7 — these are LIST/DETAIL surfaces, so PMO's data-dense DataTable posture stays (54px list rows, sortable columns, functional filters). Density mode's only reach here is **progressive disclosure** (RACI collapses to R-avatar + "+N" on rows; full R/A/C/I on detail).
- **Shell:** lives inside the adopted `AppShell` (Rail at 224px collapsing <920px, Header 56px). Each page renders exactly one `PageFrame` (owns `<main>`, 1080px centered column) per the existing convention.

---

## 0. Decisions this plan makes (and why)

### 0.1 Create/Edit form: **dedicated route**, NOT a modal — `/tasks/new` and `/tasks/:id/edit`
The list mockup's empty-state CTA and the detail mockup's "inline detail" posture *imply* an inline experience, but the binding choice is a **route**:
- **Deep-linkable / shareable / refresh-safe.** Create is a real navigation in the spec's e2e journey (AC-090 "create → list → detail"); a route makes that journey and its back-button behavior honest.
- **Editing is mostly inline on the detail page already.** Per the detail mockup, status changes inline, RACI edits inline, checklist edits inline (FR-031/033/040). The only thing a separate **edit** form needs to cover that detail-inline does NOT is **title / description / due / business-unit** field edits. Those land as an inline-editable field cluster on the detail head (preferred) with `/tasks/:id/edit` as the route fallback for the same form when a full-form edit is wanted. **Create** is the only mandatory standalone form.
- **No focus-trap/scroll-lock/stacking burden** that a modal would add to the a11y surface for a form with a person-picker popover and a BU dropdown inside it (nested overlays in a modal are an anti-pattern).
- **Consistency:** the shell is route-driven (router.tsx); a modal would be the only overlay-routed surface in the app. Keep one navigation model.

Route shape (for the eng-planner plan to wire in `router.tsx`):
| Route | Page | Notes |
|---|---|---|
| `/tasks` | Tasks list | default surface |
| `/tasks/new` | Create form | R/A prefilled to creator; BU prefilled to primary-role BU |
| `/tasks/:id` | Task detail | inline status/RACI/checklist editors |
| `/tasks/:id/edit` | Edit form (same component as create, prefilled) | for title/description/due/BU; secondary to inline-edit |

The form is a centered single column inside the same `PageFrame` (1080px → form content capped ~640px for line-length comfort). Cancel returns to the referrer (list or detail).

### 0.2 RACI chip token set: **promote to named tokens** (owner sign-off requested)
The mockups apply a working RACI chip set built **entirely from existing palette values** — no new hues. It appears identically across every Phase-0 mockup. This plan formalizes it as a **proposed token addition** to `DESIGN.md` (the only owner-decision flag in this plan). Resolution against existing tokens:

| RACI role | Proposed token | Background | Text | Marker dot | Sourced from |
|---|---|---|---|---|---|
| **Responsible (R)** | `--raci-responsible` | `primary / 10%` | `--status-open-text` (`221 75% 38%`) | `primary` (`221.2 83.2% 53.3%`) | existing primary + existing status-open-text |
| **Accountable (A)** | `--raci-accountable` | `violet / 12%` | `--status-violet-text` (`262 60% 42%`) | `violet` (`262 83% 58%`) | existing violet + existing status-violet-text |
| **Consulted (C)** | `--raci-consulted` | `secondary` | `muted-foreground` | `muted-foreground` (`240 4% 40%`) | existing secondary + muted-foreground |
| **Informed (I)** | `--raci-informed` | `secondary` | `muted-foreground` | `muted-foreground` | existing secondary + muted-foreground |

**Gap flag (the single owner decision in this plan):** these four values are not yet *named* tokens in `DESIGN.md`. They reuse the palette only, but the **R chip uses `primary` as a ≤15px categorical role marker**, which lightly touches *The One Blue Rule* (primary should be the action color, ≤10% of screen). On the detail page the only other blue is the "Post update" primary button and the inline status pill's dot — the R marker is a 15px non-interactive dot, well under budget, but the owner should ratify that the R chip stays `primary` rather than dropping to neutral (option B: only A is tinted-violet, R goes neutral-gray like C/I). **Recommendation: keep R=primary** — it mirrors the list's R-avatar (also `primary/12%` tint) so "who's Responsible" reads in the one consistent blue across list and detail. On owner sign-off, add the four tokens to `DESIGN.md` §Components under a new "RACI role chip" entry; `StatusPill`-style inline application (`hsl(var(--token))`).

Until promoted, `ui-implementer` applies the resolved values above by their **source token names** (e.g. R text = `--status-open-text`), never as raw hex — exactly as the mockups annotate them.

---

## 1. Tasks list page (`/tasks`)

Implements `mock-tasks-list.html` verbatim in composition. FR-020..027, AC-060..067.

### 1.1 Layout
`PageFrame` (1080px column) → `PageHead`-style title row → one **card assembly** (toolbar seamed to table). No second column.

- **Page head:** title "Tasks" (`page-title` token: 24/700/-0.02em) + a muted count line `"N tasks · M blocked · K overdue"`, `tabular-nums` on the figures, `muted-foreground` 13px. The count line is the dense-list analog of `PageHead`'s `subtitle` slot.
- **Card assembly:** `card` bg + 1px `border` + `rounded.md`. Toolbar (`border-bottom: border`) seamed to the `<table>` below it (top corners rounded, seam squared — DESIGN.md Cards "toolbar+table assembly").

### 1.2 Toolbar (filter bar)
One flex row, `padding: 10px 12px` (`spacing` 3/2-ish per mockup), `border-bottom: border`, wraps on narrow.

| Control | Token vocabulary | Behavior | Spec |
|---|---|---|---|
| **Business unit** dropdown | `control` chip: 32px, `input` border, `rounded.md`, `muted-foreground` label + `foreground` value + `chev` (`muted-foreground` 10px) | filters by `business_unit_id`; "All" default | FR-024, AC-063 |
| **Status** dropdown | same `control` chip | filters status set; "Any" default | FR-024, AC-063 |
| **Person** dropdown | same `control` chip + person-picker popover | filters by any-RACI-role membership; "Anyone" default | FR-024, AC-063 |
| **Mine / RACI-involved / All** segmented | `seg`: 32px `secondary` track, 28px buttons, "on" = `background` pill + 600 + pressed-lift shadow (`0 1px 2px hsl(240 6% 10% / 0.12)`); `role="tablist"`/`role="tab"`/`aria-selected` | Mine = viewer R-or-A; RACI-involved = +C/+I; All = every org-readable | FR-024, AC-064 |
| **Search tasks** | `search-mini`: 32px, `input` border, `muted-foreground` placeholder, `min-width 180px`, `margin-left:auto` | client title filter | mockup |
| **Archived** toggle | **NEW affordance (see 1.3)** — a `control` chip with a `checkbox` (16px, `input` border, checked = `primary` fill + white check) reading "Show archived" | shows `archived_at IS NOT NULL` rows; default off | FR-025, AC-065 |

**Default segmented value:** mockup shows "Mine" active. **Open question (OQ-2)** — confirm "Mine" vs "RACI-involved" as a manager's first-load default.

### 1.3 Archived-filter affordance (decision)
The mockup labels archived as an open question. This plan specifies it as a **"Show archived" checkbox control** placed at the right end of the toolbar (after `search-mini`, before any overflow), styled as a `control` chip with a leading 16px `checkbox` token. Rationale: archived is a *binary include/exclude*, not a multi-value filter, so a checkbox is the honest control — not a fourth dropdown. When on, archived rows render with the whole row at `muted-foreground` text + a small `secondary` "Archived" pill in the status cell position is **not** used (keeps the status column truthful); instead the row title gets a leading `secondary` "Archived" tag chip and reduced emphasis (title `muted-foreground` 500 instead of `foreground` 600). Unarchive lives on detail, not the list.

### 1.4 Table (5 columns, sortable, 54px rows)
`table-layout: fixed`, `colgroup` widths: Task 40% · Status 15% · Owner 21% · Due 13% · Activity 11%.

**Header cells** (`table-header-cell`: 38px, `card` bg, `overline` type — 11.5/600/0.06em UPPERCASE, `muted-foreground`, `border-bottom`):
- All five `.sortable` (`scope="col"`). Hover → `foreground`. Sorted column → `foreground` + a `sort-aff` glyph; **the sort-direction glyph is the one `primary` accent on the header row** (`thead th.sorted .sort-aff { color: primary }`).
- `aria-sort` on each: the active column carries `aria-sort="ascending"|"descending"`, others `aria-sort="none"`.
- **Default sort: Due ascending (overdue first)** — `aria-sort="ascending"` on Due at first paint (FR-026, AC-066). Due + Activity right-aligned.

**Body cells** (`table-body-cell`: 54px, 12px padding, divider `border / 70%`, last row no divider):
- Row hover → `accent / 60%`; whole row is a `<Link>`/clickable to `/tasks/:id` (`cursor: pointer`).

| Column | Content | Tokens | Spec |
|---|---|---|---|
| **Task** | `task-name` (13.5/600, ellipsis) + `task-bu` subline (12px `muted-foreground`) | `foreground` / `muted-foreground` | FR-022, AC-060 |
| **Status** | tinted status pill (`badge-status` 22px + 6px dot) — see 1.5 | per-status tokens | FR-022 |
| **Owner** | R-person only: `ownav` avatar (26px, `primary/12%` bg + `--status-open-text`) + first name (13/500) + `own-more` "+N" (12/600 `muted-foreground`) | `primary/12%` / `--status-open-text` / `muted-foreground` | FR-022, AC-060 |
| **Due** | date, `tabular`, right-aligned, 13/600 — colored per rule (1.6) | overdue/soon/calm | FR-023, AC-061 |
| **Activity** | last-activity age ("2h"/"4d"), `tabular`, 12/500 `muted-foreground`, right-aligned | `muted-foreground` | FR-022, AC-060 |

**Owner = Responsible only** (CONTEXT.md: "Owner" column = the R person). The "+N" counts the *other* RACI people on the task (A + C + I, de-duped, excluding R) — the "who else is involved" signal without rendering chips. **OQ-3** confirms R (not A) is the row owner.

### 1.5 Status pills (Tinted-Status Rule)
6px dot + tinted pill, darkened-AA text — never solid fill:
| Status | Bg | Text | Dot | Token source |
|---|---|---|---|---|
| In Progress | `primary / 12%` | `--status-open-text` | `primary` | open-blue family |
| Blocked | `destructive / 12%` | `--status-lost-text` | `destructive` | lost-red family |
| Open | `warning / 18%` | `warning-foreground` | `warning` | warning-amber family |
| Done | `success / 14%` | `--status-won-text` | `success` | won-green family |

### 1.6 Due-date coloring (OD-P0-7, computed in WIB — reuse `lib/week.ts` offset pattern)
- `due_date < today-WIB` → **overdue**: `--status-lost-text` (`0 72% 45%`), prefix "Overdue · ".
- `due_date` within 3 days (≤3d) → **soon**: `warning-foreground` (`22 78% 26%`).
- otherwise → **calm**: `muted-foreground`, 500 weight.
The classifier is a unit-tested pure helper fed a fixed clock (AC-062); no host-tz leak (NFR-004).

### 1.7 States (all four — AC-067, §7 error table)
- **Populated:** default Due-ascending sort, rows as 1.4.
- **Empty (per active filter):** in-assembly empty panel — `empty` block: h3 15/600 + `muted-foreground` 13px copy keyed to the active filter (e.g. "Mine" → "No tasks assigned to you. When a task names you as R, A, C, or I it shows up here.") + `button-primary` "+ New task". Each filter combo gets a truthful empty message; the archived-on empty differs ("No archived tasks.").
- **Loading:** skeleton rows — 5-column shape (text bar + `sk pill` + `sk av` circle + due bar + activity bar), `secondary` fill, `pulse` 1.4s animation. Toolbar + thead render immediately (filters stay usable). `aria-busy="true"` on the table region; a visually-hidden "Loading tasks" live message.
- **Error:** inline one-line banner inside the table body — `"Couldn't load tasks — Retry"` (`destructive` text + a `button-outline` Retry), `role="alert"`. Toolbar + thead stay rendered so filters remain operable (§7).

### 1.8 Responsive (desktop-first; DataTable reflow at 768px)
Per DESIGN.md §Navigation "DataTable reflow (OD-W4-4)": **single-render** — `≥768px` renders `<table>`; `<768px` renders a stacked **card list** instead, exactly one branch in the DOM (no `aria-hidden` on either). Use a `useIsDesktop()` hook reading `(min-width: 768px)` synchronously at first paint (mirror the existing `useIsNarrow` pattern but at the 768 breakpoint — these are **two separate breakpoints**: 920px rail collapse, 768px table reflow).
- **Card anatomy (<768px):** first row = task title (the activation `<Link>`) + status pill; then a `<dl>` label:value grid for Owner / Due / Activity. BU subline under the title. Touch targets ≥44px via `.touch-target` on the row link and any control.
- Toolbar controls wrap and go full-width-friendly; the segmented control stays a single row.

---

## 2. Task detail page (`/tasks/:id`)

Implements `mock-task-detail.html` verbatim. Single ~1080px column, stacked cards: Head → Description → RACI → Checklist → Activity. FR-030..034, FR-056, AC-070..075.

### 2.1 Head card (title + meta + co-located IxD action bar)
`card` (white, `border`, `rounded.md`, `padding 16px 20px`). `head-top` = flex, title block left, **actions cluster right** (`margin-left:auto`) — co-located primary writes per the ui-implementer IxD/flow-naturalness invariant (lens b: primaries visible from first paint, top-right convention).
- **Title:** `page-title` (24/700/-0.02em).
- **Meta row** (`flex gap 20px`, wrap): Status (label `overline` + tinted pill) · Due (`tabular`) · Business unit · Last activity ("18h ago", `tabular`). Labels are `overline`/`muted-foreground`.
- **Actions cluster:**
  - **Inline status changer** — `status-trigger` button (32px, `input` border, `rounded.md`) showing the current tinted pill + chev; `aria-haspopup="listbox"`, `aria-label="Change status"`. Opens a `popover` listbox of the 4 statuses. Selecting one applies **inline, no navigation** (FR-031, AC-071) — the head pill + the meta pill swap in place; a `task_event` (`status_changed`) is dispatched.
  - **"Mark done"** — `button-outline` shortcut to set status=Done. **OQ-7:** keep as its own button vs only-via-dropdown (avoid two paths). Recommendation: keep, but it is purely a shortcut that drives the *same* status mutation (not a second code path).
  - **"+ Post update"** — `button-primary` (`primary` + brand shadow). In P2-1 this scrolls to / focuses the activity area; the actual comment composer is **P2-1b** (OD-P2-8) — in P2-1 it is disabled or routes to the (event-only) activity card. **OQ-1** noted.

### 2.2 Description card
`card` + `subheading` h2 "Description". Body copy `body` token (14/1.5, `foreground` — ID content rendered as-is per NFR-009). Empty: `muted-foreground` "No description." When editable, an inline "Edit" affordance opens the field (or the `/tasks/:id/edit` form).

### 2.3 RACI card — full R/A/C/I (progressive-disclosure target)
`card` + `subheading` h2 "RACI" (with a quiet `saved-note` — `--status-won-text` + success dot — appearing after an autosaved edit). **Two-up `raci-grid`** (`1fr 1fr`, gap `12px 24px`) of person fields, all inside the one column.

Each field = a **role-chip label** (the proposed RACI token set, §0.2) above a person editor:
- **R / A (single):** `person-field` — 36px, `input` border, `rounded.md`, avatar (blue→violet gradient) + name + `role-meta` (·role, `muted-foreground`) + chev. Click opens a **single-select person picker** popover. R and A may be the same person (FR-003/OD-P2-4 — no SoD constraint; render naturally if equal).
- **C / I (multi):** `multi` container (`input` border, wraps) of `chip-person` chips (16px avatar + name + `×` remove, `muted-foreground`) + an `add-person` link ("+ Add", `--status-open-text` link-in-context) opening a **multi-select person picker**. Add/remove dispatches the array mutation (FR-033, AC-072).
- **Autosave** with the quiet "Saved" note (mockup default). **OQ-3 (detail):** autosave vs explicit save — recommendation autosave (matches the inline-everything posture).

### 2.4 Checklist card (NEW vs mockup — spec-required, FR-040/041/042, AC-074)
The mockup did not draw the checklist; this plan specifies it to the same card vocabulary. `card` + `subheading` h2 "Checklist" + a muted "M of N done" count (`tabular`).
- **Item row:** 16px `checkbox` token (checked → `primary` fill + white check, `role="checkbox"`/`aria-checked`) + label (`body`; done items → `muted-foreground` + strikethrough) + a drag-grip handle (fades in on hover, `muted-foreground`) + a `×` delete (`muted-foreground`, hover `destructive`). Row min-height 36px, divider `border/70%`.
- **Add item:** a borderless inline input at the foot ("+ Add a step", `muted-foreground` placeholder) — Enter persists with next `position`, `is_done=false` (FR-040).
- **Toggle** persists `is_done` + emits `field_edited` event (FR-041, advances last_activity_at).
- **Reorder:** drag the grip (pointer) **and** keyboard path — focus a grip, `Space` to grab, `ArrowUp/ArrowReorder Down` to move, `Space`/`Enter` to drop, `Esc` to cancel; a visually-hidden live region announces "Moved 'X' to position N of M" (a11y — FR-042, see §4).

### 2.5 Activity card (auto change-events, read-only in P2-1)
`card thread` + `subheading` h2 "Activity & updates". Renders `mos.task_events` **newest-first**, each `entry`: actor avatar (26px gradient) + `who` (13/600) + `when` (`muted-foreground` 12px) + the change text. Event entries (`entry.event`) use a `secondary` neutral marker + `entry-event-tag` overline ("STATUS CHANGED") + `muted` from→to text ("Open → In Progress"). FR-034, AC-075.
- **P2-1 = events only.** The `composer` (free-text) is **P2-1b** (OD-P2-8) — render it disabled with a "Comments coming soon" hint, or omit until P2-1b. **OQ-1** asks the owner; recommendation: omit the composer in P2-1 to avoid a dead control, keep the event log.

### 2.6 Archive control (gated — see §3)
Archive lives on detail, not the list. Placement: a quiet `button-ghost` "Archive task" in the head action cluster's overflow (a `⋯` menu) — **not** a prominent button (archiving is rare, reversible, and gated). Confirm-on-click (a small `popover` "Archive this task? It leaves the default list but isn't deleted. [Archive] [Cancel]"). Archived state on detail: a `secondary` "Archived" banner atop the head with an "Unarchive" `button-outline` (same gate). Emits `archived`/`unarchived` event (FR-051/052/054).

### 2.7 States (AC-070, +loading/error/edge)
- **Populated:** as above.
- **Loading:** head meta + each card shell render with skeleton text lines; RACI person fields show skeleton avatar+name; thread shows 2 skeleton entries; checklist shows 3 skeleton rows. `aria-busy` on each region.
- **Error (per-region, independent):** description / activity / checklist can each fail with an inline `"Couldn't load — Retry"` line (`role="alert"`, `destructive` + `button-outline` Retry) while the head + status action stay usable (§7).
- **Empty sub-states:** no description → "No description."; no checklist → "No steps yet." + add input; no events → "No activity yet."; C/I empty → just the "+ Add" link.
- **Edge:** A = R (render both, no error); status menu open; multi-person C/I add/remove; archived task (banner + unarchive).
- **Not-found / no-access:** `:id` that returns zero rows (RLS or wrong org) → a friendly "Task not found" panel with a back-to-list link (RLS is the real gate; UI just renders empty).

### 2.8 Responsive
Single column already stacks. <768px: the head action cluster wraps below the title (full-width buttons, ≥44px touch targets); the `raci-grid` collapses `1fr 1fr → 1fr` (one person field per row); meta items stack. No table here, so no reflow-hook needed.

---

## 3. Create / Edit form (`/tasks/new`, `/tasks/:id/edit`)

Route-based (decision §0.1), single centered column (~640px) inside `PageFrame`. FR-010..014, AC-080/081.

### 3.1 Fields & prefills
| Field | Control | Prefill / default | Required | Spec |
|---|---|---|---|---|
| **Title** | `input` (32px field — but multiline-friendly, so a 1–2 line `input`) | empty | **yes** | FR-012, AC-081 |
| **Business unit** | `control`/select | creator's **primary-role BU** (earliest-assigned, AS-2) | **yes** | FR-011, AC-080/081 |
| **Responsible (R)** | `person-field` single-picker + R `role-chip` | **creator** | yes (prefilled) | FR-010, AC-080 |
| **Accountable (A)** | `person-field` single-picker + A `role-chip` | **creator** | yes (prefilled) | FR-010, AC-080 |
| **Due date** | date `input` (date-only, no time) | empty | no | FR-014 |
| **Description** | textarea (`input` shell, taller) | empty | no | FR-014 |
| **Consulted / Informed** | `multi` person pickers + C/I `role-chip`s | empty arrays | no | FR-014 |
| **Checklist** | optional add-rows | empty | no | FR-014 |

R/A/C/I editors reuse the **exact detail-page components** (§2.3) for consistency.

### 3.2 Validation states
- **Required-field block:** Title or BU empty on submit → block, show field-level message (`destructive` helper text + `destructive` field border — the proposed error-field treatment in DESIGN.md "Inputs Error/Disabled (gap)"). The DB CHECK is the backstop (AC-012). `aria-invalid="true"` + `aria-describedby` linking the message.
- **Submit** = `button-primary` "Create task" (/ "Save" on edit); **Cancel** = `button-outline` returning to referrer.
- On success: navigate to the new task's `/tasks/:id` (AC-090 journey) and emit the `created` event.

### 3.3 Form a11y
Every field has a `<label for>`; the form is one `<form>` with a single submit; validation messages are programmatically associated; focus moves to the first invalid field on a blocked submit.

---

## 4. Permission-conditional affordances (UX gate only — RLS is the authority)

The UI gate is **cosmetic**; the real enforcement is RLS (§NFR-001, FR-056). The UI must never *rely* on hiding for security — it hides to avoid offering actions that would 0-row-fail.

Viewer capability is derived client-side (mirroring `resolveViewer` / `deriveIsManager`, and a per-task `canEdit`/`canArchive` from R/A ids + `is_manager_of`):

| Capability | Who | Gated affordances |
|---|---|---|
| **Edit** (status, RACI, checklist, fields) | R **or** A **or** manager-of-(R or A) | inline status changer, RACI pickers, checklist add/toggle/reorder/delete, "Mark done", description edit, `/tasks/:id/edit` | FR-050 |
| **Archive / Unarchive** | A **or** manager-of-(R or A) — **NOT** a non-A Responsible | archive control + unarchive (narrower than edit) | FR-051/052 |
| **Read-only** | everyone else (org-readable) | all write affordances **hidden/disabled**; task fully visible | FR-056, AC-073 |

- Non-editors: status renders as a static pill (no `status-trigger`), RACI as read-only chips (no pickers, no "+ Add"), checklist checkboxes `disabled`, no archive control. Create remains available to **any member** (FR-010) — the create CTA is never gated.
- A non-A Responsible person sees edit affordances but **no archive control** (the one place edit and archive gates diverge — spec §9 note).
- **Note for implementers:** disabled vs hidden — prefer **hidden** for archive (rare, gated) and **read-only render** for RACI/status/checklist (so a non-editor still sees who/what clearly). Never render an enabled control that RLS will reject.

---

## 5. Responsive summary (desktop-first, mobile-usable — OD-P0-3)

| Breakpoint | List | Detail | Form |
|---|---|---|---|
| ≥920px | rail open | — | — |
| <920px | rail → hamburger drawer (shell) | same | same |
| ≥768px | `<table>` (54px rows) | single column | column |
| <768px | **card list** (single-render, `useIsDesktop()`), `<dl>` grid, ≥44px targets | head actions wrap full-width; `raci-grid` → 1 col; meta stacks | fields stack full-width |

Two distinct breakpoints (920 rail, 768 table reflow) — do not conflate. The 768 hook mirrors `useIsNarrow` but with `(min-width: 768px)` read synchronously at first paint (no wrong-branch flash).

---

## 6. Accessibility (WCAG-AA) — acceptance list

- **Contrast:** all text/token pairs are AA-cleared by DESIGN.md (status pills use the darkened `--status-*-text` variants; `muted-foreground` at 40%L clears AA on white and `secondary`). RACI chip text uses the same darkened variants. Due-soon uses `warning-foreground` (deep brown) not raw amber.
- **Focus:** global `*:focus-visible` ring (`2px solid ring`, 2px offset) inherited by every control — sortable headers, filter chips, segmented buttons, row links, status-trigger, person pickers, checkboxes, form fields, archive control.
- **Focus order:** DOM order = rail → header → page (toolbar → table rows → variants). Within detail: head actions → description → RACI fields → checklist → activity.
- **Labels / ARIA:**
  - Sortable headers: `scope="col"` + `aria-sort` (ascending/descending/none); the active sort announced.
  - Segmented filter: `role="tablist"`/`role="tab"`/`aria-selected`.
  - Status changer: `aria-haspopup="listbox"` + `aria-label="Change status"`; the listbox `role="listbox"`/`role="option"`/`aria-selected`.
  - Checklist checkboxes: native or `role="checkbox"` + `aria-checked` + `tabindex="0"`.
  - Person pickers: labeled comboboxes; chips' `×` have `aria-label="Remove <name>"`.
  - Icon-only controls (archive `⋯`, delete `×`, drag grip): `aria-label`.
  - Loading regions: `aria-busy="true"` + a visually-hidden live status; error banners `role="alert"`.
  - Empty/archived row tag: text, not color-only.
- **Keyboard paths:**
  - Row activation: the row is a real `<Link>` (Enter activates); not a div-with-onClick.
  - **Checklist reorder by keyboard** (FR-042): grip focusable; `Space` grab → `ArrowUp`/`ArrowDown` move → `Space`/`Enter` drop → `Esc` cancel; live-region announces each move and final position. Drag-pointer and keyboard are equivalent paths.
  - Status menu / person pickers: open on Enter/Space, arrow-navigate, `Esc` closes and returns focus to the trigger (overlay focus management is a build-time requirement per DESIGN.md a11y posture — not a token gap).
  - Form: Tab through fields, submit on Enter, focus jumps to first invalid field on blocked submit.
- **Color independence:** status conveyed by dot + text label (not color alone); overdue conveyed by the "Overdue ·" text prefix, not just red; archived by an "Archived" text tag.

---

## 7. Tokens used (every value names a token)

Surfaces `background`/`card`; text `foreground`/`muted-foreground`; lines `border`/`input` (+ `border/70%` dividers); action `primary`/`primary-foreground` (+ brand shadow) + `accent` hover wash; categorical `violet` (avatars, A-chip); status `destructive`/`warning`/`warning-foreground`/`success` + darkened pill text `--status-open-text`/`--status-lost-text`/`--status-won-text`/`--status-violet-text`; `secondary` quiet fills. Type: `page-title`/`subheading`/`overline`/`label`/`body`/`mono`(none needed — no IDs shown) + mandatory `tabular-nums` on due dates, ages, counts. Radius `sm`/`md`/`full`; spacing 2/3/4/5/6. Components: `table-header-cell`(38)/`table-body-cell`(54)/`badge-status`(22)/`button-primary`/`button-outline`/`button-ghost`/`button-destructive`(none — archive uses ghost+confirm, not destructive solid)/`input`/`card`/`nav-item`; segmented `seg` + pressed-lift shadow; `--rail-w`(224)/`--header-h`(56). **Proposed additions:** `--raci-responsible`/`--raci-accountable`/`--raci-consulted`/`--raci-informed` (§0.2) + the already-flagged DESIGN.md gaps (disabled-button, error/disabled-field) used by the form.

---

## 8. Open questions for the owner

1. **RACI chip tokens (the one design-decision flag):** ratify promoting `--raci-responsible/-accountable/-consulted/-informed` into `DESIGN.md` with **R=primary, A=violet, C/I=neutral** (recommended, mirrors the list R-avatar), or drop R to neutral so only A is tinted (lighter touch on The One Blue Rule)?
2. **List first-load segmented default:** "Mine" (mockup) vs "RACI-involved" for managers? (OQ-2)
3. **Owner column = Responsible (R), not Accountable (A)** — confirm "who do I chase" = R (CONTEXT.md says yes; confirming). (OQ-3)
4. **"Post update" + composer in P2-1:** recommendation is to **omit the free-text composer in P2-1** (it's P2-1b per OD-P2-8) and keep only the event log — confirm vs showing a disabled composer.
5. **"Mark done" button** kept as a shortcut alongside the inline status dropdown (recommended, same mutation), or status-dropdown only to avoid two affordances? (mockup OQ-2)
6. **RACI autosave** (quiet "Saved", recommended) vs explicit Save on the detail RACI card? (mockup OQ-3)
7. **Create/Edit as route** (`/tasks/new`, `/tasks/:id/edit`) — confirming the route-over-modal call (§0.1); inline detail-edit covers most editing, the route form is for title/description/due/BU.
