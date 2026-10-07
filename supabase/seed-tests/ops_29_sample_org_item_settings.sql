-- #1561 — prefill only untouched per-stream Café settings from confirmed ESB stock units.
--
-- pgTAP cannot include a file outside supabase/tests. CI runs this file in the DB container,
-- rollback-only, with the seed staged beside it (the same arrangement as ops_28_sample_org_esb_catalog.sql).
-- Run locally only against the shared DB under its lock; never migrate, seed, or reset for this test:
-- ```sh
-- scripts/with-db-lock.sh bash -c '
--   set -e
--   c=supabase_db_gordi-mos
--   docker cp supabase/seed.sample-org-item-settings.sql "$c:/tmp/seed.sample-org-item-settings.sql"
--   docker exec "$c" mkdir -p /tmp/seed-tests
--   docker cp supabase/seed-tests/ops_29_sample_org_item_settings.sql "$c:/tmp/seed-tests/ops_29_sample_org_item_settings.sql"
--   trap "docker exec $c rm -rf /tmp/seed.sample-org-item-settings.sql /tmp/seed-tests" EXIT
--   set +e
--   out=$(docker exec "$c" psql -U postgres -d postgres -X -A -t -v ON_ERROR_STOP=1 -f /tmp/seed-tests/ops_29_sample_org_item_settings.sql)
--   rc=$?
--   set -e
--   printf "%s\\n" "$out"
--   test "$rc" -eq 0
--   printf "%s\\n" "$out" | grep -Fxq "1..28"
--   test "$(printf "%s\\n" "$out" | grep -Ec "^ok [0-9]+ -")" -eq 28
--   if printf "%s\\n" "$out" | grep -q "^not ok "; then exit 1; fi
-- '
-- ```
-- The transaction below owns all fixtures and ends with ROLLBACK. The 168 Bar items model 60
-- with BOM output, 98 without output and 10 with unknown BOM evidence; only the last ten have
-- unconfirmed stock details. For the sample org only, kind is derived as test data (BOM output =
-- WIP, none = RAW, unknown unset). Six manager-touched rows are left alone: two saved with values
-- (WIP, RAW) and four that each differ from the untouched baseline in one way (later edit, kind,
-- shown unit, custom name). Result: 55 WIP, 100 RAW and 13 unset. There is no real-org mode. These
-- are fixture counts, not a claim about a live catalog.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select set_config('app.esb_target_env', 'goo', true);
insert into shared.orgs (id, name, slug, is_sample) values
  ('5a000000-0000-0000-0000-000000000001', 'Gordi Sample', 'gordi-sample', true);
insert into shared.people (id, org_id, full_name, email) values
  ('00000000-0000-0000-0000-000015610101', '5a000000-0000-0000-0000-000000000001',
   'Synthetic Sample Member', 'sample.person@sample.gordi.test');
insert into shared.business_units (id, org_id, name, code) values
  ('00000000-0000-0000-0000-000015610201', '5a000000-0000-0000-0000-000000000001',
   'Synthetic Retail Ops', 'retail_ops');
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-000015610301', '5a000000-0000-0000-0000-000000000001',
   'item_defaults_bar', 'Synthetic Bar Branch');
insert into shared.teams (id, org_id, business_unit_id, name, code, branch_id, activity) values
  ('00000000-0000-0000-0000-000015610401', '5a000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000015610201', 'Synthetic Bar Team', 'item_defaults_bar',
   '00000000-0000-0000-0000-000015610301', 'bar');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
  ('5a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000015610101',
   '00000000-0000-0000-0000-000015610401', true, current_date - 1);

insert into ops.wip_items
  (id, org_id, name, category, flag_active, esb_product_id, kind, reference_source,
   erp_category_type_name, has_active_bom_output)
select md5('cafe-item-defaults:1561:item:' || n::text)::uuid,
       '5a000000-0000-0000-0000-000000000001',
       'Synthetic Bar item ' || lpad(n::text, 3, '0'), 'BAR', true,
       'SYNTH-ESB-P-1561-' || lpad(n::text, 3, '0'), null, 'erp_catalog', 'Inventory',
       case when n <= 60 then true when n <= 158 then false else null end
  from generate_series(1, 168) as items(n);
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
   is_default, source_active, erp_is_stock, confirmed_at)
select md5('cafe-item-defaults:1561:unit:' || n::text)::uuid,
       item.org_id, item.id, 'unit-' || n::text,
       'SYNTH-ESB-PD-1561-' || lpad(n::text, 3, '0'), item.esb_product_id,
       false, true, true, case when n <= 158 then now() else null end
  from generate_series(1, 168) as items(n)
  join ops.wip_items item
    on item.esb_product_id = 'SYNTH-ESB-P-1561-' || lpad(n::text, 3, '0');
-- A confirmed non-stock detail beside item 1 proves the ERP stock flag, not row order, selects the default.
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
   is_default, source_active, erp_is_stock, confirmed_at)
select '00000000-0000-0000-0000-000015610602', item.org_id, item.id, 'alternate unit',
       'SYNTH-ESB-PD-1561-001-ALT', item.esb_product_id, false, true, false, now()
  from ops.wip_items item
 where item.esb_product_id = 'SYNTH-ESB-P-1561-001';
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
select item.org_id, '00000000-0000-0000-0000-000015610301', 'bar', item.id, 'esb'
  from ops.wip_items item
 where item.org_id = '5a000000-0000-0000-0000-000000000001';

-- These rows represent manager-saved kinds, shown/default units and a custom name/factor; the load must preserve them.
insert into ops.cafe_item_settings
  (id, org_id, branch_id, activity, wip_item_id, mos_name, kind, is_active,
   created_at, updated_at, unit_multiples)
select case when item.esb_product_id = 'SYNTH-ESB-P-1561-001'
            then '00000000-0000-0000-0000-000015610801'::uuid
            else '00000000-0000-0000-0000-000015610802'::uuid end,
       item.org_id, '00000000-0000-0000-0000-000015610301', 'bar', item.id,
       case when item.esb_product_id = 'SYNTH-ESB-P-1561-001' then 'Manager chosen label' else null end,
       case when item.esb_product_id = 'SYNTH-ESB-P-1561-001' then 'WIP' else 'RAW' end,
       true, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z',
       array[]::numeric[]
  from ops.wip_items item
 where item.esb_product_id in ('SYNTH-ESB-P-1561-001', 'SYNTH-ESB-P-1561-002');
insert into ops.cafe_item_setting_units (id, org_id, cafe_item_setting_id, item_unit_id)
select case when setting.id = '00000000-0000-0000-0000-000015610801'
            then '00000000-0000-0000-0000-000015610901'::uuid
            else '00000000-0000-0000-0000-000015610902'::uuid end,
       setting.org_id, setting.id, unit.id
  from ops.cafe_item_settings setting
  join ops.item_units unit
    on unit.org_id = setting.org_id
   and unit.wip_item_id = setting.wip_item_id
   and unit.esb_product_detail_id = case when setting.id = '00000000-0000-0000-0000-000015610801'
                                         then 'SYNTH-ESB-PD-1561-001'
                                         else 'SYNTH-ESB-PD-1561-002' end
 where setting.id in ('00000000-0000-0000-0000-000015610801',
                      '00000000-0000-0000-0000-000015610802');
update ops.cafe_item_settings setting
   set default_item_unit_id = shown.item_unit_id
  from ops.cafe_item_setting_units shown
 where setting.id = shown.cafe_item_setting_id
   and setting.id in ('00000000-0000-0000-0000-000015610801',
                      '00000000-0000-0000-0000-000015610802');
-- Multiples need a default unit first, so the manager's factor is added after it.
update ops.cafe_item_settings set unit_multiples = array[2]::numeric[]
 where id = '00000000-0000-0000-0000-000015610801';

-- One row per "untouched" condition, each differing from the baseline in exactly one way, each with a
-- confirmed stock unit the load would otherwise act on: removing any one condition from the seed's
-- row fence makes its assertion fail. 803 has a later updated_at, 804 a manager kind, 805 a shown
-- unit, 806 a custom name.
insert into ops.cafe_item_settings
  (id, org_id, branch_id, activity, wip_item_id, mos_name, kind, is_active, created_at, updated_at, unit_multiples)
select ('00000000-0000-0000-0000-00001561080' || spec.n::text)::uuid, item.org_id,
       '00000000-0000-0000-0000-000015610301', 'bar', item.id,
       case when spec.n = 6 then 'Custom label' end,
       case when spec.n = 4 then 'RAW' end,
       false, '2000-01-01T00:00:00Z',
       case when spec.n = 3 then '2000-06-01T00:00:00Z'::timestamptz else '2000-01-01T00:00:00Z'::timestamptz end,
       array[]::numeric[]
  from (values (3), (4), (5), (6)) as spec(n)
  join ops.wip_items item on item.id = md5('cafe-item-defaults:1561:item:' || spec.n::text)::uuid;
insert into ops.cafe_item_setting_units (id, org_id, cafe_item_setting_id, item_unit_id)
select '00000000-0000-0000-0000-000015610905', setting.org_id, setting.id, unit.id
  from ops.cafe_item_settings setting
  join ops.item_units unit on unit.org_id = setting.org_id and unit.wip_item_id = setting.wip_item_id
 where setting.id = '00000000-0000-0000-0000-000015610805'
   and unit.esb_product_detail_id = 'SYNTH-ESB-PD-1561-005';

create function pg_temp.sample_settings_checksum() returns text
language sql set search_path = '' as $$
  select md5(jsonb_build_object(
    'settings', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.id)
                            from ops.cafe_item_settings row_data
                           where row_data.org_id = '5a000000-0000-0000-0000-000000000001'), '[]'::jsonb),
    'shown', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.id)
                         from ops.cafe_item_setting_units row_data
                        where row_data.org_id = '5a000000-0000-0000-0000-000000000001'), '[]'::jsonb)
  )::text)
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
                          where row_data.org_id = '5a000000-0000-0000-0000-000000000001'), '[]'::jsonb)
  )::text)
$$;
create function pg_temp.sample_operational_counts() returns jsonb
language sql set search_path = '' as $$
  select jsonb_build_object(
    'log_entries', (select count(*) from ops.log_entries where org_id = '5a000000-0000-0000-0000-000000000001'),
    'kitchen_logs', (select count(*) from ops.kitchen_logs where org_id = '5a000000-0000-0000-0000-000000000001'),
    'kitchen_plans', (select count(*) from ops.kitchen_plans where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receipts', (select count(*) from ops.cafe_receipts where org_id = '5a000000-0000-0000-0000-000000000001'),
    'requests', (select count(*) from ops.cafe_purchase_requests where org_id = '5a000000-0000-0000-0000-000000000001'),
    'outbox', (select count(*) from integrations.esb_push where org_id = '5a000000-0000-0000-0000-000000000001'),
    'receipt_photos', (select count(*) from storage.objects where bucket_id = 'cafe-receipt-photos'),
    'waste_photos', (select count(*) from storage.objects where bucket_id = 'waste-photos')
  )
$$;
create function pg_temp.item_page_needs_unit_count() returns integer
language sql set search_path = '' as $$
  select count(*)::integer
    from (
      select read.item_id,
             bool_or(read.item_unit_id = read.default_item_unit_id and read.unit_is_default) as has_default
        from ops.cafe_item_settings_read read
       where read.branch_id = '00000000-0000-0000-0000-000015610301'
         and read.activity = 'bar'
       group by read.item_id
    ) item_page
   where not coalesce(item_page.has_default, false)
$$;

select is((select shared.is_sample_org('5a000000-0000-0000-0000-000000000001'::uuid)
                    and shared.is_sample_org_shape('5a000000-0000-0000-0000-000000000001'::uuid, 'Gordi Sample')),
          true, 'fixture has the guarded sample id, name, flag and sample-address shape');
select is((select count(*)::int from ops.stream_items
            where org_id = '5a000000-0000-0000-0000-000000000001'
              and branch_id = '00000000-0000-0000-0000-000015610301' and activity = 'bar'),
          168, 'the realistic Bar stream fixture contains 168 catalog items');
select is(pg_temp.item_page_needs_unit_count(), 166,
          'the Items page count starts at 166 because two manager-configured rows already have defaults');
select set_config('app.catalog_before', pg_temp.sample_catalog_checksum(), true);
select set_config('app.operations_before', pg_temp.sample_operational_counts()::text, true);
select set_config('app.manager_settings_before',
  (select jsonb_agg(to_jsonb(setting) order by setting.id)::text
     from ops.cafe_item_settings setting
    where setting.id in ('00000000-0000-0000-0000-000015610801', '00000000-0000-0000-0000-000015610802',
                         '00000000-0000-0000-0000-000015610803', '00000000-0000-0000-0000-000015610804',
                         '00000000-0000-0000-0000-000015610805', '00000000-0000-0000-0000-000015610806')), true);

\ir ../seed.sample-org-item-settings.sql

select is((select count(distinct item_id)::int from ops.cafe_item_settings_read
            where branch_id = '00000000-0000-0000-0000-000015610301'
              and activity = 'bar' and kind = 'WIP'),
          55, 'WIP is the manager-set row plus the 54 untouched BOM outputs (sample test data)');
select is((select count(distinct item_id)::int from ops.cafe_item_settings_read
            where branch_id = '00000000-0000-0000-0000-000015610301'
              and activity = 'bar' and kind = 'RAW'),
          100, 'RAW is the two manager-set rows (a BOM output the manager called RAW stays RAW) plus the 98 non-outputs');
select is((select count(distinct item_id)::int from ops.cafe_item_settings_read
            where branch_id = '00000000-0000-0000-0000-000015610301'
              and activity = 'bar' and kind is null),
          13, 'unknown BOM evidence and untouched-looking manager rows stay Unclassified');
select is((select count(distinct item_id)::int from ops.cafe_item_settings_read
            where branch_id = '00000000-0000-0000-0000-000015610301'
              and activity = 'bar' and is_active and kind is null),
          0, 'every active item in the sample org has a kind');
select is((select count(distinct item_id)::int from ops.cafe_item_settings_read
            where branch_id = '00000000-0000-0000-0000-000015610301'
              and activity = 'bar' and is_active),
          154, 'only untouched items with a confirmed ERP stock unit are activated');
select is((select count(distinct item_id)::int from ops.cafe_item_settings_read
            where branch_id = '00000000-0000-0000-0000-000015610301'
              and activity = 'bar' and unit_is_default),
          154, 'each uniquely confirmed ERP stock unit is selected as the stream default');
select is(pg_temp.item_page_needs_unit_count(), 14,
          'the Items page count falls to the ten items without a confirmed unit plus the four manager-touched rows left alone');
select is(166 - pg_temp.item_page_needs_unit_count(), 152,
          'the Items page missing-unit count drops by exactly the 152 untouched settings filled');
select is((select count(*)::int from ops.item_units unit
            join ops.stream_items stream_item
              on stream_item.org_id = unit.org_id and stream_item.wip_item_id = unit.wip_item_id
           where stream_item.org_id = '5a000000-0000-0000-0000-000000000001'
             and stream_item.branch_id = '00000000-0000-0000-0000-000015610301'
             and stream_item.activity = 'bar' and unit.erp_is_stock
             and unit.confirmed_at is null),
          10, 'the ten items without a confirmed stock unit stay without a default');
select is((select count(*)::int from ops.cafe_item_settings setting
            join ops.item_units unit on unit.id = setting.default_item_unit_id
           where setting.org_id = '5a000000-0000-0000-0000-000000000001'
             and unit.confirmed_at is null),
          0, 'no unconfirmed stock detail is made a default');
select is((select unit.esb_product_detail_id
             from ops.cafe_item_settings setting
             join ops.item_units unit on unit.id = setting.default_item_unit_id
            where setting.org_id = '5a000000-0000-0000-0000-000000000001'
              and setting.wip_item_id = md5('cafe-item-defaults:1561:item:7')::uuid),
          'SYNTH-ESB-PD-1561-007', 'a new default is the unique confirmed ERP stock detail, not an inferred unit');
select is((select jsonb_agg(to_jsonb(setting) order by setting.id)::text
             from ops.cafe_item_settings setting
            where setting.id in ('00000000-0000-0000-0000-000015610801', '00000000-0000-0000-0000-000015610802',
                                 '00000000-0000-0000-0000-000015610803', '00000000-0000-0000-0000-000015610804',
                                 '00000000-0000-0000-0000-000015610805', '00000000-0000-0000-0000-000015610806')),
          current_setting('app.manager_settings_before'),
          'every manager-touched row (saved values, later edit, kind, shown unit, custom name) is unchanged');
select is(pg_temp.sample_catalog_checksum(), current_setting('app.catalog_before'),
          'item, ERP-unit and stream catalog rows are unchanged');
select is(pg_temp.sample_operational_counts(), current_setting('app.operations_before')::jsonb,
          'the load adds no logs, plans, receipts, requests, photos or outbox rows');

select set_config('request.jwt.claims',
  '{"org_id":"5a000000-0000-0000-0000-000000000001","person_id":"00000000-0000-0000-0000-000015610101","access_roles":["member"]}', true);
set local role authenticated;
select is((select count(distinct item_id)::int from ops.cafe_item_settings_read
            where branch_id = '00000000-0000-0000-0000-000015610301'
              and activity = 'bar' and is_active and kind = 'WIP' and unit_is_default),
          55, 'the Bar Log read exposes every WIP with its default unit');
select is((select count(*)::int from ops.cafe_countable_items(
             '00000000-0000-0000-0000-000015610301', 'bar')),
          154, 'the Bar Count read exposes every active classified item with a confirmed unit');
select ok(exists (
  select 1 from ops.cafe_countable_items('00000000-0000-0000-0000-000015610301', 'bar') item
   where item.item_name = 'Synthetic Bar item 002' and item.item_kind = 'RAW'
), 'the Bar Count read retains the manager-set kind');
select is((select count(*)::int from ops.cafe_receivable_items(
             '00000000-0000-0000-0000-000015610301', 'bar')),
          154, 'the shared Bar Receive and Request read lists active confirmed ERP stock items');
select ok(exists (
  select 1 from ops.cafe_receivable_items('00000000-0000-0000-0000-000015610301', 'bar') item
   where item.item_name = 'Synthetic Bar item 007' and item.is_default_unit
), 'the Bar Receive and Request read exposes a prefilled default item');
reset role;
select set_config('request.jwt.claims', '{}', true);

select set_config('app.settings_before_rerun', pg_temp.sample_settings_checksum(), true);
select set_config('app.settings_count_before_rerun',
  (select count(*)::text from ops.cafe_item_settings
    where org_id = '5a000000-0000-0000-0000-000000000001'), true);
select pg_temp.prefill_cafe_item_settings();
select is(pg_temp.sample_settings_checksum(), current_setting('app.settings_before_rerun'),
          'an idempotent second run leaves every setting and shown-unit row unchanged');
select is((select count(*)::text from ops.cafe_item_settings
            where org_id = '5a000000-0000-0000-0000-000000000001'),
          current_setting('app.settings_count_before_rerun'),
          'an idempotent second run creates no duplicate setting rows');

select set_config('app.settings_before_refusal', pg_temp.sample_settings_checksum(), true);
-- The flag is protected by a trigger; bypass it only to prove the load itself refuses an unflagged target.
set local session_replication_role = replica;
update shared.orgs set is_sample = false
 where id = '5a000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
select throws_ok($$select pg_temp.prefill_cafe_item_settings()$$,
  '42501', 'seed.sample-org-item-settings: refused, target is not the sample organisation',
  'a target without the sample flag is refused');
set local session_replication_role = replica;
update shared.orgs set is_sample = true
 where id = '5a000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
select is(pg_temp.sample_settings_checksum(), current_setting('app.settings_before_refusal'),
          'a non-sample-target refusal writes no setting rows');
insert into integrations.esb_push (org_id, source_ref, endpoint, target_env, dedup_key)
values ('5a000000-0000-0000-0000-000000000001', 'SAMPLE-ITEM-SETTINGS-1561', 'simple-transfer', 'goo',
        'sample-item-settings-1561|goo');
select set_config('app.sample_item_settings_push_id',
  (select id::text from integrations.esb_push where source_ref = 'SAMPLE-ITEM-SETTINGS-1561'), true);
select is((select target_env || ':' || (dedup_key like '%|dry_run')::text
             from integrations.esb_push where source_ref = 'SAMPLE-ITEM-SETTINGS-1561'),
          'dry_run:true', 'the existing sample-org ERP guard forces attempted posts to dry_run');
set local role service_role;
select throws_ok(format('select * from integrations.claim_esb_pushes(array[%L::uuid])',
                        current_setting('app.sample_item_settings_push_id')),
  '42501', 'the sample organisation never sends anything to the ERP',
  'the worker refuses to claim a sample-org post');
reset role;
delete from integrations.esb_push
 where id = current_setting('app.sample_item_settings_push_id')::uuid;

select * from finish();
rollback;
