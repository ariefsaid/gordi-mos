-- shared, squashed baseline — ONE fail-closed assertion per policy, none inherited.
--
-- A re-authored RLS policy is a NEW policy. Its fail-closed proof does not carry over from the
-- policy it replaces, so this file exists to pair every policy created in
-- 20260805000002_shared_access_control.sql with its own negative assertion, written against that
-- SQL. The plan below is deliberately structured one section per policy so the mapping is checkable
-- by eye rather than by trust.
--
-- Note the two different shapes of "denied", because reading one for the other is how a hole gets
-- missed: an INSERT with no permitting policy RAISES 42501, while an UPDATE or DELETE with no
-- permitting policy silently affects ZERO ROWS. Both are asserted in their correct form.
--
-- Policies covered (18):
--   orgs_select_own · business_units_select_org · roles_select_org · people_select_org ·
--   people_select_self · person_roles_select_org · person_access_roles_select_org ·
--   sites_select_org · teams_select_org · team_memberships_select_org · branches_select_org ·
--   role_capabilities_select_all · people_insert_admin · people_update_admin ·
--   person_roles_insert_admin · person_roles_delete_admin · person_access_roles_insert_admin ·
--   person_access_roles_update_admin
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select shared._test_seed_directory();
select shared._test_seed_access_roles();   -- GrandMgr ...0d03 -> admin

insert into shared.sites (id, org_id, name, code) values
  ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000a1','A Site','a_site'),
  ('00000000-0000-0000-0000-000000000e02','00000000-0000-0000-0000-0000000000b1','B Site','b_site');
insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
  ('00000000-0000-0000-0000-000000000e03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000e01','A Team','a_team'),
  ('00000000-0000-0000-0000-000000000e04','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000e02','B Team','b_team');
insert into shared.team_memberships (org_id, person_id, team_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000e03'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-000000000e04');
insert into shared.branches (org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1','a_branch','A Branch'),
  ('00000000-0000-0000-0000-0000000000b1','b_branch','B Branch');

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- READ POLICIES — an org-B session must read NOTHING of org A, and a claimless session nothing at all
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Org B is a real tenant with real rows, so each zero below is isolation rather than emptiness.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';

select is((select count(*)::int from shared.orgs where id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'orgs_select_own: an org-B session reads zero org-A org rows');
select is((select count(*)::int from shared.business_units where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'business_units_select_org: an org-B session reads zero org-A business units');
select is((select count(*)::int from shared.roles where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'roles_select_org: an org-B session reads zero org-A roles');
select is((select count(*)::int from shared.people where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'people_select_org: an org-B session reads zero org-A people');
select is((select count(*)::int from shared.person_roles where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'person_roles_select_org: an org-B session reads zero org-A jabatan assignments');
select is((select count(*)::int from shared.person_access_roles where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'person_access_roles_select_org: an org-B session reads zero org-A access-role grants — even holding admin in its OWN org');
select is((select count(*)::int from shared.sites where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'sites_select_org: an org-B session reads zero org-A sites');
select is((select count(*)::int from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'teams_select_org: an org-B session reads zero org-A teams');
select is((select count(*)::int from shared.team_memberships where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'team_memberships_select_org: an org-B session reads zero org-A team memberships');
select is((select count(*)::int from shared.branches where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'branches_select_org: an org-B session reads zero org-A branches');

-- people_select_self is a SECOND, permissive policy on people. Its own fail-closed property is that
-- it grants exactly ONE row — the caller's — and never widens the org read. Asserted from org B, so
-- a leak would show up as an org-A row appearing.
select is(
  (select array_agg(id order by id) from shared.people),
  array['00000000-0000-0000-0000-0000000000b4'::uuid],
  'people_select_self: grants the caller their OWN row and nothing else — it does not widen the org read');

-- Claimless: every read policy resolves through current_org_id(), so all of them close together.
set local request.jwt.claims = '{}';
select is(
  (select (select count(*) from shared.orgs)             + (select count(*) from shared.business_units)
        + (select count(*) from shared.roles)            + (select count(*) from shared.people)
        + (select count(*) from shared.person_roles)     + (select count(*) from shared.person_access_roles)
        + (select count(*) from shared.sites)            + (select count(*) from shared.teams)
        + (select count(*) from shared.team_memberships) + (select count(*) from shared.branches)),
  0::bigint,
  'every shared read policy: a session with NO claims reads zero rows across all ten org-scoped tables');

-- role_capabilities is deliberately org-less global vocabulary, so its read predicate is `true` and
-- there is nothing to isolate. Its fail-closed property is the WRITE surface, asserted below.
select cmp_ok((select count(*) from shared.role_capabilities), '>', 0::bigint,
  'role_capabilities_select_all: the capability vocabulary is readable by any authenticated session (deliberate — it is not secret)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WRITE POLICIES — a non-admin org member is closed out of every one of them
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Peer (...0d04) is an ordinary org-A member holding no access role at all. Every attempt below is
-- inside their own org, so what is being proven is the access-role gate, not the org gate.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';

select throws_ok($$
  insert into shared.people (full_name) values ('Smuggled Person')
$$, '42501', null, 'people_insert_admin: a non-admin member cannot create a person');

-- The UPDATE/DELETE attempts are issued as plain statements and the OUTCOME is then asserted on the
-- data. Reading a row count back is not available here (a data-modifying CTE may not sit inside a
-- subquery), and asserting the surviving state is the stronger claim anyway: it proves nothing
-- moved, not merely that the statement reported nothing.
update shared.people set full_name = 'Renamed By Non-Admin'
 where id = '00000000-0000-0000-0000-0000000000d1';
select is(
  (select full_name from shared.people where id = '00000000-0000-0000-0000-0000000000d1'),
  'Author',
  'people_update_admin: a non-admin member changes nothing (an UPDATE with no permitting policy matches zero rows, it does not raise)');

select throws_ok($$
  insert into shared.person_roles (person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f1')
$$, '42501', null, 'person_roles_insert_admin: a non-admin member cannot assign themselves a Jabatan');

delete from shared.person_roles where person_id = '00000000-0000-0000-0000-0000000000d1';
select is(
  (select count(*)::int from shared.person_roles
    where person_id = '00000000-0000-0000-0000-0000000000d1'),
  1, 'person_roles_delete_admin: a non-admin member removes no Jabatan assignment — the row survives');

select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d4','admin')
$$, '42501', null, 'person_access_roles_insert_admin: a non-admin member cannot grant themselves admin');

update shared.person_access_roles set revoked_at = now()
 where person_id = '00000000-0000-0000-0000-0000000000d3' and access_role = 'admin';
select is(
  (select revoked_at from shared.person_access_roles
    where person_id = '00000000-0000-0000-0000-0000000000d3' and access_role = 'admin'),
  null, 'person_access_roles_update_admin: a non-admin member cannot strip the org admin — the grant is still live');

-- role_capabilities has no write policy and no write grant at all, for any role. Asserted at the
-- privilege layer, since a missing GRANT denies before any policy is consulted.
select ok(not has_table_privilege('authenticated','shared.role_capabilities','INSERT'),
  'role_capabilities: authenticated has no INSERT privilege — the vocabulary is migration-owned');
select ok(not has_table_privilege('authenticated','shared.role_capabilities','UPDATE')
      and not has_table_privilege('authenticated','shared.role_capabilities','DELETE'),
  'role_capabilities: authenticated has no UPDATE or DELETE privilege either');

-- ── The admin gate is org-scoped as well as role-scoped ──────────────────────────────────────
-- An admin is not a global admin. Org B's admin, acting with a real admin claim, still cannot reach
-- into org A — which is what stops "admin" from becoming a cross-tenant capability.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';

select throws_ok($$
  insert into shared.people (org_id, full_name)
  values ('00000000-0000-0000-0000-0000000000a1','Cross-Org Person')
$$, '42501', null, 'people_insert_admin: an admin of another org cannot create a person in org A');

-- Issued from org B, whose session cannot even SEE the org-A rows; the outcome is therefore read
-- back after `reset role`, as the owner, or the assertion would trivially pass on an empty result.
update shared.people set full_name = 'Renamed Cross-Org'
 where id = '00000000-0000-0000-0000-0000000000d1';
delete from shared.person_roles where org_id = '00000000-0000-0000-0000-0000000000a1';
update shared.person_access_roles set revoked_at = now()
 where org_id = '00000000-0000-0000-0000-0000000000a1';

reset role;

select is(
  (select full_name from shared.people where id = '00000000-0000-0000-0000-0000000000d1'),
  'Author', 'people_update_admin: an admin of ANOTHER org changed no org-A person row');
select is(
  (select count(*)::int from shared.person_roles where org_id = '00000000-0000-0000-0000-0000000000a1'),
  8, 'person_roles_delete_admin: an admin of another org removed no org-A Jabatan assignment');
select is(
  (select count(*)::int from shared.person_access_roles
    where org_id = '00000000-0000-0000-0000-0000000000a1' and revoked_at is not null),
  1, 'person_access_roles_update_admin: an admin of another org revoked nothing — only the fixture''s own revoked row remains');

select * from finish();
rollback;
