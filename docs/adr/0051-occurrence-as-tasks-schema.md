# ADR-0051 — Occurrence-as-Tasks: process definitions, cadence, idempotent spawn, thin run record, job-function→holder resolution, derived roll-up, RLS

- **Status:** Proposed (redesign buildout **Step 6** — the deferred OD-REDESIGN-11 schema ADR). Items tagged
  **RATIFY-BEFORE-MERGE** below are **provisional / fail-closed** and must be confirmed at the Step-6 owner
  walkthrough. Per `docs/plans/CLOUD-AGENT-HANDOFF.md` §2 the owner is deliberately absent until after Step 11;
  every genuinely-ambiguous business rule is resolved to the **most conservative, fail-closed** option and
  marked inline. A later "no" narrows the affected clause; it never reopens closed domain law
  (OD-REDESIGN-1..66).
- **Date:** 2026-07-16
- **Deciders:** eng-planner (author); Step-6 grill + owner walkthrough (ratifier).
- **Context sources:** `docs/decisions.md` OD-REDESIGN-11/12/13/14/40/41/53/54/58 + OD-12 (Task-vs-Check
  boundary) + OD-41 (ambiguity→human), `CONTEXT.md` (Process · Process Run · Standard · Check · Shift · PIC ·
  Supervisor · Object Contract), `docs/adr/0025-ia-modules-in-rail-redesign-direction.md` D6/D18/D26/D27/D40,
  `docs/experience-contract.md` Rules 1–12, and the shipped prior art:
  `supabase/migrations/20260624000001_mos_cascade_lookups.sql` (`mos.work_lines` = the Project/Process
  catalog), `20260611000007_mos_tasks.sql` + `20260611000009_mos_rls.sql` (tasks + `can_edit_task` idiom),
  `20260709000001_mos_follow_ups.sql` (the single-DEFINER-RPC gated-write idiom + `can_work_lane`),
  `20260620000009_ops_approve_kitchen_log_rpc.sql` + `ops.kitchen_plans`/`ops.kitchen_logs` (the kitchen
  Module data patterns Step 7 retrofits onto this spawner), `docs/adr/0050-signal-data-model-and-visibility.md`
  (the Team substrate — `shared.teams`/`shared.team_memberships` — this ADR builds on as **binding prior art**).

## Context

A **Process** is the permanent definition of recurring work and is never "done" (OD-REDESIGN-11, CONTEXT
"Process"). Each occurrence — *July 2026 Monthly Close*, *Retail Stock Opname · 31 July*, *Café Opening ·
today* — must produce concrete, owned **Tasks** that flow into the one universal `/work/tasks` runtime, while a
**thin occurrence record** survives behind the scenes to own that occurrence's completion, history, and a
version snapshot (OD-REDESIGN-58). "Process Run" is the internal/domain name for that record; it **appears
nowhere in the UI** — occurrences surface only as a grouping **caption** over their Tasks (OD-REDESIGN-58).

Four forces shape the model:

1. **Occurrence is distinct from definition (OD-REDESIGN-11).** The definition is permanent and BU-governed;
   each occurrence is an execution object that owns *its* generated work and history. Editing the definition
   later must not rewrite a past occurrence — so occurrences carry a **version snapshot**.
2. **The ownership-boundary rule (OD-REDESIGN-12 / OD-12).** A generated step becomes a **Task** only when it
   needs independent PIC/Supervisor, due date, status, or reporting identity; a smaller step that inherits all
   of those is a **Checklist item** *inside* one Task. Assertions against a Standard are **Checks**; files are
   evidence. Step 6 must persist that boundary as authored — it must **not** convert every step into a Task.
3. **Job-function PIC, resolved at spawn, ambiguity→human (OD-REDESIGN-58 / OD-41).** A generated Task
   definition binds its PIC to a **job function** (a Role + optional Team scope), *not* a named person, so
   staff turnover changes the holder mapping and never the Process. At spawn the function resolves to its
   **current holder**; if it resolves to zero or many, the system **never guesses** — it defers to a human
   choice (OD-41: "ambiguity never guesses").
4. **No new scheduler infrastructure (OD-P4 hardening posture).** `ris-dev` runs `ufw` default-deny with zero
   inbound ports and a deliberately thin backend (ADR-0010 D6/D11). A background cron/pg_cron/edge-scheduler
   for pre-spawning is *infra we do not want in v1*. Spawn must be a **deterministic, idempotent RPC** that a
   human "Start" action (or a later on-read materializer) can call safely any number of times.

Prior art is deliberately reused (Rule 11 / OD-REDESIGN-60): `mos.work_lines` already **is** the Project/Process
catalog (`type in ('project','process')`); Tasks already bridge to it via `work_line_id`; the follow-ups slice
already established the **RPC-only gated-write** pattern (no INSERT/UPDATE policy for `authenticated`; a single
`SECURITY DEFINER` RPC that locks → cross-org-guards → capability-gates → validates → writes); and the Signal
slice already built the `shared.teams`/`shared.team_memberships` substrate this ADR needs for Team-scoped job
functions.

## Decision

### D1 — Process definition = **extend `mos.work_lines`** (the existing Process catalog), do not fork it (RATIFY-1)
Add nullable, additive governance columns to `mos.work_lines` (the shipped Project/Process catalog) rather than
introducing a competing `process_definitions` table: `business_unit_id` (→ `shared.business_units`, BU
derivation + the OD-REDESIGN-41 manager chain), `accountable_person_id` (the Process **A**, drives Supervisor
inheritance — OD-REDESIGN-14), `responsible_person_id` (the Process **R**), and `definition_version int not
null default 1` (bumped on any generation-config edit; captured into each run's snapshot). Recurrence config is
process-only, so it lands in a **dedicated** `mos.process_cadences` (one row per process, `unique(work_line_id)`)
rather than widening `work_lines` with columns a Project never uses. Generated Task templates land in
`mos.process_task_defs` (FK `work_line_id`).
- *Rejected Alt:* a fresh `mos.process_definitions` table — forks the catalog `/work/projects` already renders
  (Step 8), duplicates the `work_line_id` task bridge, and re-bakes the "two homes per entity" trap. The full
  guided **Process designer** (OD-REDESIGN-13) lands later and fills these columns richly; Step 6 only needs
  *enough* definition to spawn correctly.
- **RATIFY-1:** extend `work_lines` (recommend) vs a dedicated definition table. Additive + reversible either
  way; recommend extend.

### D2 — `mos.process_cadences`: four WIB cadence kinds in v1; deterministic period key (RATIFY-2)
`cadence_kind text check in ('manual','daily','weekly','monthly')`, `cadence_config jsonb` (e.g.
`{"weekdays":[1..7]}`, `{"day":31|"last"}`), `timezone text default 'Asia/Jakarta'` (OD-P1-4), `anchor_date
date`, `active boolean`. RRULE/custom recurrence is deferred. The **occurrence period key** is derived
deterministically in WIB: daily `YYYY-MM-DD`, weekly `IYYY-"W"IW` (ISO week, Mon-start — OD-P1-4), monthly
`YYYY-MM`, manual `YYYY-MM-DD` of the start date. The period key is the idempotency grain (D6).
- **RATIFY-2:** the four kinds + these WIB grains (recommend); note manual = one run per (team, day) — a second
  same-day manual start is idempotent-collapsed, acceptable v1.

### D3 — `mos.process_task_defs`: the generated Task template with a **job-function** PIC binding
Columns: `work_line_id`, `title`, `description`, `position int` (order), `due_offset_days int default 0`
(relative to the run's scheduled date), `checklist_items jsonb default '[]'` (the single-operator steps that
stay **inside** one Task — OD-REDESIGN-12), and the ownership binding — **PIC** as either an explicit
`pic_person_id` (fully-specified) **or** a job function `pic_role_id` (→ `shared.roles`) + optional `pic_team_id`
(→ `shared.teams`); **Supervisor** as `supervisor_person_id` **or** `supervisor_role_id` + `supervisor_team_id`
(the OD-REDESIGN-14 explicit override), both nullable, `archived_at`. A CHECK requires *some* PIC binding
(`pic_person_id is not null OR pic_role_id is not null`) so a definition can never spawn an ownerless Task
silently. Only steps that need independent ownership are their own `process_task_defs` row; everything else is a
`checklist_items` entry — the OD-12 boundary is authored, not inferred.

### D4 — `mos.process_runs`: the **thin occurrence record** (RATIFY-6)
One row per (process, adopting Team, occurrence period). Columns: `org_id`, `work_line_id` (the process),
`owning_team_id` (→ `shared.teams` — the **adopting Team**; CONTEXT "each Run belongs to one adopting Team"),
`period_key text`, `caption text` (the human grouping label, e.g. *"Café Opening · 16 Jul 2026"*),
`scheduled_date date`, `status text check in ('open','completed','cancelled') default 'open'`, `completed_at`,
`completed_by`, `definition_version int`, `spec_snapshot jsonb` (the resolved task-def set at spawn — D5),
`started_by`, timestamps. **Idempotency:** `unique(org_id, work_line_id, owning_team_id, period_key)` (D6). The
run stores **no roll-up counts** — those are a derived view (D9). Read is **org-readable** (RATIFY-6), matching
the org-readable Tasks it groups ("cross-unit visibility is the product", OD-P1-3); a team-scoped run read would
be inconsistent with its own org-visible tasks.
- **RATIFY-6:** org-readable runs (recommend) vs team-scoped. The run is a grouping+rollup over already
  org-visible tasks; org-readable is the consistent, low-surprise choice.

### D5 — Version snapshot at spawn (OD-REDESIGN-11/14/58)
At spawn the run captures `definition_version` (from `work_lines`) and `spec_snapshot` = the JSON array of the
`process_task_defs` (title, offsets, checklist, resolved PIC/Supervisor per step) **used for this run**.
Rationale: OD-REDESIGN-14 — a run "snapshots the Process RACI and resolves each generated Task's PIC/Supervisor
when it starts, preserving historical ownership if the Process definition changes later." Later definition edits
never touch a spawned run's snapshot or its already-created Tasks. This is the history/version half of the "thin
occurrence record owns completion/history/version snapshot" mandate.

### D6 — Spawn = one **deterministic, idempotent `SECURITY DEFINER` RPC**; explicit Start in v1, no cron (RATIFY-3)
`mos.spawn_process_run(p_work_line_id uuid, p_owning_team_id uuid, p_target_date date)` — the single gated write
point for a run (mirrors `mos.transition_follow_up`): (1) load the process + cadence; (2) cross-org guard;
(3) **capability + owning-Team authorization** gate (`process.start` — D8); (4) derive `period_key` (D2);
(5) `insert … on conflict (org_id, work_line_id, owning_team_id, period_key) do nothing returning id` — **if the
row already existed, return it and generate nothing** (at-most-once; NFR-602); (6) on a fresh run, snapshot the
definition (D5) and, for each active `process_task_defs` row, resolve holders (D7) and either **create a Task**
(single holder) or **record a pending human-choice row** (ambiguous — D7). The RPC returns the run id + a
resolution summary (`created`, `pending`).

**When is it called? — explicit Start only, in v1 (RATIFY-3).** The caller is a human "Start run" action
(OD-REDESIGN D18 "Process offers Start run"; Step 7's *"Start today's opening"*). A `mos.due_process_runs()`
read-model (D9) tells the UI which processes have a due, not-yet-spawned occurrence so the Start surface is
populated **without any scheduler**. Because the RPC is idempotent, a later *materialize-on-read* optimization
(auto-calling it when a due surface is opened) is a safe additive change — but v1 keeps a **human in the loop**
(fail-closed: no surprise task spawns while the owner is absent).
- *Rejected Alt:* a pg_cron / edge-function pre-spawn window — adds scheduler infra the OD-P4 hardening posture
  refuses at v1 scale, and background spawns of owned Tasks with no human present is the opposite of
  fail-closed.
- **RATIFY-3:** explicit idempotent Start + a `due` read-model (recommend); auto-materialize-on-read deferred.

### D7 — Job-function → current-holder resolution; ambiguity → a **pending human-choice row** (OD-41) (RATIFY-4)
A helper `mos._function_holders(p_org uuid, p_role_id uuid, p_team_id uuid) returns setof uuid` yields the
**current holders**: people who hold `p_role_id` in `p_org` **and** (if `p_team_id` is set) are an *active*
member of that Team (`shared.team_memberships`, effective-dated — the ADR-0050 substrate). Resolution per
generated step: explicit `pic_person_id` wins; else the function's holder set is taken — **exactly one ⇒ that
person is the PIC**; **zero or more than one ⇒ ambiguous**. Because a Task **requires** a PIC (OD-REDESIGN-40:
"Every Task requires Team, PIC, Supervisor, and Status"), an ambiguous step **cannot** become a Task and is
**never** guessed. Instead the spawn RPC writes a `mos.process_run_pending_tasks` row (the run, the task-def, the
candidate holder ids, `reason in ('none','multiple')`). A second RPC `mos.resolve_pending_task(p_pending_id,
p_pic_person_id)` — capability-gated, cross-org-guarded — lets an authorized human pick the holder, which
**materializes** the Task and marks the pending row resolved (re-resolving is rejected). This is OD-41
("ambiguity requires human choice") encoded fail-closed.

**Supervisor resolution order (RATIFY-4)** follows OD-REDESIGN-14/41 but *shallow* in v1: explicit
`supervisor_person_id` → `supervisor_role_id`+scope holder (if unique) → the process's `accountable_person_id`
(D1) → **PIC self** (valid: OD-REDESIGN-41 "same-person PIC/Supervisor is valid", "PIC when no manager exists").
The full OD-REDESIGN-41 manager-chain match (PIC's BU-matching direct manager, multi-path→human) is **deferred**
to the Process-designer slice — v1 never *guesses a wrong manager*; it defaults to the process A or PIC-self and
leaves Supervisor editable on the Task (Reassign per OD-REDESIGN-62).
- **RATIFY-4:** shallow supervisor resolution (explicit → process A → PIC-self, editable) with the full OD-41
  manager-chain deferred (recommend — never mis-assigns oversight).

### D8 — Capabilities + Team authorization; runs/pending are **RPC-write-only** (RATIFY-5)
Register in `shared.role_capabilities`: `process.start` (default-grant **ops_lead + admin**) and `process.adopt`
(admin only; the OD-REDESIGN-54 per-Team adoption config is deferred, capability reserved). The spawn RPC
requires `can('process.start')` **and** that the caller is authorized over `p_owning_team_id` — active membership
of that Team **or** `has_access_role('admin')` (a helper `mos.can_start_process_for_team`). `mos.process_runs`
and `mos.process_run_pending_tasks` have **no INSERT/UPDATE policy for `authenticated`** — writes flow only
through the `SECURITY DEFINER` RPCs (the follow-ups idiom); SELECT is org-readable; **no DELETE** anywhere
(soft states only). `mos.process_cadences` and `mos.process_task_defs` are org-readable (pickers/preview) with
INSERT/UPDATE gated to `admin OR ops_lead` (mirrors `work_lines`).
- **RATIFY-5:** `process.start` → ops_lead + admin in v1 (recommend, default-deny broad). The Café retrofit
  (Step 7) may widen to rostered café `member`s if the *"Start today's opening"* job needs a floor member to
  start — decided there, not guessed here.

### D9 — Derived roll-up + `due` read-model, both `security_invoker` (OD-REDESIGN-58)
`mos.process_run_rollup` — a `security_invoker` view keyed by `process_run_id` producing live counts
(`total`, `open`, `in_progress`, `blocked`, `done`, `overdue` in WIB, `pending_unresolved`, `completion_pct`)
over the run's Tasks + pending rows. No count is stored on the run (single source of truth = the Tasks). Overdue
uses `due_date < (now() at time zone 'Asia/Jakarta')::date` (OD-P2-6). `mos.due_process_runs()` — a
`security_invoker` set-returning function listing each active-cadence process whose **current-period occurrence
for the caller's authorized Teams is not yet spawned**, so the Start surface needs no scheduler (D6). Both
inherit RLS from their base tables (chaser sees their teams; the org-readable runs mean any member sees org
occurrences, consistent with tasks).

### D10 — Generated Tasks reuse the shipped Task machinery (Rule 11)
A materialized Task is an ordinary `mos.tasks` row: `business_unit_id` = the owning Team's BU
(`teams.business_unit_id` — Tasks still key BU, not Team, until a later re-home; no task-schema change),
`responsible_person_id` = resolved PIC, `accountable_person_id` = resolved Supervisor (the legacy columns still
carry PIC/Supervisor per OD-REDESIGN-3), `status='Open'`, `work_line_id` = the process, `due_date` =
`scheduled_date + due_offset_days`, `created_by` = `started_by`, plus the new **provenance** columns
`process_run_id` (→ the run) and `generated_from_task_def_id` (→ the def). The def's `checklist_items` become
`mos.task_checklist_items` rows (reuse, OD-REDESIGN-12). The existing `mos._guard_task_cascade_refs` trigger is
extended (create-or-replace) to also assert `process_run_id` is same-org. The Tasks list groups by the run's
`caption` — **"Process Run" never appears** (OD-REDESIGN-58 / FR-611). No Task change touches shipped behavior:
the new columns are nullable; existing tasks are unaffected.

### D11 — Café retrofit seam (design-for Step 7, build nothing in the kitchen tables here)
The kitchen Module (`ops.kitchen_plans`, `ops.kitchen_logs`) maps onto this model **without** a schema change in
Step 6: a *"Café Opening"* Process (`work_lines.type='process'`, BU Retail, `cadence_kind='daily'`) whose
`process_task_defs` are the opening checklist; Step 7's *"Start today's opening"* calls
`spawn_process_run(cafe_opening, branch_team, today)`; the generated Task's PIC resolves to the holder of
(Kitchen role, branch Team). Step 7 then adds a nullable `ops.kitchen_logs.process_run_id` (or a `signal_tasks`-
style bridge) so kitchen captures flow into `/work/tasks` under the occurrence caption. Step 6 leaves the
kitchen tables untouched; the occurrence model is generic enough (period key, owning Team, generated Tasks +
checklist, roll-up) to host "today's opening" — this is the design constraint that shaped D2/D3/D4.

### D12 — Migration reversibility, org wall, no hard delete (NFR-601/604)
Every new table: `org_id` defaulted from `shared.current_org_id()` + WITH-CHECK-pinned on any write path, RLS
**enabled + forced**, **no DELETE grant**. Every DEFINER RPC `revoke execute … from public, anon,
authenticated` then `grant execute … to authenticated` (the CI definer-revoke lint, `integration.yml`). Every
migration ships a manual **DOWN** at file foot; pre-prod is `supabase db reset`; staging reset + deploy stay
owner-gated (OD-34). The org wall holds structurally: the spawn/resolve RPCs re-derive org from the row + the
JWT claim and reject cross-org before any write; `_function_holders` is pinned to an explicit `p_org` so a
cross-org Role/Team resolves **no** holder (fails closed → a pending row, never a wrong person).

## Consequences

- **Positive.** Occurrences are first-class and idempotent: the `unique(org, process, team, period)` key + row
  lock + `on conflict do nothing` guarantee **at-most-once** generation across double-clicks, retries, and
  concurrency (the OD-K-4 discipline generalized). Job-function PICs make turnover a data change, never a
  Process edit (OD-REDESIGN-58). Ambiguity is fail-closed into a human-choice queue — the app **never** invents
  ownership (OD-41). The version snapshot preserves history against later definition edits (OD-REDESIGN-11/14).
  No scheduler infra is added (OD-P4 posture). Generated work reuses the shipped Tasks/checklist/`work_line_id`
  machinery and flows into the one `/work/tasks` runtime with zero behavior change to existing tasks (Rule 11).
  The kitchen Module maps on without a Step-6 schema change (D11).
- **Negative / debt.** Supervisor resolution is shallow in v1 (D7/RATIFY-4) — the full OD-REDESIGN-41 manager
  chain waits for the designer slice; until then some generated Tasks default Supervisor to the process A or
  PIC-self and rely on a human edit. Spawn is human-initiated (D6/RATIFY-3) — a due occurrence does not appear
  until someone opens the Start surface or clicks Start; auto-materialize is deferred. `process.start` is
  ops_lead/admin-only (RATIFY-5) until Step 7 decides floor-member starting. The full Process **designer**,
  **Standards/Checks/evidence** quality loop (OD-REDESIGN-4/30/31), per-Team **adoption** versioning
  (OD-REDESIGN-54), and Team re-homing of Tasks (BU→Team) are all **out of scope** — Step 6 ships the
  occurrence *runtime spine*, not the authoring or quality-loop surfaces.
- **Reversibility.** Additive columns on `work_lines`/`tasks` are nullable and dropped in the DOWN; new tables
  cascade-drop; RPCs/views/functions drop cleanly. No data backfill, no destructive change to shipped rows.
- **Follow-ups (not Step 6):** the guided Process designer (OD-REDESIGN-13); Standards/Checks/Exceptions
  (OD-REDESIGN-4/30/31); auto-materialize-on-read + optional pg_cron pre-spawn; the full OD-41 manager-chain
  Supervisor resolver; per-Team adoption + independent versioning (OD-REDESIGN-54); Café kitchen-log→occurrence
  bridge (Step 7, D11); Task BU→Team re-home.
