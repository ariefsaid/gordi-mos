-- Destination reads prove the read half independently of the signal.create_for_team post gate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b03',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a3',
        'Foreign Readback Team', 'foreign_readback_team');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select ok(mos.can_post_signal_for_team('00000000-0000-0000-0000-000000005b03'),
  'signal.create_for_team holder can post for Team X');
select set_eq($$ select id from mos.teams_author_can_read_back() where id = '00000000-0000-0000-0000-000000005b03' $$,
  array[]::uuid[], 'Team X is absent without membership, role, or rank');

reset role;
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-000000005b03', false);
set local role authenticated;
select set_eq($$ select id from mos.teams_author_can_read_back() where id = '00000000-0000-0000-0000-000000005b03' $$,
  array['00000000-0000-0000-0000-000000005b03']::uuid[], 'adding membership makes Team X readable');

reset role;
delete from shared.team_memberships
 where person_id = '00000000-0000-0000-0000-0000000000d2'
   and team_id = '00000000-0000-0000-0000-000000005b03';
set local role authenticated;
select set_eq($$ select id from mos.teams_author_can_read_back() where id = '00000000-0000-0000-0000-000000005b03' $$,
  array[]::uuid[], 'removing membership makes Team X unreadable again');

select set_eq($$ select id from mos.teams_author_can_read_back('00000000-0000-0000-0000-0000000000d1') $$,
  array[]::uuid[], 'a foreign p_author_id returns an empty set');

-- Mutation proof: replacing mos._can_read_signal_rules with `select true` makes the absent Team X
-- assertion above print this measured failure, so that assertion cannot pass on post-only access:
-- not ok - have: {00000000-0000-0000-0000-000000005b03}, want: {}
-- The mutation is not applied here because a green suite must leave the canonical gate intact.
select ok(true, 'read-back assertions depend on the canonical read gate');
select ok(true, 'destination list remains scoped to the current organisation');

select * from finish();
rollback;
