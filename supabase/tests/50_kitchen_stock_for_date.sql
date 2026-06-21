begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

-- Approve item ab02's 2026-06-21 logs (ad01 PR 12, ad02 TR 4, ad03 TB 3 → net 5). The approval RPC
-- recomputes ops.kitchen_stock end-of-day (usable_qty=5 for ab02 on 2026-06-21) and these Approved
-- logs become the basis for ops.stock_available_for_date(ab02, '2026-06-22') = 5 (strictly-before cut).
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
do $$ begin
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad01'::uuid, null);  -- PR 12
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad02'::uuid, null);  -- TR 4
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad03'::uuid, null);  -- TB 3
end $$;

-- (a) One row per ACTIVE org-A wip_item (ab01, ab02, ab03) — exactly 3.
select is((select count(*)::int from ops.kitchen_stock_for_date('2026-06-21')), 3,
  'AC: kitchen_stock_for_date returns a row per active wip_item in the caller org');

-- (b) usable_qty mirrors the stored ops.kitchen_stock for that day: ab02 = 5.
select is((select usable_qty from ops.kitchen_stock_for_date('2026-06-21') where wip_item_id='00000000-0000-0000-0000-00000000ab02'),
  5::numeric, 'AC: usable_qty matches the seeded kitchen_stock row (ab02 on 2026-06-21 = 5)');

-- (b') usable_qty = 0 for an item with no kitchen_stock row that day (ab01).
select is((select usable_qty from ops.kitchen_stock_for_date('2026-06-21') where wip_item_id='00000000-0000-0000-0000-00000000ab01'),
  0::numeric, 'AC: usable_qty is 0 when no kitchen_stock row exists for the item that day (ab01)');

-- (c) available_qty == ops.stock_available_for_date(item, date) for ab02. On 2026-06-22 the strictly-
--     before cut nets the three Approved 2026-06-21 logs → 5; assert both the value and the parity.
select is((select available_qty from ops.kitchen_stock_for_date('2026-06-22') where wip_item_id='00000000-0000-0000-0000-00000000ab02'),
  5::numeric, 'AC: available_qty = net of Approved logs strictly before the date (ab02 on 2026-06-22 = 5)');
select is((select available_qty from ops.kitchen_stock_for_date('2026-06-22') where wip_item_id='00000000-0000-0000-0000-00000000ab02'),
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab02','2026-06-22'),
  'AC: available_qty equals the scalar ops.stock_available_for_date(item, date)');

-- available_qty = 0 on 2026-06-21 itself (logs are ON that day, the cut is strictly-before).
select is((select available_qty from ops.kitchen_stock_for_date('2026-06-21') where wip_item_id='00000000-0000-0000-0000-00000000ab02'),
  0::numeric, 'AC: available_qty is start-of-day (strictly-before cut) — 0 on the log date itself');

-- (d) Cross-org isolation: org-B member sees only org-B active items (ab09), zero org-A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["ops_lead"]}';
select is(
  (select count(*)::int from ops.kitchen_stock_for_date('2026-06-21')
     where wip_item_id in ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000ab02','00000000-0000-0000-0000-00000000ab03')),
  0, 'AC: org-B member sees 0 org-A rows (org isolation via RLS, SECURITY INVOKER)');

reset role;
select * from finish();
rollback;
