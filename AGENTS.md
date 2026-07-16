# Gordi MOS — project instructions

> **This file is the standing rules — it does not track state.** Current state, active workstreams,
> and per-run handoffs live in **`docs/agent-context.md`**. **Cold start → read that FIRST**
> (owner prefs · hard rules · gotchas · pointers to everything else, including where the current
> workstream stands and who is running it). Anything ephemeral belongs there, never here.

> **Precedence:** `CLAUDE.md` is the authority for this repo's charter, loop, and gates. This file
> mirrors it for non-Claude agents. If the two ever disagree, **CLAUDE.md wins** — and the divergence is
> a bug: fix this file. (Reconciled 2026-07-16 after a fresh-agent audit found 3-lens vs 4-lens and
> approval-pause drift.)

Internal **Management Operating System** app for Gordi (replaces the dormant Notion Management OS).
Ships at `https://ops.gordi.id/mos`. **Usability and speed beat model completeness and Notion fidelity.**

**Scope evolves by owner decision, in eras.** Never trust an older doc's scope without checking the
era timeline first: **`docs/requirements-evolution.md`** (authoritative), then `docs/decisions.md`
(owner decisions) + `docs/adr/` (architecture). The current product model/vocabulary is **`CONTEXT.md`**.
`docs/project-brief.md` and `docs/roadmap.md` are era-bound history unless the evolution doc says
otherwise. Where the current workstream stands — and any active autonomous-run charter — is in
`docs/agent-context.md`, not here.

## Repo layout
- `mos-app/` — the app (React 19 + Vite + TypeScript). Run npm/vite here, never at the repo root.
- `docs/specs/` `docs/plans/` `docs/adr/` — specs, implementation plans, architecture decisions.
- `docs/design-mockups/` — static HTML mockups (IA proposals + key screens), versioned in-repo.
- `docs/backlog.md` `docs/decisions.md` `docs/roadmap.md` — what's next, owner decisions, phasing.
- `docs/reviews/<branch>.md` — the review ledger: evidence of record for every merge gate.
- `supabase/migrations/` — Postgres schema + RLS. Schemas: `shared` / `mos` / `ops` / `integrations` /
  `reporting` (curated ESB financial read-model, snapshot-fed, finance/admin RLS — OD-P4-2 / ADR-0010 D5).
- `scripts/` — repo tooling. `pre-merge-check.sh` (the gate), `cloud-agent-bootstrap.sh` (full local
  stack for a fresh sandbox), `vendor-skills.sh`.
- `.claude/agents/`, `.claude/skills/` — role agents and vendored skills (skills are gitignored; re-create with `scripts/vendor-skills.sh`).

## Operating model: Owner → Director → role agents
The **owner** (Arief) talks to the **Director** (the main session). The Director runs an
**issue-driven loop**, spawns the right role agent per phase, and takes each issue end-to-end.
Build **one issue at a time**; **pause for owner approval at issue boundaries** and before any push /
merge / deploy (matches `CLAUDE.md` — that file governs if these ever diverge). Routine worktree commits
do not require an approval pause; push, PR-to-merge, merge, and deploy always do. Per-issue loop:

1. **Intake** — Director clarifies the issue with the owner. For architecturally-significant issues
   (schema, auth, cross-cutting), run a `grill-with-docs` session: grill the approach against
   `CONTEXT.md` (the domain glossary, repo root) + `docs/adr/` + `docs/decisions.md`; resolve terms
   into `CONTEXT.md` inline. ADR authorship stays with eng-planner (grill proposes, planner writes).
2. **Spec (SDD)** — `feature-forge` (new behavior) / `spec-miner` (existing code) → `docs/specs/*.spec.md`.
3. **Design+Plan** — `eng-planner` → `docs/plans/YYYY-MM-DD-<feature>.md` (+ ADRs); `design-architect` for UI design-plans.
4. **Build (TDD)** — `implementer` / `ui-implementer` (red-green-refactor; no prod code without a failing test).
5. **Review** — `spec-reviewer`, then `code-quality-reviewer`; `design-reviewer` (**4-lens**: Visual · IxD · IA · Product/Intent JTBD, oracle `docs/jtbd.md`) for UI.
6. **Accept (BDD)** — `qa-acceptance` verifies each `AC-###` at its owning layer (unit / pgTAP / curated e2e).
7. **Secure** (when relevant) — `security-auditor` (OWASP/STRIDE on auth + RLS + schema seams).
8. **Ship** — `release-engineer` (worktree branch → checkpoint commits → owner-approved push → PR
   targeting `dev`). Opening or updating the PR needs no further approval after the branch exists
   remotely. Director merges only after the applicable approval gate.

**Mockup-first (any new UI workstream):** `design-architect` produces static HTML mockups in
`docs/design-mockups/` to the adopted `DESIGN.md` tokens *before* UI code. The owner's mockup pick is a
**gate**. Once a workstream's mockups are signed off they are **standing references with a presumption
of correctness** — port what they answered; don't re-open them mid-build. Re-iterating mockups per
build round is a known failure mode of this project (see the redesign's OD-REDESIGN-65).
Whether a given workstream's mockup gate is open or closed is **state** — check `docs/agent-context.md`.

## Director posture (main session)
Act as a 5+-year maintainer, not a one-shot coder. Before delegating or accepting subagent work:
ask clarifying questions, challenge bad decisions, identify scaling risks, suggest better approaches,
prioritize simplicity. Build a production-grade MVP — minimal enough for a ~15-person rollout,
architected so the larger MOS (Objectives, Projects, Processes/Runs, Standards, Signals, Tasks, and
role-scoped authorization) can grow without another IA rewrite.
Detailed runbook: `docs/director-playbook.md`. UI/UX cycle: `docs/design-workflow.md`.
Binding charter + per-layer Definition of Done: `docs/product-expectations.md`.

**Delegation substrate (ACTIVE):** dispatch role work via the **pi CLI** (multi-provider: z.ai/GLM
builders + OpenAI/gpt-5.6-luna cross-family reviewers) per `docs/pi-delegation.md` — it changes *who
executes a phase*, nothing else; the loop, gates, DoD, and the Director's verify-everything +
final-visual-taste + merge/git duties are unchanged. pi agents drive rendered UI checks via the
`agent-browser` CLI. Fall back to Claude role agents (the Agent tool, `.claude/agents/`) if pi or a
provider is unavailable — the loop is substrate-agnostic.

## Quality gates & checkpoints (binding from Phase 1 on)
- **Coverage:** ≥80% lines on changed code to merge; tests assert behavior, not inflate numbers.
- **Typecheck/lint:** `npm run typecheck` zero errors; ESLint zero errors (`--max-warnings=0`). Both block merge.
- **Checkpoints:** the **owner** approves spec sign-off, Phase-0 mockup picks, and production deploy /
  irreversible infra; the **Director** approves merge-to-main within the signed spec and escalates
  anything strategic or out-of-spec.
- **PRs:** one per issue, targeting `dev`. **ADRs:** only for architectural / irreversible / cross-cutting decisions.
- **Data/schema:** reversible migrations; **RLS on every business table**; `org_id` + app/workspace
  seams enforced (one shared self-hosted Supabase serves MOS + future ops apps — schema separation, not project separation).
- **Design/UI:** `DESIGN.md` (adopted from PMO — identity authority, never re-invent) is the design-system
  source of truth; four-lens design review before merging UI changes.

## Git workflow (owner default)
- Start every mutable issue in an isolated Git worktree on a named feature branch based on current
  `dev`; never implement directly in the primary `main` or `dev` checkout. Codex-created branches use
  the `codex/` prefix unless the issue already has an established branch name.
- Commit after each coherent plan task or red-green-refactor checkpoint. Keep commits small, tested,
  and reviewable; do not hold the entire issue as one final uncommitted change.
- After the issue gates pass, request owner approval before pushing the branch. Once the approved push
  succeeds, open or update its PR with base `dev` without requesting another approval. PR description,
  labels, reviewers, and other metadata may be updated autonomously.
- Never push, merge, or deploy without the applicable owner/Director checkpoint. Keep the worktree
  available for review and follow-up until the PR is merged or explicitly abandoned.
- Do not move unrelated dirty-checkout changes into an issue worktree or commit them with the issue.

## Agent roster (`.claude/agents/`) and models
eng-planner (opus) · implementer (sonnet; opus for hard slices) · spec-reviewer (opus) ·
code-quality-reviewer (opus) · qa-acceptance (sonnet) · security-auditor (opus) ·
release-engineer (sonnet) · mechanical (haiku) · design-architect (opus) ·
ui-implementer (sonnet; opus for hard slices) · design-reviewer (opus).

## Skill ownership (one owner per concern — avoids collisions)
| Concern | Owner |
|---|---|
| Intake grilling (plan vs domain language) + `CONTEXT.md` glossary | grill-with-docs (`.claude/skills/`) |
| Reverse-engineer existing code → spec | spec-miner (`.claude/skills/`) |
| User stories + acceptance criteria | feature-forge (`.claude/skills/`) |
| Design + task planning | superpowers (brainstorming, writing-plans) |
| TDD build / debugging / verification | superpowers (tdd, systematic-debugging, verification) |
| Code review | superpowers spec + quality reviewers |
| Design-system stewardship (`DESIGN.md`) + Phase-0 mockups | design-architect (impeccable, design-consultation) |
| UI build (to tokens + design-plan) | ui-implementer (ui-ux-pro-max, taste) |
| Four-lens UI review (Visual · IxD · IA · Product/JTBD) | design-reviewer (design-review, impeccable, taste) |
| Browser QA · security · ship/deploy/monitor | gstack (`/qa`, `/cso`, `/ship`, `/land-and-deploy`, `/canary`) |

superpowers' planning tier owns planning; do NOT also use gstack's planning tier. spec-miner's
`Bash` tool was stripped (read-only). gstack telemetry stays `off`.

## Spec & test conventions
- Specs → `docs/specs/<feature>.spec.md`. Plans → `docs/plans/YYYY-MM-DD-<feature>.md` (no placeholders:
  exact paths, real code, exact verify commands, 2–5 min tasks). ADRs → `docs/adr/NNNN-<slug>.md`.
- IDs: `FR-###` (functional), `NFR-###`, `AC-###` (acceptance). Requirements in **EARS**; all
  acceptance criteria in **Given/When/Then**.
- **Test pyramid.** Each `AC-###` is owned by **one** test at the **lowest sufficient layer**:
  Unit (Vitest/RTL, mocked) for logic/components/render-empty-error-filter; Integration (**pgTAP**,
  `supabase test db`) for RLS/role read+write contracts; E2E (Playwright, ~6–8 curated journeys) for
  real cross-stack flows only. AC-id tagged in the owning test's title so `grep -r AC-XXX` finds the proof.
- **BDD authoring rule (binding).** A test encodes the **user's real, intuitive journey to the task's
  goal** and asserts that **goal** — the app conforms to the test, never the test to the app. On failure:
  fix the **app**; only for a *deliberate* UX change update the journey *steps*, and the goal-oracle
  stays intact. Never bend an assertion to the app's current state to go green.

## Tech stack & commands (run inside `mos-app/`)
- React 19, Vite, TypeScript, react-router-dom 7. Backend: **self-hosted Supabase** (Postgres + Auth +
  RLS), shared with future Gordi ops apps via schema separation, not project separation.
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (Vitest) · `npx playwright test` (e2e).
- **Fresh sandbox / no local stack?** `bash scripts/cloud-agent-bootstrap.sh` brings up Supabase, writes
  the app's env, installs deps + Chromium, and verifies the app actually renders. Env files are
  gitignored — a clone alone cannot log in, so nothing that needs a rendered app works without this.
- **Never** point tests, `db reset`, or pgTAP at cloud staging — it holds real migrated business data.
  Everything runs against the ephemeral local stack.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
