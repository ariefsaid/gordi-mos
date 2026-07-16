# Agent context — read me first (owner prefs · hard rules · gotchas · pointers)

Fast cold-start for a fresh agent (esp. post-compaction). This is the human/process layer; the
authoritative product/decision docs are linked at the bottom. Keep this file updated as things change.

> **Product/IA direction below is superseded (2026-07-09/10) by ADR-0025 + `docs/decisions.md`
> OD-REDESIGN-1..55** (era **E7**, `docs/requirements-evolution.md`) — a full redesign, not a
> continuation of the "Current state" / "Headline current state" workstream dated 2026-07-07 below.
> Quick map: `docs/redesign-decision-index.md` (its **§ Provenance** maps the source threads).
> **Need the *why* behind a decision? → `docs/reference/provenance/`** — extracted grill + frustration
> threads, owner prompts verbatim, in-repo. Owner prefs, hard rules, multi-agent/git gotchas, and
> the delegation posture below are **not** superseded and remain binding.
>
> **WHERE ARE WE RIGHT NOW → `docs/plans/AUTONOMOUS-RUN-STATE.md`** (mode, branch strategy, per-step
> status, the next open item, the both-reviews gate). Evidence of record: `docs/reviews/feat-redesign-buildout.md`.
>
> **UPDATE 2026-07-14 — mockup phase CLOSED (OD-REDESIGN-56).** The canonical next product step is the
> **buildout in `mos-app`** per `docs/plans/2026-07-14-redesign-buildout.md` (11 owner-approved steps;
> step 1 = styling pass). Binding on every step: `docs/experience-contract.md` Rules 1–12 (incl. Rule 11
> component reuse — never re-implement an existing surface) + OD-REDESIGN-56..66. The E7/convergence
> mockups are **standing references with a presumption of correctness** — port what they answered
> unless it's on the explicit override list; ownership map:
> `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` (binding read-first for UI
> steps; live at :8766 e7 · :8134 convergence in the `gordi-mos-e7-prototype` working copy).

## Who the owner is (Arief) & how he works
- **Concise reporting** — sacrifice grammar for concision; lead with the answer, not the journey.
- **"Make it work", pragmatic, one-step infra** — prefers the shortest correct path; dislikes
  over-engineering (a `ponytail` lazy-mode is often active). But **not** at the cost of safety/correctness.
- **Director posture is expected** (you are the Director; he is the board): challenge bad decisions, ask
  clarifying questions, verify everything yourself — never rubber-stamp a subagent's summary
  (close-review the actual artifacts/diffs/code).
- **Visual fidelity bar** — he judges UI by *look-vs-mockup*, not green tests. Render + eyeball at real
  widths (incl. ≤380px phone) before claiming a UI change done. jsdom/RTL computes no layout.
- **Follows the verbatim product charter** (`docs/product-expectations.md`). The review battery is a
  **binding gate**, not optional (see Hard rules).
- **Credentials/secrets:** NEVER enter his credentials; NEVER read `~/.op-token` or any `.env`. Fetch
  secrets only via **`op-get.sh <item> <vault> <field>`** (1Password vaults **AS** + **Gordi**). When op
  isn't authenticated in the shell, ask him to unlock / provide — don't work around it.
- When Claude is overloaded/rate-limited, he's fine delegating heavy work to **pi CLI** (GLM builders +
  gpt-5.6-luna cross-family reviewers, `docs/pi-delegation.md`); vision/design-review stays Claude/Director.

## Hard rules (non-negotiable)
1. **Review battery before EVERY merge-to-main.** Run `bash scripts/pre-merge-check.sh` (exit 0) + record
   `docs/reviews/<branch>.md` (spec + code-quality always; security if auth/RLS/schema; design if
   `*.tsx`/`*.css`). Green tests ≠ reviewed. **Separate repos (`gordi-kitchen-app`) have NO gate script —
   they need the SAME battery, recorded in gordi-mos `docs/reviews/kitchen-app-worker-prs.md`.** (Missed
   this twice; the 2nd miss hid a real fail-open security bug — see `review-battery-before-merge` memory.)
2. **Secrets** — see owner section. `op-get.sh` only; never `.env`/`.op-token`.
3. **ESB GOO = TEST DATA ONLY** (spec FR-084). Never send Gordi's real GKID product/BOM IDs to GOO (it's a
   shared multi-tenant sandbox). Details: `docs/reference/esb-goo-integration.md`.
4. **De-reference firewall** — no external/brand/AGPL references in MOS design artifacts; the design kit is
   MOS's own. (ESB API coordinates are fine — ESB is the real integration partner, not a design reference.)
5. **Git hygiene** — branch → PR → merge; the concurrent agent works on its own branch; **`git push
   origin HEAD:main` is blocked**; **rebase onto latest `origin/main` before merging** (your local `main`
   ref goes stale — `git fetch` first, and rebase any worktree you cut from a stale local main).
6. **One issue / one PR.** Pause at issue boundaries; owner approves spec sign-off + prod deploy /
   irreversible infra; Director approves merge-to-main within the signed spec.

## Multi-agent dispatch — worktrees are the DEFAULT (owner-directed 2026-07-06)
Dispatch every role/build agent in its **own git worktree** (`isolation: "worktree"` on the Agent tool,
or the pi equivalent) so parallel agents never share one checkout. The shared-tree clobber that bit us on
2026-07-06 (a Codex session moved our HEAD mid-merge) does not happen when each agent has its own tree.
- **Never put `git checkout`/`checkout -b` in an agent's brief** — the harness already parks it on its own
  `worktree-agent-<id>` branch; a `checkout` in the brief leaks to the MAIN tree's HEAD. Tell it to work in
  place, commit to its branch, and report; the Director merges from `worktree-agent-<id>`.
- **After merging an agent's work, clean up:** `bash scripts/worktree-cleanup.sh [target=dev] [--remote]`
  removes merged worktrees + deletes merged local (and optionally remote) branches. Protected: main/dev/
  staging/current. It only ever deletes MERGED branches — unmerged work is safe.
- **After any worktree-agent dispatch,** confirm your own HEAD didn't wander:
  `git branch --show-current` + `git rev-parse --short HEAD`. See [[mos-multiagent-git-gotchas]].

## Gotchas (will bite you)
- **Stale local `main`:** `git worktree add … main` uses your *local* ref, which lags `origin/main` after
  you merge a PR. `git fetch` + rebase the worktree, or it'll miss/clobber recent merges.
- **Multi-agent repo:** subagents only see their own worktree; a separate session (even a non-Claude one
  like Codex) may share the primary checkout. Keep agents in worktrees; verify HEAD after dispatch.
- **Mocked unit tests miss DB reality:** a wrong column name / RPC signature passes mocked Vitest but 400s
  against real PostgREST (the `log_date` bug). Verify-live any DB-column/RPC change against a running stack.
- **GOO ≠ `stg-erp`:** GOO Core API is `stg7.esb.co.id/core-stg`; `stg-erp.esb.co.id` is the ESB web UI.
  Auth = login (not the static token, which is the OMS read API's bearer). `docs/reference/esb-goo-integration.md`.
- **Costing-model asymmetry:** GKID = actual-costing (`/assembly-actual`); GOO's SAE tenant = standard-
  costing (`/assembly`). The worker's assembly call can't be validated on GOO — GKID flip is its only proof.
- **Commit trailer (gordi-mos):** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Dev-login orphan after schema work → `supabase db reset` relinks (or PR #57 heals it permanently).

## Current state — where to read what
| Need | Doc |
|---|---|
| **How the requirement evolved (era timeline — read before any older doc)** | `docs/requirements-evolution.md` |
| **Current redesign direction + next work** | `docs/redesign-decision-index.md` + top of `docs/backlog.md` |
| **Legacy implementation + infrastructure status** | `docs/platform-workstream-status.md` |
| **Agent-native port (ADR-0018) — plans per train** | `docs/plans/2026-07-04-port-p1-substrate.md` · `docs/plans/2026-07-05-port-p2-panel-runtime.md` · `docs/plans/2026-07-06-port-p3-automations-inbox.md` |
| **Review battery ledgers (per branch)** | `docs/reviews/feat-port-p1-substrate.md` · `feat-port-p2-panel-runtime.md` · `feat-bu-taxonomy-remap.md` · `feat-home-v1-margin.md` · `feat-port-p3a-replay-inbox.md` · `feat-p2.1-db-side-aggregate.md` · `release-staging-bu-remap.md` · `feat-work-spine.md` · **MVP-push (2026-07-07): `feat-ia-nav-work-spine.md` · `feat-ar-followup-bridge.md` · `feat-plan-v1.md` · `feat-home-stacked-union.md`** · **pre-F hardening A1–A6: `feat-harden-round2.md`** |
| **MVP-readiness audits** | `docs/reviews/mvp-readiness-charter-audit-2026-07-06.md` (round 1, charter) · `mvp-readiness-audit-round2-2026-07-07.md` (round 2, gpt-5.5 ×3 — the pre-F hardening blocklist A1–A6, **now DONE**) |
| **Design reviews (rendered)** | `docs/reviews/design-mvp-push-2026-07-07.md` (4-lens, render-verified) · **`ui-coherence-audit-2026-07-07.md` (whole-app coherence — the task #19 retrofit plan; verdict: application-gap, not ground-up)** |
| **Current JTBD design oracle (Lens-D) — E7, pending written-form owner review** | `docs/jtbd.md` (**v0.4** — 9 job families · 23 journeys · 6 scenario threads) |
| **IA/product ADRs (Accepted 2026-07-06)** | `docs/adr/0022-plan-destination-cogs-budget.md` · `docs/adr/0023-multi-location-inventory-internal-replenishment.md` · `docs/adr/0024-roastery-esb-sales-order-push.md` · decisions.md "Continued grill session 2" block |
| **Work-spine slice (D14 step 3, held on `feat/work-spine`)** | `docs/specs/work-spine.spec.md` · `docs/plans/2026-07-06-work-spine.md` · `docs/reviews/feat-work-spine.md` |
| **Roastery Operate requirements (10 owner-decisions in §6)** | `docs/specs/roastery-module.requirements.md` |
| **PMO→MOS agent-capability expansion (feeds next grill)** | `docs/specs/agent-capability-expansion.md` |
| Full task list / backlog | `docs/backlog.md` |
| Locked owner decisions (OD-*) + ADRs | `docs/decisions.md`, `docs/adr/` (0017–0021 = agent-native/IA/can()/i18n; **0022 Plan-COGS-budget · 0023 multi-location-inventory · 0024 roastery-ESB-sales-order-push = Accepted 2026-07-06**) |
| Domain glossary | `CONTEXT.md` (repo root) |
| Binding charter + per-layer Definition of Done | `docs/product-expectations.md` |
| Director runbook / loop / UI cycle | `docs/director-playbook.md`, `docs/design-workflow.md` |
| **ESB / GOO integration (coords, auth, recipe, gotchas)** | `docs/reference/esb-goo-integration.md` |
| **ESB warehouse online (box · op map · cron · observability · owner-actions)** | `docs/reference/warehouse-online.md` |
| Kitchen module spec (FR/AC) | `docs/specs/kitchen-module.spec.md` |
| Delegation via pi CLI | `docs/pi-delegation.md` |
| Staging env + gotchas | `docs/environments.md` |

## Headline current state (2026-07-07 late)
- **⚠️ READ the `## Current focus (2026-07-07 late)` block in `docs/platform-workstream-status.md` first** — full state + branch map + ▶ NEXT. Summary: `dev` includes the UI-coherence merge, closure regression guards, and post-merge IA cleanup. **Pre-F hardening A1–A6 DONE + merged** (`docs/reviews/feat-harden-round2.md`; pgTAP 570 · unit 2345 · cov 95.43%). **Nav catalog FR-424** (Objectives/Projects&Processes back as capability-gated Work rail entries). **MVP-push design review render-verified** (`design-mvp-push-2026-07-07.md`). **UI-coherence polish + deputy battery DONE + merged** (`docs/reviews/feat-ui-coherence.md`): Select retrofit, shared tables/state/header cleanup, no-FAB deputy launcher, phone MyTasks reflow, and Deputy **C2 safe markdown + C3 typed widgets**; closure guards and IA cleanup also landed. **F (task #16, owner-gated)** = promote + deploy + secrets + backup drill + prod security gate + A4 job-GUC org-scope.
- *(Prior, 2026-07-07 — now history:)* MVP push shipped 5 slices A–E to `dev` dark behind flags; round-2 gpt-5.5 ×3 audit → SHIP-WITH-FIXES (blocklist A1–A6, now done).
- *(Prior, 2026-07-06 EOD — now history:)* staging LIVE up-to-BU-remap; COGS root-cause fix deployed; ADR-0022/0023/0024 + JTBD v0.3 accepted + merged to dev; grill session-2 decisions in `docs/decisions.md`.
- Kitchen Module + access roles + UI-revamp + Strategy→Execution cascade first slice **SHIPPED to main**.
- Agent-native platform port P1/P2/**P3a/P2.1 all on `dev`** (green CI, PRs #88/#89 MERGED 2026-07-06). `main`/`staging` deliberately conservative at up-to-BU-remap (`669ee0a`).
- CI-fix pass (task-detail async races, Home-v1 e2e `My Week`→Home route, Sales KPI locator scope,
  recovery password-policy, coverage timing budgets) landed via `c96fb5a` + `4f67080`; full local battery
  re-verified green (typecheck/eslint/2217 unit/449 pgTAP/22 e2e/build) + fresh GitHub `verify`+`db` green
  before merge.
- **Multi-agent hazard (hit + resolved 2026-07-06):** a parallel Codex session shared this working tree and
  moved HEAD mid-work. Two agents on one checkout = clobber risk. Owner stopped Codex; Director took sole
  ownership, adopted Codex's clean rebased stack (verified byte-identical code), merged, cleaned up stale
  branches. If HEAD ever looks wrong, check `git branch --show-current` + reflog before acting.
- **Delegation posture (owner-directed 2026-07-06):** orchestrate heavy build/fix via **pi** (GLM-4.7/GLM-5.2
  builders, gpt-5.6-luna cross-family reviewers — `docs/pi-delegation.md`) to preserve Anthropic tokens;
  Director retains verify + merge/git + final visual taste. (The #88/#89 close-out needed no code fix — it
  was git orchestration + CI-watch, no pi spend.)
- Remaining user-facing rollout work is owner-gated: staging db push, edge-function model secret/live
  deputy verify, P3b generateLink hook check, VAPID keys, and ESB PIC settlement answer.
