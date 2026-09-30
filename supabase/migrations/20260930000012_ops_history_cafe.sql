-- Change history batch 2e — Café / kitchen (#990), on the registry mechanism of 20260930000007_shared_record_history_registry.sql
-- (ADR-0059, DA-3). This migration ONLY creates the batch's reader functions, registers them in
-- shared.record_history_readers and attaches the one generic trigger; it does not replace the
-- read dispatch, so batches are order-independent and none can drop another's arms.
-- The reader bodies and trigger registrations are the batch's reviewed arms, ported unchanged
-- from the batch's tip (feat/990-*).
--
-- The seven uuid-id tables — ops.log_entries, ops.kitchen_logs, ops.kitchen_plans, ops.wip_items,
-- ops.item_units, ops.stream_completeness, ops.stream_items — take the bare registration (default
-- id key, built-in exclude list). Every one of them carries a PLAIN org-membership SELECT policy,
-- verified against the live migrations and unchanged by every later one:
--   log_entries_select_org, wip_items_select_org, kitchen_plans_select_org,
--   kitchen_logs_select_org  (20260805000010)   item_units_select_org   (20260807000001)
--   stream_completeness_select_org (20260812000002)
--   stream_items_select_org  (20260924000002 — org_id = current_org_id() AND is_org_member(),
--                              and is_org_member() is exactly "current_org_id() is not null")
-- so each arm is that predicate over a live lookup by record_key, with the guarded uuid cast that
-- preserves the PK index. No table in this batch is role-gated on SELECT; the batch adds no
-- composite keys (DA-1) and skips nothing.
--
-- EXCLUDES (the per-table mechanical-clock review):
--   ops.kitchen_logs '-reviewed_at' — stamped server-side (ops._guard_kitchen_log on
--     Submitted→Rejected, the approval function on →Approved) beside the fields that record the
--     review itself; the review is a HUMAN action and stays RECORDED through status, review_note
--     and reviewed_by. The clock is the signals.edited_at precedent.
--   ops.kitchen_logs '-posted_at' — stamped by the ERP dispatch path (the definer approval path /
--     the service_role worker) beside posted_to_esb and esb_doc_num, which stay RECORDED: they are
--     the dispatch record. The timestamp is its mechanical companion.
--   Everything else: NO excludes. ops.log_entries.archived_at is a human archive action;
--     ops.item_units.confirmed_at and ops.stream_completeness.confirmed_at are server-STAMPED but
--     are the confirmation EVENT itself (the DD-WAY-29 gate predicate, and the only mutable content
--     on a stream-completeness row) — excluding them would erase exactly the human fact history
--     exists to keep. ops.kitchen_logs.batch_id is minted server-side but is an audit-meaningful
--     value, not a clock.
--
-- THE BATCH'S ONE HARD-DELETE with a wired arm: ops.stream_items — the only DELETE grant in the
-- schema's app tier (stream_items_delete_ops_lead_or_admin, org-scoped ops_lead/admin; removing an
-- item from a stream's list stops new capture there). Its delete row stays readable through the
-- SNAPSHOT arm: the org-wide stream_items_select_org predicate evaluated over the captured columns
-- (the role gate is the DELETE authority, not the read authority — a removed list entry remains
-- readable by the org that owned it), because the row itself is gone. Every other table in this
-- batch holds no DELETE grant and registers no delete arm: they fail closed (FR-013, NFR-007).
--
-- NFR-005 (performance) is proven in supabase/tests/ops_19_cafe_history.sql against
-- ops.kitchen_logs, the highest-volume audited table.
--
-- DOWN (drop the observers first, then the registry rows, then the readers they name):
--   drop trigger record_history_log_entries on ops.log_entries;
--   drop trigger record_history_kitchen_logs on ops.kitchen_logs;
--   drop trigger record_history_kitchen_plans on ops.kitchen_plans;
--   drop trigger record_history_wip_items on ops.wip_items;
--   drop trigger record_history_item_units on ops.item_units;
--   drop trigger record_history_stream_completeness on ops.stream_completeness;
--   drop trigger record_history_stream_items on ops.stream_items;
--   delete from shared.record_history_readers where (schema_name, table_name) in (
--     ('ops','log_entries'), ('ops','kitchen_logs'), ('ops','kitchen_plans'), ('ops','wip_items'), ('ops','item_units'), ('ops','stream_completeness'), ('ops','stream_items'));
--   drop function shared._history_reader_ops_log_entries(text, text, jsonb);
--   drop function shared._history_reader_ops_kitchen_logs(text, text, jsonb);
--   drop function shared._history_reader_ops_kitchen_plans(text, text, jsonb);
--   drop function shared._history_reader_ops_wip_items(text, text, jsonb);
--   drop function shared._history_reader_ops_item_units(text, text, jsonb);
--   drop function shared._history_reader_ops_stream_completeness(text, text, jsonb);
--   drop function shared._history_reader_ops_stream_items(text, text, jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Reader functions — one per table, the table's own read predicate
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function shared._history_reader_ops_log_entries(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.log_entries le
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and le.id = p_record_key::uuid
        and le.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_log_entries(text, text, jsonb) is
  'History read predicate for ops.log_entries (#990): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_ops_kitchen_logs(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.kitchen_logs kl
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and kl.id = p_record_key::uuid
        and kl.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_kitchen_logs(text, text, jsonb) is
  'History read predicate for ops.kitchen_logs (#990): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_ops_kitchen_plans(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.kitchen_plans kp
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and kp.id = p_record_key::uuid
        and kp.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_kitchen_plans(text, text, jsonb) is
  'History read predicate for ops.kitchen_plans (#990): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_ops_wip_items(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.wip_items wi
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and wi.id = p_record_key::uuid
        and wi.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_wip_items(text, text, jsonb) is
  'History read predicate for ops.wip_items (#990): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_ops_item_units(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.item_units iu
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and iu.id = p_record_key::uuid
        and iu.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_item_units(text, text, jsonb) is
  'History read predicate for ops.item_units (#990): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_ops_stream_completeness(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.stream_completeness sc
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and sc.id = p_record_key::uuid
        and sc.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_stream_completeness(text, text, jsonb) is
  'History read predicate for ops.stream_completeness (#990): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_ops_stream_items(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.stream_items si
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and si.id = p_record_key::uuid
        and si.org_id = shared.current_org_id());
  elsif p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
       and shared.is_org_member();
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_stream_items(text, text, jsonb) is
  'History read predicate for ops.stream_items (#990): the table''s own SELECT predicate over the live row '
  'for insert/update rows, and over the captured snapshot columns for delete rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

revoke execute on function shared._history_reader_ops_log_entries(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_ops_log_entries(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_ops_kitchen_logs(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_ops_kitchen_logs(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_ops_kitchen_plans(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_ops_kitchen_plans(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_ops_wip_items(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_ops_wip_items(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_ops_item_units(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_ops_item_units(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_ops_stream_completeness(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_ops_stream_completeness(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_ops_stream_items(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_ops_stream_items(text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Registry rows
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('ops', 'log_entries', 'shared._history_reader_ops_log_entries(text, text, jsonb)'::regprocedure),
  ('ops', 'kitchen_logs', 'shared._history_reader_ops_kitchen_logs(text, text, jsonb)'::regprocedure),
  ('ops', 'kitchen_plans', 'shared._history_reader_ops_kitchen_plans(text, text, jsonb)'::regprocedure),
  ('ops', 'wip_items', 'shared._history_reader_ops_wip_items(text, text, jsonb)'::regprocedure),
  ('ops', 'item_units', 'shared._history_reader_ops_item_units(text, text, jsonb)'::regprocedure),
  ('ops', 'stream_completeness', 'shared._history_reader_ops_stream_completeness(text, text, jsonb)'::regprocedure),
  ('ops', 'stream_items', 'shared._history_reader_ops_stream_items(text, text, jsonb)'::regprocedure);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Wire the observer triggers
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create trigger record_history_log_entries
  after insert or update or delete on ops.log_entries
  for each row execute function shared._record_history_write();

create trigger record_history_kitchen_logs
  after insert or update or delete on ops.kitchen_logs
  for each row execute function shared._record_history_write('-reviewed_at', '-posted_at');

create trigger record_history_kitchen_plans
  after insert or update or delete on ops.kitchen_plans
  for each row execute function shared._record_history_write();

create trigger record_history_wip_items
  after insert or update or delete on ops.wip_items
  for each row execute function shared._record_history_write();

create trigger record_history_item_units
  after insert or update or delete on ops.item_units
  for each row execute function shared._record_history_write();

create trigger record_history_stream_completeness
  after insert or update or delete on ops.stream_completeness
  for each row execute function shared._record_history_write();

create trigger record_history_stream_items
  after insert or update or delete on ops.stream_items
  for each row execute function shared._record_history_write();
