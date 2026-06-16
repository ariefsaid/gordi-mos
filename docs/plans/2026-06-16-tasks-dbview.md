# Implementation plan — Tasks full-bleed DB-view workspace (navy/orange + TanStack)

- **Date:** 2026-06-16
- **Feature:** P3 — Tasks DB-view redesign (full-bleed workspace · brand amendment · `@tanstack/react-table`)
- **Author:** eng-planner
- **Inputs (authority):** design-plan `docs/plans/2026-06-16-tasks-dbview-design-plan.md` (PRIMARY,
  consumed not restated) · `docs/adr/0008-tasks-dbview-and-brand-amendment.md` · `docs/decisions.md`
  OD-P3-6/7/8 (LOCKED) · `docs/design-mockups/tasks-dbview-final.html` (visual oracle) · `docs/jtbd.md`
  (Lens-D oracle) · ADR-0007 + plan `docs/plans/2026-06-15-tasks-redesign.md` (the kept split-view;
  AC-100..114) · `DESIGN.md` (the amended identity authority) · `CONTEXT.md` (untouched)
- **Status:** Director-reviewed 2026-06-16 → ready for PR-1.

## Director rulings (2026-06-16 — resolve eng-planner's open questions; binding)
- **Q1 — dependency pin:** `npm i @tanstack/react-table@^8` (caret, matching `@tanstack/react-virtual ^3`).
- **Q2 — "+ Add task" pre-fill transport:** **query params** on `/tasks/new` (e.g. `?status=Blocked`,
  `?owner=<personId>`, `?bu=<buId>`) — deep-linkable, reload-safe, e2e-assertable. NOT `location.state`.
- **Q3 — empty Owner/BU group keys:** **show the FULL domain, do not cap** (Status = the 4; Owner = all
  `getPeople()`; BU = all `getBusinessUnits()`). Owner chose "show all always" with eyes open
  (the option spelled out "could render lots of empty groups"). FR-122 stands as written. A "hide empty"
  toggle is a deferred fast-follow only if it proves noisy live — NOT in v1.
- **Q4 — token location:** `mos-app/src/index.css` `:root`, stored as **raw HSL triplets** (`--token: H S% L%`,
  consumed via `hsl(var(--token))`). The new `--brand-navy`/`--brand-navy-text`/`--brand-orange` (+ navy/6
  tint) follow that wrapper-less format. DESIGN.md documents them in PR-1 Task 1.

## Scope guardrails (read before any task)

- **UI + design-system + one client dependency ONLY.** NO schema / RLS / grant / migration change.
  `lib/db/tasks.ts`, `lib/db/directory.ts` signatures are **reused verbatim** — only call-*sites* move
  into `TasksWorkspace`. **pgTAP is unchanged** — the P2-1 RLS read/write/archive contracts (AC-001..051)
  are not touched by a UI refactor; re-running them is regression-only.
- **The shipped split-view (ADR-0007) is KEPT and must stay green.** `TasksLayout` / `TaskDrawer` /
  `TaskSurface` / `useExpandPref` / `useTasksKeyboard` are reused. The AC-100..114 suite (the 2026-06-15
  plan) is the **behavior oracle** for the PR-3 engine swap — it must stay green after the TanStack
  refactor; re-point a test's mount target if a component is renamed, never bend an assertion (BDD rule).
- **Reuse, don't reinvent.** `StatusPill`, `OwnerCell`, `TaskCard` (inside `TasksTable.tsx`),
  `taskFormatters` (`firstName`/`initials`/`formatAge`/`formatDate`/`otherRaciCount`), `dueStatus`,
  `raciMember`/`raciOwner`, `useIsDesktop`, `useIsSplitWidth` are reused as-is. The persistence module
  **mirrors `useExpandPref`'s `useSyncExternalStore`-over-`localStorage`** pattern verbatim (incl. a
  `__reset…ForTests` hook).
- **Tokens.** Every styled element resolves to a `DESIGN.md` token. The four genuinely-new literals
  (navy / navy-text / orange + the navy/6 tint) are ratified into DESIGN.md in PR-1 (Task 1). The only
  documented px literals are the **50px dense row** (OD-P3-6) and the kept drawer width
  `clamp(360px,33vw,480px)` (ADR-0007).
- **Continue AC numbering from AC-116** (AC-100..115 belong to the 2026-06-15 plan/ADR-0007).
- **Gates (binding):** `npm run typecheck` zero errors · `npx eslint . --max-warnings=0` zero · **≥80%
  changed-line coverage** · every behavior task names its `AC-###` at the lowest sufficient layer with
  the AC-id in the owning test's title.

---

## EARS requirements (this redesign — beyond the P2-1 + ADR-0007 ACs)

> **NOTE for spec-reviewer:** these `FR-`/`NFR-` + `AC-1xx` ids are introduced by this plan; fold them
> into `docs/specs/tasks-raci.spec.md` (or a `tasks-dbview.spec.md` addendum) at spec sign-off. Listed
> here so every behavior task traces to a requirement.

### Functional (EARS)

- **FR-120** — The Tasks page **shall** render full-bleed (no 1080px max-width cap); prose surfaces
  (Weekly-update write) **shall** keep the 1080px readable cap. *(via `PageFrame variant`.)*
- **FR-121** — The Tasks workspace **shall** present a view-tab strip: Table (active) and Board/Calendar
  as disabled "SOON" stubs that are not activatable.
- **FR-122** — The Tasks workspace **shall** group rows by a selected dimension — Status (default), Owner,
  or BU — and **shall** render every group always (including empty groups), with rows sorted Due-ascending
  (overdue first) within each group.
- **FR-123** — Each group header **shall** show a caret, the group label, a row count, an overdue subtotal
  when >0, and a "+ Add task" affordance that pre-fills the grouped dimension (Owner → R).
- **FR-124** — When a Person filter is set, the workspace **shall** disable the Mine/RACI/All segment (the
  Person filter overrides ownership scope).
- **FR-125** — The workspace **shall** persist `view`, `groupBy`, and `collapsedGroups` per-user-global in
  `localStorage` under `mos.tasks.{view,groupBy,collapsedGroups}`.
- **FR-126** — Clicking the page "N overdue" count or a group overdue subtotal **shall** apply a transient
  overdue-only filter chip the viewer can clear.
- **FR-127** — On `<768px`, the workspace **shall** render grouped cards (group headers + `TaskCard`s for
  the chosen group-by) with no view-tab strip.
- **FR-128** — The Owner cell "+N" **shall** be a focusable control revealing a read-only tooltip of the
  other RACI members (C/I, and A if not R).

### Observability / Accessibility (EARS)

- **OBS-120** — Status chips **shall** always render their text label (never dot-only), with an 8px dot as
  a redundant cue (WCAG 1.4.1).
- **OBS-121** — `j`/`k` **shall** move the leaf-row cursor only, skipping group-header rows; group-header
  collapse **shall** be keyboard-reachable independently (Tab + Enter/Space).

### Non-functional (EARS)

- **NFR-120** — The workspace **shall** run the row models (sort/filter/group/aggregate/column-visibility)
  on a single client-side `@tanstack/react-table` instance with no server/schema change; it **shall**
  virtualize leaf rows at ≥50 rows while preserving `j/k` and `aria-sort`.

---

## Acceptance criteria (Given/When/Then) — each owned by ONE test at the lowest sufficient layer

### Regression-invariants (folded from the 4-lens review — must hold after the redesign)

| AC | Given / When / Then | Layer |
|---|---|---|
| **AC-116 (RI-1)** | Given any entry to a task (table row click, `j`+Enter, My Week link, Daily Log link), When it opens, Then it resolves to the **one canonical** `/tasks/:id` surface (the drawer/expanded `TaskSurface`) — there is no second task home. | unit |
| **AC-117 (RI-2)** | Given the drawer open in view mode, When the viewer changes status inline, Then the table row's status reflects it **without a view transition / navigation** (optimistic override). | unit |
| **AC-118 (RI-3)** | Given any rendered status chip, Then it renders its **text label** (e.g. "In Progress") — never a dot-only variant — regardless of the active group-by. | unit |
| **AC-119 (RI-4)** | Given a row whose task is off-track (overdue), Then the row carries an **off-track signal in-row** — red due text reading "Overdue · <date>" (color is not the only channel). | unit |
| **AC-120 (RI-5)** | Given the Tasks page at any supported width, Then the rail nav + breadcrumb remain **role-stable** (Tasks active nav item present; full-bleed does not remove the breadcrumb/landmark). | unit |

### New DB-view ACs

| AC | Given / When / Then | Layer |
|---|---|---|
| **AC-121** | Given a page with `variant="data"`, When it renders, Then the content container has **no 1080px max-width cap** (full-bleed); Given `variant="prose"` (or default), Then the 1080px cap is present — FR-120. | unit |
| **AC-122** | Given the Tasks workspace, When it renders, Then a view-tab strip shows **Table selected** and **Board + Calendar** as `aria-disabled` "SOON" stubs (`tabindex=-1`, not activatable) — FR-121. | unit |
| **AC-123** | Given the workspace with default state, Then rows are **grouped by Status**, each group header showing the label, a **count**, and an **overdue subtotal** when >0; within a group rows are **Due-ascending (overdue first)** — FR-122/123. | unit |
| **AC-124** | Given grouping by **Owner** (or BU), When a group has zero leaf rows, Then its header is **still shown** (count 0, caret, "+ Add task", no overdue subtotal) — FR-122. | unit |
| **AC-125** | Given grouping by **Owner**, When "+ Add task" in a group header is activated, Then the create drawer opens pre-filling that person as **R (Responsible)** — FR-123, OD-P3-6 (Director ruling). | unit |
| **AC-126** | Given a Person filter is chosen, Then the Mine/RACI/All segment is **disabled** (`aria-disabled`, removed from tab order, reads "Person: me") — FR-124. | unit |
| **AC-127** | Given the viewer changes `view`/`groupBy`/a collapsed group, When the page re-opens, Then the choice is **restored** from `localStorage` `mos.tasks.{view,groupBy,collapsedGroups}` (per-user-global) — FR-125. | unit |
| **AC-128** | Given the page "N overdue" count (or a group overdue subtotal) is a button, When activated, Then a **transient overdue-only filter chip** is applied (only overdue rows shown) and is clearable — FR-126, OD-P3-6 (Director ruling). | unit |
| **AC-129** | Given `<768px`, Then the workspace renders **grouped cards** (group headers + `TaskCard`s for the chosen group-by) and **no view-tab strip** — FR-127. | unit |
| **AC-130** | Given an Owner cell with other RACI members, When the "+N" control is focused or hovered, Then a read-only tooltip lists the C/I people (and A if ≠ R) as `R/A/C/I · Name` — FR-128. | unit |
| **AC-131** | Given the workspace, When the row count is ≥50, Then the leaf rows **virtualize** while `j`/`k` cursor + `aria-sort` keep working; When the cursor is on a leaf row, Then `j`/`k` **skip group-header rows** — NFR-120, OBS-121. | unit |
| **AC-132** | Given group-header collapse is keyboard-reachable (Tab to the header, Enter/Space toggles `aria-expanded`), When toggled, Then the group's leaf rows hide/show and the collapse persists per-user-global — OBS-121, FR-125. | unit |
| **AC-133** | Given the missing-states set on the full-bleed workspace, Then: **loading** shows a skeleton + `aria-busy`/`role=status`; **empty (no tasks)** shows the segment-aware empty block + `+ New task`; **error** shows a `role=alert` + Retry; **no-results (filtered)** shows "No tasks match these filters" + Clear filters + `+ New task`; **zero-overdue** omits the overdue segment entirely (no green "all clear") — design-plan §3. | unit |
| **AC-134** | Given the full Tasks workspace journey, When the viewer groups by Status, opens a row, changes status inline, then groups by Owner and adds a task via a group "+ Add task", Then the cross-stack flow works end-to-end (deep-link canonical, optimistic sync, pre-fill) — AC-117/123/125, e2e. | e2e |

---

## Phasing & PR boundaries

Three PRs (owner-approved), each independently shippable (app stays green + deployable at each merge):

- **PR-1 — Brand tokens + DESIGN.md amendment + ADR-0008.** Tasks 1–4. Applies the design-plan §2
  amendment to `DESIGN.md` verbatim, adds the runtime token triplets + Tailwind mappings, the four
  token-only visual touches (logo navy+orange-dot, header avatar navy→blue, active nav navy tint, drawer
  active-tab underline navy), and the `StatusPill` dot 6→8px + always-label note. **No IA/engine change** —
  the table works exactly as today. ADR-0008 lands here. Covers AC-118 (always-label), AC-120.
- **PR-2 — Full-bleed layout + view-tab scaffold + toolbar + persistence.** Tasks 5–12. `PageFrame
  variant`, kill the 1080 cap for Tasks, view-tab strip (Table active; Board/Calendar SOON stubs),
  toolbar restyle, **Person-overrides-segment**, the persistence module, group-by control **rendered but
  flat/non-functional**. Engine still hand-rolled. Covers AC-121/122/126/127, AC-133 (states chrome),
  AC-120, AC-128 (page-count button wiring; group subtotals land PR-3).
- **PR-3 — TanStack refactor + group-by engine + group headers.** Tasks 13–24. Refactor
  `TasksTable`→`TasksWorkspace` onto `@tanstack/react-table` row models; wire group-by + group-header rows
  (count, overdue subtotal, "+ Add task" pre-fill), within-group Due-asc, `j/k` skips headers, "+N" RACI
  tooltip, overdue subtotal → transient filter chip, mobile grouped cards; **re-verify the split-view
  (AC-100..114) green**. Covers AC-116/117/119/123/124/125/128(subtotals)/129/130/131/132/134.

**Task count: 24** (+ the e2e journey in Task 23). Sequencing is strictly PR-1 → PR-2 → PR-3.

---

# PR-1 — Brand tokens + DESIGN.md amendment + ADR-0008

> **Invariant for the whole PR:** the Tasks table behaves exactly as today; only tokens + four cosmetic
> swaps change. `npx vitest run src/components/tasks` stays green at every task.

## Task 1 — Amend `DESIGN.md` with the navy/orange brand tokens + named rules + component specs

**TDD red.** N/A (documentation amendment; the consuming code is Tasks 2–4 + PR-2/3). Verified by the
contrast/snapshot tests in Task 4 and the design-reviewer render check.

**Green.** Edit `/Users/ariefsaid/Coding/gordi-mos/DESIGN.md`, applying the design-plan §2 spec **verbatim**:

1. **Frontmatter `colors:` block** (after the existing color entries): add the three Gordi brand tokens
   (`brand-navy: "hsl(218 46% 22%)"`, `brand-navy-text: "hsl(218 42% 26%)"`, `brand-orange:
   "hsl(18 80% 48%)"`) with the OD-P3-7 comment ("first owner-approved divergence from the adopted RIS
   near-monochrome").
2. **§2 Colors** — add a "Gordi brand tokens (OD-P3-7)" subsection (after Neutral / before Named Rules)
   listing the three tokens, the **navy/6 slash-alpha fill** convention (`bg-brand-navy/6`, mirroring
   `primary/10`), and the note that orange needs no tint/text variant (never carries text).
3. **§2 Named Rules** — append **The Structural-Navy Rule** and **The Orange-Sprinkle Rule** verbatim from
   design-plan §2.2 (after The Single-Border Rule).
4. **§2 Secondary / §5 Top bar** — change the avatar gradient note from **blue→violet** to **navy→blue**
   (design-plan §2.3): update line 309 "user chip (avatar gradient blue→violet …)" → "navy→blue", and the
   §Categorical-Violet note keeps violet for KPI/timeline dots only.
5. **§5 Data Table → Body cells** — append the **Dense DB-view variant (OD-P3-6)** note: 50px rows on the
   full-bleed Tasks DB-view (54px stays the default elsewhere), horizontal hairline dividers (`border/70%`),
   no vertical column rules (design-plan §2.4).
6. **§5 — three new component specs** (design-plan §2.5/2.6/2.7): **View-tab strip**, **Group header row**,
   **DB-view toolbar-control treatment** (incl. the group-by `brand-navy/6`+`brand-navy` border treatment
   and the Person-overrides-segment disabled-segment note).
7. **§2 Tinted-Status Rule / §5 Badges** — append the **8px-dot + always-label** note (design-plan §2.8):
   "Task status chips use an 8px dot + always-present text label (never dot-only) so status stays
   perceivable when grouping ≠ Status (WCAG 1.4.1)."
8. **§ How to use these tokens** — add the runtime `:root` triplets (`--brand-navy: 218 46% 22%;`
   `--brand-navy-text: 218 42% 26%;` `--brand-orange: 18 80% 48%;`) + the `@theme inline` mappings
   (`--color-brand-navy: hsl(var(--brand-navy));` etc.).

Run: `cd /Users/ariefsaid/Coding/gordi-mos && rg -n "brand-navy|Structural-Navy Rule|Orange-Sprinkle Rule|navy→blue|Dense DB-view variant|always-present text label" DESIGN.md`
→ every clause present.

## Task 2 — Add the runtime brand tokens to the app stylesheet (`:root` + Tailwind theme)

**TDD red.** N/A (token plumbing; consumed by Tasks 3–4 + PR-2/3, verified by Task 4 + build).

**Green.** Edit the app's global stylesheet `mos-app/src/index.css` (the `:root` token block that holds
`--primary` etc.; confirm the file with `rg -n "^\s*--primary:" mos-app/src/index.css`). Add the three
triplets to `:root`:

```css
  --brand-navy: 218 46% 22%;
  --brand-navy-text: 218 42% 26%;
  --brand-orange: 18 80% 48%;
```

and the matching `@theme inline` color mappings (next to the existing `--color-primary`):

```css
  --color-brand-navy: hsl(var(--brand-navy));
  --color-brand-navy-text: hsl(var(--brand-navy-text));
  --color-brand-orange: hsl(var(--brand-orange));
```

Run: `cd mos-app && npm run build` → builds clean (Tailwind resolves the new `@theme` colors).
Run: `cd mos-app && rg -n "brand-navy|brand-orange" src/index.css` → all three present.

## Task 3 — `StatusPill` dot 6px→8px (AC-118 always-label is already true; ratify the dot)

**TDD red.** New `mos-app/src/components/tasks/StatusPill.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('AC-118: always renders the status text label (never dot-only)', () => {
    render(<StatusPill status="In Progress" />)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })
})
```

Run: `cd mos-app && npx vitest run src/components/tasks/StatusPill.test.tsx` → green for the label
assertion (label already renders). The dot-size change has no behavioral assertion (it is a CSS literal);
it is verified by the rg below + design-review.

**Green.** Edit `mos-app/src/components/tasks/StatusPill.css` line 9–11: change `.dot` `width: 6px;
height: 6px;` → `width: 8px; height: 8px;` (radius/`flex` unchanged).

Run: `cd mos-app && rg -n "width: 8px; height: 8px" src/components/tasks/StatusPill.css` → present.
Run: `cd mos-app && npx vitest run src/components/tasks/StatusPill.test.tsx && npm run typecheck`.

## Task 4 — Token-only visual touches (logo · header avatar · active nav · drawer tab underline) (AC-120)

**TDD red.** New `mos-app/src/shell/brandTokens.test.tsx` — assert the active nav item + breadcrumb stay
role-stable after the token swap (AC-120 is structural, not the cosmetic color itself):

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppShell from './AppShell'   // confirm the shell component path with rg

describe('shell brand touches', () => {
  it('AC-120: the Tasks nav item is present + role-stable after the navy active-indicator swap', () => {
    render(<MemoryRouter initialEntries={['/tasks']}><AppShell /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /tasks/i })).toHaveAttribute('aria-current', 'page')
  })
})
```

Run: `cd mos-app && npx vitest run src/shell/brandTokens.test.tsx` → red (file new; adjust the import to
the real shell component — find it with `rg -n "aria-current=\"page\"" mos-app/src`).

**Green.** Apply the four **token-only** swaps (no markup/logic change — class/style values only), each
mapping to the DESIGN.md token added in Task 1/2:

- **Logo square + dot** (shell brand block): square `bg-brand-navy`, dot `brand-orange`.
- **Header user avatar gradient**: `linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--primary)))`
  (was blue→violet).
- **Active nav indicator**: `brand-navy/6` bg + `brand-navy-text` + an inset `brand-navy` rail marker
  (was `primary/10`). The **action color stays `primary`** for buttons/links (Structural-Navy Rule).
- **Drawer active-tab underline** (`TaskTabStrip` / `TaskDrawerHeader` active tab): underline switches
  `primary` → `brand-navy` (structural). Locate with
  `rg -n "border-bottom|underline|active" mos-app/src/components/tasks/TaskTabStrip*`.

Run: `cd mos-app && npx vitest run src/shell/brandTokens.test.tsx src/components/tasks && npm run typecheck && npx eslint . --max-warnings=0`.

**PR-1 done.** Open PR-1 (carries ADR-0008). Director merges before PR-2.

---

# PR-2 — Full-bleed layout + view-tab scaffold + toolbar + persistence

> Engine stays the existing `useState`/`useMemo` filter/sort. The group-by control is **rendered but
> flat** (selecting Owner/BU has no grouping effect yet — wired in PR-3). This is a pure layout/scaffold
> slice. `TasksTable.tsx` is edited in place (renamed to `TasksWorkspace` in PR-3).

## Task 5 — `PageFrame` gains `variant: 'data' | 'prose'` (AC-121, FR-120)

**TDD red.** New `mos-app/src/shell/PageFrame.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import PageFrame from './PageFrame'

describe('PageFrame variant', () => {
  it('AC-121: variant="prose" (default) caps content at 1080px', () => {
    const { container } = render(<PageFrame><div>x</div></PageFrame>)
    const inner = container.querySelector('main > div') as HTMLElement
    expect(inner.style.maxWidth).toBe('1080px')
  })
  it('AC-121: variant="data" removes the 1080px cap (full-bleed)', () => {
    const { container } = render(<PageFrame variant="data"><div>x</div></PageFrame>)
    const inner = container.querySelector('main > div') as HTMLElement
    expect(inner.style.maxWidth).toBe('none')
  })
})
```

Run: `cd mos-app && npx vitest run src/shell/PageFrame.test.tsx` → red.

**Green.** Edit `mos-app/src/shell/PageFrame.tsx`:

```tsx
interface PageFrameProps {
  children: ReactNode
  variant?: 'data' | 'prose'
}

export default function PageFrame({ children, variant = 'prose' }: PageFrameProps) {
  const isData = variant === 'data'
  return (
    <main className="overflow-auto" style={{ padding: isData ? '28px 24px 56px' : '28px 32px 56px' }}>
      <div style={{ maxWidth: isData ? 'none' : 1080, margin: isData ? '0' : '0 auto' }}>
        {children}
      </div>
    </main>
  )
}
```

Run: `cd mos-app && npx vitest run src/shell/PageFrame.test.tsx && npm run typecheck`.

## Task 6 — `TasksLayout` passes `variant="data"` (full-bleed Tasks) (AC-121, AC-120)

**TDD red.** Add to `mos-app/src/pages/TasksLayout.test.tsx` (create if absent — mirror
`TasksSplitView.test.tsx` mounting from the 2026-06-15 plan):

```tsx
it('AC-121: TasksLayout renders inside a full-bleed (variant=data) PageFrame', () => {
  // render <TasksLayout/> within a MemoryRouter at /tasks; the <main> inner div has maxWidth:none
})
it('AC-120: the breadcrumb/landmark survive full-bleed (role-stable nav)', () => {
  // the Tasks <main> landmark is present; no breadcrumb regression
})
```

Run → red.

**Green.** Edit `mos-app/src/pages/TasksLayout.tsx` line 51: `<PageFrame>` → `<PageFrame variant="data">`.
No other change.

Run: `cd mos-app && npx vitest run src/pages/TasksLayout.test.tsx && npm run typecheck`.

## Task 7 — `ViewTabStrip` (Table active; Board/Calendar disabled SOON stubs) (AC-122, FR-121)

**TDD red.** New `mos-app/src/components/tasks/ViewTabStrip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewTabStrip } from './ViewTabStrip'

describe('ViewTabStrip', () => {
  it('AC-122: Table is the selected tab; Board + Calendar are disabled SOON stubs', () => {
    render(<ViewTabStrip active="table" />)
    expect(screen.getByRole('tab', { name: /table/i })).toHaveAttribute('aria-selected', 'true')
    const board = screen.getByRole('tab', { name: /board/i })
    expect(board).toHaveAttribute('aria-disabled', 'true')
    expect(board).toHaveAttribute('tabindex', '-1')
    expect(screen.getAllByText(/soon/i)).toHaveLength(2)
  })
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/ViewTabStrip.tsx`: `role="tablist"` with three
`role="tab"` buttons. Props `{ active: 'table' }` (only valid value in v1). Table = `aria-selected=true`,
`brand-navy-text` + 2px `brand-orange` bottom border (the one orange sprinkle, per DESIGN.md §5 view-tab
spec). Board + Calendar = `aria-disabled="true"` `tabindex="-1"`, `not-allowed` cursor, a `secondary`
"SOON" pill, no onClick. Roving tabindex (only the active tab is `tabindex=0`). Create the matching CSS in
`mos-app/src/components/tasks/ViewTabStrip.css` to the §5 view-tab-strip token spec.

Run: `cd mos-app && npx vitest run src/components/tasks/ViewTabStrip.test.tsx && npm run typecheck`.

## Task 8 — Persistence module `useTasksViewPref` (view · groupBy · collapsedGroups) (AC-127, FR-125)

**TDD red.** New `mos-app/src/components/tasks/useTasksViewPref.test.ts` (mirror
`useExpandPref.test.ts`):

```tsx
import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, it, expect } from 'vitest'
import { useTasksViewPref, __resetTasksViewPrefForTests } from './useTasksViewPref'

beforeEach(() => { localStorage.clear(); __resetTasksViewPrefForTests() })

describe('useTasksViewPref (per-user-global, mirrors useExpandPref)', () => {
  it('AC-127: defaults groupBy=status, view=table, collapsedGroups={}', () => {
    const { result } = renderHook(() => useTasksViewPref())
    expect(result.current.view).toBe('table')
    expect(result.current.groupBy).toBe('status')
    expect(result.current.collapsedGroups).toEqual({})
  })
  it('AC-127: setGroupBy persists to mos.tasks.groupBy and re-reads on remount', () => {
    const { result } = renderHook(() => useTasksViewPref())
    act(() => result.current.setGroupBy('owner'))
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('owner')
    const { result: r2 } = renderHook(() => useTasksViewPref())
    expect(r2.current.groupBy).toBe('owner')
  })
  it('AC-132: toggleCollapsed records the collapsed group key per dimension', () => {
    const { result } = renderHook(() => useTasksViewPref())
    act(() => result.current.toggleCollapsed('Done'))   // collapses under the active groupBy
    expect(JSON.parse(localStorage.getItem('mos.tasks.collapsedGroups')!)).toEqual({ status: ['Done'] })
  })
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/useTasksViewPref.ts` mirroring `useExpandPref.ts`'s
`useSyncExternalStore`-over-`localStorage` module pattern (module-level snapshot + subscribers + a
`__resetTasksViewPrefForTests` hook). Keys: `mos.tasks.view` (`'table'`), `mos.tasks.groupBy`
(`'status'|'owner'|'bu'`, default `'status'`), `mos.tasks.collapsedGroups` (JSON `{ [groupBy]: string[] }`).
Signature:

```ts
export type TasksGroupBy = 'status' | 'owner' | 'bu'
export type TasksView = 'table'
export interface TasksViewPref {
  view: TasksView
  groupBy: TasksGroupBy
  collapsedGroups: Partial<Record<TasksGroupBy, string[]>>
  setGroupBy: (g: TasksGroupBy) => void
  toggleCollapsed: (groupKey: string) => void  // toggles under the current groupBy dimension
  isCollapsed: (groupKey: string) => boolean
}
export function useTasksViewPref(): TasksViewPref
export function __resetTasksViewPrefForTests(): void
```

Guard all storage access in try/catch (SSR/privacy mode), parse `collapsedGroups` defensively.

Run: `cd mos-app && npx vitest run src/components/tasks/useTasksViewPref.test.ts && npm run typecheck`.

## Task 9 — Toolbar restyle + render the (flat) group-by control (AC-122 toolbar chrome)

**TDD red.** Add to `mos-app/src/components/tasks/TasksTable.test.tsx` (the table's existing test file;
confirm path with `rg -l "TasksTable" mos-app/src/components/tasks/*.test.tsx`):

```tsx
it('renders the group-by control (Status/Owner/BU) and the view-tab strip in the toolbar region', () => {
  // render TasksTable; expect a control labelled /group/i with options Status, Owner, Business unit;
  // expect the ViewTabStrip tablist present above the toolbar
})
```

Run → red.

**Green.** In `mos-app/src/components/tasks/TasksTable.tsx`: render `<ViewTabStrip active="table" />` above
`.page-head-row`, and add a `GroupByControl` to the `.toolbar` (a `<select>` labelled "Group" with options
Status/Owner/Business unit, styled to the §5 group-by treatment — `brand-navy/6` bg + `brand-navy` border
+ `brand-navy-text`). Wire its value to `useTasksViewPref().groupBy` + `setGroupBy`, but **do not change
the rendering** (the table stays flat/ungrouped — grouping lands in PR-3). The control is functional
*state* (persists) but visually flat output this PR.

Run: `cd mos-app && npx vitest run src/components/tasks/TasksTable.test.tsx && npm run typecheck`.

## Task 10 — Person-overrides-segment (disable the Mine/RACI/All segment when a Person is set) (AC-126, FR-124)

**TDD red.** Add to `TasksTable.test.tsx`:

```tsx
it('AC-126: choosing a Person disables the Mine/RACI/All segment (aria-disabled, out of tab order)', async () => {
  // render with people; select a person in the Person filter →
  // the segment role=tablist buttons are aria-disabled, tabindex=-1, and the segment reads "Person: me"
})
```

Run → red.

**Green.** In `TasksTable.tsx`, derive `segmentDisabled = personFilter !== ''`. When disabled, render each
`seg-btn` with `aria-disabled="true"` + `tabIndex={-1}` + `disabled`, apply `opacity:.5`, and show the
"Person: me" semantic label (per design-plan §3 segment-disabled state). The Person filter now drives the
ownership scope (its existing `raciMember(t, personFilter)` filter already does this), so the segment is
inert while a Person is chosen.

Run: `cd mos-app && npx vitest run src/components/tasks/TasksTable.test.tsx && npm run typecheck`.

## Task 11 — Missing-states chrome on the full-bleed workspace (AC-133) + "N overdue" click-to-filter button (AC-128 page-count)

**TDD red.** Add to `TasksTable.test.tsx`:

```tsx
it('AC-133: no-results-after-filter shows the distinct message + Clear filters + New task', async () => {
  // set a Person filter that matches nothing → "No tasks match these filters" + a Clear filters button
  // + the + New task CTA; group headers are NOT shown (zero leaf rows)
})
it('AC-133: zero-overdue omits the overdue segment entirely (no green all-clear badge)', () => {
  // tasks with no overdue → count line shows "N tasks" (and blocked if any), no "· 0 overdue"
})
it('AC-128: the "N overdue" count is a button that filters to overdue-only and is clearable', async () => {
  // with overdue>0, click the "N overdue" button → only overdue rows shown + a clearable filter chip
})
```

Run → red.

**Green.** In `TasksTable.tsx`:
- Add the **no-results-after-filter** branch (distinct from empty-no-tasks): when `sortedTasks.length===0`
  **and** a filter is active (BU/person/search/segment≠all), render "No tasks match these filters" + a
  **Clear filters** button (resets BU/status/person/search/segment→`all`) + the `+ New task` CTA. The
  existing empty-no-tasks branch stays for the unfiltered case.
- **Zero-overdue** already holds (the `countLine` only appends `· N overdue` when `overdue>0`) — add the
  test as the regression guard; no code change beyond confirming no green badge is rendered.
- Make the **"N overdue"** segment of the count line a `<button>` (`aria-label="Filter to N overdue
  tasks"`, `--status-lost-text` text) that sets a transient `overdueOnly` boolean filter; render a
  clearable filter chip ("Overdue only ✕") when active. The `overdueOnly` filter is applied in the
  `visibleTasks` memo (`dueStatus(t.due_date, now) === 'overdue'`). (Group-subtotal buttons land in PR-3
  on the same `overdueOnly` mechanism.)

Run: `cd mos-app && npx vitest run src/components/tasks/TasksTable.test.tsx && npm run typecheck`.

## Task 12 — PR-2 lint + coverage sweep

**TDD red.** N/A (gate task).

**Green.** Run the slice suite + gates:
`cd mos-app && npx vitest run src/shell/PageFrame.test.tsx src/pages/TasksLayout.test.tsx src/components/tasks --coverage && npm run typecheck && npx eslint . --max-warnings=0`.
Fix any changed file under 80% changed-line coverage by adding the missing-state unit test (loading /
empty / error per design-plan §3). **PR-2 done.** Open PR-2; Director merges before PR-3.

---

# PR-3 — TanStack refactor + group-by engine + group headers

> **Add the dependency first.** `cd mos-app && npm i @tanstack/react-table@^8`
> (pairs with the already-present `@tanstack/react-virtual`). Commit the `package.json` +
> `package-lock.json` change in the first PR-3 commit.
>
> **Invariant for the whole PR:** the ADR-0007 suite stays green — at every task run
> `cd mos-app && npx vitest run src/pages/TasksLayout.test.tsx src/components/tasks/TaskDrawer.test.tsx src/components/tasks/TaskSurface.test.tsx`.
> Re-point a test's mount target if `TasksTable` → `TasksWorkspace` renaming requires it; **never bend an
> assertion** to the new DOM (BDD rule).

## Task 13 — Rename `TasksTable` → `TasksWorkspace`; stand up the TanStack instance over current behavior (AC-116)

**TDD red.** Rename `mos-app/src/components/tasks/TasksTable.tsx` →
`mos-app/src/components/tasks/TasksWorkspace.tsx` (+ `.css` + `.test.tsx`) and re-export for one step:
keep `export { TasksWorkspace as TasksTable }` so `TasksLayout` compiles unchanged. Add to
`TasksWorkspace.test.tsx`:

```tsx
it('AC-116: opening a row resolves to the one canonical /tasks/:id surface (no second home)', async () => {
  // render the workspace within the split-view routes; click a row → navigate('/tasks/<id>'),
  // table stays mounted, drawer renders the same TaskSurface (no alternate detail route)
})
```

Run → red (workspace not yet on TanStack; assertion may pass via existing behavior — keep it as the
canonical-home regression guard).

**Green.** In `TasksWorkspace.tsx`, introduce a `useReactTable` instance fed by `tasksWithOverrides`,
configured with `getCoreRowModel()`, `getFilteredRowModel()`, `getSortedRowModel()` — **but keep rendering
from the existing `sortedTasks`** for this task (the instance exists, output unchanged). Define the column
defs (`task`, `status`, `owner`, `due`, `activity`) with accessor + sort fns matching today's `handleSort`
comparators. Update `TasksLayout.tsx` import to `TasksWorkspace`.

Run: `cd mos-app && npx vitest run src/components/tasks/TasksWorkspace.test.tsx src/pages/TasksLayout.test.tsx && npm run typecheck`.

## Task 14 — Move filtering + sorting onto the TanStack row models (AC-119 overdue signal preserved)

**TDD red.** Add to `TasksWorkspace.test.tsx`:

```tsx
it('AC-119: an overdue row shows the in-row off-track signal "Overdue · <date>" in red', () => {
  // a task with due_date in the past → the row due cell text starts with "Overdue · " and has due-overdue
})
it('within-group / table sort still defaults to Due ascending', () => {
  // rows render Due-ascending by default (overdue first)
})
```

Run → red.

**Green.** Replace the hand-rolled `visibleTasks`/`sortedTasks` memos with TanStack column filters
(`columnFilters` / `globalFilter` for search) + sorting state, reading the rows via
`table.getRowModel().rows`. Keep `renderRow` rendering the same cells (the overdue "Overdue · <date>"
red-text signal unchanged). The `statusOverrides` map still pre-maps `allTasks` before it enters the
table's `data` (optimistic sync preserved).

Run: `cd mos-app && npx vitest run src/components/tasks/TasksWorkspace.test.tsx && npm run typecheck`.

## Task 15 — Grouping engine: `getGroupedRowModel` + `getExpandedRowModel` (group by Status/Owner/BU) (AC-123)

**TDD red.** Add to `TasksWorkspace.test.tsx`:

```tsx
it('AC-123: default groups by Status with a count per group; rows within a group are Due-ascending', () => {
  // render → group header rows for Open/In Progress/Blocked/Done each showing a count;
  // leaf rows under a group are sorted Due-asc (overdue first)
})
```

Run → red.

**Green.** Add `getGroupedRowModel()` + `getExpandedRowModel()` to the instance, drive `grouping` from
`useTasksViewPref().groupBy` (map `status`→the status column, `owner`→responsible-person column,
`bu`→business-unit column). Set `manualExpanding=false` and expand all groups by default (collapse driven
by the pref in Task 18). Within-group sort = Due-asc (the existing due comparator as the secondary sort).
Render group rows vs leaf rows by branching on `row.getIsGrouped()` in the body map.

Run: `cd mos-app && npx vitest run src/components/tasks/TasksWorkspace.test.tsx && npm run typecheck`.

## Task 16 — `GroupHeaderRow`: caret + label + count + overdue subtotal + "+ Add task" (AC-123, AC-128 subtotal)

**TDD red.** New `mos-app/src/components/tasks/GroupHeaderRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupHeaderRow } from './GroupHeaderRow'

describe('GroupHeaderRow', () => {
  it('AC-123: shows label, count, and an overdue subtotal when >0', () => {
    render(<table><tbody><GroupHeaderRow label="Blocked" count={3} overdue={2}
      collapsed={false} onToggle={()=>{}} onAddTask={()=>{}} onOverdueFilter={()=>{}} colSpan={5} /></tbody></table>)
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/2 overdue/i)).toBeInTheDocument()
  })
  it('AC-128: the overdue subtotal is a button that triggers the overdue-only filter', () => {
    const onOverdueFilter = vi.fn()
    render(<table><tbody><GroupHeaderRow label="Open" count={4} overdue={1}
      collapsed={false} onToggle={()=>{}} onAddTask={()=>{}} onOverdueFilter={onOverdueFilter} colSpan={5} /></tbody></table>)
    fireEvent.click(screen.getByRole('button', { name: /filter to 1 overdue/i }))
    expect(onOverdueFilter).toHaveBeenCalled()
  })
  it('AC-124: a zero-count group still renders its header with no overdue subtotal', () => {
    render(<table><tbody><GroupHeaderRow label="Ada Lovelace" count={0} overdue={0}
      collapsed={false} onToggle={()=>{}} onAddTask={()=>{}} onOverdueFilter={()=>{}} colSpan={5} /></tbody></table>)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText(/overdue/i)).toBeNull()
  })
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/GroupHeaderRow.tsx` (a `<tr className="grp">`) to the §5
group-header spec: a caret toggle (`<button aria-expanded={!collapsed} aria-controls=...>`), the label
(`brand-navy-text`, 13px/700), a `tabular-nums` count (`muted-foreground`), an **overdue subtotal**
`<button>` (`· N overdue`, `--status-lost-text`, `aria-label="Filter to N overdue tasks"`) rendered only
when `overdue>0`, and a trailing **"+ Add task"** ghost `<button>`. Props:

```ts
type GroupHeaderRowProps = {
  label: string; count: number; overdue: number
  collapsed: boolean; colSpan: number
  onToggle: () => void; onAddTask: () => void; onOverdueFilter: () => void
}
```

Run: `cd mos-app && npx vitest run src/components/tasks/GroupHeaderRow.test.tsx && npm run typecheck`.

## Task 17 — Wire group headers into the workspace body; show all groups always incl. empty (AC-123, AC-124)

**TDD red.** Add to `TasksWorkspace.test.tsx`:

```tsx
it('AC-124: grouping by Owner shows ALL owner groups, including those with zero tasks', () => {
  // render grouped by owner with a person who owns no task → that owner's header still renders (count 0)
})
```

Run → red.

**Green.** In `TasksWorkspace.tsx`, render `GroupHeaderRow` for each group row. Compute the **overdue
subtotal** per group via an aggregation over the group's leaf rows (`dueStatus(...)==='overdue'`). For
Owner/BU grouping, **inject empty groups**: build the full set of group keys from the directory
(`peopleDirectory` for owner, `busDirectory` for BU) and render a zero-count header for any key with no
leaf rows (Status grouping uses the fixed 4-status set). Wire `onAddTask` → `navigate('/tasks/new')` with
the pre-fill param (Task 19), `onOverdueFilter` → the `overdueOnly` filter (Task 11), `onToggle` →
`toggleCollapsed(groupKey)` (Task 18).

Run: `cd mos-app && npx vitest run src/components/tasks/TasksWorkspace.test.tsx && npm run typecheck`.

## Task 18 — Group collapse persistence + `j/k` skips group-header rows (AC-132, AC-131, OBS-121)

**TDD red.** Add to `TasksWorkspace.test.tsx`:

```tsx
it('AC-132: toggling a group header collapses its leaf rows and persists per-user-global', () => {
  // click a group caret → its leaf rows hide; localStorage mos.tasks.collapsedGroups records the key;
  // re-render → still collapsed
})
it('AC-131/OBS-121: j moves the leaf-row cursor and skips group-header rows', () => {
  // focus the table; press j repeatedly → cursor lands only on leaf rows, never a .grp header
})
```

Run → red.

**Green.** Drive group expand/collapse from `useTasksViewPref().isCollapsed/toggleCollapsed` (sync the
TanStack `expanded` state from the pref). Rebuild the **leaf-row index array** (the flat list of currently
visible leaf rows, excluding headers and collapsed-group rows) and pass `rowCount = leafRows.length` to
`useTasksKeyboard`; map the cursor index onto `leafRows[i]` so `onOpen`/`.kfocus` target leaf rows only.
Group-header toggles stay independently keyboard-reachable (Tab to the caret button + Enter/Space — the
`GroupHeaderRow` button handles this natively).

Run: `cd mos-app && npx vitest run src/components/tasks/TasksWorkspace.test.tsx && npm run typecheck`.

## Task 19 — "+ Add task" pre-fills the grouped dimension (Owner → R) (AC-125, FR-123)

**TDD red.** Add to `TasksWorkspace.test.tsx`:

```tsx
it('AC-125: in an Owner-grouped view, a group "+ Add task" opens create pre-filling that person as R', () => {
  // group by owner; click "+ Add task" in Ada's group → navigate('/tasks/new?r=<ada-id>')
})
```

Run → red.

**Green.** `GroupHeaderRow.onAddTask` navigates to `/tasks/new` with a query param carrying the grouped
dimension: Owner → `?r=<personId>` (R, the Director ruling), BU → `?bu=<buId>`, Status →
`?status=<status>`. In `TaskSurface` create mode (the kept ADR-0007 component), read the param via
`useSearchParams` to seed the create form's R / BU / status defaults (additive: absent param → today's
creator-default behavior). Confirm the create form field names with
`rg -n "responsiblePersonId|businessUnitId" mos-app/src/components/tasks/TaskSurface.tsx`.

Run: `cd mos-app && npx vitest run src/components/tasks/TasksWorkspace.test.tsx src/components/tasks/TaskSurface.test.tsx && npm run typecheck`.

## Task 20 — Re-wire virtualization over the leaf rows under the group structure (AC-131, NFR-120)

**TDD red.** Add to `TasksWorkspace.test.tsx`:

```tsx
it('AC-131: with 60 leaf rows the table virtualizes yet j/k cursor + aria-sort still work', () => {
  // render 60 tasks → not all 60 leaf <tr> in the DOM (windowed); j moves the cursor;
  // sortable header keeps aria-sort; group headers remain rendered (outside/within the window correctly)
})
```

Run → red.

**Green.** Keep the existing `@tanstack/react-virtual` window but compute it over the **flat visible row
list** (group headers + leaf rows of expanded groups), so headers and leaves window together. Preserve
`aria-sort` on the `<thead>` (outside the window) and `scrollToIndex` for the `j/k` cursor (mapped onto
the leaf-row subset from Task 18). Below 50 rows render un-windowed (no behavior change).

Run: `cd mos-app && npx vitest run src/components/tasks/TasksWorkspace.test.tsx && npm run typecheck`.

## Task 21 — `OwnerCell` "+N" → accessible read-only RACI tooltip (AC-130, FR-128)

**TDD red.** Add to `mos-app/src/components/tasks/OwnerCell.test.tsx` (create if absent):

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OwnerCell } from './OwnerCell'

it('AC-130: the +N control reveals a read-only tooltip of the other RACI members on focus', () => {
  render(<OwnerCell fullName="Ada Lovelace" otherCount={2}
    others={[{ role: 'C', name: 'Alan Turing' }, { role: 'I', name: 'Grace Hopper' }]} />)
  const more = screen.getByRole('button', { name: /show other raci members/i })
  fireEvent.focus(more)
  expect(screen.getByText(/C · Alan Turing/)).toBeInTheDocument()
  expect(screen.getByText(/I · Grace Hopper/)).toBeInTheDocument()
})
```

Run → red.

**Green.** Extend `OwnerCell` with an optional `others?: { role: 'A'|'C'|'I'; name: string }[]` prop. The
`+N` becomes a `<button aria-label="Show other RACI members">` opening a labelled popover (hover **and**
focus reveal) listing each member as `role · name` (reuse the drawer's `<k>` glyph convention). Read-only
(no editor — the drawer stays the editor). The workspace builds `others` from the task's A/C/I + the
`personMap`. Backward-compatible: absent `others` keeps the silent `+N` (no caller breaks).

Run: `cd mos-app && npx vitest run src/components/tasks/OwnerCell.test.tsx && npm run typecheck`.

## Task 22 — `MobileGroupedCards` (<768px: group headers + cards, no view-tabs) (AC-129, FR-127)

**TDD red.** Add to `TasksWorkspace.test.tsx`:

```tsx
it('AC-129: <768px renders grouped cards (group headers + TaskCards) and no view-tab strip', () => {
  // matchMedia(min-width:768)=false → group header rows + task cards for the chosen group-by;
  // queryByRole('tablist', { name: /view/i }) is null (no view-tabs on mobile)
})
```

Run → red.

**Green.** Create `mos-app/src/components/tasks/MobileGroupedCards.tsx`: when `!useIsDesktop()`, render
the group headers (reuse `GroupHeaderRow`'s label/count/overdue-subtotal as a card-list heading) + the
existing `TaskCard`s for each group, honoring the same `collapsedGroups` pref. **No `ViewTabStrip`** on
mobile (per OD-P3-6). The toolbar collapses to the existing compact filter affordance (group-by + segment).
Wire it into `TasksWorkspace`'s `!isDesktop` branch (replacing today's flat card list).

Run: `cd mos-app && npx vitest run src/components/tasks/TasksWorkspace.test.tsx && npm run typecheck`.

## Task 23 — E2E: group → open → status → regroup → add (AC-134) + re-verify the split-view suite

**TDD red.** New `mos-app/e2e/tasks-dbview.spec.ts` (model on `e2e/tasks-split-view.spec.ts`):

- **Journey (AC-134):** log in → `/tasks` → confirm full-bleed grouped-by-Status workspace with group
  headers (count + overdue subtotal) → click a row → URL `/tasks/:id`, table still visible, change status
  inline → the table row reflects it (optimistic, no nav) → switch group-by to **Owner** (persists) →
  click a group "+ Add task" → create drawer opens with that person pre-filled as **R** → fill Title +
  Create → URL `/tasks/:newId`, the new task appears in that owner's group.

Run: `cd mos-app && npx playwright test e2e/tasks-dbview.spec.ts` → red, then green.

**Green (re-verify ADR-0007).** Run the kept split-view suite against the new engine and confirm green:
`cd mos-app && npx vitest run src/pages/TasksLayout.test.tsx src/components/tasks/TaskDrawer.test.tsx src/components/tasks/TaskSurface.test.tsx src/components/tasks/useTasksKeyboard.test.ts`
(AC-100..114 — keyboard, optimistic sync, virtualization, condense ladder, modal/non-modal regimes).
Re-point only mount targets affected by the `TasksTable`→`TasksWorkspace` rename; do not change assertions.

## Task 24 — Drop the compat re-export; final gate (whole feature)

**TDD red.** N/A (cleanup + gate).

**Green.** Remove the `export { TasksWorkspace as TasksTable }` compat alias from Task 13 (all callers now
import `TasksWorkspace` directly — confirm with `rg -n "TasksTable" mos-app/src`). Run the full gate:
`cd mos-app && npm run typecheck && npx eslint . --max-warnings=0 && npx vitest run --coverage && npx playwright test e2e/tasks-dbview.spec.ts e2e/tasks-split-view.spec.ts e2e/tasks-create-status.spec.ts e2e/tasks-archive.spec.ts`.
Confirm the P2-1 e2e + ADR-0007 ACs still pass — the DB-view redesign must not regress them. **PR-3 done.**

---

## AC → Task coverage map

| AC | Requirement | Task(s) | Layer |
|---|---|---|---|
| AC-116 (RI-1) | FR — | 13 | unit |
| AC-117 (RI-2) | — | 14, 23 | unit + e2e |
| AC-118 (RI-3) | OBS-120 | 3 | unit |
| AC-119 (RI-4) | — | 14 | unit |
| AC-120 (RI-5) | — | 4, 6 | unit |
| AC-121 | FR-120 | 5, 6 | unit |
| AC-122 | FR-121 | 7, 9 | unit |
| AC-123 | FR-122/123 | 15, 16, 17 | unit |
| AC-124 | FR-122 | 16, 17 | unit |
| AC-125 | FR-123 | 19 | unit |
| AC-126 | FR-124 | 10 | unit |
| AC-127 | FR-125 | 8 | unit |
| AC-128 | FR-126 | 11 (page), 16 (subtotal) | unit |
| AC-129 | FR-127 | 22 | unit |
| AC-130 | FR-128 | 21 | unit |
| AC-131 | NFR-120, OBS-121 | 18, 20 | unit |
| AC-132 | OBS-121, FR-125 | 8, 18 | unit |
| AC-133 | design-plan §3 | 11 | unit |
| AC-134 | end-to-end | 23 | e2e |
| AC-100..114 (ADR-0007) | **kept green** | 13, 23 re-verify | unit + e2e (oracle) |
| AC-001..051 (RLS) | **unchanged** — pgTAP not touched (UI-only) | — | pgTAP (regression) |

## Risks & mitigations

1. **`TasksTable` → `TasksWorkspace` TanStack refactor must keep the split-view green (highest risk,
   OD-P3-8's known one-time cost).** Mitigated by: the compat re-export (Task 13) keeps `TasksLayout`
   compiling through the rename; the ADR-0007 AC-100..114 suite is the behavior oracle run at every PR-3
   task and re-verified in Task 23; the engine swap lands incrementally (instance → filter/sort → group →
   headers → keyboard/virtual) so a regression is caught at the smallest diff.
2. **Group-by phasing (flat control in PR-2, wired in PR-3).** Mitigated by Task 8 persisting the pref and
   Task 9 rendering the control with no grouping output; PR-2 ships a pure layout slice and the engine
   change is isolated to PR-3.
3. **`j/k` over a grouped+windowed body.** Mitigated by Task 18's leaf-row index array (cursor maps to
   leaves only) + Task 20's window over the flat visible-row list; combined assertion in AC-131.
4. **Empty-group injection (Owner/BU) vs TanStack's row model** (TanStack only groups rows that exist).
   Mitigated by Task 17 deriving the full key set from the directory and rendering zero-count headers
   outside the row model — additive, not fighting the engine.
5. **DESIGN.md amendment drift.** Mitigated by Task 1's `rg` clause-presence check + the design-reviewer
   render gate; the named Structural-Navy / Orange-Sprinkle rules bound future use.

## Open questions for the Director

- **Q1 — `@tanstack/react-table` major version.** Plan pins `^8` (current stable, headless, pairs with the
  installed `@tanstack/react-virtual`). Confirm or name a version.
- **Q2 — "+ Add task" pre-fill transport.** Plan uses query params (`/tasks/new?r=…&bu=…&status=…`) read in
  `TaskSurface` create mode (deep-linkable, no new state channel). Confirm vs route/`location.state`.
- **Q3 — Empty-group key source for Owner grouping.** Plan injects empty owner headers from the **full
  people directory** (`getPeople`). On a large directory this could be many empty groups; confirm whether
  to scope empty-owner groups to "people who own ≥1 task in the org" + only the chosen Person (cap the
  empties). Recommendation: show empties only for owners present in the current (pre-filter) task set.
- **Q4 — `index.css` token location.** Task 2 assumes the `:root`/`@theme` block lives in
  `mos-app/src/index.css`; if the app keeps tokens elsewhere, the implementer re-points Task 2 (one-file
  change, no behavior impact).
