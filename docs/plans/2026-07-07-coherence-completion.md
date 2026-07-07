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

## Progress
- [ ] W1.1 DataTable grouping
- [ ] W1.2 Kitchen Plan · [ ] W1.3 Kitchen Log · [ ] W1.4 Review+Pesanan · [ ] W1.5 retire kt-table
- [ ] W2.1 widget slot → primitives · [ ] W2.2 agent emits insight/chart
