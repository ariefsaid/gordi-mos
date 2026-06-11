begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Role-tree fixture (shape from 05_is_manager_of_dualhat): one org, two BUs.
--   Lead R-role (LR) -> Staff R-role (SR); Lead A-role (LA) -> Staff A-role (SA).
--   People: R holds SR; A holds SA; MgrR holds LR; MgrA holds LA; Unrelated holds nothing managerial.
-- Allow/deny is asserted by EFFECT: an allowed editor's change persists; a denied member's change
-- does not (RLS USING hides the row, so the UPDATE touches 0 rows and the value is unchanged).
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000e1','Org E','org-e');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e1','Unit R'),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000e1','Unit A');

insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','Lead R',null),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e3','Lead A',null),
  ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','Staff R','00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e3','Staff A','00000000-0000-0000-0000-0000000000f2');

insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','Person R'),
  ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000e1','Person A'),
  ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000e1','Mgr of R'),
  ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000e1','Mgr of A'),
  ('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000e1','Unrelated');

insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f3'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000f4'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f2');

-- Task 1: R != A (status starts 'Open').
insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values
  ('00000000-0000-0000-0000-0000000c0001','00000000-0000-0000-0000-0000000000e1','Edit Task',
   '00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1');
-- Task 2: A = R (same person d1).
insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values
  ('00000000-0000-0000-0000-0000000c0002','00000000-0000-0000-0000-0000000000e1','Self Task',
   '00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');

set local role authenticated;

-- AC-020: as R, status edit persists.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
update mos.tasks set status='In Progress' where id='00000000-0000-0000-0000-0000000c0001';
select is(
  (select status from mos.tasks where id='00000000-0000-0000-0000-0000000c0001'),
  'In Progress', 'AC-020: Responsible can edit the task (status persisted)'
);

-- AC-021: as A (distinct from R), edit persists.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
update mos.tasks set status='Blocked' where id='00000000-0000-0000-0000-0000000c0001';
select is(
  (select status from mos.tasks where id='00000000-0000-0000-0000-0000000c0001'),
  'Blocked', 'AC-021: Accountable (distinct from R) can edit the task'
);

-- AC-022: as manager-of-R, edit persists.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d3"}';
update mos.tasks set status='Open' where id='00000000-0000-0000-0000-0000000c0001';
select is(
  (select status from mos.tasks where id='00000000-0000-0000-0000-0000000c0001'),
  'Open', 'AC-022: manager-of-Responsible can edit the task'
);

-- AC-023: as manager-of-A (R != A), edit persists.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
update mos.tasks set status='In Progress' where id='00000000-0000-0000-0000-0000000c0001';
select is(
  (select status from mos.tasks where id='00000000-0000-0000-0000-0000000c0001'),
  'In Progress', 'AC-023: manager-of-Accountable can edit the task'
);

-- AC-024: as an Unrelated member, edit is a no-op (RLS USING hides the row; status unchanged).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d5"}';
update mos.tasks set status='Done' where id='00000000-0000-0000-0000-0000000c0001';
select is(
  (select status from mos.tasks where id='00000000-0000-0000-0000-0000000c0001'),
  'In Progress', 'AC-024: unrelated org member cannot edit (status unchanged from AC-023)'
);

-- AC-025: task where A=R=d1; as that person, edit persists.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
update mos.tasks set status='Done' where id='00000000-0000-0000-0000-0000000c0002';
select is(
  (select status from mos.tasks where id='00000000-0000-0000-0000-0000000c0002'),
  'Done', 'AC-025: person who is both R and A can edit the task'
);

-- AC-026 (allow): as R, edit the consulted array persists.
update mos.tasks set consulted_person_ids = array['00000000-0000-0000-0000-0000000000d5'::uuid]
  where id='00000000-0000-0000-0000-0000000c0001';
select is(
  (select consulted_person_ids from mos.tasks where id='00000000-0000-0000-0000-0000000c0001'),
  array['00000000-0000-0000-0000-0000000000d5'::uuid],
  'AC-026: editor can edit consulted_person_ids array (persisted)'
);

-- AC-026 (deny): as the C-only member (d5, now in consulted but not R/A/mgr), the array edit is a no-op.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d5"}';
update mos.tasks set informed_person_ids = array['00000000-0000-0000-0000-0000000000d5'::uuid]
  where id='00000000-0000-0000-0000-0000000c0001';
select is(
  (select informed_person_ids from mos.tasks where id='00000000-0000-0000-0000-0000000c0001'),
  '{}'::uuid[],
  'AC-026: a Consulted-only member (not R/A/mgr) cannot edit (informed array unchanged)'
);

reset role;
select * from finish();
rollback;
