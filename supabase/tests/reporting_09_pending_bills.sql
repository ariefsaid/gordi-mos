-- reporting — the pending-bill copy and its run log (#1464).
--
-- Owns AC-1103 (the snapshot writer's ingest contract), AC-1110 (Finance is the only reader) and
-- AC-1111 (no end-user write). Each refusal sits beside the matching allow, so a green here is a
-- policy that refused, not an empty table.
--
-- ORDER MATTERS: the undeclared-writer case runs before any app.reporting_org is set, because a
-- setting once set can be emptied but never made absent again (see reporting_07).
begin;
create extension if not exists pgtap with schema extensions;

-- Test-only grants, rolled back with this transaction (same reason as reporting_07).
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;

select plan(45);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();

insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','RRS','Branch One');

-- ══ Posture ══════════════════════════════════════════════════════════════════════════════════
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'reporting.pending_bills'::regclass),
  'pending_bills has row-level security enabled and forced');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'reporting.pending_bill_snapshots'::regclass),
  'pending_bill_snapshots has row-level security enabled and forced');
select col_is_pk('reporting','pending_bills', array['org_id','esb_code','branch_code','bill_no'],
  'a bill upserts on org/ESB code/branch code/bill no. — the till''s own bill identity');
select col_is_pk('reporting','pending_bill_snapshots', array['org_id','snapshot_as_of'],
  'one run-log row per org per run');

-- ══ AC-1103: the writer's ingest contract ════════════════════════════════════════════════════
set local role reporting_writer;
select throws_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','RRS','B-000','2026-09-01',1000.00,now())
$$, '42501', null, 'AC-1103: a run that declared no org writes no bill');
select throws_ok($$
  insert into reporting.pending_bill_snapshots (org_id, snapshot_as_of, bill_count, window_start, source_contract_version)
  values ('00000000-0000-0000-0000-0000000000a1', now(), 0, '2024-10-08', 'pos_pending_bills.v1')
$$, '42501', null, 'AC-1103: ...and no run-log row');
reset role;

select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000b1', true);
set local role reporting_writer;
select throws_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','RRS','B-000','2026-09-01',1000.00,now())
$$, '42501', null, 'AC-1103: a run declared for another org cannot write this org''s bill');
reset role;

select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000a1', true);
set local role reporting_writer;
select lives_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','ZZZ','B-001','2026-09-01',150000.00,now())
$$, 'AC-1103: a bill with a branch code MOS does not know ingests');
select lives_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, counterparty_note, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','RRS','B-002','2026-09-02',275000.00,'table 4',now())
$$, 'AC-1103: a bill with a known branch code ingests');
select throws_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','RRS','B-003','2026-09-02',0,now())
$$, '23514', null, 'AC-1103: a zero amount is refused');
select throws_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','RRS','B-004','2026-09-02',-5000.00,now())
$$, '23514', null, 'AC-1103: a negative amount is refused');
select throws_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, source_state, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','RRS','B-005','2026-09-02',5000.00,'settled',now())
$$, '23514', null, 'source_state outside present/void/missing is refused');
select lives_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','RRS','B-002','2026-09-02',300000.00,now())
  on conflict (org_id, esb_code, branch_code, bill_no)
  do update set amount = excluded.amount
$$, 'AC-1103: re-sending a bill upserts it');
select lives_ok($$
  update reporting.pending_bills set source_state = 'missing', source_state_at = now()
   where org_id = '00000000-0000-0000-0000-0000000000a1' and bill_no = 'B-001'
$$, 'the writer flags a bill by UPDATE');
select throws_ok($$
  delete from reporting.pending_bills where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, 'the writer cannot delete a bill — flagged, never removed');
select lives_ok($$
  insert into reporting.pending_bill_snapshots (org_id, snapshot_as_of, bill_count, window_start, source_contract_version)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-10-06 02:05:00+07', 2, '2024-10-08', 'pos_pending_bills.v1')
$$, 'the writer logs its run');
select throws_ok($$
  insert into reporting.pending_bill_snapshots (org_id, snapshot_as_of, bill_count, window_start, source_contract_version)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-10-07 02:05:00+07', -1, '2024-10-09', 'pos_pending_bills.v1')
$$, '23514', null, 'a negative bill count is refused');
reset role;

select is(
  (select branch_id from reporting.pending_bills where bill_no = 'B-001'), null,
  'AC-1103: the unknown branch code left the branch link empty');
select is(
  (select branch_id from reporting.pending_bills where bill_no = 'B-002'),
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  'AC-1103: the known branch code linked the bill to its branch in the same org');
select is(
  (select count(*)::int from reporting.pending_bills where bill_no = 'B-002'), 1,
  'AC-1103: the duplicate key left one row');
select is(
  (select amount from reporting.pending_bills where bill_no = 'B-002'), 300000.00::numeric,
  'AC-1103: ...carrying the re-sent amount');

-- A branch code that is only known in ANOTHER org stays unlinked: the link never crosses orgs.
insert into shared.branches (org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000b1','XBR','Org B branch');
insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
values ('00000000-0000-0000-0000-0000000000a1','GKI','XBR','B-006','2026-09-03',1000.00,now());
select is(
  (select branch_id from reporting.pending_bills where bill_no = 'B-006'), null,
  'a code known only in another org leaves the link empty');
delete from reporting.pending_bills where bill_no = 'B-006';

-- A bill first copied under a code the catalog did not know is linked by the next night's upsert
-- once the branch is catalogued — the nightly ON CONFLICT DO UPDATE never touches branch_code.
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000a1', true);
set local role reporting_writer;
insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
values ('00000000-0000-0000-0000-0000000000a1','GKI','NEWBR','B-007','2026-09-04',2000.00,now());
reset role;
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000a1','NEWBR','Branch Two');
set local role reporting_writer;
insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
values ('00000000-0000-0000-0000-0000000000a1','GKI','NEWBR','B-007','2026-09-04',2000.00,now())
on conflict (org_id, esb_code, branch_code, bill_no) do update set amount = excluded.amount;
reset role;
select is(
  (select branch_id from reporting.pending_bills where bill_no = 'B-007'),
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  'a bill copied before its branch was catalogued is linked by the next upsert');
delete from reporting.pending_bills where bill_no = 'B-007';

-- The writer's USING half: a run declared for org B neither reads nor reaches org A's rows.
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000b1', true);
set local role reporting_writer;
select is((select count(*)::int from reporting.pending_bills), 0,
  'a run declared for another org reads none of this org''s bills');
select is((select count(*)::int from reporting.pending_bill_snapshots), 0,
  '...and none of its run log');
select lives_ok($$
  update reporting.pending_bills set amount = 1.00, org_id = '00000000-0000-0000-0000-0000000000b1'
   where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, 'an update aimed at another org''s bills raises nothing — USING filters');
select lives_ok($$
  update reporting.pending_bill_snapshots set bill_count = 0
   where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, 'an update aimed at another org''s run log raises nothing — USING filters');
reset role;
select is((select amount from reporting.pending_bills where bill_no = 'B-002'), 300000.00::numeric,
  '...and the bill is untouched');
select is((select bill_count from reporting.pending_bill_snapshots
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 2,
  '...and the run log is untouched');

-- The definer trigger cannot be steered by a caller's search_path.
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc
    where oid = 'reporting._link_pending_bill_branch()'::regprocedure),
  'the branch-link trigger function pins search_path to empty');

-- ══ AC-1110: Finance is the only reader ═════════════════════════════════════════════════════
set local role authenticated;

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}');
select is((select count(*)::int from reporting.pending_bills), 2,
  'AC-1110: finance reads every bill in their org');
select is((select count(*)::int from reporting.pending_bill_snapshots), 1,
  'AC-1110: ...and the run log');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["manager"]}');
select is((select count(*)::int from reporting.pending_bills) + (select count(*)::int from reporting.pending_bill_snapshots), 0,
  'AC-1110: a manager reads no bill and no run log');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select is((select count(*)::int from reporting.pending_bills) + (select count(*)::int from reporting.pending_bill_snapshots), 0,
  'AC-1110: an admin reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["supervisor"]}');
select is((select count(*)::int from reporting.pending_bills) + (select count(*)::int from reporting.pending_bill_snapshots), 0,
  'AC-1110: a supervisor reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from reporting.pending_bills) + (select count(*)::int from reporting.pending_bill_snapshots), 0,
  'AC-1110: a member reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["ops_lead"]}');
select is((select count(*)::int from reporting.pending_bills) + (select count(*)::int from reporting.pending_bill_snapshots), 0,
  'AC-1110: an ops lead reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["manager","admin","supervisor","ops_lead","member"]}');
select is((select count(*)::int from reporting.pending_bills) + (select count(*)::int from reporting.pending_bill_snapshots), 0,
  'AC-1110: every other role held at once still reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}');
select is((select count(*)::int from reporting.pending_bills) + (select count(*)::int from reporting.pending_bill_snapshots), 0,
  'AC-1110: finance in another org reads none of this org''s bills');
set local request.jwt.claims = '{}';
select is((select count(*)::int from reporting.pending_bills) + (select count(*)::int from reporting.pending_bill_snapshots), 0,
  'AC-1110: a session with no claims reads none');

-- ══ AC-1111: no end-user write, Finance included ═══════════════════════════════════════════
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}');
select throws_ok($$
  insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','GKI','RRS','B-010','2026-09-05',1000.00,now())
$$, '42501', null, 'AC-1111: finance cannot insert a bill');
select throws_ok($$
  update reporting.pending_bills set amount = 1.00 where bill_no = 'B-002'
$$, '42501', null, 'AC-1111: finance cannot update a bill');
select throws_ok($$
  delete from reporting.pending_bills where bill_no = 'B-002'
$$, '42501', null, 'AC-1111: finance cannot delete a bill');
select throws_ok($$
  insert into reporting.pending_bill_snapshots (org_id, snapshot_as_of, bill_count, window_start, source_contract_version)
  values ('00000000-0000-0000-0000-0000000000a1', now(), 0, '2024-10-08', 'pos_pending_bills.v1')
$$, '42501', null, 'AC-1111: finance cannot write the run log');
reset role;

select is((select amount from reporting.pending_bills where bill_no = 'B-002'), 300000.00::numeric,
  'AC-1111: the refused writes changed nothing');

select * from finish();
rollback;
