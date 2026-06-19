begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Defense-in-depth: the Submitted->Approved/Rejected role gate lives ONLY in the kitchen_logs_guard
-- trigger (the UPDATE RLS policy is org-only). If the trigger were ever dropped/disabled, a member
-- could self-approve. Assert the trigger exists AND is enabled so a regression fails the suite.
select ok(
  exists(select 1 from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'ops' and c.relname = 'kitchen_logs'
            and t.tgname = 'kitchen_logs_guard' and t.tgenabled <> 'D'),
  'kitchen_logs status/role guard trigger is present and enabled (defense-in-depth)');

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

-- AC-003/AC-043: member cannot flip status to Approved.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update ops.kitchen_logs set status='Approved', reviewed_by='00000000-0000-0000-0000-0000000000d1', reviewed_at=now()
   where id='00000000-0000-0000-0000-00000000ac01'
$$, '42501', null, 'AC-003: member approve denied (guard)');
-- AC-043: ops_lead approves directly; reviewed_by stamped. (The real approve path is the RPC; here we
--  prove the guard ALLOWS the direct transition for ops_lead so the RLS authority is independent of the RPC.)
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select lives_ok($$
  update ops.kitchen_logs set status='Approved', reviewed_by='00000000-0000-0000-0000-0000000000d3', reviewed_at=now()
   where id='00000000-0000-0000-0000-00000000ac01'
$$, 'AC-043: ops_lead approve allowed (guard); reviewed_by stamped');
-- AC-004: org-B ops_lead sees zero org-A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["ops_lead"]}';
select is((select count(*)::int from ops.kitchen_logs where log_date='2026-06-20'), 0,
  'AC-004: org-B ops_lead reads 0 org-A logs (org isolation)');

reset role;
select * from finish();
rollback;
