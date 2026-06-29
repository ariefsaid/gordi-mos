# Platform workstream — status & handoff (updated 2026-06-29)

> **Fast onboarding for a fresh agent:** read `docs/agent-context.md` (owner prefs · gotchas · current
> state · pointers) first, then this file. ESB/GOO specifics: `docs/reference/esb-goo-integration.md`.

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
  kitchen → typed RLS'd `ops.*` tables; **staging-first ESB** (GOO Core API `stg7.esb.co.id/core-stg`).
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

## Kitchen UI redesign (OD-K-5) — MERGED to main 2026-06-29 (PR #85, `a14f273`)
The owner rejected the shipped stepper kitchen UI; the full redesign — dense data-table (≥768px) + KPI
strip + floor-fast phone cards (<768px) across all 4 functional screens (Log · Plan · Pesanan · Stock ·
Review; ESB-pushes untouched) — is **shipped**. **Parity held:** data layer unchanged except a read-only
`category` on 2 SELECTs; submit payload byte-identical; FR-022/023 gates + Review approve/reject/bulk
preserved (spec-reviewer verified in code + 429 kitchen tests).
- Director brought the stale branch current (72-commit merge of main, 6 conflicts Director-resolved) and
  ran the full BLOCKING review battery → `docs/reviews/feat-kitchen-log-redesign.md` (`pre-merge-check`
  exit 0): **spec PASS · code-quality FIX-THEN-SHIP · design FIX-THEN-SHIP**.
- The rendered 4-lens design review caught a **Critical fixed before merge**: the Plan editor blanked
  against real **category-NULL** data (grouped strictly by `category`, `.filter(Boolean)` dropped every
  item; dev seed HAS categories so unit tests passed — real Teable-migrated WIP items have NULL). Fixed
  via null-safe `mos-app/src/lib/kitchen-category.ts` `groupByCategory()` + RTL regression tests; also
  fixed phone-Review action clipping (<768px reflow) + invisible disabled-Submit reason. 1602 tests green.
- **Deferred follow-ups (owner-gated, not bugs):** (a) Log KPIs ignore submitted-but-pending logs — no
  "N pending review" cue, reads as if work lost; (b) KPI tiles omit DESIGN.md signature icon-tile + help
  `?` (mockup C); (c) dev seed has no `ops_lead` persona (real staging = Riri ops_lead, dev-only); (d)
  EN/ID language mix per surface; (e) CQ debt — Log doesn't use shared `KitchenToolbar`, `KitchenKpiStrip`
  `kpis?`/`data?` prop footgun.

## Outstanding (as of 2026-06-29)

### 1. ✅ DONE — Kitchen UI redesign merged (PR #85). See section above.

### 2. ✅ DONE — Kitchen e2e / qa-acceptance layer (PR #86, `3819c31`)
One curated Playwright journey now covers the Module: `mos-app/e2e/AC-090-kitchen-log-approve.spec.ts`
(maps 1:1 to **AC-090 [e2e]**) — member logs Production → admin approves → `approve_kitchen_log` mints a
`PR-<YYYYMMDD>-NNN` batch → entry leaves the queue → `integrations.esb_push` outbox row enqueued
(`target_env != gkid`, pre-flip safe). Real stack (PostgREST + RLS + RPC), no mocking; deterministic +
self-cleaning. AC-090's Daily-Log `/ops` mirror clause intentionally unasserted (deferred: `_014`,
AC-060/061). Ledger `docs/reviews/test-kitchen-e2e.md`.
**Lesson (verify-live) still stands:** any DB-column-name / RPC-signature change must be verified against
a running stack — a mocked unit test cannot catch a wrong column name (this is how the `log_date` 400 bug,
PR #66, slipped through). Extend this e2e to AC-091/092 when those flows harden.

### 3. ESB push worker — BUILT + SHIPPED (2026-06-26), NOT deployed
**Approach changed (owner-directed):** do NOT build a new FastAPI service — **extend the existing
`gordi-kitchen-app`** (the live Teable worker) with a 2nd source that drains the MOS
`integrations.esb_push` outbox, reusing its proven `esb_client` + `esb_poller._process_*_batch`.
Shipped: **gordi-kitchen-app PRs #1/#2/#3** (`app/mos_outbox.py` + seams; Teable→GKID path byte-for-byte
unchanged, regression-tested) + **gordi-mos PRs #76** (service_role grants) **/#77** (docs). Per-env
creds (`ESB_GOO_*`, fail-closed), bulk-grain reconciled (group by date+action+target), 63 tests.
Supabase reach: staging = Supabase **Cloud** (public HTTPS); prod = self-hosted later.
- **GOO validated live (2026-06-26):** base = **`stg7.esb.co.id/core-stg`** (NOT `stg-erp` = web UI);
  auth = login (op `esb-staging`, vault Gordi), NOT the static token. **Transfer path round-trips on
  GOO** (`STF202606260001`); the **`/assembly-actual` Production call CANNOT be validated on GOO**
  (GOO's `SAE` tenant is standard-costing → `EC03100004`) — assembly proof is the GKID flip only.
  Full how-to + gotchas: **`docs/reference/esb-goo-integration.md`**.
- **STILL OUTSTANDING (owner-gated):** deploy the worker to ris-dev + set `ESB_GOO_BASE_URL`/`ESB_GOO_*`
  env; security-auditor gating pass on the live worker (NFR-011); the **flip** to GKID + stop the Teable
  poller + the AC-094 single-WIP GKID proof-push; curated worker integration test vs a real Supabase
  (the env-gated `test_mos_outbox_integration.py` greens once grants applied + PostgREST exposes
  `integrations`); add `ESB_GOO_*` to `.env.example`; drop the 2 redundant `grant usage` lines in #76.
**GOO = TEST DATA ONLY** (spec FR-084, OD-K-3). Never push real GKID product/BOM IDs to GOO.

### 4. Production deploy (Phase 3.1, plan `docs/plans/2026-06-19-prod-platform-deploy.md`)
**Owner-gated** (irreversible infra; schedule after the redesign merge). Open owner Qs:
- Q1: Supabase API hostname under CF Tunnel (needs its own host, not the `/mos` SPA path).
- Q3: secret-zero approach (resident `0600` token vs deploy-time render).
- Q6: R2 / PostHog / Healthchecks free-tier accounts — do they exist?
L5 hardening before exposure: disable open signup + 422 probe · password policy · session timebox ·
CSP · prod Resend SMTP (domain verified; key in 1Password vault `AS`).

### 5. User provisioning (kitchen member accounts)
Prereq for kitchen go-live: create kitchen member accounts (synthetic emails per ADR-0011).
NB: the **outbox worker no longer needs a new FastAPI service** — it's the extended `gordi-kitchen-app`
(see #3). The thin-backend ADR-0010 D6 framing is superseded for the worker; a future agent should read
ADR-0012's amendment + `docs/reference/esb-goo-integration.md`. Provisioning still has no spec/plan.

### 6. PR #57 — e2e auth fix (open, non-blocking for dev)
PMO-style auth model: global-setup is additive/idempotent; heals demo-login permanently on merge.

## Build sequence
1. ✅ Access-role layer (done)
2. ✅ Kitchen Module DB + UI + nav (done) — original stepper UI
3. ✅ Merge kitchen UI redesign (OD-K-5) — PR #85, merged 2026-06-29
4. ✅ Kitchen e2e layer (AC-090) — PR #86, merged 2026-06-29
5. [ ] ESB push worker — code-complete + GOO-validated; owner-gated deploy+flip on ris-dev (§3 below)
6. [ ] Prod platform deploy (owner-gated) — bundle with the ESB worker deploy/flip
7. [ ] User provisioning (kitchen member accounts; thin FastAPI backend RETIRED — see §5)
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
