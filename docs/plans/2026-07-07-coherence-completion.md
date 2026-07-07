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
- [ ] **W1.3 Kitchen Log port — BLOCKED.** glm-5.2 failed to converge 3× (no-op timeouts); glm-4.7 produced a port that broke **30 kitchen-log-page tests** with a systematic **"Found multiple elements: <dish name>"** duplicate-render bug (planned/off-plan partition or a double-render — NOT the DataTable call, which looked correct; suspect the group partition `plannedItems`/`offPlanItems` or a name rendered twice per row). **Reverted** to keep the ops-critical capture screen safe. Needs a careful Director-hand port next session (the screen writes real production logs → ESB; do NOT ship a half-verified version).
- [ ] **W1.4 Kitchen Review port** — not started (same DataTable-grouping approach; lower risk than Log).
- [ ] **W1.5 retire kt-table grammar** — blocked on W1.3+W1.4 (Log/Review still use `kt-table`/`kitchen-group-header`).
- [x] **W2.1 deputy widget slot → real primitives** — `e2df850`. data_insight→KPITile, data_chart→ChartFrame(SVG bar + table fallback), fail-closed. Deputy now renders real KPI/chart visualizations.
- [ ] **W2.2 agent EMITS insight/chart widgets** — not started. `lib/agent/widgets.ts` only has `buildDataTableWidgetFromQueryResult`; add `buildInsightWidgetFromQueryResult` (single scalar) + `buildChartWidgetFromQueryResult` (2-col series) + teach the query_entity `as` param + agent prompt to pick insight|chart|table. (W2.1 renders them; the agent just doesn't produce insight/chart yet — so the richer widgets are reachable via replay/history but not yet auto-emitted.)

## Session note (Director, for the next agent)
Verified-good tip = `e2df850`. The two hard Kitchen editable ports (Log, Review) are the only UI-coherence
gap left; glm could not converge on Log — port it by hand, one screen at a time, keeping every existing
kitchen-log-page/kitchen-review-page test green (they encode submit-payload + gating invariants). The grouping
primitive (W1.1) is the enabler and is proven by the Plan port. Deputy: rendering (W2.1) done; emission (W2.2)
is the remaining half. ⚠️ ALWAYS run the FULL `npx vitest run` after any cross-cutting change (a D7 i18n edit
silently broke 48 tests in 3 other files — caught only by the full suite).
