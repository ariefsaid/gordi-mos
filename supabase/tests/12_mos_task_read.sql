begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Fixture: two orgs (A, B), each with a BU + a person + a task. In org A, a separate VIEWER
-- person in a different BU who holds NO RACI role on the org-A task (proves org-readability is
-- not RACI-scoped — OD-P1-3 cross-unit visibility is the product).
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1','Org A','org-a'),
  ('00000000-0000-0000-0000-0000000000b1','Org B','org-b');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a1','A Unit 1'),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a1','A Unit 2'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b1','B Unit 1');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a1','A Owner'),
  ('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a1','A Viewer'),
  ('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b1','B Owner');

insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values
  ('00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-0000000000a1','A Task',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a4',
   '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-00000000b000','00000000-0000-0000-0000-0000000000b1','B Task',
   '00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b4',
   '00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b4');

insert into mos.task_checklist_items (org_id, task_id, label, position) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000a000','A step',0),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000b000','B step',0);
insert into mos.task_events (org_id, task_id, actor_person_id, event_type) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-0000000000a4','created'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000b000','00000000-0000-0000-0000-0000000000b4','created');

-- Session: A Viewer (different BU, no RACI role on the A task).
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000a5"}';

-- AC-001: org-readable across units — viewer (not R/A/C/I) reads the org-A task.
select is(
  (select count(*)::int from mos.tasks where id = '00000000-0000-0000-0000-00000000a000'),
  1,
  'AC-001: org member (different BU, no RACI role) can read the org-A task (cross-unit visibility)'
);

-- AC-002: cross-org isolation — viewer cannot read the org-B task.
select is(
  (select count(*)::int from mos.tasks where id = '00000000-0000-0000-0000-00000000b000'),
  0,
  'AC-002: org-A member cannot read a task in org B (org isolation)'
);

-- AC-003: children read org-scoped — org-A children visible, org-B children hidden.
select is(
  (select count(*)::int from mos.task_checklist_items where task_id = '00000000-0000-0000-0000-00000000a000'),
  1,
  'AC-003: org-A checklist item is visible to an org-A member'
);
select is(
  (select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-00000000a000'),
  1,
  'AC-003: org-A task_event is visible to an org-A member'
);
select is(
  (select count(*)::int from mos.task_checklist_items where task_id = '00000000-0000-0000-0000-00000000b000')
  + (select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-00000000b000'),
  0,
  'AC-003: org-B children (checklist + events) are hidden from an org-A member'
);

reset role;
select * from finish();
rollback;
