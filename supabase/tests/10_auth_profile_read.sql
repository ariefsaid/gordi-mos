begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Fixture: an org, two roles, a person, two person_roles.
-- Uses UUIDs in the 0xcc range to avoid conflicts with other test files.

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000c1', 'Org C', 'org-c');

insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'C Unit');

insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'C Lead', null),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'C Staff', '00000000-0000-0000-0000-0000000000c3');

insert into shared.people (id, org_id, full_name, email) values
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c1', 'Caris Test', 'caris@example.test');

insert into shared.person_roles (id, org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c3'),
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c4');

set local role authenticated;

-- AC-013: own-profile read contract — person + roles visible with valid claims
-- (RLS permits the FR-014 reads when org_id + person_id claims are present)
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000c1","person_id":"00000000-0000-0000-0000-0000000000c5"}';

select is(
  (select count(*)::int from shared.people where id = '00000000-0000-0000-0000-0000000000c5'),
  1,
  'AC-013: own-profile read contract — person + roles visible with valid claims: people row visible'
);

select is(
  (select count(*)::int
   from shared.person_roles pr
   join shared.roles r on r.id = pr.role_id
   where pr.person_id = '00000000-0000-0000-0000-0000000000c5'),
  2,
  'AC-013: own-profile read contract — person + roles visible with valid claims: person_roles join returns 2'
);

select is(
  (select count(*)::int from shared.roles),
  2,
  'AC-013: own-profile read contract — person + roles visible with valid claims: org roles readable'
);

-- AC-014: orphan (no claims) reads zero directory rows
-- Note: this extends the 08_claim_parsing.sql empty-claims proof, scoped here to the FR-014 read set.
-- With empty claims, current_org_id() returns NULL → RLS predicates match nothing → all reads return 0.
set local request.jwt.claims = '{}';

select is(
  (select count(*)::int from shared.people),
  0,
  'AC-014: orphan (no claims) reads zero directory rows — people count is 0'
);

select is(
  (select count(*)::int from shared.person_roles),
  0,
  'AC-014: orphan (no claims) reads zero directory rows — person_roles count is 0'
);

select is(
  (select count(*)::int from shared.roles),
  0,
  'AC-014: orphan (no claims) reads zero directory rows — roles count is 0'
);

reset role;
select * from finish();
rollback;
