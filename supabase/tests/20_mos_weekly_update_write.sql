begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Author-only write; managers READ but never WRITE; org/person are unspoofable (FR-006/011, NFR-002/003).
select mos._test_seed_role_tree();

set local role authenticated;

-- AC-010: Author inserts own update -> succeeds; org_id is stamped to the session org (WU-A).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
insert into mos.weekly_updates (id, person_id, week_start, summary, created_by) values
  ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000d1','2026-06-08','draft week','00000000-0000-0000-0000-0000000000d1');
select is((select org_id from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'AC-010: author insert succeeds and org_id is stamped to the session org');

-- AC-011: Author inserts with person_id = another person -> rejected by WITH CHECK.
select throws_ok($$
  insert into mos.weekly_updates (person_id, week_start, summary, created_by)
  values ('00000000-0000-0000-0000-0000000000d4','2026-06-08','spoof','00000000-0000-0000-0000-0000000000d1')
$$, '42501', null, 'AC-011: cannot insert an update for another person (author-only WITH CHECK)');

-- AC-014: Author inserts with a foreign org_id -> rejected by WITH CHECK.
select throws_ok($$
  insert into mos.weekly_updates (org_id, person_id, week_start, summary, created_by)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','2026-06-08','x','00000000-0000-0000-0000-0000000000d1')
$$, '42501', null, 'AC-014: cannot insert with a foreign org_id (unspoofable org)');

-- AC-012: DirectMgr attempts to UPDATE the author's summary -> no-op (USING hides the row).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
update mos.weekly_updates set summary='manager edit' where id='00000000-0000-0000-0000-00000000c001';
select is((select summary from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  'draft week', 'AC-012: a manager cannot write the report''s update (summary unchanged)');

-- AC-012b: GrandMgr (two levels up) UPDATE -> also a no-op (managers never write).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3"}';
update mos.weekly_updates set summary='grand edit' where id='00000000-0000-0000-0000-00000000c001';
select is((select summary from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  'draft week', 'AC-012: a grand-manager cannot write the report''s update either');

-- AC-013: Peer attempts to UPDATE the author's update -> no-op (not the author). The peer also cannot
-- READ it (upward-only), so re-read as the author to prove the summary is unchanged.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
update mos.weekly_updates set summary='peer edit' where id='00000000-0000-0000-0000-00000000c001';
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select is((select summary from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  'draft week', 'AC-013: a peer cannot write the author''s update');

reset role;
select * from finish();
rollback;
