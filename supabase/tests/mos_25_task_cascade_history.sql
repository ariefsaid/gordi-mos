-- mos — batch 2a of the change-history rollout (#986, Slice 2): the six task-cascade tables —
-- tasks, task_checklist_items, process_cadences, process_task_defs, process_runs and
-- process_run_pending_tasks — write shared.record_history through the one generic trigger,
-- mos.tasks' mechanical last_activity_at clock is excluded from the diff, and every new dispatch
-- arm is readable by an org member and by nobody from another org. The mechanism itself (grant
-- posture, append-only, actor capture) is shared_17's file; per-record read gating on Slice 1's
-- tables is mos_24's file.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select shared._test_seed_directory();

-- Minimal rows in all six tables, seeded by hand as a service session (no claims): org A (...0a1)
-- carries the audited records, org B (...0b1) gets one real Task so the isolation read below
-- proves isolation rather than emptiness. Required NOT NULLs per the table definitions: a Task
-- needs business_unit_id + responsible/accountable/created_by people (the directory fixture's
-- ...0d1), a run needs a Team, a task-def needs a PIC binding (the pic_binding check), a run's
-- pending row needs a reason.
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000009910', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a2', 'History Team', 'history_team');
insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id)
values ('00000000-0000-0000-0000-000000009911', '00000000-0000-0000-0000-0000000000a1',
        'History Process', 'process', '00000000-0000-0000-0000-0000000000a2',
        '00000000-0000-0000-0000-0000000000d1');
insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind)
values ('00000000-0000-0000-0000-000000009912', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009911', 'daily');
insert into mos.process_task_defs (id, org_id, work_line_id, title, position, due_offset_days,
                                   checklist_items, pic_person_id)
values ('00000000-0000-0000-0000-000000009913', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009911', 'History step', 0, 0, '[]'::jsonb,
        '00000000-0000-0000-0000-0000000000d1');
insert into mos.process_runs (id, org_id, work_line_id, owning_team_id, period_key, caption,
                              scheduled_date, definition_version, spec_snapshot, started_by)
values ('00000000-0000-0000-0000-000000009914', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009911', '00000000-0000-0000-0000-000000009910',
        '2026-09-29', 'History Run', date '2026-09-29', 1, '{}'::jsonb,
        '00000000-0000-0000-0000-0000000000d1');
insert into mos.process_run_pending_tasks (id, org_id, process_run_id, task_def_id, reason)
values ('00000000-0000-0000-0000-000000009915', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009914', '00000000-0000-0000-0000-000000009913', 'none');
insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id,
                       accountable_person_id, created_by, work_line_id)
values ('00000000-0000-0000-0000-000000009916', '00000000-0000-0000-0000-0000000000a1',
        'History Task', '00000000-0000-0000-0000-0000000000a2',
        '00000000-0000-0000-0000-000000009910', '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-000000009911');
insert into mos.task_checklist_items (id, org_id, task_id, label, position)
values ('00000000-0000-0000-0000-000000009917', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009916', 'History step', 0);
-- The isolation control: a REAL org-B Task whose insert row org B can read and org A must not.
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id,
                       accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000009918', '00000000-0000-0000-0000-0000000000b1',
        'Foreign Task', '00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4',
        '00000000-0000-0000-0000-0000000000b4');

-- ── an INSERT appends exactly one summary row, on each of the six ─────────────────────────────
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'process_cadences'
             and record_key = '00000000-0000-0000-0000-000000009912'),
  1, 'an INSERT into mos.process_cadences appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'process_task_defs'
             and record_key = '00000000-0000-0000-0000-000000009913'),
  1, 'an INSERT into mos.process_task_defs appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'process_runs'
             and record_key = '00000000-0000-0000-0000-000000009914'),
  1, 'an INSERT into mos.process_runs appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'process_run_pending_tasks'
             and record_key = '00000000-0000-0000-0000-000000009915'),
  1, 'an INSERT into mos.process_run_pending_tasks appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'tasks'
             and record_key = '00000000-0000-0000-0000-000000009916'),
  1, 'an INSERT into mos.tasks appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'task_checklist_items'
             and record_key = '00000000-0000-0000-0000-000000009917'),
  1, 'an INSERT into mos.task_checklist_items appends exactly one history row');

-- ── a two-column UPDATE appends exactly two rows, with the old and new values ─────────────────
update mos.tasks set title = 'Renamed Task', description = 'Now described'
 where id = '00000000-0000-0000-0000-000000009916';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916'),
  3, 'a two-column UPDATE on mos.tasks appends exactly two rows (insert + 2)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916' and field_name = 'title'),
  'History Task', 'the changed title records the old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916' and field_name = 'title'),
  'Renamed Task', 'the changed title records the new value');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916' and field_name = 'description'),
  null, 'a description set from NULL records a NULL old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916' and field_name = 'description'),
  'Now described', 'the new description is text-cast from the source column');

update mos.process_cadences set cadence_kind = 'weekly', active = false
 where id = '00000000-0000-0000-0000-000000009912';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009912'),
  3, 'a two-column UPDATE on mos.process_cadences appends exactly two rows (insert + 2)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009912' and field_name = 'cadence_kind'),
  'daily', 'the changed cadence_kind records the old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009912' and field_name = 'cadence_kind'),
  'weekly', 'the changed cadence_kind records the new value');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009912' and field_name = 'active'),
  'true', 'a boolean old value is text-cast honestly');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009912' and field_name = 'active'),
  'false', 'the boolean new value is text-cast honestly');

-- ── a no-op write appends nothing ─────────────────────────────────────────────────────────────
update mos.tasks set title = 'Renamed Task'
 where id = '00000000-0000-0000-0000-000000009916';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916'),
  3, 'an UPDATE that changes no column appends no row');
update mos.task_checklist_items set is_done = true
 where id = '00000000-0000-0000-0000-000000009917';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009917'),
  2, 'a checklist toggle appends exactly one update row (insert + 1)');
update mos.task_checklist_items set is_done = true
 where id = '00000000-0000-0000-0000-000000009917';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009917'),
  2, 'a repeated no-op toggle appends no row');

-- ── the actor is the writing session's person claim ───────────────────────────────────────────
-- Two genuinely admitted personas: the Task's R/A (...0d1) edits as a plain member; the
-- step-definition edit rides the org admin's workline.manage (the authority matrix owns that gate
-- — a plain member is not admitted, by design).
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.tasks set title = 'Admin Renamed'
 where id = '00000000-0000-0000-0000-000000009916';

select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916'
             and field_name = 'title' and old_value = 'Renamed Task'),
  '00000000-0000-0000-0000-0000000000d1',
  'an authenticated Task edit stamps the session''s person claim as actor');
-- The checklist toggle's diff and actor, proven by an authenticated flip of the same item: the
-- first toggle ran unclaimed (the seed path), so the flip is the behavior-owning write (review).
update mos.task_checklist_items set is_done = false
 where id = '00000000-0000-0000-0000-000000009917';
select is((select field_name from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009917' and action = 'update'
             and old_value = 'true'),
  'is_done', 'the checklist flip records the exact changed field with its old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009917' and action = 'update'
             and field_name = 'is_done' and old_value = 'true'),
  'false', '...and its new value');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009917' and action = 'update'
             and old_value = 'true'),
  '00000000-0000-0000-0000-0000000000d1',
  'the checklist flip stamps the writing session''s person claim as actor');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009917'),
  3, 'an authorized reader sees the checklist item''s whole history (insert + toggle + flip)');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
update mos.process_task_defs set title = 'History step v2'
 where id = '00000000-0000-0000-0000-000000009913';

select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009913' and field_name = 'title'),
  '00000000-0000-0000-0000-0000000000d3',
  'an authenticated step-definition edit stamps its own session''s person claim as actor');

-- ── AC-007: a reader of the records reads their history; another org reads none of it ─────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'tasks'
             and record_key = '00000000-0000-0000-0000-000000009916'),
  4, 'an org member reads the Task''s history (insert + 2-field update + actor edit)');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'task_checklist_items'
             and record_key = '00000000-0000-0000-0000-000000009917'),
  3, 'an org member reads the checklist item''s history (insert + toggle + flip)');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'process_cadences'
             and record_key = '00000000-0000-0000-0000-000000009912'),
  3, 'an org member reads the cadence''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'process_task_defs'
             and record_key = '00000000-0000-0000-0000-000000009913'),
  2, 'an org member reads the step-definition''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'process_runs'
             and record_key = '00000000-0000-0000-0000-000000009914'),
  1, 'an org member reads the run''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'process_run_pending_tasks'
             and record_key = '00000000-0000-0000-0000-000000009915'),
  1, 'an org member reads the pending row''s history');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009918'),
  0, 'an org-A member cannot read the org-B Task''s history');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
-- Scoped to the six task-cascade tables: later batches (#989) wire the shared directory, whose
-- org-B history an org-B member legitimately reads — the wall asserted here is around org A's tasks.
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos'
             and table_name in ('tasks', 'task_checklist_items', 'process_cadences',
                                'process_task_defs', 'process_runs', 'process_run_pending_tasks')),
  1, 'another org''s member reads only their own Task''s one insert row — none of org A''s history');

-- ── the mechanical clock: last_activity_at is excluded, real columns are not ──────────────────
-- A task_event landing bumps the parent task's last_activity_at through
-- mos._touch_task_last_activity; that write must leave NO history trace. A statement that changes
-- a real column AND the clock must record the column and skip the clock.
reset role;
set local request.jwt.claims = '';
insert into mos.task_events (id, org_id, task_id, actor_person_id, event_type)
values ('00000000-0000-0000-0000-000000009919', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009916', '00000000-0000-0000-0000-0000000000d1', 'created');
select is((select count(*)::int from mos.task_events
           where id = '00000000-0000-0000-0000-000000009919'),
  1, 'the event row itself remains in mos.task_events — the history trigger adds, never replaces');
select is(
  (select t.last_activity_at = e.created_at from mos.tasks t, mos.task_events e
    where t.id = '00000000-0000-0000-0000-000000009916'
      and e.id = '00000000-0000-0000-0000-000000009919'),
  true, 'the bump set last_activity_at to the event''s timestamp — the existing feed/clock behavior is intact');
update mos.tasks set title = 'Clock Title', last_activity_at = now() + interval '1 hour'
 where id = '00000000-0000-0000-0000-000000009916';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916'
             and field_name = 'last_activity_at'),
  0, 'the mechanical last_activity_at clock writes no history row — neither from the event bump nor from a direct set');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009916'
             and field_name = 'title' and new_value = 'Clock Title'),
  1, 'the same statement''s title change IS recorded');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'tasks'
             and record_key = '00000000-0000-0000-0000-000000009916'),
  5, 'the Task''s row count adds only the title row (insert + 2 + actor edit + title, clock excluded)');

select * from finish();
rollback;
