-- shared — batch 2d of the change-history rollout (#989): the Directory & authority slice. The
-- eight uuid-id directory tables write shared.record_history through the one generic trigger and
-- read back through their own plain org-membership SELECT policies; the batch's TWO composite-key
-- tables — shared.role_authority (org_id, action, role) and shared.team_lead_assignments
-- (org_id, team_id) — are the change-history spec's DA-1 here: no uuid id, so the record_key is
-- the registered PK columns ':'-joined in PK order ('<org-uuid>:<action>:<role>' /
-- '<org-uuid>:<team-uuid>'), and because both tables are deliberately RPC-only (no SELECT grant,
-- no SELECT policy — the admin-only SECURITY DEFINER list/save functions are the only surface)
-- their history reads through that RPC authority: same org, admin tier. The batch's one
-- hard-DELETE is shared.person_roles (the Jabatan assignment — the only authenticated DELETE
-- grant in the schema, person_roles_delete_admin): its delete row stays readable through the
-- snapshot arm, by exactly those who could read the row before — the org-wide
-- person_roles_select_org predicate over the captured columns, no role gate.
--
-- Fixture, on the shared directory tree (org A ...0a1, org B ...0b1): GrandMgr ...0d3 is org A's
-- admin (every directory write authority), Peer ...0d4 is the same-org plain member, ForeignMgr
-- ...0b4 is org B's admin and the negative control. Hand-seeded as service writes: one site, one
-- business unit, one role, one Team, memberships for ...0d4 and ...0d7 on that Team — the
-- substrate the composite-key rows and the delete proof hang from.
begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

select shared._test_seed_directory();

select has_function('shared', 'can_read_history_record', ARRAY['text','text','text','text','jsonb'],
  'the read dispatch is exposed with the (schema, table, key, action, snapshot) shape');

-- ── Directory fixture beyond the seed, written as a service session (no claims): the seeded tree
-- carries no sites/teams, and business_units/roles/sites hold no write grant for any application
-- role — the seed path is their only writer. Fixed keys, all in org A (...0a1).
insert into shared.sites (id, org_id, name, code)
values ('00000000-0000-0000-0000-000000009972', '00000000-0000-0000-0000-0000000000a1',
        'History Site', 'HIST-SITE');

insert into shared.business_units (id, org_id, name, code)
values ('00000000-0000-0000-0000-000000009974', '00000000-0000-0000-0000-0000000000a1',
        'History BU', 'HIST-BU');

insert into shared.roles (id, org_id, business_unit_id, name)
values ('00000000-0000-0000-0000-000000009973', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009974', 'History Role');

insert into shared.teams (id, org_id, business_unit_id, site_id, name, code)
values ('00000000-0000-0000-0000-000000009971', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009974', '00000000-0000-0000-0000-000000009972',
        'History Team', 'HIST-TEAM');

-- ── a service INSERT appends exactly one summary row, actor NULL (FR-005) ─────────────────────
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'sites'
             and record_key = '00000000-0000-0000-0000-000000009972'),
  1, 'a service INSERT into shared.sites appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'business_units'
             and record_key = '00000000-0000-0000-0000-000000009974'),
  1, 'a service INSERT into shared.business_units appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'roles'
             and record_key = '00000000-0000-0000-0000-000000009973'),
  1, 'a service INSERT into shared.roles appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'teams'
             and record_key = '00000000-0000-0000-0000-000000009971'),
  1, 'a service INSERT into shared.teams appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where schema_name = 'shared' and table_name = 'sites'
             and record_key = '00000000-0000-0000-0000-000000009972'),
  null, 'the service-seeded site insert carries no actor claim (FR-005)');

-- ── the admin's directory writes stamp their person claim (FR-004) ────────────────────────────
-- Directory writes are admin-gated (people_insert_admin, person_access_roles_insert_admin,
-- team_memberships_insert_admin): the org-A admin is the real write path, so the admin persona
-- is the one whose claim must land in the actor column.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

insert into shared.people (id, org_id, full_name)
values ('00000000-0000-0000-0000-000000009975', '00000000-0000-0000-0000-0000000000a1',
        'History Person');

insert into shared.person_access_roles (id, org_id, person_id, access_role)
values ('00000000-0000-0000-0000-000000009976', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009975', 'member');

insert into shared.team_memberships (id, org_id, person_id, team_id)
values ('00000000-0000-0000-0000-000000009977', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000009971'),
       ('00000000-0000-0000-0000-000000009979', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-000000009971');

select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-000000009975'),
  1, 'the admin''s INSERT into shared.people appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-000000009975'),
  '00000000-0000-0000-0000-0000000000d3', 'the admin''s person insert stamps their claim as actor');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'person_access_roles'
             and record_key = '00000000-0000-0000-0000-000000009976'),
  1, 'the admin''s access-role grant appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where schema_name = 'shared' and table_name = 'person_access_roles'
             and record_key = '00000000-0000-0000-0000-000000009976'),
  '00000000-0000-0000-0000-0000000000d3', 'the access-role grant stamps the granting admin');

-- A soft revoke is an UPDATE (revoked_at), not a delete: the granting admin revokes the same
-- grant and the trail records who revoked, when, and what changed.
update shared.person_access_roles set revoked_at = now()
 where id = '00000000-0000-0000-0000-000000009976';
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'person_access_roles'
             and record_key = '00000000-0000-0000-0000-000000009976'
             and field_name = 'revoked_at'),
  1, 'the soft revoke appends its revoked_at row on the same grant');
select is((select actor_person_id::text from shared.record_history
           where schema_name = 'shared' and table_name = 'person_access_roles'
             and record_key = '00000000-0000-0000-0000-000000009976'
             and field_name = 'revoked_at'),
  '00000000-0000-0000-0000-0000000000d3', 'the revoke stamps the revoking admin');

select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_memberships'
             and record_key = '00000000-0000-0000-0000-000000009977'),
  1, 'the admin''s team-membership write appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where schema_name = 'shared' and table_name = 'team_memberships'
             and record_key = '00000000-0000-0000-0000-000000009977'),
  '00000000-0000-0000-0000-0000000000d3', 'the membership write stamps the administering admin');

-- ── a two-column UPDATE appends exactly two rows, with the old and new values ─────────────────
update shared.people set full_name = 'History Person Renamed',
                         email = 'history-person@example.test'
 where id = '00000000-0000-0000-0000-000000009975';

select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-000000009975'),
  3, 'a two-column UPDATE on shared.people appends exactly two rows (insert + 2)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009975' and field_name = 'full_name'),
  'History Person', 'the rename records the old name');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009975' and field_name = 'full_name'),
  'History Person Renamed', 'the rename records the new name');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009975' and field_name = 'email'),
  null, 'the email change records the honest NULL it replaced');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009975' and field_name = 'email'),
  'history-person@example.test', 'the email change records the new address');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009975' and field_name = 'updated_at'),
  0, 'the set_updated_at clock writes no history row beside the columns the admin changed');

-- ── a no-op write appends nothing ─────────────────────────────────────────────────────────────
update shared.people set full_name = 'History Person Renamed',
                         email = 'history-person@example.test'
 where id = '00000000-0000-0000-0000-000000009975';

select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-000000009975'),
  3, 'an UPDATE that changes no column appends no row');

-- ── DA-1: the composite keys — record_key is the registered PK columns, ':'-joined ────────────
-- Both settings tables are deliberately RPC-only (no SELECT grant, no SELECT policy): their
-- history rows here are written as a service session, the same posture the registry proof of
-- mos_28 uses for migration-seeded rows.
reset role;
set local request.jwt.claims = '';

insert into shared.role_authority (org_id, action, role, scope)
values ('00000000-0000-0000-0000-0000000000a1', 'signal.tag', 'member', 'none');

select is((select record_key from shared.record_history
           where schema_name = 'shared' and table_name = 'role_authority'),
  '00000000-0000-0000-0000-0000000000a1:signal.tag:member',
  'DA-1: the role_authority record_key is (org_id, action, role) colon-joined in PK order');

update shared.role_authority set scope = 'org'
 where org_id = '00000000-0000-0000-0000-0000000000a1' and action = 'signal.tag' and role = 'member';

select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'role_authority'
             and record_key = '00000000-0000-0000-0000-0000000000a1:signal.tag:member'),
  2, 'the scope revision is recorded under the composite key (insert + 1)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-0000000000a1:signal.tag:member'
             and field_name = 'scope'),
  'none', 'the scope revision records the old scope');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-0000000000a1:signal.tag:member'
             and field_name = 'scope'),
  'org', 'the scope revision records the new scope');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-0000000000a1:signal.tag:member'
             and action = 'update'),
  null, 'the service-written scope revision carries no actor (FR-005)');

insert into shared.team_lead_assignments (org_id, team_id, lead_person_id)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000009971',
        '00000000-0000-0000-0000-0000000000d4');

select is((select record_key from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and action = 'insert'),
  '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971',
  'DA-1: the team_lead_assignments record_key is (org_id, team_id) colon-joined in PK order');

update shared.team_lead_assignments set lead_person_id = '00000000-0000-0000-0000-0000000000d7'
 where org_id = '00000000-0000-0000-0000-0000000000a1'
   and team_id = '00000000-0000-0000-0000-000000009971';

select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'),
  2, 'the lead change is recorded under the composite key (insert + 1)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'
             and field_name = 'lead_person_id'),
  '00000000-0000-0000-0000-0000000000d4', 'the lead change records the outgoing lead');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'
             and field_name = 'lead_person_id'),
  '00000000-0000-0000-0000-0000000000d7', 'the lead change records the incoming lead');

-- The people arm carries BOTH halves of people's read predicate: org-wide, or self — the self
-- half is what still resolves while the password-rotation gate holds current_org_id() at NULL.
-- No live rotation gate is simulated here (the directory fixture has no linked login for this
-- person); the arm's self half is proven directly through the predicate function.
-- No org_id in the claim: current_org_id() resolves NULL (the rotation-gate posture), the org
-- half is dead, and the self half is the only thing that can admit the read — proven through the
-- table's own RLS as the authenticated person, not by calling the predicate as the test owner.
set local role authenticated;
set local request.jwt.claims = '{"person_id":"00000000-0000-0000-0000-000000009975","access_roles":["member"]}';
select ok((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-000000009975') >= 1,
  'a person reads their own row''s history through RLS on the self half alone');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-0000000000d1'),
  0, '...and not another person''s history — the self half stops at the own row');

-- ── the composite history is read-gated: same org AND the admin tier ──────────────────────────
-- The settings RPCs these tables expose are admin-only SECURITY DEFINER reads; their history
-- reads through exactly that authority. The org wall rides the record_key's own first component.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'role_authority'
             and record_key = '00000000-0000-0000-0000-0000000000a1:signal.tag:member'),
  2, 'DA-1: the org-A admin reads the role_authority history through its composite-key arm');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'),
  2, 'DA-1: the org-A admin reads the team_lead_assignments history through its composite-key arm');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'role_authority'),
  0, 'a same-org plain member — below the settings RPCs'' admin tier — reads none of the authority matrix''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'),
  0, 'the same admin wall holds for the team-lead designation''s history');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'role_authority'),
  0, 'DA-1: org B''s admin reads none of org A''s authority-matrix history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'),
  0, 'DA-1: org B''s admin reads none of org A''s team-lead history');

-- ── the real write path stamps the claim: the admin settings RPC ──────────────────────────────
-- save_role_authority is how the matrix is actually edited. The definer RPC preserves the
-- caller's claim, so its insert row carries the administering admin as actor.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"signal.post","role":"member","scope":"none"}]'::jsonb);

select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'role_authority'
             and record_key = '00000000-0000-0000-0000-0000000000a1:signal.post:member'),
  1, 'the admin settings RPC''s write lands under its composite key');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-0000000000a1:signal.post:member'),
  '00000000-0000-0000-0000-0000000000d3', 'the RPC write stamps the calling admin''s claim as actor');

-- ── the batch's one hard-DELETE: a Jabatan removal stays readable through the snapshot ─────────
-- person_roles holds the schema's only authenticated DELETE grant (person_roles_delete_admin:
-- org-scoped admin). Deleting it leaves exactly one readable row — action='delete', whole-row
-- snapshot — and the org-wide person_roles_select_org predicate (no role gate) decides who reads
-- it: any same-org member, never another org.
insert into shared.person_roles (id, org_id, person_id, role_id)
values ('00000000-0000-0000-0000-000000009978', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009975', '00000000-0000-0000-0000-0000000000f5');

select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'person_roles'
             and record_key = '00000000-0000-0000-0000-000000009978'),
  1, 'the admin''s Jabatan assignment appends exactly one insert row');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  '00000000-0000-0000-0000-0000000000d3', 'the assignment stamps the assigning admin as actor');

delete from shared.person_roles where id = '00000000-0000-0000-0000-000000009978';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  1, 'after the DELETE the admin reads exactly one history row (the gone insert row is live-looked-up away)');
select is((select action from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  'delete', 'the surviving row is an action=''delete'' row');
select is((select old_row_snapshot ->> 'role_id' from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  '00000000-0000-0000-0000-0000000000f5', 'the delete row''s snapshot carries the pre-delete role_id');
select is((select field_name from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  null, 'the delete row carries no field name');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  null, 'the delete row carries no old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  null, 'the delete row carries no new value');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  1, 'a same-org plain member still reads the removed assignment''s delete row (org-wide snapshot arm)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009978'),
  0, 'org B''s admin reads none of the removed assignment''s history');

-- ── the org wall on the plain-org directory reads ─────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-0000000000d4'),
  1, 'the org-A admin reads a seeded org-A person''s history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-0000000000d4'),
  0, 'org B''s admin reads none of org A''s people history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'people'
             and record_key = '00000000-0000-0000-0000-0000000000b4'),
  1, 'org B''s admin reads their own org''s person history');

-- The team-lead DESIGNATION goes through its admin RPC, not a bare table write: clearing it
-- hard-deletes the row, and the RPC caller's claim is the delete actor.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_team_lead_assignment('00000000-0000-0000-0000-000000009971',
                                        '00000000-0000-0000-0000-0000000000d4');
select ok((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971') >= 3,
  'the RPC designation write is recorded on the composite key beside the earlier bare writes');
select shared.save_team_lead_assignment('00000000-0000-0000-0000-000000009971', null);
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'
             and action = 'delete'),
  1, 'clearing the designation through the RPC appends exactly one delete row');
select is((select actor_person_id::text from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'
             and action = 'delete'),
  '00000000-0000-0000-0000-0000000000d3', 'the clear stamps the clearing admin''s claim as the delete actor');
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'
             and action = 'delete'),
  1, 'the admin still reads the cleared designation''s delete row through the snapshot arm');

-- The delete arm keeps the admin tier: the row is gone, so this is the only wall left on it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'
             and action = 'delete'),
  0, 'a same-org plain member reads none of the cleared designation''s delete row (admin tier on the delete arm)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'shared' and table_name = 'team_lead_assignments'
             and record_key = '00000000-0000-0000-0000-0000000000a1:00000000-0000-0000-0000-000000009971'
             and action = 'delete'),
  0, 'another org''s admin reads none of the cleared designation''s delete row');

-- Batches attach readers to the registry and never restate one another's, so an earlier
-- batch's tables must still be registered (registry rows, not a dispatch body).
select ok(
  exists (select 1 from shared.record_history_readers
           where schema_name = 'mos' and table_name = 'process_run_pending_tasks'),
  'the registry still carries the ...0011 task-cascade arms');
select ok(
  exists (select 1 from shared.record_history_readers
           where schema_name = 'mos' and table_name = 'follow_ups'),
  '...the signal-worklog arms (e.g. follow_ups)');
select ok(
  exists (select 1 from shared.record_history_readers
           where schema_name = 'mos' and table_name = 'certified_metrics'),
  '...and the money arms (e.g. certified_metrics, with its composite key)');

select * from finish();
rollback;
