begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- FR-003/020, NFR-002: any org member may INSERT; org_id + created_by are server-stamped from the
-- session and UNSPOOFABLE (WITH CHECK rejects a foreign org_id and a forged created_by).
-- Fixture tree documented in 20260612000003_mos_test_seed.sql.
select mos._test_seed_role_tree();

set local role authenticated;
-- Claims = Peer (...0d04): a plain any-member (NOT a manager) in WU-A.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';

-- AC-010: insert with business_unit_id + title and NO org_id/created_by -> defaults stamp the session.
select lives_ok($$
  insert into ops.log_entries (id, business_unit_id, title)
  values ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000a2','honest entry')
$$, 'AC-010: any member inserts without org_id/created_by');

select is(
  (select org_id from ops.log_entries where id='00000000-0000-0000-0000-00000000f001'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'AC-010: inserted org_id stamped to the session org');
select is(
  (select created_by from ops.log_entries where id='00000000-0000-0000-0000-00000000f001'),
  '00000000-0000-0000-0000-0000000000d4'::uuid,
  'AC-010: inserted created_by stamped to the session person');

-- AC-011: explicit FOREIGN org_id (WU-B ...0b01) -> WITH CHECK rejects (42501).
select throws_ok($$
  insert into ops.log_entries (org_id, business_unit_id, title)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2','spoof org')
$$, '42501', null, 'AC-011: foreign org_id spoof blocked');

-- AC-012: explicit FORGED created_by (Author ...0d01, not the session) -> WITH CHECK rejects (42501).
select throws_ok($$
  insert into ops.log_entries (business_unit_id, title, created_by)
  values ('00000000-0000-0000-0000-0000000000a2','spoof author','00000000-0000-0000-0000-0000000000d1')
$$, '42501', null, 'AC-012: forged created_by blocked');

reset role;
select * from finish();
rollback;
