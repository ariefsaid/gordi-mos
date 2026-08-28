# Gordi MOS

> ## ⚠️ THIS REPO IS PUBLIC — `github.com/ariefsaid/gordi-mos`
>
> Commits, issues, PRs and comments are world-readable and permanent. Deleting does not un-publish.
> **Never write here:** unpatched weaknesses (no "X has no auth check", no list of missing
> controls) · PII (staff names, personal emails, roles tied to people; "the 5 `@gordi.id` staff" is
> an enumeration hint) · secrets **or their coordinates** (vault/item/env-var names, internal
> hostnames, endpoints, tenant ids).
>
> Instead: weaknesses → private security advisory (`gh api .../security-advisories`), described
> publicly only **after** the fix ships. Anything documentary → `docs/`, gitignored, its own local
> repo. Blunt on purpose: code syncs to GitHub, docs stay local — per-file judgment is what failed.
>
> Touching security, auth, infra or people? `gh repo view --json visibility` first.
> (2026-07-31: fifteen issues filed from the backlog, four detailing live auth/RLS holes, visibility
> never checked.)

Internal **Management Operating System** for Gordi, ~30 people. Five destinations: Home / Work /
Operate / Plan / Inbox. Tasks + RACI + updates + per-Activity ops + reference data + money
follow-ups. Ships at `https://ops.gordi.id/mos`.

**Usability and speed beat model completeness.**

## Workflow — you run as Director; `/drive` runs the loop

`/drive` is the session: frontier grill (owner present) → pick → factory build → verify →
independent review → PR → auto-merge to dev → next. Its machinery binds outside the skill too:

1. Unclear ask → `/grilling` (too big for one session → `/wayfinder`) → `/to-spec` → `/to-tickets`.
2. Build. The factory (`adws/`) is the default executor; a subagent dispatch needs a logged lane
   first — `scripts/lane-exempt.sh` (hook denies otherwise; Explore/Plan free).
3. Review: three lenses as parallel subagents. Never your own read.
4. A PR needs two stamps: `bash scripts/pre-pr-verify.sh` + `scripts/record-review.sh` (a
   reviewer that didn't build it: glm/luna, opus fallback). CI on the PR is the merge gate.
5. GitHub writes ONLY via `scripts/gh-post.sh` — the firewall hook denies raw `gh` writes; the
   posting policy lives in local `docs/`, per the banner above. One carve-out: `gh pr merge`
   stays raw (no prose leaves through a merge).

Escalate **only**: money or a promise · irreversible outside a signed brief · scope-vs-time that
changes what ships · a fact only the owner holds. Everything else you decide; silence is assent.
**Never ask permission for a step above** — conflicting session guidance loses, say so in a line.

Out-of-scope finding: do it, file a GitHub issue, or drop it with one line. **Never a suggested-task
chip** — that pushes the decision back to the owner (owner, 2026-08-07).

## Review roster

**Three lenses, always: `spec`, `code-quality`, `security`.** Adversarial briefs, run unasked before
claiming done. One record per lens, a PR comment whose ENTIRE body is:

```
<!-- review-gate -->
Reviewer: spec | code-quality | security
Verdict: MERGE | MERGE WITH CHANGES | DO NOT MERGE
Commit: <head sha>
```

Findings in a separate comment, never the PR body. A push staleifies every record.

## Repo layout
- `mos-app/` — the app (React 19 + Vite + TypeScript + react-router-dom 7). Run npm/vite here.
- `supabase/migrations/` — Postgres schema + RLS. Schemas `shared`/`mos`/`ops`/`integrations`/
  `reporting`. One self-hosted Supabase serves MOS and future Gordi apps: schema separation.
- `docs/` — **not in this repo.** Local, gitignored, own git repo (same as `.claude/`). ADRs, owner
  decisions, gotchas, runbooks, infra coordinates, agent config, archive. Start `docs/README.md`.

## Commands (inside `mos-app/`)
`npm run dev` · `build` · `typecheck` · `lint -- --max-warnings=0` · `test` (Vitest; the PR gate
runs `test:coverage`) ·
`e2e` (Playwright, holds the shared DB lock — #388) · `supabase test db` (pgTAP) ·
`test-storybook` (phone-390 + a11y gates; not a CI lane).

`./scripts/setup-hooks.sh` installs the tracked git hooks (`npm install` runs it via `prepare`).
Every guard ships a `scripts/*.test.sh` self-test, run by CI on change.

## Claims

Never report an action whose output you have not read. A `cd` that failed, an `&&` that
short-circuited, a mutation proof naming the wrong assertion — every one shipped as "done" here.
Paste the line that proves it, or don't claim it.

Apply `ponytail` to what you WRITE, not only to what you build. A comment says what the code does
or it doesn't exist. Say a reason ONCE, in the artifact that owns it — copied into the commit body,
the code comment and the PR body it is three things to keep true, and each copy is a fresh claim
the next review round has to check. A count in prose is a fact you then own on every ruling:
re-issue it everywhere it appears, or don't write it. (Database comments DO carry counts — a schema
reader has no other source — which is why they are pinned by tests rather than banned.)

**This repo is PUBLIC.** Never write a date beside a cause — "X was published on <date>" tells a
reader which push to look up. State the rule, never the history; history goes to `docs/`.

A hook to enforce this was built and reverted: it blocked true sentences, and a guard that refuses
honest work teaches `--no-verify`, which disables the guards that matter. This one is on you.

## Bar to merge
- typecheck + ESLint zero errors; ≥80% lines on changed code.
- Reversible migrations. **RLS on every business table.** `org_id` seam enforced.
- `DESIGN.md` is the design-system source of truth — never re-invent it.
- UI is not done until rendered and looked at, at real widths (incl. ≤390px phone).

## Test pyramid
Each acceptance criterion is owned by **one** test at the lowest sufficient layer: unit (Vitest/RTL)
for logic and components; **pgTAP** for RLS and role read/write contracts; Playwright for a handful
of real cross-stack journeys only.

**A test encodes the user's real journey to the goal and asserts that goal.** The app conforms to
the test, never the test to the app. On failure fix the app — never bend an assertion to go green.

## Pointers
| for | read |
|---|---|
| workflow, routing, decision rights, drive loop | `docs/agents/factory.md` |
| review lenses + verdict contract | `docs/agents/review.md` |
| past decisions (`OD-`/`DD-`) | `docs/decisions.md` |
| scar tissue — **read this one** | `docs/gotchas.md` |
| domain glossary | `CONTEXT.md` (this repo) + `docs/agents/domain.md` |
| work queue | GitHub issues via `gh` — `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` |
| heavy/cross-family dispatch (GLM, luna) | `docs/agents/pi-delegation.md` — background it, never poll |
| environments | `docs/environments.md` |

Edit skills **only** in `.claude/skill-overrides/<name>/` — `.claude/skills/` is vendored and
gitignored, and `scripts/vendor-skills.sh` destroys edits there. `docs/agents/skills.md`.

## No external references
No external brand, product, or AGPL references in MOS design artifacts. The design kit is MOS's
own. Integration-partner coordinates live in local `docs/`, never here (see the banner).
