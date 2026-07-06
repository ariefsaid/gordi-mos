-- pgTAP: cascade read+write RLS under shared.can() (Work spine v1).
-- AC-310 read (member reads active+archived org rows; zero foreign).
-- AC-311 objectives write: member/ops_lead DENIED; admin ALLOWED; AND granting ops_lead the
--      objective.manage capability via the seed OPENS the write (proves the policy consults can()).
-- AC-312 work_lines write: member DENIED; ops_lead/admin ALLOWED; AND granting member the
--      workline.manage capability OPENS the write.
-- AC-313 RLS is the authority: a no-capability session is denied via direct SQL (UI bypassed).
-- AC-314 no DELETE on either table (any session).
-- AC-315 tenancy: org-A cannot reach org-B by read or write; client org_id ignored.
--
-- UUID key: orgs ...0000fa (A) / ...0000fb (B) · BUs ...00fa01 / ...00fb01
--   people member ...00fa10 / ops_lead ...00fa11 / admin ...00fa12 · B-admin ...00fb10
--   objective-A ...0000f1 / objective-B ...0000f2 · work_line-A ...000f0001 / work_line-B ...000f0002
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000fa','WS Org A','ws-a'),
  ('00000000-0000-0000-0000-0000000000fb','WS Org B','ws-b');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-0000000000fa','BU A'),
  ('00000000-0000-0000-0000-00000000fb01','00000000-0000-0000-0000-0000000000fb','BU B');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000fa10','00000000-0000-0000-0000-0000000000fa','WS Member'),
  ('00000000-0000-0000-0000-00000000fa11','00000000-0000-0000-0000-0000000000fa','WS OpsLead'),
  ('00000000-0000-0000-0000-00000000fa12','00000000-0000-0000-0000-0000000000fa','WS Admin'),
  ('00000000-0000-0000-0000-00000000fb10','00000000-0000-0000-0000-0000000000fb','WS B Admin');
insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-00000000fa10','member'),
  ('00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-00000000fa11','ops_lead'),
  ('00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-00000000fa12','admin'),
  ('00000000-0000-0000-0000-0000000000fb','00000000-0000-0000-0000-00000000fb10','admin');
-- service_role fixtures (RLS-bypass): active + archived rows in both orgs
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000fa','WS Objective A'),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000fb','WS Objective B');
update mos.objectives set archived_at = now() where id = '00000000-0000-0000-0000-0000000000f1'; -- archived org-A row
insert into mos.work_lines (id, org_id, name, type) values
  ('00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-0000000000fa','WS WL A','project'),
  ('00000000-0000-0000-0000-0000000f0002','00000000-0000-0000-0000-0000000000fb','WS WL B','process');

-- ─── AC-310: org-A member reads active + archived org-A rows; zero org-B ─────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select is((select count(*)::int from mos.objectives), 1,
  'AC-310: org-A member sees the 1 org-A objective (active+archived) — archived visible');
select is((select count(*)::int from mos.objectives where archived_at is not null), 1,
  'AC-310: archived org-A objective IS visible to a member (manage surface relies on it)');
select is((select count(*)::int from mos.work_lines where id = '00000000-0000-0000-0000-0000000f0002'), 0,
  'AC-310: org-B work_line invisible to org-A member');

-- ─── AC-311: objectives write via can('objective.manage') ───────────────────────
select throws_ok($$
  insert into mos.objectives (name) values ('Member Obj')
$$, '42501', null, 'AC-311: member INSERT objective DENIED (can false)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa11","access_roles":["ops_lead"]}';
select throws_ok($$
  insert into mos.objectives (name) values ('OpsLead Obj')
$$, '42501', null, 'AC-311: ops_lead INSERT objective DENIED (OD-C-2 holds via can())');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa12","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.objectives (name) values ('Admin Obj')
$$, 'AC-311: admin INSERT objective SUCCEEDS (can true)');

-- ─── AC-312: work_lines write via can('workline.manage') ────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select throws_ok($$
  insert into mos.work_lines (name, type) values ('Member WL','project')
$$, '42501', null, 'AC-312: member INSERT work_line DENIED (can false)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa11","access_roles":["ops_lead"]}';
select lives_ok($$
  insert into mos.work_lines (name, type) values ('OpsLead WL','project')
$$, 'AC-312: ops_lead INSERT work_line SUCCEEDS (can true)');

-- ─── AC-313: RLS is the authority (UI bypassed — direct SQL by a no-cap session) ─
-- member runs a direct UPDATE on a row it CAN see (USING passes) but WITH CHECK denies.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select throws_ok($$
  update mos.objectives set name = 'Hacked' where org_id = '00000000-0000-0000-0000-0000000000fa'
$$, '42501', null, 'AC-313: member direct UPDATE objective DENIED at DB (UI gate not the source of truth)');

-- ─── AC-314: no DELETE on either table (admin included — no grant) ──────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa12","access_roles":["admin"]}';
select throws_ok($$
  delete from mos.objectives where org_id = '00000000-0000-0000-0000-0000000000fa'
$$, '42501', null, 'AC-314: DELETE objectives DENIED even for admin (no grant)');
select throws_ok($$
  delete from mos.work_lines where org_id = '00000000-0000-0000-0000-0000000000fa'
$$, '42501', null, 'AC-314: DELETE work_lines DENIED even for admin (no grant)');

-- ─── AC-315: tenancy — client-supplied org_id is ignored; cross-org write denied ─
-- member tries to INSERT an objective stamping a foreign org_id; DB re-stamps via default
-- + WITH CHECK (org_id = current_org_id()) denies the spoofed row.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select throws_ok($$
  insert into mos.objectives (org_id, name) values ('00000000-0000-0000-0000-0000000000fb','Spoofed Org')
$$, '42501', null, 'AC-315: client-supplied foreign org_id rejected (org_id stamped server-side)');

-- ─── THE CONTRACT PROOF (ADR-0020): granting a capability OPENS the write ───────
-- As service_role, grant ops_lead the objective.manage capability. Then ops_lead — which was
-- DENIED above — must now SUCCEED. This fails under role-hardcoded policies, passes under can().
reset role;
insert into shared.role_capabilities (role, capability, scope) values ('ops_lead','objective.manage','org');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa11","access_roles":["ops_lead"]}';
select lives_ok($$
  insert into mos.objectives (name) values ('OpsLead Now Can')
$$, 'AC-311/FR-331: granting ops_lead objective.manage OPENS the write (policy consults can(), not a role name)');
-- symmetric: grant member workline.manage -> member now writes work_lines
reset role;
insert into shared.role_capabilities (role, capability, scope) values ('member','workline.manage','org');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select lives_ok($$
  insert into mos.work_lines (name, type) values ('Member Now Can','process')
$$, 'AC-312/FR-331: granting member workline.manage OPENS the write (policy consults can())');
reset role;
select * from finish();
rollback;
