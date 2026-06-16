# ADR-0008 — Tasks full-bleed DB-view workspace + Gordi navy/orange brand amendment + `@tanstack/react-table` engine

- Status: Accepted (2026-06-16; decisions OD-P3-6/7/8 locked; design-plan gate signed —
  `tasks-dbview-final.html` adopted)
- Deciders: Owner (Arief) + Director
- Related: OD-P3-6 (full-bleed DB-view IA + grilled build-specs), OD-P3-7 (navy+orange brand amendment),
  OD-P3-8 (`@tanstack/react-table`) in `docs/decisions.md`; design-plan
  `docs/plans/2026-06-16-tasks-dbview-design-plan.md`; mockup oracle
  `docs/design-mockups/tasks-dbview-final.html` (context `-A.html` / `-B.html`); Lens-D oracle
  `docs/jtbd.md`; ADR-0007 (the split-view drawer this **keeps**); `DESIGN.md` (the identity authority
  this **amends**); `CONTEXT.md` (vocabulary — untouched)
- Scope note: **UI + design-system + a new client dependency only. No schema, RLS, grant, migration, or
  `lib/db/tasks.ts` signature change.** The `org_id` seam, RLS read/write/archive gates, and the P2-1
  pgTAP suite are untouched — TanStack runs **client-side** over the rows `listTasks` already fetches.
  Security-auditor scope for this issue is therefore the client only; there is no new data seam.

## Context

The split-view redesign (ADR-0007, shipped #15/#17/#18) gave Tasks a master-detail drawer but left the
*table* reading as a **personal to-do list**, not a work database. The owner's grill (2026-06-16) located
the root cause as **information architecture + layout width**, not color: a 1080px-centered single
grouped table with a thin filter row looks like a checklist regardless of palette. The decision (OD-P3-6)
is to adopt the **monday.com *information architecture*** — full-bleed workspace, a view-tab strip, a
collapsible group-by with per-group counts/subtotals, a real toolbar — rendered in the **restrained
DESIGN.md register** (explicitly **not** monday's saturated color). The open paradigm is unchanged: the
ADR-0007 drawer is kept as the editor (it *is* Notion's side-peek); inline-cell editing is **not**
adopted.

Three facts shape the decision:

1. **The 1080px cap is a shared `PageFrame` concern.** `mos-app/src/shell/PageFrame.tsx` hard-codes
   `maxWidth: 1080` for every route. A full-bleed Tasks table cannot be a Tasks-local CSS hack without
   forking the `<main>` landmark; it must be a `PageFrame` capability. But **prose surfaces (the
   Weekly-update write screen) must keep a readable measure** — full-bleed is for tables, not paragraphs.
   So the change is a `variant` axis on the shared frame, not a global cap removal.

2. **The current `TasksTable` runs ~23 hand-rolled `useState`/`useMemo` for filter/sort.** Adding
   grouping + per-group aggregation (counts, overdue subtotals) + a column-visibility condense ladder on
   top of that hand-rolled engine is exactly the bug-prone surface (grouped row models, aggregation,
   expand/collapse) that a headless table library solves. OD-P3-8 adopts `@tanstack/react-table`
   (headless — our markup, DESIGN.md tokens) over the already-shipped `@tanstack/react-virtual`.

3. **DESIGN.md is an "identity authority, never re-invent" doc, and this deliberately amends it.** The
   adopted system is the RIS near-monochrome: one action-blue, no navy, no orange. OD-P3-7 ratifies the
   **real Gordi brand colors** — navy `hsl(218 46% 22%)` (structural) + burnt-orange `hsl(18 80% 48%)`
   (sprinkle) — as the **first owner-approved divergence** from that palette. This is not drift; it is a
   recorded, scoped amendment with named usage rules, which is precisely why it earns an ADR rather than
   a silent token addition.

## Decision

### D1 — `PageFrame` gains a `variant: 'data' | 'prose'` axis (full-bleed for data only)

`PageFrame` takes `variant?: 'data' | 'prose'` (default `'prose'`, preserving every current caller).
`variant="prose"` keeps the `maxWidth: 1080` readable cap. `variant="data"` removes the cap (full-bleed)
and tightens horizontal padding to the toolbar/table gutter. **Tasks (`TasksLayout`) passes
`variant="data"`; the Weekly-update write surface stays `prose`.** Full-bleed changes only horizontal
max-width — it does **not** change the ADR-0007 split/overlay/mobile regimes (still governed by
`useIsSplitWidth` + the 768px card reflow).

### D2 — Full-bleed DB-view IA layered onto the kept split-view

The shipped split-view shell (`TasksLayout` → `<Outlet>` drawer; routes `/tasks`, `/tasks/:id`,
`/tasks/new`) is **kept verbatim**. `TasksTable` is rebuilt as a **`TasksWorkspace`** assembly that adds,
above the table: a **view-tab strip** (Table active; Board/Calendar visible but disabled "SOON" stubs —
deferred to later slices), a **real toolbar** (Group · BU · Person · Mine/RACI/All segment · Search · New
task), and a **collapsible group-by** (default **Status**; switchable to **Owner** / **BU** only). Each
group header carries a caret + label + **count + overdue subtotal** + a "+ Add task" affordance that
pre-fills the grouped dimension. **All groups are shown always** (including empty ones, possible when
grouping by Owner/BU) for layout stability. Within a group, rows sort **Due ascending (overdue first)**.
Mobile (`<768px`) renders **grouped cards** (group headers + `TaskCard`s, no view-tab strip).

### D3 — `@tanstack/react-table` headless row models replace the hand-rolled engine

`TasksWorkspace` holds **one** `@tanstack/react-table` instance using `getGroupedRowModel()` +
`getExpandedRowModel()` (grouping + aggregation for counts/overdue subtotals), `getSortedRowModel()`
(within-group Due-asc), `getFilteredRowModel()`, and column-visibility (the condense ladder). It is
**client-side** (`listTasks` fetches all; data volume is tiny). The keyboard layer (`useTasksKeyboard`),
the optimistic `statusOverrides` map, the `refreshKey` refetch channel, and the `@tanstack/react-virtual`
window over leaf rows are **all retained** and re-wired onto the TanStack data path. `j/k` iterate **leaf
rows only** (group-header rows are not cursor targets).

### D4 — Navy/orange DESIGN.md amendment (OD-P3-7), with two named usage rules

Three tokens are added to DESIGN.md (frontmatter `colors:` + §2 + runtime `:root` triplets):
`brand-navy hsl(218 46% 22%)`, `brand-navy-text hsl(218 42% 26%)` (AA text/label), `brand-orange
hsl(18 80% 48%)`. Two named rules are appended to §2 and govern usage:

- **The Structural-Navy Rule.** `brand-navy` carries *structural* weight (logo square + dot, active nav
  indicator, group-by control, drawer active-tab underline, avatar gradient navy→primary). It is **never
  an action color and never a status.** The One-Blue Rule is preserved — `primary` blue stays the only
  interactive/action color.
- **The Orange-Sprinkle Rule.** `brand-orange` is a sprinkle used **sparingly** (≤2 marks/screen: logo
  dot + active view-tab underline marker). It is kept **OFF all status semantics** (it sits hue-wise
  between the red/amber status hues and would be misread as a warning) and **OFF all actions**. It never
  carries text, so it has no AA-text obligation.

The amendment also: changes the header avatar gradient from blue→violet to **navy→blue**; documents the
**50px dense-row variant** for the full-bleed Tasks DB-view (54px stays the default everywhere else);
adds three new §5 component specs (view-tab strip · group-header row · DB-view toolbar-control
treatment); and bumps the status-chip `.dot` from **6px → 8px** with an **always-present text label**
note (WCAG 1.4.1 — status must stay perceivable when grouping ≠ Status).

### D5 — Director rulings baked in (resolved, not open)

- Group-by control is **scaffolded in PR-2** (visible, flat) and **wired in PR-3** (TanStack).
- "+ Add task" in an **Owner-grouped** view pre-fills the new task's **R (Responsible)** to that person
  (matches the "Owner column = R" convention in `docs/jtbd.md` §3).
- Page-level **"N overdue"** click and group **overdue-subtotal** click → a **transient overdue-only
  filter chip** the user can clear (not collapse-others).
- **Bulk-select is DEFERRED** — no row checkboxes / selection toolbar in v1.

## Alternatives considered

- **Hand-rolled group-by over the existing `useState`/`useMemo` engine** (instead of TanStack). Rejected:
  grouping + aggregation + expand/collapse + column-visibility is precisely TanStack's sweet spot and the
  bug-prone part; hand-rolling it duplicates a well-tested row-model engine and forecloses future column
  ops. The headless mode imposes zero visual cost (our markup, our tokens). Cost paid: a one-time refactor
  + re-verification of the freshly-shipped split-view (PR-3).
- **monday-style saturated color** (full color-coded boards/rows). Rejected by the owner: the *IA* is
  borrowed, not the palette. MOS keeps the restrained DESIGN.md register; soft-tinted status chips are the
  only color, everything else neutral grey, navy/orange used structurally and sparingly.
- **Full-bleed everywhere** (remove the 1080 cap globally). Rejected: prose (Weekly-update write) needs a
  readable measure; an un-capped paragraph column hurts readability. Hence the `variant` axis — full-bleed
  for data tables, capped for prose.
- **A restrained-skin without the brand amendment** (keep pure RIS near-monochrome, lean on navy-free
  neutrals for structure). Rejected by the owner: the screen still read generic; the real Gordi brand
  (navy + burnt-orange) gives the workspace identity *as structure*, without violating the One-Blue Rule.
- **Inline-cell editing** (monday/Airtable in-grid edit). Rejected (OD-P3-6): the ADR-0007 drawer remains
  the single editor — re-introducing in-cell editors recreates the "two homes per entity" Lens-C trap.
- **A second `/tasks` route per view** (e.g. `/tasks/board`). Rejected: Board/Calendar are disabled stubs
  in v1; the view selection is per-user-global persisted state, not a route, until those views are built.

## Consequences

- **Positive — one row-model engine.** Sorting, filtering, grouping, aggregation, and column-visibility
  collapse into one TanStack instance, removing ~23 hand-rolled `useState`/`useMemo` and the class of bugs
  that grouped-aggregation hand-rolling invites.
- **Positive — full-bleed is a reusable `PageFrame` capability.** My Week and Daily Log can adopt
  `variant="data"` later with no further frame work; prose surfaces keep their measure by default.
- **Positive — the brand amendment is recorded, scoped, and rule-bound.** The first divergence from the
  adopted palette is documented with named usage rules in the identity authority, so it is an amendment,
  not drift; future contributors have the rules to keep navy structural and orange a sprinkle.
- **Positive — zero backend churn.** No migration, RLS, grant, or `lib/db/tasks.ts` signature change; the
  P2-1 pgTAP RLS suite (AC-001..051) is untouched and re-run regression-only. The `org_id` + RLS seams
  proven in P2-1 stay the security boundary.
- **Negative / accepted — the `TasksTable` → `TasksWorkspace` refactor onto TanStack is the central risk,
  and it must re-verify the freshly-shipped split-view.** The ADR-0007 ACs (AC-100..114 — keyboard,
  optimistic status sync, virtualization, condense ladder, modal/non-modal regimes) are the behavior
  oracle for the refactor; they must stay green after the engine swap. Mitigation: PR-3 lands the engine
  swap behind the same ACs, with the keyboard/virtual/override wiring re-pointed (not re-designed).
- **Negative / accepted — a new core dependency.** `@tanstack/react-table` joins `@tanstack/react-virtual`
  (same author, headless, tree-shakeable). It is client-side only; it adds no server or schema surface.
- **Negative / accepted — DESIGN.md is no longer pure near-monochrome.** This is the deliberate point of
  OD-P3-7. The named rules + the AA-contrast table (design-plan §5) keep it disciplined; orange is never a
  contrast carrier, navy text clears AA (≥7:1).
- **Watch — chip perceivability under non-Status grouping.** When grouping by Owner/BU mixes statuses in a
  group, status must not rely on the dot alone. The always-present text label + 8px dot (D4) is the
  mitigation; the chip-always-labels rule is an AC at the unit layer.

## Reversibility / migration note

- **No data migration exists** — nothing in the database changes, so there is nothing to roll back at the
  DB layer. This ADR records UI + design-system + dependency decisions only.
- **`PageFrame` variant is trivially reversible** — the default is `'prose'` (today's behavior); reverting
  Tasks is a one-prop change.
- **The TanStack swap is reversible at the component boundary** — `TasksWorkspace` is the only consumer;
  the row data (`TaskListRow[]` from `listTasks`) and the drawer contract are unchanged, so a revert to the
  hand-rolled engine is a local change with no caller or URL impact.
- **The DESIGN.md amendment is additive** — the three tokens + named rules are appended; removing them
  (and reverting the four token-only visual touches) restores the pure RIS palette without structural
  change. The amendment is recorded here so any future reversal is a deliberate, traceable decision.
