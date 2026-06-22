# Platform workstream — status & handoff (started 2026-06-19)

Durable handoff for the **platform-foundation** workstream (turning MOS into the shared platform:
OLTP MOS app + OLAP ESB warehouse + ops Modules). Companion to `docs/ui-revamp-status.md` (a
*separate* workstream owned by other agents — do not cross the streams). Source of truth for decisions:
`docs/decisions.md` (OD-P4-*), `docs/adr/0010–0012`, `CONTEXT.md`. Loop: `CLAUDE.md` §Operating model
(Intake/grill → Spec → Plan → Build/TDD → Review → Accept/BDD → Secure → Ship).

## Landed on `main`
- **ADR-0010** — platform topology/hosting/ops: three-layer model (ESB system-of-record · OLAP warehouse ·
  OLTP MOS Supabase) *never merged*; free-tier edge (CF Pages · CF Tunnel · R2 · Resend · GH Actions);
  **no Metabase**; 5th **`reporting`** schema (finance/admin RLS); thin FastAPI backend; observability
  (PostHog + Healthchecks + a scheduled agent); backup/DR; secret-zero `op` bootstrap; **security
  hardening + a gating security-auditor pass**.
- **ADR-0011** — **one auth model = Supabase Auth + RLS**; fixed access roles **admin · ops_lead ·
  finance · member** (+ *derived* `manager`); kitchen behind auth (reverses umbrella-A1); synthetic
  emails for staff w/o email; 30-day session; installable PWA, online-only writes.
- **ADR-0012** — **`integrations.esb_push`** Module-agnostic **transactional outbox** (one worker, central
  `dedup_key`); kitchen → typed RLS'd `ops.*` tables; **staging-first ESB** (GOO `stg-erp.esb.co.id`).
- `decisions.md` **OD-P4-1..8**; `CONTEXT.md` glossary (App=one MOS / Module / Feature; Role vs Access
  role vs RACI).
- **Kitchen Module spec** (`docs/specs/kitchen-module.spec.md`, PR #32) · **Phase-3.1 prod-deploy plan**
  (`docs/plans/2026-06-19-prod-platform-deploy.md`, PR #33).
- **Access-role layer** — **SHIPPED** (PR-a #41 DB substrate · PR-b #43 viewer, both merged 2026-06-19/20):
  `shared.person_access_roles` + JWT-claim helpers + hook; `accessRoles` in `resolveViewer`. JWT-claim
  staleness (~1h) accepted.
- **Kitchen Module UI** — **SHIPPED to main** (PR-k1 #45 DB, k3 #62 S1–S5 UI, #64 nav, #65 seed, #66 fix;
  2026-06-19 → 2026-06-21). All 5 screens live on main with the original stepper UI. **The OD-K-5
  redesign (dense-table + KPI strip + phone cards across all 4 screens) is built on branch
  `feat/kitchen-log-redesign` — NOT yet merged.** See "Mid-flight" below.

## Mid-flight (branch `feat/kitchen-log-redesign`, NOT merged — awaiting owner sign-off)
The OD-K-5 kitchen UI redesign is built, reviewed, and verified on `feat/kitchen-log-redesign`. The
original shipped kitchen UI (stepper-style) is replaced by a dense-table + KPI strip + phone cards
language across all 4 functional screens + the ESB-pushes page untouched. Key branch additions:
- **Log** — `KitchenLogTable` / `KitchenLogCards` / `KitchenKpiStrip` / `KitchenGroupHeader` /
  `KitchenLogRow` / `QtyCell` — dense ≥768px, floor-fast <768px, 4-tile KPI strip.
- **Plan** — `KitchenPlanTable` / `KitchenPlanCards` + `PlanQtyCell` / `PlanQtyStepper`.
- **Pesanan** — `KitchenPesananTable` / `KitchenPesananCards` — 14-day read-only horizon.
- **Stock** — `KitchenStockTable` / `KitchenStockCards`.
- **Review/approve** — `KitchenReviewTable` / `KitchenReviewCards`.
- **Shared primitives** — `KitchenToolbar`, `kitchen-table.css`, per-screen KPI selectors.
- **Four Log review fixes** (F1 sticky bar via `page-frame.tsx`, F2 seed categories, F3 disabled Submit
  on unresolved notes, F4 dead-prop cleanup).
- Design-plans: `docs/plans/2026-06-21-kitchen-log-redesign.md` + `docs/plans/2026-06-22-kitchen-screens-redesign.md`.
- Phase-0 mockups + screenshots: `docs/design-mockups/kitchen/`.

**NEXT:** owner visual sign-off → Director merges `feat/kitchen-log-redesign` to main.

## Outstanding — updated sequence (as of 2026-06-22)
1. **Kitchen UI redesign merge** — branch `feat/kitchen-log-redesign`; owner sign-off + Director merge.
2. **Prod platform deploy (Phase 3.1)** — plan #33 ready; **owner-gated**. Blocked on owner P0 items below.
3. **Thin FastAPI backend + secret-zero/`op`** — hosts the outbox worker + provisioning.
4. **User-management / provisioning** — creates kitchen `member` accounts (prereq for kitchen go-live).
5. **`integrations.esb_push` outbox + worker** — DB outbox table landed (PR-k1 #45); worker not yet built.
6. **Kitchen e2e + ESB validation** — curated kitchen e2e journeys (#57); pesanan 14-day view already
   in the redesign branch; ESB worker → staging-first GOO validation.
7. **Rollout** — Teable→Supabase migration → manual testing only → in-person training → manual owner
   switch of ESB push (`ESB_PUSH_ENABLED`-style guardrail; never auto). Then Teable retires.

## Owner-gated open questions (block execution)
- **Kitchen redesign:** owner visual sign-off on `feat/kitchen-log-redesign` before Director merges.
- **Deploy (plan #33):** Q1 the Supabase **API hostname** under CF Tunnel — `environments.md:19` wrongly
  reuses the `/mos` SPA path; the API needs its own host. Q3 secret-zero (resident `0600` token vs
  deploy-time render). Q6 do the free-tier **R2 / PostHog / Healthchecks** accounts exist? Owner deferred
  account signups.

## Gates & conventions
- **Spec sign-off** = owner. **Merge-to-main within signed spec** = Director. **Prod deploy / exposure** =
  owner (deploy plan ends *before* GATE A login-check and GATE B security-auditor — neither auto-fires).
- **security-auditor (OWASP/STRIDE) is a hard gate** before any internet exposure / rollout (ADR-0010 D11).
- One PR per slice; Director merges green PRs.

## PRs (all merged unless noted)
#32 (kitchen spec) · #33 (deploy plan) · #34 (named-exports) · #35 (ui-revamp planning) · PR-a #41
(access-role DB) · PR-b #43 (viewer) · PR-k1 #45 (kitchen DB) · k3 #62 (kitchen UI) · #64 (kitchen nav)
· #65 (seed) · #66 (log_date fix) — **all merged to main**.
**`feat/kitchen-log-redesign`** — open; awaiting owner sign-off + Director merge.

## Gotchas (multi-agent repo)
See memory `mos-multiagent-git-gotchas` — subagents only read the current working tree (not other
branches); when the tree sits on another agent's branch, work in **disjoint new paths** and never touch
their modified files; straight-push-to-main is classifier-blocked (use branch+PR); the `=======` in
archived mockup HTML are decorative, not conflict markers; verify CONTEXT.md edits persisted (editor may
revert). Commit trailer: `Co-Authored-By: Claude Fable 5`.
