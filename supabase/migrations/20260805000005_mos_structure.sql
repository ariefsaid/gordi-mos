-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 1 of 4 for `mos`: structure (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Both prior migration chains are discarded as history; this is one domain-ordered set authored
-- from the adopted model, across shared -> mos -> ops -> integrations -> reporting. `shared` landed
-- in ...0001-0004. This file is the `mos` half's STRUCTURE: every table, column, CHECK, UNIQUE,
-- index and updated_at trigger. Behaviour (helper predicates, guards, grants, RLS, policies) lands
-- in ...0006_mos_access_control.sql; RPCs and views in ...0007_mos_functions.sql; pgTAP fixtures in
-- ...0008_mos_test_seed.sql.
--
-- Same two structural rules `shared` keeps, for the same reasons:
--   1. CREATE POLICY resolves its functions at creation time, so every helper is defined above the
--      first policy that calls it — which is why structure and policy are separate files.
--   2. There is exactly ONE guard function per table. Both prior chains grew four separate guard
--      functions on mos.tasks by accretion (archive, cascade refs, tenancy refs, provenance); this
--      baseline folds them into one body per table, with each carried invariant labelled by the
--      migration it came from, so extending an invariant cannot silently revert an earlier one.
--
-- ── THE ONE PAYLOAD CHANGE: mos.work_lines.objective_id (DD-WAY-15) ──────────────────────────
-- The three cascade levels were never chained in the schema. `mos.tasks` carries `objective_id` and
-- `work_line_id` as two independent nullable FKs on BOTH branches, and `mos.work_lines` had no
-- objective reference at all — so an Objective's Projects/Processes could only be INFERRED from
-- tasks that happen to carry both keys, and roll-up from the middle level was not expressible.
-- `OD-WAY-32` asks for roll-up and drill-down at "either/all levels". One nullable FK closes it.
-- It is nullable because `OD-C-1`'s topology rule survives: a Project/Process need not belong to an
-- Objective, and a Task may still link directly to a Project/Process.
--
-- ── AR: carried as-is, NOT reshaped (DD-WAY-16, OD-WAY-34, v4-port spec "Out of scope") ──────
-- mos.follow_ups / follow_up_events keep the shipped shape — chase states, the `b2b_ar` kind and the
-- lane split included — even though `OD-WAY-34` invalidates all three. The spec is explicit: "The
-- shipped stub ports as-is; nothing is reshaped." Reshaping it here would be migrating twice, since
-- the right shape is not decided yet. ⚠ The bridge's `reporting.esb_ar_reduction` landing zone and
-- the two recon views live with it in this `mos` pass rather than in the `reporting` pass, because
-- mos.follow_up_recon_drift is a VIEW over that table and a view IS validated at creation time —
-- splitting the bridge across two tickets would be exactly the reshape the ruling forbids.
-- **#185 must not re-create reporting.esb_ar_reduction.** Recorded here and in the PR body.
--
-- ── Dropped from the union, stated rather than silently omitted ───────────────────────────────
--   * mos.task_team_rehome_ambiguities + mos._rehome_task_teams() (v4 ...20260721000003) — a
--     one-time backfill report for LEGACY tasks whose Team could not be derived. A squashed baseline
--     has no legacy rows to classify, so the audit table would ship permanently empty and the
--     function would be dead code. Same reasoning #181 used to drop the five pre-remap BU rows.
--     `mos.tasks.team_id` itself IS carried, with its same-org + BU-equality guard.
--   * 20260721000004_mos_tasks_team_rehome_enforce.sql.HOLD — the `team_id NOT NULL` enforcement.
--     DISPOSITION: **dropped, and team_id stays nullable.** Its own header makes it conditional on
--     resolving every ambiguity row, and that queue no longer exists. Making the column NOT NULL
--     here would be a new requirement no ruling authorises — every task-creating path (the task form,
--     mos.spawn_process_run, mos.resolve_pending_task) would have to supply a Team, which is a
--     product decision, not a squash decision. Left nullable; the enforcement remains available as
--     a one-line migration once Teams are populated.
--   * 20260705000002_bu_taxonomy_remap.sql — legacy id remap; #181 already dropped its `shared` half.
--
-- DOWN (whole file, pre-production): drop schema mos cascade;
--   plus: drop table if exists reporting.esb_ar_reduction cascade;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The cascade catalog — Objective -> Project/Process (OD-C-1, ADR-0014, DD-WAY-15)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Three levels: Objective -> Project/Process -> Task (OD-WAY-32). "Cascade" is vocabulary, never a
-- route. Both catalogs are soft-archive only; no DELETE is granted anywhere (NFR-002).

-- mos.objectives stays a BARE catalog on purpose (OD-WAY-33): no measure, no baseline, no target,
-- no current. Progress is a count roll-up over its Projects/Processes, derived at query time.
-- Adding those columns later is `alter table … add column`, nullable, no backfill and no reshape —
-- verified before the layer was cut, which is why cutting it was cheap.
create table mos.objectives (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references shared.orgs(id) on delete cascade,
  name        text        not null check (btrim(name) <> ''),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.objectives is
  'Top of the three-level cascade: a yearly goal work rolls up to (OD-C-1, OD-WAY-32). Deliberately a bare catalog — no measure/target layer (OD-WAY-33); progress is a count roll-up read on the record.';

create index objectives_org_idx on mos.objectives (org_id);
create index objectives_org_active_idx on mos.objectives (org_id) where archived_at is null;

create trigger objectives_set_updated_at
  before update on mos.objectives
  for each row execute function shared.set_updated_at();

-- mos.work_lines is the Project/Process catalog. "work-line" survives ONLY as the physical table
-- name (ADR-0015); every UI label reads Project/Process (owner, 2026-06-26).
-- `type` splits the pair: project = bounded change work; process = standing run work.
create table mos.work_lines (
  id                    uuid        primary key default gen_random_uuid(),
  org_id                uuid        not null references shared.orgs(id) on delete cascade,
  name                  text        not null check (btrim(name) <> ''),
  type                  text        not null check (type in ('project', 'process')),
  -- ── NEW in this baseline (DD-WAY-15) ──────────────────────────────────────────────────────
  objective_id          uuid        references mos.objectives(id),
  -- Process governance (ADR-0051 D1). Nullable; Projects are unaffected by all four.
  business_unit_id      uuid        references shared.business_units(id),
  accountable_person_id uuid        references shared.people(id),
  responsible_person_id uuid        references shared.people(id),
  definition_version    int         not null default 1,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table mos.work_lines is
  'Middle of the cascade: the Project/Process catalog (OD-C-1, ADR-0014/0015). UI label is always "Project/Process"; "work-line" survives only as this table name.';
comment on column mos.work_lines.objective_id is
  'NEW in the squashed baseline (DD-WAY-15). The cascade edge Objective -> Project/Process. NULLABLE: '
  'OD-C-1''s topology rule survives — a Project/Process need not belong to an Objective, and a Task '
  'may still link straight to a Project/Process. Without this edge an Objective''s children could only '
  'be inferred from tasks carrying both keys, so the middle level could not roll up and the top level '
  'could not drill down (OD-WAY-32). Same-org enforced by mos._guard_work_lines, not by the FK.';
comment on column mos.work_lines.accountable_person_id is
  'Process A (governance). Drives generated-Task Supervisor inheritance (OD-REDESIGN-14). Nullable.';
comment on column mos.work_lines.definition_version is
  'Bumped on a generation-config edit; snapshotted onto each process_run (ADR-0051 D5).';

create index work_lines_org_idx on mos.work_lines (org_id);
create index work_lines_org_active_idx on mos.work_lines (org_id) where archived_at is null;
-- The roll-up/drill-down access path the new edge exists to serve.
create index work_lines_objective_idx on mos.work_lines (objective_id) where objective_id is not null;

create trigger work_lines_set_updated_at
  before update on mos.work_lines
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Process definitions and occurrences (ADR-0051)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A Process (a work_line of type='process') carries one cadence and a set of generated-Task
-- templates. An occurrence is a `process_run`; each run generates Tasks, or — when the PIC cannot be
-- resolved to exactly one person — a pending human-choice row. OD-41: never guess a PIC.
create table mos.process_cadences (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade,
  work_line_id   uuid not null unique references mos.work_lines(id) on delete cascade,
  cadence_kind   text not null check (cadence_kind in ('manual','daily','weekly','monthly')),
  cadence_config jsonb not null default '{}'::jsonb,
  timezone       text not null default 'Asia/Jakarta',
  anchor_date    date,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table mos.process_cadences is 'One cadence row per Process (ADR-0051 D2). UNIQUE on work_line_id.';
create index process_cadences_org_idx on mos.process_cadences (org_id);
create trigger process_cadences_set_updated_at before update on mos.process_cadences
  for each row execute function shared.set_updated_at();

create table mos.process_task_defs (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references shared.orgs(id) on delete cascade,
  work_line_id          uuid not null references mos.work_lines(id) on delete cascade,
  title                 text not null check (btrim(title) <> ''),
  description           text,
  position              int not null default 0,
  due_offset_days       int not null default 0,
  checklist_items       jsonb not null default '[]'::jsonb,
  pic_person_id         uuid references shared.people(id),
  pic_role_id           uuid references shared.roles(id),
  pic_team_id           uuid references shared.teams(id),
  supervisor_person_id  uuid references shared.people(id),
  supervisor_role_id    uuid references shared.roles(id),
  supervisor_team_id    uuid references shared.teams(id),
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Never an ownerless definition (ADR-0051 D3): some PIC binding is mandatory.
  constraint process_task_defs_pic_binding check (pic_person_id is not null or pic_role_id is not null)
);
comment on table mos.process_task_defs is
  'Generated-Task templates for a Process (ADR-0051 D3). The job-function PIC binding lives here; a definition is never ownerless.';
create index process_task_defs_org_idx on mos.process_task_defs (org_id);
create index process_task_defs_wl_idx on mos.process_task_defs (work_line_id) where archived_at is null;
create trigger process_task_defs_set_updated_at before update on mos.process_task_defs
  for each row execute function shared.set_updated_at();

create table mos.process_runs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references shared.orgs(id) on delete cascade,
  work_line_id       uuid not null references mos.work_lines(id),
  owning_team_id     uuid not null references shared.teams(id),
  period_key         text not null,
  caption            text not null,
  scheduled_date     date not null,
  status             text not null default 'open' check (status in ('open','completed','cancelled')),
  completed_at       timestamptz,
  completed_by       uuid references shared.people(id),
  definition_version int not null,
  spec_snapshot      jsonb not null,
  started_by         uuid references shared.people(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Idempotency: at most one run per (process, adopting Team, occurrence period). This UNIQUE is
  -- what makes mos.spawn_process_run at-most-once under a double-tap, not an application check.
  unique (org_id, work_line_id, owning_team_id, period_key)
);
comment on table mos.process_runs is
  'One Process occurrence (ADR-0051 D4). spec_snapshot freezes the active task-defs at spawn so a later definition edit cannot rewrite history. The (org, process, team, period) UNIQUE is the at-most-once key.';
create index process_runs_org_idx  on mos.process_runs (org_id);
create index process_runs_wl_idx   on mos.process_runs (work_line_id);
create index process_runs_team_idx on mos.process_runs (owning_team_id);
create index process_runs_open_idx on mos.process_runs (org_id) where status = 'open';
create trigger process_runs_set_updated_at before update on mos.process_runs
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Tasks — the bottom of the cascade and the core owned-work entity (OD-P2-*, ADR-0003)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table mos.tasks (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references shared.orgs(id) on delete cascade,
  title                  text not null check (btrim(title) <> ''),
  business_unit_id       uuid not null references shared.business_units(id),
  -- The executing Team. NULLABLE — see the .HOLD disposition in this file's header.
  team_id                uuid references shared.teams(id),
  status                 text not null default 'Open'
                           check (status in ('Open','In Progress','Blocked','Done')),
  responsible_person_id  uuid not null references shared.people(id),
  accountable_person_id  uuid not null references shared.people(id),
  consulted_person_ids   uuid[] not null default '{}',
  informed_person_ids    uuid[] not null default '{}',
  description            text,
  due_date               date,
  -- Cascade bridge: two independent nullable FKs. A Task may link straight to a Project/Process
  -- (OD-C-1), so neither is required and neither implies the other.
  objective_id           uuid references mos.objectives(id),
  work_line_id           uuid references mos.work_lines(id),
  -- Occurrence provenance (ADR-0051 D10). RPC-stamped only — see mos._guard_tasks.
  process_run_id             uuid references mos.process_runs(id),
  generated_from_task_def_id uuid references mos.process_task_defs(id),
  last_activity_at       timestamptz not null default now(),
  archived_at            timestamptz,
  created_by             uuid not null references shared.people(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table mos.tasks is
  'The unit of owned work and the bottom of the three-level cascade (OD-P2-1/4/5/6/9, ADR-0003). Org-readable; R/A/manager-write. Archive is soft and is the only removal.';
comment on column mos.tasks.team_id is
  'The executing Team. NULLABLE in this baseline: the v4 chain''s NOT NULL enforcement was gated on '
  'resolving a legacy-backfill ambiguity queue that a squashed baseline does not have, and requiring '
  'a Team on every task-creating path would be a new product requirement no ruling authorises. '
  'Same-org and BU-equal when supplied (mos._guard_tasks).';
comment on column mos.tasks.process_run_id is
  'Set ONLY by mos.spawn_process_run / mos.resolve_pending_task. A direct authenticated write that stamps it is refused 42501 (mos._guard_tasks) — otherwise any member could forge occurrence provenance.';

create index tasks_org_idx           on mos.tasks (org_id);
create index tasks_business_unit_idx on mos.tasks (business_unit_id);
create index tasks_team_idx          on mos.tasks (team_id);
create index tasks_org_team_idx      on mos.tasks (org_id, team_id);
create index tasks_active_team_idx   on mos.tasks (org_id, team_id) where archived_at is null;
create index tasks_status_idx        on mos.tasks (status);
create index tasks_due_date_idx      on mos.tasks (due_date);
create index tasks_responsible_idx   on mos.tasks (responsible_person_id);
create index tasks_accountable_idx   on mos.tasks (accountable_person_id);
create index tasks_consulted_gin     on mos.tasks using gin (consulted_person_ids);
create index tasks_informed_gin      on mos.tasks using gin (informed_person_ids);
create index tasks_active_org_idx    on mos.tasks (org_id) where archived_at is null;
create index tasks_objective_idx     on mos.tasks (objective_id);
create index tasks_work_line_idx     on mos.tasks (work_line_id);
create index tasks_process_run_idx   on mos.tasks (process_run_id) where process_run_id is not null;

create trigger tasks_set_updated_at
  before update on mos.tasks
  for each row execute function shared.set_updated_at();

-- The ambiguity queue for a run whose PIC resolved to zero or several holders. References
-- mos.tasks, so it lands after it.
create table mos.process_run_pending_tasks (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references shared.orgs(id) on delete cascade,
  process_run_id       uuid not null references mos.process_runs(id) on delete cascade,
  task_def_id          uuid not null references mos.process_task_defs(id),
  candidate_person_ids uuid[] not null default '{}',
  reason               text not null check (reason in ('none','multiple')),
  resolved_at          timestamptz,
  resolved_by          uuid references shared.people(id),
  materialized_task_id uuid references mos.tasks(id),
  created_at           timestamptz not null default now()
);
comment on table mos.process_run_pending_tasks is
  'Human-choice queue for a generated Task whose PIC resolved to 0 or many holders (ADR-0051 D4, OD-41 never guess). RPC-write-only.';
create index process_run_pending_org_idx on mos.process_run_pending_tasks (org_id);
create unique index process_run_pending_one_unresolved
  on mos.process_run_pending_tasks (process_run_id, task_def_id) where resolved_at is null;
create index process_run_pending_open_idx
  on mos.process_run_pending_tasks (process_run_id) where resolved_at is null;

-- ── Task children ────────────────────────────────────────────────────────────────────────────
-- A checklist item is a label + done flag + order and nothing more: no RACI, no status, no BU, no
-- due, and no cascade bridge of its own (CONTEXT.md "Checklist item").
create table mos.task_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  task_id     uuid not null references mos.tasks(id) on delete cascade,
  label       text not null check (btrim(label) <> ''),
  is_done     boolean not null default false,
  position    integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.task_checklist_items is 'Lightweight subtask: label/done/order child of a task (OD-P2-7). No RACI/status/BU/due, and it does not bridge into the cascade.';
create index task_checklist_task_idx on mos.task_checklist_items (task_id);
create index task_checklist_org_idx  on mos.task_checklist_items (org_id);

create trigger task_checklist_set_updated_at
  before update on mos.task_checklist_items
  for each row execute function shared.set_updated_at();

-- The automatic change-log. NOT comments (those are mos.comments). Append-only: no UPDATE grant,
-- no UPDATE policy, no DELETE anywhere.
create table mos.task_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade,
  task_id          uuid not null references mos.tasks(id) on delete cascade,
  actor_person_id  uuid not null references shared.people(id),
  event_type       text not null check (event_type in
                     ('created','status_changed','field_edited','raci_edited','archived','unarchived')),
  from_value       text,
  to_value         text,
  created_at       timestamptz not null default now()
);
comment on table mos.task_events is 'Automatic change-log (OD-P2-8); the one canonical clock behind tasks.last_activity_at. Append-only.';
create index task_events_task_idx on mos.task_events (task_id, created_at desc);
create index task_events_org_idx  on mos.task_events (org_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Signals — the factual record and its five children (ADR-0050 D3)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A Signal carries no BU and no Site column: both derive through owning_team_id. `source` is
-- 'human' in v1; the other two values exist so the column need not be widened later.
create table mos.signals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade,
  author_id      uuid not null references shared.people(id),
  owning_team_id uuid not null references shared.teams(id),
  occurred_at    timestamptz not null,
  body           text not null check (btrim(body) <> ''),
  attention      text not null default 'FYI' check (attention in ('FYI','Needs attention','Urgent')),
  category       text check (category is null or category in
                   ('Supply/vendor','Equipment/facility','Inventory/availability','Quality','Customer','People','Process','Other')),
  source         text not null default 'human' check (source in ('human','shared_record','rule')),
  source_ref     jsonb not null default '{}'::jsonb,
  retracted_at   timestamptz,
  retract_reason text,
  edited_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table mos.signals is 'The Signal factual record (ADR-0050 D3). BU and Site derive via owning_team_id. Retraction is soft; no DELETE anywhere.';
create index signals_org_idx        on mos.signals (org_id);
create index signals_team_idx       on mos.signals (owning_team_id);
create index signals_occurred_idx   on mos.signals (occurred_at desc);
create index signals_attention_idx  on mos.signals (attention);
create index signals_category_idx   on mos.signals (category);
create index signals_author_idx     on mos.signals (author_id);
create index signals_active_org_idx on mos.signals (org_id) where retracted_at is null;
create trigger signals_set_updated_at before update on mos.signals
  for each row execute function shared.set_updated_at();

create table mos.signal_mentions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade,
  signal_id        uuid not null references mos.signals(id) on delete cascade,
  mention_kind     text not null check (mention_kind in ('person','team','bu')),
  target_person_id uuid references shared.people(id),
  target_team_id   uuid references shared.teams(id),
  target_bu_id     uuid references shared.business_units(id),
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  -- Exactly one target, matching the kind. Without this a 'person' mention could also carry a BU id
  -- and reach rule R4 through the wrong arm.
  constraint signal_mentions_one_target check (
    (mention_kind='person' and target_person_id is not null and target_team_id is null and target_bu_id is null) or
    (mention_kind='team'   and target_team_id   is not null and target_person_id is null and target_bu_id is null) or
    (mention_kind='bu'     and target_bu_id     is not null and target_person_id is null and target_team_id is null)
  )
);
comment on table mos.signal_mentions is '@Person / @Team / @BU mentions on a Signal (ADR-0050 D4 rule R4). Immutable except revoked_at; re-target by revoking and inserting.';
create index signal_mentions_signal_idx on mos.signal_mentions (signal_id);
create index signal_mentions_person_idx on mos.signal_mentions (target_person_id);
create index signal_mentions_team_idx   on mos.signal_mentions (target_team_id);
create index signal_mentions_bu_idx     on mos.signal_mentions (target_bu_id);

create table mos.signal_acknowledgements (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references shared.orgs(id) on delete cascade,
  signal_id  uuid not null references mos.signals(id) on delete cascade,
  person_id  uuid not null references shared.people(id),
  created_at timestamptz not null default now(),
  unique (signal_id, person_id)
);
comment on table mos.signal_acknowledgements is 'One acknowledgement per (signal, person). Append-only.';
create index signal_ack_signal_idx on mos.signal_acknowledgements (signal_id);

create table mos.signal_revisions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references shared.orgs(id) on delete cascade,
  signal_id  uuid not null references mos.signals(id) on delete cascade,
  actor_id   uuid not null references shared.people(id),
  field      text not null check (field in ('body','occurred_at','category','attention')),
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
comment on table mos.signal_revisions is 'Edit history of a Signal''s four mutable content fields. Written ONLY by the definer guard trigger — there is no INSERT grant.';
create index signal_revisions_signal_idx on mos.signal_revisions (signal_id, created_at);

create table mos.signal_tasks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references shared.orgs(id) on delete cascade,
  signal_id  uuid not null references mos.signals(id) on delete cascade,
  task_id    uuid not null references mos.tasks(id) on delete cascade,
  created_by uuid not null references shared.people(id),
  created_at timestamptz not null default now(),
  unique (signal_id, task_id)
);
comment on table mos.signal_tasks is 'Signal -> Task link (a Signal that turned into work). Append-only.';
create index signal_tasks_signal_idx on mos.signal_tasks (signal_id);
create index signal_tasks_task_idx   on mos.signal_tasks (task_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Weekly updates — the ONE non-org-readable mos entity (OD-P2-10..14, ADR-0005)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table mos.weekly_updates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references shared.orgs(id) on delete cascade,
  person_id     uuid not null references shared.people(id),
  week_start    date not null,
  summary       text not null default '',
  status        text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at  timestamptz,
  created_by    uuid not null references shared.people(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- submitted_at and status can never disagree. The stamp trigger owns submitted_at, so this CHECK
  -- always holds rather than being a race the app has to avoid.
  constraint weekly_updates_status_submitted_ck
    check ((status = 'submitted') = (submitted_at is not null)),
  constraint weekly_updates_person_week_uq
    unique (org_id, person_id, week_start)
);
comment on table mos.weekly_updates is
  'Person-keyed weekly update (OD-P2-10/13). UPWARD-ONLY read — author plus their manager chain, NOT org-readable (OD-P1-3). Author-only write.';
create index weekly_updates_person_week_idx on mos.weekly_updates (person_id, week_start);
create index weekly_updates_org_week_idx    on mos.weekly_updates (org_id, week_start);
create trigger weekly_updates_set_updated_at
  before update on mos.weekly_updates
  for each row execute function shared.set_updated_at();

create table mos.weekly_update_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references shared.orgs(id) on delete cascade,
  weekly_update_id  uuid not null references mos.weekly_updates(id) on delete cascade,
  label             text not null check (btrim(label) <> ''),
  progress          text not null default 'in_progress'
                      check (progress in ('done','in_progress','blocked')),
  position          integer not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table mos.weekly_update_items is
  'One line of a weekly update: free text + progress marker + order (OD-P2-10). Deliberately NO FK to mos.tasks. Inherits the parent''s upward-only read.';
create index weekly_update_items_parent_idx on mos.weekly_update_items (weekly_update_id, position);
create index weekly_update_items_org_idx    on mos.weekly_update_items (org_id);
create trigger weekly_update_items_set_updated_at
  before update on mos.weekly_update_items
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Communication about work — comments, notifications, push subscriptions
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Polymorphic by design: entity_id is a bare uuid because a comment attaches to five different
-- tables and a single FK cannot express that. The existence and tenancy of the target are enforced
-- by mos._guard_comments instead — see ...0006.
create table mos.comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  author_id   uuid not null references shared.people(id) on delete cascade,
  entity_type text not null
                check (entity_type in ('task','weekly_update','daily_log','follow_up','signal')),
  entity_id   uuid not null,
  body        text not null check (btrim(body) <> ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.comments is
  'Append-only comments on MOS work items (ADR-0019 D4, ADR-0050 D3 reuse). Same-org read for the four legacy entity types; signal comments additionally inherit the Signal read gate. No UPDATE or DELETE grant.';
create index mos_comments_entity_created_idx on mos.comments (org_id, entity_type, entity_id, created_at);
create index mos_comments_author_created_idx on mos.comments (author_id, created_at desc);

create table mos.notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  owner_id    uuid not null references shared.people(id) on delete cascade,
  severity    text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title       text not null check (btrim(title) <> ''),
  body        text,
  -- deep-link payload: { source, entity: { type, id, route } } routing an Inbox row to its surface.
  metadata    jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
comment on table mos.notifications is
  'The owner-private notification inbox (ADR-0019 D9). Content is immutable once delivered; read_at and handled_at are the only mutable columns. Cross-owner delivery goes through mos.create_notification, never a direct insert.';
comment on column mos.notifications.handled_at is
  'Set when the owner explicitly triaged this row out of their active Inbox queue. NULL = still active (including read-but-unhandled). PRIVATE notification state only — never Task completion, Signal acknowledgement, approval or ownership.';
create index mos_notifications_owner_unread_idx    on mos.notifications (owner_id) where read_at is null;
create index mos_notifications_owner_unhandled_idx on mos.notifications (owner_id) where handled_at is null;
create index mos_notifications_owner_created_idx   on mos.notifications (owner_id, created_at desc);

create table mos.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  owner_id    uuid not null references shared.people(id) on delete cascade,
  endpoint    text not null check (btrim(endpoint) <> ''),
  keys        jsonb not null default '{}'::jsonb,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, endpoint)
);
comment on table mos.push_subscriptions is
  'Owner-scoped browser push subscriptions. The VAPID server keys are secrets held outside the database and are never stored here.';
create index mos_push_subscriptions_owner_idx on mos.push_subscriptions (owner_id, created_at desc);
create trigger push_subscriptions_set_updated_at
  before update on mos.push_subscriptions
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. User-composed surfaces and the deputy transcript
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table mos.user_views (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  owner_id    uuid not null references shared.people(id),
  name        text not null check (btrim(name) <> ''),
  spec        jsonb not null default '{}'::jsonb,
  scope       text not null default 'private' check (scope in ('private','shared_team')),
  kind        text,
  context     text,
  lifecycle   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint mos_user_views_kind_ck      check (kind      is null or kind      in ('composition','collection')),
  constraint mos_user_views_context_ck   check (context   is null or context   in ('home','work')),
  constraint mos_user_views_lifecycle_ck check (lifecycle is null or lifecycle in ('active','archived')),
  -- Structural coherence: the classifier tuple is all-or-nothing, a collection row must be
  -- Work-context and carry a valid versioned collection spec, and lifecycle tracks archived_at.
  -- The all-null branch is what lets a composition row predating the classifier stay valid.
  constraint mos_user_views_metadata_ck check (
    (kind is null and context is null and lifecycle is null)
    or (
      kind is not null and context is not null and lifecycle is not null
      and (
        (lifecycle = 'archived' and archived_at is not null)
        or (lifecycle = 'active'  and archived_at is null)
      )
      and (
        (
          kind = 'collection'
          and context = 'work'
          and (spec->>'kind') = 'collection'
          and (spec->>'version') = '1'
          and (spec->>'collectionId') in ('tasks','signals')
        )
        or (
          kind = 'composition'
          and context in ('home','work')
        )
      )
    )
  )
);
comment on table mos.user_views is
  'Declarative user-composed surfaces (ADR-0017 D5/D6, ADR-0018 D6). Private to the owner, or shared down the reporting line via scope=shared_team. The org gate is on EVERY select branch.';
comment on column mos.user_views.kind is 'composition (Home/dashboard) or collection (Work RecordCollection). NULL on a row predating the classifier.';
comment on column mos.user_views.lifecycle is 'active | archived — kept consistent with archived_at by mos_user_views_metadata_ck.';
create index mos_user_views_org_idx   on mos.user_views (org_id);
create index mos_user_views_live_idx  on mos.user_views (org_id) where archived_at is null;
create index mos_user_views_owner_idx on mos.user_views (owner_id) where archived_at is null;
create index mos_user_views_collection_live_idx
  on mos.user_views (org_id, context, updated_at desc)
  where kind = 'collection' and context = 'work' and lifecycle = 'active' and archived_at is null;
create index mos_user_views_collection_owner_idx
  on mos.user_views (owner_id, context, updated_at desc)
  where kind = 'collection' and context = 'work' and lifecycle = 'active' and archived_at is null;
create trigger user_views_set_updated_at
  before update on mos.user_views
  for each row execute function shared.set_updated_at();

-- The deputy's persisted transcript. Owner-only at every layer: no manager share, and no admin
-- cross-owner read (ADR-0017 D2/D10) — an admin of the org still reads zero rows they do not own.
create table mos.agent_threads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  owner_id    uuid not null references shared.people(id),
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.agent_threads is 'One deputy conversation container. Owner-only: no manager share, no admin cross-owner read.';
create index mos_agent_threads_org_idx   on mos.agent_threads (org_id);
create index mos_agent_threads_owner_idx on mos.agent_threads (owner_id);
create trigger agent_threads_set_updated_at
  before update on mos.agent_threads
  for each row execute function shared.set_updated_at();

create table mos.agent_runs (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references mos.agent_threads(id) on delete cascade,
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  owner_id    uuid not null references shared.people(id),
  status      text not null default 'running'
                check (status in ('running','needs-approval','completed','error','cancelled')),
  route       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.agent_runs is 'One deputy turn-loop invocation within a thread. Owner-only.';
create index mos_agent_runs_thread_idx on mos.agent_runs (thread_id);
create index mos_agent_runs_org_idx    on mos.agent_runs (org_id);
create index mos_agent_runs_owner_idx  on mos.agent_runs (owner_id);
create trigger agent_runs_set_updated_at
  before update on mos.agent_runs
  for each row execute function shared.set_updated_at();

create table mos.agent_events (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references mos.agent_runs(id) on delete cascade,
  org_id             uuid not null references shared.orgs(id) on delete cascade,
  owner_id           uuid not null references shared.people(id),
  seq                integer not null,
  type               text not null,
  text               text,
  payload            jsonb not null default '{}'::jsonb,
  tool_name          text,
  tool_args_hash     text,
  tool_status        text check (tool_status in ('pending','completed','errored')),
  rating             text check (rating in ('up','down')),
  downvote_reason    text,
  created_at         timestamptz not null default now(),
  constraint agent_events_run_seq_uk unique (run_id, seq),
  -- Named explicitly so the type vocabulary is greppable and its DOWN is a one-liner. `user` and
  -- `artifact` are what make a thread replayable: without a persisted user turn the model message
  -- array cannot be rebuilt from the database.
  constraint agent_events_type_check
    check (type in ('user','assistant','tool','artifact','status','system'))
);
comment on table mos.agent_events is
  'The replayable deputy transcript, seq-ordered per run. Append-only except a rating/downvote_reason feedback flip on the owner''s own assistant row.';
comment on constraint agent_events_type_check on mos.agent_events is
  'user = the echoed user turn; artifact = a compose_view journal entry; both are fully immutable. Every non-assistant type is immutable in full (mos._guard_agent_events).';
create index mos_agent_events_run_idx   on mos.agent_events (run_id, seq);
create index mos_agent_events_org_idx   on mos.agent_events (org_id);
create index mos_agent_events_owner_idx on mos.agent_events (owner_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 8. Money — certified metric definitions and captured budgets (ADR-0022)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The registry of blessed metric DEFINITIONS — the guard against "my COGS is not your COGS".
-- Migration-seeded with no runtime CRUD, exactly like shared.role_capabilities: a figure's
-- certified definition is code-owned reference data, not tenant data someone edits in the app.
create table mos.certified_metrics (
  key           text not null check (btrim(key) <> ''),
  org_id        uuid not null references shared.orgs(id) on delete cascade,
  name          text not null check (btrim(name) <> ''),
  meaning       text not null check (btrim(meaning) <> ''),
  unit          text not null check (btrim(unit) <> ''),
  grain         text not null check (btrim(grain) <> ''),
  certified     boolean not null default true,
  certified_at  timestamptz,
  certified_by  uuid references shared.people(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (org_id, key)
);
comment on table mos.certified_metrics is
  'Certified-metric registry — blessed figure definitions (ADR-0022 D6). Migration-seeded, no runtime CRUD. An uncertified definition renders a fail-loud badge rather than a silent number.';
comment on column mos.certified_metrics.certified is
  'True when Finance has blessed this definition. False or absent renders the fail-loud uncertified badge.';
create index certified_metrics_org_idx on mos.certified_metrics (org_id);
create trigger certified_metrics_set_updated_at
  before update on mos.certified_metrics
  for each row execute function shared.set_updated_at();

-- A Budget is a menu item's BOM costed at the LINKED ingredient cost lines, captured as a scenario.
-- Anchor A5 — LINK, never copy: there is no unit_cost column anywhere below. The per-ingredient cost
-- is always resolved by joining the linked cost line, so a budget can never carry a stale number
-- that silently disagrees with the certified source.
create table mos.budgets (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references shared.orgs(id) on delete cascade,
  menu_item_esb_code   text not null check (btrim(menu_item_esb_code) <> ''),
  menu_item_name       text not null check (btrim(menu_item_name) <> ''),
  scenario_label       text not null check (btrim(scenario_label) <> ''),
  scenario_type        text not null default 'baseline'
                         check (scenario_type in ('baseline','promo','new_branch','menu')),
  owning_bu_id         uuid not null references shared.business_units(id),
  total_budgeted_cogs  numeric(14,4) not null check (total_budgeted_cogs >= 0),
  cost_basis_as_of     timestamptz not null,
  certified_metric_key text not null default 'cogs.budgeted' check (btrim(certified_metric_key) <> ''),
  is_complete          boolean not null default true,
  notes                text,
  archived_at          timestamptz,
  created_by           uuid not null references shared.people(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table mos.budgets is
  'A captured budgeted-COGS scenario over a menu-item BOM (ADR-0022 D1). Soft-archive only. Written ONLY through mos.capture_budget, which recomputes the total server-side.';
comment on column mos.budgets.total_budgeted_cogs is
  'The captured derived total (BOM x linked cost lines at capture) — a reproducible scenario snapshot, never a client-supplied figure and never a copied ingredient unit cost.';
comment on column mos.budgets.is_complete is
  'False when a BOM ingredient lacked a linked cost line at capture, so the total is partial. Rendered as incomplete rather than as a silent zero.';
create index budgets_org_idx        on mos.budgets (org_id);
create index budgets_org_menu_idx   on mos.budgets (org_id, menu_item_esb_code);
create index budgets_owning_bu_idx  on mos.budgets (owning_bu_id);
create index budgets_active_org_idx on mos.budgets (org_id) where archived_at is null;
create trigger budgets_set_updated_at
  before update on mos.budgets
  for each row execute function shared.set_updated_at();

create table mos.budget_lines (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references shared.orgs(id) on delete cascade,
  budget_id            uuid not null references mos.budgets(id) on delete cascade,
  ingredient_esb_code  text not null check (btrim(ingredient_esb_code) <> ''),
  recipe_qty           numeric(14,4) not null check (recipe_qty > 0),
  qty_unit             text not null check (btrim(qty_unit) <> ''),
  created_at           timestamptz not null default now()
);
comment on table mos.budget_lines is
  'Per-ingredient breakdown of a budget. Deliberately carries NO unit_cost column (anchor A5, link-never-copy): the cost is resolved by joining the linked cost line on ingredient_esb_code.';
create index budget_lines_budget_idx     on mos.budget_lines (budget_id);
create index budget_lines_org_idx        on mos.budget_lines (org_id);
create index budget_lines_ingredient_idx on mos.budget_lines (org_id, ingredient_esb_code);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 9. The AR bridge — carried as-is, deliberately dark (DD-WAY-16, OD-WAY-34)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ KNOWN-WRONG SHAPE, CARRIED ON PURPOSE. OD-WAY-34 rules that this is a finance/accounting record
-- rather than work, that the scope is the retail pending-bill stream only, and that the job is
-- reconciliation rather than chasing — which invalidates the `b2b_ar` kind, the lane split and the
-- chase states below. The right shape is not yet decided, the table has zero rows, and there is no
-- importer, so DD-WAY-16 rules that reshaping now would only mean migrating twice. Do not "fix" the
-- model here. When it is rebuilt, the name goes too — "Follow-up" names chasing.
create table mos.follow_ups (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references shared.orgs(id) on delete cascade,
  counterparty       text not null check (btrim(counterparty) <> ''),
  kind               text not null check (kind in ('b2b_ar','retail_pending')),
  lane               text not null check (lane in ('b2b_sales','retail_ops')),
  source_invoice_ref text,
  original_amount    numeric(14,2) not null check (original_amount > 0),
  running_balance    numeric(14,2) not null check (running_balance >= 0),
  state              text not null default 'open'
                       check (state in ('open','chased','promised','partial','settled','confirmed')),
  promise_date       date,
  issued_date        date,
  due_date           date,
  assigned_to        uuid references shared.people(id) on delete set null,
  notes              text,
  created_by         uuid references shared.people(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint follow_ups_kind_lane_pair check (
    (kind = 'b2b_ar'         and lane = 'b2b_sales') or
    (kind = 'retail_pending' and lane = 'retail_ops')
  ),
  -- The balance can never exceed the original: there is no such thing as a negative payment. Also
  -- enforced in the transition RPC; kept here because a constraint survives an RPC bug.
  constraint follow_ups_balance_within_original check (running_balance <= original_amount)
);
comment on table mos.follow_ups is
  'One outstanding commitment (ADR-0019 D5). ⚠ DARK and known-wrong-shaped: OD-WAY-34 invalidates the kind, the lane split and the chase states, and DD-WAY-16 rules it ports as-is rather than being migrated twice. Deferred past the MVP.';
create unique index follow_ups_source_ref_unique
  on mos.follow_ups (org_id, source_invoice_ref) where source_invoice_ref is not null;
create index follow_ups_org_lane_state_idx   on mos.follow_ups (org_id, lane, state);
create index follow_ups_org_state_idx        on mos.follow_ups (org_id, state);
create index follow_ups_org_counterparty_idx on mos.follow_ups (org_id, counterparty);
create trigger follow_ups_set_updated_at
  before update on mos.follow_ups
  for each row execute function shared.set_updated_at();

create table mos.follow_up_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references shared.orgs(id) on delete cascade,
  follow_up_id    uuid not null references mos.follow_ups(id) on delete cascade,
  transition      text not null check (transition in ('chase','promise','partial','settle','confirm')),
  from_state      text not null check (from_state in ('open','chased','promised','partial','settled','confirmed')),
  to_state        text not null check (to_state   in ('open','chased','promised','partial','settled','confirmed')),
  amount          numeric(14,2),
  cash_in_date    date,
  evidence        text,
  promise_date    date,
  note            text,
  actor_person_id uuid references shared.people(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- Defence in depth behind the RPC: a money movement always carries the amount, the date the cash
  -- actually landed, and proof. Those three are what Finance matches to the bank statement.
  constraint follow_up_events_payment_fields check (
    transition not in ('partial','settle')
    or (amount is not null and amount > 0 and cash_in_date is not null and btrim(coalesce(evidence,'')) <> '')
  )
);
comment on table mos.follow_up_events is
  'The audited settlement ledger — one row per transition. partial/settle carry the required amount + cash-in date + evidence.';
create index follow_up_events_fu_idx  on mos.follow_up_events (org_id, follow_up_id, created_at);
create index follow_up_events_org_idx on mos.follow_up_events (org_id, created_at);

-- ── The AR bridge's reporting landing zone ───────────────────────────────────────────────────
-- ⚠ THIS IS A `reporting` TABLE IN THE `mos` PASS, AND IT IS DELIBERATE. #185 MUST NOT RE-CREATE IT.
-- mos.follow_up_recon_drift (…0007) is a VIEW over it, and Postgres validates a view's references at
-- creation time — so the table has to exist before the mos pass finishes. Splitting the AR bridge
-- across two tickets to satisfy file ordering would be precisely the reshape DD-WAY-16 forbids.
-- Empty until the warehouse snapshot job is wired; the table exists so the drift view is real
-- rather than faked.
create table reporting.esb_ar_reduction (
  org_id               uuid not null references shared.orgs(id) on delete cascade,
  counterparty         text not null check (btrim(counterparty) <> ''),
  period               text not null check (btrim(period) <> ''),
  esb_reduction_amount numeric(14,2) not null,
  snapshot_as_of       timestamptz not null,
  loaded_at            timestamptz not null default now(),
  primary key (org_id, counterparty, period)
);
comment on table reporting.esb_ar_reduction is
  'Curated ERP aggregate AR-reduction journal — the secondary cross-check behind MOS''s per-invoice truth (ADR-0019 D5). Snapshot-fed; empty until the warehouse feed lands. AUTHORED IN THE mos PASS with the rest of the AR bridge (DD-WAY-16); the reporting pass must not re-create it.';
create index esb_ar_reduction_org_period_idx on reporting.esb_ar_reduction (org_id, period);
