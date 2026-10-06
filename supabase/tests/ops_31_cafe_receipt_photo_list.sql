-- #1425 — the receipt photo list at volume: every photo of 50 receipts is returned, and only the asked
-- receipts' objects are read from storage (by the bucket/name index), not the whole bucket.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1425-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1425-MILK","name":"Photo list milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1425-MILK'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1425-MILK'), true);
update ops.item_units set confirmed_at = now() where esb_product_id = 'SYNTH-ESB-P-1425-MILK';

-- d5 receives in the Gordi HQ kitchen; d4 supervises that stream.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid), ('00000000-0000-0000-0000-0000000000d4'::uuid)) as p(person_id)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'gordi_hq_kitchen';

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'Photo list milk', current_setting('app.milk_l')::uuid, array[current_setting('app.milk_l')::uuid], 'RAW', true);

-- 51 Submitted receipts by d5, one line each; the list asks for the first 50.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
create temp table receipts (n int primary key, id uuid) on commit drop;
grant all on receipts to authenticated;
do $$
declare v_id uuid;
begin
  for n in 1..51 loop
    v_id := (ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', n::text))) ->> 'receipt_id')::uuid;
    perform ops.send_cafe_receipt_for_review(v_id, 1, null);
    insert into receipts values (n, v_id);
  end loop;
end;
$$;
reset role;

-- 24 photo objects on each asked receipt (1,200 rows, over PostgREST's 1,000-row cap), and as many
-- again outside the asked set: on the 51st receipt and under another organisation's prefix.
insert into storage.objects (bucket_id, name)
select 'cafe-receipt-photos', format('%s/%s/%s/%s.jpg', l.org_id, l.receipt_id, l.id, gen_random_uuid())
  from receipts r join ops.cafe_receipt_lines l on l.receipt_id = r.id
  cross join generate_series(1, 24)
 where r.n <= 50;
insert into storage.objects (bucket_id, name)
select 'cafe-receipt-photos', format('%s/%s/%s/%s.jpg', l.org_id, l.receipt_id, l.id, gen_random_uuid())
  from receipts r join ops.cafe_receipt_lines l on l.receipt_id = r.id
  cross join generate_series(1, 600)
 where r.n = 51;
insert into storage.objects (bucket_id, name)
select 'cafe-receipt-photos', format('00000000-0000-0000-0000-0000000000b1/%s/%s/%s.jpg', gen_random_uuid(), gen_random_uuid(), gen_random_uuid())
  from generate_series(1, 600);
-- Statistics that see these rows, so the plan is the one a populated bucket gets.
analyze storage.objects;

select set_config('app.seq_before', (select seq_scan::text from pg_stat_xact_all_tables where relid = 'storage.objects'::regclass), true);
select set_config('app.fetch_before', (select idx_tup_fetch::text from pg_stat_xact_all_tables where relid = 'storage.objects'::regclass), true);

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
create temp table listed on commit drop as
select * from ops.list_cafe_receipt_photos(array(select id from receipts where n <= 50 order by n));
reset role;

select is((select count(*)::int from listed), 50, 'FR-1018 the reviewer gets one row for each of the 50 asked receipts');
select is((select sum(jsonb_array_length(photos))::int from listed), 1200,
  'FR-1018 every photo of the 50 receipts is returned, past the 1,000-row cap');
select is((select count(*)::int from listed, jsonb_array_elements(photos) photo
            where (photo ->> 'line_id')::uuid not in (select l.id from ops.cafe_receipt_lines l join receipts r on r.id = l.receipt_id where r.n <= 50)), 0,
  'FR-1018 each listed photo belongs to a line of an asked receipt');
select is((select seq_scan::text from pg_stat_xact_all_tables where relid = 'storage.objects'::regclass), current_setting('app.seq_before'),
  'FR-1018 the photo list does not scan the storage table');
select is((select idx_tup_fetch - current_setting('app.fetch_before')::bigint from pg_stat_xact_all_tables where relid = 'storage.objects'::regclass), 1200::bigint,
  'FR-1018 the photo list fetches only the asked receipts'' photo objects, by index');

select * from finish();
rollback;
