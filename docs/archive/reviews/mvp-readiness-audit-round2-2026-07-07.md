# MVP-readiness audit — round 2 (gpt-5.5 ×3, Director-synthesized)

- **Basis:** 3 independent gpt-5.5 audit agents over the whole `dev` tree (`151876a`), 7 dimensions +
  DoD verdict per `docs/product-expectations.md`. Read-only. Follows the round-1 charter audit
  (`docs/reviews/mvp-readiness-charter-audit-2026-07-06.md`) — this round is post-MVP-push (5 slices landed).
- **Convergent verdict (all 3): SHIP-WITH-FIXES — not yet rollout-ready.** Security *core* is genuinely
  strong; blockers are one tenancy-integrity gap + operational/observability + a few surfaced deferrals.

## Director verification of the one real disagreement
Agent 1 rated the **`mos.tasks` cross-org *reference* seam** a security HIGH; Agents 2 & 3 called tenancy
"unspoofable / strongest part." **Verified against code — Agent 1 is right, 2/3 checked a different thing:**
- `20260611000009_mos_rls.sql:71-76` `tasks_insert_member` `with check (org_id = current_org_id() and
  is_org_member())` — guards only the ROW's org + membership.
- `20260611000007_mos_tasks.sql:7-18` `business_unit_id` / `responsible_person_id` / `accountable_person_id`
  / `consulted_person_ids[]` / `informed_person_ids[]` / `created_by` are **plain existence-FKs, no same-org
  guard**; only trigger is `tasks_guard_archive`. The same-org guard pattern **exists** on ops-logs
  (`20260612000006`) + kitchen-logs (`20260620000008`) but was **never applied to tasks**.
- Impact: a member can hang a task off another org's person/BU → data-integrity corruption + a foreign
  identity leaking into the referencing org's UI via R-avatar joins. **Real.** (2/3 correctly verified the
  row's own `org_id` is unspoofable — a separate, solid property.)

**Verified-strong (the 2/3 consensus, confirmed):** `org_id` JWT-minted + unspoofable; all SECURITY DEFINER
RPCs org-guard before any gate + `search_path=''` + CI-lint-enforced revoke; RLS on ~all business tables;
`service_role` only for `auth.getUser`; no float money; clean supply chain (npm audit 0, lockfile+deno.lock
pinned, no GPL); no XSS surface.

## Consolidated blockers (deduped + triaged)

### A — Fix before any rollout (code; pre-F hardening pass)
| # | Finding | Sev | Evidence |
|---|---|---:|---|
| A1 | **Task same-org reference guard** (R/A/BU/C/I/created_by) — verified above; add trigger/RPC + pgTAP | Sec **High** | `20260611000007:7-18`, `20260611000009:71-76` |
| A2 | `comments.entity_id` — no FK + no read-guard (cross-entity side-channel; migration admits "later hardening") | Sec/Adv Med | `20260706000004_mos_comments.sql:15,40-42` |
| A3 | **No React error boundary + no telemetry sink** — prod failures white-screen + invisible | Rel/Obs **High** | `main.tsx` (no `errorElement`/`ErrorBoundary`); no Sentry/PostHog in `mos-app/src` (vs ADR-0010 D7) |
| A4 | `reporting_writer` `using(true)/with check(true)` — cred leak = cross-org financial R/W | Sec Med | `20260704000002:79/83`, `20260710000001:90/93` |
| A5 | Money: client-computed COGS stored as capture-of-record + `captureBudget` = 2 non-tx inserts | Data Med | `plan-budget.ts:95,120`; wrap in SECURITY DEFINER RPC + server-recompute |
| A6 | CI scope: coverage is an **allowlist** (admin/pages excluded) + `AC-PB-012`/flag e2e never runs in CI — **cheap** | Test Med | `vite.config.ts:61-101`; `integration.yml` (no `VITE_SHOW_PLAN_BUDGET=true`) |

### B — Owner-gated at F (ops/infra, not code gaps)
- **ESB outbox worker DEPLOY** — built in `gordi-kitchen-app`, *not deployed*; kitchen→ESB integration inert
  until then (not "no worker exists" — see `docs/platform-workstream-status.md` kitchen state).
- **Rate-limit / quota** on edge/agent fns before a real cohort (the *decisions.md* credits/metering deferral,
  elevated for rollout — unbounded billable LLM calls otherwise).
- VAPID/push delivery, prod auth config (`enable_signup`/`enable_confirmations` on the *deployed* project),
  request-id tracing in edge fns, admin audit trail.

### C — Already-accepted deferrals (track, don't block)
Agent credits/metering (decisions.md session-2), Deno-edge-in-CI, coverage→globs, weekly-update submit/reopen
locking RPC, `rejectKitchenLog` stale no-op, `LogOrigin` `| 'kitchen'` type drift (5-min), CI actions SHA-pin.

## Recommendation
Pre-F hardening pass on **A** (each via the review loop; **A1 + A3 are the true must-fixes**, A6 near-free),
then **F** absorbs **B**. Minimum bar before *any* rollout: A1 (security) + A3 (error boundary).

## UNVERIFIABLE from source (needs runtime/other repos)
Current suite-green status; live `npm audit`; deployed auth-config posture (`config.toml` is local-dev);
ESB worker retry/dead-letter (sibling repo); off-box observability (ADR-0010 D7 designed off-repo);
PR-granularity (needs `gh pr list`).
