# Platform workstream — status & handoff (updated 2026-06-21)

Durable handoff for the **platform-foundation** workstream (turning MOS into the shared platform:
OLTP MOS app + OLAP ESB warehouse + ops Modules). Source of truth for decisions: `docs/decisions.md`
(OD-P4-*, OD-K-*), `docs/adr/0010–0013`, `CONTEXT.md`. Loop: `CLAUDE.md` §Operating model.

## Landed on `main` (all merged as of 2026-06-21)

### Architecture / docs (PRs #32/#33/#36/#38/#63)
- **ADR-0010** — platform topology/hosting: three-layer model (ESB · OLAP · OLTP MOS Supabase);
  free-tier edge (CF Pages · CF Tunnel · R2 · Resend · GH Actions); thin FastAPI backend;
  observability (PostHog + Healthchecks + scheduled agent); secret-zero `op` bootstrap.
- **ADR-0011** — one auth model = Supabase Auth + RLS; fixed access roles **admin · ops_lead ·
  finance · member** (+ derived `manager`); 30-day session; installable PWA, online-only writes.
- **ADR-0012** — `integrations.esb_push` module-agnostic transactional outbox (central `dedup_key`);
  kitchen → typed RLS'd `ops.*` tables; **staging-first ESB** (GOO `stg-erp.esb.co.id`).
- **ADR-0013** — records-workspace UI architecture (UI-revamp workstream).
- `decisions.md` OD-P4-1..8, OD-P5-1, OD-K-1..4.
- Kitchen Module spec: `docs/specs/kitchen-module.spec.md` (PR #32).
- GOO confidentiality constraint + Daily-Log mirror deferral in spec (PR #63).

### Access-role layer (PRs #41/#43) — SHIPPED
- `shared.person_access_roles` table (typed rows per person) + JWT-claim hook + viewer integration.
- Fixed-role set: admin · ops_lead · finance · member (+ derived `manager`).
- JWT-claim staleness trade confirmed (OD-P4): role change applies on next token refresh (~30 min).
- Dev seed: Dewi = admin, others = member.

### Kitchen Module (PRs #45/#62/#64/#65/#66) — SHIPPED
- **DB substrate** (PR #45, 14 migrations): `ops.wip_items`, `ops.kitchen_plans`, `ops.kitchen_logs`,
  `ops.kitchen_stock`, `integrations.esb_push` outbox, `ops.approve_kitchen_log` RPC (batch-approve),
  `ops.kitchen_stock_for_date()` RPC, reject provenance, RLS on all tables.
  Daily-Log mirror **deferred** (migration `_014` removed it; re-add when Daily Log module ships).
- **UI — all 5 screens** (PR #62):
  - `/mos/kitchen/log` — S1 daily log capture (WIP item stepper, action-type segmented control)
  - `/mos/kitchen/plan` — S2 plan editor (ops_lead/admin) + pesanan 14-day view (member)
  - `/mos/kitchen/review` — S3 review/approve queue (ops_lead/admin); bulk-approve = all Submitted
  - `/mos/kitchen/stock` — S4 stock view, read-only, all authed members
  - `/mos/kitchen/pushes` — S5 ESB push outbox monitor (ops_lead/admin)
  Unit tests + DB layer tests present; **NO curated e2e journeys** (see Outstanding #1 below).
- **Sidebar nav** (PR #64) — role-aware Kitchen group in RailNav.
- **Dev seed** (PR #65) — 32 real Gordi WIP items + sample plan (`supabase/seed.sql`).
- **log_date bug fix** (PR #66) — plan/log queries used stale Teable column name `date` → `log_date`;
  caused 400 on all plan/log loads. Fixed in DB layer.

**Parity directive (OD-K-1, locked 2026-06-21):**
Kitchen = functional parity with OLD `gordi-kitchen-app` + better UI. NO new logic yet.
Transfer-over → availability rejects (not caps). Bulk-approve = all Submitted.
NOT in scope: receiving/GR, stock-opname, ESB-inventory reconciliation, multi-plan versioning.

### UI-revamp workstream (PRs #29–#56, ADR-0013) — SHIPPED
Structural conventions + UI-revamp PRs 1–6 + fidelity pass. See `docs/ui-revamp-status.md` for history.

## Mid-flight — Kitchen UI redesign (OD-K-5, branch `feat/kitchen-log-redesign`, NOT merged)
The owner rejected the shipped stepper kitchen UI; the **full redesign is built, reviewed, and verified**
on `feat/kitchen-log-redesign` (~21 commits) — a dense data-table (≥768px) + KPI strip + floor-fast phone
cards (<768px) language across all 4 functional screens (Log · Plan · Pesanan · Stock · Review). The
ESB-pushes page is untouched. **Parity held:** data layer unchanged except a read-only `category` on 2
SELECTs; submit payload byte-identical; FR-022/023 gates + Review approve/reject/bulk preserved.
- Reusable pieces in `mos-app/src/components/kitchen/` (`kitchen-table.css`, `KitchenToolbar`,
  `KitchenKpiStrip` + per-screen selectors, `qty-cell`, log/stock/pesanan/review table+cards).
- Log fixes: 3 One-Blue defects · F1 sticky bar (shell `h-screen`) · F2 seed categories · F3
  disable-submit-on-note · app-wide phone overflow (top-bar collapse + grid `minmax(0,1fr)`).
- Gates green (1347 unit · typecheck · lint). Plans: `docs/plans/2026-06-21-kitchen-log-redesign.md` +
  `docs/plans/2026-06-22-kitchen-screens-redesign.md`. Decision: OD-K-5 (+ 2026-06-22 scope amendment).
- **NEXT:** owner visual sign-off + color redlines → Director rebase + merge → close PR #67 (superseded).

## Outstanding (as of 2026-06-22)

### 1. Merge the kitchen UI redesign (Mid-flight above) — TOP gate
Owner visual sign-off on `feat/kitchen-log-redesign` → Director merge. Gates all downstream kitchen
go-live work; on merge, close PR #67 (the earlier doc-consolidation it supersedes).

### 2. Kitchen e2e / qa-acceptance layer (HIGH — must precede go-live)
No curated Playwright journeys cover the kitchen Module. The `log_date` bug (PR #66) slipped through
because unit tests mock Supabase — a wrong column name returns 400 from real PostgREST but passes
mocked unit tests silently.
**Minimum needed:** one e2e spec covering S1 log → S3 review → approve.
**Lesson (verify-live):** any DB-column-name reference or RPC-call signature change must be verified
against a running stack. A mocked unit test cannot catch a wrong column name or mismatched RPC param.

### 3. ESB push worker (not built)
Port `esb_poller`/`esb_client` from `gordi-kitchen-app`; reconcile bulk-approve batch-grain.
The outbox + approval RPC are ready; the worker is the missing piece.
**GOO = TEST DATA ONLY** (spec FR-084, OD-K-3). Never push real GKID product/BOM IDs to GOO.

### 4. Production deploy (Phase 3.1, plan `docs/plans/2026-06-19-prod-platform-deploy.md`)
**Owner-gated** (irreversible infra; schedule after the redesign merge). Open owner Qs:
- Q1: Supabase API hostname under CF Tunnel (needs its own host, not the `/mos` SPA path).
- Q3: secret-zero approach (resident `0600` token vs deploy-time render).
- Q6: R2 / PostHog / Healthchecks free-tier accounts — do they exist?
L5 hardening before exposure: disable open signup + 422 probe · password policy · session timebox ·
CSP · prod Resend SMTP (domain verified; key in 1Password vault `AS`).

### 5. Thin FastAPI backend + user provisioning
Hosts the outbox worker; creates kitchen member accounts (prereq for kitchen go-live).
No spec or plan yet.

### 6. PR #57 — e2e auth fix (open, non-blocking for dev)
PMO-style auth model: global-setup is additive/idempotent; heals demo-login permanently on merge.

## Build sequence
1. ✅ Access-role layer (done)
2. ✅ Kitchen Module DB + UI + nav (done) — original stepper UI
3. [ ] **Merge kitchen UI redesign** (`feat/kitchen-log-redesign`, OD-K-5) — owner sign-off → Director merge
4. [ ] Kitchen e2e layer (precede go-live)
5. [ ] ESB push worker
6. [ ] Prod platform deploy (owner-gated)
7. [ ] Thin FastAPI backend + user provisioning
8. [ ] Rollout → Teable→Supabase migration → manual testing → in-person training →
       owner-gated switch (never automatic; OD-K-2). Then Teable retires.

## Gates & conventions
- **Spec sign-off** = owner. **Merge-to-main within signed spec** = Director.
- **Prod deploy / internet exposure** = owner (plan ends before GATE A login-check and
  GATE B security-auditor — neither auto-fires).
- **security-auditor (OWASP/STRIDE) is a hard gate** before any rollout (ADR-0010 D11).
- One PR per slice; Director merges green PRs.

## Gotchas (multi-agent repo)
- Subagents only read the current working tree — not other branches.
- Straight-push-to-main is classifier-blocked: use branch+PR.
- `=======` in archived mockup HTML are decorative, not conflict markers.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Demo-login orphan recurs after every e2e run until PR #57 merged (quick fix: `supabase db reset`).
- GOO/ESB: staging env holds TEST DATA ONLY — never submit real GKID product/BOM IDs.
