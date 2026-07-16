# Spec — Occurrence-as-tasks (Process definitions → cadence → spawned Tasks)

- Feature: the schema foundation that lets a **Process/Project definition** hold checklist items +
  a **cadence**, and have each scheduled **occurrence** deterministically spawn **Tasks** into
  `mos.tasks`, grouped under a **caption**, backed by a **thin occurrence record** that owns
  completion/history/version-snapshot. PIC is bound to a **job function** on the generated Task
  definition and resolved to its **current holder** at spawn; ambiguity → a human (OD-41). Per-occurrence
  progress is a **derived roll-up** read-model.
- Buildout step: **Step 6** of `docs/plans/2026-07-14-redesign-buildout.md`. This is the **schema
  foundation** step (DB/RLS: yes). Step 7 (Café retrofit) builds the *"Start today's opening"* surface
  **on top of** this spawner — **out of scope here**.
- Status: ready for engineering planning. The domain grill is **CLOSED** — all law below is derived
  from locked ODs. Genuinely-ambiguous schema/RLS/recurrence choices are marked inline
  `RATIFY-BEFORE-MERGE:` with the conservative default taken plus alternatives (consolidated in §11).
- Authority (read order): `docs/decisions.md` **OD-REDESIGN-11** (definition ≠ occurrence),
  **OD-REDESIGN-12** (Task-vs-Checklist ownership boundary), **OD-REDESIGN-14** (Supervisor
  inheritance), **OD-REDESIGN-41 / "OD-41"** (function→holder resolution order; *ambiguity never
  guesses*), **OD-REDESIGN-58** (occurrences surface as Tasks; job-function assignment; Q2 APPROVED),
  **OD-REDESIGN-40/41** (Team is scope, not authority) · `docs/adr/0025-…redesign-direction.md`
  **D6/D7/D14/D18/D40/D41** · `CONTEXT.md` (**Process**, **Process Run**, **occurrence**, **job
  function**, **holder**, **Activity**, **Task**, **Checklist item**, **Check**) ·
  `docs/experience-contract.md` **Rule 2** (Process-occurrence = thin Run record + roll-up) /
  **Rule 4 & 6** (record grammar) · existing schema: `mos.tasks`
  (`supabase/migrations/20260611000007…`), `mos.task_checklist_items`/`task_events`
  (…`0008`), `mos.tasks` RLS + `mos.can_edit_task` (…`0009`), the tenancy guard
  (…`20260711000001`), `mos.work_lines`/`mos.objectives` catalog (…`20260624000001`),
  `shared.roles`/`person_roles`/`people` (…`20260611000002`), `shared.is_manager_of`
  (…`0004`), `mos.notifications` + `mos.create_notification` (…`20260706000002/3`), the
  `approve_kitchen_log` SECURITY-DEFINER lock→gate→write RPC (…`20260620000009`), the
  external-cron precedent `scripts/reporting_snapshot.py` (…`20260704000001`).

## 1. Overview

A **Process** is a permanent definition of recurring work and is never "done"; each occurrence is a
distinct execution (OD-REDESIGN-11). Today `mos.work_lines` is only a thin catalog row (`name`,
`type ∈ {project,process}`, `archived_at`) — it carries **no cadence, no generated-task structure, no
RACI**. This step adds the **spawnable** layer:

1. **`mos.process_definitions`** — a versioned, BU-owned recurring-work definition: its **cadence**
   (how often, at what WIB time), its RACI defaults (for Supervisor inheritance), and its lifecycle.
2. **`mos.process_task_templates`** (+ **`…_checklist_items`**) — the **generated Task definitions**.
   Per OD-REDESIGN-12 a template becomes **one Task** (single-operator checklists = one Task with its
   checks/checklist inside); each template binds its **PIC to a job function** (a `shared.roles`
   position + optional BU scope), never to a fixed person.
3. **`mos.process_occurrences`** — the **thin occurrence record** ("Process Run", *invisible in the
   UI* per OD-REDESIGN-58). It owns the occurrence's **caption**, its **version snapshot** (immutable
   copy of the definition + templates + resolved assignments at spawn), and is the **idempotency
   anchor** (`unique (process_definition_id, occurrence_key)`). Completion/progress/history is a
   **derived roll-up**, not a stored status.
4. **`mos.tasks.occurrence_id`** (new nullable FK) — spawned Tasks are ordinary `mos.tasks` rows
   (they reuse the shipped Tasks DB-view, Rule 11), grouped by their `occurrence_id` under the
   occurrence caption.
5. **`mos.occurrence_pending_assignments`** — the **ambiguity→human** queue. When a template's job
   function resolves to **0 holders (vacant)** or **>1 holders (ambiguous)**, the spawner does **not**
   fabricate a PIC: it records a pending row (candidate list + reason) and notifies a human, who
   resolves it into a real Task via an RPC. `mos.tasks.responsible_person_id` is `NOT NULL`, so a Task
   is **never** created with a guessed owner.
6. The **spawner** `mos.spawn_due_occurrences()` is a **SECURITY DEFINER** RPC, invoked server-side
   by a VPS cron (the `reporting_snapshot.py` external-scheduler pattern) as a dedicated role. It is
   **deterministic** (occurrence_key derived purely from the definition + WIB window) and
   **idempotent** (`ON CONFLICT DO NOTHING` on the occurrence unique key — re-running a window never
   double-spawns).

**Non-goals (this step):** any UI/surface (the *"Start today's opening"* screen, the Café retrofit,
occurrence grouping in `/work/tasks`) — **Step 7**; the guided Process **designer** (authoring UI,
D7) — later; **Standards / Checks / Exceptions** typed-step machinery (OD-REDESIGN-12 mentions them;
the *template* carries lightweight checklist items only in this step, Check objects deferred);
**Standard publication / consumer adoption / per-Team version upgrade** notifications (D18/D40) —
deferred (this step versions the definition and *snapshots* at spawn, but does not build the
publish→adopt→upgrade transaction); a **Teams table** (does not exist yet — see RATIFY-1); `pg_cron`
in-DB scheduling (RATIFY-6); backfill of arbitrarily old missed windows (RATIFY-5).

## 2. Data model (schema `mos`, tenant seam `org_id`, no app-tier DELETE anywhere — NFR-002)

All new tables: `id uuid pk default gen_random_uuid()`; `org_id uuid not null references shared.orgs(id)
on delete cascade default shared.current_org_id()`; `created_at`/`updated_at timestamptz` with the
`shared.set_updated_at()` trigger where mutable; **RLS enabled + forced** (§6); **no DELETE grant**.

### 2.1 `mos.process_definitions` — the spawnable recurring-work definition

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null fk→`shared.orgs` | tenant seam (OD-P1-1). |
| `work_line_id` | uuid **nullable** fk→`mos.work_lines` | optional link to the catalog row (RATIFY-1: link vs fold). Same-org-guarded. |
| `name` | text not null check `btrim(name)<>''` | e.g. *"Café HQ daily opening"*. |
| `business_unit_id` | uuid not null fk→`shared.business_units` | governance definitions belong to a BU (CONTEXT *Team execution scope*). Same-org-guarded. |
| `accountable_person_id` | uuid not null fk→`shared.people` | definition **A** — the Supervisor-inheritance source (OD-REDESIGN-14). Same-org-guarded. |
| `responsible_person_id` | uuid not null fk→`shared.people` | definition **R**. Same-org-guarded. |
| `cadence_kind` | text not null check in (`daily`,`weekly`,`monthly`,`manual`) | `manual` = never auto-spawns (started by a future human RPC; still gets occurrences/idempotency). |
| `cadence_config` | jsonb not null default `'{}'` | `weekly`: `{"dow":[1,2,…]}` (ISO 1=Mon…7=Sun); `monthly`: `{"dom":[1,15]}` or `{"dom":["last"]}`; `daily`/`manual`: `{}`. Shape validated by a CHECK/guard (RATIFY-3). |
| `spawn_time_local` | time not null default `'03:00'` | the WIB wall-clock time the window opens for spawning. |
| `timezone` | text not null default `'Asia/Jakarta'` check `= 'Asia/Jakarta'` | fixed in v1 (WIB); column present so multi-tz is additive later. |
| `version` | integer not null default 1 check `> 0` | bumped by an authoring edit that changes spawn-affecting structure (RATIFY-4). Snapshotted onto each occurrence. |
| `is_active` | boolean not null default true | inactive ⇒ the spawner skips it; existing occurrences/tasks untouched. |
| `archived_at` | timestamptz | soft-archive (NFR-002). Archived ⇒ never spawns. |
| `created_by` | uuid not null fk→`shared.people` default `shared.current_person_id()` | audit; immutable (guard). |
| `created_at` / `updated_at` | timestamptz | audit. |

Indexes: `(org_id) where archived_at is null`; `(org_id, is_active) where archived_at is null` (the
spawner's due-scan); `(business_unit_id)`; `(work_line_id)`.

### 2.2 `mos.process_task_templates` — generated Task definitions (OD-REDESIGN-12 / -58)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null fk→`shared.orgs` | tenant seam. |
| `process_definition_id` | uuid not null fk→`mos.process_definitions` **on delete cascade** | parent. |
| `title` | text not null check `btrim(title)<>''` | becomes `mos.tasks.title`. |
| `business_unit_id` | uuid not null fk→`shared.business_units` | becomes the spawned Task BU. Same-org-guarded. Defaults from the definition's BU but overridable per template. |
| `pic_job_function_role_id` | uuid not null fk→`shared.roles` | **the job-function binding** — the Role whose current holder becomes PIC at spawn (Q2 / OD-REDESIGN-58). Same-org-guarded. Turnover changes the holder, never this row. |
| `pic_scope_business_unit_id` | uuid **nullable** fk→`shared.business_units` | optional narrowing when the role is held across BUs/teams (RATIFY-2). NULL = no narrowing. Same-org-guarded. |
| `supervisor_mode` | text not null default `inherit_a` check in (`inherit_a`,`override`) | OD-REDESIGN-14: default Supervisor = definition **A**; `override` uses the column below. |
| `supervisor_override_person_id` | uuid nullable fk→`shared.people` | required iff `supervisor_mode='override'` (CHECK). Same-org-guarded. |
| `due_offset_days` | integer not null default 0 check `>= 0` | spawned Task `due_date` = occurrence window date + this. |
| `position` | integer not null | ordering within the occurrence caption group. |
| `created_by` | uuid not null fk→`shared.people` | audit; immutable. |
| `created_at` / `updated_at` | timestamptz | audit. |

Index: `(process_definition_id, position)`.

### 2.3 `mos.process_task_template_checklist_items` — template checklist lines (mirrors `task_checklist_items`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null fk→`shared.orgs` | tenant seam. |
| `template_id` | uuid not null fk→`mos.process_task_templates` **on delete cascade** | parent. |
| `label` | text not null check `btrim(label)<>''` | copied into a real `mos.task_checklist_items.label` at spawn. |
| `position` | integer not null | order. |
| `created_at` / `updated_at` | timestamptz | audit. |

> **Scope note (OD-REDESIGN-12):** template checklist items are the *lightweight* steps that inherit
> the parent Task's ownership/lifecycle. Typed **Standard Steps → Checks/forms/evidence** are a
> **deferred** richer layer; v1 spawns only Task + checklist items. Flagged as a deferred boundary, not
> a RATIFY (the OD explicitly permits a checklist-only first cut).

### 2.4 `mos.process_occurrences` — the thin occurrence record (idempotency anchor + version snapshot)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null fk→`shared.orgs` | tenant seam. |
| `process_definition_id` | uuid not null fk→`mos.process_definitions` | parent (NO cascade delete — occurrences are execution history; there is no DELETE anyway). Same-org-guarded. |
| `occurrence_key` | text not null | **deterministic WIB window token** (§4.1): `daily`=`'YYYY-MM-DD'`, `weekly`=`'IYYY-"W"IW'` (ISO week), `monthly`=`'YYYY-MM'` (or `'YYYY-MM-DD'` when `dom` names a specific day), `manual`=caller-supplied. |
| `scheduled_for` | date not null | the WIB window date the occurrence represents. |
| `caption` | text not null | grouping caption stored at spawn (e.g. *"Daily opening · Wed 16 Jul"*). Rule 2 caption grouping. |
| `definition_version` | integer not null | snapshot pointer = `process_definitions.version` at spawn. |
| `definition_snapshot` | jsonb not null | **immutable** copy of the definition + templates + resolved PIC/Supervisor per template at spawn (D6/D14/D18/D40 "resolved value is snapshotted"). Survives later edits/archival of the definition. |
| `spawned_at` | timestamptz not null default `now()` | when the spawner materialised it. |
| `spawned_by` | uuid nullable fk→`shared.people` | the human for a `manual` start; NULL for the automated cron (system). |
| `created_at` | timestamptz not null default `now()` | append-only; **no `updated_at`** — the row is immutable after spawn (guard). |

**Idempotency key:** `unique (process_definition_id, occurrence_key)`. Indexes: `(org_id)`,
`(process_definition_id, scheduled_for desc)`.

> **Completion/progress is NOT stored here.** Per OD-REDESIGN-58 "per-occurrence roll-up is a derived
> read-model." Completion = *all non-archived child Tasks are `Done`* is **computed** by the roll-up
> (§5), never a mutable column, so it can never drift from the Tasks it summarises.

### 2.5 `mos.occurrence_pending_assignments` — the ambiguity→human queue (OD-41)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null fk→`shared.orgs` | tenant seam. |
| `occurrence_id` | uuid not null fk→`mos.process_occurrences` | the occurrence this unassigned work belongs to. Same-org-guarded. |
| `template_id` | uuid not null fk→`mos.process_task_templates` | which generated-Task definition could not be assigned. Same-org-guarded. |
| `reason` | text not null check in (`vacant_role`,`ambiguous_holder`,`ambiguous_supervisor`) | why the spawner deferred it. |
| `candidate_person_ids` | uuid[] not null default `'{}'` | the >1 holders for `ambiguous_holder` (empty for `vacant_role`). Every element same-org-guarded. |
| `resolved_task_id` | uuid nullable fk→`mos.tasks` | set when a human resolves it (the Task then exists). NULL = still pending. |
| `resolved_by` | uuid nullable fk→`shared.people` | audit. |
| `resolved_at` | timestamptz nullable | audit. |
| `created_at` / `updated_at` | timestamptz | audit. |

Index: `(org_id) where resolved_at is null` (the Home/Inbox "needs assignment" query). Unique
`(occurrence_id, template_id)` — one pending row per template per occurrence (idempotent with the
spawner).

### 2.6 `mos.tasks` — additive column

- Add `occurrence_id uuid nullable references mos.process_occurrences(id)`. **No backfill** (all
  existing Tasks are ad-hoc; the FK is additive, matching the `objective_id`/`work_line_id` precedent).
- Add index `tasks_occurrence_idx on mos.tasks (occurrence_id) where occurrence_id is not null`.
- Extend the existing `mos._guard_task_refs()` (or add a sibling guard) so a non-NULL `occurrence_id`
  must resolve to a **same-org** occurrence (FKs check existence only; the tenancy guard closes the
  cross-org seam exactly as it does for `business_unit_id`/`responsible_person_id`).
- Spawned Tasks keep the **full Task contract** (R/A NOT NULL, BU, status, checklist, events). They are
  Tasks in every way (Rule 2: same renderer) — `occurrence_id` is only the grouping link.

## 3. Functional requirements (EARS)

**Definitions & templates (authoring — schema/write contracts only; the designer UI is Step-7+):**

- **FR-001** The system SHALL persist a Process definition with a BU, a definition A and R, a
  `cadence_kind`, a `cadence_config`, a `spawn_time_local`, a `timezone`, a `version`, and an
  `is_active` flag.
- **FR-002** WHERE `cadence_kind ∈ {weekly, monthly}`, the system SHALL reject a definition whose
  `cadence_config` does not contain the required key (`dow` / `dom`) with a well-formed value
  (error `23514`).
- **FR-003** The system SHALL persist one or more generated-Task **templates** per definition, each
  with a title, a BU, a `pic_job_function_role_id`, a `supervisor_mode`, a `due_offset_days`, and a
  `position`.
- **FR-004** WHERE a template's `supervisor_mode = 'override'`, the system SHALL require a non-NULL
  `supervisor_override_person_id` (error `23514`); WHERE `supervisor_mode = 'inherit_a'`, the
  override person SHALL be NULL.
- **FR-005** The system SHALL persist ordered checklist-item templates under a task template.
- **FR-006** The system SHALL treat `created_by`, `org_id` (all new tables) and `version` monotonicity
  as immutable-on-UPDATE (guard raises `42501` on change), mirroring the `mos.tasks`/`notifications`
  immutability guards.

**Cadence evaluation & spawning (the deterministic, idempotent engine):**

- **FR-010** WHEN `mos.spawn_due_occurrences(p_now)` runs, the system SHALL, for every **active,
  non-archived** definition whose cadence produces a window whose spawn moment (`scheduled_for` +
  `spawn_time_local`, in `Asia/Jakarta`) is at or before `p_now`, compute that window's
  deterministic `occurrence_key`.
- **FR-011** The system SHALL create **at most one** `process_occurrences` row per
  `(process_definition_id, occurrence_key)` — a second spawn of the same window SHALL create no new
  occurrence, no duplicate Tasks, and no duplicate pending rows (idempotency via `ON CONFLICT
  (process_definition_id, occurrence_key) DO NOTHING`).
- **FR-012** WHEN it creates a new occurrence, the system SHALL write the `caption`,
  `definition_version`, and an **immutable `definition_snapshot`** capturing the definition + all
  templates + each template's **resolved** PIC and Supervisor at that instant.
- **FR-013** For each template of a newly-created occurrence, the system SHALL resolve the job function
  to its current holder(s) (§4.2) and: **(a)** IF exactly one holder → insert a `mos.tasks` row
  (`occurrence_id` set, PIC = that holder, Supervisor per §4.3, BU/title/due from the template) plus
  its checklist items; **(b)** IF zero holders (`vacant_role`) or more than one holder
  (`ambiguous_holder`) → insert a `mos.occurrence_pending_assignments` row and **NOT** insert a Task.
- **FR-014** WHEN a pending assignment is created, the system SHALL deliver a `mos.notifications` Inbox
  item (via `mos.create_notification`) to a human resolver (§4.4) whose metadata deep-links to the
  pending row; the system SHALL NOT auto-select any candidate (OD-41 "ambiguity never guesses").
- **FR-015** WHERE the manager/Supervisor resolution for an otherwise-assignable template is ambiguous
  (multiple manager paths, OD-REDESIGN-41), the system SHALL still create the Task with its resolved
  PIC but record an `ambiguous_supervisor` pending row and notify — the Supervisor, not the Task, is
  deferred. `RATIFY-BEFORE-MERGE` (RATIFY-7) covers whether an ambiguous Supervisor instead blocks the
  Task.
- **FR-016** WHEN a definition changes after occurrences exist, the system SHALL leave every existing
  occurrence's `definition_snapshot` and its spawned Tasks **unchanged** (D18/D40: started/materialised
  runs keep their snapshot); only future unspawned windows use the new version.
- **FR-017** WHERE the spawner missed one or more past windows (e.g. the cron did not run), the system
  SHALL spawn only windows whose spawn moment falls within the **catch-up horizon** (default: the same
  WIB day as `p_now`; RATIFY-5) and SHALL NOT retroactively spawn windows older than the horizon;
  skipped windows are recorded (a `raise notice` / spawn-log row), not silently lost.
- **FR-018** A per-occurrence failure (one definition's resolution error) SHALL be isolated in a
  subtransaction so that the batch continues and other definitions still spawn (the RPC never aborts
  the whole run on one bad definition).
- **FR-019** WHERE `cadence_kind = 'manual'`, `mos.spawn_due_occurrences` SHALL skip the definition;
  a manual occurrence is created only by an explicit future human-invoked start RPC (out of scope for
  auto-spawn; the table + idempotency key support it now).

**Resolution into a real Task (human clears the pending queue):**

- **FR-020** WHEN a human invokes `mos.resolve_pending_assignment(p_pending_id, p_person_id)`, the
  system SHALL verify the actor is authorised (§6), verify `p_person_id` is a valid same-org person
  (and, for `ambiguous_holder`, a member of `candidate_person_ids`), create the `mos.tasks` row
  (identical shape to FR-013a) with its checklist items, and stamp `resolved_task_id/by/at` — idempotently
  (a second call on an already-resolved row is a no-op/`P0003`).

**Derived roll-up (read-model):**

- **FR-030** The system SHALL expose a per-occurrence **roll-up** (view/function, §5) reporting, over
  the occurrence's non-archived child Tasks: total count, counts by status
  (Open/In Progress/Blocked/Done), a **derived completion** flag (true iff ≥1 child Task exists and all
  are `Done`), the earliest child `due_date`, and the count of unresolved pending assignments.
- **FR-031** The roll-up SHALL be scoped to the viewer's org (RLS) and SHALL reflect live Task state
  (no stored/duplicated progress column to drift).

## 4. Algorithms & resolution rules

### 4.1 Occurrence-key derivation (deterministic, WIB)

Given a definition and a candidate window date `d` (a WIB calendar date):

- `daily` → `occurrence_key = to_char(d,'YYYY-MM-DD')`, one per WIB day.
- `weekly` → for each ISO dow in `cadence_config.dow`, the window date is that day's date in the WIB
  ISO week; `occurrence_key = to_char(d,'IYYY-"W"IW')` **plus** the dow when multiple days/week (so
  each configured day is its own occurrence — `RATIFY-3` fixes the multi-day-per-week key form).
- `monthly` → for each `dom` in `cadence_config.dom` (`'last'` = month-end), the window date is that
  day in the WIB month; `occurrence_key = to_char(d,'YYYY-MM-DD')`.
- All timezone math uses `(timestamptz) AT TIME ZONE 'Asia/Jakarta'`; **no** server-local or UTC-date
  assumption. The key is a **pure function** of (cadence, window) — identical inputs always yield the
  identical key (the idempotency guarantee's basis).

### 4.2 Job-function → current-holder resolution (Q2 / OD-REDESIGN-58)

For a template's `pic_job_function_role_id` (optionally narrowed by `pic_scope_business_unit_id`):

```
holders := { pr.person_id
             from shared.person_roles pr
             join shared.people p on p.id = pr.person_id
             where pr.role_id = template.pic_job_function_role_id
               and p.org_id = occurrence.org_id
               and p.archived_at is null }
        (∩ role BU = pic_scope_business_unit_id when the narrowing column is set)
```

- `count(holders) = 1` → **resolved** PIC.
- `count(holders) = 0` → **`vacant_role`** → pending + notify (never fabricate).
- `count(holders) > 1` → **`ambiguous_holder`** → pending with `candidate_person_ids = holders` +
  notify. **Never** pick the "first" holder (OD-41).

Turnover (a `person_roles` change) alters *who resolves next spawn*; it never edits the template or any
already-spawned occurrence (OD-REDESIGN-58 "turnover changes the holder mapping, never the Process").

### 4.3 Supervisor resolution (OD-REDESIGN-14 / -41)

Resolution order for the spawned Task's Supervisor:

1. template `supervisor_mode='override'` → `supervisor_override_person_id`.
2. else definition **A** (`process_definitions.accountable_person_id`) — the default (OD-14).
3. *(fallback, only if A is somehow unresolvable — defensive)* PIC's BU-matching direct manager via
   `shared.is_manager_of` chain; multiple manager paths → `ambiguous_supervisor` pending (FR-015).
4. else PIC self-supervises (OD-REDESIGN-41 top-level-PIC clause).

Because a definition always has an A (NOT NULL), path 2 is the normal outcome; paths 3–4 are the
ad-hoc-parity fallbacks and the only source of an `ambiguous_supervisor`.

### 4.4 Who is notified for a pending assignment (FR-014)

Deliver the Inbox item to the definition's **A** and **R** (both are same-org people, guaranteed
present). `RATIFY-8` covers whether to additionally notify a Team supervisor once a Teams table
exists. No fan-out beyond A+R in v1 (conservative — avoids notifying an unbounded audience).

### 4.5 Spawner shape (SECURITY DEFINER, lock→gate→write; mirrors `approve_kitchen_log`)

`mos.spawn_due_occurrences(p_now timestamptz default now()) returns integer` (count of occurrences
created), `security definer`, `set search_path=''`:

1. Gate the caller to the dedicated spawner role / `service_role` (defense-in-depth; the cron connects
   as that role, per the `reporting_snapshot.py` pattern). A normal `authenticated` JWT is rejected
   (`42501`) — users do not trigger mass spawns.
2. For each active, non-archived definition: compute due windows within the catch-up horizon (§4.1,
   FR-017); for each, `insert … on conflict (process_definition_id, occurrence_key) do nothing
   returning id`.
3. IF a row was returned (new occurrence): build the snapshot, loop templates, resolve (§4.2/4.3),
   insert Tasks or pending rows, deliver notifications — **inside a per-occurrence subtransaction**
   (`begin … exception when others then …` block) so one failure does not abort the batch (FR-018).
4. Because the RPC is RLS-bypassing, **every write pins `org_id` from the definition row** (never from
   a JWT claim — the cron has no person context) and every reference is same-org by construction (the
   templates/roles/people were same-org-guarded at author time).

## 5. Derived roll-up (read-model)

`mos.occurrence_rollup` — a `security_invoker` view (or a `stable` function
`mos.occurrence_rollup(p_occurrence_id uuid)`) over `mos.process_occurrences` LEFT JOIN
`mos.tasks (occurrence_id, archived_at is null)`:

| Field | Definition |
|---|---|
| `occurrence_id` | the occurrence. |
| `caption`, `scheduled_for` | passthrough. |
| `task_total` | count of non-archived child Tasks. |
| `open` / `in_progress` / `blocked` / `done` | counts by `status`. |
| `is_complete` | `task_total > 0 AND done = task_total`. **Derived** (FR-030). |
| `progress_pct` | `done::numeric / nullif(task_total,0)`. |
| `earliest_due` | `min(due_date)`. |
| `pending_unassigned` | count of `occurrence_pending_assignments where resolved_at is null`. |

The view inherits the underlying tables' RLS (invoker) → org-scoped automatically. No stored
completion column exists to reconcile.

## 6. RLS matrix (every new table: `enable` + `force`; org-gate on every branch; no DELETE grant)

| Table | SELECT | INSERT | UPDATE | Notes |
|---|---|---|---|---|
| `mos.process_definitions` | org member (pickers/roll-up) | `admin` OR `ops_lead` | `admin` OR `ops_lead`; `created_by`/`org_id`/`version`-monotonic guard | catalog-management parity with `work_lines`/`objectives`. |
| `mos.process_task_templates` | org member | `admin` OR `ops_lead` | `admin` OR `ops_lead` | same. |
| `mos.process_task_template_checklist_items` | org member | `admin` OR `ops_lead` | `admin` OR `ops_lead` | same. |
| `mos.process_occurrences` | org member | **no `authenticated` INSERT policy** — written only by the SECURITY DEFINER spawner (service role bypasses RLS) | **none** (immutable after spawn) | execution record; humans read, never hand-write. `manual` start goes through a future RPC, not a raw INSERT. |
| `mos.occurrence_pending_assignments` | org member | spawner (definer) only | **resolve only** via `mos.resolve_pending_assignment` (definer) — no direct `authenticated` UPDATE policy, OR a policy gated to definition A/R + `process.adopt`-style capability (RATIFY-9) | the ambiguity queue. |
| `mos.tasks` (spawned rows) | unchanged (org-readable) | unchanged (spawner inserts as definer; humans still insert ad-hoc) | unchanged (`can_edit_task`) | `occurrence_id` cross-org guard added to `_guard_task_refs`. |

- **Grants:** `select, insert, update` to `authenticated` on the definition/template/checklist tables;
  `select` to `authenticated` on `process_occurrences` + `occurrence_pending_assignments` (writes via
  definer RPCs). **No `delete`** anywhere (NFR-002).
- **Spawner role:** `mos.spawn_due_occurrences` + `mos.resolve_pending_assignment` are
  `security definer`; `execute` granted narrowly (the spawner to the cron role; the resolver to
  `authenticated` with an internal capability gate). Mirrors the reporting-writer dedicated-role
  posture (…`20260704000001`).
- **Cross-org seams:** the `_guard_task_refs` extension + a new
  `mos._guard_process_refs()` (BEFORE INSERT/UPDATE on definitions/templates/pending) enforce that
  `business_unit_id`, `pic_job_function_role_id`, `pic_scope_business_unit_id`,
  `supervisor_override_person_id`, A/R person ids, `work_line_id`, `occurrence_id`, `template_id`, and
  every `candidate_person_ids[]` element resolve **within the row's org** (raise `23514`) — FKs check
  existence only and bypass RLS (the exact seam the tasks tenancy guard closes).

## 7. NFRs

- **NFR-001 (idempotency)** Re-running `spawn_due_occurrences` over any window is a no-op for
  already-spawned windows — proven by the unique key + `ON CONFLICT DO NOTHING`. No duplicate
  occurrence, Task, pending row, or notification.
- **NFR-002 (no hard delete)** No table grants DELETE to `authenticated`; removal is `archived_at`
  (definitions) or immutability (occurrences). Structural parity with `mos.tasks`.
- **NFR-003 (determinism)** Given identical (definition, `p_now`) inputs and identical directory state,
  the spawner produces identical occurrence keys and identical resolution outcomes (pure functions;
  no `random()`, no reliance on row order for holder pick — ambiguity defers, never picks).
- **NFR-004 (timezone correctness)** All window/date math is `Asia/Jakarta`; a definition with
  `spawn_time_local='03:00'` spawns the WIB-day window, never a UTC-day-boundary artefact.
- **NFR-005 (tenant isolation)** No new table leaks across `org_id`; every reference is same-org
  guarded; the definer RPCs pin `org_id` from the definition row, never from a spoofable claim.
- **NFR-006 (reversibility)** The migration is fully reversible (spelled-out DOWN, §8); the
  `mos.tasks.occurrence_id` addition is additive/nullable with no backfill.
- **NFR-007 (audit/history)** Occurrences are append-only immutable; pending resolutions stamp
  who/when; spawned Tasks carry the standard `task_events` trail; the `definition_snapshot` preserves
  the exact resolved structure even after the definition changes/archives.
- **NFR-008 (batch resilience)** One malformed definition never aborts the batch (FR-018
  subtransaction isolation).

## 8. Migration & reversibility plan

One migration `supabase/migrations/2026071x000001_mos_process_occurrences.sql` (single logical slice;
may split definitions/RLS/spawner across files following house convention). Order:

1. `create table mos.process_definitions` (+ indexes, `set_updated_at` trigger, `_guard_process_refs`
   immutability+cross-org guard).
2. `create table mos.process_task_templates` (+ checklist-items child).
3. `create table mos.process_occurrences` (immutability guard, unique idempotency key).
4. `create table mos.occurrence_pending_assignments`.
5. `alter table mos.tasks add column occurrence_id …` + index + extend `_guard_task_refs` for the
   `occurrence_id` same-org check.
6. `create function mos.spawn_due_occurrences` + `mos.resolve_pending_assignment` (definer) + narrow
   `execute` grants.
7. `create view mos.occurrence_rollup` (invoker).
8. RLS: enable+force + policies + grants on all new tables.

**DOWN (pre-production, spelled out at file foot):** drop view → drop functions → drop policies →
`alter table mos.tasks drop column occurrence_id` (+ index, + revert guard) → drop the four new tables
in FK order → drop guards. No data backfill to reverse.

## 9. Test plan — one AC per test, lowest sufficient layer

Layer legend: **pgTAP** (`supabase test db`) for RLS + spawner SQL + idempotency + cross-org
contracts; **Unit** (Vitest) for pure TS derivations exposed to the app; **e2e** — *none this step*
(the occurrence UI/journey — *"Start today's opening"* — is Step 7; F2 e2e lands there).

| AC | Given / When / Then | Owning layer |
|---|---|---|
| **AC-001** | Given an active `daily` definition with one template whose job function has exactly one holder, When `spawn_due_occurrences` runs for a WIB day, Then exactly one occurrence and one `mos.tasks` row (PIC = that holder, `occurrence_id` set) exist. | pgTAP |
| **AC-002** | Given the same definition already spawned for that WIB day, When `spawn_due_occurrences` runs **again** for the same window, Then no new occurrence, Task, pending row, or notification is created (idempotency). | pgTAP |
| **AC-003** | Given a template whose job-function role has **zero** current holders, When the occurrence spawns, Then **no Task** is created and one `occurrence_pending_assignments` row with `reason='vacant_role'` (+ an Inbox notification to A and R) exists. | pgTAP |
| **AC-004** | Given a template whose job-function role has **two** current holders, When the occurrence spawns, Then no Task is created and a pending row with `reason='ambiguous_holder'` and both ids in `candidate_person_ids` exists (no holder auto-picked). | pgTAP |
| **AC-005** | Given a pending `ambiguous_holder` row, When a human calls `resolve_pending_assignment` with one candidate, Then a `mos.tasks` row (PIC = chosen candidate, `occurrence_id` set) is created and `resolved_task_id/by/at` are stamped; a second call is a no-op. | pgTAP |
| **AC-006** | Given `resolve_pending_assignment` is called with a person **not** in `candidate_person_ids`, Then it is rejected (no Task created). | pgTAP |
| **AC-007** | Given a template with `supervisor_mode='inherit_a'`, When its Task spawns, Then the Task Supervisor = the definition's A. | pgTAP |
| **AC-008** | Given a template with `supervisor_mode='override'`, When its Task spawns, Then the Task Supervisor = `supervisor_override_person_id`. | pgTAP |
| **AC-009** | Given a definition edited (version bumped) **after** an occurrence exists, When the definition changes, Then the existing occurrence's `definition_snapshot`, `definition_version`, and spawned Tasks are unchanged. | pgTAP |
| **AC-010** | Given the spawner missed a window older than the catch-up horizon, When it runs, Then that stale window is **not** spawned (only in-horizon windows are). | pgTAP |
| **AC-011** | Given a batch with one malformed definition among valid ones, When the spawner runs, Then valid definitions still spawn and the RPC returns (the bad one is skipped, not fatal). | pgTAP |
| **AC-012** | Given org A and org B each with a definition, When org A's context reads `process_definitions`/`process_occurrences`/`pending_assignments`/`occurrence_rollup`, Then only org-A rows are visible (RLS isolation). | pgTAP |
| **AC-013** | Given a non-admin/non-ops_lead member, When they attempt to INSERT/UPDATE a `process_definition` or `process_task_template`, Then it is denied; an admin/ops_lead succeeds. | pgTAP |
| **AC-014** | Given a member tries to INSERT a `process_occurrences` row directly (no definer), Then it is denied (occurrences are spawner-written only). | pgTAP |
| **AC-015** | Given a template references a role/BU/person from **another org**, When it is inserted, Then the cross-org guard raises `23514`. | pgTAP |
| **AC-016** | Given an occurrence with 3 child Tasks (2 Done, 1 Open, none archived), When the roll-up is read, Then `task_total=3, done=2, is_complete=false, progress_pct≈0.67`; when all 3 are Done, `is_complete=true`. | pgTAP |
| **AC-017** | Given a `weekly` definition with `dow=[3]` (Wed), When the occurrence-key function is evaluated for a WIB Wednesday vs the same instant read as UTC, Then the key is the WIB-week token and is stable/deterministic (no UTC-boundary drift). | pgTAP |
| **AC-018** | Given a `manual` definition, When `spawn_due_occurrences` runs, Then no occurrence is auto-created for it. | pgTAP |
| **AC-019** | Given an attempt to UPDATE an occurrence's `definition_snapshot`/`caption` or a template/definition `created_by`/`org_id`, Then the immutability guard raises `42501`. | pgTAP |
| **AC-020** | Given the app-facing occurrence-caption formatter (`deriveOccurrenceCaption(cadence, date)`), When called with each cadence kind, Then it returns the human caption used at spawn (pure function). | Unit |
| **AC-021** | Given the app-facing roll-up progress mapper (turning `occurrence_rollup` row → UI progress shape), When given boundary counts (0 tasks, all done, mixed), Then it yields the correct `is_complete`/`progress_pct` display values. | Unit |

## 10. ADR — decisions the schema ADR MUST capture (eng-planner authors; this spec enumerates)

The deferred **OD-REDESIGN-11 schema ADR** (`docs/adr/00XX-process-occurrence-schema.md`) must record:

1. **Definition layer placement** — new `mos.process_definitions` *linked to* `mos.work_lines` vs
   folding cadence/version onto `work_lines` (RATIFY-1). Rationale for a separate spawnable layer.
2. **Job-function binding** — job function = `shared.roles` (+ optional BU narrowing) vs a
   role+explicit-Team-scope pair (blocked on a Teams table, RATIFY-1/2). Why `roles` is sufficient now.
3. **Occurrence identity & idempotency** — `occurrence_key` derivation per cadence and the
   `unique (definition, key)` + `ON CONFLICT DO NOTHING` contract (RATIFY-3 multi-day-per-week form).
4. **Version snapshot** — snapshot-at-spawn semantics (immutable `definition_snapshot`); what bumps
   `version` (RATIFY-4); D18/D40 alignment (no retro-rewrite of materialised occurrences); the
   deferred publish→adopt→upgrade transaction boundary.
5. **Task-vs-Checklist boundary at generation** (OD-REDESIGN-12) — template = one Task; checklist items
   = lightweight steps; Standard Steps/Checks/Exceptions deferred.
6. **PIC ambiguity policy** (OD-41) — 0/1/>1 holder rules; the pending-assignment queue; *no Task with
   a guessed PIC* (grounded in `mos.tasks.responsible_person_id NOT NULL`).
7. **Supervisor resolution** (OD-REDESIGN-14/41) — inherit-A default, override, manager-fallback,
   self-supervise; ambiguous-Supervisor handling (RATIFY-7).
8. **Scheduling substrate** — external VPS cron → SECURITY DEFINER RPC (reporting-snapshot pattern)
   vs `pg_cron` (RATIFY-6); the catch-up horizon / missed-window policy (RATIFY-5).
9. **RLS posture** — occurrences/pending as definer-written execution records; definitions/templates as
   admin/ops_lead catalog; the resolve capability gate (RATIFY-9).
10. **Roll-up as derived read-model** — completion never stored (drift-free); view vs function.

## 11. RATIFY-BEFORE-MERGE (conservative default taken; owner/Director ratifies)

- **RATIFY-1 — Definition table vs fold onto `work_lines`.** *Default:* a **separate**
  `mos.process_definitions` with a nullable `work_line_id` link. *Alt:* add cadence/version/RACI columns
  onto `mos.work_lines`. *Recommendation:* keep separate — reversible, non-destructive to the shipped
  catalog, and `work_lines` has no BU/RACI today; fold later if the catalog and the spawnable definition
  prove 1:1.
- **RATIFY-2 — Job-function scope granularity.** *Default:* `pic_job_function_role_id` (role) + optional
  `pic_scope_business_unit_id` narrowing. *Alt:* add an explicit Team-scope column (blocked — **no Teams
  table exists**). *Recommendation:* ship role + optional BU narrowing now; add Team scope additively when
  a Teams table lands (CONTEXT's "Team" is currently modelled via role BU + reporting chain).
- **RATIFY-3 — Weekly multi-day occurrence-key form.** *Default:* one occurrence **per configured day**,
  key = ISO-week token **+ dow**. *Alt:* one occurrence per ISO week regardless of `dow` count.
  *Recommendation:* per-day (matches "daily opening on Mon/Wed/Fri" intuition; each day is its own run).
- **RATIFY-4 — What bumps `version`.** *Default:* any edit to **spawn-affecting** structure (cadence,
  templates, job-function bindings) bumps `version`; cosmetic edits (name/description) do not. *Alt:* every
  edit bumps. *Recommendation:* spawn-affecting only — keeps the snapshot meaningful without version churn.
- **RATIFY-5 — Missed-window catch-up horizon.** *Default (most conservative):* spawn only windows within
  the **same WIB day** as `p_now`; older missed windows are logged + skipped, **never backfilled**. *Alt:*
  a configurable N-day horizon, or full backfill. *Recommendation:* same-day only — avoids a
  spawn-storm/duplicate-work flood after an outage; widen later if a real need appears.
- **RATIFY-6 — Scheduling substrate.** *Default:* **external VPS cron → SECURITY DEFINER RPC** (reuse the
  `reporting_snapshot.py` dedicated-role pattern, already operating at 03:30 WIB). *Alt:* in-DB `pg_cron`.
  *Recommendation:* external cron — no new DB extension, matches the shipped snapshot job, keeps scheduling
  observable/outside RLS.
- **RATIFY-7 — Ambiguous Supervisor: defer vs block.** *Default:* create the Task with its resolved PIC and
  raise an `ambiguous_supervisor` pending row (work proceeds; oversight is chased). *Alt:* block the Task
  until the Supervisor is chosen. *Recommendation:* defer — a definition's A is NOT NULL so this path is
  rare (only the ad-hoc manager fallback); blocking work on a supervisory ambiguity is heavier than the OD
  requires.
- **RATIFY-8 — Pending-assignment notification audience.** *Default:* definition **A + R** only. *Alt:*
  additionally a Team supervisor (needs a Teams table). *Recommendation:* A+R now; extend when Teams land.
- **RATIFY-9 — Who may resolve a pending assignment.** *Default (fail-closed):* the definition **A or R**,
  or **admin/ops_lead**, enforced inside `mos.resolve_pending_assignment` (definer). *Alt:* any authorised
  manager of the candidate. *Recommendation:* A/R + admin/ops_lead — the smallest set that owns the
  definition; widen via capability later.
- **RATIFY-10 — Standard/Check richness at generation.** *Default:* templates carry **checklist items
  only**; typed Standard Steps → Checks/forms/evidence are deferred (OD-REDESIGN-12 permits a checklist-only
  first cut). *Alt:* model Checks now. *Recommendation:* defer — keeps step 6 to the spawner foundation; the
  Café retrofit (step 7) and a later Standards step add the richer typed steps additively.
```
