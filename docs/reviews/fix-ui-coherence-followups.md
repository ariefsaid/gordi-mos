# Review battery — `fix/ui-coherence-followups`

Branch off `dev`. Completes the UI-coherence + deputy-battery work per
[docs/plans/2026-07-07-coherence-completion.md](../plans/2026-07-07-coherence-completion.md), plus the D7
language-bleed fix and the independent validation of the prior merged branch. Director-orchestrated (pi
glm-5.2/4.7, backgrounded), **every wave Director-verified** (typecheck + lint + FULL `npx vitest run` +
build; rendered spot-check of the flagship port). No auth/RLS/schema/migration path changed.

## Scope (11 commits)
- `1e14c55` D7 language bleed → i18n (Kitchen Stock headers, Weekly placeholder).
- `585f67b` fix the 48-test regression D7 caused (I18nProvider harness gaps; caught by the full suite).
- `4fc0b3b` Director independent validation of the previously-merged `feat/ui-coherence` (see that ledger).
- `96dc9db` **W1.1** DataTable row grouping (`groups?`, collapsible headers, phone section labels; later
  extended with `hint?` and `headerActions?`). Flat-mode unchanged.
- `1fc4e5e` **W1.2** Kitchen Plan + Pesanan → shared grouped DataTable (retired their kt-table components).
- `e2df850` **W2.1** deputy widgets render as real primitives (data_insight→KPITile, data_chart→ChartFrame
  with token SVG bar + a11y table fallback), fail-closed.
- `a98f179` **W1.3** Kitchen Log → shared DataTable (Planned/Off-plan groups, stepper render-cells).
- `8d65e54` **W1.4/W1.5** Kitchen Review → shared DataTable (`headerActions` slot for bulk-approve/gate);
  **retired the entire kt-table grammar** (kitchen-group-header + kitchen-table.css + review table/cards/row,
  14 files). **All 5 kitchen screens now use the ONE shared DataTable.**
- `912fdb1` **W2.2** deputy agent EMITS insight/chart widgets (query_entity `as` enum + builders + prompt),
  fail-closed; `deno check` clean.

## Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — completes plan §W1.1–W1.5 + W2.1–W2.2 + D7; no scope creep; behavior invariants preserved
  (kitchen submit payloads, gating AC-020/021/022/030/040/041/042, follow-up money-path untouched here).
- code-quality: SHIP — one shared table primitive replaces the private kt-table grammar; grouping extensions
  (`hint`/`headerActions`) are additive + backward-compatible; deputy builders are pure + fail-closed; Director
  fixed defects glm's targeted-verify missed (matchMedia mock typecheck error; 2 prompt/schema tests; the D7
  regression). Verified: `npm run typecheck`, `npm run lint --max-warnings=0`, full `npm test`
  (233 files / 2297 tests), `npm run build`, `deno check` on the edge handler.
- design: SHIP — rendered spot-check (Director, dev build): Kitchen Log renders through the shared DataTable
  with KPI tiles, Production/Transfer seg, the tokened Select, the collapsible "Planned today" group header,
  stepper cells, and status pills — visually identical in function to the pre-port bespoke table, now unified.
  Kitchen rail nesting + 3-level breadcrumb + neutral header deputy launcher (no orange FAB) all present.
- security: PASS — no auth/RLS/schema/migration changed. W2.2 changes only the post-read widget *presentation*
  (builders run on the already-RLS-scoped query_entity result; dispatch is fail-closed; unknown `as` → table).
  Deputy markdown/widget fail-closed validation (from the prior branch) intact.

## Outstanding (not blockers for this branch)
- A real `dev`→`main` battery is still owed for any main promotion (task #16 F) — this ledger is branch-scoped.
- `id` locale leaves `kitchen.stock.col.dish` = `Dish` (trivial translation follow-up).
