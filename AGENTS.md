# Gordi MOS — project instructions

> **Cold start? → `docs/agent-context.md` — read this FIRST** (owner prefs · hard rules · gotchas ·
> pointers). Then **`docs/plans/AUTONOMOUS-RUN-STATE.md`** for where the current workstream stands.
> Evidence of record for the redesign: `docs/reviews/feat-redesign-buildout.md`.

> **Precedence:** `CLAUDE.md` is the authority for this repo's charter, loop, and gates. This file
> mirrors it for non-Claude agents. If the two ever disagree, **CLAUDE.md wins** — and the divergence is
> a bug: fix this file. (Reconciled 2026-07-16 after a fresh-agent audit found 3-lens vs 4-lens and
> approval-pause drift.)

Internal **Management Operating System** app for Gordi (replaces the dormant Notion Management OS).
Ships at `https://ops.gordi.id/mos`. **Usability and speed beat model completeness and Notion fidelity.**

> **Redesign is the current direction (2026-07-09/10).** A full IA/IxD/UI redesign was locked by the
> owner — orient through **`docs/redesign-decision-index.md`**, then **ADR-0025**
> (`docs/adr/0025-ia-modules-in-rail-redesign-direction.md`) and
> **`docs/decisions.md` OD-REDESIGN-1..55**. Current product model/vocabulary is **`CONTEXT.md`**
> (PIC + Supervisor Task ownership; Signal replacing Weekly Update/Daily Log; one record workspace;
> modules-in-rail: Home · Work · Money · Inbox + Café/Ecommerce/Roastery). Canonical Phase-0 next step
> = **update the redesign working set into one decision-complete prototype**
> (`docs/design-mockups/redesign-mockups-2026-07/`)
> to `docs/jtbd.md` v0.4 + its `PROTOTYPE-BRIEF.md` → owner approval → SDD → plan → TDD build →
> review → BDD acceptance.
>
> The earlier **"first slice: task ownership + lightweight RACI + weekly updates + daily ops
> updates"** framing (below and in `docs/project-brief.md`) is **pre-redesign history** — Task RACI,
> Weekly Updates, and Daily Log are superseded; the app has never been used and a clean data baseline
> is authorized in direction only (no reset/deploy is authorized by this note). **Everything else in
> this file — the operating model, the per-issue loop, quality gates, checkpoints — is unchanged and
> still binding.**

## Repo layout
- `mos-app/` — the app (React 19 + Vite + TypeScript; scaffolded in Phase 1, NOT before). Run npm/vite here.
- `docs/specs/` `docs/plans/` `docs/adr/` — specs, implementation plans, architecture decisions.
- `docs/design-mockups/` — Phase 0 static HTML mockups (IA proposals + key screens).
- `docs/backlog.md` `docs/decisions.md` `docs/roadmap.md` — what's next, owner decisions, phasing.
- `supabase/migrations/` — Postgres schema + RLS (schemas: `shared` / `mos` / `ops` / `integrations` / `reporting`). (`reporting`: curated ESB financial read-model, snapshot-fed, finance/admin RLS — OD-P4-2 / ADR-0010 D5; migrations deployed (`20260701000001_reporting_sales_daily_revenue.sql`, `20260704000002_reporting_sales_margin_daily.sql`); snapshot job runs on the VPS at 03:30 WIB; live on staging.)
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

**Phase 0 exception (mockup-first):** before redesign implementation, `design-architect` produces one
decision-complete interactive HTML prototype in `docs/design-mockups/` to the adopted `DESIGN.md`
tokens. Earlier variants remain evidence only. The owner's prototype approval is a **gate**: no redesign
spec or implementation proceeds until signed off. The existing app is legacy evidence, not authorization
to skip this gate.

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

## Tech stack & commands (Phase 1 on; run inside `mos-app/`)
- React 19, Vite, TypeScript, react-router-dom 7. Backend: **self-hosted Supabase** (Postgres + Auth +
  RLS), shared with future Gordi ops apps via schemas `shared` / `mos` / `ops` / `integrations` / `reporting`. (`reporting`: curated ESB financial read-model, snapshot-fed, finance/admin RLS — OD-P4-2 / ADR-0010 D5; migrations deployed (`20260701000001_reporting_sales_daily_revenue.sql`, `20260704000002_reporting_sales_margin_daily.sql`); snapshot job runs on the VPS at 03:30 WIB; live on staging.)
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (Vitest) · `npx playwright test` (e2e).
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
