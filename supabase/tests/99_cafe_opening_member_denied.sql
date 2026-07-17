-- AC-704 (FR-707/RATIFY-7A): a café floor member (active on the branch Team, but lacking
-- process.start) cannot start today's opening — the Step-6 gate rejects the spawn (42501), and
-- the rejection is proven to come from the missing capability, not from Team-auth (belt-and-braces).
-- Fixture: 20260717000004_mos_cafe_opening_test_seed.sql. Member = Solo Holder (…f001, own_team).
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_cafe_opening();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';

-- Team-auth alone is true for this member (own_team, active) — proves the denial below is the
-- missing process.start capability, not a Team-authorization failure.
select ok((select mos.can_start_process_for_team('00000000-0000-0000-0000-000000005b01')),
          'AC-704: the member IS authorized over own_team (can_start_process_for_team is true)');

-- Yet the spawn itself is rejected — process.start stays ops_lead+admin (RATIFY-7A).
select throws_ok($$
  select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                               '00000000-0000-0000-0000-000000005b01', current_date)
$$, '42501', null, 'AC-704: a member without process.start cannot start today''s opening');

select * from finish();
rollback;
