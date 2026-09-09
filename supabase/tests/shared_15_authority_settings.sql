-- Tenant-local Work authority matrix and explicit Team-lead administration.
--
-- This suite is intentionally separate from the MOS row journeys: the settings RPCs live in
-- `shared`, and their contract must stay narrow even while they feed MOS authorization.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- The fixture's Lead R is deliberately NOT a BU head: its parent is another role in the same BU.
-- This root role is the positive precision control for the derived BU-head predicate.
reset role;
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id)
values ('00000000-0000-0000-0000-0000000000f7',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a2',
        'Unit-1 Head', null);
insert into shared.person_roles (org_id, person_id, role_id)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000f7');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-000000005b01', false);

-- Settings APIs are admin-only, but the viewer predicates are available to ordinary members.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.list_role_authority()), 56,
  'the admin matrix lists all seven actions across the eight editable authority categories');
select is((select scope from shared.list_role_authority()
            where action = 'workline.manage' and role = 'bu_head'), 'own_bu',
  'BU-head definition authority defaults to own_bu');
select is((select scope from shared.list_role_authority()
            where action = 'signal.post' and role = 'member'), 'org',
  'every org member defaults to org-wide Signal posting');
select is((select scope from shared.list_role_authority()
            where action = 'process.close' and role = 'team_lead'), 'own_team',
  'designated Team-lead close authority defaults to own_team');
select is((select scope from shared.list_role_authority()
            where action = 'process.close' and role = 'bu_head'), 'none',
  'BU-head status does not silently become Process close authority');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  select * from shared.list_role_authority()
$$, '42501', null,
  'a non-admin cannot read the editable authority matrix');

select throws_ok($$
  select shared.save_role_authority('[{"action":"signal.post","role":"member","scope":"none"}]'::jsonb)
$$, '42501', null,
  'a non-admin cannot change tenant-local authority');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"workline.manage","role":"member","scope":"own_bu"}]'::jsonb);
select is(shared.role_authority_scope('workline.manage', 'member'), 'own_bu',
  'an admin save changes only the current org override');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(mos.can_manage_definition('00000000-0000-0000-0000-0000000000a2'), true,
  'the saved member own_bu Workline grant changes the effective Project/Process predicate');
select is(mos.can_manage_objective_definition('00000000-0000-0000-0000-0000000000a2'), false,
  'a Workline-only grant does not authorize Objective writes');
select lives_ok($$
  insert into mos.work_lines (name, type, business_unit_id)
  values ('Tenant override project', 'project', '00000000-0000-0000-0000-0000000000a2')
$$, 'the saved member own_bu Workline grant changes the Project INSERT policy');
select throws_ok($$
  insert into mos.objectives (name, business_unit_id)
  values ('Objective still denied', '00000000-0000-0000-0000-0000000000a2')
$$, '42501', null,
  'a Workline-only grant cannot create an Objective in the same BU');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"workline.manage","role":"member","scope":"none"},{"action":"objective.manage","role":"member","scope":"own_bu"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(mos.can_manage_definition('00000000-0000-0000-0000-0000000000a2'), false,
  'an Objective-only grant does not authorize Project/Process writes');
select is(mos.can_manage_objective_definition('00000000-0000-0000-0000-0000000000a2'), true,
  'the saved member own_bu Objective grant changes the effective Objective predicate');
select lives_ok($$
  insert into mos.objectives (name, business_unit_id)
  values ('Tenant override objective', '00000000-0000-0000-0000-0000000000a2')
$$, 'the saved member own_bu Objective grant changes the Objective INSERT policy');
select throws_ok($$
  insert into mos.work_lines (name, type, business_unit_id)
  values ('Project still denied', 'project', '00000000-0000-0000-0000-0000000000a2')
$$, '42501', null,
  'an Objective-only grant cannot create a Project in the same BU');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"workline.manage","role":"member","scope":"own_bu"},{"action":"objective.manage","role":"member","scope":"none"}]'::jsonb);
select lives_ok($$
  insert into mos.work_lines (id, name, type, business_unit_id)
  values ('00000000-0000-0000-0000-00000000a801', 'Source-scope project', 'project',
          '00000000-0000-0000-0000-0000000000a3')
$$, 'an admin can seed a Project in the source BU for the old-row scope control');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update mos.work_lines
     set business_unit_id = '00000000-0000-0000-0000-0000000000a2'
   where id = '00000000-0000-0000-0000-00000000a801'
$$, '42501', null,
  'a destination BU grant cannot move a Project out of an unmanaged source BU');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"workline.manage","role":"member","scope":"none"},{"action":"objective.manage","role":"member","scope":"own_bu"}]'::jsonb);
select lives_ok($$
  insert into mos.objectives (id, name, business_unit_id)
  values ('00000000-0000-0000-0000-00000000a802', 'Source-scope objective',
          '00000000-0000-0000-0000-0000000000a3')
$$, 'an admin can seed an Objective in the source BU for the old-row scope control');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update mos.objectives
     set business_unit_id = '00000000-0000-0000-0000-0000000000a2'
   where id = '00000000-0000-0000-0000-00000000a802'
$$, '42501', null,
  'a destination BU grant cannot move an Objective out of an unmanaged source BU');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$
  select shared.save_role_authority('[{"action":"signal.post","role":"member","scope":"org"},{"action":"signal.post","role":"member","scope":"none"}]'::jsonb)
$$, '22023', null,
  'duplicate action-role rows are rejected');
select throws_ok($$
  select shared.save_role_authority('[{"action":"signal.post","role":"member","scope":"own_bu"}]'::jsonb)
$$, '22023', null,
  'a scope not admitted for the action is rejected');
select throws_ok($$
  select shared.save_role_authority('[{"action":"not.an.action","role":"member","scope":"org"}]'::jsonb)
$$, '22023', null,
  'an unknown action is rejected');
select throws_ok($$
  select shared.save_role_authority('[{"action":"signal.post","role":"admin","scope":"none"}]'::jsonb)
$$, '42501', null,
  'an admin cannot remove the admin settings-control category');
select ok(not has_table_privilege('authenticated', 'shared.role_authority', 'INSERT'),
  'the override table has no direct authenticated INSERT privilege');
select ok(not has_table_privilege('authenticated', 'shared.team_lead_assignments', 'INSERT'),
  'Team-lead assignments have no direct authenticated INSERT privilege');

select set_eq($$ select person_id from shared.list_team_lead_candidates('00000000-0000-0000-0000-000000005b01') $$,
  array['00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2']::uuid[],
  'candidate RPC returns every active same-org member of the Team');
select shared.save_team_lead_assignment(
  '00000000-0000-0000-0000-000000005b01',
  '00000000-0000-0000-0000-0000000000d2');
select ok(shared.is_designated_team_lead(
  '00000000-0000-0000-0000-000000005b01',
  '00000000-0000-0000-0000-0000000000d2'),
  'the saved lead is designated only while the assignment is active');
select is((select lead_person_id from shared.list_team_lead_assignments()
            where team_id = '00000000-0000-0000-0000-000000005b01'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'assignment listing returns the designated person');
select is((select lead_name from shared.list_team_lead_assignments()
            where team_id = '00000000-0000-0000-0000-000000005b01'), 'DirectMgr',
  'assignment listing returns the directory name');

reset role;
update shared.team_memberships
   set effective_to = current_date - 1
 where person_id = '00000000-0000-0000-0000-0000000000d2'
   and team_id = '00000000-0000-0000-0000-000000005b01';
set local role authenticated;
select ok(not shared.is_designated_team_lead(
  '00000000-0000-0000-0000-000000005b01',
  '00000000-0000-0000-0000-0000000000d2'),
  'an ended Team membership removes effective lead authority');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$
  select shared.save_team_lead_assignment(
    '00000000-0000-0000-0000-000000005b01',
    '00000000-0000-0000-0000-0000000000d2')
$$, '42501', null,
  'an ended Team member cannot be assigned as a Team lead');
select shared.save_team_lead_assignment(
  '00000000-0000-0000-0000-000000005b01', null);
select is((select lead_person_id from shared.list_team_lead_assignments()
            where team_id = '00000000-0000-0000-0000-000000005b01'), null::uuid,
  'saving a null lead clears the current designation');

select * from finish();
rollback;
