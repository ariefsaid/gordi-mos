# Agent context — read me first (owner prefs · hard rules · gotchas · pointers)

Fast cold-start for a fresh agent (esp. post-compaction). This is the human/process layer; the
authoritative product/decision docs are linked at the bottom. Keep this file updated as things change.

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
  gpt-5.4 cross-family reviewers, `docs/pi-delegation.md`); vision/design-review stays Claude/Director.

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
| **Where everything stands + outstanding** | `docs/platform-workstream-status.md` (canonical handoff) |
| **Agent-native port (ADR-0018) — plans per train** | `docs/plans/2026-07-04-port-p1-substrate.md` · `docs/plans/2026-07-05-port-p2-panel-runtime.md` · `docs/plans/2026-07-06-port-p3-automations-inbox.md` |
| **Review battery ledgers (per branch)** | `docs/reviews/feat-port-p1-substrate.md` · `feat-port-p2-panel-runtime.md` · `feat-bu-taxonomy-remap.md` · `feat-home-v1-margin.md` · `feat-port-p3a-replay-inbox.md` · `feat-p2.1-db-side-aggregate.md` · `release-staging-bu-remap.md` · `feat-work-spine.md` |
| **JTBD design oracle (Lens-D) — E6, refresh 2026-07-06** | `docs/jtbd.md` (**v0.3** — 4 personas × 5 destinations; supersedes E1 v0.2) |
| **IA/product ADRs (proposed 2026-07-06, owner sign-off pending)** | `docs/adr/0022-plan-destination-cogs-budget.md` · `docs/adr/0023-multi-location-inventory-internal-replenishment.md` · `docs/adr/0024-roastery-esb-sales-order-push.md` (all on `docs/jtbd-refresh`) · decisions.md "Continued grill session 2" block |
| **Work-spine slice (D14 step 3, held on `feat/work-spine`)** | `docs/specs/work-spine.spec.md` · `docs/plans/2026-07-06-work-spine.md` · `docs/reviews/feat-work-spine.md` |
| **Roastery Operate requirements (10 owner-decisions in §6)** | `docs/specs/roastery-module.requirements.md` |
| **PMO→MOS agent-capability expansion (feeds next grill)** | `docs/specs/agent-capability-expansion.md` |
| Full task list / backlog | `docs/backlog.md` |
| Locked owner decisions (OD-*) + ADRs | `docs/decisions.md`, `docs/adr/` (0017–0021 = agent-native/IA/can()/i18n; **0022 Plan-COGS-budget · 0023 multi-location-inventory · 0024 roastery-ESB-sales-order-push = Proposed**) |
| Domain glossary | `CONTEXT.md` (repo root) |
| Binding charter + per-layer Definition of Done | `docs/product-expectations.md` |
| Director runbook / loop / UI cycle | `docs/director-playbook.md`, `docs/design-workflow.md` |
| **ESB / GOO integration (coords, auth, recipe, gotchas)** | `docs/reference/esb-goo-integration.md` |
| **ESB warehouse online (box · op map · cron · observability · owner-actions)** | `docs/reference/warehouse-online.md` |
| Kitchen module spec (FR/AC) | `docs/specs/kitchen-module.spec.md` |
| Delegation via pi CLI | `docs/pi-delegation.md` |
| Staging env + gotchas | `docs/environments.md` |

## Headline current state (2026-07-06 EOD)
- **⚠️ READ the `## Current focus (2026-07-06 EOD)` SESSION-CLOSE block in `docs/platform-workstream-status.md` first** — it has the full state + branch map + ▶ NEXT-AGENT resume. Summary: staging LIVE (up to BU remap, `gordi-mos.pages.dev/mos`); COGS root-cause fix deployed to the box (margin populates tonight's 3am cron, GKID+GRI); **Work-spine v1 held** on `feat/work-spine` (battery-green, needs cross-family pgTAP re-review + phone render before merge); **IA/JTBD grill** produced JTBD v0.3 + ADR-0022/0023 (Proposed) on `docs/jtbd-refresh`; dev ungated (all 5 flags) for testing.
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
  builders, gpt-5.4 cross-family reviewers — `docs/pi-delegation.md`) to preserve Anthropic tokens;
  Director retains verify + merge/git + final visual taste. (The #88/#89 close-out needed no code fix — it
  was git orchestration + CI-watch, no pi spend.)
- Remaining user-facing rollout work is owner-gated: staging db push, edge-function model secret/live
  deputy verify, P3b generateLink hook check, VAPID keys, and ESB PIC settlement answer.
