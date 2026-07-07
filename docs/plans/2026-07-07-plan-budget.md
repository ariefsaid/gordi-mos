# Plan — Plan destination: budget/COGS + certified-metric registry + pricing pre-flight

- Spec: `docs/specs/plan-budget.spec.md` — **SIGNED (Accepted, 2026-07-07)**. Build to the spec.
- ADRs: ADR-0022 (the model) · ADR-0019 D7/D14-step-5 (Plan/reference data) · ADR-0010 (OLTP/OLAP split —
  `last_hpp` crosses as a curated snapshot) · ADR-0020 (`can()` — `cogs.write` first consumer here).
- Scope: a **read-and-budget** Plan surface (capture + pre-flight) over seeded reporting read-models, a
  migration-seeded certified-metric registry, fail-loud freshness, and the nav wiring — all behind
  `SHOW_PLAN_BUDGET` (default false). No product code is written by re-deriving; tasks below are the exact
  code the implementer writes.

## 0. Verified premises (read before T1)

- **`reporting` is in PostgREST `api.schemas`** (`supabase/config.toml` line 14) and `mos` is too. The
  Supabase client reads `reporting` via `supabase.schema('reporting')` and `mos` via `supabase.schema('mos')`
  (mirrors `lib/db/reporting.ts` + `lib/db/tasks.ts`).
- **`reporting_writer` role exists** (`20260704000001`) with `usage on schema reporting`. The new reporting
  read-models mirror the `sales_margin_daily` grant pattern: `authenticated` SELECT (finance/admin via RLS),
  `reporting_writer` FOR-ALL bypass, `service_role` full.
- **`shared.can(capability)`** (`20260708000001`) resolves from `current_access_roles()` (JWT, unspoofable),
  SECURITY INVOKER, `set search_path=''`. This slice adds the `cogs.write` capability + seeds it to
  `finance` + `admin` (the Budget capturers). `cogs.read` broadening to consumers is a future slice.
- **Audit + org_id pattern** (from `mos.tasks`): `org_id uuid not null references shared.orgs default
  shared.current_org_id()`, `created_by uuid not null references shared.people`, `created_at`/`updated_at`
  default now(), `archived_at timestamptz`, + `shared.set_updated_at()` trigger.
- **No cross-schema FK embed** (PGRST200): the cost line is resolved client-side by `ingredient_esb_code`
  join, never via a PostgREST FK-embed. The "link" is a stable natural key (esb code), not a uuid FK (the
  reporting snapshot table has no stable uuid the mos row can FK to — snapshot-upserted by composite key).
- **pgTAP style** (from `61`/`72`): `begin; … select plan(n); … fixtures as service_role … set local role
  authenticated; set local request.jwt.claims='{…,"access_roles":[…]}'; … throws_ok/lives_ok/is … reset role;
  select * from finish(); rollback;`.

## 1. Design decisions (the critical points)

### 1.1 Two-layer model: reporting value-sources + mos captured records (link-never-copy)

- **Value-source read-models (reporting, snapshot-fed, seeded):**
  - `reporting.ingredient_cost_lines` — PK `(org_id, ingredient_esb_code)`; cols `name`, `unit_cost`
    (the `last_hpp` value), `unit`, `as_of` (when last_hpp was taken), `loaded_at`. Upserted by the future
    snapshot job; seeded representative rows here.
  - `reporting.bom_lines` — PK `(org_id, menu_item_esb_code, ingredient_esb_code)`; cols `recipe_qty`,
    `qty_unit`, `as_of`. ESB owns recipes; MOS reads. Seeded representative rows.
- **MOS-owned captured records (mos, capability-gated):**
  - `mos.certified_metrics` — `(org_id, key) PK`, `name/meaning/unit/grain`, `certified boolean default true`,
    `certified_at/by`. Migration/seed-owned (`cogs.budgeted`, `margin.gross_pct`). No runtime CRUD.
  - `mos.budgets` — `id uuid PK`, `org_id`, `menu_item_esb_code`, `menu_item_name`, `scenario_label`,
    `scenario_type` (baseline/promo/new_branch/menu), `owning_bu_id` (FK business_units),
    `total_budgeted_cogs` (captured), `cost_basis_as_of`, `certified_metric_key` (default 'cogs.budgeted'),
    `status` (draft/active), audit + `archived_at`.
  - `mos.budget_lines` — `id`, `budget_id` (FK budgets cascade), `ingredient_esb_code`, `recipe_qty`,
    `qty_unit`. **NO unit-cost column** — the cost is resolved by joining the linked cost line (A5).
- **Link integrity (A5):** the budget_line → cost-line link is by `ingredient_esb_code` (stable natural key).
  pgTAP proves there is no unit-cost column AND that a budget_line's code resolves to a real cost line.

### 1.2 RLS + capability model

- `reporting.ingredient_cost_lines` + `reporting.bom_lines`: SELECT finance/admin (org-scoped),
  `reporting_writer` FOR-ALL bypass, authenticated no write — clones `sales_margin_daily` policy verbatim.
- `mos.certified_metrics`: SELECT finance/admin (org-scoped); **no insert/update/delete policy + no grant →
  service_role only** (migration-seeded; same discipline as `shared.role_capabilities`).
- `mos.budgets` + `mos.budget_lines`: SELECT finance/admin (org-scoped); INSERT/UPDATE `can('cogs.write')`
  + org seam; no DELETE (soft-archive on budgets). `cogs.write` seeded to `finance` + `admin`.

### 1.3 Reuse map (wire, do not rebuild)

| Reuse target | Import | How |
|---|---|---|
| `supabase` client | `@/lib/supabase` | `.schema('reporting')` + `.schema('mos')` |
| `PageFrame`/`PageHead`/`useDocumentTitle`/`useIsDesktop` | `@/shell/*` | full-bleed data surface |
| `EmptyState`/`ErrorState`/`SkeletonRows` | `@/components/ui/state-kit` | loading/empty/error |
| `FreshnessLabel` | `@/components/dashboard/freshness-label` | cost-line as-of label |
| `RequireAccessRole` + `Navigate` (flag) | `@/auth/*` + router | finance/admin gate + flag-off redirect |
| `useT` + `messages` | `@/i18n/*` | bilingual strings |
| `shared.can()` + `role_capabilities` seed | `20260708000001` | `cogs.write` capability |

## 2. Tasks (exact code; TDD red→green)

### Phase A — migrations (reversible; numbered `20260710000001`+, NOT 20260709)

- **A1 `20260710000001_plan_cogs_readmodels.sql`** — `reporting.ingredient_cost_lines` +
  `reporting.bom_lines` (tables + indexes + RLS finance/admin SELECT + reporting_writer FOR-ALL + grants)
  + seed representative rows (guarded by Gordi org existence, like `20260705000002` — dev-real data).
- **A2 `20260710000002_mos_certified_metrics.sql`** — `mos.certified_metrics` (table + RLS finance/admin
  SELECT, no write grant) + seed `cogs.budgeted` + `margin.gross_pct` (certified=true).
- **A3 `20260710000003_mos_budgets.sql`** — `mos.budgets` + `mos.budget_lines` (tables + indexes + triggers)
  + RLS (SELECT finance/admin; INSERT/UPDATE `can('cogs.write')` + org seam; no DELETE) + the
  `cogs.write` capability seed (`finance`, `admin`) into `shared.role_capabilities`.

### Phase B — data layer + pure logic (unit-tested)

- **B1 `lib/db/plan-budget.ts`** — `listIngredientCostLines()`, `listBomLines()`, `listBudgets()`,
  `captureBudget(input)` (insert budget + lines, no unit cost), `getCertifiedMetric(key)`. All via
  `supabase.schema('reporting'|'mos')`; never sends `org_id`; throws non-secret on error.
- **B2 `lib/plan-budget-logic.ts`** — pure: `STALENESS_DAYS = 30`, `MARGIN_FLOOR_PCT = 0.30`,
  `computeBudgetedCogs(bom, costs)` (Σ qty×cost; missing cost → `{ total: null, complete: false }`),
  `projectMargin(price, cogs)` (margin + marginPct), `assessCostStatus({asOf, basisAsOf, certified})`
  → `{ stale: boolean, uncertified: boolean, fresh: boolean }`, `formatIDR(n)`.

### Phase C — UI (RTL-tested)

- **C1 `components/plan/fail-loud-badge.tsx`** — the fail-loud badge (stale / uncertified / fresh). `role=status`.
- **C2 `pages/budget-page.tsx` + `.css`** — read BOM + cost lines → budgeted-COGS preview; scenario list;
  capture form (scenario label/type/owning BU); drill to linked cost line; fail-loud badge on stale/uncertified.
- **C3 `pages/pricing-page.tsx`** — pick a budget + candidate price → margin + margin-% + floor warning +
  fail-loud freshness/certification warning. Read-only (no price write).

### Phase D — wiring

- **D1 `config/features.ts`** — `export const SHOW_PLAN_BUDGET = false`.
- **D2 `shell/icons.tsx`** — `BudgetIcon` + `PricingIcon`.
- **D3 `i18n/messages.ts`** — `nav.planBudget` / `nav.planPricing` + page strings (en + id).
- **D4 `shell/destinations.tsx`** — Plan destination: add Budget + Pricing links when `SHOW_PLAN_BUDGET`.
- **D5 `router.tsx`** — `/plan/budget` + `/plan/pricing` behind `RequireAccessRole(['finance','admin'])`,
  flag-off → `<Navigate to="/" />`.

### Phase E — tests

- **E1 unit** `lib/plan-budget-logic.test.ts` (AC-PB-004/005/006), `pages/budget-page.test.tsx`
  (AC-PB-007/008), `pages/pricing-page.test.tsx` (AC-PB-005/006), `lib/db/plan-budget.test.ts`
  (AC-PB-003 — schema usage, mocked).
- **E2 pgTAP** `74_plan_cogs_readmodels_rls.sql` (AC-PB-009 reporting RLS), `75_mos_certified_metrics_rls.sql`
  (AC-PB-011), `76_mos_budgets_rls_link.sql` (AC-PB-009/010 budgets RLS + link integrity).
- **E3 e2e** `AC-PB-012-budget-pricing-preflight.spec.ts` (AC-PB-012 — capture → margin + freshness warning;
  mocked network, deterministic, the sales-e2e precedent). Authored runnable when `SHOW_PLAN_BUDGET=true`.

### Phase F — gates + report

- `npm run typecheck` (0) · `npm run lint` (0) · `npm test -- --run` (green) · `cd supabase && supabase db test`
  (green). De-reference firewall (no `any`-abuse, no dead `import type`). Report the exact gate output.

## 3. Verify map (AC → owning test)

| AC | Layer | Test file | Title contains |
|---|---|---|---|
| AC-PB-001 | route/unit | router.test.tsx (extend) or budget-page | flag-off redirect |
| AC-PB-002 | route/unit | router.test.tsx / require-access-role | finance/admin gate |
| AC-PB-003 | data/unit | lib/db/plan-budget.test.ts | reporting schema used |
| AC-PB-004 | logic/unit | plan-budget-logic.test.ts | budgeted COGS = Σ qty×cost |
| AC-PB-005 | logic/unit | plan-budget-logic.test.ts | margin read-only |
| AC-PB-006 | logic/unit | plan-budget-logic.test.ts | fail-loud stale/uncertified |
| AC-PB-007 | render/unit | budget-page.test.tsx | drill links cost line |
| AC-PB-008 | render/unit | budget-page.test.tsx | capture writes linked shape |
| AC-PB-009 | pgTAP | 74 + 76 | RLS non-owner can't write |
| AC-PB-010 | pgTAP | 76 | link integrity no copied cost |
| AC-PB-011 | pgTAP | 75 | registry seeded, no runtime write |
| AC-PB-012 | e2e | AC-PB-012-…spec.ts | capture → margin + warning |
