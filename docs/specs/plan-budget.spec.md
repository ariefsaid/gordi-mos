# Spec — Plan destination: budget/COGS capture + certified-metric registry + pricing pre-flight

- Feature: give the **Plan destination** real content — **budget/COGS capture** (read-and-budget),
  a **certified-metric registry** (migration-seeded), **fail-loud freshness**, and a **pricing
  pre-flight margin check**. ADR-0022 (THE authority) + ADR-0019 D7/D14-step-5 + ADR-0010 (OLTP/OLAP)
  + ADR-0020 (`can()`).
- Status: **Accepted** (Director, 2026-07-07 — Issue D build slice). Build to this spec; do not re-open.
- Authority (read fully, conform — do not re-derive):
  - `docs/adr/0022-plan-destination-cogs-budget.md` — the model decisions (D1–D6, esp. D3 read-and-budget,
    D5 margin-check-not-price-setter, D6 ownership+freshness).
  - `CONTEXT.md` — **Budget**, **Ingredient cost line**, **Certified metric**, **Reference data**, **OLTP/OLAP**.
  - `docs/decisions.md` "Continued grill session 2" → **Certified metrics**: Finance certifies ·
    migration-seeded registry, NO runtime CRUD UI · uncertified/stale = fail-loud badge · pricing
    pre-flight warns/blocks.
  - `docs/jtbd.md` §2 Plan rows (Budget creation + Promo/pricing pre-flight) + anchors A5 (link-never-copy)
    + A7 (stale/non-certified COGS pricing).
- Routes: `/mos/plan/budget` (capture) + `/mos/plan/pricing` (pre-flight), both behind feature flag
  `SHOW_PLAN_BUDGET` (default **false**), both finance/admin-gated.

## Overview

Plan becomes a destination with real content. Finance captures a **Budget** (a menu item's BOM costed
at the linked ingredient cost lines → the certified budgeted COGS) as a scenario over the certified
basis; Marketing/BU-head run a **pricing pre-flight** (candidate price × the linked certified budgeted
COGS → projected margin) with a **fail-loud badge** when the cost basis is stale or its metric
definition is uncertified. MOS **reads** ESB's BOM + `last_hpp` and **captures** on top — it does NOT
edit recipes and does NOT write BOMs/prices to ESB (D3/D5). The actual price still lands in ecommerce/POS.

Because the live ESB BOM/`last_hpp` feed is not wired in this environment, the value-source read-models
(`reporting.ingredient_cost_lines`, `reporting.bom_lines`) are seeded with representative rows; the DAL
+ components read them through a normal interface so wiring the real snapshot job is a drop-in, NOT
faked in the component (mirrors the `reporting.sales_*` pattern).

## The model (binding — built exactly)

- **Ingredient cost line** = reference data; value basis = ESB `last_hpp`; **Finance + Procurement own**;
  **visible freshness** (`as_of` + `loaded_at`); consumers **link, never copy** (anchor A5). Delivered
  as a curated snapshot read-model (`reporting.ingredient_cost_lines`) per the OLTP/OLAP split (ADR-0010).
- **Budget** = a MOS-captured budgeted COGS = a menu item's BOM (recipe qty × materials) costed at the
  **linked** ingredient cost lines. One owning BU. Carries a **scenario** (baseline / promo / new-branch
  / menu). Consumers link the same Budget row; the unit cost is always resolved by **joining the linked
  cost line** — a Budget never embeds a copied ingredient unit cost (structural link-not-copy).
- **Certified-metric registry** = `mos.certified_metrics`, a table of blessed metric definitions
  (org-scoped key / name / meaning / unit / grain / `certified`). **Finance certifies**; **migration-seeded**
  (NO runtime CRUD UI — same discipline as `shared.role_capabilities`). A figure whose definition is
  **uncertified** OR whose cost basis is **stale** renders a **fail-loud badge** (anchor A7).
- **Pricing pre-flight** = candidate price/promo × the **linked certified budgeted COGS** → projected
  gross margin + margin-%; a **fail-loud freshness/certification warning** when the cost line's `as_of`
  is old or its metric definition is uncertified. **Read-only** — MOS never writes prices (D5).

## Out of scope

- Recipe editing / ESB BOM write-back (ADR-0022 D4 — one spike-gated v2).
- MOS as price-setter (D5 — price lands in ecommerce/POS).
- The deferred trend / Normal-market-variation alert layer (ADR-0022 D2).
- The uniform activity-log / change-history pattern (ADR-0022 OQ-5 — deferred; this slice commits the
  freshness `as_of` but not full version history).
- Home margin KPI / deputy consumption of budgets (future slice — read broadening to `cogs.read`).
- A live ESB snapshot job (the read-models are seeded; the job is a drop-in).

## Functional requirements (EARS)

- **FR-PB-001: Feature flag, hide-first.** While `SHOW_PLAN_BUDGET` is false, the system shall hide the
  Budget + Pricing nav links and redirect their routes to Home; while true, the system shall render them.
- **FR-PB-002: Finance/admin route gate.** While a user is authenticated, when they navigate to
  `/mos/plan/budget` or `/mos/plan/pricing`, the system shall render the route only for users holding
  `finance` or `admin`; other authenticated users shall be redirected home.
- **FR-PB-003: Read-and-budget basis.** When the Budget capture surface loads, the system shall read the
  BOM (`reporting.bom_lines`) and the ingredient cost lines (`reporting.ingredient_cost_lines`) via the
  Supabase `reporting` schema client and rely on RLS as the security boundary; it shall not edit recipes.
- **FR-PB-004: Link-never-copy.** When a Budget is captured, the system shall store per-ingredient lines
  that reference the ingredient cost line by its stable key (`ingredient_esb_code`) and shall NOT store a
  copied ingredient unit cost; the unit cost shown shall be resolved by joining the linked cost line.
- **FR-PB-005: Budget capture.** When Finance captures a budget scenario, the system shall write a
  `mos.budgets` row (one owning BU, scenario label/type, captured total, cost-basis as-of, certified-metric
  key) and its `mos.budget_lines` (ingredient + recipe qty, no unit cost), gated by `can('cogs.write')`.
- **FR-PB-006: Scenario comparison.** When multiple budget scenarios exist for a menu item, the system
  shall list them side by side so the certified baseline and "what-if" captures compare without forking.
- **FR-PB-007: Drill to the linked cost line.** When a consumer views a budget line, the system shall
  provide a drill to the linked ingredient cost line (its current value + `as_of` + owner), never a copy.
- **FR-PB-008: Certified-metric registry, migration-seeded.** The system shall expose a registry of
  blessed metric definitions seeded by migration; there shall be no runtime create/edit/delete UI for it.
- **FR-PB-009: Fail-loud freshness/certification.** When a budget's cost basis is stale (its linked cost
  line's `as_of` older than the staleness threshold) OR its certified-metric definition is uncertified,
  the system shall render a fail-loud badge and the pricing pre-flight shall warn against pricing on it.
- **FR-PB-010: Pricing pre-flight margin.** When a user enters a candidate price against a linked certified
  budget, the system shall compute projected gross margin and margin-% from the linked budgeted COGS and
  render the result read-only; it shall never write a price.
- **FR-PB-011: No ESB write.** The system shall not write BOMs, recipes, cost lines, or prices to ESB.
- **FR-PB-012: i18n.** Every user-facing string the Budget + Pricing surfaces render shall flow through the
  `messages` catalog in both `en` and `id` (ADR-0021).

## Non-functional requirements

- **Security / RLS:** every new table has RLS enabled + forced, default-deny, with the `org_id` seam.
  Ingredient cost lines + BOM (reporting): finance/admin SELECT (org-scoped); authenticated no write;
  `reporting_writer` FOR-ALL bypass for the future snapshot job. Certified metrics + budgets + budget
  lines (mos): finance/admin SELECT; budget write gated by `can('cogs.write')` (seeded to finance + admin);
  no DELETE (soft-archive on budgets). No service-role key in the browser; caller-JWT only.
- **Link integrity (A5):** `mos.budget_lines` has no unit-cost column; cost is resolved by joining the
  linked `reporting.ingredient_cost_lines` row. Provable in pgTAP.
- **Reversibility:** every migration is additive with a real DOWN; pre-production, `supabase db reset`.
- **Freshness:** every budget + pricing figure is visibly tied to the cost basis `as_of` (ADR-0017 D11).
- **Design:** follow `DESIGN.md` — full-bleed `PageFrame variant="data"`, tabular numbers for all money,
  fail-loud badge in a destructive/warning tint, one subtle rest shadow on cards.
- **Accessibility:** the fail-loud badge uses `role="status"`/`aria-live`; controls are labelled + keyboard
  reachable; the BOM/cost-line drill is a real link.
- **Testing:** each AC id is owned by one test at the lowest sufficient layer, named in the test title.

## Acceptance criteria (Given/When/Then)

- **AC-PB-001 (route/unit): Flag-off hides the surface.** Given `SHOW_PLAN_BUDGET` is false, when an
  authenticated user navigates to `/mos/plan/budget`, then they are redirected to `/`.
- **AC-PB-002 (route/unit): Finance/admin reach the surfaces.** Given an authenticated user holding
  `finance` or `admin`, when they navigate to `/mos/plan/budget` or `/mos/plan/pricing`, then the route
  renders; a `member`-only user is redirected home.
- **AC-PB-003 (data/unit): Reporting read-models are used.** Given the Budget surface loads, when it
  queries Supabase, then it reads `reporting.bom_lines` and `reporting.ingredient_cost_lines` via
  `supabase.schema('reporting')`.
- **AC-PB-004 (logic/unit): Budgeted COGS = BOM × linked cost lines.** Given a menu item's BOM lines and
  the linked ingredient cost lines, when the budgeted COGS is computed, then it equals
  Σ recipe_qty × unit_cost (resolved from the linked cost line), and a missing cost line yields no number
  (never a silent zero).
- **AC-PB-005 (logic/unit): Pricing margin is computed read-only.** Given a candidate price and a linked
  budgeted COGS, when the pre-flight runs, then gross margin = price − COGS and margin-% = margin / price,
  with no price write.
- **AC-PB-006 (logic/unit): Fail-loud freshness + certification.** Given a budget whose cost line `as_of`
  is older than the staleness threshold, when the badge is assessed, then it renders a stale warning; given
  a budget whose certified-metric definition is uncertified, when the badge is assessed, then it renders an
  uncertified warning; a fresh + certified budget renders no warning.
- **AC-PB-007 (render/unit): Drill links the cost line, never a copy.** Given a captured budget, when the
  budget line renders, then the ingredient unit cost is shown by resolving the linked cost line and the row
  carries a drill affordance to that cost line (no hardcoded/copied cost).
- **AC-PB-008 (render/unit): Capture writes the linked shape.** Given Finance captures a budget scenario,
  when the capture submit fires, then the system inserts a `mos.budgets` row + `mos.budget_lines` (ingredient
  + qty only) via the `mos` client.
- **AC-PB-009 (pgTAP): RLS — non-owner cannot write cost lines / registry / budgets.** Given an
  authenticated session without `cogs.write`, when it inserts/updates a budget, then RLS denies it; a
  finance/admin holder can write; cross-org rows are invisible.
- **AC-PB-010 (pgTAP): Link integrity — no copied cost.** Given the `mos.budget_lines` table, when its
  columns are inspected, then there is no unit-cost column; and a budget_line's `ingredient_esb_code`
  resolves to a real `reporting.ingredient_cost_lines` row (the consumer reads the linked record).
- **AC-PB-011 (pgTAP): Certified registry is migration-seeded, no runtime write.** Given an authenticated
  session, when it attempts to insert/update/delete a certified metric, then RLS denies it; the seed
  (`cogs.budgeted`) is present and certified.
- **AC-PB-012 (e2e): Capture → pre-flight shows margin + freshness warning.** Given a menu item with a
  stale cost line, when Finance captures a budget scenario and runs the pricing pre-flight at a candidate
  price, then the projected margin is shown AND a fail-loud freshness warning is rendered.

## Error handling

| Error condition | User-facing behavior |
|---|---|
| User lacks finance/admin | Redirect home; nav link absent for the role. |
| Reporting read denied by RLS | Show access/empty-safe state; do not expose raw PostgREST payload. |
| Reporting read network failure | Show retryable, non-secret error. |
| No BOM/cost-line rows | Show explicit empty state naming the reporting source. |
| Cost line missing for a BOM ingredient | That line yields no cost; the budget total is marked incomplete (never a silent zero). |
| Cost basis stale / uncertified | Fail-loud badge; pre-flight warns against pricing on it. |

## Resolved design decisions (this slice)

- **Scenario reproducibility (resolves ADR-0022 OQ-2).** Snapshot-at-capture: a Budget stores its
  `total_budgeted_cogs` + `cost_basis_as_of` (the basis when captured) so a frozen scenario is reproducible.
  The per-ingredient unit cost is **never copied** — it is always resolved by joining the linked cost line,
  so a "re-cost against current basis" is a re-read + recompute (future action), and the drill always shows
  the live certified number + freshness. This satisfies both OQ-2 (reproducible scenario) and A5
  (link-never-copy): the **total** is the budget's own captured figure; the **unit cost** is linked.
- **Margin floor (resolves ADR-0022 OQ-3).** Warn-only in MVP. The pre-flight shows the margin-% and, if
  below a configurable floor (default 30%), a soft floor warning. It never blocks — the human sets the price
  (D5). Blocking is a later policy.
- **Staleness threshold.** A cost line whose `as_of` is more than 30 days older than the budget's
  `cost_basis_as_of` (or now, when assessing a live cost line) is STALE. The threshold is a pure constant in
  `lib/plan-budget-logic.ts` (single source — tunable later).
- **Certified-metric registry grain.** Migration/seed-owned rows per org: `cogs.budgeted` (Rp, menu-item grain,
  certified) and `margin.gross_pct` (%, menu-item × price grain, certified). A Budget declares its basis via
  `certified_metric_key` (default `cogs.budgeted`); the pre-flight checks that key's `certified` flag.
- **No activity-log / change history in this slice (ADR-0022 OQ-5).** Freshness = the cost line's `as_of`;
  the budget carries `cost_basis_as_of` + audit (`created_by`/`created_at`/`updated_at`/`archived_at`). Full
  version history is deferred to the uniform activity-log pattern.

## Implementation TODO (built in this slice — see plan)

- [x] Migrations `20260710000001..003` (reporting read-models + seed; certified registry + seed;
      budgets/budget_lines + RLS + `cogs.write` capability seed).
- [x] `lib/db/plan-budget.ts` (reporting reads + mos reads/writes, drop-in for the real feed).
- [x] `lib/plan-budget-logic.ts` (budgeted-COGS, margin, fail-loud assessment — pure, unit-tested).
- [x] `pages/budget-page.tsx` + `pricing-page.tsx` + CSS.
- [x] Router + destinations nav + i18n + icons + `SHOW_PLAN_BUDGET` flag.
- [x] Unit (logic + render) · pgTAP (RLS + link integrity) · 1 e2e (capture → pre-flight).
