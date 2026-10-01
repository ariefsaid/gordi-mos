-- Org-wide authority is the admin access role ONLY (shared.is_org_wide()): such a writer may name
-- ANY same-org person as a Task PIC, on insert and on a PIC change. Hierarchy shape grants
-- nothing: a top-of-chain role holder with no admin claim keeps the writer-or-downline rule
-- (mos_12_task_permissions.sql owns that contract; the unchanged cases here prove it did not widen).
--
-- Personas from shared._test_seed_directory:
--   GrandMgr ...d3 holds Exec (the top role), claim without admin → manager of everyone with a role
--   Report   ...d5 holds a leaf role                 → org-wide only when its claim carries admin
--   DirectMgr ...d2 Lead R                           → manager, NOT org-wide
--   Unassigned ...d8 (added here) holds no role      → in nobody's role-tree downline
--   Contractor ...d9 (added here) holds a role that reports to no role, no admin, no manager role
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select shared._test_seed_directory();
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000d8','00000000-0000-0000-0000-0000000000a1','Unassigned'),
  ('00000000-0000-0000-0000-0000000000d9','00000000-0000-0000-0000-0000000000a1','Contractor');
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id)
values ('00000000-0000-0000-0000-0000000000f9','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Detached', null);
insert into shared.person_roles (org_id, person_id, role_id)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d9','00000000-0000-0000-0000-0000000000f9');

set local role authenticated;

-- ── shared.is_org_wide() ────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select is(shared.is_org_wide(), false, 'a top-role holder without the admin role is not org-wide');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["manager"]}';
select is(shared.is_org_wide(), false, 'a manager below the top role is not org-wide');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["admin"]}';
select is(shared.is_org_wide(), true, 'the admin access role is org-wide whatever the held role');

-- ── insert: hierarchy shape grants nothing ──────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('top-role non-admin role-less PIC','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d8',
          '00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d3')
$$, '42501', null, 'a top-role holder without admin cannot name a person outside their downline as PIC');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d9","access_roles":["member"]}';
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('detached-role member PIC','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
          '00000000-0000-0000-0000-0000000000d9','00000000-0000-0000-0000-0000000000d9')
$$, '42501', null, 'a member holding a role that reports to no role cannot name another person as PIC');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('top-role downline PIC','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d3')
$$, 'a top-role holder keeps the chain rule: a person in their downline is allowed');

-- ── insert: admin may name anyone ───────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('admin cross-branch PIC','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d7',
          '00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d5')
$$, 'an admin may name a person outside their downline as PIC');

-- ── insert: everyone else is unchanged ──────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["manager"]}';
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('manager role-less PIC','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d8',
          '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d2')
$$, '42501', null, 'a manager below the top role still cannot name a person outside their downline');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('member peer PIC','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
          '00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d5')
$$, '42501', null, 'a member without the admin claim still cannot name a peer as PIC');

-- ── an admin-only writer (no role at all) ──────────────────────────────────────────────────────
-- Unassigned ...d8 holds no role, so it has no downline. Whatever it may do comes from the admin
-- access role alone; the same person without the claim is the control.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d8","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('admin-only assigns PIC and Supervisor','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
          '00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000d8')
$$, 'an admin-only writer may name any other person as PIC and any other person as Supervisor');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d8","access_roles":["member"]}';
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('plain member names a PIC','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
          '00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000d8')
$$, '42501', null, 'the same person without the admin claim cannot name another person as PIC');
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('plain member names a Supervisor','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d8',
          '00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000d8')
$$, 'Supervisor is not gated by the PIC rule: any same-org person, for every writer');

-- ── update: a PIC change ────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000a1','update task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select throws_ok($$
  update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d8'
  where id = '00000000-0000-0000-0000-000000007001'
$$, '42501', null, 'a top-role holder without admin who can edit the task cannot re-point its PIC to a role-less person');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$
  update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d8'
  where id = '00000000-0000-0000-0000-000000007001'
$$, 'an admin who can edit the task may re-point its PIC to a role-less person');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["manager"]}';
select throws_ok($$
  update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d7'
  where id = '00000000-0000-0000-0000-000000007001'
$$, '42501', null, 'a manager below the top role still cannot re-point the PIC outside their downline');

-- ── the creator's `created` event: an admin creator may log it even when not a task editor ──────
-- The admin names a role-less PIC and DirectMgr as Supervisor: they are then neither PIC,
-- Supervisor nor a manager above the PIC, so mos.can_edit_task is false for them.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-0000000000a1','admin created event',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d8',
        '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3');
select is(mos.can_edit_task('00000000-0000-0000-0000-000000007002'), false,
  'setup: the admin creator is not an editor of a task they assigned outside their chain');
select lives_ok($$
  insert into mos.task_events (task_id, actor_person_id, event_type)
  values ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-0000000000d3','created')
$$, 'the admin creator may log the created event for their own task');
select throws_ok($$
  insert into mos.task_events (task_id, actor_person_id, event_type)
  values ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-0000000000d3','field_edited')
$$, '42501', null, 'the exemption is the created event only: any other event still needs edit rights');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select throws_ok($$
  insert into mos.task_events (task_id, actor_person_id, event_type)
  values ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-0000000000d3','created')
$$, '42501', null, 'the exemption keys off the admin role, not the top role: the same creator without admin is refused');

-- ── org-wide is still one org ───────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('admin foreign PIC','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b4',
          '00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d3')
$$, '23514', null, 'an admin still cannot name a person from another org as PIC');

reset role;
select * from finish();
rollback;
