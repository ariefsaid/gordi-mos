-- Café Opening keeps canonical branch ownership while consuming the effective process.start matrix.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
update mos.work_lines
   set code = 'cafe_opening'
 where id = '00000000-0000-0000-0000-00000000c001';

-- Rumah Rames has a kitchen and bar Team. Kitchen is canonical; the bar is a valid branch request
-- for canonical branch resolution but is not the Process occurrence's actual owning Team.
insert into shared.teams (id, org_id, business_unit_id, name, code, branch_id, activity) values
 ('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','GHQ bar','ghq-bar','00000000-0000-0000-0000-00000000bf01','bar'),
 ('00000000-0000-0000-0000-00000000cc02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','RRS kitchen','rrs-kitchen','00000000-0000-0000-0000-00000000bf02','kitchen'),
 ('00000000-0000-0000-0000-00000000cc03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','RRS bar','rrs-bar','00000000-0000-0000-0000-00000000bf02','bar'),
 ('00000000-0000-0000-0000-00000000cc04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','GHQ kitchen','ghq-kitchen','00000000-0000-0000-0000-00000000bf01','kitchen');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-00000000cc02',true,current_date),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-00000000cc03',false,current_date)
 on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.cafe_opening_branches()), 0,
  'the branch affordance hides a canonical Café Opening from a member of only the sibling Team');
select is((select count(*)::int from mos.due_process_runs() where process_name = 'Café Opening'), 0,
  'the due surface does not advertise a canonical Café Opening the caller cannot start');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}';
select is(shared.cafe_opening_team('00000000-0000-0000-0000-00000000bf02'::uuid),
          '00000000-0000-0000-0000-00000000cc02'::uuid,
  'Café Opening resolves the kitchen Team as the canonical owner for a branch');
select is(mos.can_start_process_for_team('00000000-0000-0000-0000-00000000cc02'::uuid), true,
  'a member of the actual canonical Team passes process.start');
select ok((mos.spawn_process_run(
             '00000000-0000-0000-0000-00000000c001'::uuid,
             '00000000-0000-0000-0000-00000000cc02'::uuid,
             (now() at time zone 'Asia/Jakarta')::date)->>'run_id') is not null,
  'the actual owning-Team member can spawn the canonical Café Opening occurrence');
select is((select count(*)::int from mos.process_runs
            where work_line_id = '00000000-0000-0000-0000-00000000c001'
              and owning_team_id = '00000000-0000-0000-0000-00000000cc02'
              and period_key = to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD')), 1,
  'the canonical occurrence has one unique row');
select is((mos.spawn_process_run(
             '00000000-0000-0000-0000-00000000c001'::uuid,
             '00000000-0000-0000-0000-00000000cc03'::uuid,
             (now() at time zone 'Asia/Jakarta')::date)->>'idempotent')::boolean, true,
  'a different same-branch request returns the existing canonical occurrence idempotently when the caller is authorized for that owner');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  select mos.spawn_process_run(
    '00000000-0000-0000-0000-00000000c001'::uuid,
    '00000000-0000-0000-0000-00000000cc03'::uuid,
    (now() at time zone 'Asia/Jakarta')::date)
$$, '42501', null,
  'a denied sibling caller cannot bypass the canonical matrix through an existing idempotent occurrence');
select is(mos.can_start_process_for_team('00000000-0000-0000-0000-00000000cc03'::uuid), true,
  'a sibling-stream member passes the matrix only for their requested bar Team');
select is(mos.can_start_process_for_team('00000000-0000-0000-0000-00000000cc02'::uuid), false,
  'that sibling-stream member fails the matrix for the actual canonical kitchen Team');
select throws_ok($$
  select mos.spawn_process_run(
    '00000000-0000-0000-0000-00000000c001'::uuid,
    '00000000-0000-0000-0000-00000000cc03'::uuid,
    date '2026-09-10')
$$, '42501', null,
  'a member of a different Team on the same branch cannot start the canonical Café Opening');
select is((select count(*)::int from mos.process_runs
            where work_line_id = '00000000-0000-0000-0000-00000000c001'
              and period_key = '2026-09-10'), 0,
  'the denied sibling request creates no occurrence');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select ok((mos.spawn_process_run(
             '00000000-0000-0000-0000-00000000c001'::uuid,
             '00000000-0000-0000-0000-00000000cc03'::uuid,
             date '2026-09-11')->>'run_id') is not null,
  'the default ops_lead grant starts the branch through the canonical Team');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select ok((mos.spawn_process_run(
             '00000000-0000-0000-0000-00000000c001'::uuid,
             '00000000-0000-0000-0000-00000000cc01'::uuid,
             date '2026-09-12')->>'run_id') is not null,
  'the default admin grant starts another branch through its canonical kitchen Team');

select shared.save_role_authority('[{"action":"process.start","role":"member","scope":"org"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select ok((mos.spawn_process_run(
             '00000000-0000-0000-0000-00000000c001'::uuid,
             '00000000-0000-0000-0000-00000000cc03'::uuid,
             date '2026-09-13')->>'run_id') is not null,
  'an admin member-scope override changes the sibling request from denied to allowed');
select is((select count(*)::int from mos.process_runs
            where work_line_id = '00000000-0000-0000-0000-00000000c001'
              and owning_team_id = '00000000-0000-0000-0000-00000000cc02'
              and period_key = '2026-09-13'), 1,
  'the override still preserves one canonical occurrence per period');
select is((select count(*)::int from mos.cafe_opening_branches()), 2,
  'the saved member org grant makes both canonical branch openings visible');
select is((select count(*)::int from mos.due_process_runs() where process_name = 'Café Opening'), 1,
  'the due surface follows the saved matrix and exposes the still-unstarted canonical branch');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"process.start","role":"member","scope":"own_team"}]'::jsonb);

select * from finish();
rollback;
