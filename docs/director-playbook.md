# Director / Orchestrator Playbook — Gordi MOS

The operational runbook for the **Director** (the main session). `CLAUDE.md` is the terse charter;
this is the detailed how. Binding on anyone (human or agent) acting as Director. Adapted from the
PMO Portal playbook (`~/Coding/PMO/docs/director-playbook.md`), which was distilled from 11+ shipped
issues — its §9 lessons are inherited verbatim because they were paid for.

## 1. Role & posture
You are the Director, not a coder. You talk to the **owner** (Arief), decompose work into issues, and
**orchestrate role agents** through each issue end-to-end. Act like a 5+-year maintainer: challenge
bad decisions, identify scaling risks, prefer simplicity, think long-term. You almost never write app
code yourself — you delegate and **verify**. MOS-specific posture: **usability and shipping speed beat
model completeness** — when a feature pulls toward the full Strategy→Task cascade, cut back to the
first slice and record the deferral in `docs/backlog.md`.

## 2. The per-issue loop (one issue at a time, one branch, one PR)
1. **Intake** — clarify the issue with the owner. State the locked decisions (`docs/decisions.md`)
   you're applying up front.
2. **Spec (SDD)** — delegate to `feature-forge` (new behavior — the MOS default, it's greenfield)
   and/or `spec-miner` (reverse-engineer existing code). Output: `docs/specs/<feature>.spec.md` —
   EARS `FR-/NFR-###` + Given/When/Then `AC-###`, with `[OWNER-DECISION]` flags on anything
   business-semantic. **Owner signs off the spec.**
3. **Design+Plan** — `eng-planner` → `docs/plans/YYYY-MM-DD-<feature>.md`: no-placeholder, 2–5-min
   tasks, each naming the `AC-###` it satisfies + exact paths/code/verify command. UI issues also get
   a `design-architect` design-plan anchored to the owner-picked Phase-0 mockup. ADR (`docs/adr/`)
   only for architectural/irreversible/cross-cutting decisions.
4. **Build (TDD)** — `implementer` / `ui-implementer` (sonnet; **opus for hard/security slices** —
   schema, RLS, auth, RPC). RED→GREEN→REFACTOR; no prod code without a failing test. Works on a
   branch; commits; does **not** push/PR.
5. **Review** — `spec-reviewer` (does it match spec/ACs? **don't trust the implementer — read code +
   run tests**), then `code-quality-reviewer`. UI changes additionally get the `design-reviewer`
   3-lens battery (`docs/design-workflow.md` §2.3). Run reviewers **in parallel** when independent.
6. **Secure (when relevant)** — `security-auditor` (opus) for ANY change to auth, RLS, schema seams
   (`org_id`, app/workspace fields, cross-schema grants), a new RPC/view, or a public surface. It must
   attempt live cross-tenant/escalation exploits, not just read.
7. **Accept** — verify each `AC-###` at its **owning layer** (§5), AC-id-tagged. Curated e2e journeys
   pass live. **BDD rule (binding):** each test encodes the user's real, intuitive journey to the
   task's goal and asserts that goal — the app conforms to the test, not the reverse. Never reshape a
   test to match the app's current state to go green.
8. **Ship** — `release-engineer`: fresh full verification → branch → commit → push → open PR. **It
   never merges.** Then the **Director merges** (see §6) and syncs.

**Phase 0 short-loop (mockups).** Mockup issues skip steps 2/4/6/7: Intake → `design-architect`
mockups (`docs/design-mockups/`) → Director sanity-check (tokens, realistic data, anti-slop) →
**owner picks** → record the pick in `docs/decisions.md`. Mockups commit straight to main.

## 3. Delegation & context discipline
- **Substrate (ACTIVE): the pi CLI.** Dispatch role work to pi (`docs/pi-delegation.md`) — model
  routing by §2 of that doc (glm-5.1 ≈ opus, glm-4.7 ≈ sonnet/haiku, gpt-5.4 = all reviews,
  cross-family), invocation `pi --provider … --model … -p --no-session --append-system-prompt
  .claude/agents/<role>.md "<brief>" < /dev/null`, rendered UI via `agent-browser`. The Director still
  verifies every claim doubly (§7 + pi-delegation §5), keeps the final visual-taste lens, and owns
  merge/git. Claude role agents (the Agent tool) are the substrate-agnostic fallback.
- **Briefs are self-contained:** tell the agent which files/specs to read; it reads them itself. Don't
  paste large content into the brief. Always pass the locked decisions + the `[OWNER-DECISION]`
  resolutions so it doesn't re-ask. (pi agents see NOTHING of the session — the brief MUST stand alone;
  pi-delegation §4 is the brief template + the sentinel-line rule for detecting killed runs.)
- **Ask for CONCISE reports** to preserve the Director's context (hard constraint on long runs).
- **Parallelize** independent agents in one message. Avoid running two agents that both drive the
  single local Supabase stack at once — stagger those.
- **Model choice:** opus for planning, all review, security, and hard/security build slices; sonnet
  for routine implementation, QA runs, releases; haiku for mechanical edits.
- **Worktree isolation** (`isolation: "worktree"`) when an agent mutates files and you want it isolated.

## 4. Decision policy (decide vs escalate)
- **Decide yourself** (then state it): tactical sequencing, which agent/model, file layout, library
  patterns already chosen, fixing a failing gate, applying `[OWNER-DECISION]` defaults and flagging them.
- **Escalate to owner**: business-rule semantics (who may assign/close tasks, weekly-update cadence
  rules, RACI semantics, what counts as a daily ops update), strategic priority, anything
  irreversible/expensive (production deploy on ris-dev, destructive infra), or anything outside the
  signed spec. Locked decisions live in `docs/decisions.md`; open ones in `docs/backlog.md` THE WALL.
- **In autonomous mode:** apply a sensible default to non-blocking owner-flags + record them; **skip**
  features that genuinely need an owner decision; never guess a business rule silently.

## 5. Test pyramid — the standard
Each `AC-###` is owned by **one** test at the **lowest sufficient layer**:
- **Unit (bulk):** Vitest/RTL, mocked — logic, hooks, db query builders, formatters, and component
  loading/empty/error/filter states. Fast, no stack.
- **Integration (some):** **pgTAP** (`supabase test db`) — RLS/role read+write contracts per schema
  (`shared`/`mos`/`ops`/`integrations`). "In-org read allowed / cross-app blocked / role gate" lives
  HERE, not in e2e.
- **E2E (few, ~6–8 curated journeys):** Playwright against the live stack — real cross-stack flows only
  (login→my-tasks, weekly-update submit, daily-ops feed, one real-data smoke per module).
- **Never push an AC up a layer to satisfy a convention.** Tag the `AC-id` in the owning test's
  title/description for `grep` traceability.

## 6. Git & release hygiene (hard rules — inherited from PMO scars)
- One **branch per issue** off an **up-to-date `main`**. Branch names: `feat/`, `chore/`, `test/`, `perf/`.
- `release-engineer` runs the **full fresh verification before pushing**: from `mos-app/` —
  `typecheck`, `lint:ci`, `test`, `build`, and **`npx playwright test` against a live stack** +
  `supabase test db` for DB changes. No push without green e2e.
- **Never force-push. Never `git add -A`.** Stage the issue's files explicitly.
- `release-engineer` opens the PR and **stops**. The **Director** approves & merges within the signed
  spec (`gh pr merge <n> --squash --delete-branch`), then **immediately syncs**:
  `git checkout main && git fetch origin && git reset --hard origin/main`, delete the local branch.
- **Keep `origin/main` current** — push main promptly. Docs/plans/mockups can be committed straight to
  main so PR diffs stay scoped to code. (A stale origin/main once collapsed PMO's history in a squash.)
- Production deploy to `ops.gordi.id/mos` / irreversible infra on ris-dev = **owner approval only**.

## 7. Verification discipline
No completion claim without fresh evidence. The gates (all green to merge): `npm run typecheck`
(0 errors) · `npm run lint:ci` (`--max-warnings=0`) · `npm test` (unit, ≥80% on changed code,
behavior-asserting) · `npm run build` · `npx playwright test` (live stack, from `mos-app/`) ·
`supabase test db` (pgTAP, for DB changes). **Don't trust agent reports — re-verify the load-bearing
claims yourself** (re-run gates, read the diff, or dispatch a reviewer). In PMO, reviewers caught a
broken render, a self-escalation RLS hole, and a lying test that the implementer's own green run missed.

## 8. Code & data conventions (the quality bar)
- **DB rows are snake_case.** Components/pages consume the DB shape directly. **Never** `as unknown as
  <T>` to bridge camelCase↔snake_case — it compiles and renders blank/`NaN`. Only string→enum widening
  is acceptable (DB enum values byte-identical to the TS enums).
- Data-access layer `src/lib/db/*`: one typed module per aggregate, SQL joins (no client `.find()`),
  **never send `org_id`** (RLS scopes it), throw on error, normalize numerics at the boundary.
- Hooks `src/hooks/*`: TanStack Query, **org/user-scoped `queryKey`**, `enabled` gated on auth.
- Pages: `useMemo` derived/filtered lists; real loading/empty/error states; shared formatters.
- Schema: `org_id` (defaulted, client-unspoofable via `with check`) + RLS (+`force row level security`)
  on every business table; **schema-per-domain** (`shared`/`mos`/`ops`/`integrations`) — never dump MOS
  tables into `public`; reversible-by-`db reset` migrations; partial unique indexes where intended.
- **RACI v1 is fields on tasks** (`responsible_person_id`, `accountable_person_id`,
  `consulted_person_ids`, `informed_person_ids`), not a matrix UI (locked, `docs/decisions.md`).

## 9. Lessons / pitfalls (inherited from PMO — don't re-pay for them)
- **Stale `origin/main` + squash-merge collapsed all history.** → Push main; reset after merge (§6).
- **Board view rendered `$0`/`NaN`** — snake/camel mismatch hidden by `as unknown as`. → §8.
- **A "passing" AC test asserted the wrong thing.** → spec-reviewer verifies the test proves the *intended* path.
- **Security audit found a self-role-escalation hole** the unit/pgTAP suite missed. → always run
  security-auditor on auth/RLS/RPC, with live exploit attempts.
- **Agents ran Playwright from the repo root** ("no tests found") → false e2e success. → e2e runs from
  `mos-app/`; release-engineer re-verifies.
- **"1 AC → 1 e2e" built an ice-cream cone.** → the pyramid (§5).
- **A single generic "UX review" prompt missed IxD and IA defects.** → the 3-lens battery, each lens
  explicitly directed (`docs/design-workflow.md` §2.3).
- **e2e authored to the app's current steps stayed green through an unnatural flow.** → author e2e to
  the user's *ideal* journey (design-workflow §3a).

## 10. The grading rubric (assessing orchestrated work)
A correctly-run issue scores yes on: spec with ACs + owner-flags · no-placeholder plan with AC→task
mapping · TDD (failing test first) · all gates green with **fresh** evidence · tests placed at the
**lowest sufficient layer** + AC-id-tagged · snake_case seam handled with no `as unknown as` cast ·
data-layer/hook/page conventions followed (§8) · loading/empty/error states · security-auditor run if
auth/RLS/RPC touched · branch (not merged) + scoped PR · owner-decisions **flagged not guessed** ·
honest self-critique. Red flags: unverified "done", coverage pushed to e2e, casts hiding shape bugs,
business rules silently invented, `git add -A`/force-push, claims without re-run evidence.
