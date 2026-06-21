begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local app.esb_target_env = 'goo';  -- GUC, not a JWT claim (M1/KQ-6)

-- AC (cross-tenant): an org-B ops_lead must NOT be able to approve an org-A log. The RPC is
-- SECURITY DEFINER (RLS-bypassing), so org ownership must be enforced inside the RPC; the role gate
-- alone is satisfied by the org-B lead's JWT. Target an org-A log still Submitted (…ac06, untouched
-- below). The claim is a legitimate org-B ops_lead (org …0b1, person ForeignMgr …0b4) — mirrors test 40.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["ops_lead"]}';
select throws_ok($$ select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac06'::uuid, null) $$,
  '42501', null, 'FR-044/cross-tenant: org-B ops_lead cannot approve an org-A log (DEFINER does not bypass org ownership)');

-- and the org-A log is wholly untouched by the rejected cross-org call. Asserted under an org-A claim
-- (org-B cannot even SELECT org-A rows under RLS, so reading the state requires the owning org's view).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select is((select status from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac06'::uuid),
          'Submitted', 'cross-tenant: org-A log left Submitted (no write leaked across the org boundary)');
select is((select count(*)::int from integrations.esb_push where source_ref like 'PR-20260620-%'),
          0, 'cross-tenant: no esb_push row enqueued by the rejected cross-org call');

select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01'::uuid, null);
select is((select status from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac01'::uuid),
          'Approved', 'AC-034: log Approved');
select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab01' and log_date='2026-06-20'),
          12::numeric, 'AC-034: stock recomputed to the approved net');
select is((select count(*)::int from integrations.esb_push where source_ref like 'PR-20260620-%' and status='pending' and target_env='goo'),
          1, 'AC-060: outbox row enqueued (pending, target_env from GUC)');
-- AC-060/AC-061 (DEFERRED — parity-first): the cross-module Daily-Log mirror was removed
-- (migration 20260620000014). The OLD kitchen app writes no Daily Log row and MOS's Daily Log UI
-- is flag-hidden; the mirror is to be re-added when the Daily Log module ships. Approval must now
-- write NO ops.log_entries row. (Previously these asserted one kitchen-origin mirror row + its BU/
-- no-RACI shape.)
select is((select count(*)::int from ops.log_entries where origin='kitchen'),
          0, 'AC-060/AC-061 deferred: approval writes NO Daily Log mirror row (parity-first; re-add with Daily Log module)');
select throws_ok($$ select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01'::uuid, null) $$,
  'P0003', null, 'FR-092: re-approve same log raises (idempotency is per-batch, not per-log)');

reset role;
select * from finish();
rollback;
