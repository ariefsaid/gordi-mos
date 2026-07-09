# Consolidated pre-promotion security audit — dev → main (191 commits)

Auditor: security-auditor (CSO lens). Date: 2026-07-08. Read-only.
Scope: full `git diff main..dev` security surface — 18 migrations (+ pgTAP 64–82, seeds),
`shared.can()` capability model, `require-capability.tsx`, edge functions, the org_id tenancy seam.
Target: SHARED self-hosted Supabase. This ledger supersedes the reporting-only dev.md (2026-07-02).

## Method
Verified every table-creating migration for `enable`+`force row level security` and per-verb policy
correctness; read all SECURITY DEFINER RPCs for caller validation + org scoping + `search_path=''`;
read the two guard triggers (tasks/comments); audited `mos.aggregate_compiled` for injection; scanned
the delta for hardcoded secrets; cross-checked pgTAP 64–82 for positive AND negative (cross-org /
wrong-role) assertions. Findings verified against SQL, not summaries.

## Coverage matrix — RLS + negative-path test per new business table
| Table | RLS enable+force | Write authz | Neg-path pgTAP |
|---|---|---|---|
| mos.agent_threads/runs/events | yes | owner+org pinned; append-only guard | 64/65/68 (cross-owner denied) |
| mos.notifications | yes | owner pinned; mark-read-only guard; x-owner via DEFINER | 66/67 |
| mos.comments | yes | author+org pinned; entity guard (mig …0712001) | 69/80 |
| mos.push_subscriptions | yes | owner+org pinned | 70 |
| mos.aggregate_compiled (fn) | INVOKER (RLS fires) | allow-set + %I/%L | 71 |
| shared.role_capabilities | yes | read-all; writes service_role only | 72/73 |
| mos.follow_ups / follow_up_events | yes | SELECT only; writes via DEFINER RPC | 74/75 |
| reporting.ingredient_cost_lines / bom_lines | yes | finance/admin read; reporting_writer write | 76 |
| mos.certified_metrics | yes | finance/admin read; no write grant | 77 |
| mos.budgets / budget_lines | yes | can('cogs.write')+org; RPC recompute | 78/82 |
| reporting.esb_ar_reduction | yes | finance/admin read; service_role write | 74 |

Every new business table enables+forces RLS and has a negative-path pgTAP test. **No table lacks RLS
or a negative RLS test.**

## Findings

### Critical — none.
### High — none.

### Medium — M1: `mos.budgets` retains direct INSERT/UPDATE grants that bypass the `capture_budget` RPC
`supabase/migrations/20260710000003_mos_budgets.sql:99` grants `insert, update on mos.budgets to
authenticated`; the write RLS gates only `org_id = current_org_id() AND can('cogs.write')` (INSERT also
pins created_by). The `mos` schema is PostgREST-exposed (the DAL uses `mos().from('budgets')`), so a
finance/admin user can POST/PATCH `mos.budgets` directly, bypassing `mos.capture_budget`
(`20260712000003`). That RPC is the intended sole write path — it (a) server-recomputes
`total_budgeted_cogs` from linked cost lines (the A5 "no client-trusted total" fix) and (b) rejects a
cross-org `owning_bu_id` (step 2a, 23514). Neither protection exists on the direct table path: there is
no guard trigger on `mos.budgets` (unlike `mos.tasks` mig …0711 and `mos.comments` mig …0712001), so a
direct write can set an arbitrary `total_budgeted_cogs` and hang the budget off another org's
`owning_bu_id` (existence-only FK, RLS-blind). Also `created_by` is mutable on direct UPDATE
(no immutability guard, unlike tasks), permitting cross-org created_by re-attribution.
- **Blast radius (why Medium not High):** actor must already hold `cogs.write` (finance/admin);
  SELECT is org+finance/admin-scoped so no cross-org READ leaks; the corrupted row and the dangling BU
  reference live only in the actor's own org. It undermines two *integrity* guarantees the codebase
  deliberately hardened elsewhere, not the tenancy READ wall.
- **Fix (mirror the follow_ups pattern):** `revoke insert, update on mos.budgets (and insert on
  mos.budget_lines) from authenticated`; route all writes through `mos.capture_budget` + a sibling
  `mos.update_budget` DEFINER RPC. Alternatively add a `mos._guard_budget_refs()` BEFORE INSERT/UPDATE
  trigger (same-org `owning_bu_id`/`created_by`; created_by/org_id immutable on UPDATE) matching the
  tasks guard. Not a promotion blocker, but close before B2B multi-tenant onboarding.

### Low
- **L1** — `capture_budget` comment/spec claims fail-loud on "missing OR uncertified" cost line
  (`20260712000003:9,128`), but `reporting.ingredient_cost_lines` has no `certified` column; only a
  *missing* (NULL join) line raises. "Uncertified" is not actually enforced. Doc/semantic gap, not a
  hole (missing is caught; certification lives in `mos.certified_metrics`, checked at the pricing badge).
- **L2** — `reporting_writer` cross-org WRITE residual (A4, `20260712000002`): `using(true) with
  check(true)`. NULL/bogus org blocked by NOT NULL + FK; cross-org write to a *valid* org is possible if
  the write-only, no-SELECT credential leaks. Accepted + documented; true fix (job sets
  `app.reporting_org` GUC + `with check (org_id = current_setting(...))`) is a tracked F/ops item.
  Re-affirmed: acceptable pre-prod given credential custody; land the GUC scope before the writer feed
  goes live on the shared DB.

### Verified strong (no action)
- `mos.aggregate_compiled` — SECURITY INVOKER (base-table RLS fires), identifiers only from a hard-coded
  per-entity allow-set via `format('%I')`, filter/timeRange values via `format('%L')`; op + column +
  groupBy + entity all validated against allow-sets; `statement_timeout=2s`; required-time-range gate.
  Injection-safe; EXECUTE narrowed off PUBLIC.
- `mos.transition_follow_up` / `mos.create_notification` — DEFINER with `search_path=''`, cross-org
  guard BEFORE any gate/write, capability/lane checks, EXECUTE revoked from public/anon. Correct.
- Guard triggers `mos._guard_task_refs` / `mos._guard_comment_entity` — INVOKER, close the FK-existence
  cross-org seam + immutability; pgTAP 79/80 assert real cross-org negatives (23514/42501).
- `shared.can()` capability model is DB-enforced in RLS WITH CHECK on objectives/work_lines/budgets and
  in the DEFINER RPCs; `require-capability.tsx` is UX-only (correctly non-authoritative).
- Secret scan of the delta: no hardcoded keys/tokens/VAPID/service_role values; all secret refs are
  op-managed or doc mentions.

## Verdict
- New business table without RLS: **NONE**.
- New business table without a negative-path RLS test: **NONE**.
- Blockers (Critical/High): **NONE**.

security: PASS
