# Tasks / Signals collection grammar parity matrix

**Audit baseline:** 2026-07-22 local `v3/table-parity` lane, before the convergence edits in this
worktree. **Authority:** E7 table styling, with the signed task title/subline anatomy as the salvage
reference; typed Task and Signal fields remain distinct (Rules 2, 9, and 11).

This matrix audits the grammar, not whether a Task and Signal expose identical domain columns. A
shared axis means the user learns one collection behavior and visual measure; domain-specific fields,
actions, and responsive priority choices remain typed.

| Grammar axis | Tasks implementation (file:line) | Signals implementation (file:line) | Baseline verdict | Audit note / intended disposition |
|---|---|---|---|---|
| Title + metadata cell anatomy | `tasks/task-row.tsx:91-110`; `tasks/TasksWorkspace.css:303-313` | `signals/signal-table-presentation.tsx:48-64`; `signals/signal-table-presentation.css:41-55` | **DIVERGENT-SAFE-TO-FIX** | Signals has a primary message plus author/category subline. Tasks has a primary title only. Add the same E7 title/meta hierarchy while keeping Task ownership fields typed. |
| Group header rows | `tasks/group-header-row.tsx:101-145`; `tasks/TasksWorkspace.css:464-492` | `dashboard/data-table.tsx:230-246`; `dashboard/data-table.css:213-272` (consumed by `signals/signal-table-presentation.tsx:89-119`) | **DIVERGENT-SAFE-TO-FIX** | Both have caret → label → count, but the caret, label scale, and shared row measure differ. Align the shared visual anatomy; Task-only overdue/create actions remain typed. |
| Sort affordance (header click + View-options Sort) | Header buttons: `tasks/tasks-table-body.tsx:216-241`; View-options field: `tasks/tasks-toolbar.tsx:100-175` | Header buttons: `signals/signal-table-presentation.tsx:71-116`; View-options field: `pages/signals-archive-page.tsx:229-243` | **DIVERGENT-SAFE-TO-FIX** | Both paths update URL-owned typed sort state, but Tasks renders inline arrows and Signals uses a CSS triangle. Use one inline direction treatment; preserve each collection's sortable fields. |
| Row open / Back / focus-return | `tasks/task-row.tsx:59-87`; host opener `tasks/tasks-workspace.tsx:176-210` | `signals/signal-table-presentation.tsx:49-62`; host/query seam `pages/signals-archive-page.tsx:63-72,303-315` | **CONVERGED** | Both use the injected opener and production `OverlayHost`; the shared host owns Close/Escape/Back and opener focus return. Task and Signal routes remain typed. |
| Loading / empty / error / filtered-empty states | Shared surface `record-collection/record-collection.tsx:47-108`, consumed by `tasks/tasks-workspace.tsx:352-380` | Shared surface `record-collection/record-collection.tsx:47-108`, consumed by `pages/signals-archive-page.tsx:299-309` | **CONVERGED** | Runtime state order and `LoadingShell` / `ErrorState` / `EmptyState` ownership are shared. The legacy direct `TasksTableBody` state branches are not the live surface path. |
| Selection / bulk capability honesty | Descriptor advertises selection `tasks/task-collection-adapter.tsx:617-625`; row checkbox/select-all UI `tasks/task-row.tsx:37-49`, `tasks/tasks-table-body.tsx:204-214` | Descriptor explicitly disables selection and bulk actions `signals/signal-collection-adapter.tsx:439-447`; table has no selection column `signals/signal-table-presentation.tsx:36-88` | **DIVERGENT-NEEDS-DECISION** | Signals is honest. Tasks exposes local selection scaffolding but no collection bulk action. Owner must decide whether Task selection is a real first-class capability now or should be removed until bulk actions exist. |
| Mobile card anatomy | `tasks/mobile-grouped-cards.tsx:97-165`; `tasks/TasksWorkspace.css:366-405` | Shared DataTable phone card `dashboard/data-table.tsx:394-419`; `dashboard/data-table.css:125-170` | **DIVERGENT-SAFE-TO-FIX** | Both lead with a title and typed metadata, but Task cards use a bespoke padding/type rhythm and Signal cards use the generic DataTable rhythm. Align the shared card shell/title/detail measure without erasing typed fields or opener controls. |
| Density (row height, padding, font sizes) | `tasks/TasksWorkspace.css:240-252,303-313`; `tasks/tasks-table-body.tsx:204-214` | `record-collection/record-collection.css:32-71`; `dashboard/data-table.css:73-92` | **DIVERGENT-SAFE-TO-FIX** | Both target a 52px E7 row, but Task/Signal declarations compete and Signal's generic table starts at 13px while Task identity is 15.5px. Centralize the collection table/card measure and typography; domain emphasis may remain. |
| Column-priority responsive tiers | `tasks/TasksWorkspace.css:190-214` — Task identity, Status, PIC, Due survive; Supervisor yields at ≤1120px | `signals/signal-table-presentation.css:8-25` — Message identity, Team, Occurred, Attention survive with a wider timestamp tier | **CONVERGED** | The columns are intentionally typed, not copied. Both use a flexible primary identity column, preserve decision columns at the proven 1280/1024 widths, and reflow to cards on phone; no field is silently relabelled as the other domain. |

## Final disposition

The implementation pass should move every safe-to-fix row to **CONVERGED**. The selection row is the
only deliberate owner decision and must not be “fixed” by silently changing product capability.

- Baseline: **3 CONVERGED / 5 DIVERGENT-SAFE-TO-FIX / 1 DIVERGENT-NEEDS-DECISION**.
- Final target after this lane: **8 CONVERGED / 0 unresolved safe divergences / 1
  DIVERGENT-NEEDS-DECISION**.

The five converged-by-code rows should cite their focused goal-level tests in the review ledger when
this lane is accepted. No CSS-token string-presence test is evidence of parity.
