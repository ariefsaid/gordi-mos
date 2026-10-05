-- mos, squashed baseline — the three-level cascade: Objective -> Project/Process -> Task.
--
-- This file carries the assertion set the pgTAP triage (#180) dispositioned, and authors the
-- contract for the one payload change in #182. The disposition, applied line by line:
--
--   REWRITE  ops_lead CAN insert an Objective          (was 51 test 9)   -> "ops_lead INSERT"
--   REWRITE  ops_lead CAN update an Objective          (was 58 test 6)   -> "ops_lead UPDATE"
--   REWRITE  ops_lead can(objective.manage) = TRUE     (was 72 test 3)   -> section 1
--   REWRITE  ops_lead INSERT objective allowed         (was 73 test 12)  -> "ops_lead INSERT"
--   REWRITE  ops_lead UPDATE objective allowed         (was 73 test 13)  -> "ops_lead UPDATE"
--   REWRITE  tenant authority OPENS the write           (was 73 test 22)  -> section 6
--   REWRITE  tenant member authority opens it           (was 73 test 23)  -> section 6
--   CARRY    everything else — the type CHECK, cross-org isolation, member denial, org stamping,
--            the no-DELETE posture, the same-org task-reference guard, the task round-trip.
--
-- WHY the five inversions. `OD-V4-1` rules that Objectives are visible to everyone and writeable
-- at LEAD level, superseding `OD-C-2`'s admin-only catalog; `OD-OBJ-1` narrows it again —
-- structural authority is admin-only. The current MOS policies consume the tenant-local
-- role_authority matrix, so the write proof in section 6 uses the admin settings RPC rather than
-- the legacy global shared.role_capabilities vocabulary. Those five assertions encoded the
-- superseded contract and
-- were never updated, which is the entire cause of the five reds measured on the v4 line
-- (`DD-WAY-23`) — one ruling, five symptoms. Nothing here was reshaped for the three-level model;
-- the shape work is section 7.
--
-- WHY test 22 needed a new subject rather than a straight carry. It proves the policy consults the
-- effective tenant authority rather than a hardcoded access-role name, by using the admin settings
-- RPC to grant a role that lacks the action and watching the write open. `finance` is the genuine
-- negative subject; the member proof covers the derived baseline category separately.
begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

-- ── Fixtures ─────────────────────────────────────────────────────────────────────────────────
-- Orgs  A ...00ca / B ...00cb · BUs ...ca01 / ...cb01
-- People member ...ca10 · ops_lead ...ca11 · admin ...ca12 · finance ...ca13 · B admin ...cb10
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000ca','Cascade Org A','cascade-a'),
  ('00000000-0000-0000-0000-0000000000cb','Cascade Org B','cascade-b');

insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000ca01','00000000-0000-0000-0000-0000000000ca','BU A'),
  ('00000000-0000-0000-0000-00000000cb01','00000000-0000-0000-0000-0000000000cb','BU B');

insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000ca10','00000000-0000-0000-0000-0000000000ca','A Member'),
  ('00000000-0000-0000-0000-00000000ca11','00000000-0000-0000-0000-0000000000ca','A Ops Lead'),
  ('00000000-0000-0000-0000-00000000ca12','00000000-0000-0000-0000-0000000000ca','A Admin'),
  ('00000000-0000-0000-0000-00000000ca13','00000000-0000-0000-0000-0000000000ca','A Finance'),
  ('00000000-0000-0000-0000-00000000cb10','00000000-0000-0000-0000-0000000000cb','B Admin');

insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-00000000ca10','member'),
  ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-00000000ca11','ops_lead'),
  ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-00000000ca12','admin'),
  ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-00000000ca13','finance'),
  ('00000000-0000-0000-0000-0000000000cb','00000000-0000-0000-0000-00000000cb10','admin');

-- Service-role fixtures (RLS bypassed): an active and an archived Objective in org A, one in org B.
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000ca','Grow Revenue A'),
  ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000ca','Retired Objective A'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000cb','Grow Revenue B');
update mos.objectives set archived_at = now() where id = '00000000-0000-0000-0000-0000000000b3';

insert into mos.work_lines (id, org_id, name, type) values
  ('00000000-0000-0000-0001-000000000001','00000000-0000-0000-0000-0000000000ca','Daily IG Content','process'),
  ('00000000-0000-0000-0001-000000000002','00000000-0000-0000-0000-0000000000ca','New Menu Design','project'),
  ('00000000-0000-0000-0001-000000000003','00000000-0000-0000-0000-0000000000cb','B Work Line','project');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The legacy shared.can() capability helper remains distinct from the tenant-local MOS matrix.
-- The values are retained here because unrelated shared capability consumers still rely on them;
-- the catalog write policies are exercised against role_authority below.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}');
select is(shared.can('objective.manage'), true,  'admin can(objective.manage) = true');
select is(shared.can('workline.manage'),  true,  'admin can(workline.manage) = true');

-- REWRITE TWICE, each time at the behavior level. This line encoded OD-C-2's admin-only catalog,
-- OD-V4-1 flipped it to TRUE, and OD-OBJ-1 narrows it back: ops_lead loses objective.manage and
-- gains the narrower objective.edit_content. The grant rows are migration-owned, so each flip is
-- one row either way — the assertion follows the ruling.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca11","access_roles":["ops_lead"]}');
select is(shared.can('objective.manage'), false,
  'ops_lead can(objective.manage) = FALSE — OD-OBJ-1 narrows the OD-V4-1 grant (#992)');
select is(shared.can('objective.edit_content'), true,
  'ops_lead can(objective.edit_content) = TRUE — the narrowed content grant (#992)');
select is(shared.can('workline.manage'),  true,  'ops_lead can(workline.manage) = true');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}');
select is(shared.can('objective.manage'), false, 'member can(objective.manage) = false');
select is(shared.can('workline.manage'),  false, 'member can(workline.manage) = false');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca13","access_roles":["finance"]}');
select is(shared.can('objective.manage'), false, 'finance can(objective.manage) = false');
select is(shared.can('workline.manage'),  false, 'finance can(workline.manage) = false');

-- Fail closed: no access_roles claim means no capability, not an error.
set local request.jwt.claims = '{}';
select is(shared.can('objective.manage'), false, 'no access_roles claim -> can() is false, and does not raise');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Catalog shape and cross-org isolation (CARRY)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
reset role;
select throws_ok($$
  insert into mos.work_lines (org_id, name, type)
  values ('00000000-0000-0000-0000-0000000000ca', 'Bad Line', 'lane')
$$, '23514', null,
  'work_lines.type rejects ''lane'' — the Project/Process pair is the whole vocabulary');
select throws_ok($$
  insert into mos.work_lines (org_id, name, type)
  values ('00000000-0000-0000-0000-0000000000ca', 'Bad Line 2', 'sprint')
$$, '23514', null,
  'work_lines.type rejects ''sprint'' — only project|process');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}');

select is((select count(*)::int from mos.objectives), 2,
  'a member reads BOTH org-A objectives, active and archived — the management surface lists archived rows');
select is((select count(*)::int from mos.objectives where archived_at is not null), 1,
  'the archived org-A objective is visible, so archiving hides it in the UI and not in the data');
select is((select count(*)::int from mos.objectives where id = '00000000-0000-0000-0000-0000000000b2'), 0,
  'the org-B objective is invisible to an org-A member');
select is((select count(*)::int from mos.work_lines), 2,
  'a member reads only the two org-A work_lines');
select is((select count(*)::int from mos.work_lines where id = '00000000-0000-0000-0001-000000000003'), 0,
  'the org-B work_line is invisible to an org-A member');

-- The ⌘K palette's search predicate (active rows, name ilike) — RLS is its only read authority,
-- so these pin what a session finds: its own org's active rows, never another org's or an archived one.
select is((select array_agg(name order by name) from mos.objectives
            where name ilike '%revenue%' and archived_at is null), array['Grow Revenue A'],
  'palette Objective search: an org-A member finds the org-A objective and not "Grow Revenue B"');
select is((select count(*)::int from mos.objectives
            where name ilike '%retired%' and archived_at is null), 0,
  'palette Objective search: an archived objective is not offered');
select is((select array_agg(name order by name) from mos.work_lines
            where name ilike '%menu%' and archived_at is null), array['New Menu Design'],
  'palette Project/Process search: an org-A member finds the org-A work line');
select is((select count(*)::int from mos.work_lines
            where name ilike '%b work%' and archived_at is null), 0,
  'palette Project/Process search: the org-B work line "B Work Line" is never found');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Write gates — member denied on both catalogs; ops_lead writes Projects & Processes and the
--    Objective write-up but NO Objective structural field (#992); admin admitted everywhere
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  insert into mos.objectives (name) values ('Member Objective')
$$, '42501', null, 'a plain member cannot create an Objective');
select throws_ok($$
  insert into mos.work_lines (name, type) values ('Member Work Line', 'project')
$$, '42501', null, 'a plain member cannot create a Project/Process');
select throws_ok($$
  update mos.objectives set name = 'Member Hack' where id = '00000000-0000-0000-0000-0000000000b1'
$$, '42501', null, 'a plain member cannot rename an Objective — the DB refuses, whatever the UI shows');
select throws_ok($$
  update mos.work_lines set name = 'Member Hack' where id = '00000000-0000-0000-0001-000000000001'
$$, '42501', null, 'a plain member cannot rename a Project/Process');
select throws_ok($$
  insert into mos.objectives (org_id, name)
  values ('00000000-0000-0000-0000-0000000000cb','Spoofed Org')
$$, '42501', null, 'a client-supplied foreign org_id is rejected on objectives');
select throws_ok($$
  insert into mos.work_lines (org_id, name, type)
  values ('00000000-0000-0000-0000-0000000000cb','Spoofed WL','project')
$$, '42501', null, 'a client-supplied foreign org_id is rejected on work_lines');

-- REWRITE at the behavior level (#992, OD-OBJ-1). Both cases below used to prove ops_lead could
-- create and rename an Objective ("OD-V4-1 moved the write to lead level"). Structural authority
-- — create, rename, archive, re-home — is admin-only now, so the same actors are refused with
-- 42501; the write-up tier is what ops leads keep, and the lives_ok below pins that retained half.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca11","access_roles":["ops_lead"]}');
select throws_ok($$
  insert into mos.objectives (name) values ('Ops Lead Objective')
$$,
  '42501', null,
  'ops_lead CANNOT create an Objective — structural authority is admin-only (#992)');
select throws_ok($$
  update mos.objectives set name = 'Ops Lead Rename' where id = '00000000-0000-0000-0000-0000000000b1'
$$,
  '42501', null,
  'ops_lead CANNOT rename an Objective — the structural/content split refuses it loudly (#992)');
select lives_ok($$
  update mos.objectives
     set write_up = '[{"type":"paragraph","content":[{"type":"text","text":"still ours"}]}]'::jsonb
   where id = '00000000-0000-0000-0000-0000000000b1'
$$,
  'ops_lead CAN still write the Objective write-up — the narrowed content grant (#992)');
select lives_ok($$
  insert into mos.work_lines (name, type) values ('Ops Lead Work Line', 'project')
$$, 'ops_lead can create a Project/Process');
select lives_ok($$
  update mos.work_lines set archived_at = now() where id = '00000000-0000-0000-0001-000000000002'
$$, 'ops_lead can archive a Project/Process — archive is an UPDATE, not a delete');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}');
select lives_ok($$
  insert into mos.objectives (name) values ('Admin Objective')
$$, 'admin can create an Objective');

-- The roll-up assertion below reads a RENAMED parent Objective through its child. Renaming is
-- structural authority now, so the admin performs it — same edge, authorized writer (#992).
select lives_ok($$
  update mos.objectives set name = 'Admin Rename' where id = '00000000-0000-0000-0000-0000000000b1'
$$, 'admin CAN rename an Objective — the structural grant the split keeps (#992)');

-- Org stamping: the client never sends org_id, and what lands is the session's org.
insert into mos.objectives (name) values ('Stamped Objective');
select is(
  (select org_id from mos.objectives where name = 'Stamped Objective'),
  '00000000-0000-0000-0000-0000000000ca'::uuid,
  'a catalog INSERT is stamped the session org server-side');

-- No hard delete on either catalog, admin included — removal is the archived_at toggle.
select throws_ok($$
  delete from mos.objectives where id = '00000000-0000-0000-0000-0000000000b1'
$$, '42501', null, 'DELETE on mos.objectives is denied even to admin — there is no grant to deny with');
select throws_ok($$
  delete from mos.work_lines where id = '00000000-0000-0000-0001-000000000001'
$$, '42501', null, 'DELETE on mos.work_lines is denied even to admin');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. The task bridge is same-org (CARRY)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  insert into mos.tasks
    (org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, work_line_id)
  values
    ('00000000-0000-0000-0000-0000000000ca','Cross-Org WL Task','00000000-0000-0000-0000-00000000ca01',
     '00000000-0000-0000-0000-00000000ca12','00000000-0000-0000-0000-00000000ca12','00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0001-000000000003')
$$, '42501', null,
  'a task cannot point at a foreign org''s Project/Process — the FK checks existence only, so the guard carries the tenancy');
select throws_ok($$
  insert into mos.tasks
    (org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, objective_id)
  values
    ('00000000-0000-0000-0000-0000000000ca','Cross-Org Obj Task','00000000-0000-0000-0000-00000000ca01',
     '00000000-0000-0000-0000-00000000ca12','00000000-0000-0000-0000-00000000ca12','00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-0000000000b2')
$$, '42501', null,
  'a task cannot point at a foreign org''s Objective either');

select lives_ok($$
  insert into mos.tasks
    (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by,
     objective_id, work_line_id)
  values
    ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-0000000000ca','Cascade Task',
     '00000000-0000-0000-0000-00000000ca01','00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-00000000ca12','00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0001-000000000001')
$$, 'a task round-trips with both same-org cascade references set');
select is(
  (select objective_id from mos.tasks where id = '00000000-0000-0000-0000-00000000a001'),
  '00000000-0000-0000-0000-0000000000b1'::uuid, 'the task''s objective_id round-trips');
select is(
  (select work_line_id from mos.tasks where id = '00000000-0000-0000-0000-00000000a001'),
  '00000000-0000-0000-0001-000000000001'::uuid, 'the task''s work_line_id round-trips');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. AC-009 — the NEW edge: mos.work_lines.objective_id (DD-WAY-15)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- "Given a Project or Process, When it is created with an Objective reference, Then that reference
-- is stored; and When created without one, Then the insert succeeds."
--
-- No assertion for this existed anywhere on either branch — the column did not exist. This is the
-- contract being authored, not repaired.
select lives_ok($$
  insert into mos.work_lines (id, name, type, objective_id)
  values ('00000000-0000-0000-0001-00000000000a','Anchored Project','project','00000000-0000-0000-0000-0000000000b1')
$$, 'AC-009: a Project/Process can be created WITH an Objective reference');
select is(
  (select objective_id from mos.work_lines where id = '00000000-0000-0000-0001-00000000000a'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'AC-009: ...and the reference is stored');

select lives_ok($$
  insert into mos.work_lines (id, name, type)
  values ('00000000-0000-0000-0001-00000000000b','Unanchored Project','project')
$$, 'AC-009: a Project/Process can be created WITHOUT an Objective — the edge is nullable, so OD-C-1''s topology rule survives');
select is(
  (select objective_id from mos.work_lines where id = '00000000-0000-0000-0001-00000000000b'),
  null, 'AC-009: ...and its objective_id is null rather than defaulted to something');

-- The edge is a tenancy seam like every other reference, and its FK cannot say so.
select throws_ok($$
  insert into mos.work_lines (name, type, objective_id)
  values ('Cross-Org Anchor','project','00000000-0000-0000-0000-0000000000b2')
$$, '42501', null,
  'DD-WAY-15: a Project/Process cannot be anchored to a FOREIGN org''s Objective — the new guard carries what the FK cannot');

-- ── The Objective is not the only reference on the table ─────────────────────────────────────
-- business_unit_id, accountable_person_id and responsible_person_id are the SAME kind of column as
-- objective_id — existence-only FKs into org-scoped tables — and mos.tasks has org-checked its
-- equivalents since the round-2 audit. Checking one of four made the rule look like a property of
-- the cascade edge; these three say it is a property of every reference the table carries.
-- accountable_person_id is the one with reach beyond this row: mos.spawn_process_run reads it back
-- as a generated Task's Accountable, so a crossed value here would be copied onto real work.
select throws_ok($$
  insert into mos.work_lines (org_id, name, type, business_unit_id)
  values ('00000000-0000-0000-0000-0000000000ca','Crossed BU Line','project','00000000-0000-0000-0000-00000000cb01')
$$, '42501', 'business_unit_id belongs to a different org',
  'a Project/Process cannot be owned by a FOREIGN org''s business unit');

select throws_ok($$
  insert into mos.work_lines (org_id, name, type, accountable_person_id)
  values ('00000000-0000-0000-0000-0000000000ca','Crossed A Line','project','00000000-0000-0000-0000-00000000cb10')
$$, '42501', 'accountable_person_id belongs to a different org',
  'a Project/Process cannot name a FOREIGN org''s person as Accountable — spawn_process_run copies this onto generated tasks');

select throws_ok($$
  insert into mos.work_lines (org_id, name, type, responsible_person_id)
  values ('00000000-0000-0000-0000-0000000000ca','Crossed R Line','project','00000000-0000-0000-0000-00000000cb10')
$$, '42501', 'responsible_person_id belongs to a different org',
  '...nor as Responsible');

-- Same-org values still land, so the guard is refusing the crossing and not the columns. Written as
-- a round-trip rather than a bare lives_ok: a guard that swallowed the values would pass the first
-- half and fail the second.
select lives_ok($$
  insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id, responsible_person_id)
  values ('00000000-0000-0000-0001-00000000000c','00000000-0000-0000-0000-0000000000ca','Fully Referenced','project',
          '00000000-0000-0000-0000-00000000ca01','00000000-0000-0000-0000-00000000ca12','00000000-0000-0000-0000-00000000ca10')
$$, 'a Project/Process with all three references same-org is accepted');
select is(
  (select accountable_person_id from mos.work_lines where id = '00000000-0000-0000-0001-00000000000c'),
  '00000000-0000-0000-0000-00000000ca12'::uuid,
  '...and the value it was given is the value stored');

-- ── The Process definition tables carry the same seam ────────────────────────────────────────
-- A cadence and a task definition both hang off a work_line_id, and the task definition adds six
-- job-function references on top. mos.spawn_process_run reads all of them to decide what a generated
-- Task says and who it is assigned to, so an unchecked reference here becomes a wrong Task later
-- rather than a wrong row now.
select throws_ok($$
  insert into mos.process_cadences (org_id, work_line_id, cadence_kind)
  values ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0001-000000000003','daily')
$$, '42501', 'work_line_id belongs to a different org',
  'a cadence cannot schedule a FOREIGN org''s Process');

select throws_ok($$
  insert into mos.process_task_defs (org_id, work_line_id, title, position)
  values ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0001-000000000003','Crossed Def',0)
$$, '42501', 'work_line_id belongs to a different org',
  'a task definition cannot belong to a FOREIGN org''s Process');

select throws_ok($$
  insert into mos.process_task_defs (org_id, work_line_id, title, position, pic_person_id)
  values ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0001-000000000001','Crossed PIC',1,
          '00000000-0000-0000-0000-00000000cb10')
$$, '42501', 'pic_person_id belongs to a different org',
  'a task definition cannot name a FOREIGN org''s person as PIC');

select throws_ok($$
  insert into mos.process_task_defs (org_id, work_line_id, title, position, supervisor_person_id)
  values ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0001-000000000001','Crossed Sup',2,
          '00000000-0000-0000-0000-00000000cb10')
$$, '42501', 'supervisor_person_id belongs to a different org',
  '...nor as supervisor — the PIC and supervisor halves are checked independently');

-- The reason the edge exists: roll-up from the middle level, and drill-down from the top. Neither
-- was expressible while an Objective''s children could only be inferred from tasks that happened to
-- carry both keys.
select is(
  (select count(*)::int from mos.work_lines
    where objective_id = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'OD-WAY-32 drill-down: an Objective can enumerate its OWN Projects/Processes directly, with no task in between');
select is(
  (select o.name from mos.objectives o
    join mos.work_lines w on w.objective_id = o.id
   where w.id = '00000000-0000-0000-0001-00000000000a'),
  'Admin Rename',
  'OD-WAY-32 roll-up: a Project/Process can name its parent Objective in one hop');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. The contract proof — an admin authority grant OPENS the write
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This is the assertion that makes the tenant-local indirection worth having. It fails under a
-- role-hardcoded policy and passes only when the catalog policy consumes the effective matrix.
--
-- REWRITE again at the behavior level (#992, OD-OBJ-1). Objectives no longer consult the matrix:
-- their write seam is the capability row (admin-only after the narrowing), so the finance matrix
-- grant OPENS NOTHING on this catalog. The work_lines case below keeps the original property for
-- Projects & Processes, which the ruling left untouched.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}');
select shared.save_role_authority('[{"action":"objective.manage","role":"finance","scope":"org"}]'::jsonb);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca13","access_roles":["finance"]}');
select throws_ok($$
  insert into mos.objectives (name) values ('Finance Now Can')
$$, '42501', null,
  'granting finance objective.manage in the tenant matrix opens NO Objective write — #992 moved the catalog seam to the capability row');

-- REWRITE (was 73 test 23). The member category is live-org membership, and the admin RPC can grant
-- it a tenant-local workline scope without changing the unrelated global capability vocabulary.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}');
select shared.save_role_authority('[{"action":"workline.manage","role":"member","scope":"org"}]'::jsonb);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}');
select lives_ok($$
  insert into mos.work_lines (name, type) values ('Member Now Can','process')
$$,
  'granting member workline.manage in the tenant matrix OPENS the work_lines write — the same property, on the other catalog');

reset role;
select * from finish();
rollback;
