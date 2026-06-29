# Spec — Strategy-to-Execution cascade (first slice: foundation + person-load view)

- Status: Draft (2026-06-23) — awaiting owner sign-off
- Source decisions: **ADR-0014** (cascade foundation, additive topology), **OD-C-1** (`docs/decisions.md`)
- Vocabulary: `CONTEXT.md` § Cascade · § Ownership

> **Naming + scope reconciliation (read first) — LOCKED, see ADR-0015.** Names are now final:
> where the body says *Initiative* / `mos.initiatives` / `program_process_id`, read the **Project/Process
> pair** → table **`mos.work_lines`** (`type ∈ {project, process}`), lookup **`mos.objectives`**, bridge
> column **`mos.tasks.work_line_id`** (+ `objective_id`). No umbrella term ("Initiative" dropped).
> **What SHIPPED (v1, on `main` via PR #69 — `docs/plans/2026-06-24-cascade-first-slice.md`):** the two
> lookups + two task fields; Tasks-list Work-line/Objective columns + group-by-work-line + the per-person
> caption; create/detail pickers. **DEFERRED (v2, NOT built):** the `person_workload` SECURITY DEFINER
> RPC, per-layer Accountable/Responsible, `lane` in the UI, and the standalone Workload page — the FRs
> below describing those are the eventual end-state (ADR-0014), additive later. CONTEXT.md § Cascade is
> the canonical glossary.
- Supersedes/extends: ADR-0003 (Task is the cascade-bridgeable unit; this adds its parent layer)

## 1. Overview & user value

Today MOS reads as a task manager with RACI as the highlight. This slice lights up the **hierarchy
spine** so work ties to the goals it serves, and a manager can **see where a person's effort goes** —
specifically, *is this person tied up in daily recurring work (Processes) or project work (Programs)?*

It builds the three cascade layers that pay for themselves immediately:

- **Objective** (layer 2) — the yearly goal work rolls up to.
- **Initiative** (layer 4) — the owned work-system that moves a goal; one entity, `type ∈ {Program,
  Process}`, classified by `lane ∈ {Run, Optimize, Transform}`. **Program** = bounded project work (e.g.
  new-menu design); **Process** = standing recurring work (e.g. daily IG content).
- **Task** (layer 6, exists) — gains a nullable bridge up to an Initiative.

Strategy, Outcome, Output stay vocabulary-only and fold in additively later (ADR-0014). The Daily Log is
**not** part of this slice — person-load reads from Process/Program ownership, never from log entries.

**Primary JTBD** (vault `Management OS Framework`): *"everything runs through me."* Visibility into who
owns which Programs/Processes is what enables delegation. The headline deliverable is the **Workload
view**: per person, their Programs and Processes split by lane, with linked open-task counts.

**Measure (v1):** structural load — the count of Programs/Processes a person is **A** or **R** on, by
lane, plus the count of open Tasks linked to each. No timesheet, no duration (deferred — ADR-0014).

## 2. Scope

**In:** `mos.objectives` + `mos.initiatives` tables (RLS, org seam, A/R ownership); a nullable
`program_process_id` bridge on `mos.tasks`; create/edit/list/archive for Objectives and Initiatives;
attach/detach a Task to an Initiative; the per-person **Workload** read surface.

**Out (deferred, additive):** Strategy/Outcome/Output tables; OKR/KPI measurement; timeboxes &
cadence automation; Daily Log ↔ Process unification; duration/effort capture; the full RACI-matrix UI;
nesting Objectives (the `parent_objective_id` column exists but is unused).

## 3. Domain model (shape only — see plan/ADR for migration detail)

- **`mos.objectives`**: `id` uuid pk · `org_id` · `title` · `description?` · `lane?` (nullable —
  an Objective may span lanes) · `accountable_person_id` · `responsible_person_id` ·
  `parent_objective_id?` (self-FK, **unused in v1**, no cycle guard yet) · `archived_at?` · timestamps.
- **`mos.initiatives`**: `id` uuid pk · `org_id` · `title` · `description?` · `type`
  (`program`|`process`, **NOT NULL**) · `lane` (`run`|`optimize`|`transform`, **NOT NULL**) ·
  `business_unit_id` · `accountable_person_id` · `responsible_person_id` · `objective_id?` (nullable
  FK → objectives) · `archived_at?` · timestamps.
- **`mos.tasks`**: + `program_process_id?` uuid nullable FK → `mos.initiatives(id)`. **Permanent parent
  link** (ADR-0014 topology rule); a Task never routes through an Output.

All three carry the `org_id` seam; A/R person refs must resolve to a Person in the **same org**
(same-org guard, mirroring `mos.tasks` / `ops._guard_log_entry`).

## 4. Functional requirements (EARS)

### Objectives
- **FR-200** When an authorized user submits an objective with a title and an Accountable and
  Responsible person, the system shall create an `mos.objectives` row in the user's org.
- **FR-201** The system shall reject an objective whose Accountable or Responsible person is not in the
  creator's org.
- **FR-202** Where the requester can read the org, the system shall list that org's non-archived
  objectives with their A/R people and lane.
- **FR-203** When an authorized user edits an objective's title, description, lane, or A/R people, the
  system shall persist the change.
- **FR-204** When an authorized user archives an objective, the system shall set `archived_at` and hide
  it from default lists while preserving the row (mirrors Task archival; no hard delete).
- **FR-205** Where an objective has child initiatives, when it is archived, the system shall keep those
  initiatives intact with their `objective_id` unchanged (archival is non-cascading).

### Initiatives (Program / Process)
- **FR-210** When an authorized user submits an initiative with a title, a `type`, a `lane`, a business
  unit, and A/R people, the system shall create an `mos.initiatives` row in the user's org.
- **FR-211** The system shall require `type ∈ {program, process}` and `lane ∈ {run, optimize,
  transform}`; it shall reject any other value.
- **FR-212** The system shall reject an initiative whose A/R person or business unit is not in the
  creator's org.
- **FR-213** Where an `objective_id` is supplied, the system shall reject it unless that objective is in
  the same org; where omitted, the initiative is created unlinked.
- **FR-214** Where the requester can read the org, the system shall list that org's non-archived
  initiatives with `type`, `lane`, business unit, A/R people, and linked objective (if any).
- **FR-215** When an authorized user edits an initiative's title, description, `lane`, A/R people, or
  `objective_id`, the system shall persist the change. (`type` is set at create; changing it is out of
  v1 scope.)
- **FR-216** When an authorized user archives an initiative, the system shall set `archived_at`, hide it
  from default lists, and **leave linked Tasks' `program_process_id` unchanged** (a Task may point at an
  archived initiative; it simply drops out of active load).

### Task ↔ Initiative bridge
- **FR-220** When a task editor sets a task's Initiative, the system shall store its id in
  `program_process_id`, provided the initiative is in the task's org.
- **FR-221** When a task editor clears a task's Initiative, the system shall null `program_process_id`.
- **FR-222** The system shall treat `program_process_id` as optional — existing and new tasks with no
  Initiative remain valid (additive seam; no backfill).

### Workload view (the headline)
- **FR-230** Where the requester is a manager of the subject person (or an admin), the system shall
  return that person's non-archived Programs and Processes on which they are Accountable or Responsible.
- **FR-231** The system shall group the returned initiatives by `lane` and by `type`, so the response
  distinguishes **Process (daily/run)** load from **Program (project)** load.
- **FR-232** For each initiative in the result, the system shall include the count of that person's
  **open** linked Tasks (status ≠ Done, not archived).
- **FR-233** Where the subject person owns no initiatives, the system shall return an empty result the
  surface can render as an explicit empty state (not an error).
- **FR-234** The system shall expose the viewer's **own** Workload to themselves regardless of manager
  status (every person can see their own line-of-sight).

## 5. Non-functional requirements

- **NFR-200 (security/RLS).** Every new table (`mos.objectives`, `mos.initiatives`) shall have RLS
  enabled. Read = any authenticated person in the same org (line-of-sight). Write (insert/update/archive)
  Objectives = **admin or manager**; Initiatives = **admin, manager, or ops_lead**. A/R and BU refs are
  same-org-guarded. No business table ships without RLS.
- **NFR-201 (tenancy).** All queries are scoped by `org_id`; no cross-org row is ever readable or
  linkable (mirrors the existing `org_id` seam).
- **NFR-202 (additivity).** The migration is reversible and additive — two `CREATE TABLE` + one nullable
  `ADD COLUMN`; no reshape of `mos.tasks`, no data backfill (ADR-0014).
- **NFR-203 (performance).** The Workload view shall resolve in ≤1 round-trip per person at Gordi scale
  (≤ a few hundred initiatives/org); initiative lists filter on `(org_id, archived_at)`.
- **NFR-204 (a11y).** The Workload surface meets WCAG-AA: lane/type conveyed by text label (not color
  alone — DESIGN.md Tinted-Status), keyboard-navigable, AA contrast.
- **NFR-205 (consistency).** Ownership uses the canonical A/R fields; the Workload surface uses DESIGN.md
  tokens and the existing dense-table / card-reflow grammar (no new visual language).
- **NFR-206 (operability — the literacy bar).** Every cascade surface shall be operable, with **no
  training**, by a **high-school-graduate workforce**. Concretely: each screen answers one plain question;
  primary action is a single obvious control; labels are everyday words (CONTEXT.md vocabulary, no jargon —
  "project / process", not "initiative / SWP / lane taxonomy"); no nested menus or modes to reach the core
  job; reading load per screen ≤ a short paragraph. This is a **first-class IA + IxD objective**, not a
  nice-to-have — it outranks model completeness and feature density (CLAUDE.md: "usability and speed beat
  model completeness"). Lens-D / design-review treats a screen that needs explaining as a defect.

## 6. Acceptance criteria (Given / When / Then)

- **AC-200** *(FR-200, pgTAP)* Given a manager in org A, When they create an objective with A/R people in
  org A, Then a row exists in `mos.objectives` with their `org_id`.
- **AC-201** *(FR-201/212, pgTAP)* Given a user in org A, When they create an objective or initiative
  naming a person from org B as Responsible, Then the write is rejected.
- **AC-202** *(FR-202/214, pgTAP)* Given objectives and initiatives in org A and org B, When a person in
  org A lists them, Then only org-A non-archived rows are returned.
- **AC-210** *(FR-210/211, pgTAP)* Given a manager in org A, When they create an initiative with
  `type=process`, `lane=run`, a valid BU and A/R, Then the row is created; When they submit
  `type=foo`, Then it is rejected.
- **AC-213** *(FR-213, pgTAP)* Given an initiative create with an `objective_id` from org B, When
  submitted by an org-A user, Then it is rejected; with no `objective_id`, Then it is created unlinked.
- **AC-216** *(FR-216/222, pgTAP)* Given a Task linked to an initiative, When that initiative is
  archived, Then the Task row is unchanged and still references it.
- **AC-220** *(FR-220/221, unit)* Given a task editor, When they set then clear a task's Initiative,
  Then `program_process_id` is the initiative id then null.
- **AC-222** *(FR-222, unit)* Given a task with no Initiative, When it is read/saved, Then it remains
  valid with `program_process_id` null.
- **AC-230** *(FR-230/231/232, e2e — the one curated cross-stack journey)* Given a manager viewing a
  designer who is Responsible on one `process` (Run) and Accountable on two `program`s (Transform), each
  with open linked tasks, When the manager opens that person's Workload, Then they see the Process under
  Run and the two Programs under Transform, each showing its open-task count — answering "daily vs
  project" at a glance.
- **AC-233** *(FR-233, unit)* Given a person who owns no initiatives, When their Workload is opened, Then
  an explicit empty state renders (no error).
- **AC-234** *(FR-234, pgTAP)* Given a non-manager person, When they request their own Workload, Then
  their owned initiatives are returned; When they request another person's, Then it is denied.
- **AC-205** *(FR-205, pgTAP)* Given an objective with child initiatives, When it is archived, Then the
  initiatives persist with `objective_id` unchanged.

### Test-pyramid ownership (CLAUDE.md)
- **pgTAP** (RLS / org / role / archival contracts): AC-200, 201, 202, 205, 210, 213, 216, 234.
- **Unit (Vitest/RTL)** (component/data-layer logic, mocked): AC-220, 222, 233.
- **E2E (Playwright, 1 curated journey)**: AC-230 — the manager→designer Workload read across the stack.

## 7. Error handling

| Condition | Behavior |
|---|---|
| A/R or BU person not in org | Reject write (FR-201/212); surface "must be in your organization". |
| `type`/`lane` not in allowed set | Reject (FR-211); client constrains to a select — server still validates. |
| `objective_id` cross-org or missing target | Reject cross-org (FR-213); null target → unlinked. |
| Non-manager requests another's Workload | Deny (FR-234); surface neutral "not available". |
| Initiative/objective archived | Hidden from default lists; still resolvable by id; Tasks keep their link. |
| Task points at archived initiative | Allowed; excluded from active-load counts. |
| Write by member lacking role | RLS denies (NFR-200); surface action-specific neutral copy (per AC-006 pattern). |

## 8. Implementation TODO (for eng-planner → plan)

- [ ] Migration: `mos.objectives` (+ RLS, same-org guard, archival) — reversible.
- [ ] Migration: `mos.initiatives` (+ `type`/`lane` checks, FK→objectives, RLS, same-org guard,
      archival) — reversible.
- [ ] Migration: `ALTER mos.tasks ADD program_process_id uuid NULL REFERENCES mos.initiatives(id)`.
- [ ] pgTAP: AC-200/201/202/205/210/213/216/234.
- [ ] Data layer (`db/`): objectives.ts, initiatives.ts (schema-scoped client, throwOnError wrapper);
      extend tasks.ts for the Initiative link.
- [ ] Task editor: Initiative picker (set/clear) — AC-220/222.
- [ ] Workload surface + per-person query/RPC (lane×type grouping + open-task counts) — FR-230..234.
- [ ] design-architect: Workload view mockup (dense table/cards, lane×type, DESIGN.md tokens) before UI build.
- [ ] Unit: AC-220/222/233. E2E: AC-230.
- [ ] Verify-live against the local stack (every new query/RPC vs real schema — the log_date lesson).

## 9. Open for owner sign-off

1. **Entity name** `Initiative` (vs keeping Program/Process as a bare pair). Provisional.
2. **First-slice scope** includes the Workload **view** (Director call — it's the JTBD). Confirm or
   split into data-first / view-second.
3. **Real seed** — 2–3 real Objectives + one real person's Programs/Processes (the designer) would make
   the Workload mockup land truer than fictional canon.
4. **Workload entry point** — a new top-level surface, or a section on the person/team module? (Affects
   nav; Director leans: reuse the manager **team module** — a person row expands to their Workload.)
