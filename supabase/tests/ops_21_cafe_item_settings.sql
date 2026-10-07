-- #1242 — per-stream MOS item names and ERP product-detail choices.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create function pg_temp.approve_kitchen_log(p_log_id uuid, p_review_note text)
returns text language sql as $$
  select ops.approve_kitchen_log(p_log_id, p_review_note,
    (select l.updated_at from ops.kitchen_logs l where l.id = p_log_id))
$$;

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- The same access role means different things depending on the manager's org position: only a
-- manager whose assigned position has a Kitchen scope edits Kitchen item settings.
insert into shared.business_units (id, org_id, name, code)
values ('00000000-0000-0000-0000-00000000bb42',
        '00000000-0000-0000-0000-0000000000a1', 'Other unit', 'settings_test_other');
insert into shared.roles (id, org_id, business_unit_id, name) values
  ('00000000-0000-0000-0000-00000000c421', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000bb01', 'Retail Ops settings manager'),
  ('00000000-0000-0000-0000-00000000c422', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000bb42', 'Other unit settings manager');
update shared.roles set cafe_item_settings_scope='kitchen' where id='00000000-0000-0000-0000-00000000c421';
insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-00000000c421'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-00000000c422');

select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1242-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1242-WIP-A","name":"Synthetic WIP 1242","category":"KITCHEN","unit_name":"ERP pack","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"},
  {"esb_product_id":"SYNTH-ERP-P-1242-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1242-WIP-B","name":"Synthetic WIP 1242","category":"KITCHEN","unit_name":"ERP each","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"},
  {"esb_product_id":"SYNTH-ERP-P-1242-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1242-RAW-A","name":"Synthetic RAW 1242","category":"KITCHEN","unit_name":"ERP kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true,"branch_code":"gordi_hq"}
]$source$::jsonb);
update ops.item_units set confirmed_at=now()
 where esb_product_detail_id in ('SYNTH-ERP-PD-1242-WIP-A','SYNTH-ERP-PD-1242-WIP-B','SYNTH-ERP-PD-1242-RAW-A');
insert into ops.wip_items (
  id, org_id, name, category, flag_active, esb_product_id, kind, reference_source,
  erp_category_type_name, has_active_bom_output
) values (
  '00000000-0000-0000-0000-00000000c425', '00000000-0000-0000-0000-0000000000a1',
  'Synthetic WIP without details', 'Kitchen', true, 'SYNTH-ERP-P-1242-NO-DETAILS',
  null, 'erp_catalog', 'Inventory', true
);
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01',
        'kitchen', '00000000-0000-0000-0000-00000000c425', 'esb');
select set_config('app.allow_test_seeds', 'off', true);

select has_table('ops', 'cafe_item_settings', 'stream item MOS names and defaults have their own relation');
select has_table('ops', 'cafe_item_setting_units', 'shown ERP details are normalized and refer to existing item units');
select has_view('ops', 'cafe_item_settings_read', 'the settings and log-list reader is a database read view');
select ok(
  not exists (select 1 from information_schema.columns
               where table_schema = 'ops' and table_name = 'cafe_item_settings_read'
                 and column_name in ('esb_product_id', 'esb_product_detail_id')),
  'the client-facing settings view contains no ERP product or product-detail identifier columns');
select ok(to_regprocedure('ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[])') is null,
  'the name/unit-only compatibility overload is retired');
select has_function('ops', 'save_cafe_item_settings',
  ARRAY['uuid','text','uuid','text','uuid','uuid[]','text','boolean'],
  'the explicit kind/active save RPC remains available');
select is((select count(*)::int from ops.cafe_item_settings_read
            where item_id = '00000000-0000-0000-0000-00000000c425'
              and branch_id = '00000000-0000-0000-0000-00000000bf01'
              and item_unit_id is null and not unit_is_default and not unit_is_shown), 1,
  'the settings reader retains an ERP item that currently has no active product details');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","manager"]}');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Manager item name',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
    array[
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-B')
    ],
    'WIP', true
  )
$$, 'a Kitchen manager can atomically choose a MOS name, kind, active status, default and shown ERP details for one stream');
select is((select mos_name from ops.cafe_item_settings_read
            where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
            limit 1), 'Manager item name',
  'the read view returns the saved MOS name beside its read-only ERP name');
select is((select erp_name from ops.cafe_item_settings_read
            where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
            limit 1), 'Synthetic WIP 1242',
  'the ERP-sourced name remains independently readable after a MOS rename');

select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Manager renamed item',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
    array[
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-B')
    ], 'WIP', true
  )
$$, 'editing a configured item keeps the same per-stream selections');
select is((select old_value from shared.record_history
            where schema_name = 'ops' and table_name = 'cafe_item_settings'
              and field_name = 'mos_name'
              and record_key = (select id::text from ops.cafe_item_settings
                                 where wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
                                   and branch_id = '00000000-0000-0000-0000-00000000bf01')
            order by occurred_at desc limit 1), 'Manager item name',
  'the existing history records the old MOS name');
select is((select new_value from shared.record_history
            where schema_name = 'ops' and table_name = 'cafe_item_settings'
              and field_name = 'mos_name'
              and record_key = (select id::text from ops.cafe_item_settings
                                 where wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
                                   and branch_id = '00000000-0000-0000-0000-00000000bf01')
            order by occurred_at desc limit 1), 'Manager renamed item',
  'the existing history records the new MOS name');
select is((select actor_person_id::text from shared.record_history
            where schema_name = 'ops' and table_name = 'cafe_item_settings'
              and field_name = 'mos_name'
              and record_key = (select id::text from ops.cafe_item_settings
                                 where wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
                                   and branch_id = '00000000-0000-0000-0000-00000000bf01')
            order by occurred_at desc limit 1), '00000000-0000-0000-0000-0000000000d1',
  'the name change history attributes the manager');
select cmp_ok((select count(*)::int from shared.record_history
                where schema_name = 'ops' and table_name = 'cafe_item_setting_units'
                  and action = 'insert'), '>=', 2,
  'each shown ERP-detail selection is recorded by the existing change-history trigger');
select ok((select bool_and(unit_is_shown) and bool_or(unit_is_default)
             from ops.cafe_item_settings_read
            where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
              and branch_id = '00000000-0000-0000-0000-00000000bf01'),
  'both ERP details are shown and exactly one is the stream default');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}');
select ok(not ops.can_manage_cafe_item_settings('kitchen'),
  'an ordinary member cannot edit settings');
select cmp_ok((select count(*)::int from ops.cafe_item_settings_read
                where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')),
              '>', 0, 'ordinary members can read per-stream settings and unit choices');
update ops.cafe_item_settings set mos_name = 'Member attempt'
 where wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
   and branch_id = '00000000-0000-0000-0000-00000000bf01';
select is((select mos_name from ops.cafe_item_settings_read
            where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
              and branch_id = '00000000-0000-0000-0000-00000000bf01'
            limit 1), 'Manager renamed item',
  'RLS refuses a member edit without revealing a write path');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","supervisor"]}');
select ok(not ops.can_manage_cafe_item_settings('kitchen'),
  'supervisor review access alone does not grant item-settings write access');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","manager"]}');
select ok(not ops.can_manage_cafe_item_settings('kitchen'),
  'a manager assigned outside Retail Ops is not a relevant Café editor');
select throws_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Wrong business unit',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A')],
    'WIP', true
  )
$$, '42501', null, 'a manager outside Retail Ops cannot save Café settings');
select throws_ok($$
  insert into ops.item_units (org_id, wip_item_id, unit_name, esb_product_detail_id)
  values ('00000000-0000-0000-0000-0000000000a1',
          (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
          'MOS-created unit', 'SYNTH-ERP-PD-MOS-CREATED')
$$, '42501', null, 'a manager cannot create a unit or an ERP conversion in MOS');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","manager"]}');
select throws_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Bad default',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-B'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A')],
    'WIP', true
  )
$$, 'P0016', 'CAFE_DEFAULT_UNIT_MUST_BE_SHOWN: the default ERP detail must be shown',
  'the database refuses a default that is not among the shown details');
select throws_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Cross-item detail',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
    array[
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-RAW-A')
    ], 'WIP', true
  )
$$, '23514', 'shown details must be active ERP details of this item',
  'a manager cannot select another product''s ERP detail');
select ok(not has_table_privilege('authenticated', 'ops.cafe_item_setting_units', 'DELETE'),
  'the app tier cannot directly delete shown-unit settings');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Manager renamed item',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A')],
    'WIP', true
  )
$$, 'the authorized atomic save can hide an unused detail without app-tier DELETE');
select is((select count(*)::int from ops.cafe_item_settings_read
            where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP')
              and branch_id = '00000000-0000-0000-0000-00000000bf01'
              and unit_is_shown), 1,
  'the hidden detail is removed from the stream choices after the atomic save');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Ops lead edit',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
    array[
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-B')
    ], 'WIP', true
  )
$$, 'ops leads retain cross-stream item-settings authority');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Admin edit',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A')],
    'WIP', true
  )
$$, 'admins retain cross-stream item-settings authority');

select throws_ok($$
  insert into ops.kitchen_logs
    (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, item_unit_id, qty_porsi)
  values
    ('00000000-0000-0000-0000-00000000c421', '00000000-0000-0000-0000-00000000bb01',
     '2099-12-31', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce',
     (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
     (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-B'), 2)
$$, 'P0015', 'CAFE_ITEM_UNIT_NOT_SHOWN: Café capture must use the default ERP detail; select a configured multiple for another quantity',
  'a log cannot bind an ERP detail that is not the stream default');

reset role;
update ops.cafe_item_settings
   set default_item_unit_id = null
 where branch_id = '00000000-0000-0000-0000-00000000bf01'
   and activity = 'kitchen'
   and wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$
  insert into ops.kitchen_logs
    (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, item_unit_id, qty_porsi)
  values
    ('00000000-0000-0000-0000-00000000c422', '00000000-0000-0000-0000-00000000bb01',
     '2099-12-31', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce',
     (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
     (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'), 2)
$$, 'P0014', 'CAFE_ITEM_UNIT_NOT_CONFIGURED: select a shown default ERP detail before logging',
  'a WIP log is refused until the stream item has a default');

select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
    'Admin edit',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
    array[
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-B')
    ], 'WIP', true
  )
$$, 'a manager can restore a configured default and shown-unit set');
select throws_ok($$
  insert into ops.kitchen_logs
    (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, item_unit_id, qty_porsi)
  values
    ('00000000-0000-0000-0000-00000000c423', '00000000-0000-0000-0000-00000000bb01',
     '2099-12-31', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce',
     (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'),
     (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-B'), 3)
$$, 'P0015', 'CAFE_ITEM_UNIT_NOT_SHOWN: Café capture must use the default ERP detail; select a configured multiple for another quantity',
  'a shown alternate ERP detail cannot replace the default ERP coordinate');

insert into ops.kitchen_logs
  (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, item_unit_id, qty_porsi)
values
  ('00000000-0000-0000-0000-00000000c423', '00000000-0000-0000-0000-00000000bb01',
   '2099-12-31', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce',
   (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'), null, 3),
  ('00000000-0000-0000-0000-00000000c424', '00000000-0000-0000-0000-00000000bb01',
   '2099-12-31', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce',
   (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1242-WIP'), null, 4);
select is((select item_unit_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c424'),
          (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
  'a log without an explicit choice binds the per-stream default ERP detail');
select is((select item_unit_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c423'),
          (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1242-WIP-A'),
  'every Café capture binds the default ERP detail even when other details remain manager-visible');
select is(pg_temp.approve_kitchen_log('00000000-0000-0000-0000-00000000c423', 'checked'),
          'PR-20991231-001', 'approval retains the normal log and dispatch journey');
select is((select push.payload ->> 'esb_product_detail_id_porsi'
             from integrations.esb_push push
            where push.source_ref = 'PR-20991231-001'), 'SYNTH-ERP-PD-1242-WIP-A',
  'the outbox payload stays on the default ERP detail; the selected multiple changes quantity, not the ERP coordinate');

select * from finish();
rollback;
