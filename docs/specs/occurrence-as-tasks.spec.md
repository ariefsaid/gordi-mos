# Spec — Occurrence-as-Tasks (redesign buildout Step 6)

**Status:** DRAFT for the Step-6 full grill + owner walkthrough (`docs/plans/2026-07-14-redesign-buildout.md`
row 6). **Domain law is CLOSED** (OD-REDESIGN-1..66); this spec *derives* from it and never reopens it. Every
genuinely-ambiguous schema / RLS / spawn / resolution edge is resolved to the **most conservative, fail-closed**
option and tagged `RATIFY-BEFORE-MERGE:` inline (collected in §8).

> **Supersession note.** This replaces the earlier pre-ADR draft (FR-0xx numbering, an external-VPS-cron
> spawner, a separate `mos.process_definitions` table). Its two considered alternatives — a dedicated definition
> table and a cron-driven spawner — are **preserved as the recorded alternatives** in §8 RATIFY-1 / RATIFY-3, so
> nothing is lost; the conservative v1 default now follows the task brief's steer ("a deterministic, idempotent
> spawn that CAN run without external cron in v1") and ADR-0051.

**Authority chain:** `CONTEXT.md` (Process · Process Run · Standard · Check · Shift · PIC · Supervisor) →
`docs/decisions.md` OD-REDESIGN-11/12/13/14/40/41/53/54/58 + OD-12 + OD-41 →
`docs/adr/0025-…redesign-direction.md` D6/D18/D26/D27/D40 → `docs/adr/0051-occurrence-as-tasks-schema.md` (this
spec's schema decisions D1–D12) → `docs/experience-contract.md` Rules 1–12. **Binding prior art:**
`docs/adr/0050-signal-data-model-and-visibility.md` (the `shared.teams`/`shared.team_memberships` substrate) ·
`supabase/migrations/20260709000001_mos_follow_ups.sql` (the single-DEFINER-RPC gated-write idiom) ·
`supabase/migrations/20260624000001_mos_cascade_lookups.sql` (`mos.work_lines`) · the kitchen Module tables
(`ops.kitchen_plans`/`ops.kitchen_logs`) that Step 7 retrofits onto this spawner.

---

## 1. Overview

A **Process** is the permanent definition of recurring work (OD-REDESIGN-11, CONTEXT "Process"). Step 6 makes
each **occurrence** of a Process spawn concrete, owned **Tasks** into the one universal `/work/tasks` runtime,
while a **thin occurrence record** ("Process Run" — internal only, never UI vocabulary) owns that occurrence's
completion, history, and a **version snapshot** (OD-REDESIGN-58). Generated Task definitions bind their **PIC to
a job function** (Role + optional Team scope), resolved to the **current holder at spawn**; ambiguity requires a
**human choice** and is never guessed (OD-41). Occurrences surface as a **grouping caption** over their Tasks; a
**derived roll-up** reports per-occurrence progress (OD-REDESIGN-58).

Step 6 delivers: the process-definition extension (`mos.work_lines` + `mos.process_cadences` +
`mos.process_task_defs`); the thin occurrence record + pending human-choice queue (`mos.process_runs`,
`mos.process_run_pending_tasks`); the **deterministic, idempotent** spawn / resolve / complete RPCs; the
job-function→holder resolver; the derived roll-up + `due` read-model; fail-closed RLS; a DAL; and a **thin UI**
(a Start-run control over due occurrences, occurrence-caption grouping in the Tasks list, and a pending-PIC
resolution surface). It builds **nothing** in the kitchen tables (Step 7 seam — FR-611 note / ADR D11), and it
does **not** build the guided Process **designer** (OD-REDESIGN-13) or Standards/Checks (OD-REDESIGN-4/30/31).

**The Step-6 job sentences** (Rule 1): the manager/lead's *"Start today's recurring work and see it as tasks
someone owns."*; the resolver's *"Two people could own this — you pick who."*

### In scope
- Extend `mos.work_lines` (Process governance: `business_unit_id`, `accountable_person_id`,
  `responsible_person_id`, `definition_version`).
- `mos.process_cadences` (per-process recurrence) + `mos.process_task_defs` (generated Task templates with a
  job-function PIC binding + checklist steps).
- `mos.process_runs` (thin occurrence record: caption, period key, version snapshot, status) +
  `mos.process_run_pending_tasks` (ambiguity → human choice).
- New nullable provenance columns on `mos.tasks`: `process_run_id`, `generated_from_task_def_id`.
- `mos.spawn_process_run`, `mos.resolve_pending_task`, `mos.complete_process_run` (all `SECURITY DEFINER`,
  gated, cross-org-guarded); `mos._function_holders` resolver; `mos.can_start_process_for_team` helper.
- `mos.process_run_rollup` view + `mos.due_process_runs()` read-model (both `security_invoker`).
- Capabilities `process.start` (ops_lead+admin) / `process.adopt` (admin, reserved).
- DAL (`mos-app/src/lib/db/processes.ts`) + thin UI: Start-run control, occurrence-caption grouping in the Tasks
  list, pending-PIC resolution surface.

### Non-goals (explicitly deferred — do NOT fail these in review)
- **Guided Process designer** (authoring cadence/task-defs/Standard steps in-app) → OD-REDESIGN-13, later slice.
  v1 seeds definitions by migration/seed (as `business_units`/`work_lines` are).
- **Standards / Standard Steps / Checks / Exceptions / evidence / sign-off** quality loop → OD-REDESIGN-4/30/31.
- **Full OD-REDESIGN-41 manager-chain Supervisor resolution** → deferred; v1 resolves explicit → process A →
  PIC-self, editable (§8 RATIFY-4).
- **Background/scheduled spawning** (pg_cron / VPS cron / edge scheduler) + **auto-materialize-on-read** →
  deferred; v1 is explicit idempotent Start over a `due` read-model. The identical idempotent RPC is the seam a
  cron would later drive additively (§8 RATIFY-3).
- **Missed-window catch-up / backfill horizon** → not modeled in v1 (there is no auto-spawner to miss windows);
  it re-enters only if RATIFY-3 later adopts a scheduler.
- **Per-Team Process adoption + independent versioning** (OD-REDESIGN-54) → capability reserved, config deferred.
- **Café kitchen-log→occurrence bridge** (`ops.kitchen_logs.process_run_id`) → **Step 7** (ADR D11).
- **Task BU→Team re-home** → later; generated Tasks keep `business_unit_id` (derived from the owning Team's BU).
- **Auto-completion of a run** → deferred; completion is a deliberate human act (FR-610).

---

## 2. Data model

All ids `uuid`; timestamps `timestamptz` UTC; business day/week/period boundaries computed in **Asia/Jakarta**
(OD-P1-4). Schema `mos` for occurrence tables; the Team substrate is the ADR-0050 `shared.*`. Every new business
table: `org_id` defaulted from `shared.current_org_id()`, **RLS enabled + forced**, **no DELETE grant**.
Migrations reversible (manual DOWN; pre-prod `supabase db reset`). Exact DDL is in the plan
(`docs/plans/2026-07-16-occurrence-as-tasks.md`, Track A); this section is the contract.

### 2.1 `mos.work_lines` delta — Process governance (ADR D1)
Add nullable, additive: `business_unit_id uuid → shared.business_units` (BU derivation + manager chain),
`accountable_person_id uuid → shared.people` (Process **A** → Supervisor inheritance), `responsible_person_id
uuid → shared.people` (Process **R**), `definition_version int not null default 1` (bumped on generation-config
edit; snapshotted per run). Existing `type in ('project','process')`, `name`, `archived_at` unchanged.

### 2.2 `mos.process_cadences` — per-process recurrence (ADR D2 · one row per process)
`id` · `org_id` · `work_line_id uuid not null unique → mos.work_lines` · `cadence_kind text check in
('manual','daily','weekly','monthly')` · `cadence_config jsonb not null default '{}'` · `timezone text not null
default 'Asia/Jakarta'` · `anchor_date date` · `active boolean not null default true` · timestamps. Period-key
grains (WIB): daily `YYYY-MM-DD`, weekly `IYYY-"W"IW` (ISO Mon-start), monthly `YYYY-MM`, manual `YYYY-MM-DD`.

### 2.3 `mos.process_task_defs` — generated Task template (ADR D3)
`id` · `org_id` · `work_line_id uuid not null → mos.work_lines` · `title text not null check (btrim(title)<>'')` ·
`description text` · `position int not null default 0` · `due_offset_days int not null default 0` ·
`checklist_items jsonb not null default '[]'` (single-operator steps that stay inside one Task — OD-12) ·
`pic_person_id uuid → shared.people` · `pic_role_id uuid → shared.roles` · `pic_team_id uuid → shared.teams` ·
`supervisor_person_id uuid → shared.people` · `supervisor_role_id uuid → shared.roles` · `supervisor_team_id
uuid → shared.teams` · `archived_at` · timestamps. **CHECK** `pic_person_id is not null OR pic_role_id is not
null` (never an ownerless definition). Index `(work_line_id) where archived_at is null`.

### 2.4 `mos.process_runs` — the thin occurrence record (ADR D4)
`id` · `org_id` · `work_line_id uuid not null → mos.work_lines` · `owning_team_id uuid not null → shared.teams`
(adopting Team) · `period_key text not null` · `caption text not null` · `scheduled_date date not null` ·
`status text not null check in ('open','completed','cancelled') default 'open'` · `completed_at timestamptz` ·
`completed_by uuid → shared.people` · `definition_version int not null` · `spec_snapshot jsonb not null` ·
`started_by uuid → shared.people default shared.current_person_id()` · timestamps.
**Idempotency:** `unique(org_id, work_line_id, owning_team_id, period_key)`. Indexes `(org_id)`,
`(work_line_id)`, `(owning_team_id)`, `(org_id) where status = 'open'`. No stored roll-up counts (§2.8).

### 2.5 `mos.process_run_pending_tasks` — ambiguity human-choice queue (ADR D7 · OD-41)
`id` · `org_id` · `process_run_id uuid not null → mos.process_runs (on delete cascade)` · `task_def_id uuid not
null → mos.process_task_defs` · `candidate_person_ids uuid[] not null default '{}'` · `reason text not null
check in ('none','multiple')` · `resolved_at timestamptz` · `resolved_by uuid → shared.people` ·
`materialized_task_id uuid → mos.tasks` · `created_at`. Partial-unique one **unresolved** pending row per
(run, def): `unique(process_run_id, task_def_id) where resolved_at is null`. Index `(process_run_id) where
resolved_at is null`.

### 2.6 `mos.tasks` delta — occurrence provenance (ADR D10)
Add nullable `process_run_id uuid → mos.process_runs` + `generated_from_task_def_id uuid → mos.process_task_defs`
and indexes. Existing behavior/columns unchanged (both nullable; all shipped tasks unaffected). The
`mos._guard_task_cascade_refs` trigger is extended (create-or-replace) to assert `process_run_id` is same-org.

### 2.7 Generated Task shape (ADR D10 — the spawn contract)
A materialized Task is an ordinary `mos.tasks` row: `business_unit_id` = owning Team's BU
(`teams.business_unit_id`), `responsible_person_id` = resolved PIC, `accountable_person_id` = resolved
Supervisor, `status='Open'`, `work_line_id` = the process, `due_date = scheduled_date + due_offset_days`,
`created_by = started_by`, `process_run_id`/`generated_from_task_def_id` set. The def's `checklist_items` →
`mos.task_checklist_items` rows (reuse).

### 2.8 `mos.process_run_rollup` (view · `security_invoker`) + `mos.due_process_runs()` (ADR D9)
`process_run_rollup` keyed by `process_run_id`: `total`, `open`, `in_progress`, `blocked`, `done`, `overdue`
(WIB `due_date < today`), `pending_unresolved`, `completion_pct`. `due_process_runs()` returns each
active-cadence process whose current-period occurrence for the caller's authorized Teams is **not yet spawned**.
Both inherit base-table RLS.

---

## 3. RLS + authorization matrix (fail-closed; RPC-only run writes)

Definition tables are **org-readable** with authored writes; occurrence records are **org-readable** (D4/D6,
consistent with org-readable Tasks) with **RPC-only** writes (the follow-ups idiom). **No DELETE** anywhere.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `mos.work_lines` (delta) | org (unchanged) | admin/ops_lead (unchanged) | admin/ops_lead (unchanged) | none |
| `mos.process_cadences` | org-readable | `admin OR ops_lead`, org-pinned | `admin OR ops_lead` | none |
| `mos.process_task_defs` | org-readable | `admin OR ops_lead`, org-pinned | `admin OR ops_lead` | none |
| `mos.process_runs` | org-readable | **none** (RPC-only) | **none** (RPC-only) | none |
| `mos.process_run_pending_tasks` | org-readable | **none** (RPC-only) | **none** (RPC-only) | none |
| `mos.tasks` (generated) | org-readable (unchanged) | via spawn RPC (DEFINER) / any-member (unchanged) | `can_edit_task` (unchanged) | none |

**Write RPCs (all `SECURITY DEFINER`, `search_path=''`, `revoke … from public,anon,authenticated` + `grant …
to authenticated` — CI definer-revoke lint):**
- `mos.spawn_process_run(p_work_line_id, p_owning_team_id, p_target_date)` — load process+cadence → **cross-org
  guard** → gate `can('process.start') AND mos.can_start_process_for_team(p_owning_team_id)` → derive period key
  → `insert … on conflict (org,process,team,period) do nothing returning` (**idempotent**; existing ⇒ return it,
  generate nothing) → snapshot definition → per active `process_task_defs`: resolve PIC/Supervisor (§4) → **one
  holder ⇒ create Task** (+ checklist) ; **zero/many ⇒ pending row, no Task, no guess**.
- `mos.resolve_pending_task(p_pending_id, p_pic_person_id)` — cross-org guard → gate `can('process.start') AND
  can_start_process_for_team(run.owning_team_id)` → assert unresolved + `p_pic_person_id` is a candidate (or an
  authorized override) → materialize the Task → set `resolved_at`/`materialized_task_id`.
- `mos.complete_process_run(p_run_id)` — cross-org guard → same gate → set `status='completed'`,
  `completed_at`, `completed_by`; Tasks persist.
- `mos.can_start_process_for_team(p_team_id)` (`SECURITY INVOKER STABLE`) — `has_access_role('admin')` OR active
  membership of `p_team_id`.
- `mos._function_holders(p_org, p_role_id, p_team_id)` (`STABLE`) — current holders (person holds role in org
  AND, if team set, active member); **pinned to explicit `p_org`** so cross-org never resolves a holder.

**Capabilities** (`shared.role_capabilities`): `process.start` → **ops_lead + admin**; `process.adopt` →
**admin** (reserved). No `member` grant in v1 (RATIFY-5).

**Cross-org isolation** holds structurally: `org_id` defaulted + WITH-CHECK-pinned on every authored write; the
RPCs re-derive org from the loaded row + reject `org_id <> current_org_id()` before any gate or write;
`_function_holders(p_org,…)` is org-pinned; the idempotency unique key is `org_id`-scoped. A cross-org
Role/Team claim resolves **no** holder (fails closed → a pending row, never a wrong person).

---

## 4. Spawn / resolution semantics (the deterministic contract)

- **When:** explicit human **Start run** in v1 (no scheduler — ADR D6/RATIFY-3). `mos.due_process_runs()`
  populates the Start surface. Idempotency makes repeat Start safe.
- **Idempotency / at-most-once:** `unique(org, process, team, period_key)` + row-level `on conflict do nothing`;
  a second spawn of the same occurrence returns the existing run and generates **no** duplicate Tasks (NFR-602).
- **Version snapshot:** `definition_version` + `spec_snapshot` captured at spawn; later definition edits never
  alter a spawned run or its Tasks (OD-REDESIGN-11/14; FR-603/613).
- **PIC resolution:** explicit `pic_person_id` → job-function holder (**exactly one** ⇒ PIC). **Zero or many ⇒
  ambiguous ⇒ a pending row, never a Task, never a guess** (OD-41; FR-605). Holder = a person holding
  `pic_role_id` in the run's org AND, where `pic_team_id` is set, an *active* member of that Team
  (`shared.team_memberships`, effective-dated).
- **Supervisor resolution (shallow, v1):** explicit `supervisor_person_id` → `supervisor_role_id`+scope holder
  (if unique) → process `accountable_person_id` → **PIC self** (OD-REDESIGN-41 "same-person valid" / "PIC when
  no manager"); full manager-chain deferred (RATIFY-4). Supervisor stays editable (Reassign, OD-REDESIGN-62).
- **Ownership boundary (OD-12):** only `process_task_defs` rows become Tasks; a def's `checklist_items` become
  that Task's checklist items — single-operator steps stay inside one Task, never spawn extra Tasks (FR-608).
- **Turnover:** changing who holds a Role/Team changes **future** resolution only; already-spawned Tasks keep
  their historical PIC (FR-613).

---

## 5. UI contract (thin — Rule 11 reuse; no designer)

- **Start-run control** — surfaces `due_process_runs()` for the viewer; visible only to `process.start`-capable
  viewers; each due row shows the process name + occurrence caption + "Start"; Start calls `spawn_process_run`
  and reports `{created, pending}`. **No bare "Create"** (Rule 7) — the verb+object is **"Start run"** /
  **"Start today's opening"** (Step 7 reuses this). "Process Run" never appears (FR-611).
- **Occurrence grouping in `/work/tasks`** — the shipped Tasks DB-view (ADR-0007/0008) gains an occurrence
  **caption** group header for tasks carrying a `process_run_id` (reuse the existing `group-header-row` grammar;
  do not rebuild the table). The label is the run **caption**, never "Process Run".
- **Pending-PIC resolution surface** — lists unresolved `process_run_pending_tasks` for the occurrence with
  candidate people (or a full picker when `reason='none'`); selecting a person calls `resolve_pending_task` and
  the Task then appears in the group. Job sentence: *"Two people could own this — you pick who."*
- **Roll-up read** — the occurrence caption header shows `process_run_rollup` counts (done/total, overdue,
  N unresolved) — reuses the group-header count/overdue-subtotal affordance (OD-P3-6).

---

## 6. Requirements

### Functional (EARS)
- **FR-601** The system SHALL persist a Process definition's recurrence (a cadence: kind + WIB config) and its
  generated Task definitions, each binding PIC to an explicit person **or** a job function (Role + optional Team
  scope) (OD-REDESIGN-11/58).
- **FR-602** WHEN a process occurrence is started, the system SHALL create **at most one** Process Run per
  (process, owning Team, occurrence period); a repeat start SHALL return the existing run and SHALL NOT
  duplicate its Tasks (idempotent; OD-REDESIGN-11).
- **FR-603** WHEN a Process Run is created, the system SHALL snapshot the definition version + generated Task
  definitions so later definition edits do NOT alter that run or its already-generated Tasks (OD-REDESIGN-11/14).
- **FR-604** For each generated Task definition, WHEN the run spawns, the system SHALL resolve the PIC to the
  **current single holder** of its job function (holder = a person holding the Role in the org and, where a Team
  scope is set, an active member of that Team) (OD-REDESIGN-58).
- **FR-605** WHERE a job function resolves to **zero or more than one** current holder, the system SHALL NOT
  create a Task and SHALL NOT guess a PIC; it SHALL record a pending human-choice item with the candidates
  (OD-41).
- **FR-606** The system SHALL let an authorized human resolve a pending item by selecting a PIC, which SHALL
  materialize the generated Task with the chosen PIC and mark the item resolved; re-resolving a resolved item
  SHALL be rejected (OD-41).
- **FR-607** WHEN a generated Task is materialized, the system SHALL set its BU from the owning Team, its
  Supervisor by the resolution order (explicit override → process A → PIC-self), its Status to Open, its due
  date to `scheduled_date + offset`, and SHALL link it to the Process Run and the generating definition
  (OD-REDESIGN-12/14/40).
- **FR-608** The system SHALL materialize a definition's checklist steps as the Task's checklist items and SHALL
  create a separate Task only for a step that has its own definition — single-operator steps stay inside one
  Task (OD-12 / OD-REDESIGN-12).
- **FR-609** The system SHALL expose a **derived** per-occurrence roll-up (task counts by status, overdue,
  unresolved-pending, completion) WITHOUT storing counts on the run (OD-REDESIGN-58).
- **FR-610** The system SHALL let an authorized human mark a Process Run complete as a deliberate act (never
  auto-inferred); a completed run SHALL retain its Tasks and history (OD-REDESIGN-58).
- **FR-611** The system SHALL NOT surface "Process Run" as UI vocabulary; occurrences SHALL appear only as a
  grouping caption over their generated Tasks (OD-REDESIGN-58). *Step-7 seam: kitchen logs/plans map onto this
  occurrence model without a Step-6 kitchen-schema change (ADR D11).*
- **FR-612** The system SHALL compute which processes have a due, not-yet-spawned occurrence (cadence + WIB) for
  a Start surface, and SHALL NOT spawn via any background/scheduled job in v1 (no external-scheduler dependency).
- **FR-613** A change in who holds a Role/Team SHALL affect only future PIC resolution; already-spawned Tasks
  SHALL keep their historical PIC (OD-REDESIGN-58).
- **FR-614** Starting a run SHALL require `process.start` AND authorization over the owning Team; a **direct**
  INSERT/UPDATE of a Process Run or a pending item by an app user SHALL be denied (RPC-only).

### Non-functional
- **NFR-601** RLS **enabled + forced** on every new table; `org_id` defaulted + WITH-CHECK pinned; **no DELETE
  grant** anywhere; run/pending writes are RPC-only via `SECURITY DEFINER` functions that revoke PUBLIC execute.
- **NFR-602** Spawn SHALL be **idempotent and at-most-once** per occurrence key under retries and concurrency
  (row lock + `org_id`-scoped unique key + `on conflict do nothing`).
- **NFR-603** Holder resolution SHALL be **deterministic and org-walled**; a cross-org Role/Team SHALL resolve
  no holder (fails closed to a pending item, never a wrong person).
- **NFR-604** Migrations reversible (manual DOWN); pre-prod reset via `supabase db reset`; staging reset +
  deploy remain owner-gated (OD-34).
- **NFR-605** Coverage ≥80% changed lines; typecheck/lint zero; the review battery (incl. **mandatory
  security-auditor**, §7) + `pre-merge-check.sh` green before merge.

---

## 7. Security review scope (security-auditor is MANDATORY for this step)

This step adds a privileged spawn seam over owned work + tenancy-crossing resolution; the auditor (OWASP/STRIDE)
MUST cover:

1. **Spawn RPC (`mos.spawn_process_run`) — privilege + injection.** `SECURITY DEFINER` bypasses RLS: verify the
   in-function **cross-org guard** rejects `org_id <> current_org_id()` before any gate/write; the
   `can('process.start') AND can_start_process_for_team` gate cannot be bypassed by crafted params; the
   `on conflict` idempotency cannot be raced into duplicate Tasks (row lock); `search_path=''` + schema-qualified
   refs; no dynamic SQL from `cadence_config`/`spec_snapshot`; `revoke execute … from public,anon,authenticated`
   present (CI lint).
2. **Job-function → holder resolution (`_function_holders`) — tenancy.** Confirm the resolver is pinned to an
   explicit `p_org` and joins `person_roles`/`roles`/`team_memberships` all org-scoped, so a cross-org or
   archived Role/Team/person can never be resolved as a PIC; confirm a person outside the org yields a **pending
   row**, never a Task (fail-closed).
3. **RLS seams — `process_runs` / `process_run_pending_tasks` / definition tables.** Confirm no
   INSERT/UPDATE/DELETE policy exists for `authenticated` on the run/pending tables (RPC-only), SELECT is
   org-walled, RLS is **forced**, and the generated-Task provenance columns cannot be used to leak cross-org
   task rows (org-readable is unchanged; verify the cascade guard blocks a cross-org `process_run_id`).
4. **`org_id` tenancy on generated Tasks.** The spawn RPC writes Tasks on the caller's behalf — confirm every
   generated Task's `org_id` is the run's org (never client-supplied), BU derives from a same-org Team, and PIC/
   Supervisor are same-org people; a compromised param cannot plant a task in another org.
5. **`resolve_pending_task` / `complete_process_run`.** Confirm the same cross-org + capability + Team-auth gates,
   that a resolver cannot pick a non-candidate/cross-org person as PIC (or that an authorized override is
   explicit and logged), and that completion cannot be driven cross-org.
6. **Capability grants.** Confirm `process.start` is default-deny beyond ops_lead/admin (no `member`), matching
   OD-P4-4 least-privilege, and that grants are seed-only (no self-assignment path).

The auditor's findings are recorded in `docs/reviews/<branch>.md`; any Critical/High blocks merge
(`scripts/pre-merge-check.sh`).

---

## 8. RATIFY-BEFORE-MERGE (grill + owner walkthrough must ratify each)

1. **Process-definition storage.** Extend `mos.work_lines` (add `business_unit_id`/`accountable_person_id`/
   `responsible_person_id`/`definition_version`) vs a dedicated `mos.process_definitions` table (the earlier
   draft's choice). *Alt (separate table)* keeps `work_lines` a thin catalog but forks the `/work/projects`
   catalog + the `work_line_id` task bridge into two homes for one Process. **Recommend: extend `work_lines`**
   (additive, reversible; the deferred designer fills it richly; one Process identity).
2. **Cadence kinds + period grain.** Support `manual/daily/weekly/monthly` with WIB period keys (daily
   `YYYY-MM-DD`, weekly ISO Mon-week, monthly `YYYY-MM`); RRULE deferred; `manual` collapses to one run per
   (team, day). **Recommend: the four kinds as stated.**
3. **Spawn trigger model.** Explicit human **Start run** over a `due_process_runs()` read-model; **no** cron/
   scheduler in v1; auto-materialize-on-read deferred. *Alt A (earlier draft):* an **external VPS cron** driving
   the identical idempotent RPC as a dedicated role (the shipped `scripts/reporting_snapshot.py` @03:30-WIB
   precedent). *Alt B:* in-DB `pg_cron`. Because the spawn primitive is one idempotent RPC, either scheduler is
   an **additive** future change (only the *caller* differs). **Recommend: explicit idempotent Start in v1
   (fail-closed, human-in-the-loop while the owner is absent); adopt the VPS-cron caller later if a real
   unattended-spawn need appears.**
4. **Supervisor resolution depth.** v1 resolves Supervisor explicit → process A → **PIC-self** (editable); the
   full OD-REDESIGN-41 manager-chain (PIC's BU-matching manager, multi-path→human) is deferred to the designer
   slice. **Recommend: shallow + editable** (never mis-assigns oversight).
5. **`process.start` capability grants.** Default-grant **ops_lead + admin** only; no `member` in v1; the Café
   retrofit (Step 7) decides whether a rostered café `member` may start *"today's opening"*. **Recommend:
   ops_lead + admin (default-deny broad).**
6. **Run read visibility.** `mos.process_runs` **org-readable** (consistent with the org-readable Tasks it
   groups) vs Team-scoped. **Recommend: org-readable.**
7. **Ambiguity handling model.** Zero/many holders ⇒ a `process_run_pending_tasks` human-choice row (never a
   Task, never a guessed PIC), resolved via `resolve_pending_task`. This is OD-41 encoded because a Task
   *requires* a PIC (OD-REDESIGN-40). **Recommend: as stated (fail-closed).**
8. **Idempotency grain.** `unique(org_id, work_line_id, owning_team_id, period_key)`; `on conflict do nothing`;
   generate Tasks only on a fresh run. **Recommend: as stated.**
9. **Completion semantics.** Human `complete_process_run` sets `status='completed'`; no auto-complete; the
   rollup view carries live progress. **Recommend: human-complete.**
10. **Checklist-vs-Task boundary (OD-12).** Single-operator steps ⇒ `process_task_defs.checklist_items` →
    materialized into `task_checklist_items` on one Task; only independently-owned steps get their own def+Task.
    The author decides at design time (deferred designer); the schema supports both. **Recommend: as stated.**

---

## 9. Acceptance criteria (each owned by ONE test at the lowest sufficient layer)

**Schema / RLS / spawn — pgTAP.** The sandbox has **no Docker**, so `supabase test db` runs in CI via
`.github/workflows/integration.yml` **`workflow_dispatch`** (`gh workflow run integration.yml --ref <branch>`),
not locally. Tag each assertion's title with its `AC-###` so `grep -r AC-6## supabase/tests` finds the proof.
- **AC-601** (pgTAP): Given the migrated DB, then `mos.process_cadences`, `mos.process_task_defs`,
  `mos.process_runs`, `mos.process_run_pending_tasks` exist with RLS **enabled + forced**, the run idempotency
  `unique(org_id,work_line_id,owning_team_id,period_key)` and the `process_task_defs` PIC-binding CHECK hold,
  and `mos.tasks` has nullable `process_run_id`/`generated_from_task_def_id`; **no** table grants DELETE to
  `authenticated` (NFR-601).
- **AC-602** (pgTAP): Given an authorized starter, when `spawn_process_run` is called twice for the same
  (process, team, period), then exactly **one** `process_runs` row exists and the generated Task count does not
  change on the second call (FR-602 / NFR-602).
- **AC-603** (pgTAP): Given a spawned run, when a `process_task_defs` row is then edited, then the run's
  `spec_snapshot`/`definition_version` and its generated Tasks are **unchanged** (FR-603 / FR-613).
- **AC-604** (pgTAP): Given a def bound to a job function with exactly **one** current holder, when the run
  spawns, then a Task is created with that holder as PIC (`responsible_person_id`) (FR-604).
- **AC-605** (pgTAP): Given a def whose job function has **zero** holders, when the run spawns, then **no** Task
  is created and a `process_run_pending_tasks` row (`reason='none'`) exists; given **two** holders, then no Task
  and a pending row (`reason='multiple'`, both candidates listed) (FR-605 / OD-41).
- **AC-606** (pgTAP): Given a pending item, when an authorized human calls `resolve_pending_task` with a
  candidate, then the Task is created linked to the run + def and the item is marked resolved; a second
  `resolve_pending_task` on it is **rejected**; a call with a **non-candidate** person is rejected (FR-606).
- **AC-607** (pgTAP): Given a spawned single-holder Task, then its `business_unit_id` equals the owning Team's
  BU, its Supervisor (`accountable_person_id`) equals the process A (or PIC-self when A is null), `status='Open'`,
  `process_run_id` + `generated_from_task_def_id` are set, and `due_date = scheduled_date + due_offset_days`
  (FR-607).
- **AC-608** (pgTAP): Given a def carrying `checklist_items`, when its Task materializes, then matching
  `mos.task_checklist_items` rows exist and no extra Task was created for those steps (FR-608 / OD-12).
- **AC-609** (pgTAP): Given a run with a mix of Open/Done/overdue Tasks + one unresolved pending item, then
  `process_run_rollup` returns the correct `total/open/done/overdue/pending_unresolved/completion_pct` (FR-609).
- **AC-610** (pgTAP): Given an authorized human, when `complete_process_run` is called, then `status='completed'`
  + `completed_at` are set and the run's Tasks persist; an **unauthorized** caller is rejected (FR-610).
- **AC-611** (pgTAP): Given an app user, when they attempt a **direct** INSERT into `mos.process_runs` (or
  `process_run_pending_tasks`), then it is denied (no policy); when `spawn_process_run` is called **without**
  `process.start` **or** without owning-Team authorization, then it is rejected (FR-614 / NFR-601).
- **AC-612** (pgTAP): Given a cross-org caller (org-B) invoking `spawn_process_run` on an org-A process/team,
  then it is rejected; and given a job function whose Role/Team lives in another org, `_function_holders`
  resolves **zero** holders so a pending row (not a Task) results (NFR-603 / FR-614).
- **AC-613** (pgTAP): Given `due_process_runs()`, then a daily-cadence process with no run for today (WIB) is
  listed, and once `spawn_process_run(today)` succeeds it is **omitted** (FR-612).

**DAL / UI — unit (Vitest/RTL, mocked):**
- **AC-620** (unit): Given the DAL, when `startRun(processId, teamId, date)` is called, then it invokes
  `.rpc('spawn_process_run', …)` and returns `{ runId, created, pending }`; an RPC error is surfaced (FR-602).
- **AC-621** (unit): Given a pending item in the DAL, when `resolvePendingTask(id, picId)` is called, then it
  invokes `.rpc('resolve_pending_task', …)`; `listPendingTasks(runId)` reads the unresolved rows (FR-606).
- **AC-622** (unit): Given generated Tasks carrying a `process_run_id`, when the Tasks list renders, then they
  are grouped under the run **caption** and the label string "Process Run" is **never** rendered (FR-611).
- **AC-623** (unit): Given the Start-run control, when the viewer is `process.start`-capable, then due
  occurrences render with a **"Start run"** action (no bare "Create"); when not capable, the control is absent
  (FR-612 / Rule 7).
- **AC-624** (unit): Given the pending-PIC resolution surface, when it renders a `reason='multiple'` item, then
  its candidate people are listed and selecting one calls `resolvePendingTask` (FR-606 / OD-41).

**End-to-end — Playwright (≤1 curated; may fold into F2 *today's-opening* at Step 7):**
- **AC-630** (e2e): Given an authorized lead, when they Start a due process occurrence, then its single-holder
  generated Tasks appear in `/work/tasks` grouped under the occurrence caption, and an ambiguous step surfaces as
  a pending item that, once resolved to a PIC, appears as a Task in the same group — the real cross-stack flow
  across the spawn RPC + RLS + the Tasks view.

---

## 10. Open follow-ups (tracked, not Step 6)
- Guided Process **designer** (OD-REDESIGN-13); Standards/Steps/Checks/Exceptions (OD-REDESIGN-4/30/31).
- Auto-materialize-on-read or a VPS-cron/pg_cron caller for the idempotent spawn RPC (RATIFY-3 sequel); the full
  OD-REDESIGN-41 manager-chain Supervisor resolver.
- Per-Team Process **adoption** + independent versioning (OD-REDESIGN-54); `process.adopt` wiring.
- **Café** kitchen-log→occurrence bridge (`ops.kitchen_logs.process_run_id`) — **Step 7** (ADR D11).
- Task **BU→Team** re-home; run cancellation workflow; occurrence notifications on spawn.
