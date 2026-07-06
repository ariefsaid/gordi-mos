# Platform workstream — status & handoff (updated 2026-07-06)

> **Fast onboarding for a fresh agent:** read `docs/agent-context.md` (owner prefs · gotchas · current
> state · pointers) first, then this file. ESB/GOO specifics: `docs/reference/esb-goo-integration.md`;
> ESB warehouse online (box/op/cron/observability): `docs/reference/warehouse-online.md`. How the
> requirement bar evolved (era timeline E1→E6 — later era wins): `docs/requirements-evolution.md`.

Durable handoff for the **platform-foundation** workstream (turning MOS into the shared platform:
OLTP MOS app + OLAP ESB warehouse + ops Modules). Source of truth for decisions: `docs/decisions.md`
(OD-P4-*, OD-K-*, OD-AN-*), `docs/adr/0010–0017`, `CONTEXT.md`. Loop: `CLAUDE.md` §Operating model.

## Current focus (2026-07-06 EOD) — staging deployed · COGS root-cause fixed · Work-spine held · JTBD v0.3 grill

> **SESSION CLOSE (2026-07-06 EOD) — read this first.** Big session; state below. All new docs are
> referenced here + in the pointer tables (no orphans).
>
> **Shipped / deployed:**
> - **P3a + P2.1 merged to `dev`** (green CI); details in the "Earlier 2026-07-06" block below.
> - **`dev`→`main`→`staging` UP TO BU remap** (owner-directed cut). `main` = `staging` = **`669ee0a`**;
>   staging Cloud DB `supabase db push`ed through `20260705000002_bu_taxonomy_remap` (real-row BU
>   mutation applied clean). **Staging is LIVE + testable: `https://gordi-mos.pages.dev/mos`.** The
>   agent port (P2/P3a/P2.1) is intentionally **NOT** on main/staging — staging stays conservative.
> - **Dev ungate (`ae7cffa`):** all 5 `SHOW_*` flags flipped true on `dev` so the full built stack is
>   testable on the dev build (staging stays conservative). Dev server verified at `localhost:5173/mos`
>   (`.claude/launch.json` `mos-dev`). ⚠️ the Assistant needs `AGENT_MODEL_API_KEY` in the env to respond.
>
> **COGS/margin root-cause fix — deployed to the box, populates OFF-HOURS tonight:**
> - Root cause: `v_daily_cogs_comparison` is a FULL OUTER JOIN of two **unbounded** aggregates →
>   recomputes full history every pass (~10 min). Fix = a **windowed `public.fact_daily_cogs_interim`**
>   (built from base tables with date-bounded CTEs) refreshed at the 03:05 sync; snapshot reads it (fast,
>   0.19s/3-day validated). **GRI `stock_movement` now captured** in the nightly sync (was GKID-only) so
>   **Roastery/B2B margin** works too. Code: `feat/margin-cogs-fact` (`a3a2015`, unpushed) + a local
>   commit in `~/Coding/gordi-esb-bak` + **deployed to the box** (`~/gordi-esb-bak/scripts/` +
>   `init-db/43-schema-fact-daily-cogs.sql` applied; box cron = `run_all_snapshots`). **TONIGHT 03:05
>   refreshes the fact + 03:30 pushes revenue+margin(GKID+GRI)→staging → verify tomorrow AM.**
>   `feat/margin-matview-wip` (`751efb6`) = the earlier matview attempt, **superseded/shelved**.
>
> **Work-spine v1 — BUILT + FIXED + battery-green, HELD (unpushed) on `feat/work-spine` (`0bf7cdd`):**
> - The first ADR-0019 D14-step-3 slice: `/work/cascade` everyone-read view + minimal `shared.can()` +
>   objectives/work_lines write policies migrated to `can()`. Built gpt-5.4 → reviewed gpt-5.4 cross-family
>   (FIX-THEN-SHIP, `can()` verified sound) → all 5 fixes applied glm-5.2 (phone split, i18n, **pgTAP
>   plan(14)→plan(23) fully proving AC-310..315**, ladder resilience, e2e fixtures). Battery green:
>   pgTAP 481 · vitest 2246 · typecheck/eslint/build · AC-305 e2e. Ledger: `docs/reviews/feat-work-spine.md`.
>   **Before merge:** (1) a **cross-family gpt-5.4 re-review of the pgTAP** (the fix was GLM-only; our own
>   rule says security proofs don't merge on a single family), (2) **Director phone render-check** (visual
>   lens), then push→CI→merge to `dev`. Spec `docs/specs/work-spine.spec.md` (OD-WS-1), plan
>   `docs/plans/2026-07-06-work-spine.md`.
>
> **IA / JTBD grill (owner-directed grill-with-docs) — on `docs/jtbd-refresh` (`cbebe6c`, unpushed):**
> - Refreshed the whole IA per E6. **`CONTEXT.md` +7 term resolutions** (Ingredient cost line, Budget,
>   Follow-up settlement lifecycle, Home cockpit, Kitchen/Bar WIP module, Stock location & internal
>   replenishment, Ecommerce fulfilment). **`docs/jtbd.md` → v0.3** (E6 oracle, supersedes E1 v0.2: 4
>   personas × 5 destinations, 8 anchors). Two **Proposed** ADRs (owner sign-off pending): **ADR-0022**
>   (Plan / COGS-budget model, extends D7), **ADR-0023** (multi-location inventory + internal
>   replenishment, new). Plus `docs/specs/roastery-module.requirements.md` (synthesized from the
>   `~/Coding/Roast-App` prototypes; has 10 owner-decisions in §6) and
>   `docs/specs/agent-capability-expansion.md` (PMO-vs-MOS agent capability gap; feeds the next grill).
>   Director-verified all faithful to the grill. `docs/jtbd-refresh` also carries the `a3a2015` COGS
>   re-point (branch cut from `feat/margin-cogs-fact`).
>
> ### ▶ NEXT AGENT — 2026-07-06 EOD resume
> 1. **Owner sign-off** on ADR-0022 + ADR-0023 (Proposed) + JTBD v0.3; then merge `docs/jtbd-refresh`.
> 2. **Resume the grill** (owner opted "keep grilling"): the **PMO agent-capability expansion**
>    (drive off `docs/specs/agent-capability-expansion.md`) + the **roastery §6** 10 owner-decisions.
> 3. **Design audit** — run the 4-lens design-review against the *refreshed* JTBD v0.3 (the whole point:
>    the IA slices were only Director-eyeballed, never given the prescribed IA/IxD/UX battery).
> 4. **Work-spine → merge:** cross-family gpt-5.4 pgTAP re-review + Director phone render → push→CI→merge.
> 5. **Verify tomorrow AM:** the 03:05/03:30 cron populated `reporting.sales_margin_daily` on staging
>    (GKID+GRI); if green, the margin tile lights up — consider un-gating margin display.
> 6. **Owner-gated queue** (unchanged): `dev`→`main` promote (agent port), live-deputy `AGENT_MODEL_API_KEY`,
>    VAPID, P3b `generateLink` hook, ESB PIC settlement answer.
>
> **Branch map:** `dev`=`ae7cffa` · `main`/`staging`=`669ee0a` · `feat/work-spine`=`0bf7cdd` (held) ·
> `feat/margin-cogs-fact`=`a3a2015` (box-deployed, unpushed) · `docs/jtbd-refresh`=`cbebe6c` (grill, unpushed) ·
> `feat/margin-matview-wip`=`751efb6` (shelved). All feature branches UNPUSHED — owner-gated.

### Earlier 2026-07-06 (P3a + P2.1 merge — history)

> **HANDOFF (2026-07-06, updated):** agent-native port P1+P2+**P3a+P2.1 all on `dev`**. **PR #88**
> (`feat/port-p3a-replay-inbox`) and **PR #89** (`feat/p2.1-db-side-aggregate`) both **MERGED to `dev`**
> with fresh GitHub `verify` + `db` **green** (dev tip `1b37b10`; #88→`da31e3a`, #89→`1b37b10`). The
> CI-fix pass (task detail/drawer async races + Home-v1 e2e `My Week`→Home route + recovery
> password-policy + Sales KPI locator scope) landed via the stabilized p3a commit `c96fb5a` and the
> clean p2.1 rebase `4f67080` (code byte-identical to the Director-verified tree; full local battery
> green: typecheck/eslint/2217 unit/449 pgTAP/22 e2e/build). Both PR branches deleted; stale local
> branches (codex/p2-clean, worktree-agent-*, superseded fix/design-system-e2e-dark) cleaned up.
> **The owner-gated items (bottom of this section) are now the sole bottleneck to reaching users.**
>
> _Concurrency note (resolved):_ a parallel Codex session (`codex/p2-clean`) was doing the same CI-fix
> work on this shared checkout and moved the working tree; owner stopped it, Director took sole
> ownership, adopted Codex's clean rebased stack (verified identical code), merged, and cleaned up.
> Two agents on one working tree = clobber risk — see [[mos-multiagent-git-gotchas]].

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
eslint + deno-check + production build all green**. **Phase H — COMPLETE (PR #88 open → `dev`, 2026-07-05):**
4-lens battery ledger at `docs/reviews/feat-port-p3a-replay-inbox.md` (spec PASS · code-quality
FIX-THEN-SHIP → resolved, both Importants fixed `3762070` · security RE-run PASS · design SHIP);
`pre-merge-check.sh` PASS. T31 deputy-invariant source guard covers replay/ask_user/notify (6 tests);
T32 live-gated cross-stack e2e. Verified baseline: **2210 vitest + 437 pgTAP + typecheck + eslint +
deno-check + build all green** (also fixed a pre-existing BU-taxonomy pgTAP failure from a stale e2e
fixture pointing at an archived legacy BU). **Security lens: CLEAR** (no Crit/High/Med; Low-2 route
guard confirmed fixed; Low-1 unbounded *self*-notify volume tracked for the credits ledger, ship-acceptable).
**CI close-out status (2026-07-06):** the revoke lint issue was fixed and pushed, but GitHub still reported
red `verify`/`db` on #88/#89. Local CI-fix pass:
- `TaskSurface` initial load now gates only task + directory data; comments/catalogs are non-blocking and
  stale async completions are ignored. This addresses full-suite loading-skeleton flakes in
  `task-drawer.test.tsx` / `task-detail.test.tsx`.
- Home-v1 e2e contracts are aligned from old `My Week` index assertions to the live `Home` route.
- Sales dashboard e2e KPI locators are scoped to `.sdp-kpi-grid` so unrelated shell `role=group` elements do not
  inflate the expected four KPI tiles.
- Recovery e2e now rotates to a password satisfying the configured `lower_upper_letters_digits` policy; the
  set-password page also waits for the Supabase `PASSWORD_RECOVERY` session and keeps weak-password errors on
  the form instead of mislabeling them as expired links.
- Full-coverage-only timing failures in three already-passing tests were stabilized by widening the specific
  test/wait budgets without changing their behavioral assertions.
- Verified locally so far: `CI=true npm test -- src/components/tasks/task-drawer.test.tsx src/pages/task-detail.test.tsx`
  = **38/38 pass**; `CI=true npm test -- src/pages/recovery-page.test.tsx` = **10/10 pass**; targeted
  Playwright recovery = **1/1 pass**; targeted Playwright sales responsive = **2/2 pass**; broader
  Playwright subset (`auth-password-login`, `auth-signout-back`, `shell-nav`, `auth-recovery`,
  `AC-010-011-sales-dashboard-responsive`) = **6 passed / 1 skipped**; full coverage =
  **2213/2213 pass**; `npm run typecheck`, `npm run lint:ci`, `npm run build` PASS; `supabase test db` =
  **437/437 pgTAP pass on P3a base**; P2.1 reruns at **449/449** with the aggregate RPC pgTAP files.
  **GitHub CI is now GREEN** on both merged PRs (#88 `verify`+`db` pass, #89 `verify`+`db` pass).

> ### ▶ NEXT AGENT — platform workstream, port train landed on `dev`
> 1. **P3a + P2.1 MERGED to `dev`** (2026-07-06; #88→`da31e3a`, #89→`1b37b10`). Nothing to push/re-stack —
>    the CI-fix pass is on `dev` via `c96fb5a` (p3a stabilize) + `4f67080` (clean p2.1 rebase). The
>    `SHOW_USER_VIEWS` un-gate condition is MET at code level (cohort rollout still owner-gated). Ledgers:
>    `docs/reviews/feat-port-p3a-replay-inbox.md`, `docs/reviews/feat-p2.1-db-side-aggregate.md`.
> 2. **Next work is the owner-gated queue below** — the sole bottleneck to users. Also open: the standing
>    `dev`→`main` merge (owner call) now that P1/P2/P3a/P2.1 are all on `dev`.
> 3. **P3b (automations)** stays GATED on the owner's `generateLink`→`custom_access_token` staging verify (§3.3)
>    — a separate follow-up plan once verified. Do NOT build P3b until that's recorded green.
>
> Full task text + acceptance criteria: `docs/plans/2026-07-06-port-p3-automations-inbox.md`. All P3a
> UI is behind `SHOW_INBOX`/`SHOW_ASSISTANT` (default off) — flip locally to render-verify.

**Owner-gated queue (the real bottleneck — none of the above reaches users until actioned):**
1. **`dev`→`main` merge** — P1/P2/P3a/P2.1 all landed on `dev` (green CI); owner call to promote to `main`.
3. **Staging `db push`** — margin read-model · user_views · **BU remap (mutates real staging rows**,
   dual-path guard verified) · (soon) agent-persistence + replay migrations.
4. **Live deputy verify** — set `AGENT_MODEL_API_KEY` (direct Anthropic `claude-sonnet-5`) as an op
   edge-function secret on staging → Director verifies grounding + approve/deny (AC-P2-GR-003).
5. **P3b unblock** — the `generateLink`→`custom_access_token` staging check.
6. **VAPID keys** — flips PWA push delivery on (in-app Inbox ships without it).
7. **ESB PIC question** — undocumented AR-settlement API (`docs/reference/esb-settlement-api-spike.md`).

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
