# Design-plan — Tasks page redesign (split-view drawer, Variant B)

- **Date:** 2026-06-15
- **Feature:** P3 — Tasks redesign (master-detail split view; "one UI, two widths")
- **Status:** design-plan for eng-planner / ui-implementer. Gate signed off — Variant B picked (OD-P3-3).
- **Anchor mockup:** `docs/design-mockups/tasks-redesign-B.html` (picked; A rejected).
- **Locked inputs:** `docs/decisions.md` OD-P3-2…5 (FIXED); `DESIGN.md` (identity authority);
  `CONTEXT.md` (vocab); `docs/jtbd.md` (Tasks + Task-detail rows = Lens-D oracle).
- **Reuse, don't reinvent:** `mos-app/src/pages/TasksPage.tsx`, `mos-app/src/pages/TaskDetail.tsx`
  (844 lines — the surface being refactored), `mos-app/src/components/tasks/*`, `mos-app/src/lib/db/tasks.ts`.
- **Token discipline:** every visual decision below names a `DESIGN.md` token. No raw hex/px in the build.

> This plan is design only. The eng-planner authors the implementation plan + the ADR (§10 handoff).
> CONTEXT.md is untouched — "drawer" / "expand" are UI mechanics, not domain vocabulary (OD-P3 note).

---

## 0. What changes, in one paragraph

Today `/tasks`, `/tasks/new`, `/tasks/:taskId` are **three sibling full-page routes** (`router.tsx`
lines 49–51). The redesign makes the **table persist** while the detail/create surface mounts beside
it as a **push/squash split-view drawer** (no scrim) — the table shrinks to ~2/3 and stays live for
continued triage. The drawer **is** the fully-actionable task surface (inline Status, RACI, checklist);
"open task page" **expands the same surface** to full width (focus mode) on the **same URL**. There is
**no second task editor**. The 844-line `TaskDetail.tsx` body is refactored into **one surface
component** that renders in both widths. Mobile keeps card-list + full-screen task (no 1/3 drawer).

---

## 1. Layout

### 1.1 Desktop split-view (the default, ≥ the fallback threshold)
Anchor: mockup Screen 1.

```
┌─ rail 224px ─┬─────────────── main ───────────────────────────────┐
│  --rail-w    │ header 56px (--header-h)                            │
│              ├────────────────────────────────────────────────────┤
│  My Week     │ .page-head: H1 "Tasks" · count-line · k-hints       │
│  Tasks ●     │ ┌──────── .split (grid 1fr / drawer) ────────────┐  │
│  Weekly Upd  │ │ TABLE (.assembly, ~2/3)   │  DRAWER (~1/3)      │  │
│  Daily Log   │ │  toolbar (filters+search) │  pinned action hdr  │  │
│              │ │  dense 54px rows          │  tabs strip         │  │
│              │ │  (live, scrolls/triages)  │  tabpane (scrolls)  │  │
│              │ │                           │  pinned foot (Archive)│ │
│  Settings    │ └───────────────────────────┴────────────────────┘  │
└──────────────┴────────────────────────────────────────────────────┘
```

- **Grid:** `.split { display:grid; grid-template-columns: 1fr clamp(360px, 33vw, 480px); align-items:start; }`
  (mockup uses a fixed `380px` for static rendering; the build uses the **clamp** per OD-P3-2).
- **No drawer open** (`/tasks`): `grid-template-columns: 1fr` (`.split.nodrawer`) — table full width.
- **Drawer width:** **clamp(360px, 33vw, 480px)** (OD-P3-2). Table takes the remaining `1fr`.
- **No scrim.** The table is never dimmed or inert — both panes are live (Gmail/Linear/Outlook
  convention). This is the load-bearing difference from a modal dialog.
- **Both panes are independent scroll containers.** Table body scrolls; drawer `.dw-tabpane` scrolls;
  the drawer's pinned header + tab strip + pinned foot never scroll.

### 1.2 Variant B drawer anatomy (OD-P3-3)
Anchor: mockup Screen 1, `.drawer`.

1. **`.dw-bar`** (top utility bar) — `crumb-mini` ("Task") + spacer + **expand toggle** iconbtn +
   **close** iconbtn.
2. **`.dw-pinned`** (PINNED action header — never scrolls):
   - `.dw-title` (task title) + `.dw-unit` (BU · due).
   - `.dw-statusrow` — the **inline Status trigger** (`StatusTrigger` reused) + activity-age caption.
   - `.dw-ra` — compact **R** and **A** mini-chips (glyph + name + role).
3. **`.dw-tabs`** (tab strip, sticky under the pinned header): **Details · Checklist · Activity**, with
   counts on Checklist (`1/4`) and Activity (`3`). Active tab = `primary` 2px underline (DESIGN.md §5
   Tabs sticky-tab indicator — reused, no new component).
4. **`.dw-tabpane`** (the scrolling body) — one tab's content at a time:
   - **Details** = Description + full **RACI** (R/A/C/I editable chips).
   - **Checklist** = checklist items + add field.
   - **Activity** = change-event feed.
5. **`.dw-foot`** (PINNED foot — never scrolls): **Archive task** (ghost-danger), always reachable
   regardless of which tab is active.

**Why pinned header + foot:** the decision drivers (Status + R/A) and the two consequential affordances
(change status; archive) stay visible at the 1/3 width no matter the tab or scroll position — this is
exactly the Lens-D "above-the-fold drivers + one adjacent action" win Variant B was picked for.

### 1.3 Expanded full-width (focus mode) — OD-P3-2
Anchor: mockup Screen 3. **Same surface, same `/tasks/:id` URL.** Expand (`e`) sets `.split.expanded`
(table hidden, `grid-template-columns: 1fr`) and `.drawer.expanded`:
- `.dw-title` grows from `subheading`-ish (17px/700) to **page-title** (24px/700, ls -0.02em).
- The pinned header reflows to a horizontal layout (title left, status + Archive right, R/A row below).
- `.dw-tabpane` gets a **centred reading measure** (`max-width: 880px; margin:0 auto`) and roomier
  padding; description text clamps to ~62ch.
- The tabs + pinned header + foot persist — it is the **same component**, just wider. **Not a second
  editor.**

### 1.4 Create mode — OD-P3-2
Anchor: mockup Screen 2. `+ New task` opens the drawer in **create mode** (`/tasks/new`):
- The pinned header collapses to a single **"New task"** bar (no Status/R/A yet — the task doesn't exist).
- The body is **one pane, no tabs** (tabs appear only once the task exists).
- Fields: **Title** (required), **Business unit** (required; defaults to creator's primary-role BU per
  OD-P2-2), **Responsible (R)** (defaults to creator), **Accountable (A)** (defaults to creator),
  **Due date** (optional), **Description** (optional).
- Foot: **Create task** (primary) + **Cancel** (outline).
- On save: `/tasks/new` → `/tasks/:newId`; the pinned header + tabs **populate in place**, ready to act.

### 1.5 Mobile (< fallback threshold → phone) — OD-P3-2 / OD-P0-3
Anchor: mockup Screen 4. **No 1/3 drawer.** Card list; tapping a card pushes the **same surface**
full-screen on the **same `/tasks/:id`**. The pinned header + tab strip translate to a sticky head +
horizontally-scrollable tab strip; touch targets ≥44px (`.ph-card`, `.ph-tab`, `.ph-newbtn`, checklist
rows all ≥44px). This reuses the existing `TaskCard` mobile branch from `TasksPage.tsx`.

---

## 2. Component breakdown (REUSED vs NEW)

### 2.1 Reused as-is (no visual change — identity preservation)
| Component / asset | Source | Role in redesign |
|---|---|---|
| **`StatusPill`** | `components/tasks/StatusPill.tsx` (+`.css`) | Status pill in table cells, pinned header, status popover. Verbatim. |
| **`StatusTrigger`** | `TaskDetail.tsx` (extract) | The inline status popover button. Moves into the pinned header; logic unchanged. |
| **`OwnerCell`** | `components/tasks/OwnerCell.tsx` | Table "Owner" column = R-avatar + name + "+N" (OD-P0-8). Verbatim. |
| **`RaciCard`** | `TaskDetail.tsx` (extract) | Full R/A/C/I editable chips → **Details tab** body. Logic unchanged. |
| **`ChecklistCard`** | `TaskDetail.tsx` (extract) | → **Checklist tab** body. Logic unchanged. |
| **`ActivityCard`** | `TaskDetail.tsx` (extract) | → **Activity tab** body. Logic unchanged. |
| **`PersonPicker`, `ConfirmArchive`** | `TaskDetail.tsx` | Reused inside the tabs / archive flow. |
| **`taskFormatters`** (`formatAge`/`formatDate`/`initials`/`otherRaciCount`) | `components/tasks/` | Verbatim. |
| **`dueStatus`, `raciMember`/`raciOwner`** | `lib/` | Verbatim (table + drawer due coloring, segments). |
| **`lib/db/tasks.ts`** mutations | `lib/db/tasks.ts` | All read/write functions reused unchanged; only the *call sites* move into the surface component. |
| **`TaskCard`** (mobile) | `TasksPage.tsx` | Mobile card-list branch. Verbatim. |
| **Table + toolbar** | `TasksPage.tsx` | Filter toolbar, dense 54px table, skeleton rows, empty/error states — kept; the table just lives inside `.split` and gains keyboard-cursor + selected-row styling. |

> **Crucial refactor (OD-P3-2 "one UI, two widths"):** `TaskDetail.tsx`'s actionable body (currently
> the page returned at lines 727+: RaciCard + ChecklistCard + ActivityCard + status + archive) is
> extracted into **ONE `TaskSurface` component**. `TaskSurface` takes a `mode: 'create' | 'view'` and a
> `width: 'drawer' | 'full'` prop and renders the pinned-header + tabs + foot once. The drawer (1/3) and
> the expanded (full-width) view are the **same `TaskSurface`** with `width` differing — there is **no
> duplicate editor**. This avoids the Lens-C "two homes per entity" trap (`docs/jtbd.md` §3.3).

### 2.2 New (split-view shell + presentational chrome — no new business logic)
| New component | Responsibility | Tokens (see §6) |
|---|---|---|
| **`TasksSplitView`** (shell) | Owns the `.split` grid; renders the table pane + (conditionally) `TaskSurface`; reads the URL param to decide open/closed; owns the `expanded` view-state + the fallback-threshold media query → overlay/full-screen mode. | grid only; `secondary/35%` page bg |
| **`TaskSurface`** (the one editor) | The pinned header + tab strip + tabpane + pinned foot; renders in `drawer` and `full` widths and `create`/`view` modes. Houses the reused cards in tabs. | `card`, `border`, `rounded.md` |
| **`TaskDrawerHeader`** (pinned) | Title · `.dw-unit` · `StatusTrigger` · R/A mini-chips; the create-mode "New task" collapse. | per §6.3 |
| **`TaskTabStrip`** | `role="tablist"` Details/Checklist/Activity with counts + `primary` underline; arrow-key roving. | §6.4 (Tabs) |
| **`ExpandToggle`** (iconbtn) | Toggles `expanded` (per-user-global, localStorage); `aria-pressed`. | ghost iconbtn |
| **`TaskCreateForm`** | The create-mode pane: inline-validate-on-blur fields + Create/Cancel. Reuses `lib/db/tasks.ts` create + the directory selects. | §6.6 (fields + error tokens) |

No new business logic — all mutations route through the existing `lib/db/tasks.ts`.

---

## 3. All states

### 3.1 Table pane (exists today — keep, do not regress)
| State | Treatment | Tokens |
|---|---|---|
| Loading | 5 `SkeletonRow` (pulse on `secondary`), table `aria-busy="true"` | `secondary` |
| Empty (per segment) | Context-keyed copy: **Mine** → "No tasks assigned to you"; **RACI** → "No tasks you're C/I on"; **All / filtered** → "No tasks match your filters" + `+ New task` primary | `muted-foreground` text; `primary` CTA |
| Error | `role="alert"` banner + **Retry** outline; table stays mounted | `--field-error-text` (`--status-lost-text`) for the alert text; `button-outline` |

### 3.2 Drawer / `TaskSurface` (new states — anchor: mockup STATE NOTES)
| State | Treatment | Tokens |
|---|---|---|
| **Loading** | Skeleton **pinned header** (title bar + status-pill placeholder) + skeleton pane block, so the action-zone SHAPE is stable before data lands; `aria-busy` on the pane | `secondary` pulse |
| **Deep-link → archived** | Pinned header shows an **archived banner** (`secondary` fill) + **Unarchive** (A/manager only); tabs render read-only, all edit affordances suppressed | `secondary` bg; `muted-foreground` |
| **Deep-link → not-found / forbidden** | In the **pane**: "Task not found" + an **"All tasks"** link; the pinned header collapses to the `.dw-bar`; the table stays usable beside it | `muted-foreground`; `primary` link |
| **Drawer load error** | In the pane: "Couldn't load this task" + **Retry**; pinned header collapses to the bar; table unaffected | `--status-lost-text`; `button-outline` |
| **Create mode** | Single pane, no tabs, "New task" pinned bar; Create + Cancel foot | per §6.6 |
| **Dirty / unsaved-on-close** | Create mode with edits, or an in-flight inline edit, then close/`Esc`/nav-away → quiet confirm "Discard new task?" (create only; **view-mode inline edits autosave optimistically so there is nothing to discard**) | `secondary` confirm box; `button-outline` + ghost-danger |
| **Read-only (viewer can't edit)** | Non-editor (not R/A/manager — mirrors `mos.can_edit_task`): Status trigger, RACI chips, checklist toggles, add-field, Archive all render **disabled/absent**; the surface is a clean read view. Archive hidden for non-(A/manager) | disabled per §6 disabled note |
| **Empty Checklist tab** | "No steps yet." + add field (if editor) | `muted-foreground` |
| **Empty Activity tab** | "No activity yet." | `muted-foreground` |
| **Long title** | Clamps to 2 lines in the pinned header; pinned height grows, tabs stay visible | — |

---

## 4. Responsive breakpoints

Three existing system breakpoints are reused; one **new** fallback threshold is introduced for the
squashed-table case.

| Breakpoint | Source | Behavior |
|---|---|---|
| **≥ 1100px** (the new **fallback threshold**) | **NEW (this plan)** | Full **push/squash split-view**: table `1fr` + drawer `clamp(360,33vw,480)`. Below this, the squashed table would be too cramped to triage. |
| **920–1100px** (narrow laptop) | new band | **Overlay fallback:** the drawer becomes an **overlay/right-side sheet over the table** (the table is NOT squashed; the drawer floats above it with a scrim) — OR full-screen on the very narrow end. This is the **only place a scrim + focus-trap applies** (see §5). Rail still visible (920 is the rail-collapse line). |
| **768px** (table→card reflow, OD-W4-4) | `useIsDesktop()` `(min-width:768px)` | Table single-renders as the stacked **card list**; opening a task = **full-screen** `TaskSurface` (no 1/3 drawer). |
| **920px** (rail collapse) | existing | Rail collapses to hamburger; orthogonal to the table reflow. |

**Fallback-threshold choice: 1100px.** Rationale: at the **clamp floor of 360px** drawer, a viewport
below ~1100px leaves the table < ~700px, at which point its 5 columns can't all stay legible after the
condense/drop ladder below — so we switch to the overlay rather than crush the table. (1100 sits cleanly
above the 920 rail line and the 768 reflow line, giving three distinct, non-colliding regimes.)
**→ open question Q1 for the Director: confirm 1100px, or prefer 1024/1152.**

### 4.1 Column condense/drop ladder (as the table narrows within split-view)
The table starts at `Task 42% · Status 16% · Owner 22% · Due 12% · Activity 8%` (mockup colgroup).
As the drawer opens / viewport narrows:
1. **Activity** (last-activity age) drops first (it's the least decision-critical; still in the drawer).
2. **Owner** condenses to **R-avatar only** (drop the name + "+N" text; avatar + tooltip).
3. **Due** condenses to the date chip only (drop the "Overdue ·" prefix; color still carries it).
4. **Task** + **Status** never drop (the off-track signal must stay in-row — Lens-D Tasks oracle).

---

## 5. WCAG-AA accessibility + keyboard (OD-P3-4)

### 5.1 Focus order
- **Non-modal split-view (≥1100px):** DOM/tab order = rail → header → page-head → **table** → **drawer**.
  The drawer is a **non-modal** region (`<aside aria-label="Task detail">`) — **NO focus trap.** Tab
  moves naturally from the last table control into the drawer and back out; this is what lets triage
  continue with the drawer open. Opening a task **moves focus to the drawer's pinned header** (the
  `.dw-title`/close button region) so keyboard + SR users land on the new content; closing returns
  focus to the originating table row.
- **Overlay fallback (920–1100px) AND mobile full-screen (<768px):** the drawer **becomes modal** —
  `role="dialog"` + `aria-modal="true"`, a **focus trap**, a scrim, and `Esc`-to-close. Because the
  table underneath is covered/inert, trapping is correct here. (Two behaviors, one component, switched
  on the threshold.)

> **Specify both explicitly:** non-modal split = no trap; overlay/full-screen = trap. This dual behavior
> is a build-time correctness gap DESIGN.md already flags (Accessibility posture: "overlays… must add
> focus management and Esc-to-close").

### 5.2 Keyboard map (OD-P3-4) — coexisting with native tab order
| Key | Action | Coexistence rule |
|---|---|---|
| `j` / `k` | Move the **table** keyboard cursor down/up (`.kfocus` row = `primary` 2px inset rule) | Only active when focus is in the table region, not in a text field |
| `Enter` / `o` | Open the cursor's task → drawer (`/tasks/:id`) | — |
| `Esc` | Close the drawer (→ `/tasks`); in overlay/modal, also releases the trap | Standard |
| `n` | New task (→ `/tasks/new`, create drawer) | Suppressed while typing in a field |
| `e` | Toggle expand ⇄ split (per-user-global) | — |
| Arrow ←/→ | Roving focus across the **tab strip** (`role=tablist`) when a tab has focus | Native ARIA tabs pattern |
| `Tab` | Native focus traversal (always available alongside `j/k`) | The hotkeys never replace Tab |

All single-letter hotkeys are **disabled when a text input/textarea/select has focus** (so typing "n"
in a title field doesn't open a new task). Visible focus ring everywhere = global `*:focus-visible`
(`ring`, 2px, 2px offset).

### 5.3 ARIA
- **Tabs:** `.dw-tabs` = `role="tablist"`; each `.dw-tab` = `role="tab"` + `aria-selected` +
  `aria-controls`; each pane = `role="tabpanel"` + `aria-labelledby`. Roving `tabindex`.
- **Table sort:** the sortable `<th>` carries `aria-sort="ascending|descending|none"` (the sorted col
  shows the `primary` sort glyph). (Already partly present — keep/complete.)
- **Live region:** an off-screen `aria-live="polite"` region announces **optimistic-save** results
  ("Status changed to Blocked", "Checklist item added", and on rollback "Couldn't save — reverted").
- **Status trigger:** `aria-haspopup="listbox"` + `aria-expanded` (reused from `StatusTrigger`).
- **Expand toggle / close:** `aria-label` ("Expand to full width (e)" / "Close (Esc)"); expand carries
  `aria-pressed`.
- **Drawer region:** `aria-label="Task detail"` (view) / `"New task"` (create); modal variant adds
  `role="dialog"` + `aria-modal="true"`.
- **Selected row:** the open task's row = `aria-current="true"` + `primary/7%` fill.

### 5.4 Contrast (all AA on white/card)
- Status-pill text = the darkened `--status-*-text` tokens (already AA). Due-overdue =
  `--status-lost-text`; due-soon = `warning-foreground`. RACI glyphs use the AA-darkened text tokens
  (`--status-open-text` for R, `--status-violet-text` for A). Field-error text = `--status-lost-text`
  (the §5 ratification — base `destructive` would fail AA as small text).

---

## 6. Tokens (every visual decision named — no raw values in the build)

### 6.1 Shell / split
- Page bg: **`secondary`/35%** (`hsl(var(--secondary)/0.35)`). Table `.assembly` + `.drawer`: **`card`**
  bg, 1px **`border`**, **`rounded.md`**. Drawer width = `clamp(360px, 33vw, 480px)` (the only literal
  px — it is a layout dimension, not a color/elevation; sourced from OD-P3-2, not invented).

### 6.2 Table (unchanged tokens)
- Header: `table-header-cell` (38px) + **overline** type + `muted-foreground`, bottom `border`.
- Body: `table-body-cell` (54px), divider `border`/70%. Hover `accent`/60%; **selected/open
  `primary`/7%**; keyboard-cursor `.kfocus` = **`primary` 2px inset rule** (reuses `primary`; the
  optional `--kbd-cursor` flagged in the mockup is **NOT** ratified — it's a pattern, not a new hue, so
  it stays a plain `primary` inset).
- Toolbar: `control` chips (`input` border), `seg` segmented filter (`secondary` track, on = `card`
  pill + pressed lift), `search-mini` (`input`). `+ New task` = `button-primary` + brand shadow.

### 6.3 Drawer pinned header
- `.dw-title` = **subheading**-ish (17px/700) in drawer, **page-title** (24px/700) when `.expanded`.
- `.dw-unit` = `muted-foreground`; due chip = `--status-lost-text` (overdue) / `warning-foreground`
  (soon) / `muted-foreground` (calm) — OD-P0-7.
- Status trigger = `input` border + `rounded.md`, wrapping the reused `StatusPill`.
- R/A mini-chips: **R** glyph = `primary`/12% bg + `--status-open-text` (`--raci-responsible`);
  **A** glyph = `violet`/12% bg + `--status-violet-text` (`--raci-accountable`). Borders/divider:
  `border`.

### 6.4 Tabs
- Tab text `muted-foreground` → `foreground` on hover/active; active 600 weight; **active underline =
  `primary` 2px** (DESIGN.md §5 Tabs sticky-tab indicator — reused). Counts = `muted-foreground`,
  `tabular`. `tablist`/`tab`/`tabpanel` semantics.

### 6.5 Tab bodies (reused cards)
- **RACI:** role glyphs R=`--raci-responsible`, A=`--raci-accountable`, C/I=`secondary` +
  `muted-foreground` (`--raci-consulted`/`--raci-informed`); person-chip = `input` border +
  `rounded.full`; add = dashed `border`.
- **Checklist:** checkbox 16px, 1.5px `input` border, `rounded.xs`; checked = `primary` fill +
  `primary-foreground` check; done label = `muted-foreground` strike. Add field = `input`.
- **Activity:** event avatar = `secondary` + `muted-foreground`; meta = `muted-foreground`, ages
  `tabular`.

### 6.6 Create form + field-error tokens (RATIFIED — §6.7)
- Field label = **label** type + `muted-foreground`; inputs/selects/textarea = `input` border,
  `rounded.md`, `background` fill, `foreground` text; helper = `muted-foreground`.
- **Invalid field (on blur):** border = **`--field-error-border`** (`destructive`); helper text =
  **`--field-error-text`** (`--status-lost-text`). Create = `button-primary`; Cancel = `button-outline`.

### 6.7 Pinned foot / archive
- **Archive task** = ghost-danger: transparent at rest, `muted-foreground` text; hover = `destructive`/10%
  bg + `--status-lost-text`. Confirm dialog (`ConfirmArchive`, reused) is the one consequential confirm.

### 6.8 Motion (OD-P3-4)
- Drawer open/close + tab switch + expand ⇄ split = **150–200ms** ease transitions. **`@media
  (prefers-reduced-motion: reduce)`** → transitions removed (instant), per DESIGN.md anti-slop posture.
  No decorative animation; motion is functional only.

**Token sets used:** `background, foreground, card, primary, primary-foreground, secondary,
secondary-foreground, muted-foreground, accent, destructive, warning, warning-foreground, success,
violet, border, input, ring`; type `page-title/subheading/body/label/overline/mono`; `rounded.xs/sm/md/full`;
`spacing 1–6`; components `button-primary/outline/ghost, card, input, badge-status, table-header/body-cell,
nav-item, seg/tabs`; MOS additions `--status-open/won/lost/violet-text`,
`--raci-responsible/accountable/consulted/informed`; **ratified this plan: `--field-error-border`,
`--field-error-text`**.

**No new brand / palette / font / radius proposed.** (The mockup's optional `--kbd-cursor` is declined —
the keyboard cursor uses a plain `primary` inset rule, no new token.)

---

## 7. Interaction spec (OD-P3-4)

- **Optimistic inline writes** (status, checklist toggle, RACI edit): apply to UI immediately, call
  `lib/db/tasks.ts`, **roll back on error** and announce the rollback via the live region. Routine
  writes are **single-click, no confirm** (quiet). View-mode edits never have an "unsaved" state (they
  autosave) — so closing the drawer mid-edit needs no discard prompt.
- **Archive = the only confirm** (`ConfirmArchive`), because it's consequential + reversible-by-A/manager
  only (OD-P2-3).
- **Create form:** **inline-validate-on-blur**; the error renders **below the field** (`--field-error-text`)
  with the border in `--field-error-border`. Title + BU required (OD-P2-2). On Create → `/tasks/new`
  becomes `/tasks/:newId`, surface re-renders into view mode in place.
- **Expand persistence = per-user-GLOBAL** (one preference applied to every task) via a localStorage key
  (e.g. `mos.tasks.expandDefault`), NOT per-task (OD-P3-3).
- **Tab memory:** default tab = **Details** (the jtbd above-the-fold drivers); **remember last-used tab
  per task within the session** (sessionStorage keyed by task id), reset to Details on a fresh session
  (OD-P3-3).
- **Virtualize** the table at **50+ rows** (OD-P3-4) — windowed rows; keep `j/k` cursor + `aria-sort`
  working under virtualization (the eng-planner picks the lib).
- **Transitions:** 150–200ms; reduced-motion respected (§6.8).

---

## 8. URL / routing contract (the ADR's core — §10)

| URL | Renders |
|---|---|
| `/tasks` | Table only (full-width, `.split.nodrawer`); no drawer |
| `/tasks/:id` | **Table + that task's drawer open** (split-view ≥1100; overlay 920–1100; full-screen <768) — deep-linkable |
| `/tasks/new` | Table + drawer in **create mode** |
| (no second route) | **Expand vs split = a remembered view toggle on the SAME `/tasks/:id` URL**, not a route |

- **Deep-link sources unchanged:** My Week task rows and the Daily Log linked-task ref still link to
  `/tasks/:id` (OD-P3-2) — they resolve to the table-with-drawer-open. The deep-link contract is
  preserved at the URL level; only what `/tasks/:id` *renders* changes.
- **Routing change the ADR must specify:** today `/tasks`, `/tasks/new`, `/tasks/:taskId` are **three
  sibling routes** (`router.tsx` 49–51), each a full page — so the table unmounts when you open a task.
  The redesign requires the **table to persist**, so `:taskId` and `new` must become **child/nested
  routes (or a search-param) under `/tasks`** where `TasksSplitView` owns the table and renders
  `TaskSurface` from the param via `<Outlet>` or a param read. Pick: **nested routes with `<Outlet>`**
  keeps `/tasks/:id` canonical and deep-linkable while the parent table stays mounted.
- **Back/forward:** opening a task pushes `/tasks/:id`; closing pops to `/tasks`; expand toggle does
  **not** push history (same URL). Browser Back from `/tasks/:id` returns to `/tasks` (table) — matches
  the FR-012 back-guard posture (`router.tsx` replace-on-redirect).

---

## 9. Lens-D pass (graded against `docs/jtbd.md` — Tasks + Task-detail rows)

**Oracle:** the §2 Tasks row and Task-detail row; the §4 5 questions; anchors A1/A2/A3.

### Tasks list (`/tasks`)
- **Q1 Job** ✓ — "scan the work, filter, spot what's off track, open the one that needs attention."
- **Q2 Expectation** ✓ — filters (BU/Status/Person/ownership-seg) present and obvious in the toolbar
  (OD-DIR-5 RACI filterable); `+ New task` is a clearly-placed primary (OD-P2-2), not buried.
- **Q3 Priority/placement** ✓ — off-track signal (overdue/blocked) lives **in the row** (due color +
  status pill), due-sorted overdue-first; the condense ladder (§4.1) **never drops Task or Status**, so
  the signal survives the squash.
- **Q4 Actionability** ✓ — row → canonical drawer in **one click** (or `j/k`+`Enter`); the table stays
  live so triage continues. A number is never a dead end.
- **Q5 Mental-model** ✓ — **one canonical `/tasks/:id` home** regardless of entry (My Week / Daily Log
  / Tasks); drawer == expanded == mobile = ONE surface. **Lens-C "two homes" trap avoided** by the
  single `TaskSurface`.

### Task detail (`/tasks/:id`)
- **Q1 Job** ✓ — "know status, who's R/A, what's blocking, next checklist step — and change it without
  leaving the page."
- **Q2 Expectation** ✓ — Status + R/A live in the **PINNED header** (the user expects the decision
  drivers first; OD-P2-1/3 change-in-place preserved).
- **Q3 Priority/placement** ✓ — **stronger than Variant A:** the drivers (Status + R/A) **never scroll
  out of view**, staying above the fold at any tab/scroll position.
- **Q4 Actionability** ✓ — inline status change (no view transition) + Archive are **always visible**
  (pinned header + pinned foot); inline RACI edit + checklist toggle live in their tabs; optimistic +
  single-click (routine), confirm only for Archive.
- **Q5 Mental-model** ✓ — change-in-place verbs match the other MOS surfaces; one open paradigm.

**Anchors:** A1 (Daily Log read-vs-review) — **N/A** (no Daily Log surface here). A2 (write affordance
on upward review pane) — **N/A** (no review pane). A3 (downward/lateral update view) — **N/A** (tasks
are org-readable by design, OD-P1-3; the cross-unit task view is the product, not a visibility leak).
**None violated.**

**B-specific residual risk (carry into design-review):** "what's blocking / next checklist step" lives
**behind the Checklist tab** — one extra click vs A's single scroll. **Mitigations in this plan:** the
**`1/4` count on the tab** surfaces incomplete steps without opening it; default-tab stays **Details**
(the decision driver) per OD-P3-3; **session tab-memory** means a checklist-heavy task re-opens on
Checklist. Accepted trade — Variant B was picked precisely for pinned-drivers-always-visible.

**RESULT: PASS** (both rows), with the documented residual-risk mitigations.

---

## 10. Handoff note for the eng-planner

### 10.1 ADR candidate (eng-planner authors; grill proposes, planner writes)
Per OD-P3 note, an ADR is warranted — hard-to-reverse + cross-cutting:
1. **"One UI / two widths" master-detail** — `TaskSurface` is the single editor rendered in both the
   1/3 drawer and the full-width focus mode; **no second editor**. (Lens-C invariant.)
2. **One canonical URL** — `/tasks/:id` is the table-with-drawer-open; **expand is a view toggle on the
   same URL** (not a route); `/tasks/new` is the create drawer. **Routing refactor:** the three current
   sibling routes (`router.tsx` 49–51) become **nested routes under `/tasks`** with `<Outlet>` so the
   table stays mounted (or a documented search-param alternative — the ADR decides).
3. **The `TaskDetail.tsx` (844-line) refactor** — extract `RaciCard`/`ChecklistCard`/`ActivityCard`/
   `StatusTrigger`/`ConfirmArchive`/`PersonPicker` into shared components and recompose into
   `TaskSurface(mode, width)`; **all `lib/db/tasks.ts` calls reused unchanged** (behavior-preserving
   refactor — spec-miner can pin the current behavior first).
4. **Deep-link contract** — My Week + Daily Log linked-task refs keep linking to `/tasks/:id`; the ADR
   records that the *contract* (URL) is stable while the *render* changes; the modal-vs-non-modal switch
   at the fallback threshold is part of the contract (deep-linking on a phone = full-screen task).

### 10.2 Open risks / questions for the Director
- **Q1 (this plan):** confirm the **1100px** fallback threshold (vs 1024 / 1152). Drives the
  overlay-vs-squash regime + the focus-trap switch.
- **Q2:** virtualization library choice (table must keep `j/k` cursor + `aria-sort` under windowing) —
  eng-planner's call, flagging here.
- **Q3:** localStorage/sessionStorage keys (`mos.tasks.expandDefault` global; per-task tab memory) —
  confirm naming convention with any existing MOS prefs.
- **Q4:** the **overlay fallback (920–1100px)** is a third visual regime not in the picked mockup
  (mockup shows split, expanded, mobile). It reuses existing tokens (scrim = standard overlay; sheet =
  `card`+`border`), so no new identity — but the Director may want a quick render check at this width in
  design-review since it's mockup-adjacent, not mockup-shown.

### 10.3 Definition-of-Done acceptance (fold into the eng-planner plan + qa-acceptance)
- All §3 states render (table loading/empty-per-segment/error; drawer loading/archived/not-found/error/
  create/read-only/empty-tabs/long-title).
- Keyboard map (§5.2) works and hotkeys are suppressed in text fields; visible focus ring everywhere.
- Non-modal split = no trap; overlay/full-screen = trap + Esc (§5.1) — both proven.
- ARIA: tablist/tab/tabpanel, `aria-sort`, live region on optimistic save/rollback (§5.3).
- Optimistic writes roll back on error (§7); Archive is the only confirm.
- Every styled element resolves to a named token (§6); zero raw hex/px except the documented
  `clamp(360,33vw,480)` width.
- Lens-D PASS re-verified on the built UI (design-review round 2) — including the B-specific
  checklist-behind-a-tab residual mitigations.
```
