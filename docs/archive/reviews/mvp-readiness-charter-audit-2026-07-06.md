# MVP-readiness charter audit — gpt-5.5 (cross-family), Director-verified

- **Auditor:** gpt-5.5 via pi (cross-family), 2026-07-06. **Verified by:** Director (nav + work-spine claims spot-checked against code — both confirmed).
- **Oracle:** `docs/product-expectations.md` (verbatim charter + per-layer DoD). **Scope:** `dev` @ 4a16855.
- **Verdict:** NOT MVP-ready. Blockers: Work spine held off-dev · five-destination nav shell not built · AR/Follow-up + Plan not built · dev ahead of main/staging · deploy/security gates open.

---

# MVP-readiness audit — Gordi MOS vs product charter

## 1. Verdict up top

**MOS is not MVP-ready today for the current E6 charter.** On `dev`, the app has a strong foundation and several real shipped surfaces (Home, tasks/RACI, weekly updates, Daily Log, kitchen module, sales reporting, agent panel, Inbox), but the accepted charter now defines a five-destination operating system for ~30 people, and the **Work spine is still held off-`dev`**, while **Plan/reference data and AR/follow-up reconciliation are not built**. The biggest blockers are: (1) Work spine/follow-up family not merged, (2) Plan/COGS/reference data not implemented, (3) AR/pending-bills bridge + backup gate not implemented, (4) conservative staging/main lag behind `dev`, and (5) rollout/deploy/security-hardening gates remain owner-gated. Shortest path: merge Work spine after required re-review/render check → build minimal Follow-up/AR reconciliation with backup drill → build Plan COGS/reference-data v1 → promote `dev` to staging/main with live secrets and full pre-merge/deploy gates → run a real 15–30-person pilot.

## 2. Charter / Definition-of-Done conformance table

### Product charter expectations

| Charter expectation | Verdict | Evidence | Specific gap |
|---|---:|---|---|
| Director / Orchestrator posture | PARTIAL | Charter requires clarifying/challenging/scaling/simplicity in `docs/product-expectations.md:12`; operating-model review battery is enforced in `CLAUDE.md:38-54`; many ledgers exist under `docs/reviews/`. | Process is documented and often followed, but shipped state still includes docs/status drift and held work; not enough to claim MVP-readiness. |
| Architecture: production-ready scalable MVP | PARTIAL | Schemas exist for `shared/mos/ops/integrations` in `supabase/migrations/20260611000001_schemas.sql:4-7`; `reporting` added in `20260701000001_reporting_sales_daily_revenue.sql:3`; RLS/org seams across core tables (`mos.tasks` `20260611000007...:2-5`, RLS `20260611000009...:62-83`). | Architecture is credible, but production deploy/hardening and several E6 product planes are unfinished; `main/staging` are behind `dev`. |
| Existing repo reverse-engineering / refactoring | PARTIAL | Specs/reviews exist for existing surfaces (`docs/specs/tasks-raci.spec.md`, `weekly-updates.spec.md`, `ops-log.spec.md`, `kitchen-module.spec.md`; ledgers in `docs/reviews/`). | Audit found stale status sections and unmerged branches; no single current release ledger proving the whole `dev` app is coherent for MVP. |
| Performance | PARTIAL | Hot-path indexes exist on tasks (`20260611000007_mos_tasks.sql:24-32`), Daily Log (`20260612000004_ops_log_entries.sql:27-34`), kitchen logs (`20260620000003_ops_kitchen_logs.sql:32-34`), reporting (`20260704000002_reporting_sales_margin_daily.sql:45-48`); DB-side aggregate avoids capped client aggregation (`20260707000001_mos_aggregate_compiled.sql:1-23`). | Performance posture is slice-level, not rollout-proven; COGS/margin root-cause fix is branch/deploy-not-fully-validated per `docs/platform-workstream-status.md`. |
| Frontend | PARTIAL | Real routes in `mos-app/src/router.tsx:69-128`; Home handles loading/error-ish KPI states in `mos-app/src/pages/home-page.tsx:47-116`; reusable dashboard/kitchen/task components exist. | Five-destination IA is not fully implemented in navigation; `sections.tsx:22-57` still exposes My Week/Tasks/Kitchen/Sales/Admin-style grouping rather than Home/Work/Operate/Plan/Inbox; Plan missing. |
| Debugging | PARTIAL | Ledgers document root-cause fixes, e.g. kitchen e2e gap closure in `docs/reviews/test-kitchen-e2e.md`, COGS root-cause in `docs/platform-workstream-status.md`. | No current end-to-end production incident/runout rehearsal; several claims remain status-doc assertions rather than fresh audit-run evidence. |
| Security | PARTIAL | Core RLS evidence: tasks `20260611000009_mos_rls.sql:62-83`; weekly updates `20260612000002_mos_weekly_updates_rls.sql:46-63`; reporting finance/admin policies `20260704000002_reporting_sales_margin_daily.sql:53-63`; agent service-role limited to auth verification in `supabase/functions/agent-chat/index.ts:56-119`. | Production security gate is explicitly still required before exposure (`docs/decisions.md:484-485`); VAPID/live deputy secrets and deploy hardening not complete. |
| DevOps & deployment | PARTIAL | Staging exists per status (`docs/platform-workstream-status.md` says main/staging `669ee0a` live); package gates in `mos-app/package.json` scripts. | Current `dev` is `4a16855`, while `main/staging` are `669ee0a`; many built features are not on staging. Production `https://ops.gordi.id/mos` is not proven live. |

### Per-layer Definition of Done

| DoD layer/item | Verdict | Evidence | Specific gap |
|---|---:|---|---|
| Spec (SDD) | PARTIAL | Specs exist for many built features: `docs/specs/home-v1.spec.md`, `sales-dashboard.spec.md`, `reporting-sales-margin.spec.md`, `kitchen-module.spec.md`, `tasks-raci.spec.md`, etc. DoD text is `docs/product-expectations.md:91`. | No merged spec on `dev` for Work spine (only held branch); no implemented specs for Plan/reference data or AR bridge. Owner sign-off is documented for docs decisions but not every shipped code slice. |
| Design+Plan | PARTIAL | Plans exist for many slices under `docs/plans/`; DoD requires architecture/data/error/testing and AC-tagged tasks at `docs/product-expectations.md:92`. | Not every current `dev` doc-only/flag-ungate change has an issue plan/ledger; Work-spine plan is held off-`dev`. |
| Data/Schema | PARTIAL | RLS/org/indexes present across core tables: tasks, weekly updates, ops logs, kitchen, reporting, user views, agent, notifications. Example lines: `20260706000002_mos_notifications.sql:13-56`; comments RLS `20260706000004_mos_comments.sql:8-42`. | Several migrations have only comment-style DOWN blocks, not executable reversible migrations; no proven seed/typed-client regeneration in this audit; Work-spine `shared.can()` migrations not on `dev`. |
| Build (TDD) | PARTIAL | Tests are extensive: 72 pgTAP files, 23 e2e files; AC tags in `supabase/tests/*` and `mos-app/e2e/*`. | This audit did not find a fresh whole-`dev` RED→GREEN ledger; some flags were force-ungated in `mos-app/src/config/features.ts:5-20` by a chore commit, not a product acceptance loop. |
| Frontend/UI | PARTIAL | Home, task drawer, kitchen pages, Inbox, sales dashboard routes in `router.tsx:69-128`; design ledgers for UI slices in `docs/reviews/feat-home-v1-margin.md`, `feat-kitchen-log-redesign.md`, `feat-port-p3a-replay-inbox.md`. | Five-destination UI not finished: nav still `My Week`, `Tasks`, `Kitchen`, catalog, sales (`sections.tsx:22-57`); Plan absent; visual review for whole refreshed JTBD v0.3 is explicitly next work. |
| Review | PARTIAL | Review ledgers exist for many feature branches (`docs/reviews/feat-port-p1-substrate.md`, `feat-port-p2-panel-runtime.md`, `feat-port-p3a-replay-inbox.md`, `feat-p2.1-db-side-aggregate.md`). DoD text: `docs/product-expectations.md:96`. | `docs/reviews/dev.md` is an older sales/reporting ledger, not a current full-`dev` release ledger; Work spine requires another cross-family pgTAP re-review before merge. |
| Acceptance (BDD) | PARTIAL | AC-tagged tests exist: kitchen AC-090 e2e, inbox replay AC-P3, sales AC-010/011 e2e, many pgTAP ACs. DoD text: `docs/product-expectations.md:97`. | Per-AC matrix is not globally green for the E6 charter because Work/Plan/AR ACs are missing/not merged; curated e2e set is broad but no full current run was executed by this audit. |
| Security | PARTIAL | Security reviews recorded in ledgers; RLS and auth seams implemented; DoD text at `docs/product-expectations.md:98`. | Hard gate before exposure/user rollout remains open; PWA delivery inert until VAPID (`20260706000005_mos_push_subscriptions.sql:2`); live deputy needs `AGENT_MODEL_API_KEY`. |
| Release/DevOps | MISSING | DoD requires full verification green, one PR per issue, CI pass, deploy/monitor steps (`docs/product-expectations.md:99`). Status says `dev` has green CI for PRs #88/#89, but `main/staging` are older. | Current MVP candidate is not released: `dev` `4a16855` ≠ `main/staging` `669ee0a`; production deploy not complete; `scripts/pre-merge-check.sh` not freshly run for current `dev` by this audit. |
| Coverage gate | PARTIAL | Coverage evidence appears in ledgers (e.g. `feat-port-p1-substrate.md`, `feat-home-v1-margin.md`). Policy at `docs/product-expectations.md:105`. | No fresh coverage report for all changes currently on `dev`; this audit did not run coverage. |
| Lint/typecheck | PARTIAL | Package scripts exist (`mos-app/package.json`); ledgers cite typecheck/lint green for many branches. Policy at `docs/product-expectations.md:108-109`. | No fresh `npm run typecheck` / `lint:ci` executed here for `dev`; staging/main not same code. |
| Human checkpoints | PARTIAL | Owner sign-off on accepted IA and docs is recorded in decisions (`docs/decisions.md:786-805`, `832-915`). Policy at `docs/product-expectations.md:111-116`. | Production deploy and irreversible infra remain owner-gated; some code is intentionally held. |
| PR granularity / ADR threshold | PARTIAL | ADR-0019 accepted and D14 sequence recorded (`docs/adr/0019-ia-north-star.md:126-133`); PR ledgers exist. | Held local branches and docs commits complicate one-PR-per-issue traceability; Work spine local branch is ahead and unmerged. |
| Design/UI policy | PARTIAL | Design reviews recorded; `DESIGN.md` is treated as source; policy at `docs/product-expectations.md:127-133`. | Whole IA has not yet received the required refreshed JTBD v0.3 design audit per status. |
| Data/Schema policy | PARTIAL | RLS/org seam present across most business tables; policy at `docs/product-expectations.md:135-137`. | `shared.can()` capability rewrite for Work spine is not on `dev`; not all migrations are truly reversible as executable DOWN. |

## 3. Five-destination readiness

| Destination | MVP-ready? | Built on `dev` | Missing / rollout blocker |
|---|---:|---|---|
| **Home** | PARTIAL | `/` is `HomePage` (`router.tsx:69`); finance/admin KPI row and My Week panel in `home-page.tsx`; sales/margin read-model migrations (`20260701000001`, `20260704000002`). | Home v1 is coded, but stacked-union cockpit from `docs/decisions.md:866-874` is not built; margin data population still needed; not promoted to staging. |
| **Work** | NOT READY | Tasks routes `/tasks`, `/tasks/new`, `/tasks/:taskId` (`router.tsx:71-75`); weekly updates route `/updates`; task/cascade catalog pieces exist (`/objectives`, `/projects-processes`). | Accepted Work destination requires tasks + everyone cascade + follow-up queues + updates (`ADR-0019:44`). Work spine is held on `feat/work-spine`, not on `dev`; follow-up family absent. |
| **Operate** | PARTIAL | Kitchen module routes `/kitchen/log|plan|review|stock|pushes` (`router.tsx:89-93`); Daily Log `/ops` (`router.tsx:81`). | Only kitchen is rolled in. Bar, roastery, ecommerce are not built; roastery explicitly remains D14 step 6 (`docs/decisions.md:864`). ESB worker/flip still deploy-gated. |
| **Plan** | NOT READY | Sales reporting and margin read-models exist; docs accepted ADR-0022. | No Plan route or nav destination; no COGS/reference data CRUD, budget creation, freshness/change history, pricing pre-flight; `ADR-0019:46` unmet. |
| **Inbox** | PARTIAL | `/inbox` route gated by `SHOW_INBOX` (`router.tsx:82`); `InboxPage` marks read and routes to entity (`inbox-page.tsx:10-28`); notifications table/RLS (`20260706000002...:13-56`); PWA subscription table (`20260706000005...:5-42`). | In-app Inbox exists, but push delivery is inert until VAPID (`20260706000005...:2`); re-push trigger is only backlogged; external channels deferred. |

## 4. D14 sequence status

| D14 step | Status | Evidence | Gap |
|---|---:|---|---|
| 1. Home v1 + `sales_margin_daily` | DONE on `dev`, not fully staged | D14 says step 1 at `ADR-0019:127`; Home route/code `router.tsx:69`, `home-page.tsx`; margin table `20260704000002_reporting_sales_margin_daily.sql:12-63`; ledger `docs/reviews/feat-home-v1-margin.md`. | Staging/main conservative; margin fact population verification pending per status. |
| 2. Agent port P1→P3; Inbox machinery | DONE on `dev`, not fully staged | D14 step 2 `ADR-0019:128`; edge functions under `supabase/functions/agent-chat` and `compose-view`; persistence `20260705000003...`; Inbox route and notifications. | Live model key and VAPID still not configured; dev-only user-views harness remains DEV route (`router.tsx:121-126`). |
| 3. Work spine | IN-FLIGHT / HELD | Status says built on `feat/work-spine`; branch exists local `0bf7cdd` ahead; diff adds `docs/specs/work-spine.spec.md`, `mos-app/src/pages/cascade-page.tsx`, `supabase/migrations/20260708000001_shared_capabilities.sql`, tests `72/73`. | Not on `dev`; required cross-family pgTAP re-review and Director phone render-check remain. |
| 4. AR + pending-bills bridge | NOT STARTED | D14 step 4 follows Work spine (`ADR-0019:130-131`); decisions refine reconciliation in `docs/decisions.md:887-895`. | No routes/migrations/spec implementation for invoice-grain settlement; backup/restore gate not done. |
| 5. Plan/reference data | NOT STARTED | D14 step 5 `ADR-0019:132`; Plan decision in `docs/decisions.md:822-829`. | No Plan destination in router/nav; no COGS/reference data tables/UI/workbench. |
| 6. Activity roll-ins | NOT STARTED beyond kitchen | D14 step 6 `ADR-0019:133`; roastery timing holds (`docs/decisions.md:864`). | Bar/roastery/ecommerce modules absent; only kitchen exists. |

## 5. “All project workflows satisfied” check

| Workflow gate | Verdict | Evidence | Gap / skipped gate |
|---|---:|---|---|
| Spec → plan → build loop | PARTIAL | Many slices have specs/plans/reviews; `docs/specs/` and `docs/plans/` populated. | Current E6 work has accepted docs, but Plan/AR lack build specs; Work spine spec/plan are held off-`dev`. |
| Review battery ledger | PARTIAL | Ledgers exist for major recent branches: P1, P2, P3a, P2.1, Home, BU remap, kitchen, admin. | No current `docs/reviews/<branch>.md` release ledger for `dev` at `4a16855`; `docs/reviews/dev.md` is older and scoped to sales/reporting. |
| Acceptance tests / AC traceability | PARTIAL | AC-tagged pgTAP/e2e present (`supabase/tests/71_mos_aggregate_compiled.sql`, `mos-app/e2e/inbox-replay.spec.ts`, `AC-090-kitchen-log-approve.spec.ts`, etc.). | E6 charter ACs for Work/Plan/AR are absent/not merged; no fresh full e2e run in audit. |
| Security gate | PARTIAL | Security reviews in recent ledgers; RLS widespread. | Production exposure gate remains open; PWA push and live deputy secrets not configured. |
| Coverage/typecheck/lint | PARTIAL | Ledgers cite green runs; scripts exist. | This audit did not run `npm run typecheck`, `npm run lint:ci`, coverage, full e2e, or `supabase test db`; no current full-`dev` proof file. |
| `scripts/pre-merge-check.sh` | PARTIAL | Several ledgers say it passed. | Not freshly run for current `dev`; Work spine says it still needs re-review/render before merge. |
| Ship/deploy | MISSING | `main/staging` are `669ee0a`; `dev` is `4a16855`; staging URL exists per status. | Built `dev` stack is not on `main/staging`; production `ops.gordi.id/mos` deploy/hardening/user provisioning not complete. |
| Held/unmerged work | FAIL for MVP | `feat/work-spine` local `0bf7cdd` ahead 7; diff shows cascade page/capabilities migrations/tests. | A core D14 prerequisite for live management-week validation is built but unmerged and not deployable. |

## 6. Top MVP-blocking gaps, prioritized

1. **Merge Work spine (D14 step 3 / Work).** Minimal close: perform required cross-family pgTAP security re-review, Director phone render-check, push branch, CI, merge to `dev`, then promote. Evidence of gap: Work spine held in `docs/platform-workstream-status.md`; branch diff adds unmerged cascade page/capability migrations/tests.
2. **Build Follow-up / AR reconciliation v1 (D14 step 4 / Work+Home money strip).** Minimal close: one spec for invoice-grain settlement, backup/restore drill first, tables/RLS, Work queue, Finance settle flow, Home money-position tile, pgTAP + one e2e.
3. **Build Plan COGS/reference data v1 (D14 step 5 / Plan).** Minimal close: Plan route/nav, certified COGS/reference records with owner BU/freshness/history, finance certification registry, one pricing/budget read flow; fail-loud stale/uncertified badge.
4. **Promote `dev` to staging/main and prove live secrets (Release/DevOps).** Minimal close: owner approves promotion; db push all migrations; configure live deputy key and VAPID or explicitly disable push; run full typecheck/lint/unit/pgTAP/e2e/build/pre-merge-check; record a `docs/reviews/dev-release-<date>.md` ledger.
5. **Complete production/security rollout gate (Security/DevOps).** Minimal close: run OWASP/STRIDE gate on auth/RLS/edge functions/box, disable open signup, password/session/CSP/SMTP checks, monitor/backup restore drill, create rollout accounts, then 15–30-person pilot.
6. **Align navigation to five destinations (Home/Work/Operate/Plan/Inbox).** Minimal close: replace current My Week/Tasks/Kitchen/Sales/Admin grouping with destination shell; Work contains tasks/updates/cascade; Operate contains Kitchen; Plan added; Inbox visible when live. Current mismatch: `sections.tsx:22-57`.
