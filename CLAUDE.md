# Gordi MOS

## Active Home and Tasks replacement

For Home and Tasks composition, `REDESIGN.md` is the current owner-composition brief and delivery
scope; `DESIGN.md` is the intended style and interaction authority, amended by current owner
direction and delegated Director Decisions in `docs/decisions.md` (DD-MVP). `REDESIGN.md` supersedes historical
page-composition constraints only where it records current owner decisions; it does not authorize
unrelated palette or token drift, or certify the current implementation. Retired interaction
prescriptions must not override the current DD-MVP acceptance criteria. Current MVP UI work covers
Tasks, Café WIP production and Signals by default; explicit current owner scope can include Home
and other surfaces and supersede older composition constraints. Follow the
UI execution route below.
`docs/plans/2026-09-14-mvp-recovery.md` is the historical one-hour checkpoint; its time fences
and pending statements do not govern this continuation. Use bounded isolated
workers, integrate running surfaces, and review the result against actual user outcomes. Preserve
business/security contracts and public-write safeguards.


> ## ⚠️ THIS REPO IS PUBLIC — `github.com/ariefsaid/gordi-mos`
>
> Commits, issues, PRs and comments are world-readable and permanent. Deleting does not un-publish.
> **Never write here:** unpatched weaknesses (no "X has no auth check", no list of missing
> controls) · PII (staff names, personal emails, roles tied to people; "the 5 `@gordi.id` staff" is
> an enumeration hint) · secrets **or their coordinates** (vault/item/env-var names, internal
> hostnames, endpoints, tenant ids).
>
> Instead: weaknesses → private security advisory (`scripts/gh-post.sh api --method POST .../security-advisories` — raw write-mode `gh api` is hook-denied), described
> publicly only **after** the fix ships. Anything documentary → `docs/`, gitignored, its own local
> repo. Blunt on purpose: code syncs to GitHub, docs stay local — per-file judgment is what failed.
>
> Touching security, auth, infra or people? `gh repo view --json visibility` first.
> (2026-07-31: fifteen issues filed from the backlog, four detailing live auth/RLS holes, visibility
> never checked.)

Internal **Management Operating System** for Gordi, ~30 people. Four workspace roots —
Home / Work / Money / Inbox — with Work carrying the object collections (Signals · Tasks ·
Projects & Processes · Objectives) and Café as the ops module; RACI lives on the objects.
Updates + per-Activity ops + reference data + money follow-ups. Ships at
`https://ops.gordi.id/mos`.

**Usability and speed beat model completeness.**

## UI review and improvement tasks

For a bounded UI/UX/IA/IxD request, use `docs/takeover/mvp-ui-continuation.md` as the execution
entrypoint. Inspect and critique the running interface before implementation; quantitative checks
support the visual review. That route owns scope, skill selection, review order and stopping rules.
The factory loop below governs ticket delivery and publication, not a prerequisite to opening or
showing a local preview. Explicit owner deadlines stop workers and verification as well as edits;
report the actual build and remaining limitations at the deadline.

## Workflow — you run as Director; `/drive` runs the loop

`/drive` is the session: frontier grill (owner present) → pick → factory build → verify →
independent review → PR → auto-merge to dev → next. Its machinery binds outside the skill too:

1. Unclear ask → `/grilling` (too big for one session → `/wayfinder`) → `/to-spec` → `/to-tickets`.
2. Build. The factory is the default executor for ordinary bounded tickets, dispatched ONLY via
   `bash scripts/factory-run.sh` (never bare `uv run adws/…` — the wrapper carries the gh no-auth
   layer). An explicit owner-authorized separate Codex task/model delegation is a first-class
   Director lane. For Codex subagents, the owner default is `gpt-6-luna` with `max` reasoning;
   pass both explicitly on dispatch, rather than inheriting the Director's model or effort.
   Isolate the lane, name it in the ticket's
   in-flight marker, and keep the same brief, verification, independent review, public-write, and
   security gates. A Claude subagent dispatch additionally needs a logged lane —
   `scripts/lane-exempt.sh` (hook denies otherwise; Explore/Plan free). For explicitly authorized
   bounded UI delegation, `bash scripts/lane-exempt.sh - owner-ui "<authorized scope>"` records
   one dispatch locally; publication still uses the gates below.
3. Review: three independent lens verdicts. One reviewer who did not build the candidate may
   cover all three; separate contexts are needed only when the selected route requires them for
   independence or calibration. Never your own read.
4. A PR needs four stamps: `bash scripts/pre-pr-verify.sh` + one per lens via
   `scripts/record-review.sh --lens spec|code-quality|security` (a reviewer that didn't build
   it: glm/luna, opus fallback). CI on the PR is the merge gate.
5. GitHub writes ONLY via `scripts/gh-post.sh` — the firewall hook denies raw `gh` writes; the
   posting policy lives in local `docs/`, per the banner above. One carve-out: `gh pr merge`
   stays raw (no prose leaves through a merge).

Escalate **only**: money or a promise · irreversible outside a signed brief · scope-vs-time that
changes what ships · a fact only the owner holds. Within delegated scope, decide the rest and state
the reasoning. The owner's explicit current-task direction supersedes a project default for that
task; security, public-write, verification, and independent-review gates bind every lane. When an
owner-class fact or conflicting authority is required, name the blocker and park that step — never
infer assent from silence.

Out-of-scope finding: do it, file a GitHub issue, or drop it with one line. **Never a suggested-task
chip** — that pushes the decision back to the owner (owner, 2026-08-07).

## Review roster

**Three lenses, always: `spec`, `code-quality`, `security`.** Adversarial briefs, run unasked before
claiming done. One record per lens, a PR comment whose ENTIRE body is:

```
<!-- review-gate -->
Reviewer: spec | code-quality | security
Verdict: MERGE | MERGE WITH CHANGES | DO NOT MERGE
Commit: <full 40-character HEAD sha>
```

Findings in a separate comment, never the PR body. Records certify the exact HEAD: a content push
staleifies every record. Round 1 is a full independent pass; later rounds are delta-only for named
fixes or genuinely new risk. Formatting/whitespace-only changes, or mechanical artifact refreshes
with no new authored behavior, do not start a substantive review round; if they move HEAD, the
independent reviewer must issue an exact-HEAD mechanical confirmation, never edit or reuse a stale
record.

## Repo layout
- `mos-app/` — the app (React 19 + Vite + TypeScript + react-router-dom 7). Run npm/vite here.
- `supabase/migrations/` — Postgres schema + RLS. Schemas `shared`/`mos`/`ops`/`integrations`/
  `reporting`. One self-hosted Supabase serves MOS and future Gordi apps: schema separation.
- `docs/` — **not in this repo.** Local, gitignored, own git repo (same as `.claude/`). ADRs, owner
  decisions, gotchas, runbooks, infra coordinates, agent config, archive. Start `docs/README.md`.

## Commands (inside `mos-app/`)
`npm run dev` · `build` · `typecheck` · `lint` (script already carries `--max-warnings=0`; also
runs `lint:css`) · `test` (Vitest; the PR gate runs `test:coverage`) ·
`e2e` (Playwright, holds the shared DB lock — #388) · `supabase test db` (pgTAP — run from the
repo root, not `mos-app/`) ·
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
- UI changes also require the repo-vendored design-tooling lane in local `docs/decisions.md`
  (DD-MVP-12/13) and `docs/quality-model.md`: Impeccable detector + audit/critique + post-fix
  polish, with Taste as the secondary anti-slop lens. Missing, unrunnable or stale tooling is an
  explicit incomplete review, never a silent fallback.
- UI is not done until rendered and operated at real widths (incl. ≤390px phone): open controls,
  keyboard/focus, long content, loading/empty/error states and the persisted role-correct journey.
  Record browser evidence separately from source/test evidence; shared-component reuse is not visual acceptance.

## Test pyramid

Retain a test or review requirement only when it owns a current behavior or risk, has a
deterministic failure condition, and runs at the cheapest sufficient layer. Remove or archive
stale product assertions, overlapping checks, duplicate evidence and prose-only refusal gates.
Security, data-integrity and public-write safeguards remain binding.
Each acceptance criterion is owned by **one** test at the lowest sufficient layer: unit (Vitest/RTL)
for logic and components; **pgTAP** for RLS and role read/write contracts; Playwright for a handful
of real cross-stack journeys only.

**A test encodes the user's real journey to the goal and asserts that goal.** For unchanged
behavior, the app conforms to the test. When an approved behavior change makes an assertion
obsolete, update the test and its acceptance evidence in the same diff while keeping the assertion
at the behavior level; never weaken an assertion solely to go green.

The project lifecycle owns phase routing: discovery/grilling → `to-spec` synthesis of settled
intent → bounded factory or authorized Director execution → independent review → milestone
acceptance. Superpowers techniques serve these phases; they do not restart a second approval or
specification loop. Preserve batched owner questions and original outcome/provenance in briefs.
Under OD-REDESIGN-88, understood seams may use test-with against the approved acceptance oracle;
retain red-first for bug fixes, uncertain logic and protected interaction-contract changes.
Automatic UI guards and changed-surface browser checks run per change. Deep rendered judgment
covers touched and connected surfaces at a signed milestone boundary, or when the ticket's
contract explicitly requires it; ordinary tickets do not repeat the whole-product assessment.
Initial visual critique runs before fixes and is independent of detector findings; final rendered
confirmation follows fixes. The pixel layer belongs to an independent image-capable reviewer: `fe_reviewer` qualifies only
after a real image-transport and candidate-binding probe succeeds, otherwise use a separate
Director/Codex image-capable lane. DOM/a11y evidence alone cannot pass pixels; provider failure
leaves review incomplete. See `docs/quality-model.md` for the two-speed design contract.

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
