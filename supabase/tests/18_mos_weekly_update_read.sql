begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- THE security crux (OD-P1-3): weekly updates are UPWARD-ONLY readable — author OR up-chain manager,
-- never peers, never downward, never cross-org. Asserted by visible-count per session.
-- Fixture tree documented in 20260612000003_mos_test_seed.sql.
select mos._test_seed_role_tree();

-- Author (...d01) files one SUBMITTED weekly update. (created_by must equal author to pass INSERT WITH CHECK.)
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
insert into mos.weekly_updates (id, person_id, week_start, summary, status, created_by) values
  ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000d1','2026-06-08','my week','submitted','00000000-0000-0000-0000-0000000000d1');

-- DualHat (...d06) also files their own update (for the union-read arms M1+M2).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6"}';
insert into mos.weekly_updates (id, person_id, week_start, summary, status, created_by) values
  ('00000000-0000-0000-0000-00000000c006','00000000-0000-0000-0000-0000000000d6','2026-06-08','dual week','submitted','00000000-0000-0000-0000-0000000000d6');

-- AC-001: author reads own.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  1, 'AC-001: author reads own weekly update');

-- AC-002: direct manager (Lead R holder) reads the report's update.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  1, 'AC-002: direct manager reads the report''s update (one level up)');

-- AC-003: grand-manager (Exec holder, two levels up) reads the update (chain is transitive).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3"}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  1, 'AC-003: grand-manager (two levels up) reads the update');

-- AC-004: PEER (holds the same Staff R role, not in the author's chain) is DENIED.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  0, 'AC-004: peer (same level, not in chain) reads ZERO rows (upward-only)');

-- AC-005: DOWNWARD — the author's own report (SubR holder under Staff R) is DENIED.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5"}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  0, 'AC-005: downward viewer (author''s own report) reads ZERO rows');

-- AC-007: cross-org — a WU-B member (manager-shaped in their own org) is DENIED.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4"}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  0, 'AC-007: cross-org member reads ZERO rows (org isolation precedes the chain)');

-- AC-006: dual-hat union — DualHat's single update is readable by BOTH M1 (DirectMgr via Staff R)
-- and M2 (Lead2Holder via Staff 2).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c006'),
  1, 'AC-006: M1 (DirectMgr via Staff R) reads dual-hat''s update');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7"}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c006'),
  1, 'AC-006: M2 (Lead2Holder via Staff 2) ALSO reads dual-hat''s update (union chain, OD-P1-7)');

-- AC-004b: that same M2 (Lead2Holder) is NOT a manager of the plain Author -> denied (negative control).
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  0, 'AC-004: a non-chain lead (Lead2Holder) cannot read the plain author''s update');

-- AC-SEC-001: _test_seed_role_tree is SECURITY DEFINER — assert it is locked to postgres/service_role
-- only and is NOT callable by authenticated or anon (revoked in 20260612000003_mos_test_seed.sql).
-- Before fix: has_function_privilege('authenticated','mos._test_seed_role_tree()','EXECUTE') was TRUE
-- (postgres grants EXECUTE to PUBLIC by default, and authenticated inherits from public).
-- After fix: FALSE for both authenticated and anon.
select ok(
  not has_function_privilege('authenticated', 'mos._test_seed_role_tree()', 'EXECUTE'),
  'AC-SEC-001: authenticated role CANNOT execute mos._test_seed_role_tree() (PostgREST lockdown)'
);
select ok(
  not has_function_privilege('anon', 'mos._test_seed_role_tree()', 'EXECUTE'),
  'AC-SEC-001: anon role CANNOT execute mos._test_seed_role_tree() (PostgREST lockdown)'
);

reset role;
select * from finish();
rollback;
