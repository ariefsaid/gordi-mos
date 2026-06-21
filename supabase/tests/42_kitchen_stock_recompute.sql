begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
-- approve PR+12, TR-4, TB-3 for item …ab02 on 2026-06-21 (fixture ids …ad01..03) → net 5.
do $$ begin
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad01'::uuid, null);  -- PR 12
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad02'::uuid, null);  -- TR 4
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad03'::uuid, null);  -- TB 3
end $$;
select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab02' and log_date='2026-06-21'),
          5::numeric, 'AC-031: stock = +12 -4 -3 = 5 (net of approved)');
-- AC-031: a still-Submitted log (…ad04 PR 9) does not count yet.
select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab02' and log_date='2026-06-21'),
          5::numeric, 'AC-031: a pending Submitted log does not change stock (GIGO gate)');
-- approve the 4th (PR 9) → 5 + 9 = 14.
do $$ begin
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad04'::uuid, null);  -- PR 9
end $$;
select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab02' and log_date='2026-06-21'),
          14::numeric, 'AC-034: stock recomputed after the 4th approval (5 + 9)');
-- AC-032: negative preserved (approve TB 100 for item …ab03 with 0 production).
do $$ begin
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad05'::uuid, null);  -- TB 100
end $$;
select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab03' and log_date='2026-06-22'),
          -100::numeric, 'AC-032: negative balance preserved (not clamped)');

reset role;
select * from finish();
rollback;
