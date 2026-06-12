begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- THE security crux (OD-P1-3, FR-010/011/012): the Ops Log is ORG-READABLE — every org member reads
-- every non-archived entry — but cross-org reads return ZERO rows (org isolation precedes everything).
-- Archived rows stay org-readable; the default feed hides them by a QUERY predicate, not by RLS.
-- Fixture tree documented in 20260612000003_mos_test_seed.sql (org WU-A ...0a01, WU-B ...0b01).
select mos._test_seed_role_tree();

-- Seed (as postgres, pre-RLS): E1 non-archived in WU-A authored by Author; E2 archived in WU-A.
insert into ops.log_entries (id, org_id, business_unit_id, title, created_by) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2','E1 active','00000000-0000-0000-0000-0000000000d1');
insert into ops.log_entries (id, org_id, business_unit_id, title, created_by, archived_at) values
  ('00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2','E2 archived','00000000-0000-0000-0000-0000000000d1', now());

set local role authenticated;

-- AC-001: any org member (Peer ...0d04, a non-manager) reads the non-archived entry.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
select is((select count(*)::int from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  1, 'AC-001: any org member reads a non-archived entry');

-- AC-002: cross-org — ForeignMgr (WU-B ...0b04) reads ZERO rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4"}';
select is((select count(*)::int from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  0, 'AC-002: cross-org read blocked');

-- AC-003: archived row hidden by the default feed predicate (archived_at is null), but still org-readable.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
select is((select count(*)::int from ops.log_entries
  where id='00000000-0000-0000-0000-00000000e002' and archived_at is null),
  0, 'AC-003: archived hidden by default predicate');
select is((select count(*)::int from ops.log_entries where id='00000000-0000-0000-0000-00000000e002'),
  1, 'AC-003: archived row still org-readable with toggle');

reset role;
select * from finish();
rollback;
