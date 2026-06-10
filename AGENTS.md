# Gordi MOS — project instructions

Internal **Management Operating System** app for Gordi (replaces the dormant Notion Management OS).
First slice: **task ownership + lightweight RACI + weekly updates + daily ops updates** for managers
and selected ops users. Ships at `https://ops.gordi.id/mos`. Long-term aspiration (NOT first slice):
Strategy → Objective → Outcome → Program/Process → Output → Task. Full product context:
`docs/project-brief.md`. Phasing: `docs/roadmap.md`. **Usability and speed beat model completeness
and Notion fidelity.**

## Repo layout
- `mos-app/` — the app (React 19 + Vite + TypeScript; scaffolded in Phase 1, NOT before). Run npm/vite here.
- `docs/specs/` `docs/plans/` `docs/adr/` — specs, implementation plans, architecture decisions.
- `docs/design-mockups/` — Phase 0 static HTML mockups (IA proposals + key screens).
- `docs/backlog.md` `docs/decisions.md` `docs/roadmap.md` — what's next, owner decisions, phasing.
- `supabase/migrations/` — Postgres schema + RLS (schemas: `shared` / `mos` / `ops` / `integrations`).
- `.claude/agents/`, `.claude/skills/` — role agents and vendored skills (skills are gitignored; re-create with `scripts/vendor-skills.sh`).

## Operating model: Owner → Director → role agents
The **owner** (Arief) talks to the **Director** (the main session). The Director runs an
**issue-driven loop**, spawns the right role agent per phase, and takes each issue end-to-end.
Build **one issue at a time**; pause for owner approval at issue boundaries and before any
push / merge / deploy. Per-issue loop:

1. **Intake** — Director clarifies the issue with the owner.
2. **Spec (SDD)** — `feature-forge` (new behavior) / `spec-miner` (existing code) → `docs/specs/*.spec.md`.
3. **Design+Plan** — `eng-planner` → `docs/plans/YYYY-MM-DD-<feature>.md` (+ ADRs); `design-architect` for UI design-plans.
4. **Build (TDD)** — `implementer` / `ui-implementer` (red-green-refactor; no prod code without a failing test).
5. **Review** — `spec-reviewer`, then `code-quality-reviewer`; `design-reviewer` (3-lens) for UI.
6. **Accept (BDD)** — `qa-acceptance` verifies each `AC-###` at its owning layer (unit / pgTAP / curated e2e).
7. **Secure** (when relevant) — `security-auditor` (OWASP/STRIDE on auth + RLS + schema seams).
8. **Ship** — `release-engineer` (branch → commit → push → PR). Director merges.

**Phase 0 exception (mockup-first):** before any app code, `design-architect` produces static HTML
mockups in `docs/design-mockups/` (IA proposals + first-slice key screens) to the adopted `DESIGN.md`
tokens. The owner's mockup pick is a **gate**: no scaffold, spec, or UI build until signed off.

## Director posture (main session)
Act as a 5+-year maintainer, not a one-shot coder. Before delegating or accepting subagent work:
ask clarifying questions, challenge bad decisions, identify scaling risks, suggest better approaches,
prioritize simplicity. Build a production-grade MVP — minimal enough for a ~15-person rollout,
architected so the larger MOS (objectives, programs, SWPs, RACI matrix) can grow into it without a rewrite.
Detailed runbook: `docs/director-playbook.md`. UI/UX cycle: `docs/design-workflow.md`.
Binding charter + per-layer Definition of Done: `docs/product-expectations.md`.

## Quality gates & checkpoints (binding from Phase 1 on)
- **Coverage:** ≥80% lines on changed code to merge; tests assert behavior, not inflate numbers.
- **Typecheck/lint:** `npm run typecheck` zero errors; ESLint zero errors (`--max-warnings=0`). Both block merge.
- **Checkpoints:** the **owner** approves spec sign-off, Phase-0 mockup picks, and production deploy /
  irreversible infra; the **Director** approves merge-to-main within the signed spec and escalates
  anything strategic or out-of-spec.
- **PRs:** one per issue. **ADRs:** only for architectural / irreversible / cross-cutting decisions.
- **Data/schema:** reversible migrations; **RLS on every business table**; `org_id` + app/workspace
  seams enforced (one shared self-hosted Supabase serves MOS + future ops apps — schema separation, not project separation).
- **Design/UI:** `DESIGN.md` (adopted from PMO — identity authority, never re-invent) is the design-system
  source of truth; 3-lens design review before merging UI changes.

## Agent roster (`.claude/agents/`) and models
eng-planner (opus) · implementer (sonnet; opus for hard slices) · spec-reviewer (opus) ·
code-quality-reviewer (opus) · qa-acceptance (sonnet) · security-auditor (opus) ·
release-engineer (sonnet) · mechanical (haiku) · design-architect (opus) ·
ui-implementer (sonnet; opus for hard slices) · design-reviewer (opus).

## Skill ownership (one owner per concern — avoids collisions)
| Concern | Owner |
|---|---|
| Reverse-engineer existing code → spec | spec-miner (`.claude/skills/`) |
| User stories + acceptance criteria | feature-forge (`.claude/skills/`) |
| Design + task planning | superpowers (brainstorming, writing-plans) |
| TDD build / debugging / verification | superpowers (tdd, systematic-debugging, verification) |
| Code review | superpowers spec + quality reviewers |
| Design-system stewardship (`DESIGN.md`) + Phase-0 mockups | design-architect (impeccable, design-consultation) |
| UI build (to tokens + design-plan) | ui-implementer (ui-ux-pro-max, taste) |
| Visual design review (render + screenshot audit) | design-reviewer (design-review, impeccable, taste) |
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
  RLS), shared with future Gordi ops apps via schemas `shared` / `mos` / `ops` / `integrations`.
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (Vitest) · `npx playwright test` (e2e).
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
