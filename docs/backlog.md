# Gordi MOS — backlog (living doc; created 2026-06-10)

The durable record of what's next. NOT loaded as session context (kept out of CLAUDE.md).
Phasing detail: `docs/roadmap.md`. Locked decisions: `docs/decisions.md`. How the requirement
bar itself moved (era timeline E1→E6): `docs/requirements-evolution.md`.

> **NEXT SESSION: read `docs/platform-workstream-status.md` first** — that is the current
> handoff. It covers: Kitchen Module (SHIPPED 2026-06-21), access-role layer (SHIPPED),
> UI-revamp (SHIPPED PRs #29/#34/#35..#52..#66), and all outstanding items.
> `docs/ui-revamp-status.md` is the older pre-kitchen UI-revamp handoff (2026-06-19 state);
> `docs/STATUS.md` is the older pre-2026-06-19 MVP status — both kept for history.
>
> **2026-07-06 — P3a Inbox/replay train + P2.1 aggregate RPC are built, pushed, and still CI-gated.**
> PR #88 (`feat/port-p3a-replay-inbox`) and PR #89 (`feat/p2.1-db-side-aggregate`, stacked on #88)
> are open against `dev`, not merged. The full P3a review battery is recorded at
> `docs/reviews/feat-port-p3a-replay-inbox.md`; P2.1 at `docs/reviews/feat-p2.1-db-side-aggregate.md`.
> The first CI red was the missing `mos.create_notification` EXECUTE revoke; that fix was pushed.
> GitHub then exposed additional verify/e2e reds. Current local CI-fix pass: non-blocking task comments
> load in `TaskSurface`, stale async task loads are ignored, Home-v1 e2e assertions are aligned to the live
> `Home` index route, Sales dashboard e2e KPI locators are scoped to `.sdp-kpi-grid`, and the recovery e2e
> now rotates to a password satisfying `lower_upper_letters_digits` while weak-password errors stay on the
> set-password form; full-coverage-only timeouts were stabilized without changing their behavioral oracles.
> Local P3a-base gates are green (2213 Vitest coverage, 437 pgTAP, targeted Playwright 6 passed/1 skipped,
> typecheck, lint, build). P2.1 adds the aggregate RPC pgTAP files and should rerun at 449 pgTAP after
> re-stack. Treat GitHub CI as **not green** until this fix is pushed/re-stacked and GitHub checks rerun
> green.
> Canonical state: `docs/platform-workstream-status.md`; task detail:
> `docs/plans/2026-07-06-port-p3-automations-inbox.md`.
>
> **2026-07-04 EOD — FOUR SLICES SHIPPED TO `dev` (full batteries in `docs/reviews/`); P2 in flight:**
> Home v1 + margin read-model (§7a interim contract) · helper dedup · **port P1 substrate**
> (viewspec + user_views + /dev/views harness, flags off) · **BU taxonomy remap** (6 team BUs,
> stable codes). P2 deputy train building on `feat/port-p2-panel-runtime` (edge functions done +
> deno-check clean; panel UI/harness/firewall via GLM). See
> `docs/platform-workstream-status.md` §Current focus for the full state + owner-gated queue
> (dev→main offer · staging db push ×3 · ESB PIC question).
>
> **2026-07-04 — IA NORTH-STAR + can() ACCEPTED (ADR-0019 / ADR-0020, OD-IA-1/2):** five destinations
> (**Home / Work / Operate / Plan / Inbox**; activity is a dimension, never a nav root); taxonomy
> **BU=team / Activity=workstream / Revenue stream=money lens** (old BU seed rows need re-mapping —
> tracked below); My Week → a *panel* on Home; MOS owns **settlement grain** for B2B AR + retail pending
> bills (ESB write-back gated on an API spike — inventory `gordi-esb-bak` first); reference data = ESB
> feeds / MOS owns; vendored `doc-editor` + `data-grid` kit primitives (AGPL out); phone-first + bottom
> tabs binding; bilingual en/id string catalog from the Home slice on; **backup/restore drill gates the
> AR bridge**; **ESB spike RESULT (2026-07-04): settlement write-back LIKELY-NOT → reconciliation
> branch** (`docs/reference/esb-settlement-api-spike.md`; owner action: ask ESB PIC re undocumented
> endpoints); authorization moves to **`shared.can(capability)` + admin-editable roles** (new modules
> from day one, existing RLS opportunistic). **ORDER: Home v1 + `sales_margin_daily` → agent port
> (P1–P3; ESB spike parallel) → Work spine (→ live management-week validation) → AR/pending-bills
> bridge → Plan/reference data → activity roll-ins.** Full spines: `docs/adr/0019-ia-north-star.md`,
> `docs/adr/0020-capability-authorization.md`.
>
> **2026-07-02 — Issue 1 COMPLETE (kit born); reporting live on staging; all on `dev`, not `main`:**
> - **Sales dashboard SHIPPED to `dev`** — the value-first Issue-1 build that *births the primitive kit*:
>   5 registry-ready primitives (`KPITile`/`ChartFrame`/`DataTable`/`FreshnessLabel`/`CutToggle` in
>   `mos-app/src/components/dashboard/`), the reporting DAL (`src/lib/db/reporting.ts`), the
>   `SalesDashboardPage` (`/mos/sales`, finance/admin-gated). **Director render-verified** populated +
>   responsive + B2B/Roastery end-to-end; 1725 tests green. Spec `docs/specs/sales-dashboard.spec.md`;
>   design-plan `docs/plans/2026-07-02-sales-dashboard-design.md`.
> - **`reporting.sales_daily_revenue` LIVE on staging** (Supabase Cloud `hvnwcsmkdeqmgqlbwflm`) —
>   snapshot-fed from the OLAP warehouse @03:30 JKT (day × channel × branch → revenue + txns). Spec
>   `docs/specs/reporting-sales-snapshot.spec.md`, plan `docs/plans/2026-07-01-reporting-sales-snapshot.md`,
>   runbook `docs/reference/warehouse-online.md`.
> - **ADR-0017 D3 extension + OD-AN-2 (2026-07-02):** `reporting` is a growing SET of bounded curated
>   read-models; drill-down is mostly a query-DSL problem not new-data; two-tier drill-down (deputy reads
>   curated read-models, server analyst agent explores raw OLAP + promotes); bounded curation ≠ wholesale
>   duplication. **MOS = analysis surface, OLAP = analysis engine.**
> - Node pinned to **22** via `mos-app/.nvmrc` (Vite needs 20.19+/22.12+).
> - **NEXT (three parallel, non-colliding):** (1) **`sales_margin_daily`** read-model — margin/COGS depth
>   from the warehouse `v_daily_cogs_comparison` (the "shallow data" answer + cashflow lens); (2) **font
>   regression fix** (see Debt — `.tabular`→SF Mono violates DESIGN.md — DONE 2026-07-02); (3) **Issue 2**
>   — extract the kit into the primitive **registry** (ADR-0017 §4a). Then Issue 3 (query-DSL/compiler).
>   **⚠ 2026-07-04 re-scope (ADR-0018): Issues 2–3 are no longer grown from scratch — the registry + DSL
>   arrive by port from PMO as the ADR-0018 P1 train (substrate, shippable with zero agent); see the
>   2026-07-04 banner above.** Memory `agent-native-ui-program`.
>
> **2026-06-30 — TWO NEW TRACKS (decisions on `dev`, not yet `main`):**
> - **Agent-native / user-composed UI — ADR-0017 ACCEPTED** (merged to new `dev` branch; +ADR-0010
>   2026-06-30 amendment; CONTEXT.md glossary; OD-AN-1). Deputy/RLS dual-plane model; **value-first build**
>   (Issue 1 = mobile-first ops dashboard that births the primitive kit → registry → DSL/compiler →
>   `user_views`+renderer → manual builder → agent sidecar behind a MOS spike). **NEXT = `feature-forge`
>   spec for Issue 1.** Full track in `docs/platform-workstream-status.md` §Current focus; memory
>   `agent-native-ui-program`.
> - **OLAP ESB warehouse ONLINE on the Tencent VPS** (PG17, loopback, self-sustaining op-native sync @3:05
>   JKT, monitored). Runbook + open owner-actions: **`docs/reference/warehouse-online.md`**. **NEXT on this
>   track = the `reporting` migration + warehouse→Supabase snapshot job** (feeds the sales dashboard).
>   Owner-actions pending: CloudMonitor webhook exposure + its 🔴 auth fix, a git deploy key.
>
> **Current main (2026-06-25):** kitchen Module shipped (#45/#41/#43/#62/#64/#65/#66); UI-revamp on main;
> **Strategy→Execution cascade FIRST SLICE SHIPPED** — PR #69 (task-centric: `objective_id`/`work_line_id`
> on `mos.tasks` + `mos.objectives`/`mos.work_lines` lookups + group-by-work-line + workload caption +
> pickers) and follow-ups PR #70 (app-shell mobile-overflow fix, ADR-0015 naming lock, curated e2e AC-230,
> machine **pre-merge review gate** `scripts/pre-merge-check.sh`). Memory: `cascade-first-slice-state`.
>
> **Staging is LIVE (2026-06-25):** Supabase Cloud + Cloudflare Pages at **https://gordi-mos.pages.dev/mos/**
> (testing only; **prod stays self-hosted**, ADR-0010). Setup + 6 gotchas in `docs/environments.md` (staging
> row) + memory `staging-deploy-state`. Cloud ref `hvnwcsmkdeqmgqlbwflm` (Singapore); DB connection string +
> Teable PAT in op (vault `AS`).
>
> **DONE (2026-06-26..29):**
> - **Kitchen data migration LOADED to staging** — 48 wip / 521 logs / 524 plans into `ops` on Supabase
>   Cloud, `posted_to_esb`/`esb_doc_num`/`posted_at` carried verbatim (no ESB re-POST), batch_id nulled,
>   fidelity-verified. **3 staff logins WIRED:** Riri=`riri@gordi.id` (ops_lead), Ibnu/Ansori=
>   `<name>@ops.gordi.local` (member) — temp pw, owner rotates. Synthetic-email domain `@ops.gordi.local`
>   (ADR-0011 D2 amended). Memory `kitchen-data-migration`.
> - **ESB push worker BUILT + SHIPPED** — extended `gordi-kitchen-app` (not a new service) to drain the MOS
>   outbox; gordi-kitchen-app PRs #1/#2/#3 + gordi-mos #76 (service_role grants) / #77 (docs). GOO validated
>   live. **Outstanding = deploy + flip on ris-dev** (owner-gated). `docs/platform-workstream-status.md` §3 +
>   `docs/reference/esb-goo-integration.md`; cross-repo ledger `docs/reviews/kitchen-app-worker-prs.md`.
> - **Task-drawer collapse-control fix** merged (PR #78).
>
> **READY TO MERGE — admin user management (`feat/admin-user-mgmt`, PR #80):**
> - `/admin/people` admin-only screen (list + search/status-filter, create person +optional login, reset pw,
>   disable/enable, grant/revoke roles, archive). Memory `admin-user-mgmt-state`.
> - **ADR-0016**: 3 admin-gated `SECURITY DEFINER` RPCs = interim STAGING provisioning; thin FastAPI backend
>   (ADR-0010 D6) stays PROD authority. Spec + plans under `docs/`.
> - **Review battery Round-2 = all cleared** (design PASS rendered-live; spec/CQ/security FIX-THEN-SHIP; H-1/M-1
>   security fixed, pgTAP `56`); `pre-merge-check.sh` exit 0; 1321 tests. Ledger `docs/reviews/feat-admin-user-mgmt.md`.
> - **NEXT: owner merge #80 → `supabase db push` to staging → rebase the stacked `feat/cascade-catalog` onto
>   main and merge.** Prod-deferred (ADR-0016): email validation, temp-pw entropy, clipboard auto-clear → thin backend.
>
> **READY, stacked behind admin-mgmt — cascade catalog (`feat/cascade-catalog`, worktree):** Objectives(admin) +
>   Projects&Processes(ops_lead/admin) management surfaces; review battery PASS, `pre-merge-check` exit 0; ships
>   after admin-mgmt lands (rebase onto main). Memory `cascade-catalog-state`.
>
> **Prod provisioning RESOLVED (2026-06-29, ADR-0016 amendment + D11 audit):** the thin FastAPI backend
>   (ADR-0010 D6) is **RETIRED** — both its concerns left the plan (ESB → `gordi-kitchen-app`; provisioning →
>   the `SECURITY DEFINER` RPCs). D11 security audit returned **CLEAR FOR PROD** (single-org). Prod shape =
>   SPA + Supabase (data/auth/RLS + provisioning RPCs), no bespoke MOS backend tier.
> **Follow-ups (open):**
>   - **B2B blocker (Medium, D11 audit):** `admin_create_login` cross-org duplicate-email → raw `23505`
>     (opaque error + minor cross-tenant existence oracle). Fix (clean error, no cross-org echo + stop
>     forwarding raw PG text in `admin-users.ts`) **before turning on multi-org**; unexercised single-org.
>   - **Advisory (D11):** GoTrue-upgrade smoke test in the prod runbook (provision→sign-in→reset→disable→enable);
>     `for update` on the create-login person read.
>   - Minor: status-pill radius 6px vs full (DESIGN.md). (`--radius-lg` 12px regression DONE #82; e2e-auth #57 DONE.)
>
> **In flight (2026-06-26) — two STACKED feature branches (NOT yet on main), built concurrently:**
> 1. **`feat/admin-user-mgmt`** (concurrent agent) — admin user provisioning: People admin page, login
>    create/reset/enable, role grant/revoke, `AdminRoute` guard, `ADMIN_SECTIONS` nav, interim
>    provisioning RPCs (ADR-0016). Committed on its branch in the **main checkout**; review/merge owned
>    by that workstream.
> 2. **`feat/cascade-catalog`** (this workstream — git worktree `../gordi-mos-cascade`) — in-app
>    management of **Objectives** (admin) + **Projects & Processes** (ops_lead/admin) under Workspace:
>    add/rename/archive, RLS tighten (objectives→admin-only, migration `20260626000003`), Work-line→
>    **Project/Process** UI relabel (ADR-0015), shared `CatalogManager`, `RequireAccessRole` guard.
>    **BUILT + full review battery PASS** (`docs/reviews/feat-cascade-catalog.md`, `pre-merge-check.sh`
>    green); spec `docs/specs/cascade-catalog.spec.md`, decision **OD-C-2**, plan
>    `docs/plans/2026-06-26-cascade-catalog.md`. Memory: `cascade-catalog-state`.
>    ⚠️ **Topology:** `feat/cascade-catalog` is **stacked on an OLDER commit of `feat/admin-user-mgmt`
>    (`7445396`)**, reusing its role-guard + nav-section pattern. **Merge order: admin-user-mgmt FIRST,
>    then rebase `feat/cascade-catalog` onto updated main and merge.** Deploy prereq: apply migration
>    `20260626000003`. Non-blocking follow-up: collapse `AdminRoute` into `RequireAccessRole` after both land.
>
> Git-hygiene: NEVER `git push origin HEAD:main` from a feature branch; rebase onto latest main
> before merging; feature code = branch → PR → merge; demo-login orphan → `supabase db reset`
> relinks (or PR #57 heals it permanently once merged). Render auth-gated pages via vite-on-worktree-port +
> the Director-demo-login persona before claiming UI done (code review misses visual defects).

## ✅ Phase 0 — frontend mockups (DONE)
- [x] **P0-1 — IA proposals.** `design-architect` → 2–3 competing static HTML shells for `/mos`
  (`docs/design-mockups/proposal-IA-<n>-<slug>.html`). Resolves WALL-1 into concrete options.
- [x] **P0-2 — Key-screen mockups.** My Tasks list · task detail · weekly update write + manager review ·
  daily ops feed. `docs/design-mockups/mock-<screen>.html` built; superseded by the shipped app (Phase 2).
- [x] **P0-3 — Owner IA pick.** DONE → OD-P0-6 (IA-8 balanced My Week) after two density redlines
  (OD-P0-7).

## ✅ Phase 1 — foundation (DONE)
- [x] P1-1 scaffold `mos-app/` + CI gates + Playwright harness — DONE, PR #1.
- [x] P1-2 Supabase foundation — DONE, PR #2: 6 migrations, 10 pgTAP / 41 assertions, ADR-0001.
- [x] P1-3 Auth — DONE, PR #3: login (password+magic link), session, viewer/isManager, guards,
  orphan fail-closed, recovery flow. 59 unit · 7 e2e · 47 pgTAP.
- [x] P1-4 App shell — DONE, PR #4: IA-8 rail/header/sections, My Week, mobile drawer, manager team
  module. 128 unit · 6 e2e.

## Security-audit deferrals (from P1-2 audit, 2026-06-11 — neither blocks ship)
- **L4:** no acyclicity constraint on `shared.roles.reports_to_role_id` → add CHECK/trigger when
  role-editing UI ships (Phase 2+).
- **L5 (extended by P1-3 audit):** P3-1 MUST: disable open signup both keys + live 422 probe ·
  password policy (≥8, mixed) · session `timebox` ~24h + `inactivity_timeout` · tight CSP · prod
  **Resend** SMTP (OD-P1-11). Password login works without SMTP.

## ✅ Phase 2 — first slice (DONE; P2-4 superseded by kitchen Module — see Phase 3)
- [x] P2-1 tasks + ownership + lightweight RACI — COMPLETE (PRs #5/#6/#7).
- [x] P2-2 weekly updates (write + manager review) — COMPLETE (PRs #8/#9/#10).
- [x] P2-3 Daily Log (daily ops feed, manual entry) — COMPLETE (PRs #11/#12).
- [~~P2-4 kitchen → ops mirror~~] **Superseded** by full kitchen Module in Phase 3 (ADR-0010/12,
  OD-P4). The ops Module is now built as a first-class MOS Module, not a mirror.

## ✅ Phase 3 — shipped (2026-06-13 → 21, all on `main`)

### Platform-foundation workstream (OD-P4, ADR-0010/11/12) — SHIPPED 2026-06-19..21
- [x] **ADRs + docs** — ADR-0010 (platform topology), ADR-0011 (auth/RBAC), ADR-0012 (ESB outbox),
  `docs/platform-workstream-status.md` (PRs #33/#36/#38).
- [x] **Kitchen Module spec** — `docs/specs/kitchen-module.spec.md` (PR #32).
- [x] **Access-role layer** — `shared.person_access_roles` table, JWT-claim hook, viewer integration
  (PRs #41/#43). Fixed-role set: admin · ops_lead · finance · member (+ derived `manager`).
- [x] **Kitchen Module DB substrate** — typed `ops.*` tables (`ops.wip_items`, `ops.kitchen_plans`,
  `ops.kitchen_logs`, `ops.kitchen_stock`), `integrations.esb_push` outbox, approval RPC, RLS,
  14 migrations (PR #45). Daily-Log mirror **deferred/removed** (migration `_014`; re-add when Daily
  Log module ships). Reject provenance, stock-for-date RPC included.
- [x] **Kitchen Module UI — all 5 screens** (PR #62):
  - `/mos/kitchen/log` — S1 daily log capture (WIP item stepper, action-type segmented control)
  - `/mos/kitchen/plan` — S2 plan editor (ops_lead/admin) + pesanan 14-day read-only view (member)
  - `/mos/kitchen/review` — S3 review/approve queue (ops_lead/admin)
  - `/mos/kitchen/stock` — S4 stock view (all authed members, read-only)
  - `/mos/kitchen/pushes` — S5 ESB push outbox monitor (ops_lead/admin)
- [x] **Kitchen sidebar nav** — role-aware Kitchen group in RailNav (PR #64).
- [x] **Kitchen dev seed** — 32 real Gordi WIP items + sample plan (PR #65).
- [x] **log_date bug fix** — plan/log queries used wrong column name `date` → `log_date` (PR #66).

  **Parity directive (OD-K-1, 2026-06-21):** kitchen = functional parity with the OLD app
  (`gordi-kitchen-app`) + better UI. NO new logic. Scope: logging + daily plan + review/approve +
  stock auto-compute + ESB push outbox + pesanan 14-day view. NOT in scope: receiving/GR,
  stock-opname, ESB-inventory reconciliation, multi-plan versioning, opening-balance seed, reports.
  Transfer-over → availability rejects (not caps); bulk-approve approves all Submitted.

### UI-revamp workstream (OD-P4/P5) — SHIPPED 2026-06-19..21
- [x] **Structural conventions** — `@/` alias (#30), no-hardcoded-colors (#31), named-exports (#34),
  kebab-case filenames (#40), drop Inter font dep (#55), drop components/ui barrel (#56).
- [x] **UI revamp PRs #1–6** — brand-left TopBar + nav-only RailNav (#42) · record table craft +
  TasksWorkspace decomposition (#47) · two-column hybrid record page (#49) · My-tasks card wired
  to real R/A data (#50) · ⌘K command palette + task-search (#51) · states + dark-mode AA pass (#52).
- [x] **Fidelity pass** — DM Sans + Tasks chrome + group-toggle (#53), +2px global type scale (#54).

### Earlier Phase 3 items (2026-06-13..16) — already on `main`
- [x] Dev demo login — PR #13.
- [x] Agentic workflow sync (4-lens, `docs/jtbd.md`, model-discipline).
- [x] Tasks split-view redesign — PRs #15–#18 (ADR-0007).
- [x] CI-green fix — PR #16.
- [x] Tasks DB-view redesign — PR #19 (ADR-0008, OD-P3-6/7/8).

## ⏳ Kitchen UI redesign — branch `feat/kitchen-log-redesign` (NOT merged; awaiting owner sign-off)
**OD-K-5** (2026-06-21; scope expanded 2026-06-22). Owner rejected the shipped stepper kitchen UI
(single-column 32-row steppers, no density, One-Blue violation). Phase-0 divergence → 3 mockups
(`docs/design-mockups/kitchen/`) → owner pick **A dense data-table + C KPI strip (desktop) + B floor-fast
cards (phone)**, one responsive screen via the `useIsDesktop()` 768px reflow + full-bleed
`PageFrame variant="data"`. Scope expanded to **all 4 functional screens** (Log · Plan · Pesanan ·
Stock · Review); the ESB-pushes page is untouched.
- Reusable pieces in `mos-app/src/components/kitchen/`: `kitchen-table.css` (shared dense grammar),
  `KitchenToolbar`, `KitchenKpiStrip` + per-screen KPI selectors, `qty-cell`, log/stock/pesanan/review
  table+cards, `kitchen-status`, `kitchen-group-header`.
- **PARITY HELD:** data layer untouched except a read-only `category` added to 2 SELECTs; submit payload
  byte-identical; FR-022/023 gates + Review approve/reject/bulk preserved.
- Log fixes landed: 3 One-Blue color defects, F1 sticky Submit bar (shell `h-screen`), F2 seed
  categories, F3 disable-submit-on-unresolved-note; **app-wide phone horizontal overflow** fixed
  (top-bar collapse + grid `minmax(0,1fr)`); action-type segmented control made clearly interactive.
- **Gates green** (1347 unit · typecheck · lint). Reviews: Log got the full cross-family battery; Plan/
  Stock/Review built by gpt-5.4 (z.ai 5h-limit fallback) + Director vision/parity-reviewed.
- Plans: `docs/plans/2026-06-21-kitchen-log-redesign.md` + `docs/plans/2026-06-22-kitchen-screens-redesign.md`.
- [ ] **NEXT (top gate):** owner visual sign-off + color redlines (built defaults: over=amber, under=red)
  → Director rebases + merges to main → **close PR #67 as superseded** (it edits the same status docs).

## ▶ NOW — Outstanding (as of 2026-06-22)

### 1. Merge the kitchen UI redesign (above) — top gate
Owner visual sign-off on `feat/kitchen-log-redesign` → Director merge. Gates all downstream kitchen
go-live work (e2e, deploy) and unblocks closing PR #67.

### 2. PR #57 — e2e auth fix (open, non-blocking for development)
PMO-style auth model: e2e logs in AS the dev personas; `global-setup` is additive/idempotent (heals
dev login instead of stealing rows). Dedicated e2e-only users for destructive cases (orphan, recovery).
**Merge when green** — heals the recurring demo-login orphan permanently. Branch: `fix/e2e-dev-login-isolation`.

### 3. Kitchen e2e / qa-acceptance layer (MISSING — must be built)
There are NO curated e2e journeys for the kitchen Module. The `date`/`log_date` SPA↔DB bug (fixed in
PR #66) slipped through because unit tests mock Supabase — a live-query bug is invisible to unit tests.
**Lesson: verify-live is required for any DB-column-name or RPC-contract change.** Kitchen needs:
- E2e spec covering the core S1→S3 journey (log → review → approve).
- Any future kitchen DB column rename / RPC change must be verified against a running stack, not just
  unit tests.

### 4. ESB push worker (not built yet)
Port the old `esb_poller`/`esb_client` from `gordi-kitchen-app`; reconcile bulk-approve batch-grain.
The `integrations.esb_push` outbox + `ops.approve_kitchen_log` RPC are ready; the worker is missing.
GOO target = TEST DATA ONLY (untrusted env; spec FR-084, OD-K-3).

### 5. Production deploy (Phase 3.1, plan #33, owner-gated; schedule after the redesign merge)
Runbook: `docs/environments.md` (§Production deploy) + `supabase/README.md` (§Production email).
L5 hardening checklist (disable open signup + live 422 probe · password policy · session timebox ·
CSP · Resend SMTP). Open owner Qs: API hostname under CF Tunnel · secret-zero approach · R2/PostHog/
Healthchecks accounts. **Blocked on owner decision**.

### 6. Thin FastAPI backend + user provisioning
Hosts the outbox worker + user provisioning for kitchen members (prereq for kitchen go-live).

## ⏳ Tasks tidy-up + UI-convention re-converge (branch `fix/tasks-tidy-reconverge`, NOT merged)
Post-ship design review found `/tasks` drifted from its signed mockup. Two commits on the branch:
- `8699614` tidy-up → re-converge to `tasks-dbview-final.html`.
- `44e9ce1` conventions → view-tab strip REMOVED, chevron filter, grey selection, max-width:1280.
- Gates green. **NEXT:** owner verifies wide-width → merge → update spec (remove FR-121/AC-122).

## Doc & code debt (non-blocking)
- [x] **`.tabular` → SF Mono app-wide DESIGN.md violation — FIXED (2026-07-02).** Re-imported
  `@fontsource-variable/inter`, scoped to a new `--font-tabular` token used ONLY by `.tabular`
  (`mos-app/src/index.css`); body/UI stays DM Sans/Plus Jakarta. Regression guard added
  (`src/styles/css-var-wiring.test.ts`) asserting `.tabular` never references `--font-mono` again.
- [ ] **ADR-0007 Decision snippet uses pre-impl names** (`TasksSplitView`/`TaskSurface` children);
  as-built is `TasksLayout` + `TaskDrawer`(→`TaskSurface`). Add an "As-built" note.
- [ ] **`docs/environments.md` P3-1 section is a stub** — write the actual ris-dev deploy runbook.
- [x] **e2e dev-login fix** — PR #57 (PMO-style auth model, heals demo login permanently). Merge when green.
- [ ] **auth-recovery.spec.ts e2e flake** — intermittent mailpit timing under full-suite load.
  Stabilize (poll with retry, or isolate the recovery mailbox).
- **P2-1a / P2-2a quality deferrals** — pgTAP fixture extraction, Promise.all, db/client.ts
  wrapper — see old backlog entry; non-blocking.

## 🧱 THE WALL — open owner decisions
- ~~WALL-1~~ CLOSED → OD-P0-6.
- ~~WALL-2~~ CLOSED → OD-P0-4.
- ~~WALL-3~~ CLOSED → Kitchen Module built (OD-K-1..4). ESB worker still needed.
- ~~WALL-4~~ CLOSED → Kitchen uses typed `ops.*` tables; Daily Log mirror deferred until Daily Log
  module ships. Director rec = generic typed events validated by parity build.

## Polish / follow-ups (non-blocking)
- UserChip menu: outside-click dismissal (Esc-only today).
- P2-2c — transitive/CEO-org-wide review roster (moot at Gordi scale today).
- P2-1c polish deferrals: create-form R/A native `<select>` · shared `<PersonField>` · generalized
  `ConfirmDialog` · `PersonPicker` empty state.
- P2-2b polish: shared `<TintPill>` · inline-style → co-located CSS · marker-picker up-flip.

## ▶ Pre-F hardening (from the 2026-07-07 round-2 audit — BLOCKS rollout; task #17)
Source: `docs/reviews/mvp-readiness-audit-round2-2026-07-07.md`. Each via the review loop.
- **A1 [Sec High, MUST-FIX]** `mos.tasks` same-org reference guard (R/A/BU/C/I/created_by) — trigger/RPC +
  pgTAP; the guard pattern exists on ops/kitchen logs, not tasks.
- **A3 [Rel/Obs High, MUST-FIX]** React `<ErrorBoundary>` + router `errorElement` + a telemetry/error sink.
- A2 `comments.entity_id` FK + entity-aware read-guard. · A4 `reporting_writer` org-scoped RLS (drop `using(true)`).
- A5 budget capture SECURITY DEFINER RPC + server-recompute COGS (stop storing a client double as capture-of-record).
- A6 (cheap) CI coverage `include`→`src/**` globs + set `VITE_SHOW_PLAN_BUDGET=true` so `AC-PB-012` e2e runs.
- **F (owner-gated) absorbs ops/infra:** ESB worker DEPLOY · edge rate-limit/quota · VAPID · prod auth config
  (`enable_signup`/`confirmations`) · request-id tracing · admin audit trail.

## ▶ Pre-rollout UI polish (from the 2026-07-07 4-lens design review — gates flag-flip; task #19)
Source: `docs/reviews/design-mvp-push-2026-07-07.md`. All on **dark** surfaces → don't block `dev`; gate the cohort flag-flip.
- **[BLOCKER] B-1/C-1** Follow-up row drills `/work/follow-ups/:id` but no route exists → 404. Add read-only detail route or pull the link.
- **[BLOCKER] D-2** Home AR + AP placeholder slots are dead-end (anchor A4). AR → `/work/follow-ups?filter=overdue`; AP → drill or explicit visibility-only.
- Polish: follow-up pill per-state dot+tint (A-1) · Button-ify follow-up/cascade controls + `seg` for Mine/All (A-2,A-3) · `SkeletonRows` on follow-ups+cascade (B-2) · transition success toast (B-3) · budget token drift `--border`/600 overline (A-4,A-5) · cascade inline-px→grid grammar (A-6) · localize follow-up enum via `t()` (D-7).
- **[owner confirm] C-3** Plan gated finance/admin but jtbd assigns pricing pre-flight to Marketing/BU-head — confirm intended Plan visibility.
- **Render debt:** authenticated states were NOT rendered (local Supabase port/seed mismatch) — Director owes a per-persona render taste-check before sign-off (owner judges look-vs-mockup).
- Add 4 regression-invariant tests (settle-needs-evidence · no label-only Home slots · `/work/follow-ups/:id` resolves · BU-scope hides whole-co money) — see ledger.

## Near-term follow-ups (from the 2026-07-06 IA/product grill — see `docs/decisions.md` "Continued grill session 2")
- **Shift scheduling / rostering** — flagged NEAR-TERM by owner ("manual today, needed sooner than later").
  Contributor Home is capture-first w/ no roster in MVP but leaves a "your shift today" seam; this fills it.
- **Notification re-push trigger** — re-nudge untriaged/unread Inbox notifications after an interval (single
  PWA push is insufficient). Near-term; cheaper than any external channel.
- **External notification channel** — **Telegram or in-app group chat** (WhatsApp deprioritized — too tedious
  to integrate). Channel-adapter seam (P3a) takes either; doorbell-only, conversation stays on the entity.
- **Agent experience batch** (next agent work, before automations): C2 safe-markdown · C3 typed-widget tables
  · C4 layered prompt. Then C1 automations (P3b). See `docs/specs/agent-capability-expansion.md`.

## Deferred (post-MVP — see roadmap "Post-MVP")
Objectives/outcomes · programs/processes · SWPs · RACI matrix UI · OKR cascade ·
roastery app · ESB write-back visibility · shared UI package extraction ·
agent attachments (C5) · agent credits/metering (C8) · roastery QC/cupping module ·
bank-feed auto-matching (AR recon) · certified-metric admin UI · WhatsApp channel.

---

## Gotcha / workflow notes

### verify-live requirement (lesson from kitchen log_date bug, 2026-06-21)
The `date`/`log_date` SPA↔DB column-name mismatch (PR #66) slipped through unit tests because they
mock Supabase. A contract-level bug (wrong column name, wrong RPC signature) is invisible to mocked
unit tests — it surfaces only against a real running stack. **Rule: any DB-column-name reference or
RPC-call signature change must be verified against a live local stack, not just by unit tests.** A
curated e2e journey or a manual smoke-test is sufficient; the point is that real PostgREST rejects it
with a 400 while mocked calls pass silently.

### Demo-login orphan (recurring until PR #57 merged)
Every `npx playwright test` run clobbers the `*.dev` persona `user_id` links → "Your account isn't
set up yet." Quick fix: `supabase db reset` or `UPDATE shared.people p SET user_id=a.id FROM
auth.users a WHERE p.email=a.email AND p.email LIKE '%.dev@example.test';`. PR #57 fixes permanently.

### Structural conventions (enforced by lint)
No `../` imports (use `@/`), no hardcoded colors (use `--ds-*`), no default exports in `src`.

### ESB / GOO safety
GOO (Core API `stg7.esb.co.id/core-stg`; `stg-erp.esb.co.id` was the web UI — corrected 2026-06-26) =
TEST DATA ONLY. Never push real GKID product/BOM IDs to GOO. Real-data validation = single-WIP proof-push
on GKID at the owner-gated switch (OD-K-3/K-4). NB: `/assembly-actual` isn't validatable on GOO (standard-
costing tenant); Transfer path is. See `docs/reference/esb-goo-integration.md`.
