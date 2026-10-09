-- #1529 — the sample Café capture catalog is copied insert-only and stays isolated from operations.
--
-- pgTAP (`supabase test db`) cannot load a file outside supabase/tests, so this test lives in
-- supabase/seed-tests and CI runs it in its own db-contracts step with the same command as below.
-- The seed is included relative to this file (\ir ../seed...). The DB container has psql but not
-- the host checkout, so stage both files there; the trap removes them:
-- ```sh
-- scripts/with-db-lock.sh bash -c '
--   set -e
--   c=supabase_db_gordi-mos
--   docker cp supabase/seed.sample-org-esb-catalog.sql "$c:/tmp/seed.sample-org-esb-catalog.sql"
--   docker exec "$c" mkdir -p /tmp/seed-tests
--   docker cp supabase/seed-tests/ops_28_sample_org_esb_catalog.sql "$c:/tmp/seed-tests/ops_28_sample_org_esb_catalog.sql"
--   trap "docker exec $c rm -rf /tmp/seed.sample-org-esb-catalog.sql /tmp/seed-tests" EXIT
--   set +e
--   out=$(docker exec "$c" psql -U postgres -d postgres -X -A -t -v ON_ERROR_STOP=1 -f /tmp/seed-tests/ops_28_sample_org_esb_catalog.sql)
--   rc=$?
--   set -e
--   printf "%s\\n" "$out"
--   test "$rc" -eq 0
--   printf "%s\\n" "$out" | grep -Fxq "1..36"
--   test "$(printf "%s\\n" "$out" | grep -Ec "^ok [0-9]+ -")" -eq 36
--   if printf "%s\\n" "$out" | grep -q "^not ok "; then exit 1; fi
-- '
-- ```
-- The file owns a transaction and ends with ROLLBACK; do not reset or migrate the shared DB to run it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

create function pg_temp.sample_catalog_counts() returns jsonb
language sql set search_path = '' as $$
  select jsonb_build_object(
    'items', (select count(*) from ops.wip_items where org_id = '5a000000-0000-0000-0000-000000000001'),
    'units', (select count(*) from ops.item_units where org_id = '5a000000-0000-0000-0000-000000000001'),
    'streams', (select count(*) from ops.stream_items where org_id = '5a000000-0000-0000-0000-000000000001'),
    'settings', (select count(*) from ops.cafe_item_settings where org_id = '5a000000-0000-0000-0000-000000000001'),
    'shown_units', (select count(*) from ops.cafe_item_setting_units where org_id = '5a000000-0000-0000-0000-000000000001')
  )
$$;

create function pg_temp.sample_catalog_checksum() returns text
language sql set search_path = '' as $$
  select md5(jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.id)
                         from ops.wip_items row_data
                        where row_data.org_id = '5a000000-0000-0000-0000-000000000001'), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.id)
                         from ops.item_units row_data
                        where row_data.org_id = '5a000000-0000-0000-0000-000000000001'), '[]'::jsonb),
    'streams', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.id)
                           from ops.stream_items row_data
                          where row_data.org_id = '5a000000-0000-0000-0000-000000000001'), '[]'::jsonb),
    'settings', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.id)
                            from ops.cafe_item_settings row_data
                           where row_data.org_id = '5a000000-0000-0000-0000-000000000001'), '[]'::jsonb),
    'shown_units', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.id)
                               from ops.cafe_item_setting_units row_data
                              where row_data.org_id = '5a000000-0000-0000-0000-000000000001'), '[]'::jsonb)
  )::text)
$$;

create function pg_temp.sample_operational_counts() returns jsonb
language sql set search_path = '' as $$
  select jsonb_build_object(
    'log_entries', (select count(*) from ops.log_entries where org_id = '5a000000-0000-0000-0000-000000000001'),
    'kitchen_logs', (select count(*) from ops.kitchen_logs where org_id = '5a000000-0000-0000-0000-000000000001'),
    'kitchen_plans', (select count(*) from ops.kitchen_plans where org_id = '5a000000-0000-0000-0000-000000000001'),
    'kitchen_stock', (select count(*) from ops.kitchen_stock where org_id = '5a000000-0000-0000-0000-000000000001'),
    'kitchen_batch_sequences', (select count(*) from ops.kitchen_batch_seq where org_id = '5a000000-0000-0000-0000-000000000001'),
    'stream_completeness', (select count(*) from ops.stream_completeness where org_id = '5a000000-0000-0000-0000-000000000001'),
    'destinations', (select count(*) from ops.cafe_destinations where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receiving_locations', (select count(*) from ops.cafe_receiving_locations where org_id = '5a000000-0000-0000-0000-000000000001'),
    'count_posting_switches', (select count(*) from ops.cafe_count_posting_switches where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receipt_posting_switches', (select count(*) from ops.cafe_receipt_posting_switches where org_id = '5a000000-0000-0000-0000-000000000001'),
    'missing_item_reports', (select count(*) from ops.cafe_missing_item_reports where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receipts', (select count(*) from ops.cafe_receipts where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receipt_lines', (select count(*) from ops.cafe_receipt_lines where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receipt_matches', (select count(*) from ops.cafe_receipt_matches where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receipt_portions', (select count(*) from ops.cafe_receipt_portions where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receipt_issues', (select count(*) from ops.cafe_receipt_issues where org_id = '5a000000-0000-0000-0000-000000000001'),
    'count_lines', (select count(*) from ops.cafe_count_lines where org_id = '5a000000-0000-0000-0000-000000000001'),
    'purchase_requests', (select count(*) from ops.cafe_purchase_requests where org_id = '5a000000-0000-0000-0000-000000000001'),
    'purchase_request_lines', (select count(*) from ops.cafe_purchase_request_lines where org_id = '5a000000-0000-0000-0000-000000000001'),
    'open_po_branches', (select count(*) from ops.cafe_open_po_branches where org_id = '5a000000-0000-0000-0000-000000000001'),
    'open_pos', (select count(*) from ops.cafe_open_pos where org_id = '5a000000-0000-0000-0000-000000000001'),
    'open_po_lines', (select count(*) from ops.cafe_open_po_lines where org_id = '5a000000-0000-0000-0000-000000000001'),
    'outbox', (select count(*) from integrations.esb_push where org_id = '5a000000-0000-0000-0000-000000000001'),
    'outbox_groups', (select count(*) from integrations.esb_push_groups where org_id = '5a000000-0000-0000-0000-000000000001'),
    'waste_photos', (select count(*) from storage.objects where bucket_id = 'waste-photos'),
    'receipt_photos', (select count(*) from storage.objects where bucket_id = 'cafe-receipt-photos')
  )
$$;

select set_config('app.esb_target_env', 'goo', true);

-- Source organization and two sample-compatible streams.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-000015290001', 'Synthetic Source 1529', 'synthetic-source-1529');
insert into shared.orgs (id, name, slug, is_sample) values
  ('5a000000-0000-0000-0000-000000000001', 'Gordi Sample', 'gordi-sample', true);
insert into shared.people (id, org_id, full_name, email) values
  ('00000000-0000-0000-0000-000015290101', '5a000000-0000-0000-0000-000000000001',
   'Synthetic Sample Person', 'sample.person@sample.gordi.test');

insert into shared.business_units (id, org_id, name, code) values
  ('00000000-0000-0000-0000-000015290201', '00000000-0000-0000-0000-000015290001', 'Synthetic Retail Ops', 'retail_ops'),
  ('00000000-0000-0000-0000-000015290202', '5a000000-0000-0000-0000-000000000001', 'Synthetic Retail Ops', 'retail_ops');
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-000015290301', '00000000-0000-0000-0000-000015290001', 'catalog_test_a', 'Synthetic Branch A'),
  ('00000000-0000-0000-0000-000015290302', '00000000-0000-0000-0000-000015290001', 'catalog_test_b', 'Synthetic Branch B'),
  ('00000000-0000-0000-0000-000015290311', '5a000000-0000-0000-0000-000000000001', 'catalog_test_a', 'Synthetic Branch A'),
  ('00000000-0000-0000-0000-000015290312', '5a000000-0000-0000-0000-000000000001', 'catalog_test_b', 'Synthetic Branch B');
insert into shared.teams (id, org_id, business_unit_id, name, code, branch_id, activity) values
  ('00000000-0000-0000-0000-000015290401', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290201', 'Synthetic Kitchen A', 'catalog_test_a_kitchen', '00000000-0000-0000-0000-000015290301', 'kitchen'),
  ('00000000-0000-0000-0000-000015290402', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290201', 'Synthetic Bar B', 'catalog_test_b_bar', '00000000-0000-0000-0000-000015290302', 'bar'),
  ('00000000-0000-0000-0000-000015290411', '5a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000015290202', 'Synthetic Kitchen A', 'catalog_test_a_kitchen', '00000000-0000-0000-0000-000015290311', 'kitchen'),
  ('00000000-0000-0000-0000-000015290412', '5a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000015290202', 'Synthetic Bar B', 'catalog_test_b_bar', '00000000-0000-0000-0000-000015290312', 'bar');

insert into ops.wip_items
  (id, org_id, name, category, flag_active, esb_product_id, kind, reference_source,
   erp_category_type_name, has_active_bom_output)
values
  ('00000000-0000-0000-0000-000015290501', '00000000-0000-0000-0000-000015290001',
   'Clashing sample item', 'KITCHEN', true, 'SYNTH-ESB-P-1529-A', null, 'erp_catalog', 'Inventory', false),
  ('00000000-0000-0000-0000-000015290502', '00000000-0000-0000-0000-000015290001',
   'Synthetic output item', 'BAR', true, 'SYNTH-ESB-P-1529-B', null, 'erp_catalog', 'Inventory', true);
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
   is_default, is_transferable, source_active, erp_is_stock, confirmed_at)
values
  ('00000000-0000-0000-0000-000015290601', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290501', 'pack', 'SYNTH-ESB-PD-1529-A-PACK', 'SYNTH-ESB-P-1529-A', true, true, true, true, now()),
  ('00000000-0000-0000-0000-000015290602', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290501', 'each', 'SYNTH-ESB-PD-1529-A-EACH', 'SYNTH-ESB-P-1529-A', false, true, true, true, now()),
  ('00000000-0000-0000-0000-000015290603', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290502', 'tray', 'SYNTH-ESB-PD-1529-B-TRAY', 'SYNTH-ESB-P-1529-B', true, true, true, true, now());
insert into ops.stream_items (id, org_id, branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-000015290701', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290301', 'kitchen', '00000000-0000-0000-0000-000015290501', 'esb'),
  ('00000000-0000-0000-0000-000015290702', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290302', 'bar', '00000000-0000-0000-0000-000015290501', 'esb'),
  ('00000000-0000-0000-0000-000015290703', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290301', 'kitchen', '00000000-0000-0000-0000-000015290502', 'esb');
insert into ops.cafe_item_settings
  (id, org_id, branch_id, activity, wip_item_id, mos_name, kind, is_active, unit_multiples)
values
  ('00000000-0000-0000-0000-000015290801', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290301', 'kitchen', '00000000-0000-0000-0000-000015290501', 'Source display A', 'RAW', true, array[]::numeric[]),
  ('00000000-0000-0000-0000-000015290802', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290302', 'bar', '00000000-0000-0000-0000-000015290501', null, 'WIP', true, array[]::numeric[]),
  ('00000000-0000-0000-0000-000015290803', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290301', 'kitchen', '00000000-0000-0000-0000-000015290502', null, 'WIP', true, array[]::numeric[]);
insert into ops.cafe_item_setting_units (id, org_id, cafe_item_setting_id, item_unit_id) values
  ('00000000-0000-0000-0000-000015290901', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290801', '00000000-0000-0000-0000-000015290601'),
  ('00000000-0000-0000-0000-000015290902', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290801', '00000000-0000-0000-0000-000015290602'),
  ('00000000-0000-0000-0000-000015290903', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290802', '00000000-0000-0000-0000-000015290602'),
  ('00000000-0000-0000-0000-000015290904', '00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015290803', '00000000-0000-0000-0000-000015290603');
update ops.cafe_item_settings
   set default_item_unit_id = '00000000-0000-0000-0000-000015290601', unit_multiples = array[2]::numeric[]
 where id = '00000000-0000-0000-0000-000015290801';
update ops.cafe_item_settings set default_item_unit_id = '00000000-0000-0000-0000-000015290602'
 where id = '00000000-0000-0000-0000-000015290802';
update ops.cafe_item_settings set default_item_unit_id = '00000000-0000-0000-0000-000015290603'
 where id = '00000000-0000-0000-0000-000015290803';

-- A partial sample copy, one hand-made item with a colliding name/code, and a manual stream row.
insert into ops.wip_items
  (id, org_id, name, category, flag_active, esb_product_id, kind, reference_source,
   erp_category_type_name, has_active_bom_output)
values
  ('00000000-0000-0000-0000-000015291001', '5a000000-0000-0000-0000-000000000001',
   'Preserved catalog label', 'Local category', true, 'SYNTH-ESB-P-1529-A', null, 'erp_catalog', 'Inventory', false);
set local session_replication_role = replica;
insert into ops.wip_items
  (id, org_id, name, category, flag_active, esb_product_id, kind, reference_source)
values
  ('00000000-0000-0000-0000-000015291002', '5a000000-0000-0000-0000-000000000001',
   'Clashing sample item', 'Hand-made category', true, 'SYNTH-ESB-P-1529-A', 'WIP', 'manual');
set local session_replication_role = origin;
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
   is_default, source_active, confirmed_at)
values
  ('00000000-0000-0000-0000-000015291101', '5a000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000015291001', 'local pack', 'SYNTH-ESB-PD-1529-A-PACK', 'SYNTH-ESB-P-1529-A', false, true, now()),
  ('00000000-0000-0000-0000-000015291102', '5a000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000015291002', 'hand unit', null, null, true, true, null);
insert into ops.stream_items (id, org_id, branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-000015291201', '5a000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000015290311', 'kitchen', '00000000-0000-0000-0000-000015291001', 'manual');

create temporary table sample_protected_rows (key text primary key, row_data jsonb) on commit drop;
insert into sample_protected_rows values
  ('partial-item', (select to_jsonb(item) from ops.wip_items item where item.id = '00000000-0000-0000-0000-000015291001')),
  ('partial-unit', (select to_jsonb(unit) from ops.item_units unit where unit.id = '00000000-0000-0000-0000-000015291101')),
  ('handmade-item', (select to_jsonb(item) from ops.wip_items item where item.id = '00000000-0000-0000-0000-000015291002')),
  ('handmade-unit', (select to_jsonb(unit) from ops.item_units unit where unit.id = '00000000-0000-0000-0000-000015291102')),
  ('manual-stream', (select to_jsonb(stream_item) from ops.stream_items stream_item where stream_item.id = '00000000-0000-0000-0000-000015291201'));
select set_config('app.sample_ops_before', pg_temp.sample_operational_counts()::text, true);

-- Keep any pre-existing local ERP catalogs out of the synthetic source fixture; rollback restores their flags.
set local session_replication_role = replica;
update shared.orgs org set is_sample = true
 where org.id not in ('00000000-0000-0000-0000-000015290001', '5a000000-0000-0000-0000-000000000001')
   and exists (select 1 from ops.wip_items item
                where item.org_id = org.id and item.reference_source = 'erp_catalog'
                  and item.esb_product_id is not null);
set local session_replication_role = origin;

select is((select shared.is_sample_org('5a000000-0000-0000-0000-000000000001'::uuid)
                  and shared.is_sample_org_shape('5a000000-0000-0000-0000-000000000001'::uuid, 'Gordi Sample')),
          true, 'the fixture target is the flagged sample organisation with sample-address people');
select is((select count(distinct org_id)::int from ops.wip_items
            where reference_source = 'erp_catalog' and esb_product_id is not null
              and not shared.is_sample_org(org_id)),
          1, 'the fixture supplies one non-sample ESB catalog source');

\ir ../seed.sample-org-esb-catalog.sql

select is((select count(*)::int from ops.wip_items
            where org_id = '5a000000-0000-0000-0000-000000000001' and reference_source = 'erp_catalog'),
          2, 'the catalog includes the existing partial item and the missing source item');
select is((select count(*)::int from ops.wip_items where org_id = '5a000000-0000-0000-0000-000000000001'),
          3, 'the hand-made item remains beside both catalog items');
select is((select count(*)::int from ops.item_units where org_id = '5a000000-0000-0000-0000-000000000001'),
          4, 'all source units are present alongside the hand-made unit');
select is((select count(*)::int from ops.stream_items where org_id = '5a000000-0000-0000-0000-000000000001'),
          3, 'each source stream membership is present, including the existing manual membership');
select is((select count(*)::int from ops.cafe_item_settings where org_id = '5a000000-0000-0000-0000-000000000001'),
          3, 'per-stream kind and availability settings are copied');
select is((select count(*)::int from ops.cafe_item_setting_units where org_id = '5a000000-0000-0000-0000-000000000001'),
          4, 'the source shown-unit lists are copied');
select is((select item.name || '|' || item.category || '|' || item.reference_source || '|' || item.flag_active::text
             from ops.wip_items item
            where item.org_id = '5a000000-0000-0000-0000-000000000001'
              and item.esb_product_id = 'SYNTH-ESB-P-1529-B' and item.reference_source = 'erp_catalog'),
          'Synthetic output item|BAR|erp_catalog|true', 'the missing ERP item carries its catalog fields');
select is((select unit.unit_name || '|' || unit.is_default::text || '|' || unit.source_active::text || '|'
                         || unit.erp_is_stock::text || '|' || (unit.confirmed_at is not null)::text
             from ops.item_units unit join ops.wip_items item on item.id = unit.wip_item_id
            where item.org_id = '5a000000-0000-0000-0000-000000000001'
              and item.esb_product_id = 'SYNTH-ESB-P-1529-B' and unit.esb_product_detail_id = 'SYNTH-ESB-PD-1529-B-TRAY'),
          'tray|true|true|true|true', 'the ERP unit and its stored default/confirmation state are copied');
select is((select to_jsonb(item) from ops.wip_items item where item.id = '00000000-0000-0000-0000-000015291001'),
          (select row_data from sample_protected_rows where key = 'partial-item'),
          'an existing sample catalog row is reused without being overwritten');
select is((select to_jsonb(unit) from ops.item_units unit where unit.id = '00000000-0000-0000-0000-000015291101'),
          (select row_data from sample_protected_rows where key = 'partial-unit'),
          'an existing sample unit is reused without being overwritten');
select is((select to_jsonb(item) from ops.wip_items item where item.id = '00000000-0000-0000-0000-000015291002'),
          (select row_data from sample_protected_rows where key = 'handmade-item'),
          'the hand-made item with a colliding name and product code is untouched');
select is((select to_jsonb(unit) from ops.item_units unit where unit.id = '00000000-0000-0000-0000-000015291102'),
          (select row_data from sample_protected_rows where key = 'handmade-unit'),
          'the hand-made item unit is untouched');
select is((select to_jsonb(stream_item) from ops.stream_items stream_item where stream_item.id = '00000000-0000-0000-0000-000015291201'),
          (select row_data from sample_protected_rows where key = 'manual-stream'),
          'the existing manual stream membership is untouched');
select is((select string_agg(item.esb_product_id || ':' || branch.code || ':' || setting.activity || ':' || unit.unit_name,
                            ',' order by item.esb_product_id, branch.code, setting.activity)
             from ops.cafe_item_settings setting
             join ops.wip_items item on item.id = setting.wip_item_id and item.org_id = setting.org_id
             join shared.branches branch on branch.id = setting.branch_id and branch.org_id = setting.org_id
             join ops.item_units unit on unit.id = setting.default_item_unit_id and unit.org_id = setting.org_id
            where setting.org_id = '5a000000-0000-0000-0000-000000000001'),
          'SYNTH-ESB-P-1529-A:catalog_test_a:kitchen:local pack,SYNTH-ESB-P-1529-A:catalog_test_b:bar:each,SYNTH-ESB-P-1529-B:catalog_test_a:kitchen:tray',
          'each source stream default maps to its sample unit without inventing a default');
select is((select count(*)::int from ops.cafe_item_settings
            where org_id = '5a000000-0000-0000-0000-000000000001'
              and cardinality(unit_multiples) > 0),
          0, 'manager-defined unit multiples are not copied');
select is((select count(*)::int from ops.cafe_item_settings_read
            where branch_id in ('00000000-0000-0000-0000-000015290311', '00000000-0000-0000-0000-000015290312')),
          5, 'the stream settings read-model exposes each copied active ERP unit');
select is((select count(*)::int from ops.cafe_item_settings_read
            where branch_id in ('00000000-0000-0000-0000-000015290311', '00000000-0000-0000-0000-000015290312')
              and is_active and unit_is_default),
          3, 'the settings read-model exposes the copied per-stream defaults');
select is((select count(*)::int from ops.cafe_item_references
            where branch_id in ('00000000-0000-0000-0000-000015290311', '00000000-0000-0000-0000-000015290312')),
          5, 'the reference read-model exposes the copied confirmed units on their streams');
select is(pg_temp.sample_operational_counts(), current_setting('app.sample_ops_before')::jsonb,
          'the catalog load adds no sample transaction, outbox, receipt, plan, photo or cache rows');

select set_config('app.sample_catalog_counts_before_rerun', pg_temp.sample_catalog_counts()::text, true);
select set_config('app.sample_catalog_checksum_before_rerun', pg_temp.sample_catalog_checksum(), true);
select pg_temp.seed_sample_org_esb_catalog();
select is(pg_temp.sample_catalog_counts(), current_setting('app.sample_catalog_counts_before_rerun')::jsonb,
          'a second run leaves every catalog-table row count unchanged');
select is(pg_temp.sample_catalog_checksum(), current_setting('app.sample_catalog_checksum_before_rerun'),
          'a second run leaves the catalog checksum unchanged');
select is(pg_temp.sample_operational_counts(), current_setting('app.sample_ops_before')::jsonb,
          'a second run still adds no operational rows');

select set_config('app.sample_catalog_counts_before_refusal', pg_temp.sample_catalog_counts()::text, true);
select set_config('app.sample_catalog_checksum_before_refusal', pg_temp.sample_catalog_checksum(), true);
set local session_replication_role = replica;
update shared.people set email = 'not-sample@example.test'
 where id = '00000000-0000-0000-0000-000015290101';
set local session_replication_role = origin;
select throws_ok('select pg_temp.seed_sample_org_esb_catalog()', '42501',
  'seed.sample-org-esb-catalog: refused, target is not the sample organisation',
  'a sample org with a non-sample person is refused');
select is(pg_temp.sample_catalog_counts(), current_setting('app.sample_catalog_counts_before_refusal')::jsonb,
          'target refusal writes no catalog rows');
select is(pg_temp.sample_catalog_checksum(), current_setting('app.sample_catalog_checksum_before_refusal'),
          'target refusal leaves the sample catalog checksum unchanged');
update shared.people set email = 'sample.person@sample.gordi.test'
 where id = '00000000-0000-0000-0000-000015290101';

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-000015292001', 'Synthetic Second Source 1529', 'synthetic-second-source-1529');
insert into ops.wip_items
  (id, org_id, name, category, flag_active, esb_product_id, kind, reference_source,
   erp_category_type_name, has_active_bom_output)
values
  ('00000000-0000-0000-0000-000015292101', '00000000-0000-0000-0000-000015292001',
   'Second synthetic item', 'KITCHEN', true, 'SYNTH-ESB-P-1529-SECOND', null, 'erp_catalog', 'Inventory', false);
select throws_ok('select pg_temp.seed_sample_org_esb_catalog()', '42501',
  'seed.sample-org-esb-catalog: refused, expected exactly one non-sample ESB catalog source',
  'multiple non-sample ESB catalog sources are refused');
select is(pg_temp.sample_catalog_counts(), current_setting('app.sample_catalog_counts_before_refusal')::jsonb,
          'multiple-source refusal writes no catalog rows');
select is(pg_temp.sample_catalog_checksum(), current_setting('app.sample_catalog_checksum_before_refusal'),
          'multiple-source refusal leaves the sample catalog checksum unchanged');

set local session_replication_role = replica;
update shared.orgs set is_sample = true
 where id in ('00000000-0000-0000-0000-000015290001', '00000000-0000-0000-0000-000015292001');
set local session_replication_role = origin;
select is((select count(*)::int from ops.wip_items
            where reference_source = 'erp_catalog' and esb_product_id is not null
              and not shared.is_sample_org(org_id)),
          0, 'the source-none fixture has no non-sample catalog items');
select throws_ok('select pg_temp.seed_sample_org_esb_catalog()', '42501',
  'seed.sample-org-esb-catalog: refused, expected exactly one non-sample ESB catalog source',
  'no non-sample ESB catalog source is refused');
select is(pg_temp.sample_catalog_counts(), current_setting('app.sample_catalog_counts_before_refusal')::jsonb,
          'no-source refusal writes no catalog rows');
select is(pg_temp.sample_catalog_checksum(), current_setting('app.sample_catalog_checksum_before_refusal'),
          'no-source refusal leaves the sample catalog checksum unchanged');

insert into integrations.esb_push (org_id, source_ref, endpoint, target_env, dedup_key)
values ('5a000000-0000-0000-0000-000000000001', 'SAMPLE-CATALOG-1529', 'simple-transfer', 'goo',
        'sample-catalog-1529|goo');
select set_config('app.sample_catalog_push_id',
  (select id::text from integrations.esb_push where source_ref = 'SAMPLE-CATALOG-1529'), true);
select is((select target_env || ':' || (dedup_key like '%|dry_run')::text
             from integrations.esb_push where source_ref = 'SAMPLE-CATALOG-1529'),
          'dry_run:true', 'an attempted ERP enqueue after the load is forced to dry_run');
set local role service_role;
select throws_ok(format('select * from integrations.claim_esb_pushes(array[%L::uuid])',
                        current_setting('app.sample_catalog_push_id')),
  '42501', 'the sample organisation never sends anything to the ERP',
  'the worker cannot claim a post-load sample outbox row');
reset role;

delete from integrations.esb_push where id = current_setting('app.sample_catalog_push_id')::uuid;

select * from finish();
rollback;
