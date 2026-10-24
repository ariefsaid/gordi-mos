-- mos, Private Task (#1839) follow-ups: mention notices reach only readers, notices are purged when
-- the PIC / Supervisor / admin role changes, the who-can-see list's "added by" is the caller, and
-- the read paths a non-reader must not count through (list history, Process roll-up, Signal filter).
--
-- Personas (shared._test_seed_directory + _test_seed_access_roles): d1 creator · d4 PIC · d2 Supervisor ·
-- d5 on the list · d3 admin · d7 unrelated member · d6 spare. Team K holds d7 and d5.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

insert into shared.teams (id, org_id, business_unit_id, name, code) values
  ('00000000-0000-0000-0000-000000008810','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2','Follow-up Team','followup_team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-000000008810',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-000000008810',false);

-- Private Tasks: A (mentions), B (PIC / Supervisor change), C (admin role loss, list history, Signal, run).
insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id,
                       created_by, is_private) values
  ('00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-0000000000a1','Mention private',
   '00000000-0000-0000-0000-0000000000a2',null,'00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1', true),
  ('00000000-0000-0000-0000-000000008002','00000000-0000-0000-0000-0000000000a1','Handoff private',
   '00000000-0000-0000-0000-0000000000a2',null,'00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1', true),
  ('00000000-0000-0000-0000-000000008003','00000000-0000-0000-0000-0000000000a1','Roll-up private',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000008810','00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1', true);
insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id) values
  ('00000000-0000-0000-0000-000000008811','00000000-0000-0000-0000-0000000000a1','Follow-up Process','process',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1');
insert into mos.process_runs (id, org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
                              definition_version, spec_snapshot, started_by) values
  ('00000000-0000-0000-0000-000000008812','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000008811',
   '00000000-0000-0000-0000-000000008810','2026-10-23','Follow-up Run', date '2026-10-23', 1, '{}'::jsonb,
   '00000000-0000-0000-0000-0000000000d1');
-- Task C and a public Task share the run; the public one is what a non-reader still counts.
update mos.tasks set process_run_id = '00000000-0000-0000-0000-000000008812', work_line_id = '00000000-0000-0000-0000-000000008811'
 where id = '00000000-0000-0000-0000-000000008003';
insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id,
                       created_by, process_run_id, work_line_id) values
  ('00000000-0000-0000-0000-000000008004','00000000-0000-0000-0000-0000000000a1','Roll-up public',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000008810','00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-000000008812','00000000-0000-0000-0000-000000008811');
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by) values
  ('00000000-0000-0000-0000-000000008005','00000000-0000-0000-0000-0000000000a1','Manager turns private',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1');
insert into mos.signals (id, org_id, author_id, audience, occurred_at, body) values
  ('00000000-0000-0000-0000-000000008401','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','org', now(), 'Follow-up signal');
insert into mos.signal_tasks (org_id, signal_id, task_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000008401',
   '00000000-0000-0000-0000-000000008003','00000000-0000-0000-0000-0000000000d4');
-- Notices already delivered: B to its PIC, Supervisor and creator; C to the admin.
insert into mos.notifications (org_id, owner_id, severity, title, metadata)
select '00000000-0000-0000-0000-0000000000a1', o, 'info', 'Earlier notice',
       jsonb_build_object('source','task_comment','entity',jsonb_build_object('type','task','id',t))
  from (values ('00000000-0000-0000-0000-0000000000d4'::uuid,'00000000-0000-0000-0000-000000008002'::uuid),
               ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000008002'),
               ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000008002'),
               ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-000000008003')) v(o, t);

create function pg_temp.as_(p text, r text default 'member') returns void
language sql as $f$
  select shared._test_set_access_roles(format(
    '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000%s","access_roles":["%s"]}',
    p, r))
$f$;
create function pg_temp.notices(p_owner text, p_task text) returns integer
language sql security definer as $f$
  select count(*)::int from mos.notifications
   where owner_id = ('00000000-0000-0000-0000-0000000000' || p_owner)::uuid
     and metadata #>> '{entity,id}' = ('00000000-0000-0000-0000-' || p_task)
$f$;
create function pg_temp.mention(p_kind text, p_id text) returns jsonb language sql as $f$
  select jsonb_build_object('type','mention','props',jsonb_build_object('kind',p_kind,'id',p_id))
$f$;

set local role authenticated;

-- ── Mention notices on a private Task reach readers only ────────────────────────────────────
-- d7 is mentioned as a person and, with d5, through Team K; d1 (creator) and d3 (admin) are mentioned too.
select pg_temp.as_('d3', 'admin');
select pg_temp.as_('d4');
update mos.tasks set body = jsonb_build_array(jsonb_build_object('type','paragraph','content', jsonb_build_array(
    pg_temp.mention('person','00000000-0000-0000-0000-0000000000d7'),
    pg_temp.mention('team','00000000-0000-0000-0000-000000008810'),
    pg_temp.mention('person','00000000-0000-0000-0000-0000000000d1'),
    pg_temp.mention('person','00000000-0000-0000-0000-0000000000d3'))))
 where id = '00000000-0000-0000-0000-000000008001';
select is(pg_temp.notices('d7', '000000008001'), 0,
  'a mention of someone who cannot read the private Task, as a person and through a Team, writes no notice');
select is(pg_temp.notices('d1', '000000008001'), 1, 'the creator is notified of a mention');
select is(pg_temp.notices('d3', '000000008001'), 1, 'an admin is notified of a mention');
select is(pg_temp.notices('d5', '000000008001'), 0,
  'a Team member not yet on the list is not notified either');
reset role;
insert into mos.task_viewers (task_id, person_id, org_id, created_by) values
  ('00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-0000000000d5',
   '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
select pg_temp.as_('d4');
-- The Team mention is dropped and written again, so it counts as newly mentioned.
update mos.tasks set body = jsonb_build_array(jsonb_build_object('type','paragraph','content', jsonb_build_array(
    pg_temp.mention('person','00000000-0000-0000-0000-0000000000d1'))))
 where id = '00000000-0000-0000-0000-000000008001';
update mos.tasks set body = jsonb_build_array(jsonb_build_object('type','paragraph','content', jsonb_build_array(
    pg_temp.mention('person','00000000-0000-0000-0000-0000000000d1'),
    pg_temp.mention('team','00000000-0000-0000-0000-000000008810'))))
 where id = '00000000-0000-0000-0000-000000008001';
select is(pg_temp.notices('d5', '000000008001'), 1, 'a listed viewer mentioned through a Team is notified');
select is(pg_temp.notices('d7', '000000008001'), 0, '...and the non-reader still is not');

-- ── Notices leave with access: PIC and Supervisor changes ────────────────────────────────────
select pg_temp.as_('d4');
update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d5'
 where id = '00000000-0000-0000-0000-000000008002';
select is(pg_temp.notices('d4', '000000008002'), 0, 'the former PIC''s notices about the private Task are removed');
select is(pg_temp.notices('d2', '000000008002'), 1, '...the Supervisor''s stay');
select is(pg_temp.notices('d1', '000000008002'), 1, '...and the creator''s stay');
select pg_temp.as_('d5');
update mos.tasks set accountable_person_id = '00000000-0000-0000-0000-0000000000d6'
 where id = '00000000-0000-0000-0000-000000008002';
select is(pg_temp.notices('d2', '000000008002'), 0, 'the former Supervisor''s notices are removed');
select is(pg_temp.notices('d1', '000000008002'), 1, '...the creator''s stay');

-- ── Notices leave with access: admin role revoked ────────────────────────────────────────────
select is(pg_temp.notices('d3', '000000008003'), 1, 'an admin holds a notice about a private Task');
reset role;
-- The last-admin guard needs a signed-in session and sign-in accounts; this test is about the notices.
alter table shared.person_access_roles disable trigger person_access_roles_guard;
update shared.person_access_roles set revoked_at = now()
 where person_id = '00000000-0000-0000-0000-0000000000d3' and access_role = 'admin';
alter table shared.person_access_roles enable trigger person_access_roles_guard;
select is(pg_temp.notices('d3', '000000008003'), 0, 'losing the admin role removes notices about private Tasks they cannot otherwise read');
set local role authenticated;

-- ── Who-can-see list: "added by" is the caller ───────────────────────────────────────────────
select pg_temp.as_('d4');
select throws_ok($$
  insert into mos.task_viewers (task_id, person_id, created_by)
  values ('00000000-0000-0000-0000-000000008003','00000000-0000-0000-0000-0000000000d6',
          '00000000-0000-0000-0000-0000000000d1')
$$, '42501', null, 'a person cannot add someone to the list in another person''s name');
select lives_ok($$
  insert into mos.task_viewers (id, task_id, person_id)
  values ('00000000-0000-0000-0000-000000008a01','00000000-0000-0000-0000-000000008003','00000000-0000-0000-0000-0000000000d6')
$$, 'the list takes a person added in the caller''s own name');
select is((select created_by from mos.task_viewers where id = '00000000-0000-0000-0000-000000008a01'),
  '00000000-0000-0000-0000-0000000000d4'::uuid, '...and records the caller as who added them');

-- ── List changes are history only for people who can read the Task ───────────────────────────
select is((select count(*)::int from shared.record_history
            where table_name = 'task_viewers' and record_key = '00000000-0000-0000-0000-000000008a01'), 1,
  'the PIC reads the adding of a list entry in history');
select pg_temp.as_('d7');
select is((select count(*)::int from shared.record_history
            where table_name = 'task_viewers' and record_key = '00000000-0000-0000-0000-000000008a01'), 0,
  'a non-reader does not read the adding');
select pg_temp.as_('d4');
delete from mos.task_viewers where id = '00000000-0000-0000-0000-000000008a01';
select is((select count(*)::int from shared.record_history
            where table_name = 'task_viewers' and record_key = '00000000-0000-0000-0000-000000008a01'), 1,
  'the PIC reads the removal of a list entry in history');
select pg_temp.as_('d7');
select is((select count(*)::int from shared.record_history
            where table_name = 'task_viewers' and record_key = '00000000-0000-0000-0000-000000008a01'), 0,
  'a non-reader does not read the removal');

-- ── Process roll-up and the Signal filter count only what the caller reads ───────────────────
select is((select total::int from mos.process_run_rollup where process_run_id = '00000000-0000-0000-0000-000000008812'), 1,
  'a non-reader''s Process roll-up counts the public Task only');
select is(jsonb_array_length(api_v1.list_signals(linked_task_id => '00000000-0000-0000-0000-000000008003') -> 'items'), 0,
  'the agent''s Signal list filtered by a private Task finds nothing for a non-reader');
select pg_temp.as_('d4');
select is((select total::int from mos.process_run_rollup where process_run_id = '00000000-0000-0000-0000-000000008812'), 2,
  'a reader''s Process roll-up counts both Tasks');
select is(jsonb_array_length(api_v1.list_signals(linked_task_id => '00000000-0000-0000-0000-000000008003') -> 'items'), 1,
  'the agent''s Signal list filtered by a private Task finds the Signal for a reader');

-- ── A manager who turns Private on is not refused for losing the read afterwards ───────────
-- The app updates without asking for the row back (a count only), as d3 is an editor but not a reader.
select pg_temp.as_('d3', 'member');
select lives_ok($$update mos.tasks set is_private = true where id = '00000000-0000-0000-0000-000000008005'$$,
  'a manager above the PIC turns Private on without being refused the read of the row they saved');
reset role;
select is((select is_private from mos.tasks where id = '00000000-0000-0000-0000-000000008005'), true,
  '...and the change is saved');

select * from finish();
rollback;
