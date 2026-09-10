-- Regression journey for the author read-back contract.
-- Same-org posting is open under OD-WAY-100: the author may post for any active same-org Team and
-- must be able to read the Signal they just posted. The original audience read gate still applies
-- to everyone else; tenant isolation remains a separate boundary.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- Unit-2 is outside DirectMgr's Unit-1-scoped membership read arm. DirectMgr is nevertheless
-- admitted to post by the signal.create_for_team capability and is not a member of this Team.
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b03',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a3',
        'Foreign Readback Team', 'foreign_readback_team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-000000005b01', true);

reset role;
set local role authenticated;
create temp table signal_readback_probe (
  foreign_id uuid,
  own_id uuid
) on commit drop;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select ok(mos.can_post_signal_for_team('00000000-0000-0000-0000-000000005b03'),
  'JOURNEY foreign: signal.create_for_team admits the author to post for T');
select ok(not exists (
  select 1 from shared.team_memberships
  where person_id = '00000000-0000-0000-0000-0000000000d2'
    and team_id = '00000000-0000-0000-0000-000000005b03'
), 'JOURNEY foreign: author is not a member of T');

insert into signal_readback_probe (foreign_id)
select mos.create_signal_with_mentions(
  p_body => 'Foreign owning team read-back probe',
  p_owning_team_id => '00000000-0000-0000-0000-000000005b03',
  p_occurred_at => now()
);
select isnt((select foreign_id from signal_readback_probe), null,
  'JOURNEY foreign: create_signal_with_mentions returns an id');
select is((select count(*)::int from mos.signals where id = (select foreign_id from signal_readback_probe)), 1,
  'JOURNEY same-org: the author reads back a Signal for a non-member destination Team');

select ok(mos.can_post_signal_for_team('00000000-0000-0000-0000-000000005b01'),
  'JOURNEY control: the author can post for their own Team');
update signal_readback_probe
set own_id = mos.create_signal_with_mentions(
  p_body => 'Own owning team read-back control',
  p_owning_team_id => '00000000-0000-0000-0000-000000005b01',
  p_occurred_at => now()
);
select isnt((select own_id from signal_readback_probe), null,
  'JOURNEY control: create_signal_with_mentions returns an own-Team id');
select is((select count(*)::int from mos.signals where id = (select own_id from signal_readback_probe)), 1,
  'JOURNEY control: author SELECT reads the own-Team Signal immediately');
reset role;
select * from finish();
rollback;
