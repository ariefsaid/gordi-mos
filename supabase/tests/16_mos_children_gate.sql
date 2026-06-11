begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Task with R(d1)/A(d2); an Unrelated member (d5). Child writes gated by mos.can_edit_task(task_id).
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000e1','Org E','org-e');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e1','Unit R');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','Person R'),
  ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000e1','Person A'),
  ('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e1','Unrelated');
insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values
  ('00000000-0000-0000-0000-0000000c1001','00000000-0000-0000-0000-0000000000e1','Checklist Task',
   '00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1');

set local role authenticated;

-- AC-040 (allow): as R, insert a checklist item, toggle is_done, update position.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select lives_ok($$
  insert into mos.task_checklist_items (id, task_id, label, position)
  values ('00000000-0000-0000-0000-0000000c2001','00000000-0000-0000-0000-0000000c1001','Step one',0)
$$, 'AC-040: editor (R) can insert a checklist item');
update mos.task_checklist_items set is_done = true where id='00000000-0000-0000-0000-0000000c2001';
select is(
  (select is_done from mos.task_checklist_items where id='00000000-0000-0000-0000-0000000c2001'),
  true, 'AC-040: editor (R) can toggle is_done (persisted)'
);
update mos.task_checklist_items set position = 5 where id='00000000-0000-0000-0000-0000000c2001';
select is(
  (select position from mos.task_checklist_items where id='00000000-0000-0000-0000-0000000c2001'),
  5, 'AC-040: editor (R) can reorder (position persisted)'
);

-- AC-040 (deny): as the Unrelated member, insert is rejected (WITH CHECK fails -> 42501) and
-- update of the existing item is a no-op (USING hides it; is_done stays true from above).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d5"}';
select throws_ok($$
  insert into mos.task_checklist_items (task_id, label, position)
  values ('00000000-0000-0000-0000-0000000c1001','Sneaky step',1)
$$, '42501', null, 'AC-040: non-authorised member cannot insert a checklist item');
update mos.task_checklist_items set is_done = false where id='00000000-0000-0000-0000-0000000c2001';
select is(
  (select is_done from mos.task_checklist_items where id='00000000-0000-0000-0000-0000000c2001'),
  true, 'AC-040: non-authorised member cannot update a checklist item (is_done unchanged)'
);

reset role;
select * from finish();
rollback;
