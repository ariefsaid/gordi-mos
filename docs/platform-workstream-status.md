# Platform workstream — status & handoff (updated 2026-06-30)

> **Fast onboarding for a fresh agent:** read `docs/agent-context.md` (owner prefs · gotchas · current
> state · pointers) first, then this file. ESB/GOO specifics: `docs/reference/esb-goo-integration.md`;
> ESB warehouse online (box/op/cron/observability): `docs/reference/warehouse-online.md`. How the
> requirement bar evolved (era timeline E1→E6 — later era wins): `docs/requirements-evolution.md`.

Durable handoff for the **platform-foundation** workstream (turning MOS into the shared platform:
OLTP MOS app + OLAP ESB warehouse + ops Modules). Source of truth for decisions: `docs/decisions.md`
(OD-P4-*, OD-K-*, OD-AN-*), `docs/adr/0010–0017`, `CONTEXT.md`. Loop: `CLAUDE.md` §Operating model.

## Current focus (2026-07-05) — 6 slices SHIPPED to `dev`; P3a built through Phase G (▶ NEXT-AGENT resume block below)

> **HANDOFF (2026-07-05):** agent-native port P1+P2 shipped to `dev` (full batteries); P3 planned +
> decided; **P3a built through Phase G** on `feat/port-p3a-replay-inbox` (replay + notifications backend
> + Inbox destination + ask_user + rating + comments/@mention + PWA seam), backend security-CLEAR.
> **Remaining P3a: Phase H (battery) → ship** — see the ▶ NEXT AGENT block in this section. The six
> owner-gated items (bottom of this section) are the real bottleneck to reaching users.

**Shipped to `dev` (each with a full recorded battery — `docs/reviews/feat-*.md`):**
1. **Home v1 + `sales_margin_daily`** — `/` = Home hub (My Week → panel), bottom tabs + regrouped
   rail (ADR-0019 D2/D8), bilingual i18n seam (ADR-0021), margin read-model on the **§7a INTERIM
   contract** (BOM=budget doctrine; plan `docs/plans/2026-07-04-home-v1-margin.md` §7a).
2. **Helper dedup** (pre-port CQ follow-ups) + demo-Finance seed fix.
3. **Port P1 substrate** (ADR-0018) — viewspec compiler/executor/renderer + registry(+manifest),
   `mos.user_views` + `shared.is_managed_by`, `/dev/views` harness (DEV+flag, default off), **real
   primitive hydration**, save-time spec validation.
4. **BU taxonomy remap** (ADR-0019 D1/OD-IA-1) — 6 team BUs with stable `code`s, legacy soft-retired,
   kitchen-logs resolves by code, org-scoped re-point UPDATEs.
5. **Port P2 deputy** (ADR-0018) — `agent-chat` + `compose-view` edge functions (deputy loop,
   grounding prompt, 4-tool catalog, SSE, single LLM call site, server-side re-validation),
   `mos.agent_threads/runs/events`, AssistantPanel slide-over + FAB behind `SHOW_ASSISTANT` (default
   off). Security lens: **deputy invariant holds by construction**. Ledger
   `docs/reviews/feat-port-p2-panel-runtime.md`.
6. **RI-3 flake fix** (`5d0cb57`) — load-sensitive waitFor-timeout, not a logic race; widened to 4000ms,
   proven 0/10 under CPU-burner load.

**P3 port train (automations + notifications Inbox) — PLANNED + started (2026-07-05):** plan
`docs/plans/2026-07-06-port-p3-automations-inbox.md` (Director decisions §8: P3a/P3b split; **P3b
automations GATED** on an owner staging verify — does `generateLink` route through the
`custom_access_token` hook so a cron run acts as a user without service_role; PWA push delivery NOT a
ship-blocker; credits + typed-widgets deferred). **P3a Phase A (thread-replay) built on branch**
`feat/port-p3a-replay-inbox` (T1–T5, commits `2c9cff5`..`9b9e47d`): `agent_events.type` widened +
enrichment (user turn + assistant `tool_calls` + tool `tool_call_id`, which P2 dropped) +
`agent-chat/replay.ts` server-side `ModelMessage[]` reconstruction — **closes the P2 "deep thread
replay" escalation at the server layer**. **Phase B (notifications backend) ALSO built** (Director,
solo on opus while quotas were down — T8–T12, commits `b2ad586`..`25f2052`): `mos.notifications`
(owner-private, org-gate every branch, content-immutable mark-read-only trigger, unread fast-path
index), the ONE sanctioned `SECURITY DEFINER mos.create_notification` cross-owner @mention helper
(org-walled), the boundary-clean channel-adapter seam (in-app fan-out + inert push stub until VAPID),
and the `notify` self-notification deputy tool (catalog now 4 tools). **2127 vitest + 414 pgTAP +
deno-check all green.**
**Phase C (Inbox destination UI) ALSO built + RENDER-VERIFIED** (Director, solo — T13–T17, commit
`f98283c`): notifications DAL + `useNotifications` (unread-first, optimistic mark-read w/ revert) +
`InboxList` (severity dots, deep-link rows, XSS-inert) + `InboxPage` + `SHOW_INBOX` flag/destination/
route wiring + top-bar bell w/ unread badge + en/id strings. **Render-verified end-to-end:** 3 seeded
notifications render unread-first with severity colors, click marks-read + navigates to the deep-link,
badge decrements 3→2 and PERSISTS across navigation. All flag-gated (default off). Suite 2136 green.
**Phase D (ask_user) — DONE** (2026-07-05; a Claude sonnet build agent, quota-interrupted at the final
T21 commit — Director verified 2182 vitest + typecheck + eslint + deno green and committed T21 `406531b`):
T6–T7 replay client-wiring (thread reopen + populated ThreadList; the **thread-vs-run identity question**
was resolved — a ThreadList entry is a *thread*, `openThread` folds its runs' events for display + binds
the latest run for `{replay:true}` follow-ups), T18–T21 ask_user (schema + handler dispatch +
`handleAnswer` + transport/port/runtime `answer` wiring + panel question-chips). Branch is coherent +
fully green. **Phase E (rating/downvote) — DONE** (T22–T23, commit `32b78e5`): hook-level
`rate(eventId, rating, reason?)` caller-JWT UPDATE of `agent_events.rating/downvote_reason`, panel
thumbs-up/down control, downvote reason picker, and pgTAP `68_agent_events_feedback_owner.sql`.
**Phase F (comments + @mention) — DONE** (T24–T28, commit `209e705`): `mos.comments` + RLS/pgTAP,
mention extraction, comment-post notification fan-out through `mos.create_notification`, and the task-detail
comment thread wired into the record feed. **Phase G (PWA seam) — DONE** (T29–T30, commit `0ec69a3`):
manifest + service-worker registration, `mos.push_subscriptions` RLS, browser subscribe hook, and inert
no-VAPID behavior. Current verified baseline after Phase G: **2200 vitest + 437 pgTAP + typecheck +
eslint + deno-check + production build all green**. **Phase H started (uncommitted, 2026-07-05):**
T31 deputy-invariant source guard extended for replay/ask_user/notify and `npm test -- handlerDeputyInvariant`
passes (6 tests); T32 `mos-app/e2e/inbox-replay.spec.ts` live-gated e2e added and `npx playwright test
inbox-replay` skips cleanly under default-off flags. Focused `npm run typecheck` and targeted ESLint on
the changed files pass. **Security lens on the P3a backend
already ran: CLEAR** (no Crit/High/Med; the one actionable hardening — Low-2 route guard — is committed
`583ad93`; Low-1 unbounded *self*-notify volume is tracked for the credits ledger, ship-acceptable).

> ### ▶ NEXT AGENT — resume P3a here
> 1. **Sanity-check green** on `feat/port-p3a-replay-inbox` (branch is coherent as of `0ec69a3`): `cd
>    mos-app && export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && npx vitest run` (baseline
>    **2200**) + `npm run typecheck` + `npx eslint src --max-warnings=0` + `npm run build`; from repo root
>    `npx supabase test db` (baseline **437**) + `deno check --config supabase/functions/deno.json supabase/functions/agent-chat/index.ts`.
> 2. **Phase H — the P3a review battery** (plan T31–T33): T31/T32 are in the current uncommitted tree;
>    next run the FULL 3-lens battery (spec · code-quality · security-RE-run · design via render-verify) on
>    complete P3a, record `docs/reviews/feat-port-p3a-replay-inbox.md`, `bash scripts/pre-merge-check.sh`
>    exit 0, then ship to `dev`. **The branch is NOT reviewed/merged until this battery runs** — do not merge
>    on green gates alone (CLAUDE.md binding gate).
> 3. **T34 (DB-side aggregation, P2.1)** must land before `SHOW_USER_VIEWS` un-gates (P1 truncation carry-in).
> 4. **P3b (automations)** stays GATED on the owner's `generateLink`→hook staging verify (§3.3) — a separate
>    follow-up plan once verified. Do NOT build P3b until that's recorded green.
>
> Full task text + acceptance criteria: `docs/plans/2026-07-06-port-p3-automations-inbox.md`. All P3a
> UI is behind `SHOW_INBOX`/`SHOW_ASSISTANT` (default off) — flip locally to render-verify.

**Owner-gated queue (the real bottleneck — none of the above reaches users until actioned):**
1. **`dev`→`main` merge** — 113 commits, **5 green ledgers**.
2. **Staging `db push`** — margin read-model · user_views · **BU remap (mutates real staging rows**,
   dual-path guard verified) · (soon) agent-persistence + replay migrations.
3. **Live deputy verify** — set `AGENT_MODEL_API_KEY` (direct Anthropic `claude-sonnet-5`) as an op
   edge-function secret on staging → Director verifies grounding + approve/deny (AC-P2-GR-003).
4. **P3b unblock** — the `generateLink`→`custom_access_token` staging check.
5. **VAPID keys** — flips PWA push delivery on (in-app Inbox ships without it).
6. **ESB PIC question** — undocumented AR-settlement API (`docs/reference/esb-settlement-api-spike.md`).

---

## Previous focus (2026-07-02) — Issue 1 done (kit born); next = margin read-model · font fix · registry

Two strategic tracks opened/advanced this session (decisions in `docs/adr/0017` + the `docs/adr/0010`
2026-06-30 amendment; grill `docs/decisions.md` OD-AN-1 / OD-P4-2):

- **Agent-native, user-composed UI — ADR-0017 ACCEPTED (merged to `dev`).** Lets the team compose their
  own UI (analyse/input/present) without a dev cycle, via a **deputy agent** bound to the user's own
  JWT→RLS (security by construction), over a **dual-plane** read surface (base + operational
  `security_invoker` views + the finance/admin `reporting` snapshot; raw warehouse fenced to a
  server-side analyst agent). **Build is value-first** (inverts PMO §10 — MOS has no kit yet):
  **Issue 1 = a mobile-first operational dashboard that *births* the primitive kit** → registry → query
  DSL/compiler → `user_views` + renderer → manual builder → agent (sidecar behind a MOS-specific spike).
  **Issue 1 is COMPLETE on `dev` (2026-07-02):** 5 registry-ready primitives
  (`mos-app/src/components/dashboard/`), the reporting DAL (`src/lib/db/reporting.ts`), and the
  finance/admin-gated `SalesDashboardPage` (`/mos/sales`) — Director render-verified populated +
  responsive + B2B/Roastery end-to-end, 1725 tests green. **The primitive kit is born**, which unblocks
  Issue 2+. Design-plan `docs/plans/2026-07-02-sales-dashboard-design.md`. **Later PMO reference:** the
  sister app adopted the full agent-native framework whole (PMO PR #209, ADR-0040 Option B) — a working
  reference + gotchas for MOS's eventual D8 sidecar (embed same-origin proxy, host-owned deputy ALS,
  supabase-js caller-client not Drizzle, framework pinned exact-version).
- **OLAP ESB warehouse — ONLINE on the Tencent VPS (2026-06-30).** PG 17, loopback-only, self-sustaining
  (3:05am JKT cooperative sync via op) + monitored. First scheduled run was verified 2026-07-01; after
  same-day cleanup, `run_sync.sh` has no Teable push and `sync.validate` exits 0 when only ESB-source /
  business warnings remain. Full runbook + open owner-actions:
  **`docs/reference/warehouse-online.md`**. **Reporting data track is live on staging as of 2026-07-02:**
  `reporting.sales_daily_revenue` migration pushed to Supabase Cloud staging (`hvnwcsmkdeqmgqlbwflm`),
  one live snapshot upserted 191 trailing-window rows, and B2B/Roastery verified as
  `branch_code=GRI`. Cron is installed for **03:30 WIB** after the 03:05 sync. CloudMonitor webhook
  exposure is deferred; active open ops items are sync alerting and a git deploy key — see the runbook.

**Next steps (three parallel, non-colliding):**
1. **`sales_margin_daily` read-model** — the "shallow data" answer + the cashflow lens: margin/COGS at
   day × channel × branch from the warehouse `v_daily_cogs_comparison` (daily COGS confirmed available),
   snapshot-fed + finance/admin-RLS'd like `sales_daily_revenue`, surfaced as a margin KPI + table cut
   (reuses the kit). The first concrete instance of OD-AN-2's "growing read-model set." Data-layer work,
   Codex-buildable.
2. **Font regression fix** — `.tabular`→SF Mono is an app-wide DESIGN.md violation (money must be
   Inter-tabular, not mono; OD-P3-9). See `docs/backlog.md` §Doc & code debt. CSS/font-import work.
3. **Issue 2 — kit → primitive registry** (ADR-0017 §4a): describe the 5 primitives machine-readably
   (name → prop schema → data contract) so the query-DSL (Issue 3) and agent can arrange them. Then
   Issue 3 (query-spec DSL/compiler — which makes weekly/last-X-days/comparisons expressible over the
   existing daily grain, per OD-AN-2).

Sales-dashboard spec `docs/specs/sales-dashboard.spec.md`; reporting-slice spec/plan
`docs/specs/reporting-sales-snapshot.spec.md` + `docs/plans/2026-07-01-reporting-sales-snapshot.md`.
The Activity-mapping owner decision is resolved (2-activity v1: Cafe Ops = POS, Roastery = B2B;
Kitchen-Bar + Sales-CRM deferred — spec §Resolved).

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
