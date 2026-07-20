# V3 Issue 8 — Café Canonical Records, Executing-Team Re-home, and Team Context Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development. Work in the isolated Issue 8 worktree, one implementation checkpoint at a time, with no subagents. Do not start application work until the dependency preflight and the data/backfill gate below are green.

**Goal:** Migrate Tasks from business-unit ownership to a real executing Team, preserve existing Task rows and provenance columns without destructive renames, and make Café an operational view over those canonical Tasks. A Task opened from Work or Café must resolve to the same Task identity, Task model, RecordViewer, and opening grammar.

**Architecture:** mos.tasks.team_id becomes the required execution boundary. shared.teams.business_unit_id and shared.teams.site_id are the source of truth for derived BU/Site; the legacy mos.tasks.business_unit_id remains as a validated compatibility projection until a separately approved retirement. Generated occurrence Tasks inherit mos.process_runs.owning_team_id. Café obtains a deterministic Team context from the current viewer and authoritative process/run membership data, then feeds a Team-filtered canonical Task collection into the shared Issue 6 RecordCollection and shared Issue 5 RecordViewer through the Issue 7 opening grammar. Café-specific capture and operational copy remain context-shaped, but no Café Task type, renderer, drawer, collection engine, or database union is introduced.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, React Testing Library, Playwright, self-hosted Supabase/Postgres, pgTAP, existing Gordi MOS design tokens in DESIGN.md, and the current process-run/occurrence-as-tasks RPCs.

## Global Constraints

- This plan is the only file allowed to change for the current planning task. Future implementation must not begin until this plan’s dependency and data gates are satisfied.
- Do not edit historical migrations. Add forward migrations under supabase/migrations/ and make the re-home reversible until the final NOT NULL enforcement migration.
- Do not map a BU to a Team by primary flag, array order, name order, or first-row selection. Only the deterministic rules in the data contract are legal.
- Do not invent a fake BU-as-Team label. A legacy row without a Team is an honest unresolved row and cannot be presented as a valid Team.
- Preserve the physical responsible_person_id and accountable_person_id columns and their data. The UI may label them PIC and Supervisor according to current product language; this issue does not rename them to a new RACI model.
- Preserve “via role” provenance and occurrence-as-task semantics. A generated Task remains an ordinary canonical Task with process provenance, not a Café-only object or a user-facing Process Run noun.
- Consume Issue 3 page families, Issue 4 host/leave guard, Issue 5 RecordViewer, Issue 6 RecordCollection, and Issue 7 opening grammar. If any dependency is not implemented or its final public contract is not discoverable, stop and resolve the dependency instead of creating a parallel abstraction.
- E7 Café styling is the visual foundation where it is owner-approved. Current decisions, the composite visual/IxD/IA/Product oracle, and the experience contracts control behavior and information architecture. One mockup snapshot cannot override current owner law.
- No new page shell, drawer, overlay, generic record database union, or parallel collection engine.
- Validate at 1280px, 1024px, and 390px, plus keyboard/focus, loading, empty, error, retry, permission, and honest read-only states. Use realistic Gordi data and copy; no generated filler content or generic visual treatment.
- Future DB tests and browser journeys must run against the one local Supabase only and must serialize. Never run db reset, pgTAP, migrations, or Supabase-backed e2e in parallel.
- Future implementation must maintain at least 80% changed-line coverage, zero type errors, zero ESLint errors with --max-warnings=0, a successful production build, and rendered browser evidence before merge.
- Routine worktree commits are allowed. Push, merge, deploy, owner visual acceptance, and the Issue 9 representative owner gate remain separate approvals. Issue 8 must not claim Issue 9 acceptance.

---

## Authority and current-state corrections

Use these sources in this order when a document conflicts with an older implementation:

1. docs/requirements-evolution.md, docs/decisions.md, and docs/adr/.
2. CONTEXT.md, docs/specs/v3-redesign.spec.md, docs/jtbd.md, docs/experience-contract.md, docs/interaction-contract.md, and DESIGN.md.
3. The current Issue 3–7 contracts and their implementation evidence.
4. E7 salvage/mockup material for visual foundation only.
5. Existing code and tests as evidence of current behavior, not as authority for outdated IA or domain seams.

The historical correction this issue explicitly owns is:

- mos.tasks currently has required business_unit_id and no team_id.
- ADR-0025 D39 and OD-REDESIGN-40/53 require every Task to have one executing Team, with BU/Site derived from that Team.
- The 2026-07-16 occurrence-as-tasks plan deliberately deferred the Task BU-to-Team re-home to the Café bridge. That debt is now part of Issue 8 and must not be reduced to a Café selector change.
- mos.spawn_process_run and mos.resolve_pending_task currently write the owning Team’s BU into business_unit_id but do not persist team_id. The new migration and RPC replacements must close that seam.
- Current Café selection in mos-app/src/pages/cafe-opening-page.tsx uses due[0] and then myTeams[0]. That is the exact ambiguity bug: one eligible Team may resolve deterministically, while multiple eligible Teams require explicit choice.
- Current Café opening and Task UI use older local page/panel grammar. The implementation must retain good E7 visual decisions while moving behavior into the shared page, collection, viewer, and opening contracts.

## Domain and data contract

### Task identity and ownership

mos.tasks.id remains the canonical identity. Work and Café read the same row and use the same TaskRow/Task adapter, the same RecordViewer, and the same Issue 7 opening behavior. Café may add operational context such as Today, opening status, role provenance, or a Team-scoped capture affordance, but it may not clone or transform the Task into a second record.

Every valid Task has:

- one team_id referencing a Team in the same org_id;
- business_unit_id equal to that Team’s business_unit_id, retained only as a compatibility projection during this migration;
- Site derived at read time from that Team’s site_id; no independent Task Site value is introduced;
- one existing responsible_person_id and one existing accountable_person_id, rendered with current PIC/Supervisor labels;
- existing status, due, source, occurrence, and process provenance unchanged.

The database must reject a supplied BU that diverges from the Team. Application code must stop offering BU as an independent create/edit value. A compatibility caller may still supply the legacy BU as an assertion during the transition, but the DAL must verify it against the selected Team and never use it to select or fabricate a Team.

### Deterministic backfill

The first re-home migration adds team_id as nullable only for the reversible repair window. It then applies these rules in a single transaction:

1. For a generated occurrence Task with a valid same-org process_run_id, use mos.process_runs.owning_team_id when that Team exists and the old Task BU matches the Team BU.
2. For a legacy Task without a usable process-run Team, use a same-org active Team in the Task’s existing BU only when exactly one valid Team exists for that BU.
3. Leave zero-candidate, multiple-candidate, cross-org, missing-run, missing-Team, and BU-mismatch rows unresolved. Record enough identifiers and reason categories in the migration report for explicit human resolution.
4. Never choose the first Team, a primary Team, a Team name, a Team membership, or a BU label as a fallback.
5. Do not delete, merge, rewrite, or silently reassign any Task, person, process run, occurrence, or legacy ownership value.

The migration must persist a deployment-time report of unresolved Task IDs and reason categories in a maintenance table such as mos.task_team_rehome_ambiguities. This is migration audit data, not a record type: enable RLS, grant no access to application roles, and expose it only to the migration/controlled owner-resolution path. The final enforcement migration may set mos.tasks.team_id NOT NULL only after that report is empty and an owner-approved explicit mapping has resolved every ambiguous row. An explicit mapping is a genuine data decision; it must be reviewed before it is applied. If the report is non-empty, the implementation stops with the database in the reversible nullable stage and does not claim Issue 8 complete.

### Compatibility and invariant behavior

- Keep mos.tasks.business_unit_id and mos.tasks.responsible_person_id/accountable_person_id physically present. Do not drop or rename them in Issue 8.
- Extend the task tenancy/reference guard so Team and BU are same-org and BU always equals the selected Team’s BU.
- Keep the legacy BU column non-null for existing rows and as a derived compatibility mirror. After enforcement, every insert and Team change obtains BU from Team in the guard or rejects a mismatch.
- Keep old responsible/accountable values and historical task events intact. Update TypeScript labels and adapters, not the stored names.
- Do not add mos.tasks.site_id. Resolve Site through the Team relation and make Site read-only in Task views.
- Keep current org-readable Task SELECT behavior unless an explicit visibility decision changes it; Team is the execution and write-integrity boundary in this issue, not an unannounced read-policy rewrite.
- New direct Task inserts require team_id and same-org Team membership/authorization checks already supported by the task write contract. Legacy unresolved rows can remain visible for repair but are not valid new Task inputs.

### Team-context behavior

For a current viewer and Café process:

- zero eligible Teams: show an honest no-eligible-Team state with a recovery path or read-only explanation; never infer from BU;
- exactly one eligible Team: use it deterministically and show its Team, derived BU, and derived Site;
- multiple eligible Teams: show an explicit Team choice before loading or starting Team-specific work; do not silently use the first result;
- an already-started opening is keyed by its persisted process_run_id and owning_team_id, so a read-only member sees the actual Team context even when they cannot start;
- a member who cannot start sees the current opening and canonical Task collection read-only when policy permits, with no Start or mutation affordance. Permission denial is not represented as empty data;
- start and resolve remain authorized by the existing process/team policy. Do not revive the superseded assumption that every floor member is denied process.start; current capabilities and owner decisions are authoritative.

## Scope boundaries and dependency preflight

The following are hard preflights before any Issue 8 implementation task:

| Dependency | Required evidence | Stop condition |
|---|---|---|
| Issue 2 foundation | Owner-approved foundation/checkpoint evidence and the final local command contract | Do not run migrations or alter Task UI if foundation commands or tokens are unsettled |
| Issue 3 page families | docs/plans/2026-07-20-v3-page-families.md applied, with final exports for page-family frame/classifier and responsive proof | Do not add a Café shell or patch the old page shell as a substitute |
| Issue 4 host/leave guard | docs/plans/2026-07-20-v3-overlay-host.md applied, with one data-overlay-host and tested close/leave behavior | Do not add a Café drawer, local overlay, or bespoke Escape stack |
| Issue 5 RecordViewer | Future dependency path docs/plans/2026-07-20-v3-record-viewer.md exists and its implementation exposes the canonical Task adapter/viewer/opening entry point | Stop if the adapter contract is absent; do not fork TaskSurface, TaskDrawer, or a Café viewer |
| Issue 6 RecordCollection | Future dependency path docs/plans/2026-07-20-v3-record-collection.md exists and its implementation exposes the shared collection/filter/group contract | Stop if Café would need a second collection engine |
| Issue 7 opening grammar | Future dependency path docs/plans/2026-07-20-v3-opening-grammar.md exists and its route/history/focus contract is testable | Stop if opening behavior would be implemented with Café-only links or panel state |
| Task data seam | The re-home migrations, local pgTAP suite, and owner-approved ambiguity report are green | Stop before app type changes if any Task remains without a legitimate Team after enforcement |
| Café Team eligibility | Current process/run/membership data can distinguish zero, one, and multiple eligible Teams for the viewer | Stop if the only available selector is BU or an unscoped myTeams[0] heuristic |

Issue 5–7 plan paths are named future dependency paths because no current-tip Issue 5–7 plan file was found. The implementation worker must reconcile the names with the approved plans if the Director adopts different filenames; it must not invent a parallel interface to avoid that reconciliation.

## Master acceptance ownership and deferred scope

The master acceptance IDs retain the exact definitions in docs/specs/v3-redesign.spec.md. Issue 8 owns the full master goals AC-V3-004 and AC-V3-007 only. It may provide regression evidence for other rows, but it must not relabel another behavior under a master ID or claim an owner gate owned by another issue.

| Master ID and exact goal | Ownership | Issue 8 treatment |
|---|---|---|
| AC-V3-001 — Given the representative routes at desktop and phone widths, when computed styles are compared across page heads, body type, controls, rows, panels, dialogs, and states, then each semantic role uses the same V3 values and the rendered result matches the E7 visual reference. | Issue 9 | Issue 8 supplies Café rendered regression evidence at required widths; it does not claim this master gate or owner visual acceptance. |
| AC-V3-002 — Given Tasks, Signals, Inbox, and Café, when each collection opens a record, then the same panel side, width family, focus entry, Escape/Close/Back behavior, and page-escalation outcome occur. | Issue 9 | Issue 8 proves the Task/Café regression slice through the shared contracts; Issue 9 owns the full cross-module goal. |
| AC-V3-003 — Given a record panel already open, when Deputy or another record is opened, then the shared host stacks or replaces content according to the journey and never renders two overlapping side panels. | Issue 9 | Issue 8 runs a shared-host regression from Café; Issue 9 owns the full Deputy/record-stack goal. |
| AC-V3-004 — Given a Task in Work and the same Task in Café, when each is opened, then both resolve to the same record identity and RecordViewer while preserving the source collection on close. | Issue 8 | Issue 8 owns the AC-811 e2e proof for this exact master goal. |
| AC-V3-005 — Given a Signal Feed saved view, when presentation changes to Table and the page is refreshed, then supported filters, sort, grouping, and saved-view identity persist. | Issue 6 | Issue 8 does not change Signal saved-view behavior; any shared collection regression is evidence only. |
| AC-V3-006 — Given Inbox on desktop, when the bell is invoked, then quick triage opens in the shared host; opening a notification pushes its canonical record; Back returns to triage; Close returns focus to the bell. Given phone, the bell opens the full Inbox route. | Issue 7 | Issue 8 consumes the opening grammar only and does not claim Inbox acceptance. |
| AC-V3-007 — Given a multi-Team viewer entering Café, when more than one valid Team exists, then the system requires an explicit context choice and never silently chooses the first Team. | Issue 8 | Issue 8 owns the AC-809 unit proof for this exact master goal. |
| AC-V3-008 — Given an authorized user editing a property, when they commit or cancel, then every RecordViewer consumer follows the same save/discard feedback contract. | Issue 5 | Issue 8 proves Task/Café regression only; Issue 5 owns the all-consumer RecordViewer goal. |
| AC-V3-009 — Given an unauthorized viewer, when the same record opens, then its information hierarchy remains readable while edit and lifecycle actions are absent or honestly explained. | Issue 5 | Issue 8 supplies the Task/Café read-only regression; Issue 5 owns the shared RecordViewer permission goal. |
| AC-V3-010 — Given authored JSONB content containing valid paragraph/list/link/content-checklist blocks, when saved and reopened in panel and page modes, then block identity, order, and content are preserved and rendered by the same components. | Issue 10 | Issue 8 preserves the existing content boundary and does not add JSONB content behavior. |
| AC-V3-011 — Given a typed Task checklist or Standard measurement embed, when its state changes, then the normalized domain row changes and the JSONB document retains only the reference. | Issue 10 via the real Task checklist embed | Issue 8 preserves existing Task checklist seams and does not introduce or claim the normalized embed goal. |
| AC-V3-012 — Given a first-time floor member, when asked to find and complete today's Café work, then they start unaided, complete the goal without entering configuration, and encounter no internal system nouns. The journey records steps, hesitation/misclicks, outcome, and duration. | Issue 9 | Issue 8 supplies implementation journey evidence, but does not claim owner acceptance or the representative gate. |
| AC-V3-013 — Given a manager triaging work, when filtering, grouping, switching presentations, and opening consecutive records, then the workflow remains keyboard-operable and retains collection context without repeated full-page navigation. | Issue 6 | Issue 8 proves Team filter/group and Work/Café context retention as a regression slice; Issue 6 owns the full manager collection goal. |
| AC-V3-014 — Given every live route at the end of migration, when the route/component inventory is checked, then no route uses an unapproved bespoke page shell or superseded component/style family. | Issue 12 | Issue 8 audits the Café route and touched remnants as evidence only; Issue 12 owns the all-route inventory goal. |

The following Issue 8 criteria are lower-level proofs, not replacements for master IDs. Each maps to the correct master FR/NFR:

| Issue 8 proof ID | Lower-level goal | Mapping | Owning test |
|---|---|---|---|
| AC-801 | Deterministic occurrence Task backfill writes the process run Team and preserves identity/provenance | FR-V3-003, NFR-V3-008 | supabase/tests/101_mos_task_team_rehome.sql |
| AC-802 | Deterministic unique-BU legacy backfill writes one valid Team without changing other fields | FR-V3-003, NFR-V3-008 | supabase/tests/101_mos_task_team_rehome.sql |
| AC-803 | Ambiguous or invalid legacy data remains unresolved and blocks final NOT NULL enforcement | NFR-V3-008, NFR-V3-009 | supabase/tests/101_mos_task_team_rehome.sql |
| AC-804 | Team/BU/Site invariant and same-org validation hold on writes | FR-V3-003, NFR-V3-008 | supabase/tests/102_mos_task_team_security.sql |
| AC-805 | Legacy BU and R/A columns remain compatible without making BU a Team or dropping data | FR-V3-003, NFR-V3-008 | supabase/tests/104_mos_task_team_compatibility.sql |
| AC-806 | Team-changing permission and cross-org RLS fail closed | FR-V3-008, NFR-V3-008 | supabase/tests/102_mos_task_team_security.sql |
| AC-807 | Spawned occurrence Tasks inherit run Team and keep “via role” provenance | FR-V3-003, FR-V3-013 | supabase/tests/103_mos_process_generated_task_team.sql |
| AC-808 | Pending occurrence resolution creates one canonical Task with Team and remains idempotent | FR-V3-003, NFR-V3-008 | supabase/tests/103_mos_process_generated_task_team.sql |
| AC-809 | Café resolves zero/one/multiple Team context honestly | FR-V3-013, FR-V3-014; exact master behavior is AC-V3-007 | mos-app/src/pages/cafe-opening-page.test.tsx |
| AC-810 | A viewer without Start permission sees a readable, honest read-only opening | FR-V3-008, AC-V3-009 regression | mos-app/src/components/cafe/cafe-opening-panel.test.tsx |
| AC-811 | Work and Café open the same Task identity through one RecordViewer | FR-V3-003, FR-V3-004, FR-V3-005; exact master behavior is AC-V3-004 | mos-app/e2e/AC-811-cafe-work-canonical-task.spec.ts |
| AC-812 | Café responsive/state/accessibility proof follows shared visual and interaction grammar | FR-V3-001, FR-V3-002, FR-V3-012, NFR-V3-001, NFR-V3-005, NFR-V3-006 | mos-app/e2e/AC-812-cafe-responsive-states.spec.ts |
| AC-813 | Work Task filters/grouping use Team while occurrence provenance and non-Task domains remain correct | FR-V3-007, FR-V3-013, FR-V3-014 | mos-app/src/components/tasks/tasks-workspace.test.tsx |

## Future implementation paths

These new files are intentionally absent at the current planning tip and must be created only by the future Issue 8 implementation after the dependency and data gates pass:

- supabase/migrations/20260720000001_mos_tasks_team_rehome.sql
- supabase/migrations/20260720000002_mos_tasks_team_rehome_enforce.sql
- supabase/migrations/20260720000003_mos_process_generated_task_team.sql
- supabase/tests/101_mos_task_team_rehome.sql
- supabase/tests/102_mos_task_team_security.sql
- supabase/tests/103_mos_process_generated_task_team.sql
- supabase/tests/104_mos_task_team_compatibility.sql
- mos-app/e2e/AC-811-cafe-work-canonical-task.spec.ts
- mos-app/e2e/AC-812-cafe-responsive-states.spec.ts
- docs/plans/2026-07-20-v3-record-viewer.md
- docs/plans/2026-07-20-v3-record-collection.md
- docs/plans/2026-07-20-v3-opening-grammar.md

## Executable implementation tasks

### Task 1 — Freeze dependencies, data report, and implementation contract (2–5 minutes per red/green/refactor loop)

**Red:** Run this read-only preflight from the repository root:

~~~sh
git status --short --branch
test -f AGENTS.md
test -f CLAUDE.md
test -f docs/agent-context.md
test -f docs/specs/v3-redesign.spec.md
test -f DESIGN.md
test -f docs/jtbd.md
test -f docs/experience-contract.md
test -f docs/interaction-contract.md
test -f docs/decisions.md
test -f docs/adr/0025-ia-modules-in-rail-redesign-direction.md
test -f docs/adr/0051-occurrence-as-tasks-schema.md
test -f docs/plans/2026-07-20-v3-page-families.md
test -f docs/plans/2026-07-20-v3-overlay-host.md
test -f mos-app/src/pages/cafe-opening-page.tsx
test -f mos-app/src/components/cafe/cafe-opening-panel.tsx
test -f mos-app/src/lib/db/cafe-opening.ts
test -f supabase/migrations/20260611000007_mos_tasks.sql
test -f supabase/migrations/20260716000013_mos_spawn_process_run.sql
test -f supabase/tests/94_process_pending_and_task_shape.sql
~~~

Read the adopted Issue 5–7 plans and record their final paths/exports in the implementation branch review ledger. The current tip has no approved Issue 5–7 plan files, so the preflight must fail with a dependency note until those contracts land. Do not solve this by adding a new local record engine.

**Green:** Confirm the current mos.tasks shape, current RPC definitions, Team membership date rules, current Café due[0]/myTeams[0] behavior, existing Task UI seams, and the local-only Supabase command contract. Write the exact dependency findings into the future branch review ledger during implementation, not into this plan file.

**Refactor:** Reduce the implementation contract to these stable seams: Task row and DAL, Team context resolver, shared RecordCollection adapter, shared RecordViewer opener, and occurrence RPCs. Remove any proposed path that duplicates a page shell, drawer, overlay, record union, or collection engine.

**Verification:**

~~~sh
rg -n 'business_unit_id|team_id|responsible_person_id|accountable_person_id' mos-app/src/pages/cafe-opening-page.tsx mos-app/src/lib/db mos-app/src/components/tasks supabase/migrations supabase/tests
git status --short
~~~

Confirm the issue branch is isolated and that no unrelated dirty file is staged.

### Task 2 — Add the reversible Task Team re-home migration and red pgTAP proof (2–5 minutes per red/green/refactor loop)

**Red:** Add supabase/tests/101_mos_task_team_rehome.sql first. Seed same-org Teams sharing a BU, a BU with exactly one active Team, generated Tasks tied to runs, zero-candidate legacy Tasks, multiple-candidate legacy Tasks, a missing-run Task, a cross-org/run mismatch, and historical person/provenance values. Assert AC-801 through AC-803; the current schema must fail because mos.tasks.team_id and the re-home seam do not yet exist.

**Green:** Add supabase/migrations/20260720000001_mos_tasks_team_rehome.sql with this exact behavior:

- Add nullable mos.tasks.team_id uuid with a foreign key to shared.teams(id) and an index on (org_id, team_id) plus the active Task access pattern used by the collection.
- Add migration-only mos.task_team_rehome_ambiguities with task_id, org_id, current business_unit_id, process_run_id when present, reason category, candidate Team IDs, detected_at, resolved_team_id, resolved_at, and resolved_by. Enable RLS and grant no access to public, anon, or authenticated; preserve rows as an audit trail rather than deleting the report after resolution.
- Add or replace the existing task reference guard in the new forward migration so Team is same-org, a non-null Team’s BU equals business_unit_id, and a Team change is permission-checked. Preserve the current org, BU, responsible, accountable, array, and provenance guards.
- Add a deployment-only/revoked maintenance function with a stable name such as mos._rehome_task_teams() that performs only the deterministic rules above, upserts the ambiguity audit rows, and returns counts/reason categories. Revoke it from public, authenticated, and anon; it is callable by the migration role and the pgTAP test role only through the test setup.
- Run that function once from the migration, leaving unresolved rows visible and reportable. Do not set NOT NULL in this migration and do not mutate any legacy value except filling team_id on a deterministic row.
- Add an authenticated insert/update policy check requiring a non-null same-org Team for new writes. Transitional unresolved rows remain readable and can be repaired through an authorized Team assignment path; they are not valid new Task inputs.
- Keep business_unit_id, responsible_person_id, and accountable_person_id intact. Do not add site_id; Site remains a Team-derived read value.

The migration must not use a BU-to-Team first-row query. Its ambiguous report must include Task ID, org ID, current BU, process-run ID when present, and a reason category without deleting or rewriting the row.

**Green test command:** Run the local migration and targeted pgTAP test serially:

~~~sh
cd /Users/ariefsaid/.codex/worktrees/dace/gordi-mos
bash scripts/sandbox-pg.sh
pg_prove -h 127.0.0.1 -p 54322 -U postgres -d postgres supabase/tests/101_mos_task_team_rehome.sql
~~~

Use the repository’s actual local port/connection helper if scripts/sandbox-pg.sh prints a different local endpoint. Never substitute cloud staging.

**Refactor:** Make the report query and deterministic candidate query readable and independently explainable. Keep the compatibility mirror and Team validation in one guard so direct SQL, DAL writes, and RPC writes cannot diverge.

**Verification:** supabase/tests/101_mos_task_team_rehome.sql proves no ambiguous row is assigned, all deterministic rows retain their original Task identity and provenance, and no legacy column is dropped. git diff --check must be clean.

### Task 3 — Resolve the ambiguity gate and enforce the production invariant (2–5 minutes per red/green/refactor loop)

**Red:** Run the post-migration ambiguity report against the local seeded data and assert that the final enforcement step refuses to apply while any unresolved row remains. This test must fail before the explicit resolution fixture exists.

**Green:** When the report contains rows, stop implementation and obtain an owner-approved explicit mapping of each ambiguous Task ID to a valid same-org Team. Apply that mapping in a reviewed, transactional data step that validates the Team’s org, BU, and historical policy. The mapping must be human-selected; no app heuristic may generate it.

Add supabase/migrations/20260720000002_mos_tasks_team_rehome_enforce.sql only after the report is empty. It must:

- assert that no mos.tasks.team_id IS NULL row remains and raise a clear migration error if one does;
- set mos.tasks.team_id to NOT NULL;
- preserve the foreign key, same-org guard, BU mirror validation, and index;
- keep the maintenance function revoked or remove it only after pgTAP has proved the final invariant;
- avoid destructive column drops or data cleanup.

If real data leaves any unresolved row, this task is a hard stop. Do not weaken the invariant, map to BU, or mark the issue complete. The owner-approved mapping is the only genuine data-choice dependency in this plan.

**Green test command:**

~~~sh
pg_prove -h 127.0.0.1 -p 54322 -U postgres -d postgres supabase/tests/101_mos_task_team_rehome.sql supabase/tests/102_mos_task_team_security.sql
~~~

**Refactor:** Keep the nullable repair window and the final invariant in separate forward migrations so a failed ambiguity review is recoverable and reviewable. Record the report, mapping approval, and final row count in the future branch review ledger.

**Verification:** A count of mos.tasks rows where team_id is null returns zero after enforcement, and a count of Tasks whose business_unit_id differs from the joined Team BU returns zero. The final migration is unapplied if either assertion cannot be satisfied.

### Task 4 — Re-home occurrence spawn/resolve RPCs and secure Team writes (2–5 minutes per red/green/refactor loop)

**Red:** Extend supabase/tests/103_mos_process_generated_task_team.sql and supabase/tests/102_mos_task_team_security.sql with failing assertions for generated and resolved Tasks’ team_id, BU/Team equality, cross-org Team rejection, null-Team direct insert rejection, unauthorized Team reassignment, and allowed same-org reassignment.

**Green:** Add supabase/migrations/20260720000003_mos_process_generated_task_team.sql as a forward replacement for the current mos.spawn_process_run and mos.resolve_pending_task definitions from the migration tip. Both functions must:

- persist team_id = process_runs.owning_team_id on generated Task insert;
- validate the run Team and Task org before insert;
- let the shared Task guard derive/validate BU from that Team;
- preserve process_run_id, generated_from_task_def_id, occurrence identity, role-holder resolution, pending assignment, and “via role” provenance;
- remain idempotent and preserve current authorization, including the current process.start capability and Team membership policy;
- reject cross-org process/run/Team combinations without leaking candidate data.

Update the task RLS and permission seams in the forward migration, not historical files:

- direct authenticated Task inserts require a valid same-org team_id;
- Task updates cannot change team_id across orgs or bypass the Team/BU guard;
- Team reassignment is allowed only to the existing authorized Task editor plus an explicit Team-change check. The recommended first cut is admin, the Accountable/Supervisor, or an authorized manager of the Task’s current Team; a PIC may edit ordinary fields but may not silently move execution scope;
- Task SELECT remains the existing org-readable contract unless a separate owner-approved visibility decision changes it.

**Green test command:**

~~~sh
pg_prove -h 127.0.0.1 -p 54322 -U postgres -d postgres supabase/tests/102_mos_task_team_security.sql supabase/tests/103_mos_process_generated_task_team.sql supabase/tests/94_process_pending_and_task_shape.sql supabase/tests/98_cafe_opening_resolution.sql
~~~

**Refactor:** Keep all cross-org and BU/Team checks in the shared Task guard/RLS seam. Do not duplicate those checks in Café or in individual RPC branches. Preserve the existing provenance guard so direct clients cannot stamp process fields.

**Verification:** Run the full pgTAP suite serially after the targeted tests. Confirm generated Task fixtures and supabase/tests/94_process_pending_and_task_shape.sql assert team_id, derived BU, process refs, and current owner provenance.

### Task 5 — Update Task types, DAL, directory context, and compatibility callers (2–5 minutes per red/green/refactor loop)

**Red:** Change the Task type contract and targeted DAL tests first so team_id is required after the enforcement migration, business_unit_id remains a read-only compatibility field, Site is represented by resolved Team context, and CreateTaskInput requires teamId. The current tasks.ts and first-party callers must fail typecheck/tests because they still create/filter/edit by BU.

**Green:** Update these exact seams:

- mos-app/src/lib/db/tasks.types.ts: require team_id on the final TaskRow; retain business_unit_id, responsible_person_id, and accountable_person_id; add a Team-derived context shape containing Team ID/name, BU ID/name, and optional Site ID/name; keep occurrence/process fields and role provenance.
- mos-app/src/lib/db/tasks.ts: include team_id in select/create/update paths; add teamId to TaskListFilters; make CreateTaskInput.teamId required; stop treating businessUnitId as an owner input; if a legacy caller supplies a BU assertion, verify it against the selected Team and do not write it independently; remove BU from editable patches.
- mos-app/src/lib/db/directory.ts and the current Team directory types: expose one shared Team option/context lookup using effective membership dates and same-org Team data, including Site. Do not reuse the current effective_to is null-only query when current date rules require effective_from <= today.
- mos-app/src/lib/database.types.ts: update the generated/manual row and insert/update shapes if this repository’s type generation includes mos.tasks; do not hand-edit unrelated schemas.
- mos-app/src/lib/db/tasks.test.ts and mos-app/src/lib/db/tasks.types.test.ts: prove Team create/filter/update serialization, legacy BU assertion rejection, Team-derived context, and compatibility column reads.
- Every Task-specific fixture and mock returned by an rg sweep for business_unit_id, businessUnitId, CreateTaskInput, TaskRow, TaskListRow, and listTasks( in mos-app/src and mos-app/e2e must be classified as Task or non-Task. Update Task fixtures to include a real Team; leave Kitchen/log/role records on their own domain contract.

**Green test command:**

~~~sh
cd mos-app
npm test -- src/lib/db/tasks.test.ts src/lib/db/tasks.types.test.ts
npm run typecheck
~~~

**Refactor:** Use one Team context resolver/type for Work and Café. Do not create CafeTaskRow, CafeTask, CafeTeam, or a BU-as-Team adapter. Keep legacy column names at the persistence boundary and use PIC/Supervisor labels only at the presentation boundary.

**Verification:** A search of tasks.ts and Task components shows businessUnitId only in compatibility assertions or derived display; no Task create/edit path accepts BU as the authority.

### Task 6 — Move Work Task creation, editing, filtering, and grouping to Team (2–5 minutes per red/green/refactor loop)

**Red:** Add AC-813 assertions to mos-app/src/components/tasks/tasks-workspace.test.tsx, mos-app/src/components/tasks/task-row.test.tsx, mos-app/src/components/tasks/task-surface.test.tsx, and the relevant permission tests. Assert that the current UI cannot create a valid Task without a Team, cannot edit BU directly, groups by Team when selected, and shows derived BU/Site. Current BU-driven behavior should fail.

**Green:** Update the current Task-specific seams:

- mos-app/src/components/tasks/tasks-workspace.tsx: load Team context, pass teamId filters to the DAL, and make Team an execution filter/grouping. Keep a derived BU view/filter only as a narrowing convenience over Teams; do not query Tasks by an independent BU owner value.
- mos-app/src/components/tasks/tasks-toolbar.tsx: provide an explicit Team selector and an honest no-Team/ambiguous-Team state. Use the adopted shared control primitives after Issue 3; preserve keyboard labeling and focus.
- mos-app/src/components/tasks/tasks-table-body.tsx, mos-app/src/components/tasks/mobile-grouped-cards.tsx, mos-app/src/components/tasks/task-row.tsx, mos-app/src/components/tasks/tasks-grouping.ts, and mos-app/src/components/tasks/use-occurrence-groups.ts: show Team, derived BU/Site, and existing “via role” provenance; add a clearly distinct “Team required” repair state only for transitional unresolved rows.
- mos-app/src/components/tasks/task-surface.tsx, mos-app/src/components/tasks/task-drawer.tsx, mos-app/src/pages/task-create.test.tsx, mos-app/src/components/tasks/record-details-panel.tsx, and mos-app/src/components/tasks/task-ownership-card.tsx: use the shared Task record adapter/viewer contract, render Team as the execution field, render BU/Site read-only, retain PIC/Supervisor semantics, and gate Team reassignment with the server permission result.
- mos-app/src/components/tasks/task-permissions.ts and its tests: distinguish ordinary Task edit from execution-Team reassignment and provide honest denied/read-only copy.
- Update all Task-specific tests under mos-app/src/components/tasks/ and mos-app/src/pages/tasks-layout.tsx, mos-app/src/pages/tasks-page.test.tsx, and mos-app/src/pages/task-detail.test.tsx that currently assume BU is the owner. Do not alter Kitchen log tests merely because they use a separate business_unit_id.

**Green test command:**

~~~sh
cd mos-app
npm test -- src/components/tasks/tasks-workspace.test.tsx src/components/tasks/task-row.test.tsx src/components/tasks/task-surface.test.tsx src/components/tasks/task-permissions.test.tsx src/pages/task-create.test.tsx
npm run typecheck
~~~

**Refactor:** Remove any duplicate Task context lookup or Team picker introduced while making the tests green. All Task surfaces must consume one Team context and one canonical Task adapter.

**Verification:** At 1280px and 1024px, verify Team filtering/grouping and canonical opening keep the Work page readable; at 390px verify Team, BU, Site, PIC, Supervisor, due, and status retain their information priority without horizontal overflow.

### Task 7 — Replace Café’s ambiguous selector with an honest Team context resolver (2–5 minutes per red/green/refactor loop)

**Red:** Add AC-809 and AC-810 cases to mos-app/src/pages/cafe-opening-page.test.tsx and mos-app/src/components/cafe/cafe-opening-panel.test.tsx for zero, one, and multiple eligible Teams, started read-only opening, denied Start, retryable error, and no process. The existing due[0] and myTeams[0] implementation must fail the multi-Team case.

**Green:** Update these exact Café seams:

- mos-app/src/lib/db/cafe-opening.ts: return a typed Team-context result with zero/one/multiple states, use effective membership dates, retain persisted process_run_id/owning_team_id for started openings, and avoid BU fallback. Keep startTodayOpening and pending resolution delegating to the canonical RPCs.
- mos-app/src/pages/cafe-opening-page.tsx: replace first-row fallback with deterministic one-Team resolution and explicit multi-Team choice. Keep loading, no process, no eligible Team, error, and retry states distinct. Do not render a Start control before the selected Team’s permission result is known.
- mos-app/src/components/cafe/cafe-opening-panel.tsx: render Team plus derived BU/Site, preserve the E7 opening/rollup/capture grammar where it remains owner-approved, and make a non-starting viewer’s state explicitly read-only rather than empty. Make failed Start/resolve actions recoverable with focus-safe error and retry behavior.
- mos-app/src/pages/cafe-opening-page.test.tsx, mos-app/src/components/cafe/cafe-opening-panel.test.tsx, and mos-app/src/lib/db/cafe-opening.test.ts: assert AC-809/810 plus existing opening and pending-resolution behavior. Replace obsolete copy that claims a role cannot start when current capabilities grant it.

**Green test command:**

~~~sh
cd mos-app
npm test -- src/pages/cafe-opening-page.test.tsx src/components/cafe/cafe-opening-panel.test.tsx src/lib/db/cafe-opening.test.ts
~~~

**Refactor:** Centralize Team-context resolution so Café and Work use the same effective membership/Team directory semantics. Keep Café operational copy and capture entry points context-shaped without introducing a Café Task model.

**Verification:** Keyboard through the Team chooser, Start, resolve, retry, capture links, and canonical Task opening. Confirm focus is restored after any Issue 4 overlay transition and that permission-denied content does not look like an empty collection.

### Task 8 — Integrate Café with the shared RecordCollection, RecordViewer, and opening grammar (2–5 minutes per red/green/refactor loop)

**Red:** Add a test at mos-app/e2e/AC-811-cafe-work-canonical-task.spec.ts that opens the same seeded Task from Work and Café, checks the URL/identity, refreshes/direct-loads it, and exercises desktop, sheet, and phone opening. The current Café capture link/occurrence link behavior must fail the shared identity assertion.

**Green:** Wire the Café page through the final Issue 6/5/7 contracts discovered in Task 1:

- Use the shared Issue 3 page-family frame for /cafe, not PageFrame as a replacement shell if the adopted page-family contract has landed.
- Use the Issue 6 RecordCollection with a Task adapter/filter keyed by selected team_id and current opening/process context. The adapter must return canonical mos.tasks.id values and retain occurrence/provenance fields.
- Use the Issue 5 RecordViewer and its Task adapter for collection click, direct URL, refresh, new tab, back, close, and phone full-screen behavior. Do not copy TaskSurface, TaskDrawer, or record-details markup into Café.
- Use Issue 7 opening grammar for collection-to-panel, canonical page, focus restoration, leave guard, and nested navigation. Do not add Café-only history, drawer, or overlay state.
- Keep the E7 Café opening visual grammar, operational Today/opening rollup, capture affordances, and realistic Gordi copy where the four-lens oracle supports them. Remove or quarantine old interaction remnants identified from mos-app/src/pages/cafe-opening-page.tsx, mos-app/src/styles/cafe-opening-panel.css, and current Kitchen/Café local styles; do not make unrelated Kitchen log records canonical Tasks.

**Green test command:**

~~~sh
cd mos-app
npm test -- src/components/cafe src/lib/db/cafe-opening.test.ts
npx playwright test e2e/AC-811-cafe-work-canonical-task.spec.ts --project=chromium
~~~

**Refactor:** Verify one Task identity and one viewer renderer in source imports. Search for Café-specific Task row types, duplicate detail markup, direct BU ownership fields, nested drawer state, and collection loops; remove each duplicate before proceeding.

**Verification:** Prove the same Task ID, title, Team, derived BU/Site, PIC, Supervisor, due/status, occurrence provenance, and available actions are seen from Work and Café. Contextual Café framing may differ; record semantics and viewer behavior may not.

### Task 9 — Preserve occurrence-as-tasks, role provenance, and all state journeys (2–5 minutes per red/green/refactor loop)

**Red:** Extend mos-app/src/components/tasks/use-occurrence-groups.test.ts, mos-app/src/components/tasks/occurrence-assign-dialog.test.tsx, mos-app/src/components/cafe/cafe-opening-panel.test.tsx, and mos-app/e2e/AC-720-cafe-today-opening.spec.ts with AC-807/808 and the existing occurrence journey. Assert that source/provenance remains “via role”, pending resolution remains explicit, and the same Task appears in Work and Café. The current legacy Team/BU assumptions should fail.

**Green:** Update the occurrence adapter and tests without changing the domain:

- keep mos-app/src/lib/db/processes.ts and mos-app/src/lib/db/processes.test.ts aligned with the new generated Task team_id;
- keep mos-app/src/components/tasks/use-occurrence-groups.ts and mos-app/src/components/tasks/occurrence-assign-dialog.tsx using persisted run Team and current role-holder resolver;
- ensure mos-app/src/components/tasks/owner-cell.tsx, mos-app/src/components/tasks/task-row.tsx, and their tests show “via [role]” rather than “Process Run” or a guessed person;
- update mos-app/src/components/cafe/cafe-opening-panel.tsx to link the canonical Task identity through Issue 7, not a Café-local occurrence renderer;
- update the e2e fixture cleanup to remain scoped to the seeded process/run/Team and keep DB/e2e execution serialized.

**Green test command:**

~~~sh
cd mos-app
npm test -- src/lib/db/processes.test.ts src/components/tasks/use-occurrence-groups.test.ts src/components/tasks/occurrence-assign-dialog.test.tsx src/components/cafe/cafe-opening-panel.test.tsx
npx playwright test e2e/AC-720-cafe-today-opening.spec.ts --project=chromium
~~~

**Refactor:** Remove any duplicate occurrence identity or Café-only pending state. A pending generated Task is still the canonical Task shape with an honest assignment state.

**Verification:** Confirm repeated start/resolve is idempotent, no Process Run noun leaks into floor-facing copy, the owning Team is never guessed, and members without mutation permission see the started opening and Tasks read-only.

### Task 10 — Rendered responsive/accessibility proof and old-remnant audit (2–5 minutes per red/green/refactor loop)

**Red:** Add mos-app/e2e/AC-812-cafe-responsive-states.spec.ts with seeded realistic Gordi data and explicit assertions for 1280px, 1024px, and 390px. Include zero/one/multiple Team context, loading, empty, no process, error/retry, permission/read-only, started opening, collection click, canonical viewer, keyboard/focus, and leave/close behavior. Capture a failing screenshot or assertion for each missing state.

**Green:** Make the smallest CSS/markup changes in the adopted shared tokens and page/collection/viewer styles. Retain E7 Café warmth, navy structural surfaces, One Blue focus/action language, existing typography and control sizing, compact operational rows, and phone capture priority. Replace old local interaction treatment only where it conflicts with shared grammar or current decisions.

Inspect and classify the current Café/Kitchen remnants before editing:

- mos-app/src/pages/cafe-opening-page.tsx
- mos-app/src/styles/cafe-opening-panel.css
- mos-app/src/pages/cafe-log-page.tsx
- mos-app/src/pages/cafe-plan-page.tsx
- mos-app/src/pages/cafe-stock-page.tsx
- mos-app/src/pages/cafe-review-page.tsx
- mos-app/src/pages/cafe-pushes-page.tsx
- the current mos-app/src/styles/ and mos-app/src/components/kitchen/ styles referenced by those pages

Do not delete old pages in Issue 8 unless the adopted route manifest proves they are unreachable and the removal is explicitly in the issue scope. Unreachable/legacy interaction remnants may be documented in the future review ledger and retired in a later cleanup issue.

**Green test command:**

~~~sh
cd mos-app
npx playwright test e2e/AC-812-cafe-responsive-states.spec.ts --project=chromium
npm test -- src/pages/cafe-opening-page.test.tsx src/components/cafe/cafe-opening-panel.test.tsx
~~~

**Refactor:** Check focus-visible behavior, dialog/overlay focus restoration, semantic names, touch target sizes, scroll locking, no horizontal overflow, no clipped canonical URL states, and no filler language. Keep state copy plain enough for a floor member with no internal MOS vocabulary.

**Verification:** Save rendered evidence for all three widths and the four-lens review. Visual evidence is implementation evidence only; the owner’s Issue 9 representative gate remains open.

### Task 11 — Full verification, four-lens review, security review, and implementation checkpoint documents (2–5 minutes per red/green/refactor loop)

**Red:** Run all required gates before documenting completion. Any missing command, unresolved data row, type seam, flaky browser journey, or review contradiction is a red state.

**Green:** Future implementation must run these commands from the exact locations:

~~~sh
cd /Users/ariefsaid/.codex/worktrees/dace/gordi-mos/mos-app
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
npx playwright test --project=chromium
~~~

From the repository root, run the local-only DB and merge gates serially:

~~~sh
cd /Users/ariefsaid/.codex/worktrees/dace/gordi-mos
pg_prove -h 127.0.0.1 -p 54322 -U postgres -d postgres supabase/tests/*.sql
bash scripts/pre-merge-check.sh
git diff --check
~~~

Use the repository’s actual package script names when the preflight discovers a documented equivalent; record the exact successful command rather than hiding a substituted command.

Complete these reviews:

- Spec review: each Issue 8 proof has one owning test and the test describes the user goal.
- Code-quality review: migration reversibility, error handling, data preservation, type narrowing, no duplicated viewer/collection logic, and no unrelated Kitchen churn.
- Security review: required security-auditor pass for Team/org foreign keys, RLS, direct inserts, Team reassignment, SECURITY DEFINER maintenance function, spawn/resolve RPC authorization, provenance guards, and cross-org leak attempts. Use OWASP/STRIDE reasoning and pgTAP evidence.
- Four-lens design review: Visual against E7/DESIGN tokens; IxD for explicit Team choice, keyboard/focus, retry, permission/read-only, and leave guard; IA for Café as operational Task view and canonical opening; Product/Intent against the Café JTBD, floor-member usability, current decisions, and no Issue 9 owner claim.

**Refactor:** After review, remove only changes proven unnecessary by the evidence. Do not reopen owner-approved E7 visuals or add a new mockup round. If a review finds an unresolved domain/schema seam, write the stop condition and leave the branch incomplete rather than masking it.

**Verification:** Create or update only the future implementation checkpoint documents named by the repository workflow, such as the branch review ledger and checkpoint handoff. Do not edit docs/agent-context.md, docs/backlog.md, or any other planning source as part of this plan-only task.

## Required stop conditions

Stop and request owner/Director direction before claiming completion if any condition below occurs:

1. The ambiguity report contains a legacy Task with zero or multiple valid Team candidates, a missing/cross-org process-run Team, or a BU/Team mismatch.
2. The owner has not approved the explicit task-to-Team mapping required for an ambiguous legacy row.
3. The final enforcement migration cannot prove every Task has one same-org Team and BU equality.
4. The current schema cannot provide an authoritative Café eligible-Team set for zero/one/multiple resolution without BU guessing.
5. Issue 5, 6, or 7 has no approved final contract, or their exports would force a Café-local viewer, drawer, overlay, or collection engine.
6. Team reassignment authority is not covered by the current permission law and no owner-approved rule exists for the recommended Accountable/manager/admin boundary.
7. A generated Task would lose process_run_id, generated_from_task_def_id, role provenance, occurrence identity, or idempotency.
8. A member who cannot start would see a Start/mutation control, or a permission denial would be rendered as empty data.
9. BU or Site can diverge from Team, a legacy BU value is used as a Team identity, or old R/A data is dropped/renamed.
10. Any local DB or browser test requires parallel Supabase access, cloud staging, destructive data reset outside the local sandbox, or an unreviewed schema shortcut.
11. A rendered check fails at 1280px, 1024px, or 390px; keyboard/focus behavior is broken; or a state is represented by generic filler content rather than realistic operational copy.
12. A review requests Issue 9 owner visual acceptance or changes the representative gate’s ownership.

## Future implementation handoff and commit boundary

The future implementation branch may commit only after the migration/data/security gates, app tests, rendered browser proof, four-lens review, and review-ledger evidence are complete. Keep migration, data resolution, RPC/security, DAL, UI, Café integration, and final verification in coherent small commits, each with a red test and green evidence.

The implementation commit trailer must be:

~~~text
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
~~~

This current planning task makes no implementation claim, makes no owner acceptance claim, and does not authorize running migrations, changing Supabase, or editing any file other than this plan.
