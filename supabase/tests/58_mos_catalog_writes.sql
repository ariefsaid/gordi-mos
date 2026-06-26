-- pgTAP: cascade catalog management write-gates (OD-C-2, spec cascade-catalog).
-- AC-010: objectives write is admin-only (ops_lead denied).
-- AC-011: work_lines write is ops_lead OR admin (member denied).
-- AC-012: no DELETE on either lookup (soft archive only — NFR-002).
--
-- UUID key (hex): org ...0000da · people member ...00da10 / ops_lead ...00da11 / admin ...00da12
--   objective ...0000d1 · work_line ...000d0001
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ─── Fixtures (service_role, bypasses RLS) ───────────────────────────────────
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000da','Catalog Org','catalog-da');

insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000da10','00000000-0000-0000-0000-0000000000da','Cat Member'),
  ('00000000-0000-0000-0000-00000000da11','00000000-0000-0000-0000-0000000000da','Cat Ops Lead'),
  ('00000000-0000-0000-0000-00000000da12','00000000-0000-0000-0000-0000000000da','Cat Admin');

insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-00000000da10','member'),
  ('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-00000000da11','ops_lead'),
  ('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-00000000da12','admin');

insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000da','Catalog Objective');

insert into mos.work_lines (id, org_id, name, type) values
  ('00000000-0000-0000-0000-0000000d0001','00000000-0000-0000-0000-0000000000da','Catalog Work Line','project');

-- ─── AC-010: objectives write = admin only ───────────────────────────────────
-- admin: rename + archive succeed
set local role authenticated;
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000da","person_id":"00000000-0000-0000-0000-00000000da12","access_roles":["admin"]}';

select lives_ok($$
  update mos.objectives set name = 'Renamed Objective'
  where id = '00000000-0000-0000-0000-0000000000d1'
$$, 'AC-010: admin can rename (UPDATE) an objective');

select lives_ok($$
  update mos.objectives set archived_at = now()
  where id = '00000000-0000-0000-0000-0000000000d1'
$$, 'AC-010: admin can archive (UPDATE archived_at) an objective');

-- ops_lead: objective update denied
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000da","person_id":"00000000-0000-0000-0000-00000000da11","access_roles":["ops_lead"]}';

select throws_ok($$
  update mos.objectives set name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000d1'
$$, '42501', null,
  'AC-010: ops_lead UPDATE on objective denied (WITH CHECK admin-only → 42501)');

-- ─── AC-011: work_lines write = ops_lead OR admin ────────────────────────────
-- ops_lead: rename + archive succeed
select lives_ok($$
  update mos.work_lines set name = 'Renamed Work Line'
  where id = '00000000-0000-0000-0000-0000000d0001'
$$, 'AC-011: ops_lead can rename (UPDATE) a work_line');

select lives_ok($$
  update mos.work_lines set archived_at = now()
  where id = '00000000-0000-0000-0000-0000000d0001'
$$, 'AC-011: ops_lead can archive (UPDATE archived_at) a work_line');

-- member: work_line update denied (WITH CHECK / USING both fail the role test)
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000da","person_id":"00000000-0000-0000-0000-00000000da10","access_roles":["member"]}';

select throws_ok($$
  update mos.work_lines set name = 'Member Hack' where id = '00000000-0000-0000-0000-0000000d0001'
$$, '42501', null,
  'AC-011: member UPDATE on work_line denied (WITH CHECK ops_lead/admin → 42501)');

-- ─── AC-012: no DELETE on either lookup (admin included — no grant) ───────────
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000da","person_id":"00000000-0000-0000-0000-00000000da12","access_roles":["admin"]}';

select throws_ok($$
  delete from mos.objectives where id = '00000000-0000-0000-0000-0000000000d1'
$$, '42501', null,
  'AC-012: DELETE on mos.objectives denied even for admin (no grant)');

select throws_ok($$
  delete from mos.work_lines where id = '00000000-0000-0000-0000-0000000d0001'
$$, '42501', null,
  'AC-012: DELETE on mos.work_lines denied even for admin (no grant)');

reset role;
select * from finish();
rollback;
