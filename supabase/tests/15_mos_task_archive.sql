begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Same role-tree shape as 14_: R(d1) under Lead R(d3); A(d2) under Lead A(d4). R != A.
-- The archive gate (FR-051) is NARROWER than the edit gate (FR-050): A or mgr-of-(R or A) only.
-- A non-A Responsible CAN edit other fields (proven AC-020) but CANNOT set archived_at (AC-032).
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
  ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000e1','Mgr of A');
insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f3'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000f4'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f2');

-- Three fresh active tasks (R=d1, A=d2) so each arm acts on an un-archived row.
insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values
  ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-0000000000e1','Arch A','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-0000000000e1','Arch B','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-0000000000e1','Arch C','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1');

set local role authenticated;

-- AC-030: as A, archive succeeds (archived_at set).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
update mos.tasks set archived_at = now() where id='00000000-0000-0000-0000-00000000a001';
select isnt(
  (select archived_at from mos.tasks where id='00000000-0000-0000-0000-00000000a001'),
  null, 'AC-030: Accountable can archive the task (archived_at set)'
);

-- AC-031: on a fresh task, as manager-of-R, archive succeeds.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d3"}';
update mos.tasks set archived_at = now() where id='00000000-0000-0000-0000-00000000a002';
select isnt(
  (select archived_at from mos.tasks where id='00000000-0000-0000-0000-00000000a002'),
  null, 'AC-031: manager-of-(R or A) can archive the task'
);

-- AC-032: on a fresh task, as R (not A, not a manager), archive -> trigger raises 42501.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select throws_ok($$
  update mos.tasks set archived_at = now() where id='00000000-0000-0000-0000-00000000a003'
$$, '42501', null, 'AC-032: non-A Responsible CANNOT set archived_at (archive-gate trigger fires)');

-- AC-033: on the AC-030-archived task, as A, unarchive succeeds (archived_at cleared).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
update mos.tasks set archived_at = null where id='00000000-0000-0000-0000-00000000a001';
select is(
  (select archived_at from mos.tasks where id='00000000-0000-0000-0000-00000000a001'),
  null, 'AC-033: Accountable can unarchive (clear archived_at) symmetrically'
);

-- AC-034: as any authenticated member (A here), hard DELETE is denied (no grant -> 42501).
select throws_ok($$
  delete from mos.tasks where id='00000000-0000-0000-0000-00000000a003'
$$, '42501', null, 'AC-034: hard delete denied to authenticated (no DELETE grant)');

reset role;
select * from finish();
rollback;
