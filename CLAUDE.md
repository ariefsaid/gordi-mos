# Gordi MOS

> ## ⚠️ THIS REPO IS PUBLIC
>
> `github.com/ariefsaid/gordi-mos` is **world-readable**. Everything you commit, and every issue,
> PR, or comment you file, is published — permanently, and indexed by search engines and code
> scrapers. Deleting later does not un-publish: git history, forks, and caches survive it.
>
> **Never write into this repo or its tracker:**
> - **Unpatched security weaknesses.** No "X has no auth check", no "Y is missing a constraint",
>   no checklist of controls that are *not yet* in place. That is a free exploit guide, and the
>   window between filing and fixing is exactly when it is useful to an attacker. Use a **GitHub
>   private security advisory** (`gh api .../security-advisories`) or tell the owner directly.
>   A weakness may be described publicly only **after** the fix has shipped.
> - **PII.** Staff names, personal emails, phone numbers, roles tied to individuals. Account-shape
>   detail counts too — "the 5 `@gordi.id` staff" is an enumeration hint.
> - **Secrets or their coordinates.** Not just keys: vault names, item names, env-var names,
>   internal hostnames, SMTP/API endpoints, tenant IDs.
>
> **Where things go instead:**
> - Unpatched weaknesses → **private security advisory** (`Security → Advisories`). Track publicly
>   only as a neutral stub that names no path and no missing control.
> - Anything documentary at all → **`docs/`**, which is gitignored and tracked in its own local
>   repo. The rule is blunt on purpose: code syncs to GitHub, docs stay local. No per-file
>   judgment about what is safe to publish — that judgment is what failed.
>
> **Before filing any issue or commit that touches security, auth, infra, or people:** run
> `gh repo view --json visibility` and act on what it says. Do not assume an internal-sounding
> project is a private repo — this one is not.
>
> Incident that produced this rule: 2026-07-31. Fifteen issues were filed migrating the backlog,
> four of them describing unpatched auth/RLS weaknesses in detail, without visibility ever being
> checked. The content already existed in `docs/backlog.md` in public git history, but converting
> it into titled, labelled, searchable issues made it far more discoverable.

Internal **Management Operating System** for Gordi — the operating system for all ~30 people.
Five destinations: Home / Work / Operate / Plan / Inbox. Tasks + RACI + updates + per-Activity ops +
reference data + money follow-ups. Ships at `https://ops.gordi.id/mos`.

**Usability and speed beat model completeness.**

## Repo layout
- `mos-app/` — the app (React 19 + Vite + TypeScript + react-router-dom 7). Run npm/vite here.
- `supabase/migrations/` — Postgres schema + RLS. Schemas: `shared` / `mos` / `ops` / `integrations` /
  `reporting`. One shared self-hosted Supabase serves MOS and future Gordi ops apps — schema
  separation, not project separation.
- `docs/` — **not in this repo.** Its own local git repo, gitignored here (same pattern as
  `.claude/`). Holds ADRs, owner decisions, gotchas, environment runbooks, infra coordinates, the
  JTBD oracle, the skills' `agents/` config, and the archived history. **Code syncs to GitHub;
  docs stay local.** Start at `docs/README.md`.

## Commands (run inside `mos-app/`)
`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint -- --max-warnings=0` ·
`npm test` (Vitest) · `npx playwright test` (e2e) · `supabase test db` (pgTAP).

## Bar to merge
- `npm run typecheck` zero errors; ESLint zero errors; ≥80% lines on changed code.
- Reversible migrations. **RLS on every business table.** `org_id` seam enforced.
- `DESIGN.md` is the design-system source of truth — never re-invent it.
- UI is not done until it has been rendered and looked at, at real widths (incl. ≤380px phone).

## Test pyramid
Each acceptance criterion is owned by **one** test at the lowest sufficient layer: unit (Vitest/RTL)
for logic and components; **pgTAP** for RLS and role read/write contracts; Playwright for a handful of
real cross-stack journeys only.

**A test encodes the user's real journey to the goal and asserts that goal.** The app conforms to the
test, never the test to the app. On failure, fix the app. Never bend an assertion to the app's current
state to go green.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `ariefsaid/gordi-mos`, driven by the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` (this repo) + `docs/adr/` (the local docs repo).
See `docs/agents/domain.md`.

### Skills

Edit skills **only** in `.claude/skill-overrides/<name>/`. `.claude/skills/` is vendored and
gitignored — edits there are destroyed by the next `scripts/vendor-skills.sh`.
See `docs/agents/skills.md`.

### Delegating to pi (GLM / luna)

Background the dispatch and wait for the notification — **never poll, and never kill on an empty
log: `pi -p` buffers until it exits.** See `docs/agents/pi-delegation.md`.

## Read before you start
`CONTEXT.md` (domain glossary, in this repo) · then the local `docs/` repo: `docs/README.md`,
`docs/gotchas.md` (scar tissue — read this one), `docs/decisions.md`, `docs/environments.md`.

## No external references
No external brand, product, or AGPL references in MOS design artifacts. The design kit is MOS's own.
Integration-partner coordinates are a separate concern and are governed by the public-repo banner
above — they live in the local `docs/` repo, never here.
