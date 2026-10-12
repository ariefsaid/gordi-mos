# Gordi MOS — agent index

Load only what the task needs. `docs/` is local-only (gitignored); in a managed worktree find the main checkout with `git worktree list`.

## Read on demand

- `docs/gotchas.md` before changing project behaviour or when something is surprising.
- `docs/decisions.md` when applying an owner decision (`OD-*`) or Director decision (`DD-*`); name the type when citing it.
- `CONTEXT.md` and `docs/agents/domain.md` when domain language or model is relevant.
- `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` when finding or preparing work.
- `docs/agents/pi-delegation.md` before delegating a build: Sol (`gpt-6.1-sol`) designs, Luna (`gpt-6-luna`) builds, through `pi`. Delegate there before using Claude subagents.
- `docs/quality-model.md` when choosing tests.
- `docs/environments.md` when operating non-local environments.
- `mos-app/package.json` for app commands; `scripts/setup-hooks.sh` to install hooks; `scripts/*.test.sh` when diagnosing a guard.

## UI and design

- The redesign runs in `~/Coding/mos-ui-fresh` and lands here one area at a time per its `PORT-BACK.md`. The look authority is the owner's approval of rendered screens there. No document in this repo governs how the app looks.
- On `dev`, do not change how existing pages look. A new page a feature needs is built from existing components and re-skinned at its area's port.
- A test asserts what a user can do, never how it looks. Delete look-asserting tests when you touch the page they pin; never add new ones. Keep behaviour, accessibility (WCAG AA, 44px phone targets, no horizontal scroll at 390px), both languages, and data tests.
- Before handing back UI work: run the impeccable and taste skills on the rendered screens, fix what they find, attach 390px and 1440px screenshots. Hard cap: two rounds.

## Binding rules

- This repo is public: GitHub prose is permanent, and deletion does not unpublish; never publish unpatched weaknesses or missing-control lists, PII, secrets, or secret coordinates. Send weaknesses to a private security advisory and describe them publicly only after the fix ships.
- Keep documentary material and integration-partner coordinates in local `docs/`; before security, auth, infrastructure, or people work, check `gh repo view --json visibility`. Public writing states rules, not dated causes; MOS design artifacts use no external brand, product, or AGPL references.
- GitHub writes go through `scripts/gh-post.sh`; raw `gh` writes are blocked, with `gh pr merge` as the merge exception. Follow refusals from `scripts/pre-pr-verify.sh`, `scripts/gh-post.sh`, `.claude/hooks/pre-pr-gate.sh`, `.claude/hooks/merge-migration-order.sh`, `.githooks/commit-msg`, and `.githooks/pre-push`.
- Review is machine-first. Typecheck, lint, behaviour tests, build, gitleaks, RLS tests and migration order run in CI on every PR and are the merge gate. One security review by someone who did not build the branch, only when the diff touches auth, schema/RLS, migrations, money or CI/gate scripts; `scripts/gh-post.sh` enforces this. No spec or code-quality review rounds. No review of looks.
- Keep migrations reversible; every business table has RLS and the `org_id` tenancy seam is enforced.
- `OD-*` decisions are owner-locked until changed; `DD-*` decisions are Director-made and binding until revised, but may be challenged with evidence. Name the decision type when citing it.
- Main and staging merges require explicit owner assent.
- Escalate only money or promises, irreversible actions outside a signed brief, scope-versus-time choices that change what ships, or facts only the owner holds; decide other matters within delegated scope. Park blocked steps; silence is not assent, and explicit current-task direction overrides project defaults.
- Never report an action without reading its output; include the line that proves a completion claim. Report when a job finishes, with its proof; never promise timed check-ins.
- Do not add AI attribution trailers to agent-authored commits; `.githooks/commit-msg` blocks Claude/Anthropic co-author trailers.
- One deterministic owning test per acceptance criterion at the cheapest sufficient layer; assert the user's goal; keep ≥80% changed-line coverage with behaviour tests; retain security, data-integrity, and public-write safeguards.
- Reuse before adding; name what you reused on the PR's `Reused:` line. Use proven MIT, Apache-2.0, or MPL-2.0 libraries behind a MOS-owned interface instead of hand-building controls.
- Only manually dispatch CI e2e for shared-code or milestone PRs into `dev`; a second run requires a real app bug and code fix, never a flake rerun. Main PRs run their own e2e; scheduled/looping runs need owner approval. Use `scripts/ci-e2e.sh`. Run at most one heavy local job across sessions and repos.
- A record has typed fields plus an authored block document (OD-REDESIGN-16).
- Batch owner questions and preserve their original outcome and provenance in briefs. For out-of-scope findings, do the work, file an issue, or drop it in one line; never use a suggested-task chip.
- Comments say what code does; state rationale once in its owning artifact. Prose counts must stay true everywhere or be omitted.

## MOS

Usability and speed beat model completeness. MOS has Home / Work / Money / Inbox; Work holds Signals, Tasks, Projects & Processes, and Objectives, with RACI on records and Café as the ops module. See `CONTEXT.md` for domain terms.
