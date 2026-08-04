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
--   REWRITE  granting a capability OPENS the write     (was 73 test 22)  -> section 6, subject changed
--   CARRY    granting member workline.manage opens it  (was 73 test 23)  -> section 6
--   CARRY    everything else — the type CHECK, cross-org isolation, member denial, org stamping,
--            the no-DELETE posture, the same-org task-reference guard, the task round-trip.
--
-- WHY the five inversions. `OD-V4-1` (owner, 2026-07-27) rules that Objectives are visible to
-- everyone and writeable at LEAD level, superseding `OD-C-2`'s admin-only catalog. The policies did
-- not change and could not have: they consult shared.can('objective.manage'), so extending the write
-- cost exactly one capability-grant row. Those five assertions encoded the superseded contract and
-- were never updated, which is the entire cause of the five reds measured on the v4 line
-- (`DD-WAY-23`) — one ruling, five symptoms. Nothing here was reshaped for the three-level model;
-- the shape work is section 7.
--
-- WHY test 22 needed a new subject rather than a straight carry. It proves the policy consults the
-- CAPABILITY rather than a hardcoded role name, by granting a capability to a role that lacks it and
-- watching the write open. Its old subject was ops_lead — which now holds objective.manage by seed,
-- so the grant is a duplicate and the proof is vacuous. `finance` replaces it: it holds five
-- capabilities and neither cascade one, so it is a genuine "has roles, not this one" negative.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

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
-- 1. shared.can() resolves the cascade capabilities — the function the write policies call
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}';
select is(shared.can('objective.manage'), true,  'admin can(objective.manage) = true');
select is(shared.can('workline.manage'),  true,  'admin can(workline.manage) = true');

-- REWRITE (was 72 test 3, expected false). OD-V4-1: Objectives are writeable at lead level.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca11","access_roles":["ops_lead"]}';
select is(shared.can('objective.manage'), true,
  'ops_lead can(objective.manage) = TRUE — OD-V4-1 supersedes the admin-only catalog of OD-C-2');
select is(shared.can('workline.manage'),  true,  'ops_lead can(workline.manage) = true');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}';
select is(shared.can('objective.manage'), false, 'member can(objective.manage) = false');
select is(shared.can('workline.manage'),  false, 'member can(workline.manage) = false');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca13","access_roles":["finance"]}';
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
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}';

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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Write gates — member denied, ops_lead now admitted on BOTH catalogs, admin admitted
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

-- REWRITE (was 51 test 9 and 73 test 12, both expecting 42501).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca11","access_roles":["ops_lead"]}';
select lives_ok($$
  insert into mos.objectives (name) values ('Ops Lead Objective')
$$,
  'ops_lead CAN create an Objective — OD-V4-1 moved the write to lead level, and the policy needed no change because it consults can()');
-- REWRITE (was 58 test 6 and 73 test 13, both expecting 42501).
select lives_ok($$
  update mos.objectives set name = 'Ops Lead Rename' where id = '00000000-0000-0000-0000-0000000000b1'
$$,
  'ops_lead CAN rename an Objective — same ruling, the UPDATE path');
select lives_ok($$
  insert into mos.work_lines (name, type) values ('Ops Lead Work Line', 'project')
$$, 'ops_lead can create a Project/Process');
select lives_ok($$
  update mos.work_lines set archived_at = now() where id = '00000000-0000-0000-0001-000000000002'
$$, 'ops_lead can archive a Project/Process — archive is an UPDATE, not a delete');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.objectives (name) values ('Admin Objective')
$$, 'admin can create an Objective');

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
  'Ops Lead Rename',
  'OD-WAY-32 roll-up: a Project/Process can name its parent Objective in one hop');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. The contract proof — granting a capability OPENS the write
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This is the assertion that makes the whole indirection worth having, and it is why OD-V4-1 cost
-- one row instead of an ALTER POLICY. It fails under a role-hardcoded policy and passes under can().
--
-- REWRITE (was 73 test 22, subject ops_lead). ops_lead now holds objective.manage by seed, so
-- granting it again is a duplicate and proves nothing. finance holds five capabilities and neither
-- cascade one, so it is the honest negative subject.
reset role;
insert into shared.role_capabilities (role, capability, scope) values ('finance','objective.manage','org');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca13","access_roles":["finance"]}';
select lives_ok($$
  insert into mos.objectives (name) values ('Finance Now Can')
$$,
  'granting finance objective.manage OPENS the write it was denied above — the policy consults the capability, not a role name');

-- CARRY (was 73 test 23). member holds process.start and signal.create and no cascade capability.
reset role;
insert into shared.role_capabilities (role, capability, scope) values ('member','workline.manage','org');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}';
select lives_ok($$
  insert into mos.work_lines (name, type) values ('Member Now Can','process')
$$,
  'granting member workline.manage OPENS the work_lines write — the same property, on the other catalog');

reset role;
select * from finish();
rollback;
