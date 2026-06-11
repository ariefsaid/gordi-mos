begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Task with R(d1) as the session person; the AFTER-INSERT trigger on task_events bumps
-- tasks.last_activity_at to the event's created_at (§3.4, one canonical clock).
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000e1','Org E','org-e');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e1','Unit R');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','Person R');
insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by,
   last_activity_at)
values
  ('00000000-0000-0000-0000-0000000c3001','00000000-0000-0000-0000-0000000000e1','Event Task',
   '00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1',
   '2026-01-01T00:00:00Z');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d1"}';

-- AC-050: insert a status_changed event at a known later time -> task.last_activity_at advances to it.
insert into mos.task_events (task_id, actor_person_id, event_type, from_value, to_value, created_at)
values ('00000000-0000-0000-0000-0000000c3001','00000000-0000-0000-0000-0000000000d1',
        'status_changed','Open','In Progress','2026-06-11T10:00:00Z');
select is(
  (select last_activity_at from mos.tasks where id='00000000-0000-0000-0000-0000000c3001'),
  '2026-06-11T10:00:00Z'::timestamptz,
  'AC-050: task.last_activity_at advanced to the inserted event created_at (trigger)'
);

-- AC-051: simulate the create path — insert a task, then exactly one created event for it.
insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values
  ('00000000-0000-0000-0000-0000000c3002','00000000-0000-0000-0000-0000000000e1','Created Task',
   '00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');
insert into mos.task_events (task_id, actor_person_id, event_type, created_at)
values ('00000000-0000-0000-0000-0000000c3002','00000000-0000-0000-0000-0000000000d1',
        'created','2026-06-11T12:00:00Z');

select is(
  (select count(*)::int from mos.task_events
     where task_id='00000000-0000-0000-0000-0000000c3002' and event_type='created'),
  1, 'AC-051: exactly one created event exists for a freshly created task'
);
select is(
  (select last_activity_at from mos.tasks where id='00000000-0000-0000-0000-0000000c3002'),
  '2026-06-11T12:00:00Z'::timestamptz,
  'AC-051: last_activity_at equals the created event created_at'
);

-- Guard: the event INSERT policy only lets an editor write events (created above succeeded as R).
-- Confirm the actor_person_id = current_person_id() arm by a non-actor spoof attempt (42501).
select throws_ok($$
  insert into mos.task_events (task_id, actor_person_id, event_type)
  values ('00000000-0000-0000-0000-0000000c3001','00000000-0000-0000-0000-0000000000d2','field_edited')
$$, '42501', null, 'AC-050: event actor_person_id must equal the session person (no spoofed actor)');

reset role;
select * from finish();
rollback;
