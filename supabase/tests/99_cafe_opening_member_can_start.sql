-- AC-704 (OD-REDESIGN-71iii, 2026-07-19 — REVERSES RATIFY-7A): a café floor member active on the
-- branch Team CAN start today's opening (OD-66 barista zero-training front). The double gate still
-- holds by construction — can('process.start') AND mos.can_start_process_for_team(team); the
-- Team-membership half is proven independently in 95_process_rollup_authz. Here we prove the
-- capability half now admits a member.
-- Fixture: 20260717000006_mos_cafe_opening_test_seed.sql. Member = Solo Holder (…f001, own_team).
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_cafe_opening();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';

-- Team-auth is true for this member (own_team, active).
select ok((select mos.can_start_process_for_team('00000000-0000-0000-0000-000000005b01')),
          'AC-704: the member is authorized over own_team (can_start_process_for_team is true)');

-- OD-71iii grants member process.start, so the spawn now SUCCEEDS (returns a run id, not 42501).
select isnt(
  (select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                                '00000000-0000-0000-0000-000000005b01', current_date) ->> 'run_id'),
  null,
  'AC-704 (OD-71iii): a Team-member barista CAN start today''s opening');

select * from finish();
rollback;
