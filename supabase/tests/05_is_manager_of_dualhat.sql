begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Fixture: org with three units, three lead roles, two staff roles under L1 and L2.
insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000e1', 'Org E', 'org-e');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e1','Unit U1'),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000e1','Unit U2'),
  ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000e1','Unit U3');

-- Lead roles (no reports_to -> top of their unit).
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','Lead U1', null),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e3','Lead U2', null),
  ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e4','Lead U3', null);
-- Staff roles reporting up to L1 and L2.
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','Staff U1','00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e3','Staff U2','00000000-0000-0000-0000-0000000000f2');

-- People: A (dual hat), L1, L2, L3.
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000e1','Person A'),
  ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000e1','Lead One'),
  ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-0000000000e1','Lead Two'),
  ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-0000000000e1','Lead Three');

-- A holds BOTH staff roles (dual hat). Leads hold their lead roles.
insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000f4'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000f5'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-0000000000f3');

-- Evaluate is_manager_of(A) from each lead's perspective by setting the JWT claims.
-- A real session ALWAYS carries BOTH org_id and person_id (the access-token hook mints them
-- together, T-007 / ADR-0001 consequences) — so each claim here sets org_id (Org E) alongside
-- person_id. is_manager_of is SECURITY INVOKER (ADR D4): without the org claim, RLS hides the
-- whole directory and the function would see nothing, which never happens for a logged-in user.
set local role authenticated;

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-000000000011"}';
select ok( shared.is_manager_of('00000000-0000-0000-0000-00000000000a'),
  'Lead One (L1) manages dual-hat A (union over held roles)');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-000000000022"}';
select ok( shared.is_manager_of('00000000-0000-0000-0000-00000000000a'),
  'Lead Two (L2) ALSO manages dual-hat A (union, OD-P1-7)');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-000000000033"}';
select ok( not shared.is_manager_of('00000000-0000-0000-0000-00000000000a'),
  'unrelated Lead Three (L3) does NOT manage A');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e1","person_id":"00000000-0000-0000-0000-00000000000a"}';
select ok( not shared.is_manager_of('00000000-0000-0000-0000-000000000011'),
  'subordinate A does NOT manage Lead One (relation is strictly upward)');

reset role;
select * from finish();
rollback;
