begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- Two-org fixture (rolled back at end). Created as the table owner (migrations role), bypassing RLS.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B', 'org-b');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'A Unit'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b2', 'B Unit');

-- Become the authenticated app role with a JWT claim placing us in Org A.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';

-- Sees its own org's unit.
select is(
  (select count(*)::int from shared.business_units where name = 'A Unit'),
  1,
  'org A session reads its own business unit'
);

-- Cannot see org B's unit (RLS org-isolation).
select is(
  (select count(*)::int from shared.business_units where name = 'B Unit'),
  0,
  'org A session cannot read org B business unit (cross-org isolation)'
);

reset role;
select * from finish();
rollback;
