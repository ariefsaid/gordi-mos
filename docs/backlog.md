# Gordi MOS — backlog (living doc; created 2026-06-10)

The durable record of what's next. NOT loaded as session context (kept out of CLAUDE.md).
Phasing detail: `docs/roadmap.md`. Locked decisions: `docs/decisions.md`.

> **NEXT SESSION: read `docs/platform-workstream-status.md` first** — that is the current
> handoff. It covers: Kitchen Module (SHIPPED 2026-06-21), access-role layer (SHIPPED),
> UI-revamp (SHIPPED PRs #29/#34/#35..#52..#66), and all outstanding items.
> `docs/ui-revamp-status.md` is the older pre-kitchen UI-revamp handoff (2026-06-19 state);
> `docs/STATUS.md` is the older pre-2026-06-19 MVP status — both kept for history.
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
> **In flight (2026-06-25):**
> 1. **Kitchen data migration** Teable→`ops` (48 products / 521 logs / 528 plans, 2026-05-17→06-25) —
>    PULLED + mapping + owner-decisions locked; **LOAD pending** (memory `kitchen-data-migration`). Must carry
>    `posted_to_esb`/`esb_doc_num`/`posted_at` verbatim → **no ESB re-POST clash** (app is in live use). batch_id
>    nulled (Teable 80 batch_ids / 505 logs vs ops UNIQUE). Replaces the test-seed kitchen data. 3 staff people
>    (Riri=riri@gordi.id; Ibnu/Ansori=meta placeholder emails).
> 2. **Concurrent agent** building kitchen **feature-parity + the ESB-push oracle in a worktree** —
>    coordinate, disjoint paths ([[mos-multiagent-git-gotchas]]); don't collide on ops kitchen schema/worker.
> 3. Open PR **#57** (e2e auth fix, non-blocking). The old `feat/kitchen-log-redesign` redesign + #67
>    doc-consolidation merged/superseded earlier.
>
> Git-hygiene: NEVER `git push origin HEAD:main` from a feature branch; rebase onto latest main
> before merging; feature code = branch → PR → merge; demo-login orphan → `supabase db reset`
> relinks (or PR #57 heals it permanently once merged).

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

## Deferred (post-MVP — see roadmap "Post-MVP")
Objectives/outcomes · programs/processes · SWPs · RACI matrix UI · OKR cascade ·
roastery app · ESB write-back visibility · shared UI package extraction.

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
