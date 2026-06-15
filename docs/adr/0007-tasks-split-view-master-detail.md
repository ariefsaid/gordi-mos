# ADR-0007 — Tasks split-view master-detail ("one UI, two widths"; one canonical `/tasks/:id`)

- Status: Accepted (2026-06-15; design-plan gate signed — Variant B picked, OD-P3-2..5)
- Deciders: Owner (Arief) + Director
- Related: OD-P3-2..5 (`docs/decisions.md`); design-plan `docs/plans/2026-06-15-tasks-redesign-design-plan.md`;
  spec `docs/specs/tasks-raci.spec.md` (P2-1 — the surface being recomposed); ADR-0003 (cascade seam,
  referenceable); `docs/jtbd.md` (Lens-C "two homes" / Lens-D oracle); `CONTEXT.md` (vocabulary)
- Scope note: **UI + routing only. No schema, RLS, grant, or `lib/db/tasks.ts` signature change.**
  The org_id seam, RLS edit/archive gates, and migration surface are untouched (security-auditor scope
  for this issue is therefore the client only — there is no new data seam).

## Context

Today the Tasks surface is three **sibling full-page routes** (`mos-app/src/router.tsx` lines 49–51):

```
{ path: 'tasks', element: <TasksPage /> },
{ path: 'tasks/new', element: <TaskCreate /> },
{ path: 'tasks/:taskId', element: <TaskDetail /> },
```

Opening a task **unmounts the table** and navigates to a full page (`TaskDetail.tsx`, 844 lines). The
create form (`TaskCreate.tsx`) is a third, separate page with its own copy of the field set. This is a
list→detail navigation model: the triage context (the list) is destroyed every time you open one row,
and there are effectively **two editors for one entity** (the detail page's inline editors, plus the
create page's field set) — the Lens-C "two homes per entity" trap (`docs/jtbd.md` §3.3).

OD-P3-2..5 (locked, mockup-first A/B gate) redesigned the surface to a **master-detail split-view**:
the table stays mounted (~2/3) while the task surface mounts beside it as a push/squash drawer (~1/3,
no scrim); "open task page" **expands the same surface** to full width; mobile pushes the same surface
full-screen. The drawer **is** the fully-actionable surface (inline Status / RACI / checklist). The
design-architect's routing finding is the load-bearing structural consequence: **for the table to
persist, `:taskId` and `new` can no longer be siblings of `tasks` — they must render *inside* a parent
that owns the table.**

Two facts shape the decision:

1. **A split-view requires one mounted parent.** If `/tasks` and `/tasks/:id` are siblings, react-router
   unmounts one to mount the other; the table cannot survive the transition. The parent must own the
   table and render the detail from the URL param.
2. **The 844-line `TaskDetail.tsx` already contains the entire actionable surface** (StatusTrigger,
   RaciCard, ChecklistCard, ActivityCard, ConfirmArchive, PersonPicker, and all the optimistic
   `lib/db/tasks.ts` call-sites). Rendering that surface in both a 1/3 drawer and a full-width focus
   mode must not fork it into two copies — that re-creates the very Lens-C trap the redesign exists to kill.

## Decision

1. **One UI, two widths — a single `TaskSurface` component.** The actionable body of `TaskDetail.tsx`
   (status + RACI + checklist + activity + archive, with all its optimistic write handlers and
   `lib/db/tasks.ts` call-sites) is extracted into **one** `TaskSurface` component that takes
   `mode: 'create' | 'view'` and `width: 'drawer' | 'full'`. The 1/3 drawer and the full-width focus
   mode are the **same `TaskSurface`** with `width` differing; create mode is the same component with
   `mode='create'`. **There is no second editor and no duplicate field set.** `TaskDetail.tsx` becomes
   a thin full-width host that mounts `TaskSurface` at `width='full'`; `TaskCreate.tsx`'s field set is
   subsumed by `TaskSurface`'s create mode (the old page is removed once the drawer create lands).

2. **One canonical URL; expand is a view toggle, not a route.** `/tasks/:id` is *the table with that
   task's drawer open* — deep-linkable. `/tasks/new` is the create drawer. **Expand ⇄ split is a
   remembered per-user-global view toggle on the same `/tasks/:id` URL** (localStorage), not a second
   route — it does not push history. There is no `/tasks/:id/full` route.

3. **Nested routes under `/tasks` with `<Outlet>`.** The three sibling routes become a parent
   `TasksSplitView` route that owns the table and renders the detail via `<Outlet />`:

   ```
   { path: 'tasks', element: <TasksSplitView />, children: [
       { path: 'new', element: <TaskSurface mode="create" /> },
       { path: ':taskId', element: <TaskSurface mode="view" /> },
   ] },
   ```

   `/tasks` (no child matched) renders the table full-width (`.split.nodrawer`); a matched child renders
   the drawer over the persistent table. We choose nested routes over a search-param (`?task=`) because
   `/tasks/:id` stays the **canonical, unchanged deep-link path** every existing caller already uses
   (My Week, Daily Log), so no caller changes and the URL contract is preserved verbatim.

4. **Responsive modal/non-modal regime is part of the contract.** The same `TaskSurface` is **non-modal**
   in the ≥1100px split (no scrim, no focus trap — the table stays live for triage) and **modal**
   (`role="dialog"` + `aria-modal` + focus trap + scrim + Esc) in the 920–1100px overlay fallback and
   the <768px mobile full-screen. Deep-linking to `/tasks/:id` on a phone therefore resolves to a
   full-screen modal surface; on a wide desktop, to the non-modal split. Same URL, regime chosen by
   viewport.

5. **Deep-link contract is stable at the URL level.** My Week task rows and the Daily Log linked-task
   ref keep linking to `/tasks/:id` unchanged (OD-P3-2). Only what `/tasks/:id` *renders* changes. No
   caller of `/tasks/:id` or `/tasks/new` is modified by this work.

## Alternatives considered

- **Keep three full-page sibling routes (status quo).** Rejected: cannot satisfy OD-P3-2's
  table-persists-during-triage requirement — the list unmounts on every open. This is the model the
  redesign replaces.
- **Two separate editors (full-page detail + a distinct drawer editor).** Rejected: re-creates the
  Lens-C "two homes per entity" trap (`docs/jtbd.md`) — divergent behavior, double the maintenance,
  double the test surface, and exactly what OD-P3-2's "one UI, two widths / no second editor" forbids.
- **Overlay-only drawer (a modal dialog over the table at all widths, with a scrim).** Rejected for the
  ≥1100px default: a scrim makes the table inert, killing the continue-triage-with-drawer-open win that
  is the load-bearing difference from a modal (OD-P3-2, Gmail/Linear/Outlook convention). Overlay is
  kept *only* as the narrow-laptop fallback (decision 4).
- **Search-param state (`/tasks?task=:id`) instead of nested routes.** Rejected: would change the
  canonical deep-link path and break the existing `/tasks/:id` links from My Week + Daily Log (they'd
  need rewriting), for no benefit over nested routes + `<Outlet>`.

## Consequences

- **Positive — single source of truth for the task surface.** One `TaskSurface` renders the drawer, the
  expanded focus mode, the mobile full-screen, and create — eliminating the two-editor divergence. All
  `lib/db/tasks.ts` mutations are called from exactly one place.
- **Positive — zero backend churn.** No migration, RLS, grant, or data-layer signature change; the
  security/RLS surface proven in the P2-1 pgTAP suite is untouched, so pgTAP does not change (the
  permission *oracle* `canEdit`/`canArchive` in the client also stays — it still mirrors
  `mos.can_edit_task`).
- **Positive — deep-link contract preserved verbatim.** `/tasks/:id` and `/tasks/new` keep their exact
  paths; no caller (My Week, Daily Log) changes.
- **Negative / accepted — the `TaskDetail.tsx` (844-line) refactor is the central risk.** Extracting six
  sub-components (StatusTrigger, ConfirmArchive, PersonPicker, RaciCard, ChecklistCard, ActivityCard)
  and the optimistic-write handlers into `TaskSurface` is a **behavior-preserving** refactor. Mitigation:
  the existing `TaskDetail.test.tsx` AC-070..075 suite is the behavior oracle — it must stay green
  (re-pointed at `TaskSurface`/the host) at every step, and the refactor lands incrementally
  (extract → recompose → re-host) so a regression is caught at the smallest possible diff.
- **Negative / accepted — dual focus behavior in one component.** `TaskSurface` switches between
  non-modal (no trap) and modal (trap + Esc) on the viewport threshold. This is a known build-time
  correctness gap DESIGN.md already flags for overlays; it is specified explicitly in the plan
  (§5.1 of the design-plan) and proven by both a non-modal and a modal test.
- **Negative / accepted — a third visual regime (920–1100px overlay) not in the picked mockup.** It
  reuses existing tokens (standard scrim + `card`/`border` sheet), so no new identity; flagged for a
  design-review render check (design-plan Q4).
- **Watch — virtualization vs keyboard cursor.** Virtualizing the table at 50+ rows (OD-P3-4) must
  preserve the `j/k` cursor and `aria-sort`. The library choice (design-plan Q2) is an implementer call;
  if windowing fights the cursor, ship the cursor + sort correctness first and virtualization second
  (it is a perf optimization, not a behavior requirement).

## Reversibility / migration note

- **Routing is trivially reversible.** The nested-route shape is a `router.tsx` edit; reverting to three
  sibling routes is a code change with no data or URL implication (the URLs are identical either way).
- **No data migration exists** — nothing in the database changes, so there is nothing to roll back at the
  DB layer. This ADR records a UI/routing decision, not a schema one.
- **`TaskSurface` is additive then subtractive.** It is introduced alongside the existing pages, the
  pages are re-hosted onto it, and the now-empty `TaskCreate.tsx` / `TaskDetail.tsx` bodies are reduced
  last — so at every commit the app is shippable and the AC suite is green.
