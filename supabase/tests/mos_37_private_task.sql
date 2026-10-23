-- mos, Private Task (#1839): who reads a private Task and everything under it, the Supervisor
-- "None, just me" rule, who may change privacy, and notices that must not leak.
--
-- Personas (shared._test_seed_directory + _test_seed_access_roles):
--   d1 creator · d4 PIC · d2 Supervisor · d5 on the who-can-see list · d3 admin (JWT claim) ·
--   d7 unrelated member · b4 member of another org · d6 added to the list during the test.
-- d3 is also probed as a plain member: a manager above everyone who is not admin reads nothing.
-- Fixtures: T1 private (creator d1, PIC d4, Supervisor d2, listed d5) with a checklist item, an
-- event, a comment and a Signal link; T2 public; T3 private, created and run by d1 alone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-000000007900','00000000-0000-0000-0000-0000000000a1','Probe objective');
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id,
                       created_by, is_private, objective_id) values
  ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000a1','Probe private',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1', true,
   '00000000-0000-0000-0000-000000007900'),
  ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-0000000000a1','Probe public',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1', false,
   '00000000-0000-0000-0000-000000007900'),
  ('00000000-0000-0000-0000-000000007003','00000000-0000-0000-0000-0000000000a1','Probe solo private',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1', true,
   '00000000-0000-0000-0000-000000007900');
insert into mos.task_viewers (id, org_id, task_id, person_id, created_by) values
  ('00000000-0000-0000-0000-000000007a01','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000d5',
   '00000000-0000-0000-0000-0000000000d4');
insert into mos.task_checklist_items (id, org_id, task_id, label, position) values
  ('00000000-0000-0000-0000-000000007101','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000007001','Private step', 0);
insert into mos.task_events (id, org_id, task_id, actor_person_id, event_type) values
  ('00000000-0000-0000-0000-000000007201','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000d4','created');
insert into mos.comments (id, org_id, author_id, entity_type, entity_id, body) values
  ('00000000-0000-0000-0000-000000007301','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d4','task','00000000-0000-0000-0000-000000007001','Private note'),
  ('00000000-0000-0000-0000-000000007302','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d4','task','00000000-0000-0000-0000-000000007001','@Report look'),
  ('00000000-0000-0000-0000-000000007303','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d4','task','00000000-0000-0000-0000-000000007001','@GrandMgr look'),
  ('00000000-0000-0000-0000-000000007304','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d4','task','00000000-0000-0000-0000-000000007001','@Lead2Holder look'),
  ('00000000-0000-0000-0000-000000007305','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d4','task','00000000-0000-0000-0000-000000007002','@Lead2Holder look'),
  ('00000000-0000-0000-0000-000000007306','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d4','task','00000000-0000-0000-0000-000000007002','@GrandMgr look');
insert into mos.signals (id, org_id, author_id, audience, occurred_at, body) values
  ('00000000-0000-0000-0000-000000007401','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','org', now(), 'Probe signal');
insert into mos.signal_tasks (org_id, signal_id, task_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000007401',
   '00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000d4');

-- ── helpers (session-local) ──────────────────────────────────────────────────────────────────
create function pg_temp.as_(p text, r text default 'member', o text default 'a1') returns void
language sql as $f$
  select shared._test_set_access_roles(format(
    '{"org_id":"00000000-0000-0000-0000-0000000000%s","person_id":"00000000-0000-0000-0000-0000000000%s","access_roles":["%s"]}',
    o, p, r))
$f$;

create function pg_temp.get_title(p_id uuid) returns text language plpgsql as $f$
declare v text;
begin
  v := api_v1.get_task(p_id) -> 'item' ->> 'title';
  return coalesce(v, 'missing');
exception when others then
  return 'missing';
end $f$;

-- Task ids the agent API shows on the probe Signal; 0 when the Signal itself is not readable.
create function pg_temp.signal_task_ids() returns integer language plpgsql as $f$
begin
  return jsonb_array_length(api_v1.get_signal('00000000-0000-0000-0000-000000007401') -> 'item' -> 'task_ids');
exception when others then
  return 0;
end $f$;

-- Notices owned by one person about one Task. SECURITY DEFINER so the count passes the inbox RLS.
create function pg_temp.notices(p_owner text, p_task text) returns integer
language sql security definer as $f$
  select count(*)::int from mos.notifications
   where owner_id = ('00000000-0000-0000-0000-0000000000' || p_owner)::uuid
     and metadata #>> '{entity,id}' = ('00000000-0000-0000-0000-' || p_task)
$f$;

-- One reading of every read path for the signed-in person, against T1 (and the whole Task set for
-- the list, count, Objective roll-up and agent-list paths).
create function pg_temp.probe() returns jsonb language plpgsql as $f$
declare t constant uuid := '00000000-0000-0000-0000-000000007001';
begin
  return jsonb_build_object(
    'task',               (select count(*) from mos.tasks where id = t),
    'checklist',          (select count(*) from mos.task_checklist_items where task_id = t),
    'events',             (select count(*) from mos.task_events where task_id = t),
    'comments',           (select count(*) from mos.comments where entity_type = 'task' and entity_id = t),
    'viewers',            (select count(*) from mos.task_viewers where task_id = t),
    'signal_links',       (select count(*) from mos.signal_tasks where task_id = t),
    'history',            (select count(*) from shared.record_history where table_name = 'tasks' and record_key = t::text),
    'checklist_history',  (select count(*) from shared.record_history
                            where table_name = 'task_checklist_items'
                              and record_key = '00000000-0000-0000-0000-000000007101'),
    'task_list_count',    (select count(*) from mos.tasks),
    'objective_total',    (select coalesce(sum(total), 0) from mos.objective_progress),
    'api_list',           jsonb_array_length(api_v1.list_tasks(q => 'Probe') -> 'items'),
    'api_get',            pg_temp.get_title(t),
    'api_history',        jsonb_array_length(api_v1.get_record_history('task', t) -> 'items'),
    'api_signal_task_ids', pg_temp.signal_task_ids());
end $f$;

select is(
  (select column_default from information_schema.columns
    where table_schema = 'mos' and table_name = 'tasks' and column_name = 'is_private'), 'false',
  'AC1 data: a Task is not private unless asked');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'mos.task_viewers'::regclass),
  'the who-can-see list has forced row level security');

set local role authenticated;

-- ── AC2/AC3: one reading of every read path per role ─────────────────────────────────────────
select pg_temp.as_('d1');
select is(pg_temp.probe(),
  '{"task":1,"checklist":1,"events":1,"comments":4,"viewers":1,"signal_links":1,"history":1,"checklist_history":1,
    "task_list_count":3,"objective_total":3,"api_list":3,"api_get":"Probe private","api_history":1,"api_signal_task_ids":1}'::jsonb,
  'creator reads the private Task, its checklist, events, comments, links, history and counts');
select pg_temp.as_('d4');
select is(pg_temp.probe(),
  '{"task":1,"checklist":1,"events":1,"comments":4,"viewers":1,"signal_links":1,"history":1,"checklist_history":1,
    "task_list_count":2,"objective_total":2,"api_list":2,"api_get":"Probe private","api_history":1,"api_signal_task_ids":1}'::jsonb,
  'PIC reads the private Task on every path (and not the creator''s solo Task)');
select pg_temp.as_('d2');
select is(pg_temp.probe(),
  '{"task":1,"checklist":1,"events":1,"comments":4,"viewers":1,"signal_links":1,"history":1,"checklist_history":1,
    "task_list_count":2,"objective_total":2,"api_list":2,"api_get":"Probe private","api_history":1,"api_signal_task_ids":1}'::jsonb,
  'Supervisor reads the private Task on every path');
select pg_temp.as_('d5');
select is(pg_temp.probe(),
  '{"task":1,"checklist":1,"events":1,"comments":4,"viewers":1,"signal_links":1,"history":1,"checklist_history":1,
    "task_list_count":2,"objective_total":2,"api_list":2,"api_get":"Probe private","api_history":1,"api_signal_task_ids":1}'::jsonb,
  'a person on the who-can-see list reads the private Task on every path');
select pg_temp.as_('d3', 'admin');
select is(pg_temp.probe(),
  '{"task":1,"checklist":1,"events":1,"comments":4,"viewers":1,"signal_links":1,"history":1,"checklist_history":1,
    "task_list_count":3,"objective_total":3,"api_list":3,"api_get":"Probe private","api_history":1,"api_signal_task_ids":1}'::jsonb,
  'an admin reads every private Task on every path');
select pg_temp.as_('d7');
select is(pg_temp.probe(),
  '{"task":0,"checklist":0,"events":0,"comments":0,"viewers":0,"signal_links":0,"history":0,"checklist_history":0,
    "task_list_count":1,"objective_total":1,"api_list":1,"api_get":"missing","api_history":0,"api_signal_task_ids":0}'::jsonb,
  'an unrelated member reads no trace of the private Tasks: no row, child, link, history, count or agent hit');
select pg_temp.as_('d3', 'member');
select is(pg_temp.probe(),
  '{"task":0,"checklist":0,"events":0,"comments":0,"viewers":0,"signal_links":0,"history":0,"checklist_history":0,
    "task_list_count":1,"objective_total":1,"api_list":1,"api_get":"missing","api_history":0,"api_signal_task_ids":0}'::jsonb,
  'a manager above everyone who is not admin reads no private Task either');
-- The helper mirrors the claim into live assignments, so the member probe revoked d3's admin role;
-- grant it again for the notice checks below.
select pg_temp.as_('d3', 'admin');
select pg_temp.as_('b4', 'member', 'b1');
select is(pg_temp.probe(),
  '{"task":0,"checklist":0,"events":0,"comments":0,"viewers":0,"signal_links":0,"history":0,"checklist_history":0,
    "task_list_count":0,"objective_total":0,"api_list":0,"api_get":"missing","api_history":0,"api_signal_task_ids":0}'::jsonb,
  'a member of another org reads nothing');

-- A public Task is untouched: everyone in the org still reads it.
select pg_temp.as_('d7');
select is((select count(*)::int from mos.tasks where id = '00000000-0000-0000-0000-000000007002'), 1,
  'a public Task still reads org-wide');

-- ── Linking and commenting need to see the Task ──────────────────────────────────────────────
select throws_ok($$
  insert into mos.signal_tasks (signal_id, task_id, created_by)
  values ('00000000-0000-0000-0000-000000007401','00000000-0000-0000-0000-000000007003',
          '00000000-0000-0000-0000-0000000000d7')
$$, '42501', null, 'a Signal cannot be linked to a private Task the writer cannot read');
select throws_ok($$
  insert into mos.comments (entity_type, entity_id, body)
  values ('task','00000000-0000-0000-0000-000000007003','hello')
$$, '23514', null, 'a member who cannot read a private Task cannot comment on it');

-- ── AC4: Supervisor "None, just me" ──────────────────────────────────────────────────────────
select pg_temp.as_('d1');
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, is_private)
  values ('Solo private','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1', true)
  returning id
$$, 'a private Task may have no separate Supervisor when the PIC is its creator, and the creator gets the row back (INSERT RETURNING)');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, is_private)
  values ('Delegated private, no supervisor','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d5', true)
$$, '23514', null, 'a private Task whose PIC is someone else still needs a real Supervisor');
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, is_private)
  values ('Delegated private','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d2', true)
$$, 'a private Task whose PIC is someone else with a real Supervisor is accepted');
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id)
  values ('Public same person','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d5')
$$, 'a public Task keeps today''s rule');
select throws_ok($$
  update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d5',
                       accountable_person_id = '00000000-0000-0000-0000-0000000000d5'
   where id = '00000000-0000-0000-0000-000000007003'
$$, '23514', null, 'handing a solo private Task to someone else without a Supervisor is refused');

-- ── AC5/AC7: who may change privacy or the list ──────────────────────────────────────────────
select is(mos.can_change_task_privacy('00000000-0000-0000-0000-000000007001'), false,
  'a creator who cannot edit the Task cannot change its privacy');
select pg_temp.as_('d5');
select is(mos.can_change_task_privacy('00000000-0000-0000-0000-000000007001'), false,
  'a person only on the list cannot change privacy');
select throws_ok($$
  insert into mos.task_viewers (task_id, person_id)
  values ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000d6')
$$, '42501', null, 'a person only on the list cannot add people to it');
update mos.tasks set is_private = false where id = '00000000-0000-0000-0000-000000007001';
select pg_temp.as_('d4');
select is((select is_private from mos.tasks where id = '00000000-0000-0000-0000-000000007001'), true,
  'an update from a non-editor leaves the Task private');
select lives_ok($$
  insert into mos.task_viewers (task_id, person_id)
  values ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000d6')
$$, 'the PIC (an editor) adds a person to the list');
select throws_ok($$
  insert into mos.task_viewers (task_id, person_id)
  values ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000b4')
$$, '23514', null, 'the list takes only people of the same org');
select pg_temp.as_('d6');
select is((select count(*)::int from mos.tasks where id = '00000000-0000-0000-0000-000000007001'), 1,
  'a person added to the list now reads the private Task');

-- ── AC6: notices go only to people who can read the Task ─────────────────────────────────────
select pg_temp.as_('d4');
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d5',
  '00000000-0000-0000-0000-000000007302','en'), null,
  'a person on the list is notified of a mention on the private Task');
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d3',
  '00000000-0000-0000-0000-000000007303','en'), null,
  'an admin is notified of a mention on the private Task');
select is(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d7',
  '00000000-0000-0000-0000-000000007304','en'), null,
  'a mention of someone who cannot read the private Task writes no notice');
select is(pg_temp.notices('d7', '000000007001'), 0, 'the non-reader''s inbox holds nothing about the private Task');
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d7',
  '00000000-0000-0000-0000-000000007305','en'), null,
  'a mention on a public Task still notifies');
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d3',
  '00000000-0000-0000-0000-000000007306','en'), null,
  'the admin is also notified on the public Task');

-- Turning the public Task private removes the notice of a person who can no longer read it.
update mos.tasks set is_private = true where id = '00000000-0000-0000-0000-000000007002';
select is(pg_temp.notices('d7', '000000007002'), 0,
  'a Task turning private removes notices already sent to people who cannot read it');
select is(pg_temp.notices('d3', '000000007002'), 1, '...and keeps the admin''s');
-- Removing a person from the list removes their notices about the Task.
delete from mos.task_viewers where task_id = '00000000-0000-0000-0000-000000007001'
  and person_id = '00000000-0000-0000-0000-0000000000d5';
select is(pg_temp.notices('d5', '000000007001'), 0,
  'leaving the who-can-see list removes that person''s notices about the Task');

select * from finish();
rollback;
