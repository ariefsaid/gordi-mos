begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- FR-001/002/007: event_type / origin are text+CHECK to their allowed sets; title must be non-blank;
-- business_unit_id is NOT NULL. Fixture tree documented in 20260612000003_mos_test_seed.sql.
select mos._test_seed_role_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';

-- AC-040: invalid event_type -> CHECK (23514).
select throws_ok($$
  insert into ops.log_entries (business_unit_id, title, event_type)
  values ('00000000-0000-0000-0000-0000000000a2','bad type','bogus')
$$, '23514', null, 'AC-040: invalid event_type rejected by CHECK');

-- AC-040: invalid origin -> CHECK (23514).
select throws_ok($$
  insert into ops.log_entries (business_unit_id, title, origin)
  values ('00000000-0000-0000-0000-0000000000a2','bad origin','spreadsheet')
$$, '23514', null, 'AC-040: invalid origin rejected by CHECK');

-- AC-040: blank title -> CHECK (23514).
select throws_ok($$
  insert into ops.log_entries (business_unit_id, title)
  values ('00000000-0000-0000-0000-0000000000a2','')
$$, '23514', null, 'AC-040: blank title rejected by CHECK');

-- AC-040: null business_unit_id -> NOT NULL (23502).
select throws_ok($$
  insert into ops.log_entries (business_unit_id, title)
  values (null,'no unit')
$$, '23502', null, 'AC-040: null business_unit_id rejected by NOT NULL');

reset role;
select * from finish();
rollback;
