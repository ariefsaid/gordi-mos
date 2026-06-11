begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- Security audit L3: is_manager_of relies on the access-token hook minting org_id + person_id from
-- the SAME people row (invariant on the function). If a forged session could pair org_id = Org A with
-- a person_id that belongs to Org B, the function must FAIL CLOSED — the cross-org person_id matches
-- no in-org person_roles (RLS scopes the junction to org A), so the viewer holds no roles and manages
-- no one. This proves the seam degrades safely even if the (hook-guaranteed) invariant were violated.

-- Org A: a real management chain — Lead role over a Staff role, each held by a person.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B', 'org-b');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'A Unit');
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'A Lead', null),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'A Staff', '00000000-0000-0000-0000-0000000000a3');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a1', 'A Lead Person'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a1', 'A Staff Person');
insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a4');

-- Org B: an unrelated person (the identity whose person_id the forged claim borrows).
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000b2', 'B Person');

set local role authenticated;

-- Control: the CONSISTENT claim (org A + A's lead person) DOES manage the staff person.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000a5"}';
select ok(
  shared.is_manager_of('00000000-0000-0000-0000-0000000000a6'),
  'consistent claim (org A + A lead) manages A staff (control)'
);

-- The attack: org_id = Org A but person_id = Org B's person. Cross-org person_id -> no in-org roles
-- under RLS -> viewer_roles is empty -> is_manager_of fails closed (false).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000b5"}';
select ok(
  not shared.is_manager_of('00000000-0000-0000-0000-0000000000a6'),
  'inconsistent claim (org A + org-B person_id) does NOT manage anyone (fails closed, L3)'
);

reset role;
select * from finish();
rollback;
