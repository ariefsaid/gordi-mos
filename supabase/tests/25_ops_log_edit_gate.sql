begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- FR-021/022/024, NFR-003, OD-P1-7: edit AND archive are gated by the SAME author-or-manager predicate
-- (ops.can_edit_log_entry). Allow/deny asserted by EFFECT: an allowed editor's change persists; a denied
-- member's change does not (RLS USING hides the row, so the UPDATE touches 0 rows, value unchanged).
-- Fixture tree documented in 20260612000003_mos_test_seed.sql.
select mos._test_seed_role_tree();

-- E authored by Author (...0d01); ED authored by DualHat (...0d06).
insert into ops.log_entries (id, org_id, business_unit_id, title, created_by) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2','original','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000e0d6','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2','dual original','00000000-0000-0000-0000-0000000000d6');

set local role authenticated;

-- AC-020: Author edits own entry -> persists.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
update ops.log_entries set title='T-by-author' where id='00000000-0000-0000-0000-00000000e001';
select is((select title from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  'T-by-author', 'AC-020: author edits own entry');

-- AC-021: DirectMgr (Lead R, manager of Author) edits -> persists.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
update ops.log_entries set title='T-by-mgr' where id='00000000-0000-0000-0000-00000000e001';
select is((select title from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  'T-by-mgr', 'AC-021: manager-of-author edits');

-- AC-022: Peer (Staff R sibling, NOT a manager) edits -> no-op (unchanged).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
update ops.log_entries set title='T-by-peer' where id='00000000-0000-0000-0000-00000000e001';
select is((select title from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  'T-by-mgr', 'AC-022: peer cannot edit (no-op)');

-- AC-023a: Author archives then unarchives -> both persist (reversible).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
update ops.log_entries set archived_at=now() where id='00000000-0000-0000-0000-00000000e001';
update ops.log_entries set archived_at=null where id='00000000-0000-0000-0000-00000000e001';
select is((select archived_at from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  null, 'AC-023: author archives then unarchives (reversible)');

-- AC-023b: Peer archives -> no-op (still null).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
update ops.log_entries set archived_at=now() where id='00000000-0000-0000-0000-00000000e001';
select is((select archived_at from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  null, 'AC-023: peer cannot archive (no-op)');

-- AC-024: a dual-hat author (...0d06) reports to BOTH DirectMgr (via Staff R) and Lead2Holder (via Staff 2);
-- either manager may edit ED (union chain).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
update ops.log_entries set title='dual-by-M1' where id='00000000-0000-0000-0000-00000000e0d6';
select is((select title from ops.log_entries where id='00000000-0000-0000-0000-00000000e0d6'),
  'dual-by-M1', 'AC-024: either manager of a dual-hat author edits (M1 via Staff R)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7"}';
update ops.log_entries set title='dual-by-M2' where id='00000000-0000-0000-0000-00000000e0d6';
select is((select title from ops.log_entries where id='00000000-0000-0000-0000-00000000e0d6'),
  'dual-by-M2', 'AC-024: either manager of a dual-hat author edits (M2 via Staff 2)');

reset role;
select * from finish();
rollback;
