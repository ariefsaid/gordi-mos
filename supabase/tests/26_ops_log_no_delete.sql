begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- FR-023, NFR-002/004: hard delete is structurally impossible for the app tier (no DELETE grant);
-- removal is soft-archive only. And an editor cannot move a row cross-org (UPDATE WITH CHECK).
-- Fixture tree documented in 20260612000003_mos_test_seed.sql.
select mos._test_seed_role_tree();

insert into ops.log_entries (id, org_id, business_unit_id, title, created_by) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2','keep me','00000000-0000-0000-0000-0000000000d1');

set local role authenticated;

-- AC-030: Author DELETE -> denied (no DELETE grant -> 42501 insufficient_privilege).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select throws_ok($$
  delete from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'
$$, '42501', null, 'AC-030: hard delete denied (soft-archive only)');

-- AC-031: DirectMgr (an editor: USING passes) attempts to move the row to a foreign org. The row is
-- visible-for-update, so WITH CHECK fires on the new org_id and rejects (42501) — an editor cannot move
-- a row cross-org. (Contrast a peer, who is hidden by USING and would silently no-op.)
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select throws_ok($$
  update ops.log_entries set org_id='00000000-0000-0000-0000-0000000000b1'
    where id='00000000-0000-0000-0000-00000000e001'
$$, '42501', null, 'AC-031: editor cannot move a row cross-org (WITH CHECK rejects)');

reset role;
select * from finish();
rollback;
