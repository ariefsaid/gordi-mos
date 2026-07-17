# Review ledger — Step 7 "Café retrofit" (branch `claude/redesign-buildout-completion-vdrd17`)

Diff scope: the Café Retrofit slice — Track A (`supabase/migrations/20260717000004_mos_cafe_opening_test_seed.sql`,
`supabase/seed.dev-cafe-opening.sql`, `supabase/config.toml`, `scripts/sandbox-pg.sh`,
`supabase/tests/{96..100}_cafe_opening*.sql`), Track B (`mos-app/src/lib/db/cafe-opening.ts`,
`mos-app/src/components/cafe/*`, `mos-app/src/pages/cafe-opening-page.tsx`, `mos-app/src/router.tsx`,
`mos-app/src/shell/sections.tsx`, `mos-app/src/i18n/messages.ts`), Track C (this pass —
`mos-app/e2e/AC-720-cafe-today-opening.spec.ts`, `mos-app/e2e/global-setup.ts`,
`mos-app/src/components/tasks/tasks-workspace.tsx`, `mos-app/src/pages/tasks-page.test.tsx`, this
ledger). Spec: `docs/specs/cafe-retrofit.spec.md`. Plan: `docs/plans/2026-07-17-cafe-retrofit.md`.
Substrate (consumed, not rebuilt): `docs/adr/0051-occurrence-as-tasks-schema.md` D6/D7/D8/D9/D11,
Step 6 (`docs/specs/occurrence-as-tasks.spec.md`, `docs/plans/2026-07-16-occurrence-as-tasks.md`).
This branch carries other concurrent steps (4/5/6/8/9/10 — see other commits interleaved in
`git log`); **this ledger covers Step 7 only**. Built in worktree branch
`worktree-agent-afa940942d3795b08` (merged onto the Step-6 tip `408a610`); commits tagged
`feat(cafe): A#/B#/C#` — full command: `git log --oneline --grep='feat(cafe):'`.

## Scope card (Step 7)

**In scope (built, this step):**
- **Café-opening seed (data only, no new business schema)**: a test-only `mos._test_seed_cafe_opening()`
  fixture (SECURITY DEFINER, revoked, DOWN-dropped) extending Step 6's `_test_seed_process_tree()`
  with three café-meaningful task defs on the existing "Café Opening" process (…c001) — a
  single-operator checklist Task (`ca01`, 4 items), an independently-owned production-log def
  (`ca02`, deep-links to `/cafe/log`), and a two-holder ambiguous barista def (`ca03`). A parallel
  DEV seed (`seed.dev-cafe-opening.sql`) adds a specifically-named "Café Opening" process (resolved
  by name — RATIFY-7F) on the real BU/Team/Role substrate for the demo + e2e.
- **pgTAP** (`supabase/tests/96..100`): AC-701 (no schema change — `hasnt_column`
  `ops.kitchen_logs.process_run_id`, kitchen tables intact, no new `mos.*` occurrence table),
  AC-702 (spawn + idempotency), AC-703 (ambiguous step → pending → resolve), AC-704 (member denied,
  Team-auth proven separately from the capability denial), AC-705 (checklist-vs-def boundary +
  `ops.kitchen_logs` untouched by the spawn).
- **Café DAL** (`mos-app/src/lib/db/cafe-opening.ts`): `wibToday`, `getCafeOpeningProcessId`
  (name-based resolution, RATIFY-7F), `getTodayOpeningForTeam` (AC-710), `startTodayOpening` +
  `listStartableCafeTeams` (AC-711) — all reuse Step 6's `startRun`/`listDueRuns`/`getRunRollup`
  (Rule 11), no re-implemented RPC calls.
- **`CafeOpeningPanel`** (`mos-app/src/components/cafe/cafe-opening-panel.tsx`): capability-gated
  "Start today's opening" (never a bare "Start"/"Create", AC-712), a read-only non-dead state for a
  `member` viewer (AC-713), the started occurrence caption + derived roll-up +
  `/work/tasks?occurrence=<runId>` link (AC-714), and pending-PIC resolution reusing Step 6's
  `PendingResolution` gated on `process.start` (AC-715). "Process Run" is never rendered.
- **`CafeOpeningPage`** (`/cafe` home, AC-716): resolves the process id, then the branch Team
  (preferring an unstarted due occurrence, falling back to the viewer's own Team membership when
  already started), hosts the panel + the existing Log/Plan/Stock/Review capture links (FR-708); an
  `EmptyState` (not a crash) when no process is configured (RATIFY-7C).
- **Route + nav**: `/cafe` now renders `CafeOpeningPage` (was `Navigate to /cafe/log`, RATIFY-7D);
  `CAFE_SECTIONS` gains an `Opening` leaf; `sectionForPath` rewritten order-independent (exact match
  wins outright, else longest-prefix wins) so `Opening` can't shadow `/cafe/log|plan|stock|review|pushes`.
- **The `?occurrence=<runId>` wiring** (C2): a host link (the panel's "View opening tasks") lands
  `/work/tasks` directly on the Occurrence grouping — reuses Step 6's grouping verbatim, no new
  scoping mechanism.
- **The AC-720/F2 e2e journey** (Start → grouped Tasks → pending "to assign" → resolve → same-group
  → production-log deep-link), written and `--list`-verified; **live execution deferred to the
  Director** (§ below). `e2e/global-setup.ts` additively grants VIEWER (Cahya) the `ops_lead` access
  role (idempotent) so she carries `process.start` as the café shift-lead fixture (RATIFY-7A).

**DEFERRED (do NOT fail these in this review — explicitly out of Step 7, per spec §1/§8):**
- **Café floor `member` starting the opening** — RATIFY-7A. `process.start` stays ops_lead+admin in
  v1 (upholds Step-6 RATIFY-5); a narrower `cafe.open` capability for members is the flagged Option B
  follow-up (requires a schema/capability/RPC change → would trigger mandatory security-auditor).
- **The `ops.kitchen_logs.process_run_id` bridge** — RATIFY-7B. No kitchen-schema change in v1
  (NFR-701); the opening occurrence links to production logging only via a deep-link Task
  (`description` text), never a foreign key.
- **Real production café-branch adoption** — RATIFY-7C. The "Café Opening" process ships as an
  idempotent DEV/test seed only; binding it to a real branch Team/Role stays owner-gated.
- **A stable `work_lines.code`/slug for durable process resolution** — RATIFY-7F. The DAL resolves
  "Café Opening" by name (a known fragility on rename), flagged as a follow-up.
- **Closing / stock-opname / shift-roster Runs, Standards/Checks/evidence** (OD-REDESIGN-4/5/30/31);
  **Roastery/Ecommerce module retrofits** on the same runtime — later slices, the map generalizes.
- **A guided Process designer** — definitions stay seeded, as in Step 6.
- **Kitchen-rename completion**, if any remains outside this slice's touched files (not verified here
  — this review's diff scope is the café-opening retrofit files listed above only).

## Rules 1–12 checklist (unfilled — reviewers fill this in)

| Rule | Compliant? | Notes |
|---|---|---|
| 1 — one job per rail item | | No new rail item — `/cafe` keeps its one Café Module job; the "Opening" leaf is a sub-route within it, not a second root. |
| 2 — three-layer boundary (domain → UI family → destination) | | No new domain object (Step 6's `mos.process_runs`/`process_run_pending_tasks` reused verbatim); the UI family is the shipped Tasks DB-view (Occurrence group-by, unchanged) + a new thin `CafeOpeningPanel` presentational family scoped to the Café destination — reviewer to confirm this doesn't blur into a second Task-list family. |
| 3 — rail/surface budget caps | | No new surface added at the rail level — `/cafe` is pre-existing; only its *content* changed (Navigate → CafeOpeningPage). |
| 4 — canonical routes + URL state | | `/cafe` is the canonical Café home (RATIFY-7D); `/cafe/log|plan|stock|review|pushes` unchanged; `?occurrence=<runId>` is additive URL state on the pre-existing `/work/tasks` route (mirrors the existing `?view=`/`?record=` pattern) — reviewer to confirm no collision. |
| 5 — exactly one `aria-current="page"` | | Unaffected — no nav-item structural change (Opening is a breadcrumb-only leaf, not a rail item). |
| 6 — one page anatomy per route (no second drawer host) | | `CafeOpeningPanel` mounts inline on `/cafe` (no drawer/dialog of its own); its pending-resolution branch reuses Step-6 `PendingResolution` directly (not `OccurrenceAssignDialog`) — reviewer to weigh whether this inline-vs-dialog divergence from `/work/tasks`'s pattern is acceptable for a smaller, single-run panel. |
| 7 — verb+object action grammar (no bare `Create`) | | "Start today's opening" (never bare "Start"/"Create", AC-712 asserts the exact accessible name) — reviewer to confirm no SALVAGE override #4 regression. |
| 8 — capture-first disclosure (mobile ≤390px) | | Not independently screenshot-verified at phone width by Track C this pass — the panel/page render inline in the existing responsive shell but no dedicated phone pass was run. Flagged for the design-reviewer's 4-lens pass (barista cold-start, OD-REDESIGN-66). |
| 9 — responsive disclosure order | | Same as Rule 8 — inherited, not independently re-verified this pass. |
| 10 — extension test (new Module ships without a new rail root/anatomy) | | Passes structurally — Café retrofit adds no rail root; it enriches the existing `/cafe` destination's content only. |
| 11 — component reuse | | `Button`/`EmptyState`/`ErrorState`/`SkeletonRows` (state-kit), Step-6 `PendingResolution`, `startRun`/`listDueRuns`/`getRunRollup`/`listPendingTasks`/`resolvePendingTask` (no re-implemented RPC calls), `processes.rollup.summary` i18n key reused instead of a café-only duplicate, `listAuthorTeams` (signals.ts) reused for the started-opening Team fallback instead of new DAL. |
| 12 — usable by a high-school graduate, no training | | Job sentences per spec §1 ("Start today's opening and see what I have to do" / "Two openers could own this step — you pick who") — reviewer to assess the built copy against this bar, scored as the barista (OD-REDESIGN-66, the zero-training-obviousness front). |

## Verdicts

<!-- Fill one verdict line per REQUIRED review before running pre-merge-check.sh.
     Accepted: PASS SHIP FIX-THEN-SHIP   Blocking: REWORK FAIL STILL-FAILING
     Required always: spec, code-quality. Required (UI changed): design. Required (schema/RLS changed): security. -->

- spec: APPROVE — spec-reviewer (opus), 2026-07-17. AC-701..720 all owned+green on independent re-run (café pgTAP 27, full suite 100/727, unit 30/30, wiring 64/64); AC-720/F2 live-green in the Director's full run (52/52). Both flagged deviations approved (sectionForPath rewrite = correctness fix; global-setup ops_lead grant = contained, dedicated-persona follow-up recommended).
- code-quality: APPROVE — same reviewer, 2026-07-17. 0 Critical/Important; minors: unused teamName prop, stale 20260717000004 references in pgTAP headers post merge-rename to ..000006, ?occurrence= persists groupBy (routed to design review), shared-persona grant follow-up.
- design: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes> (4-lens review — `*.tsx`/`*.css` changed this step; incl. mockup-fidelity vs the convergence F2 "Start today's opening" flow, SALVAGE-INVENTORY, and cross-version regression)
- security: **NOT TRIGGERED BY SCOPE** — no new auth/RLS/schema/RPC path this step (spec §7); the privileged spawn seam is Step 6's, already audited there. Becomes mandatory only if a RATIFY above (7A/7B) is resolved toward a schema/capability/RPC change.

## Gates (Track C pass, this branch/worktree)

| Gate | Status |
|---|---|
| `bash scripts/sandbox-pg.sh` then `pg_prove supabase/tests/*.sql` | PASS — 100 files / 727 tests at the merged tip (worktree-time count 716 was stale; was 95 files / 689 tests before this step; +5 files / +27 tests, no regression on the pre-existing suite incl. Step-6 90–95 and signals 83–90) |
| `cd mos-app && npm run typecheck` | PASS — 0 errors |
| `cd mos-app && npm run lint -- --max-warnings=0` | PASS — 0 (eslint + stylelint) |
| `cd mos-app && npm test` (Vitest) | PASS — 279 files / 2899 tests (full suite, incl. this step's new/extended tests) |
| `cd mos-app && npx playwright test --list` | PASS — 59 tests / 36 files listed clean, incl. `AC-720-cafe-today-opening.spec.ts` (was 58/35 before this step) |
| `gh workflow run integration.yml --ref <branch>` (CI pgTAP + live-stack e2e incl. AC-720) | **DEFERRED TO DIRECTOR** — no Docker / no live Supabase stack in this sandbox (per the dispatch brief). This Track's local pgTAP run above is the real local-sandbox proof; the live cross-stack AC-720 run happens in CI post-merge. |
| `bash scripts/pre-merge-check.sh` | **NOT YET RUN AS-INTENDED** — this worktree's git branch is `worktree-agent-afa940942d3795b08`, not `claude/redesign-buildout-completion-vdrd17`, so the script would look for a differently-named ledger file on this branch. Run it on the actual `claude/redesign-buildout-completion-vdrd17` branch after this worktree merges there, once the Verdicts section above is filled by the review battery. |

## Deferred-to-Director live checks (explicit list)

Everything below requires the live self-hosted Supabase stack / CI `integration.yml`, unavailable in
this Track-C sandbox:
1. `gh workflow run integration.yml --ref claude/redesign-buildout-completion-vdrd17` → `gh run watch`:
   - pgTAP suite `96_cafe_opening_no_schema.sql` .. `100_cafe_opening_checklist_vs_def.sql`
     (AC-701..705) plus the full pre-existing suite (no regression) — already proven green in the
     local sandbox above; CI re-confirms against the containerized Supabase image.
   - The live-stack e2e run of `e2e/AC-720-cafe-today-opening.spec.ts` (F2) against a real Postgres +
     RLS + PostgREST stack — the actual cross-stack proof (spawn RPC → grouped Tasks → pending →
     resolve → deep-link), not mocked. This is a **standing curated journey (F2) — must not regress**.
   - Confirm `e2e/global-setup.ts`'s additive `ops_lead` grant for VIEWER (Cahya) lands cleanly on
     the live stack (idempotent `ON CONFLICT DO NOTHING`, never rotates/deletes her dev login).
2. `bash scripts/pre-merge-check.sh` on the actual target branch, after the Verdicts section above is
   filled and this ledger sits at the correct `docs/reviews/<branch>.md` path for that branch.
3. The 4-lens design review's **Rule-12 cold-start pass as the barista** (OD-REDESIGN-66) — both
   fronts (manager `/work/tasks` density unharmed + barista `/cafe` obviousness) — on the rendered,
   logged-in app (`bash scripts/cloud-agent-bootstrap.sh` → `npm run dev` → `/cafe`), which this
   sandbox cannot render (no live PostgREST/GoTrue/Kong here — DB-only pgTAP path per
   `scripts/sandbox-pg.sh`'s own header).

## Ratify before merge

**Spec RATIFY-7A..7F** (`docs/specs/cafe-retrofit.spec.md` §8 — as-built, all shipped per the spec's
own conservative recommendation; flagging here for the owner's sign-off):
1. **RATIFY-7A — Café floor `member` starting the opening.** Chosen (conservative): **NO** —
   `process.start` stays ops_lead+admin; the Start action is capability-gated; members see read-only
   state + a non-dead "shift lead starts it" affordance (AC-713/FR-707). Alt (deferred, JTBD-preferred):
   a narrow `cafe.open` capability granted to members active on a café branch Team — serves the
   barista-opener JTBD (J16/S1) directly but requires a new capability + RPC/gate change (schema/RLS
   path, would trigger mandatory security-auditor). Flagged as the single most important café
   ratification per the spec.
2. **RATIFY-7B — No kitchen-schema bridge.** Chosen: do **NOT** add
   `ops.kitchen_logs.process_run_id` in v1 (AC-701's `hasnt_column` pins this). The opening occurrence
   and production logging link only via a deep-link Task description. Alt (deferred, ADR-0051 D11
   literal): a nullable `process_run_id` bridge column — a later slice with owner sign-off + a
   same-org cascade guard + security-auditor.
3. **RATIFY-7C — Definition rollout.** Chosen: ship the "Café Opening" definition as a DEV/test seed
   (idempotent, guarded, resolved by stable BU/Team/Role codes) for the demo + e2e; auto-binding real
   production branch Teams/Roles stays owner-gated (staging holds real data).
4. **RATIFY-7D — Café home routing/IA.** Chosen: `/cafe` renders the Café Operations home hosting
   "Start today's opening" (replacing the bare `Navigate to /cafe/log`); `/cafe/log|plan|stock|review|pushes`
   unchanged. Serves the Rule-1 Café job first.
5. **RATIFY-7E — Client capability mirror.** Chosen: verified `process.start` was already present in
   `mos-app/src/lib/capabilities.ts` `ROLE_CAPABILITIES` for `ops_lead`+`admin` (Step 6 had already
   added it) — a **verify no-op**, confirmed by the existing, unmodified
   `src/lib/capabilities.test.ts` "process.start (Step 6)" block passing as-is.
6. **RATIFY-7F — Process resolution seam.** Chosen: the café DAL resolves the "Café Opening" process
   by **name** (org-scoped by RLS), mirroring how kitchen resolved its BU before a stable `code`
   existed. A known fragility (a rename breaks it); a stable `work_lines.code`/slug is the flagged
   follow-up for a later slice.

## Track A deviations

- pgTAP test-file numbering: the plan's task numbering (`95_cafe_opening_no_schema.sql`..) landed as
  `96_cafe_opening_no_schema.sql`..`100_cafe_opening_checklist_vs_def.sql` (96–100, not 95–99) — the
  pre-existing suite already occupies `95_process_rollup_authz.sql` (Step 6 landed at 91–95, not the
  plan's assumed 90–94). File contents/AC coverage unchanged, only the leading numbers shifted.
- The migration filename landed as `20260717000004_mos_cafe_opening_test_seed.sql` (not the plan's
  `20260717000001_...`) — `20260717000001..000003` were already taken by Step-4/6 migrations
  (signal content-author-guard, create-signal-with-mentions RPC, signal-test-seed env-guard) merged
  from the base tip. Content unchanged, only the timestamp prefix shifted to the next free slot.
- A1's fixture UUIDs (`ca01`/`ca02`/`ca03`) required an extra leading zero vs. the plan's literal SQL
  (`00000000-0000-0000-0000-0000000ca01` is 31 hex digits, not the required 32) — fixed to
  `00000000-0000-0000-0000-00000000ca01` (12-hex last group, matching the `c001`/`c002` convention).
  Caught immediately by the first pgTAP run (`invalid input syntax for type uuid`), not a silent bug.
- A2's dev seed uses `radiant_operations` (Cahya's primary Team, already café-shaped per
  `seed.dev-signals.sql`) as the branch Team, and reuses the **existing** `Cafe Ops Lead` /
  `Café Opener (demo)` Roles from `seed.dev-processes.sql` (Rule 11 — no duplicate demo roles) rather
  than authoring new ones. The "Log today's production" def additionally carries a `description`
  deep-linking to `/cafe/log` (not specified by the plan's literal column list) — added so AC-720's
  "deep-links to /cafe/log" assertion has a real, testable target (`spawn_process_run` copies
  `td.description` verbatim onto the spawned Task) rather than only the page-level capture-link row.

## Track B deviations

- **`cafe.opening.rollup` i18n key was NOT created.** The plan specified a new key with the exact
  content `${done}/${total} done · ${overdue} overdue · ${pending} to assign` — but Step 6 had
  already shipped that identical string as `processes.rollup.summary` (used by `group-header-row.tsx`).
  `CafeOpeningPanel` reuses `processes.rollup.summary` verbatim (Rule 11 — "do not invent a café-only
  duplicate copy", spec §4) instead.
- **Team resolution in `CafeOpeningPage` does not use only `listStartableCafeTeams`.** The plan's B7
  text says resolve the branch Team "from `listStartableCafeTeams(processId)[0]` (unstarted) or from
  the started run's team" without naming a DAL function for the second path (today's opening has
  already spawned, so it's omitted from the due list). Implemented: prefer
  `listStartableCafeTeams(processId)[0]`; if empty, fall back to the viewer's own Team membership via
  the **existing** `listAuthorTeams` (`mos-app/src/lib/db/signals.ts`, Rule 11 reuse) rather than
  growing new DAL surface for a one-branch-per-org v1.
- **`sectionForPath` was rewritten** (exact match wins outright; else the longest/most-specific prefix
  match wins), not left as a naive first-match-wins array scan. The plan's literal B8 instruction to
  "prepend" a `/cafe` "Opening" entry to `CAFE_SECTIONS` would, under the PRIOR scan logic, have made
  `/cafe` (as a prefix) shadow every one of `/cafe/log|plan|stock|review|pushes` — a real regression
  the plan's phrasing didn't anticipate. The new logic is order-independent by construction and is
  covered by an added `sections.test.ts` case (`sectionForPath('/cafe')` resolves to "Opening" while
  `/cafe/plan/anything` still resolves to "Plan", not "Opening").
- Added two i18n keys not in the plan's B4 list: `cafe.opening.noProcess` / `cafe.opening.noTeam`
  (en/id) — the plan's `cafe.opening.notStartedMember` copy ("your shift lead starts today's opening")
  is semantically wrong for the "no process configured" (RATIFY-7C bare org) and "no Team" empty
  states `CafeOpeningPage` needs; reusing it there would have been misleading, not a Rule-11 win.

## Track C (this pass) deviations / decisions

- **AC-720/F2 e2e uses VIEWER (Cahya), not a new dedicated fixture** — but Cahya's SEEDED access role
  is `member` only (`supabase/seed.sql`); she does NOT carry `process.start` by default. Rather than
  add a brand-new e2e-dedicated persona, `e2e/global-setup.ts` gained one additive, idempotent grant
  (`ops_lead` access role for Cahya's person id, `ON CONFLICT DO NOTHING`) — she already holds the
  "Cafe Ops Lead" org Role and is an active `radiant_operations` Team member, so granting the matching
  ACCESS role is the natural fixture, not a new persona. This mirrors the file's own stated
  additive/idempotent convention (never deletes/rotates a dev persona) and the existing ADMIN/MEMBER
  dedicated-grant precedent, but — unlike ADMIN/MEMBER — it mutates a **shared dev persona's**
  access-role set (additively). Flagged explicitly: if the Director's live run shows this grant
  interacting badly with another spec's assumption about Cahya's `member`-only role (none currently
  found in this repo's e2e suite), narrow it to a dedicated e2e persona instead.
- **AC-720's "Log today's production deep-links to /cafe/log"** is implemented via the Task's
  `description` field (plain text, not an auto-linked `<a>`) — see the Track A deviation above. The
  e2e asserts the literal text `/cafe/log` is visible in the opened Task, not that it's clickable.
  This is the minimal, no-new-schema/no-new-component interpretation of FR-708's "shall link staff to
  /cafe/log"; `CafeOpeningPage`'s own capture-link row (Log/Plan/Stock/Review, same page as Start) is
  the page-level satisfaction of that requirement. Flagged for the Director/design-reviewer: a
  clickable auto-link in the Notes/description pane would be a more polished later slice, not
  required by NFR-701 (no schema) but IS a UI-only enhancement that stayed out of scope here.
- **AC-720 self-cleans via inline, tightly-scoped SQL** (delete-then-recreate the occurrence for
  `work_line_id + owning_team_id` only), mirroring `AC-630-start-occurrence.spec.ts`'s pattern —
  never touches other org/task/signal e2e fixtures.
- **C2's `?occurrence=<runId>` wiring is a one-shot mount effect** in `TasksWorkspace` (checks
  `searchParams.has('occurrence')` once, sets `groupBy` to `'occurrence'`) — it does not continuously
  re-force Occurrence grouping if the viewer manually switches away mid-session (their explicit choice
  wins after arrival). This is a deliberate UX choice (don't fight the user's later Group toggle), not
  an oversight — flagged for the design-reviewer to confirm this matches expectation.
- Per the coordinator's note mid-build: **`tasks-workspace.tsx`'s edit was kept minimal** on this
  worktree's base (this branch predates a later `useOccurrenceGroups` extraction that landed on
  `main`) — the `?occurrence=` read is a small, self-contained `useEffect` + `useSearchParams` addition
  that the Director will need to reconcile/re-home if `main`'s extraction changes where `groupBy` state
  lives.

## Deferred / tracked debt

- **No dedicated phone-width (≤390px) pass on `CafeOpeningPanel`/`CafeOpeningPage` this track** (Rules
  8/9 above) — not independently screenshot/verified at narrow width. Recommend the design-reviewer's
  4-lens pass cover this, scored as the barista cold-start (OD-REDESIGN-66).
- **`CafeOpeningPage`'s capture-link row is a bare `<nav>` of ghost-button `<Link>`s**, not a
  polished "Continue in the kitchen" component — functionally correct (FR-708) but visually minimal;
  flagged for the design-reviewer's visual-lens pass.
- **The started-opening Team-resolution fallback (`listAuthorTeams`) always picks the viewer's FIRST
  (primary) Team** — correct for the v1 single-café-branch model but will need real per-branch
  disambiguation once RATIFY-7C's real-production-adoption follow-up lands (multiple café branches
  per org).
- **No focus-trap/Escape-to-close on the inline `PendingResolution` inside `CafeOpeningPanel`** — it
  isn't a dialog (unlike `OccurrenceAssignDialog`), so this isn't a regression, but flagged since the
  candidate-choice buttons sit inline in page flow, not in a modal, and a future consolidation might
  want one consistent resolve-UI shell across both surfaces.
