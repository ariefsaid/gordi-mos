begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

-- Regression: a cyclic reports_to_role_id graph (A reports to B, B reports to A) is insertable
-- today (the self-FK has no acyclicity constraint). The is_manager_of recursive CTE must walk a
-- FINITE role set and TERMINATE — under UNION ALL it loops forever and hangs RLS evaluation.
-- We bound the call with statement_timeout so the old (UNION ALL) code surfaces the hang as an
-- error (RED); the UNION fix makes the walk finite and the call returns a boolean (GREEN).

insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000c1', 'Org C', 'org-c');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c1','Unit C1');

-- Two roles forming a cycle: A -> B and B -> A. A THIRD, unrelated role for the viewer.
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2','Role CycA', null),
  ('00000000-0000-0000-0000-0000000000cb','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2','Role CycB','00000000-0000-0000-0000-0000000000ca'),
  ('00000000-0000-0000-0000-0000000000ce','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2','Role Outsider', null);
update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000cb'
  where id = '00000000-0000-0000-0000-0000000000ca';

-- Holder is INSIDE the cycle (holds CycA). Viewer holds the UNRELATED Outsider role: the viewer
-- matches NO ancestor of the holder, so `exists` cannot short-circuit and must DRAIN the ancestor
-- walk in full. Under UNION ALL that walk is the infinite cycle (hang); under UNION it is finite.
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000cc','00000000-0000-0000-0000-0000000000c1','Holder C'),
  ('00000000-0000-0000-0000-0000000000cd','00000000-0000-0000-0000-0000000000c1','Viewer C');
insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000cc','00000000-0000-0000-0000-0000000000ca'),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000cd','00000000-0000-0000-0000-0000000000ce');

-- Bound the evaluation: on the cyclic graph the recursion must still terminate. With UNION ALL it
-- runs past the timeout (RED -> error); with UNION the role set is finite and the call returns fast.
set local statement_timeout = '2s';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000c1","person_id":"00000000-0000-0000-0000-0000000000cd"}';

-- The ONLY contract we assert: the call terminates and yields a boolean (cycle-safe).
select isa_ok(
  shared.is_manager_of('00000000-0000-0000-0000-0000000000cc'),
  'boolean',
  'is_manager_of terminates on a cyclic reports_to graph (returns a boolean, no infinite loop)'
);

reset role;
select * from finish();
rollback;
