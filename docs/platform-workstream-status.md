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

## Mid-flight (working tree, awaiting owner sign-off — NOT landed)
- `docs/specs/access-roles.spec.md` + `docs/plans/2026-06-19-access-roles.md` — the **access-role layer**
  (next slice). Close-reviewed + schema-verified. **Blocked on:** owner spec sign-off + confirming the
  **JWT-claim-staleness trade** (helpers read the `access_roles` JWT claim → a role change applies on next
  token refresh, ~1h; alt = live table-read). Build = PR-a (DB substrate) then PR-b (viewer).

## Outstanding — foundation-first build order (kitchen is LAST, on top)
1. **Prod platform deploy (Phase 3.1)** — plan #33 ready; **owner-gated**. Blocked on owner P0 items below.
2. **Access-role layer** — spec+plan ready; awaiting sign-off. ← *next to build*
3. **Thin FastAPI backend + secret-zero/`op`** — hosts the outbox worker + provisioning.
4. **User-management / provisioning** — creates kitchen `member` accounts (prereq for kitchen go-live).
5. **`integrations.esb_push` outbox + worker.**
6. **Kitchen Module** — full parity port (+ the **`pesanan` 14-day view**, a parity gap the spec flagged).
   Parity = current app only: **no** receiving/GR, stock-opname, or ESB-inventory reconciliation.
7. **Rollout** — Teable→Supabase migration → **manual testing only** → in-person training → **manual**
   owner switch of ESB push (`ESB_PUSH_ENABLED`-style guardrail; never auto). Then Teable retires.

## Owner-gated open questions (block execution)
- **Deploy (plan #33):** Q1 the Supabase **API hostname** under CF Tunnel — `environments.md:19` wrongly
  reuses the `/mos` SPA path; the API needs its own host. Q3 secret-zero (resident `0600` token vs
  deploy-time render). Q6 do the free-tier **R2 / PostHog / Healthchecks** accounts exist? Owner deferred
  account signups.
- **Access-role:** confirm the ~1h JWT-claim staleness trade.

## Gates & conventions
- **Spec sign-off** = owner. **Merge-to-main within signed spec** = Director. **Prod deploy / exposure** =
  owner (deploy plan ends *before* GATE A login-check and GATE B security-auditor — neither auto-fires).
- **security-auditor (OWASP/STRIDE) is a hard gate** before any internet exposure / rollout (ADR-0010 D11).
- One PR per slice; Director merges green PRs.

## PRs
#32 (kitchen spec) · #33 (deploy plan) · #34 (named-exports) — **merged**. #35 (ui-revamp planning) —
**held; other agents' workstream, not for this workstream to merge.**

## Gotchas (multi-agent repo)
See memory `mos-multiagent-git-gotchas` — subagents only read the current working tree (not other
branches); when the tree sits on another agent's branch, work in **disjoint new paths** and never touch
their modified files; straight-push-to-main is classifier-blocked (use branch+PR); the `=======` in
archived mockup HTML are decorative, not conflict markers; verify CONTEXT.md edits persisted (editor may
revert). Commit trailer: `Co-Authored-By: Claude Fable 5`.
