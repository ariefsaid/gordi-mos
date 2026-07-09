-- pgTAP: cascade read+write RLS under shared.can() (Work spine v1).
-- AC-310 read (member reads active+archived org rows in BOTH tables; zero foreign in BOTH).
-- AC-311 objectives write: member/ops_lead DENIED on INSERT + UPDATE; admin ALLOWED on both; AND
--      granting ops_lead the objective.manage capability via the seed OPENS the write (proves the
--      policy consults can(), not a role name).
-- AC-312 work_lines write: member DENIED on INSERT + UPDATE; ops_lead AND admin ALLOWED on both
--      (admin proven explicitly); AND granting member the workline.manage capability OPENS the write.
-- AC-313 RLS is the authority: a no-capability session is denied via direct SQL (UI bypassed).
-- AC-314 no DELETE on either table (any session).
-- AC-315 tenancy: org-A cannot reach org-B by read OR write, for EITHER table; client org_id ignored.
--
-- UUID key: orgs ...0000fa (A) / ...0000fb (B) · BUs ...00fa01 / ...00fb01
--   people member ...00fa10 / ops_lead ...00fa11 / admin ...00fa12 · B-admin ...00fb10
--   objectives: A-active ...0000f1 · A-archived ...0000f3 · B ...0000f2
--   work_lines: A ...000f0001 · B ...000f0002
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

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
-- service_role fixtures (RLS-bypass): active + archived rows in both orgs (objectives), both orgs (work_lines)
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000fa','WS Objective A active'),
  ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000fa','WS Objective A archived'),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000fb','WS Objective B');
update mos.objectives set archived_at = now() where id = '00000000-0000-0000-0000-0000000000f3'; -- archived org-A row
insert into mos.work_lines (id, org_id, name, type) values
  ('00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-0000000000fa','WS WL A','project'),
  ('00000000-0000-0000-0000-0000000f0002','00000000-0000-0000-0000-0000000000fb','WS WL B','process');

-- ─── AC-310: org-A member reads active + archived org-A rows in BOTH tables; zero org-B ─────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select is((select count(*)::int from mos.objectives), 2,
  'AC-310: member sees both org-A objectives (active + archived)');
select is((select count(*)::int from mos.objectives where archived_at is not null), 1,
  'AC-310: archived org-A objective IS visible to a member (manage surface relies on it)');
select is((select count(*)::int from mos.objectives where id = '00000000-0000-0000-0000-0000000000f2'), 0,
  'AC-310: org-B objective invisible to org-A member (read cross-org objectives)');
select is((select count(*)::int from mos.work_lines), 1,
  'AC-310: member sees the org-A work_line');
select is((select count(*)::int from mos.work_lines where id = '00000000-0000-0000-0000-0000000f0002'), 0,
  'AC-310: org-B work_line invisible to org-A member (read cross-org work_lines)');

-- ─── AC-311/AC-312/AC-313/AC-315: member session — every write DENIED, incl. cross-org spoof ─────
select throws_ok($$
  insert into mos.objectives (name) values ('Member Obj')
$$, '42501', null, 'AC-311: member INSERT objective DENIED (can false)');
select throws_ok($$
  update mos.objectives set name = 'Member Hack' where id = '00000000-0000-0000-0000-0000000000f1'
$$, '42501', null, 'AC-311/AC-313: member direct UPDATE objective DENIED at DB (UI gate not the source of truth)');
select throws_ok($$
  insert into mos.work_lines (name, type) values ('Member WL','project')
$$, '42501', null, 'AC-312: member INSERT work_line DENIED (can false)');
select throws_ok($$
  update mos.work_lines set name = 'Member Hack' where id = '00000000-0000-0000-0000-0000000f0001'
$$, '42501', null, 'AC-312: member direct UPDATE work_line DENIED at DB');
select throws_ok($$
  insert into mos.objectives (org_id, name) values ('00000000-0000-0000-0000-0000000000fb','Spoofed Org')
$$, '42501', null, 'AC-315: client-supplied foreign org_id rejected on objectives (org_id stamped server-side)');
select throws_ok($$
  insert into mos.work_lines (org_id, name, type) values ('00000000-0000-0000-0000-0000000000fb','Spoofed WL','project')
$$, '42501', null, 'AC-315: client-supplied foreign org_id rejected on work_lines (org_id stamped server-side)');

-- ─── AC-311/AC-312: ops_lead session — objectives DENIED (OD-C-2), work_lines ALLOWED ───────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa11","access_roles":["ops_lead"]}';
select throws_ok($$
  insert into mos.objectives (name) values ('OpsLead Obj')
$$, '42501', null, 'AC-311: ops_lead INSERT objective DENIED (OD-C-2 holds via can())');
select throws_ok($$
  update mos.objectives set name = 'OpsLead Hack' where id = '00000000-0000-0000-0000-0000000000f1'
$$, '42501', null, 'AC-311: ops_lead UPDATE objective DENIED (OD-C-2 holds via can())');
select lives_ok($$
  insert into mos.work_lines (name, type) values ('OpsLead WL','project')
$$, 'AC-312: ops_lead INSERT work_line SUCCEEDS (can true)');
select lives_ok($$
  update mos.work_lines set name = 'OpsLead Rename' where id = '00000000-0000-0000-0000-0000000f0001'
$$, 'AC-312: ops_lead UPDATE work_line SUCCEEDS (can true)');

-- ─── AC-311/AC-312/AC-314: admin session — both tables INSERT+UPDATE ALLOWED; DELETE denied ─────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa12","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.objectives (name) values ('Admin Obj')
$$, 'AC-311: admin INSERT objective SUCCEEDS (can true)');
select lives_ok($$
  update mos.objectives set name = 'Admin Rename' where id = '00000000-0000-0000-0000-0000000000f1'
$$, 'AC-311: admin UPDATE objective SUCCEEDS (can true)');
select lives_ok($$
  insert into mos.work_lines (name, type) values ('Admin WL','process')
$$, 'AC-312: admin INSERT work_line SUCCEEDS (can true)');
select lives_ok($$
  update mos.work_lines set name = 'Admin Rename' where id = '00000000-0000-0000-0000-0000000f0001'
$$, 'AC-312: admin UPDATE work_line SUCCEEDS (can true)');
select throws_ok($$
  delete from mos.objectives where org_id = '00000000-0000-0000-0000-0000000000fa'
$$, '42501', null, 'AC-314: DELETE objectives DENIED even for admin (no grant)');
select throws_ok($$
  delete from mos.work_lines where org_id = '00000000-0000-0000-0000-0000000000fa'
$$, '42501', null, 'AC-314: DELETE work_lines DENIED even for admin (no grant)');

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
