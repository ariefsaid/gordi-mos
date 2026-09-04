-- The composer destination list is the database read gate, including its effective windows and
-- role visibility. R4 is out of scope here: explicit mentions do not identify a destination Team.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();
set local role authenticated;

-- R1: the membership window is the same effective-dated predicate as mos.can_read_signal.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array['00000000-0000-0000-0000-000000005b02']::uuid[], 'R1: active member gets the owning Team');
reset role;
update shared.team_memberships
   set effective_from = current_date + 1
 where person_id = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array[]::uuid[], 'R1: membership before effective_from is not readable');
reset role;
update shared.team_memberships
   set effective_from = current_date
 where person_id = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array['00000000-0000-0000-0000-000000005b02']::uuid[], 'R1: membership through effective_from is readable');
reset role;
update shared.team_memberships
   set effective_to = current_date - 1
 where person_id = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array[]::uuid[], 'R1: membership after effective_to is not readable');
reset role;
update shared.team_memberships
   set effective_to = null
 where person_id = '00000000-0000-0000-0000-0000000000d4';

-- R2: a role scoped to the owning BU opens it, and removing that role closes it.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array['00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-000000005b02']::uuid[], 'R2: BU-scoped role reads both Teams');
reset role;
delete from shared.person_roles where person_id = '00000000-0000-0000-0000-0000000000d2';
set local role authenticated;
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array[]::uuid[], 'R2: removing the BU-scoped role closes both Teams');
reset role;
insert into shared.person_roles (org_id, person_id, role_id)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000f2');

-- R3: a strictly higher visibility rank opens it, and removing that role closes it.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array['00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-000000005b02']::uuid[], 'R3: higher BU rank reads both Teams');
reset role;
delete from shared.person_roles where person_id = '00000000-0000-0000-0000-0000000000d7';
set local role authenticated;
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array[]::uuid[], 'R3: removing the higher-rank role closes both Teams');
reset role;
insert into shared.person_roles (org_id, person_id, role_id)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000f4');

-- R5: the override opens every Team for a role holding it, then removing the registration closes it.
insert into shared.role_capabilities (role, capability, scope)
values ('member', 'signal.read_all', 'org');
delete from shared.person_roles where person_id = '00000000-0000-0000-0000-0000000000d5';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"000000000000000000000000000000d5","access_roles":["member"]}';
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array['00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-000000005b02']::uuid[], 'R5: signal.read_all opens every active Team');
reset role;
delete from shared.role_capabilities where role = 'member' and capability = 'signal.read_all';
set local role authenticated;
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array[]::uuid[], 'R5: removing signal.read_all closes every Team');

select * from finish();
rollback;
