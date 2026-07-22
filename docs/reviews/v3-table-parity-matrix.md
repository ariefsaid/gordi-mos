# Tasks / Signals collection grammar parity matrix

**Audit:** 2026-07-22 local `v3/table-parity` lane. **Authority:** E7 table styling, with the
signed Task title/subline anatomy as the salvage reference; typed Task and Signal fields remain
distinct (Rules 2, 9, and 11).

This matrix audits the table/card grammar, not whether a Task and Signal expose identical domain
columns. A shared axis means the user learns one collection behavior and visual measure; domain-specific
fields and actions remain typed.

| Grammar axis | Tasks implementation (file:line) | Signals implementation (file:line) | Final verdict | Evidence / disposition |
|---|---|---|---|---|
| Title + metadata cell anatomy | `tasks/task-row.tsx:98-115`; shared selectors `components/collection-grammar.css:26-54` | `signals/signal-table-presentation.tsx:49-58`; shared selectors `components/collection-grammar.css:26-54` | **CONVERGED** | Both use one primary title plus a muted metadata subline. Tasks supplies typed Business Unit metadata; Signals supplies author/category. Goal proof: `tasks/task-row.test.tsx` and `signals/signal-table-presentation.test.tsx`. |
| Group header rows | `tasks/group-header-row.tsx:101-137`; shared rhythm `components/collection-grammar.css:100-154` | `dashboard/data-table.tsx:230-246` consumed by `signals/signal-table-presentation.tsx:99-120`; shared scoped rhythm `components/collection-grammar.css:100-154` | **CONVERGED** | Both expose caret → label → count with the same 38px E7 rhythm, 24px toggle, 15px/700 label, and 12px muted count. Task-only overdue/create controls remain typed additions. Goal proof: `tasks/group-header-row.test.tsx` and the Signal grouping test. |
| Sort affordance (header click + View-options Sort) | Header buttons `tasks/tasks-table-body.tsx:216-241`, direction span `tasks/task-collection-presentation.tsx:408-412`; View-options field `tasks/tasks-toolbar.tsx:100-175` | Header buttons `signals/signal-table-presentation.tsx:71-116`; arrow treatment `components/collection-grammar.css:65-96`; View-options field `pages/signals-archive-page.tsx:229-243` | **CONVERGED** | Both use native keyboard buttons + `aria-sort`, and both expose typed Sort in the shared View-options toolbar. Active directions now read as the same inline ↑/↓ affordance; sortable fields remain domain-specific. Existing Task and Signal header-sort journeys prove behavior. |
| Row open / Back / focus-return | `tasks/task-row.tsx:59-87`; host opener `tasks/tasks-workspace.tsx:176-210` | `signals/signal-table-presentation.tsx:49-62`; host/query seam `pages/signals-archive-page.tsx:63-72,299-315` | **CONVERGED** | Both use the injected opener and production `OverlayHost`; the shared host owns Close/Escape/Back and opener focus return. Task and Signal routes remain typed. |
| Loading / empty / error / filtered-empty states | Shared surface `record-collection/record-collection.tsx:47-108`, consumed at `tasks/tasks-workspace.tsx:352-380` | The same shared surface `record-collection/record-collection.tsx:47-108`, consumed at `pages/signals-archive-page.tsx:299-309` | **CONVERGED** | Runtime state order and `LoadingShell` / `ErrorState` / `EmptyState` ownership are shared. The legacy direct `TasksTableBody` branches are not the live surface path. |
| Selection / bulk capability honesty | Selection is advertised by `tasks/task-collection-adapter.tsx:617-625` and rendered by `tasks/tasks-table-body.tsx:204-214` / `tasks/task-row.tsx:37-49`; no bulk action is supplied | Selection and bulk actions are explicitly false/empty at `signals/signal-collection-adapter.tsx:439-447`; no selection column in `signals/signal-table-presentation.tsx:36-88` | **DIVERGENT-NEEDS-DECISION** | Signals is honest. Tasks still has local selection scaffolding but no collection bulk action. This lane does not silently remove a deliberate Task affordance. |
| Mobile card anatomy | `tasks/mobile-grouped-cards.tsx:111-165`; shared card/title/detail selectors `components/collection-grammar.css:156-188` | Table phone card is `dashboard/data-table.tsx:394-419` under `signals/signal-table-presentation.tsx:99-120`; shared scoped card selectors `components/collection-grammar.css:156-188` | **CONVERGED** | Task and Signal table cards now share the same shell, 44px touch floor, padding, title scale, and title/detail hierarchy while retaining typed metadata and opener controls. Signal’s ambient `SignalCard` feed remains a separate, intentionally typed feed family and is not merged into the table renderer in this lane; see the deferred renderer decision below. Goal proof: `tasks/mobile-grouped-cards.test.tsx` and the Signal phone-card test. |
| Density (row height, padding, font sizes) | Priority table widths `tasks/TasksWorkspace.css:190-214`; row hooks `tasks/TasksWorkspace.css:240-252`; shared table measure `components/collection-grammar.css:6-23` | Signal widths `signals/signal-table-presentation.css:10-27`; shared table measure `components/collection-grammar.css:6-23` | **CONVERGED** | Both opt into `collection-grammar-table`; the shared skin owns 14px table type, 38px headers, 52px rows, 12px cell padding, line-height, and divider. Domain emphasis (Task title / Signal message) stays typed. |
| Column-priority responsive tiers | `tasks/TasksWorkspace.css:190-214` — identity, Status, PIC, and Due survive; Supervisor yields at ≤1120px | `signals/signal-table-presentation.css:10-27` — Message identity, Team, Occurred, and Attention survive with a wider timestamp tier | **CONVERGED** | Columns are intentionally typed, not copied. Both use a flexible primary identity column, preserve decision columns at the proven 1280/1024 widths, and reflow to cards on phone; no field is silently relabelled as the other domain. |

## Verdict counts

- **Baseline audit:** 3 already CONVERGED / 5 DIVERGENT-SAFE-TO-FIX / 1
  DIVERGENT-NEEDS-DECISION.
- **Final matrix rows:** **8 CONVERGED / 0 unresolved safe divergences / 1
  DIVERGENT-NEEDS-DECISION**. All five baseline safe divergences were addressed in code: title/meta,
group header, sort, mobile-card shell, and density.

## Deferred owner decisions

These are deliberately not hidden behind a renderer rewrite:

1. **Selection:** Should Tasks keep selection checkboxes/select-all while no bulk action is shipped,
   or should selection wait until a real bulk action exists?
2. **Renderer ownership:** Should the typed Task and Signal renderers eventually be replaced by one
   shared table/card renderer, or should the current shared grammar + typed renderer boundary remain
   the Rule 2/11 pattern? This lane intentionally does not merge the renderers.
