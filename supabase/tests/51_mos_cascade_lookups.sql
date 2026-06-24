-- pgTAP: mos.objectives + mos.work_lines RLS + same-org guard (ADR-0014, OD-C-1, NFR-201).
-- AC-211: work_lines.type CHECK constraint.
-- AC-212: cross-org SELECT isolation (both lookup tables).
-- AC-213: INSERT denied for plain member; allowed for ops_lead and admin.
-- AC-214: same-org guard rejects a task pointing at a foreign org's work_line / objective.
-- AC-215: task round-trips with both FKs set to same-org lookup rows.
--
-- UUID key (all hex):
--   Orgs:       ...0000ca (A), ...0000cb (B)
--   BUs:        ...00ca01 (BU-A), ...00cb01 (BU-B)
--   People:     ...00ca10 (member), ...00ca11 (ops_lead), ...00ca12 (admin), ...00cb10 (B admin)
--   Objectives: ...0000b1 (Org A), ...0000b2 (Org B)
--   Work-lines: ...00010001 (A process), ...00010002 (A project), ...00010003 (B project)
--   Task:       ...00000a01
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
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
  ('00000000-0000-0000-0000-00000000cb10','00000000-0000-0000-0000-0000000000cb','B Admin');

insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-00000000ca10','member'),
  ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-00000000ca11','ops_lead'),
  ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-00000000ca12','admin'),
  ('00000000-0000-0000-0000-0000000000cb','00000000-0000-0000-0000-00000000cb10','admin');

-- Inserted as service_role (bypasses RLS; fully formed fixture rows)
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000ca','Grow Revenue A'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000cb','Grow Revenue B');

insert into mos.work_lines (id, org_id, name, type) values
  ('00000000-0000-0000-0001-000000000001','00000000-0000-0000-0000-0000000000ca','Daily IG Content','process'),
  ('00000000-0000-0000-0001-000000000002','00000000-0000-0000-0000-0000000000ca','New Menu Design','project'),
  ('00000000-0000-0000-0001-000000000003','00000000-0000-0000-0000-0000000000cb','B Work Line','project');

-- ─── AC-211: work_lines.type CHECK rejects out-of-set values ─────────────────
-- (service_role; CHECK fires regardless of RLS)
select throws_ok($$
  insert into mos.work_lines (org_id, name, type)
  values ('00000000-0000-0000-0000-0000000000ca', 'Bad Line', 'lane')
$$, '23514', null,
  'AC-211: work_lines.type rejects out-of-set value ''lane'' (CHECK constraint)');

select throws_ok($$
  insert into mos.work_lines (org_id, name, type)
  values ('00000000-0000-0000-0000-0000000000ca', 'Bad Line 2', 'sprint')
$$, '23514', null,
  'AC-211: work_lines.type rejects ''sprint'' (only project|process allowed)');

-- ─── AC-212: SELECT isolation — org-A session sees only org-A rows ───────────
set local role authenticated;
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}';

select is(
  (select count(*)::int from mos.objectives),
  1,
  'AC-212: org-A member sees only 1 org-A objective (cross-org row hidden)');

select is(
  (select count(*)::int from mos.work_lines),
  2,
  'AC-212: org-A member sees only 2 org-A work_lines (cross-org row hidden)');

select is(
  (select count(*)::int from mos.objectives
   where id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'AC-212: org-B objective is invisible to org-A member');

select is(
  (select count(*)::int from mos.work_lines
   where id = '00000000-0000-0000-0001-000000000003'),
  0,
  'AC-212: org-B work_line is invisible to org-A member');

-- ─── AC-213: INSERT denied for plain member ──────────────────────────────────
select throws_ok($$
  insert into mos.objectives (name)
  values ('Member Objective')
$$, '42501', null,
  'AC-213: plain member cannot INSERT into mos.objectives (RLS denied)');

select throws_ok($$
  insert into mos.work_lines (name, type)
  values ('Member Work Line', 'project')
$$, '42501', null,
  'AC-213: plain member cannot INSERT into mos.work_lines (RLS denied)');

-- ops_lead allowed
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca11","access_roles":["ops_lead"]}';

select lives_ok($$
  insert into mos.objectives (name)
  values ('Ops Lead Objective')
$$,
  'AC-213: ops_lead can INSERT into mos.objectives');

select lives_ok($$
  insert into mos.work_lines (name, type)
  values ('Ops Lead Work Line', 'project')
$$,
  'AC-213: ops_lead can INSERT into mos.work_lines');

-- admin allowed
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}';

select lives_ok($$
  insert into mos.objectives (name)
  values ('Admin Objective')
$$,
  'AC-213: admin can INSERT into mos.objectives');

-- ─── AC-214: same-org guard rejects task pointing at a foreign org's work_line ─
-- Admin session (org A) inserts a task with work_line_id from org B → 42501.
select throws_ok($$
  insert into mos.tasks
    (org_id, title, business_unit_id,
     responsible_person_id, accountable_person_id, created_by,
     work_line_id)
  values
    ('00000000-0000-0000-0000-0000000000ca',
     'Cross-Org WL Task', '00000000-0000-0000-0000-00000000ca01',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0001-000000000003')
$$, '42501', null,
  'AC-214: same-org guard rejects task with work_line_id from a foreign org (42501)');

-- Same guard for objective_id
select throws_ok($$
  insert into mos.tasks
    (org_id, title, business_unit_id,
     responsible_person_id, accountable_person_id, created_by,
     objective_id)
  values
    ('00000000-0000-0000-0000-0000000000ca',
     'Cross-Org Obj Task', '00000000-0000-0000-0000-00000000ca01',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-0000000000b2')
$$, '42501', null,
  'AC-214: same-org guard rejects task with objective_id from a foreign org (42501)');

-- ─── AC-215: task round-trips with both FKs set to same-org rows ─────────────
select lives_ok($$
  insert into mos.tasks
    (id, org_id, title, business_unit_id,
     responsible_person_id, accountable_person_id, created_by,
     objective_id, work_line_id)
  values
    ('00000000-0000-0000-0000-00000000a001',
     '00000000-0000-0000-0000-0000000000ca',
     'Cascade Task', '00000000-0000-0000-0000-00000000ca01',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-00000000ca12',
     '00000000-0000-0000-0000-0000000000b1',
     '00000000-0000-0000-0001-000000000001')
$$,
  'AC-215: task inserts successfully with both same-org FK ids set');

select is(
  (select objective_id from mos.tasks where id = '00000000-0000-0000-0000-00000000a001'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'AC-215: task objective_id round-trips correctly');

select is(
  (select work_line_id from mos.tasks where id = '00000000-0000-0000-0000-00000000a001'),
  '00000000-0000-0000-0001-000000000001'::uuid,
  'AC-215: task work_line_id round-trips correctly');

reset role;
select * from finish();
rollback;
