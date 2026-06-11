begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Security audit M2: current_org_id() / current_person_id() must FAIL CLOSED on malformed claims —
-- empty string, non-UUID garbage, malformed JSON — returning NULL (and so an empty directory read)
-- instead of RAISING. A raised error inside an RLS predicate surfaces as a probeable 500; a clean
-- NULL hides the org. Fixture: one org + one in-org person, visible only with valid claims.
insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000e9', 'Org G', 'org-g');
insert into shared.people (id, org_id, full_name)
  values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000e9', 'Visible Person');

set local role authenticated;

-- (1) EMPTY STRING claims setting -> helpers return NULL, no error.
set local request.jwt.claims = '';
select is( shared.current_org_id(), null, 'empty-string claims -> current_org_id NULL (no raise)');
select is( shared.current_person_id(), null, 'empty-string claims -> current_person_id NULL (no raise)');
select is(
  (select count(*)::int from shared.people),
  0,
  'empty-string claims -> people select returns 0 rows (fail closed, no error)'
);

-- (2) NON-UUID GARBAGE claim value -> helpers return NULL, no error.
set local request.jwt.claims = '{"org_id":"not-a-uuid","person_id":"also-bad"}';
select is( shared.current_org_id(), null, 'non-UUID org_id claim -> current_org_id NULL (no raise)');
select is( shared.current_person_id(), null, 'non-UUID person_id claim -> current_person_id NULL (no raise)');
select is(
  (select count(*)::int from shared.people),
  0,
  'non-UUID claims -> people select returns 0 rows (fail closed, no error)'
);

-- (3) MALFORMED JSON claims setting -> helpers return NULL, no error.
set local request.jwt.claims = 'not json at all';
select is( shared.current_org_id(), null, 'malformed-JSON claims -> current_org_id NULL (no raise)');
select is(
  (select count(*)::int from shared.people),
  0,
  'malformed-JSON claims -> people select returns 0 rows (fail closed, no error)'
);

-- (4) Happy path intact: a VALID org_id claim still resolves and sees the in-org row, proving the
-- defensive parsing did not break normal extraction.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000e9"}';
select is(
  (select count(*)::int from shared.people),
  1,
  'valid org_id claim still resolves and reads the in-org person (defensive path preserves happy path)'
);

reset role;
select * from finish();
rollback;
