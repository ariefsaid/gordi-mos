-- shared — a person is created WITH a primary Team, in one call (#798, OD-WAY-98).
--
-- shared.admin_create_person is SECURITY DEFINER, so the in-body admin predicate and the team
-- requirement are the gates. Every refusal below is also asserted to leave no person row behind.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select shared._test_seed_directory();
select shared._test_seed_access_roles();
-- GrandMgr ...0d03 -> admin. Org A = ...00a1, Org B = ...00b1.

insert into shared.teams (id, org_id, business_unit_id, name, code) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','A Team','a_team'),
  ('00000000-0000-0000-0000-0000000000e9','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','B Team','b_team');

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-005: refused callers — ops_lead and member — and nothing is written
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead"]}';
select throws_ok($$
  select shared.admin_create_person('Lead Made', 'lead.made@example.test', '00000000-0000-0000-0000-0000000000e1')
$$, '42501', 'admin access role required', 'an ops_lead cannot create a person — provisioning has no ops-lead arm');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  select shared.admin_create_person('Member Made', 'member.made@example.test', '00000000-0000-0000-0000-0000000000e1')
$$, '42501', 'admin access role required', 'a member cannot create a person');

select is((select count(*)::int from shared.people where full_name in ('Lead Made','Member Made')), 0,
  'the refused calls wrote no person row');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-005: admin + Team -> person + live primary membership; no Team -> refused before any insert
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

select throws_ok($$
  select shared.admin_create_person('No Team', 'no.team@example.test', null)
$$, '22023', 'a primary team is required', 'a call without a Team is refused');
select is((select count(*)::int from shared.people where full_name = 'No Team'), 0,
  '...and left no person row — the refusal runs before the insert');

select throws_ok($$
  select shared.admin_create_person('Wrong Org', 'wrong.org@example.test', '00000000-0000-0000-0000-0000000000e9')
$$, '42501', 'team not found in your org', 'another org''s team is refused — the org seam holds inside the definer');
select is((select count(*)::int from shared.people where full_name = 'Wrong Org'), 0,
  '...and left no person row');

select throws_ok($$
  select shared.admin_create_person('  ', 'blank@example.test', '00000000-0000-0000-0000-0000000000e1')
$$, '22023', 'full name is required', 'a blank name is refused');

select lives_ok($$
  select shared.admin_create_person('Made Person', 'made.person@example.test', '00000000-0000-0000-0000-0000000000e1')
$$, 'an admin with a Team creates a person');

select is(
  (select org_id from shared.people where id = (select id from shared.people where full_name = 'Made Person')),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'an admin creates a person in their own org');
select is(
  (select count(*)::int from shared.team_memberships m
    where m.person_id = (select id from shared.people where full_name = 'Made Person')
      and m.team_id = '00000000-0000-0000-0000-0000000000e1'
      and m.is_primary and m.effective_to is null),
  1, '...with one live PRIMARY membership on the given team, in the same call');
select is(
  (select user_id from shared.people where id = (select id from shared.people where full_name = 'Made Person')),
  null, '...and no login — creating a login stays a separate admin act');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-006: Positions and the access role land in the same transaction; none given -> member
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select is(
  (select access_role from shared.person_access_roles
    where person_id = (select id from shared.people where full_name = 'Made Person') and revoked_at is null),
  'member', 'no access role given -> member');

select lives_ok($$
  select shared.admin_create_person('Made Lead', 'made.lead@example.test',
           '00000000-0000-0000-0000-0000000000e1',
           array['00000000-0000-0000-0000-0000000000f3']::uuid[], 'ops_lead')
$$, 'an admin creates a person with Positions and an access role');

select is(
  (select array_agg(role_id) from shared.person_roles where person_id = (select id from shared.people where full_name = 'Made Lead')),
  array['00000000-0000-0000-0000-0000000000f3']::uuid[],
  'the given Position ids are held by the new person');
select is(
  (select granted_by from shared.person_roles where person_id = (select id from shared.people where full_name = 'Made Lead')),
  '00000000-0000-0000-0000-0000000000d3'::uuid,
  '...attributed to the calling admin, not to nobody');
select is(
  (select access_role from shared.person_access_roles
    where person_id = (select id from shared.people where full_name = 'Made Lead') and revoked_at is null),
  'ops_lead', 'the given access role is written');

-- A Position from another org fails the Jabatan guard, and the whole call rolls back: no person,
-- no membership, no half-provisioned row.
select throws_ok($$
  select shared.admin_create_person('Half Made', 'half.made@example.test',
           '00000000-0000-0000-0000-0000000000e1',
           array['00000000-0000-0000-0000-0000000000c1']::uuid[])
$$, '42501', 'position is not in your org', 'another org''s Position is refused');
select is((select count(*)::int from shared.people where full_name = 'Half Made'), 0,
  '...and the person insert rolled back with it — one transaction, not a partial write');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-009: a sign-in-name account (synthetic address) resets like any other, and only by admin
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select shared.admin_create_person('No Mail', 'no-mail@ops.gordi.local', '00000000-0000-0000-0000-0000000000e1')
$$, 'a person whose only address is the synthetic sign-in name is created like any other');

select cmp_ok(length(shared.admin_create_login((select id from shared.people where full_name = 'No Mail'))), '>=', 8,
  'a sign-in-name person gets a login — the synthetic address is the fact — with a temp password of 8+ chars');

-- The rotation flag is lowered only by an actual password change, which the people guard refuses to
-- fake from an app session — so lower it as the owner, then come back as the admin for the reset.
reset role;
update shared.people set must_change_password = false where full_name = 'No Mail';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

select cmp_ok(length(shared.admin_reset_password((select id from shared.people where full_name = 'No Mail'))), '>=', 8,
  'an admin reset on the sign-in-name account returns a temp password of 8+ chars');
select is(
  (select must_change_password from shared.people where id = (select id from shared.people where full_name = 'No Mail')),
  true, '...and sets must_change_password — the temporary password is in force');

reset role;
select * from finish();
rollback;
