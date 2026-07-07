# UI coherence completion + deputy battery — build plan (2026-07-07)

Owner directive: "if not fit, scrap it and make it better — complete the FULL implementation for both the
UI coherence and the deputy battery." No deferrals. Branch: `fix/ui-coherence-followups` (off `dev`).
Delegation: pi glm-5.2 (hard) / glm-4.7 (mechanical); Director verifies every wave (typecheck+lint+tests),
commits per wave. Basis: [ui-coherence-audit](../reviews/ui-coherence-audit-2026-07-07.md) §F item 3 +
[feat-ui-coherence ledger](../reviews/feat-ui-coherence.md) Director-validation corrections.

## Problem restatement
The partial retrofit unified read tables (Follow-ups, Sales, Kitchen Stock/Pushes) onto the shared
`DataTable` but left Kitchen **Log / Plan / Review / Pesanan** on the private `kt-table` grammar — so
Kitchen now spans TWO table systems. The shared `DataTable` supports custom-render (editable) cells +
`rowClassName` + sort + footer, but has **no row grouping**, which those tables need. Deputy widgets
render thinly (chart → plain table; insight → bespoke div) instead of the ported `ChartFrame`/`KPITile`.

## Workstream 1 — ONE table grammar app-wide
- **W1.1 — DataTable grouping** (glm-5.2). Add optional `groups?: DataTableGroup<Row>[]`
  (`{key, label: string|null, count?, rows}`); `label:null` = inline bucket, no header. Collapsible
  group-header rows (internal collapse state, all-expanded default) per DESIGN.md §"Group header row"
  (hairline, SVG chevron — NOT ▸▾ glyphs per RI-IXD-1, navy-700 label, muted tabular count). Phone: group
  label as a section heading above its cards. Flat mode (`rows`) unchanged. Tests: grouped desktop+phone,
  collapse toggle, null-bucket passthrough, flat-mode regression.
- **W1.2 — Port Kitchen Plan** (glm-5.2) → DataTable groups(category) + `PlanQtyCell` render cell, keep
  `KitchenToolbar`. Preserve search/category filter, save, saving/disabled, empty-filter. Green existing tests.
- **W1.3 — Port Kitchen Log** (glm-5.2) → DataTable groups(Planned today/Off-plan) + WIP stepper cell +
  submit/footer. Preserve KPIs, seg toolbar, dirty/error, the B3 footer fix.
- **W1.4 — Port Kitchen Review + Pesanan** (glm-5.2) → DataTable + approve-button / order cells.
- **W1.5 — Retire `kt-table` grammar** + extend `RI-IXD-8` to require ALL kitchen tables import DataTable
  (glm-4.7). Full `npm test` + build green.

## Workstream 2 — deputy battery renders as real visualizations
- **W2.1 — Wire AssistantWidgetSlot to ported primitives** (glm-4.7): `data_insight` → `KPITile`;
  `data_chart` → `ChartFrame` with a minimal inline-SVG bar body + the existing table as `tableFallback`;
  `data_table` stays `DataTable`. Update AssistantPanel/widget tests. Keep fail-closed validation.
- **W2.2 — Agent emits richer widgets** (glm-5.2): add `buildInsightWidgetFromQueryResult` (single scalar)
  + `buildChartWidgetFromQueryResult` (2-col series) in `lib/agent/widgets.ts`; teach the query_entity
  `as` param `insight|chart|table` + the agent prompt to pick one. Unit-test each builder incl fail-closed.

## Gate
Per wave: `npm run typecheck`, `npm run lint -- --max-warnings=0`, the wave's tests. End: full `npm test` +
`npm run build`, rendered spot-check (Kitchen Log/Plan on shared table; deputy chart/insight), update the
ledger with a REAL battery. Then offer `fix/ui-coherence-followups` → dev.

## Progress (branch `fix/ui-coherence-followups`, off `dev`)
- [x] **W1.1 DataTable grouping** — `96dc9db`. `groups?` API, collapsible headers, phone section labels, flat-mode unchanged. 34 tests.
- [x] **W1.2 Kitchen Plan + Pesanan port** — `1fc4e5e`. Both faces on the shared grouped DataTable; retired kitchen-plan/pesanan table+cards. Behavior preserved (AC-024, FR-030/031, states). Full suite green.
- [x] **W1.3 Kitchen Log port** — `a98f179`. Was mis-diagnosed as "glm can't converge"; the real cause was the **10-min foreground `Bash` cap clipping pi mid-work** (glm-5.2 naming/API are fine). Re-run **backgrounded** (no clip) → glm-5.2 converged AND self-fixed the earlier duplicate-name bug (added `wip-item-stepper` `hideName?`). Full suite green.
- [x] **W1.4 Kitchen Review port** — `8d65e54`. Extended `DataTableGroup` with a `headerActions?` slot to carry the per-group bulk "Approve all" button + transfer gate; per-row approve/reject via the Decision column render. Behavior preserved (AC-040/041/042, approve payload, productionPending gate).
- [x] **W1.5 retire kt-table grammar** — `8d65e54`. Deleted `kitchen-group-header` + `kitchen-table.css` + the review table/cards/row (14 files). **All 5 kitchen screens now use the ONE shared DataTable; `kt-table` is gone.**
- [x] **W2.1 deputy widget slot → real primitives** — `e2df850`. data_insight→KPITile, data_chart→ChartFrame(SVG bar + table fallback), fail-closed.
- [~] **W2.2 agent EMITS insight/chart widgets** — IN PROGRESS (backgrounded glm-5.2 `btqi4puza`). Adds `buildInsight`/`buildChartWidgetFromQueryResult` to the shared `widgets.ts` + the query_entity `as` enum (handler + schema) + a prompt line. Rendering (W2.1) already done.

## Delegation lesson (durable — see memory [[pi-long-dispatch-timeout]])
The "glm-5.2 can't converge" reads were WRONG — the foreground `Bash` 10-min cap was killing pi mid-work.
glm-5.2 naming/API verified fine (real `zai/glm-5.2`, 1M ctx, 3.4s ping). Fix: **background long pi dispatches**
(`run_in_background`) so they run to completion; keep glm's verify scope to FAST targeted checks (Director runs
the full suite). ⚠️ ALWAYS run the FULL `npx vitest run` after any cross-cutting change (a D7 i18n edit silently
broke 48 tests in 3 files — caught only by the full suite; `tsc` also caught a mock-cast error vitest missed).
