# Spec — Tasks + lightweight RACI (P2-1)

- Feature: `mos.tasks` entity end-to-end — schema + RLS + data layer + Tasks list page + Task detail
  page + create/edit/archive flows + RACI fields + checklist items + auto change-events.
- Status: Draft for owner sign-off.
- Authority: business rules are **pre-decided** in `docs/decisions.md` **OD-P2-1..9** (LOCKED 2026-06-11)
  plus OD-DIR-5, OD-P0-8/9, OD-P1-3 (read posture), OD-P1-7 (union manager chain), OD-P1-4 (WIB time).
  This spec **encodes**, it does not re-open them. Each rule cites its OD id inline.
- UI authority (SIGNED): `docs/design-mockups/mock-tasks-list.html` + `docs/design-mockups/mock-task-detail.html`.
- Architecture: ADR-0003 (cascade-ready task entity — flat now, additive bridge later).
- Vocabulary: `CONTEXT.md` (Task, Checklist item, Status, Archived, Responsible/Accountable/Consulted/
  Informed, Activity, Business Unit, Manager — used **exactly**).

## Out of scope (explicit non-goals)
- **Comments / free-text thread** — deferred to **P2-1b** (OD-P2-8). P2-1 logs only *auto change-events*.
- **Cascade upward-link** (`output_id` / objective bridge) — deferred, additive later (OD-P2-9, ADR-0003).
- **Weekly updates, ops events, My Week home** — separate Phase-2 issues. (The My Week home already
  reads R-or-A tasks per OD-P0-8; this spec owns the **Tasks** surface, not the home.)
- **Nested tasks / `parent_task_id`** — subtasks are checklist items, never nested tasks (OD-P2-7).
- **RACI matrix UI** — fields only, no matrix until usage shows the shape (OD-DIR-5).
- **People-write / admin UI** — directory is read-only here (P1 posture).

---

## 1. Overview & user value

Gordi managers and selected ops users need one fast, org-wide place to see **who owns what**, what
state it is in, and what is overdue — replacing the dormant Notion Management OS Tasks DB. A **Task**
is the unit of owned work (CONTEXT.md): it always carries a Responsible (R) and Accountable (A) person,
a Business Unit, and a Status. Tasks are **org-readable** (cross-unit visibility is the product,
OD-P1-3); writes are gated to the people answerable for the work (R / A / their manager, OD-P2-3).
The Task is also the **cascade-bridgeable unit** (OD-P2-9) — shaped so the larger MOS grows in later
without reshaping it.

Primary jobs:
- **Create** a task in seconds (any member; creator pre-filled as R+A; only Title + Business Unit
  required) — OD-P2-2.
- **Scan** the org's tasks in one dense, sortable, filterable list — overdue first — OD-P0-8.
- **Drive** a task on its detail page: change status inline, edit R/A/C/I, tick off checklist items —
  with every write auto-logged to an activity trail that surfaces as a "last activity" age.
- **Archive** (not delete) work that is decided-against or finished-with — reversible, no data ever
  destroyed (OD-P2-3, CONTEXT.md "Archived").

---

## 2. Domain model & vocabulary (CONTEXT.md — used exactly)

| Term | Meaning in this spec |
|---|---|
| **Task** | A `mos.tasks` row. Carries org_id, title, business_unit_id, status, R, A, C[], I[], description, due_date, last_activity_at, archived_at. The only first-slice work entity. |
| **Checklist item** | A `mos.task_checklist_items` row (label + is_done + position). No RACI/status/BU/due of its own. a.k.a. "subtask" in conversation (OD-P2-7). |
| **Status** | One of **Open · In Progress · Blocked · Done** (OD-P2-1). Default Open. "Decided not to do" = archive, not a status. |
| **Archived** | Soft-removed via `archived_at` timestamp; hidden from default lists, findable by filter, reversible. No hard delete (CONTEXT.md, OD-P2-3). |
| **Responsible (R)** | The one person doing the task; the list "Owner" column. Single FK, required. |
| **Accountable (A)** | The single person answerable for the outcome; may equal R (OD-P2-4). Single FK, required. |
| **Consulted (C) / Informed (I)** | People whose input is sought / who are kept in the loop. Multi-person `uuid[]`, visible on detail only (OD-P2-5). |
| **Activity** | The task's last-any-write timestamp (`last_activity_at`), shown as an age ("3h"/"4d"). Touched by status change, RACI/field edit (OD-P0-9b, OD-P2-8). |
| **Business Unit** | One of Gordi's five operating areas (OD-P1-5). Every task belongs to one. FK to `shared.business_units`. |
| **Manager** | A person holding a role strictly above (any of) the target's roles, via the union chain (`shared.is_manager_of`, OD-P1-7). |

---

## 3. Data model

### 3.1 `mos.tasks` (OD-P2-1/4/5/6/9, ADR-0003)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | Stable cascade-bridgeable identity (ADR-0003). |
| `org_id` | uuid NOT NULL, FK `shared.orgs(id)`, default `shared.current_org_id()` | Org seam; server-stamped, client-unspoofable (OD-P1-1). |
| `title` | text NOT NULL, `CHECK (btrim(title) <> '')` | Required (OD-P2-2). |
| `business_unit_id` | uuid NOT NULL, FK `shared.business_units(id)` | Required (OD-P2-2). |
| `status` | text NOT NULL default `'Open'`, `CHECK (status IN ('Open','In Progress','Blocked','Done'))` | Lean-4 as text+CHECK, not a PG enum (OD-P2-1). |
| `responsible_person_id` | uuid NOT NULL, FK `shared.people(id)` | R, required (OD-DIR-5, OD-P2-2). |
| `accountable_person_id` | uuid NOT NULL, FK `shared.people(id)` | A, required; **MAY equal R** (OD-P2-4). |
| `consulted_person_ids` | uuid[] NOT NULL default `'{}'` | C array (OD-P2-5). |
| `informed_person_ids` | uuid[] NOT NULL default `'{}'` | I array (OD-P2-5). |
| `description` | text | Optional. |
| `due_date` | date | Plain DATE, no time-of-day; overdue computed in WIB (OD-P2-6). |
| `last_activity_at` | timestamptz NOT NULL default `now()` | Last-any-write; driven by `mos.task_events` (OD-P0-9b, OD-P2-8). |
| `archived_at` | timestamptz | Soft-archive marker; NULL = active (OD-P2-3, CONTEXT.md). |
| `created_by` | uuid NOT NULL, FK `shared.people(id)` | The creating person (audit + create-event author). |
| `created_at` / `updated_at` | timestamptz NOT NULL default `now()` | `updated_at` via `shared.set_updated_at()` trigger (P1 pattern). |

Indexes: `(org_id)`; `(business_unit_id)`; `(status)`; `(due_date)`; `(responsible_person_id)`;
`(accountable_person_id)`; GIN on `consulted_person_ids` and `informed_person_ids` (array-contains
filters); partial `(org_id) WHERE archived_at IS NULL` for the default list.

> **NOTE (ADR-0003):** no `parent_task_id`, no `output_id` / `objective_id`, no `type`/`lane` column.
> The future cascade bridge lands as an additive nullable FK later — not in P2-1.

### 3.2 `mos.task_checklist_items` (OD-P2-7)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `org_id` | uuid NOT NULL, FK `shared.orgs(id)`, default `shared.current_org_id()` | Org seam (RLS scoping). |
| `task_id` | uuid NOT NULL, FK `mos.tasks(id)` **ON DELETE CASCADE** | Child of a task. |
| `label` | text NOT NULL, `CHECK (btrim(label) <> '')` | The step text. |
| `is_done` | boolean NOT NULL default `false` | Done flag. |
| `position` | integer NOT NULL | Order within the task (reorder support). |
| `created_at` / `updated_at` | timestamptz NOT NULL default `now()` | |

> No RACI/status/BU/due of its own; does not bridge into the cascade (OD-P2-7). Archives trivially
> with its parent task (parent's `archived_at` hides both; no separate cascade-archive question).

### 3.3 `mos.task_events` (auto change-log — OD-P2-8, OD-P0-9b)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `org_id` | uuid NOT NULL, FK `shared.orgs(id)`, default `shared.current_org_id()` | Org seam. |
| `task_id` | uuid NOT NULL, FK `mos.tasks(id)` **ON DELETE CASCADE** | |
| `actor_person_id` | uuid NOT NULL, FK `shared.people(id)` | Who made the change. |
| `event_type` | text NOT NULL, `CHECK (event_type IN ('created','status_changed','field_edited','raci_edited','archived','unarchived'))` | The change kind. |
| `from_value` / `to_value` | text | e.g. status `Open` → `In Progress`; nullable for non-transition events. |
| `created_at` | timestamptz NOT NULL default `now()` | The event time; drives `tasks.last_activity_at`. |

> **Free-text comments are NOT this table** — comments are P2-1b (OD-P2-8). `task_events` is the
> *auto* change-log only; the detail "Activity & updates" thread renders these events in P2-1, with
> the comment composer arriving in P2-1b.

### 3.4 `last_activity_at` maintenance
Every insert into `mos.task_events` sets the parent task's `last_activity_at` to the event's
`created_at`. Implemented as an `AFTER INSERT` trigger on `mos.task_events` so a single canonical
timestamp is maintained server-side regardless of write path (OD-P0-9b — "one canonical timestamp").
`task_events` rows are emitted by the data layer on each mutating operation (create / status change /
field edit / RACI edit / archive / unarchive).

---

## 4. Functional requirements (EARS)

### Schema & invariants
- **FR-001** The system shall persist a task as a `mos.tasks` row with the columns of §3.1, `status`
  defaulting to `Open` and constrained by `CHECK` to {Open, In Progress, Blocked, Done} (OD-P2-1).
- **FR-002** The system shall require `title` (non-blank), `business_unit_id`, `responsible_person_id`,
  and `accountable_person_id` to be non-null on every task row (OD-P2-2/DIR-5).
- **FR-003** The system shall allow `accountable_person_id` to equal `responsible_person_id` with no
  separation-of-duties constraint (OD-P2-4).
- **FR-004** The system shall store Consulted and Informed as `uuid[]` columns
  (`consulted_person_ids`, `informed_person_ids`), each defaulting to the empty array (OD-P2-5).
- **FR-005** The system shall store `due_date` as a plain `date` (no time-of-day) (OD-P2-6).
- **FR-006** The system shall stamp `org_id` server-side from `shared.current_org_id()` and reject any
  client-supplied `org_id` differing from the session org (OD-P1-1).
- **FR-007** The system shall store a checklist item as a `mos.task_checklist_items` row carrying only
  `label`, `is_done`, `position`, and `task_id` — with no RACI, status, business unit, or due date,
  and with no `parent_task_id` self-relation on tasks (OD-P2-7, ADR-0003).

### Create (OD-P2-2)
- **FR-010** When any org member creates a task, the system shall set both `responsible_person_id` and
  `accountable_person_id` to the creator by default, each editable on the create form (OD-P2-2).
- **FR-011** When the create form opens, the system shall default `business_unit_id` to the creator's
  **primary role's** business unit — the earliest-assigned role (the AS-2 rule; deterministic for
  dual-hats) — editable before submit (OD-P2-2).
- **FR-012** Where Title or Business Unit is empty, the system shall block submission and surface a
  field-level validation message (OD-P2-2).
- **FR-013** When a task is created, the system shall set `created_by` to the creator, set
  `last_activity_at` to creation time, and emit a `created` `task_event` (OD-P2-8).
- **FR-014** The system shall treat due date, description, Consulted, Informed, and checklist items as
  optional at create time (OD-P2-2).

### Read / list (OD-P1-3, OD-P0-8)
- **FR-020** The system shall make every task **org-readable** to org members — readable across all
  business units, not only the viewer's own (OD-P1-3, "cross-unit visibility is the product").
- **FR-021** Where a task belongs to a different org than the session, the system shall make it
  unreadable (org isolation, OD-P1-1).
- **FR-022** The system shall render each list row with: title + business-unit subline, status pill,
  Owner = R avatar + first name + "+N" overflow, due date, and last-activity age (OD-P0-8, OD-P0-9b,
  mock-tasks-list).
- **FR-023** The system shall colour the due cell: **red/"Overdue"** when `due_date` < today-in-WIB,
  **amber/"soon"** when `due_date` is within 3 days (≤3d) of today-in-WIB, otherwise muted/calm
  (OD-P2-6, OD-P0-7).
- **FR-024** The system shall provide filters for **Business Unit**, **Status**, and **Person**, plus a
  segmented **Mine / RACI-involved / All** ownership control (mock-tasks-list):
  - *Mine* = viewer is R **or** A.
  - *RACI-involved* = viewer is R, A, in `consulted_person_ids`, or in `informed_person_ids`.
  - *All* = every org-readable task.
- **FR-025** The system shall **hide archived tasks by default** and expose them only via an explicit
  "archived" filter toggle (CONTEXT.md "Archived", OD-P2-3).
- **FR-026** The system shall sort the list by **due date ascending (overdue first)** on first paint,
  with sortable column headers (mock-tasks-list default sort).
- **FR-027** When the list query is in flight, the system shall render skeleton rows; when it resolves
  to zero rows under the active filter, the system shall render the empty state with a "+ New task"
  affordance; when it errors, the system shall render an inline "Couldn't load tasks — Retry" banner
  while keeping the toolbar/header usable (mock-tasks-list states).

### Detail (OD-P2 + mock-task-detail)
- **FR-030** The system shall render a task detail page showing title, status pill, due date, business
  unit, last-activity age, description, full R/A/C/I person fields, checklist, and the activity event
  log (mock-task-detail).
- **FR-031** When an authorised editor changes status on the detail page, the system shall apply it
  **inline** (no view switch / navigation) and reflect the new pill in place (mock-task-detail IxD).
- **FR-032** The system shall render the full Responsible, Accountable, Consulted, and Informed person
  fields on the detail surface (progressive disclosure — collapsed to R + "+N" on the list only)
  (OD-P0-7, mock-task-detail).
- **FR-033** The system shall let an authorised editor add and remove Consulted and Informed people
  (array membership edits) on the detail page (OD-P2-5, OD-P2-3).
- **FR-034** The system shall render the activity log as the auto change-events for the task
  (status changes, field/RACI edits, create, archive/unarchive), newest first, each showing actor +
  age + the from→to transition where applicable (OD-P2-8). *(Free-text comments are P2-1b.)*

### Checklist (OD-P2-7)
- **FR-040** When an authorised editor adds a checklist item, the system shall persist it with the next
  `position` and `is_done = false` (OD-P2-7).
- **FR-041** When an authorised editor toggles a checklist item, the system shall persist `is_done` and
  emit a `field_edited` task_event so the task's `last_activity_at` advances (OD-P2-7, OD-P0-9b).
- **FR-042** When an authorised editor reorders checklist items, the system shall persist the new
  `position` ordering (OD-P2-7).

### Edit / archive — write gating (OD-P2-3, OD-P1-7)
- **FR-050** The system shall permit **edits** to a task's fields, status, RACI, and checklist only to:
  the task's **R**, its **A**, or a **manager-of (R or A)** via the union chain
  (`shared.is_manager_of`, OD-P1-7) — all others are denied (OD-P2-3).
- **FR-051** The system shall permit **archiving** a task (setting `archived_at`) only to the task's
  **A** or a **manager-of (R or A)** — not to a non-A Responsible person (OD-P2-3).
- **FR-052** The system shall make archive **reversible** (clearing `archived_at`, "unarchive"),
  gated identically to archive (A or manager), and shall require **no reason** (OD-P2-3).
- **FR-053** The system shall provide **no hard-delete** path for tasks to any application role; rows
  are never destroyed (OD-P2-3, CONTEXT.md "Archived").
- **FR-054** When a task is archived or unarchived, the system shall emit an `archived` /
  `unarchived` task_event and advance `last_activity_at` (OD-P2-8).
- **FR-055** When a task is edited, the system shall emit the corresponding `status_changed` /
  `field_edited` / `raci_edited` task_event recording actor and from→to where applicable, advancing
  `last_activity_at` (OD-P2-8, OD-P0-9b).
- **FR-056** Where the editing person is not R, A, or a manager-of-(R or A), the system shall hide or
  disable write affordances in the UI (status changer, RACI edit, checklist edit, archive) while still
  showing the task read-only (OD-P1-3 read / OD-P2-3 write).

---

## 5. Non-functional requirements

- **NFR-001 (Security — RLS).** Every `mos` business table (`tasks`, `task_checklist_items`,
  `task_events`) shall have RLS **enabled and forced**, with SELECT org-scoped to
  `shared.current_org_id()` and writes gated per §4 — provable in pgTAP (OD-P1-3, P1 RLS pattern).
- **NFR-002 (Security — no standing delete).** No application role (`authenticated`) shall hold a
  DELETE grant on `mos.tasks`; archive is the only removal path (OD-P2-3).
- **NFR-003 (Security — unspoofable org).** A client shall not be able to write a row with an `org_id`
  other than its session org, even given an INSERT/UPDATE grant (WITH CHECK `org_id = current_org_id()`)
  (OD-P1-1).
- **NFR-004 (Time correctness).** Overdue/soon computation shall use Asia/Jakarta (WIB, UTC+7, no DST)
  day boundaries, reusing the `mos-app/src/lib/week.ts` fixed-offset pattern — no host-timezone leakage
  (OD-P1-4, OD-P2-6).
- **NFR-005 (Performance).** The default Tasks list (active, org-scoped, due-ascending) shall be served
  by indexed columns (§3.1) and paint within interactive budget for ~hundreds of org tasks.
- **NFR-006 (Reversibility).** The migration shall be reversible (drop tables/triggers cleanly) and
  follow the existing migration conventions (schema-qualified, `set search_path = ''` on functions).
- **NFR-007 (Vocabulary fidelity).** UI copy, column names, and code identifiers shall use CONTEXT.md
  terms exactly (Owner = R; "Archived" not deleted; Status set is the lean 4; Activity = last-any-write).
- **NFR-008 (Design fidelity).** The list and detail surfaces shall match the signed mockups'
  composition, density (54px list rows, single ~1080px detail column), tinted-status pills, and the
  R/A/C/I role-chip set, using only DESIGN.md tokens (OD-DIR-8, OD-P0-7).
- **NFR-009 (i18n posture).** Chrome/labels in English; user content (title, description) in Indonesian
  rendered as-is — no i18n framework (OD-P0-2).
- **NFR-010 (Coverage / gates).** Changed code shall meet the binding gates: ≥80% lines, `npm run
  typecheck` clean, ESLint `--max-warnings=0`; each `AC-###` proven at its lowest sufficient layer.

---

## 6. Acceptance criteria (Given/When/Then) — each tagged with its owning test layer

> **Test-pyramid rule (CLAUDE.md):** each `AC-###` is owned by **one** test at the **lowest sufficient
> layer**. RLS read/write/archive contracts → **pgTAP** (the bulk). List/detail component states,
> filters, RACI rendering, overdue calc, checklist UI → **Unit (Vitest/RTL)**. Real cross-stack
> journeys → **E2E (Playwright)**, curated, 2 only. The AC id is tagged in the owning test's title so
> `grep -r AC-###` finds the proof.

### RLS — read posture & org isolation → **pgTAP**
- **AC-001 [pgTAP]** Given a task owned by another org member in business unit X, When the viewer (an
  org member in a different BU, not in any RACI role) selects it, Then the row is returned
  (org-readable; cross-unit visibility) — FR-020.
- **AC-002 [pgTAP]** Given a task whose `org_id` is a different org, When a member of the session org
  selects it, Then zero rows are returned — FR-021, NFR-001.
- **AC-003 [pgTAP]** Given checklist items and task_events for a task in the session org, When an org
  member selects them, Then they are returned; for a different-org task's children, zero rows —
  NFR-001.

### RLS — create → **pgTAP**
- **AC-010 [pgTAP]** Given an authenticated org member, When they insert a task with Title + BU + R + A,
  Then the insert succeeds and `org_id` is stamped to their session org — FR-006, FR-010.
- **AC-011 [pgTAP]** Given an authenticated org member, When they attempt to insert a task with
  `org_id` set to a foreign org, Then the insert is rejected by the WITH CHECK predicate — FR-006,
  NFR-003.
- **AC-012 [pgTAP]** Given an insert attempt, When `status` is a value outside {Open, In Progress,
  Blocked, Done} or `title` is blank, Then the CHECK constraint rejects it — FR-001, FR-002.

### RLS — edit gate (R / A / manager) → **pgTAP**
- **AC-020 [pgTAP]** Given a task, When its **R** updates status/fields/RACI, Then the update succeeds — FR-050.
- **AC-021 [pgTAP]** Given a task, When its **A** (distinct from R) updates it, Then the update succeeds — FR-050.
- **AC-022 [pgTAP]** Given a task, When a **manager-of-R** (via `is_manager_of`, union chain) updates
  it, Then the update succeeds — FR-050, OD-P1-7.
- **AC-023 [pgTAP]** Given a task, When a **manager-of-A** (R and A differ) updates it, Then the update
  succeeds — FR-050.
- **AC-024 [pgTAP]** Given a task, When an org member who is **neither R, A, nor a manager of either**
  attempts any update, Then it is denied (0 rows affected) — FR-050.
- **AC-025 [pgTAP]** Given a task where **A = R** (same person), When that person updates it, Then it
  succeeds — FR-003, FR-050.
- **AC-026 [pgTAP]** Given a task, When an authorised editor adds/removes a person id in
  `consulted_person_ids` / `informed_person_ids`, Then the array update persists; and a C/I-only member
  (not R/A/manager) attempting the same edit is denied — FR-033, FR-050.

### RLS — archive / no hard delete → **pgTAP**
- **AC-030 [pgTAP]** Given a task, When its **A** sets `archived_at`, Then archive succeeds — FR-051.
- **AC-031 [pgTAP]** Given a task, When a **manager-of-(R or A)** archives it, Then it succeeds — FR-051.
- **AC-032 [pgTAP]** Given a task, When its **R (who is not A and not a manager)** attempts to archive,
  Then it is denied — FR-051.
- **AC-033 [pgTAP]** Given an archived task, When its A or a manager clears `archived_at` (unarchive),
  Then it succeeds and the row is active again — FR-052.
- **AC-034 [pgTAP]** Given any application role (`authenticated`), When a DELETE on `mos.tasks` is
  attempted, Then it is denied — there is no DELETE grant/policy — FR-053, NFR-002.

### RLS — checklist write gate → **pgTAP**
- **AC-040 [pgTAP]** Given a task, When its R/A/manager inserts, toggles, or reorders a checklist item,
  Then it succeeds; and a non-authorised org member attempting the same is denied — FR-040/041/042,
  FR-050.

### Activity events & last_activity_at → **pgTAP**
- **AC-050 [pgTAP]** Given a task, When a `status_changed` (or field/raci/archived) event is inserted,
  Then the parent task's `last_activity_at` advances to the event's `created_at` (trigger) — FR-055,
  §3.4, OD-P0-9b.
- **AC-051 [pgTAP]** Given a task is created via the create path, When the row lands, Then exactly one
  `created` task_event exists for it and `last_activity_at` equals its creation time — FR-013.

### List rendering, filters, sort, states → **Unit (Vitest/RTL)**
- **AC-060 [unit]** Given a list of tasks, When the Tasks page renders a row, Then it shows title +
  BU subline, status pill, R-avatar + first name + "+N" overflow, due date, and activity age — FR-022.
- **AC-061 [unit]** Given a task with `due_date` before today-WIB, Then its due cell renders red /
  "Overdue"; within 3 days → amber/"soon"; otherwise muted — FR-023, NFR-004.
- **AC-062 [unit]** Given the WIB overdue/soon helper, When fed a fixed clock and boundary dates
  (today, today−1, today+3, today+4), Then it classifies overdue/soon/calm correctly across the
  WIB day boundary with no host-tz leak — NFR-004, OD-P2-6.
- **AC-063 [unit]** Given tasks across BUs/statuses/people, When the viewer applies a Business Unit /
  Status / Person filter, Then only matching tasks render — FR-024.
- **AC-064 [unit]** Given the Mine / RACI-involved / All segmented control, When "Mine" is active, Then
  only tasks where the viewer is R or A render; "RACI-involved" adds tasks where the viewer is in C or
  I; "All" shows all loaded tasks — FR-024.
- **AC-065 [unit]** Given a mix of active and archived tasks, When the page first renders, Then
  archived tasks are hidden; When the archived toggle is on, Then they appear — FR-025.
- **AC-066 [unit]** Given the loaded list, When it first paints, Then rows are ordered by due date
  ascending (overdue first) — FR-026.
- **AC-067 [unit]** Given the list query, When it is loading → renders skeleton rows; resolves empty →
  renders the empty state with "+ New task"; errors → renders the inline "Couldn't load tasks — Retry"
  banner with toolbar still present — FR-027.

### Detail rendering, inline status, RACI, checklist → **Unit (Vitest/RTL)**
- **AC-070 [unit]** Given a task, When the detail page renders, Then it shows title, status pill, due,
  business unit, last-activity age, description, full R/A/C/I fields, checklist, and the activity log —
  FR-030, FR-032.
- **AC-071 [unit]** Given an authorised editor on detail, When they pick a new status from the inline
  status control, Then the pill updates in place without navigation and the mutation is dispatched —
  FR-031.
- **AC-072 [unit]** Given the detail RACI fields, When an editor adds/removes a Consulted or Informed
  person chip, Then the chip set updates and the array mutation is dispatched — FR-033.
- **AC-073 [unit]** Given a viewer who is not R/A/manager, When the detail renders, Then write
  affordances (status changer, RACI edit, checklist edit, archive) are hidden/disabled and the task is
  shown read-only — FR-056.
- **AC-074 [unit]** Given the checklist, When the editor adds an item, toggles done, or reorders, Then
  the UI reflects the new label/done/order and the mutation is dispatched — FR-040/041/042.
- **AC-075 [unit]** Given the activity log, When it renders, Then it lists the task's auto change-events
  newest-first with actor + age + from→to transition (no free-text comment composer in P2-1) — FR-034.

### Create flow (form-level) → **Unit (Vitest/RTL)**
- **AC-080 [unit]** Given the create form opens for a member, When it renders, Then R and A are
  pre-filled to the creator and Business Unit defaults to the creator's primary-role BU, all editable —
  FR-010, FR-011.
- **AC-081 [unit]** Given the create form, When Title or Business Unit is empty on submit, Then
  submission is blocked with a field-level validation message — FR-012.

### Curated end-to-end journeys → **E2E (Playwright)** — 2 only
- **AC-090 [e2e]** **Create → list → detail → status.** Given an authenticated member, When they create
  a task (Title + BU; R/A pre-filled to self), Then it appears in the Tasks list; When they open it and
  change status to "In Progress" inline, Then the list and detail reflect the new status and an activity
  event is recorded — FR-010/013/020/022/031/055.
- **AC-091 [e2e]** **Archive → leaves default list.** Given a task the viewer is A on, When they archive
  it from the detail page, Then it disappears from the default Tasks list and reappears only under the
  archived filter; no row is destroyed — FR-025/051/053.

---

## 7. Error handling

| Condition | Layer | Behaviour |
|---|---|---|
| Title or Business Unit empty on create | UI + DB CHECK | Field-level validation blocks submit (FR-012); DB CHECK is the backstop (AC-012). |
| Invalid `status` value | DB CHECK | Rejected by constraint (AC-012). |
| Non-R/A/manager attempts a write | RLS | Denied (0 rows); UI hides/disables the affordance first (FR-056, AC-024). |
| Non-A/manager attempts archive | RLS | Denied (AC-032). |
| Hard-delete attempt | RLS / grants | Denied — no DELETE path (AC-034). |
| Foreign `org_id` on write | RLS WITH CHECK | Rejected (AC-011). |
| Cross-org read | RLS USING | Zero rows (AC-002). |
| List query fails | UI | Inline "Couldn't load tasks — Retry" banner; toolbar stays usable (AC-067). |
| Detail sub-region (description/activity) fails | UI | Inline "Couldn't load — Retry" line; head + status action stay usable (mock-task-detail). |
| Empty list under active filter | UI | Empty state + "+ New task" affordance (AC-067). |

---

## 8. Implementation checklist (build order; TDD red-green per CLAUDE.md)

**Schema / DB (pgTAP red first):**
- [ ] Migration `mos.tasks` (§3.1) + indexes; reversible.
- [ ] Migration `mos.task_checklist_items` (§3.2) + `mos.task_events` (§3.3); FKs ON DELETE CASCADE.
- [ ] `AFTER INSERT` trigger on `task_events` → bump `tasks.last_activity_at` (§3.4); `set_updated_at`
      triggers on `tasks` and `task_checklist_items`.
- [ ] Base grants: SELECT to `authenticated` on all three; INSERT/UPDATE gated by policy; **no DELETE**.
- [ ] RLS: enable+force; SELECT org-scoped; INSERT WITH CHECK `org_id = current_org_id()`; UPDATE
      USING/WITH CHECK = R OR A OR `is_manager_of(R)` OR `is_manager_of(A)`; archive uses the same
      UPDATE policy but the archive *affordance* is A/manager-only (enforce A-or-manager for the
      `archived_at`-setting path — split policy or column-guard so a non-A R cannot set `archived_at`).
- [ ] pgTAP suite covering AC-001..AC-051 (new `supabase/tests/*.sql`, numbered after existing 10_).

**Data layer (`mos-app/src/lib/db/`):**
- [ ] `database.types.ts` regenerated for `mos.*`.
- [ ] tasks read (list with filters/sort), task+children read (detail), create, update (status/fields/
      RACI), archive/unarchive, checklist add/toggle/reorder — each emitting the right `task_event`.
- [ ] WIB overdue/soon classifier reusing `lib/week.ts` offset pattern (AC-062).

**UI (`mos-app/src/pages/` — to signed mockups, DESIGN.md tokens):**
- [ ] Tasks list page: toolbar (BU/Status/Person filters + Mine/RACI-involved/All segmented + archived
      toggle), sortable 5-col table, row rendering (Owner=R+N), due colouring, skeleton/empty/error
      states (AC-060..067).
- [ ] Task detail page: head + inline status changer, description, full R/A/C/I fields, checklist
      add/toggle/reorder, activity event log (AC-070..075).
- [ ] Create-task form: R/A pre-fill, primary-role BU default, required-field validation (AC-080/081).
- [ ] Read-only mode for non-editors (AC-073).

**E2E (`mos-app/e2e/` — 2 curated):**
- [ ] AC-090 create→list→detail→status; AC-091 archive→leaves-default-list.

---

## 9. Owner-decision flags
**None.** All business rules are pre-decided in OD-P2-1..9 (+ OD-DIR-5, OD-P0-8/9, OD-P1-3/4/7) and
encoded above with inline citations. No open `[OWNER-DECISION]` remains for P2-1.

> Implementation-detail note (not an owner decision): the archive gate (A/manager) is *narrower* than
> the general edit gate (R/A/manager) — FR-050 vs FR-051. The plan must enforce the archive-path
> restriction at the DB layer (so a non-A Responsible cannot set `archived_at` even though they can
> edit other fields). This is an `eng-planner` mechanism choice (split UPDATE policy vs trigger guard),
> not a reopened decision — OD-P2-3 already fixed the rule.
