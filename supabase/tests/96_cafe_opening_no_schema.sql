-- AC-701 (FR-701/NFR-701/RATIFY-7B): the café-opening seed maps onto the Step-6 occurrence runtime with
-- NO kitchen-schema change — no new mos.* occurrence table, no ops.kitchen_* column/table added or removed.
-- Fixture: 20260717000004_mos_cafe_opening_test_seed.sql (mos._test_seed_cafe_opening()).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_cafe_opening();

-- The "Café Opening" process exists (type=process), owned by BU Unit-1, with a daily cadence.
select is((select count(*)::int from mos.work_lines
             where org_id = '00000000-0000-0000-0000-0000000000a1'
               and type = 'process' and name = 'Café Opening'),
          1, 'AC-701: exactly one type=process work_line named Café Opening');
select is((select cadence_kind from mos.process_cadences
             where work_line_id = '00000000-0000-0000-0000-00000000c001'),
          'daily', 'AC-701: the Café Opening process has a daily cadence');
select is((select count(*)::int from mos.process_task_defs
             where work_line_id = '00000000-0000-0000-0000-00000000c001' and archived_at is null),
          3, 'AC-701: exactly 3 active café-opening task defs (ca01/ca02/ca03)');

-- RATIFY-7B: no kitchen-schema bridge — ops.kitchen_logs carries no process_run_id column.
select hasnt_column('ops', 'kitchen_logs', 'process_run_id',
  'AC-701/RATIFY-7B: ops.kitchen_logs has NO process_run_id bridge column (no-schema retrofit)');

-- The kitchen tables are intact/unchanged (their pre-existing columns still present).
select has_column('ops', 'kitchen_logs', 'batch_id',
  'AC-701: ops.kitchen_logs.batch_id is unchanged (kitchen lifecycle intact)');
select has_column('ops', 'kitchen_plans', 'qty_porsi',
  'AC-701: ops.kitchen_plans.qty_porsi is unchanged (kitchen lifecycle intact)');

-- No fifth occurrence table was invented by the retrofit — Step 6's four stand alone.
select hasnt_table('mos', 'cafe_openings',
  'AC-701/NFR-701: no new mos.cafe_openings table was invented by the retrofit');
select has_table('mos', 'process_runs', 'AC-701: the Step-6 process_runs table is the only occurrence table used');

select * from finish();
rollback;
