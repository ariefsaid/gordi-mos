-- #1377 AC-035: physical Counts do not change either calculated Stock read or its backing facts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);
update ops.item_units unit set erp_is_stock = true, esb_product_id = item.esb_product_id
from ops.wip_items item where item.id = unit.wip_item_id
  and item.org_id = '00000000-0000-0000-0000-0000000000a1';
update ops.item_units set confirmed_at = now()
where org_id = '00000000-0000-0000-0000-0000000000a1';
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select org_id, '00000000-0000-0000-0000-0000000000d5', id, true, current_date - 1
from shared.teams where code = 'rumah_rames_kitchen' and org_id = '00000000-0000-0000-0000-0000000000a1';

-- Audit even no-op writes, not just a before/after quantity comparison.
create temporary table stock_writes (table_name text);
create function pg_temp.audit_stock_write() returns trigger language plpgsql security definer as $$
begin
  insert into pg_temp.stock_writes values (tg_table_name);
  return null;
end;
$$;
create trigger count_proof_stock_write after insert or update or delete on ops.kitchen_stock
  for each statement execute function pg_temp.audit_stock_write();
create trigger count_proof_log_write after insert or update or delete on ops.kitchen_logs
  for each statement execute function pg_temp.audit_stock_write();
grant select on pg_temp.stock_writes to authenticated;

create function pg_temp.read_stock() returns jsonb language sql security invoker as $$
  select jsonb_agg(to_jsonb(balance) order by branch_id, activity, as_of, wip_item_id)
  from (
    select team.branch_id, team.activity, dates.as_of, stock.*
    from shared.teams team
    cross join (values ('2026-06-19'::date), ((now() at time zone 'Asia/Jakarta')::date),
      ((now() at time zone 'Asia/Jakarta')::date + 1)) dates(as_of)
    cross join lateral ops.kitchen_stock_for_date(dates.as_of, team.branch_id, team.activity) stock
    where team.org_id = shared.current_org_id() and team.branch_id is not null and team.activity is not null
  ) balance
$$;
create function pg_temp.stock_unchanged(p_phase text) returns setof text language plpgsql security invoker as $$
begin
  return next is(pg_temp.read_stock(), current_setting('app.stock_before')::jsonb,
    'AC-035 ' || p_phase || ': calculated Stock is identical without and with Counts');
  return next is((select count(*)::int from pg_temp.stock_writes), 0,
    'AC-035 ' || p_phase || ': no write touches stored Stock or production facts');
end;
$$;
create function pg_temp.submit(p_item text) returns uuid language sql as $$
  select (ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf02', 'kitchen',
    jsonb_build_array(jsonb_build_object('client_key', gen_random_uuid(),
      'item_id', '00000000-0000-0000-0000-00000000' || p_item, 'quantity', '100'))) -> 0 ->> 'line_id')::uuid
$$;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_count_lines), 0, 'AC-035 baseline has no physical Counts');
select is(ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01',
  (now() at time zone 'Asia/Jakarta')::date + 1, '00000000-0000-0000-0000-00000000bf02', 'kitchen'),
  17::numeric, 'AC-035 baseline calculated balance is non-zero, not an empty-read equality');
select set_config('app.stock_before', pg_temp.read_stock()::text, true);
select set_config('app.held', pg_temp.submit('ab01')::text, true);
select set_config('app.zero', pg_temp.submit('ab02')::text, true);
select set_config('app.rejected', pg_temp.submit('ab03')::text, true);
select is((select count(*)::int from ops.cafe_count_lines where status = 'Submitted' and expected_status = 'waiting'),
  3, 'AC-035 the floor submits three Counts that differ from calculated Stock');
select * from pg_temp.stock_unchanged('Submitted, waiting for Expected');

reset role;
set local role service_role;
select ops.record_cafe_count_expected_balance(current_setting('app.held')::uuid, 50);
select ops.record_cafe_count_expected_balance(current_setting('app.zero')::uuid, 100);
reset role;
set local role authenticated;
select * from pg_temp.stock_unchanged('Expected snapshot recorded');
select ops.record_cafe_count_recount(current_setting('app.held')::uuid, 90);
select * from pg_temp.stock_unchanged('Recount recorded');
select ops.record_cafe_count_reason(current_setting('app.held')::uuid, 'Selisih setelah hitung ulang');
select * from pg_temp.stock_unchanged('reason recorded');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is(ops.confirm_cafe_count_line(current_setting('app.held')::uuid, 4) ->> 'posting_status', 'held',
  'AC-035 non-zero Variance confirms held');
select * from pg_temp.stock_unchanged('Confirmed, held');
select is(ops.confirm_cafe_count_line(current_setting('app.zero')::uuid, 2) ->> 'posting_status', 'not_needed',
  'AC-035 zero Variance confirms not needed');
select * from pg_temp.stock_unchanged('Confirmed, not needed');
select is(ops.reject_cafe_count_line(current_setting('app.rejected')::uuid, 1, 'Count again') ->> 'status', 'Rejected',
  'AC-035 reviewer rejects the third Count');
select * from pg_temp.stock_unchanged('Rejected');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.held')::uuid, 'late change')$$,
  'P0018', 'CAFE_COUNT_LINE_NOT_SUBMITTED', 'AC-035 frozen Count refuses further writes');
select * from pg_temp.stock_unchanged('refused write to a frozen Count');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf02', true);
select * from pg_temp.stock_unchanged('posting switch enabled');
select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf02', false);
select * from pg_temp.stock_unchanged('posting switch disabled');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 0,
  'AC-035 Count writes and switching do not create production outbox rows');

select * from finish();
rollback;
