-- A member reads the Team-lead designation of their own active Teams only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- Fixture: d1 is a member of OwnTeam (5b01), d4 of SiblingTeam (5b02), d3 is an admin. d2 joins
-- OwnTeam and leads it; d4 leads SiblingTeam.
reset role;
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-000000005b01', false);
insert into shared.team_lead_assignments (org_id, team_id, lead_person_id)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000005b01',
        '00000000-0000-0000-0000-0000000000d2'),
       ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000005b02',
        '00000000-0000-0000-0000-0000000000d4');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is((select lead_person_id from shared.team_lead_assignments
            where team_id = '00000000-0000-0000-0000-000000005b01'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'a member reads the lead of their own Team');
select is((select count(*)::int from shared.team_lead_assignments
            where team_id = '00000000-0000-0000-0000-000000005b02'), 0,
  'a member cannot read the lead of another Team');
select is((select count(*)::int from shared.team_lead_assignments), 1,
  'a member sees only their own Team''s row');
select ok(not has_column_privilege('authenticated', 'shared.team_lead_assignments', 'assigned_by', 'SELECT'),
  'the audit columns stay unreadable to members');
select ok(not has_table_privilege('authenticated', 'shared.team_lead_assignments', 'INSERT')
      and not has_table_privilege('authenticated', 'shared.team_lead_assignments', 'UPDATE')
      and not has_table_privilege('authenticated', 'shared.team_lead_assignments', 'DELETE'),
  'the table stays write-closed to members');

reset role;
update shared.team_memberships
   set effective_to = current_date - 1
 where person_id = '00000000-0000-0000-0000-0000000000d1'
   and team_id = '00000000-0000-0000-0000-000000005b01';
set local role authenticated;
select is((select count(*)::int from shared.team_lead_assignments), 0,
  'an ended membership no longer reads the Team lead');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select is((select count(*)::int from shared.list_team_lead_assignments() where lead_person_id is not null), 2,
  'an admin still lists every Team lead through the settings RPC');
select is((select count(*)::int from shared.team_lead_assignments), 0,
  'the policy grants an admin no rows beyond their own Teams');

set local role anon;
select throws_ok($$ select count(*) from shared.team_lead_assignments $$, '42501', null,
  'an anonymous caller reads nothing');

select * from finish();
rollback;
