# Gordi MOS — agent index

Use progressive disclosure: load only task-relevant references; managed worktrees omit local `docs/`.

## Read on demand

- Read `docs/agents/factory.md` when routing work, delegating, escalating, verifying, or handling CI/PR workflow.
- Read `docs/agents/skills.md` when choosing a workflow entrypoint, finding available skills, or editing skills; edit only `.claude/skill-overrides/<name>/`.
- Read `docs/agents/review.md` when reviewing work or recording verdicts.
- Read `docs/gotchas.md` before changing project behavior or when something is surprising.
- Read `docs/quality-model.md` when choosing quality checks or review depth.
- Read `docs/takeover/mvp-ui-continuation.md` for a UI design pass or release review; it is the visual-first execution route.
- Read `docs/decisions.md` when applying an owner or Director decision; identify it as `OD-*` or `DD-*`.
- Read `CONTEXT.md` and `docs/agents/domain.md` when domain language or model is relevant.
- Read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` when finding or preparing work.
- Read `docs/agents/pi-delegation.md` before delegating a build or review: it names the headless coding harness in use (currently pi), the current coding and review models, and their inference providers. Delegate there before using Claude subagents.
- Read `docs/environments.md` when operating non-local environments.
- Read `REDESIGN.md` and `DESIGN.md` when changing Home or Tasks composition; `DESIGN.md` governs styling, and current owner direction/DD-MVP supersedes historical placement.
- Read `mos-app/package.json` when looking up app commands; read `scripts/setup-hooks.sh` when installing hooks and `scripts/*.test.sh` when diagnosing guards.
- Read the selected skill's `SKILL.md` and follow its flow for each phase; use `ask-matt` when unsure. Every brief names the skill, phase, and evidence.
- Read `docs/README.md` when locating the repo map or local docs; in managed worktrees, find the main checkout with `git worktree list` because `docs/` is local-only.

## Binding rules

- This repo is public: GitHub prose is permanent, and deletion does not unpublish; never publish unpatched weaknesses or missing-control lists, PII, secrets, or secret coordinates. Send weaknesses to a private security advisory and describe them publicly only after the fix ships.
- Keep documentary material and integration-partner coordinates in local `docs/`; before security, auth, infrastructure, or people work, check `gh repo view --json visibility`. Public writing states rules, not dated causes; MOS design artifacts use no external brand, product, or AGPL references.
- GitHub writes go through `scripts/gh-post.sh`; raw `gh` writes are blocked, with `gh pr merge` as the merge exception. Follow refusals from `scripts/pre-pr-verify.sh`, `scripts/gh-post.sh`, `scripts/record-review.sh`, `.claude/hooks/pre-pr-gate.sh`, `.claude/hooks/merge-migration-order.sh`, `.githooks/commit-msg`, and `.githooks/pre-push`.
- Keep migrations reversible; every business table has RLS and the `org_id` tenancy seam is enforced.
- Every change gets independent `spec`, `code-quality`, and `security` reviews; the builder never reviews their own work. Challenge briefs against all three before claiming done; CI on the PR is the merge gate. These gates bind every lane.
- `OD-*` decisions are owner-locked until changed; `DD-*` decisions are Director-made and binding until revised, but may be challenged with evidence. Name the decision type when citing it.
- Main and staging merges require explicit owner assent.
- Escalate only money or promises, irreversible actions outside a signed brief, scope-versus-time choices that change what ships, or facts only the owner holds; decide other matters within delegated scope. Park blocked steps; silence is not assent, and explicit current-task direction overrides project defaults.
- Never report an action without reading its output; include the line that proves a completion claim.
- Do not add AI attribution trailers to agent-authored commits; `.githooks/commit-msg` blocks Claude/Anthropic co-author trailers.
- Keep one deterministic owning test per acceptance criterion at the cheapest sufficient layer; assert the user's goal, keep ≥80% changed-line coverage, and retain security, data-integrity, and public-write safeguards. Read `docs/quality-model.md` for the full test pyramid.
- Every touched UI page must render at ≤390px and ≥1440px. A design pass is required for PRs adding a route, page, component, or CSS; changing >150 page/component `.tsx`/`.css` lines; or fixing owner-reported UI issues; otherwise run it per release on dev→main. Read the UI route for operated-journey requirements.
- Reuse before adding; name what you reused on the PR's `Reused:` line.
- Only manually dispatch CI e2e for shared-code or milestone PRs into `dev`; a second run requires a real app bug and code fix, never a flake rerun. Main PRs run their own e2e; scheduled/looping runs need owner approval. Use `scripts/ci-e2e.sh`; its output explains enforced queue and dispatch caps. Run at most one heavy local job across sessions and repos.
- Use proven MIT, Apache-2.0, or MPL-2.0 libraries behind a MOS-owned interface instead of hand-building controls.
- A record has typed fields plus an authored block document (OD-REDESIGN-16).
- Milestone rendered review covers every route, width, and control state and searches each finding as a class; ordinary tickets cover touched and connected surfaces unless their contract requires more. Shared-component reuse does not substitute for rendered acceptance.
- Batch owner questions and preserve their original outcome and provenance in briefs. For out-of-scope findings, do the work, file an issue, or drop it in one line—never use a suggested-task chip.
- Apply ponytail to authored work: comments say what code does; state rationale once in its owning artifact. Prose counts must stay true everywhere or be omitted; schema-comment counts must be pinned by tests.

## MOS

Usability and speed beat model completeness. MOS has Home / Work / Money / Inbox; Work holds Signals, Tasks, Projects & Processes, and Objectives, with RACI on records and Café as the ops module. See `CONTEXT.md` for domain terms.
