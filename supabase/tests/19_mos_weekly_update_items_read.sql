begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- Update lines inherit the parent's upward-only read posture (FR-024, AC-008).
select mos._test_seed_role_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
insert into mos.weekly_updates (id, person_id, week_start, summary, status, created_by) values
  ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000d1','2026-06-08','my week','draft','00000000-0000-0000-0000-0000000000d1');
insert into mos.weekly_update_items (id, weekly_update_id, label, progress, position) values
  ('00000000-0000-0000-0000-0000000e0001','00000000-0000-0000-0000-00000000c001','shipped a thing','done',0);

-- AC-008a: a permitted reader (DirectMgr) sees the line.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select is((select count(*)::int from mos.weekly_update_items where id='00000000-0000-0000-0000-0000000e0001'),
  1, 'AC-008: permitted reader (manager) sees the update line');

-- AC-008b: a peer sees zero lines.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
select is((select count(*)::int from mos.weekly_update_items where id='00000000-0000-0000-0000-0000000e0001'),
  0, 'AC-008: peer sees ZERO lines (inherits parent upward-only)');

-- AC-008c: a downward viewer (Report) sees zero lines.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5"}';
select is((select count(*)::int from mos.weekly_update_items where id='00000000-0000-0000-0000-0000000e0001'),
  0, 'AC-008: downward viewer sees ZERO lines');

reset role;
select * from finish();
rollback;
