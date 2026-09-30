-- Change history batch 2a — the task cascade (#986), on the registry mechanism of 20260930000040_shared_record_history_registry.sql
-- (ADR-0059, DA-3). This migration ONLY creates the batch's reader functions, registers them in
-- shared.record_history_readers and attaches the one generic trigger; it does not replace the
-- read dispatch, so batches are order-independent and none can drop another's arms.
-- The reader bodies and trigger registrations are the batch's reviewed arms, ported unchanged
-- from the batch's tip (feat/986-*).
--
--   mos.tasks                    — the one table-specific mechanical exclude lives here:
--                                  '-last_activity_at' omits the clock mos._touch_task_last_activity
--                                  bumps whenever a task_event lands (and any direct clock write);
--                                  no human edits it, so it is never a change. The default uuid id
--                                  key applies. Real columns changed by the same statement still
--                                  record normally.
--   mos.task_checklist_items, mos.process_cadences, mos.process_task_defs, mos.process_runs,
--   mos.process_run_pending_tasks — plain registrations; the default uuid id key and the built-in
--                                  exclude list (id / org_id / created_at / updated_at) are the
--                                  whole registration.
--
-- None of the six hard-deletes — authenticated holds select/insert/update at most
-- (20260805000006_mos_access_control.sql), and the runs + pending rows are select-only — so the
-- DELETE branch stays inert for this batch and no delete arm is registered: a delete row, if one
-- ever existed, fails closed until its snapshot arm is wired.
--
-- DOWN (drop the observers first, then the registry rows, then the readers they name):
--   drop trigger record_history_tasks on mos.tasks;
--   drop trigger record_history_task_checklist_items on mos.task_checklist_items;
--   drop trigger record_history_process_cadences on mos.process_cadences;
--   drop trigger record_history_process_task_defs on mos.process_task_defs;
--   drop trigger record_history_process_runs on mos.process_runs;
--   drop trigger record_history_process_run_pending_tasks on mos.process_run_pending_tasks;
--   delete from shared.record_history_readers where (schema_name, table_name) in (
--     ('mos','tasks'), ('mos','task_checklist_items'), ('mos','process_cadences'), ('mos','process_task_defs'), ('mos','process_runs'), ('mos','process_run_pending_tasks'));
--   drop function shared._history_reader_mos_tasks(text, text, jsonb);
--   drop function shared._history_reader_mos_task_checklist_items(text, text, jsonb);
--   drop function shared._history_reader_mos_process_cadences(text, text, jsonb);
--   drop function shared._history_reader_mos_process_task_defs(text, text, jsonb);
--   drop function shared._history_reader_mos_process_runs(text, text, jsonb);
--   drop function shared._history_reader_mos_process_run_pending_tasks(text, text, jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Reader functions — one per table, the table's own read predicate
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function shared._history_reader_mos_tasks(
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
      select 1 from mos.tasks t
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and t.id = p_record_key::uuid
        and t.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_tasks(text, text, jsonb) is
  'History read predicate for mos.tasks (#986): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_task_checklist_items(
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
      select 1 from mos.task_checklist_items c
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and c.id = p_record_key::uuid
        and c.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_task_checklist_items(text, text, jsonb) is
  'History read predicate for mos.task_checklist_items (#986): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_process_cadences(
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
      select 1 from mos.process_cadences pc
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and pc.id = p_record_key::uuid
        and pc.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_process_cadences(text, text, jsonb) is
  'History read predicate for mos.process_cadences (#986): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_process_task_defs(
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
      select 1 from mos.process_task_defs pd
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and pd.id = p_record_key::uuid
        and pd.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_process_task_defs(text, text, jsonb) is
  'History read predicate for mos.process_task_defs (#986): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_process_runs(
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
      select 1 from mos.process_runs pr
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and pr.id = p_record_key::uuid
        and pr.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_process_runs(text, text, jsonb) is
  'History read predicate for mos.process_runs (#986): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_process_run_pending_tasks(
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
      select 1 from mos.process_run_pending_tasks pp
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and pp.id = p_record_key::uuid
        and pp.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_process_run_pending_tasks(text, text, jsonb) is
  'History read predicate for mos.process_run_pending_tasks (#986): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

revoke execute on function shared._history_reader_mos_tasks(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_tasks(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_task_checklist_items(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_task_checklist_items(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_process_cadences(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_process_cadences(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_process_task_defs(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_process_task_defs(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_process_runs(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_process_runs(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_process_run_pending_tasks(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_process_run_pending_tasks(text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Registry rows
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('mos', 'tasks', 'shared._history_reader_mos_tasks(text, text, jsonb)'),
  ('mos', 'task_checklist_items', 'shared._history_reader_mos_task_checklist_items(text, text, jsonb)'),
  ('mos', 'process_cadences', 'shared._history_reader_mos_process_cadences(text, text, jsonb)'),
  ('mos', 'process_task_defs', 'shared._history_reader_mos_process_task_defs(text, text, jsonb)'),
  ('mos', 'process_runs', 'shared._history_reader_mos_process_runs(text, text, jsonb)'),
  ('mos', 'process_run_pending_tasks', 'shared._history_reader_mos_process_run_pending_tasks(text, text, jsonb)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Wire the observer triggers
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create trigger record_history_tasks
  after insert or update or delete on mos.tasks
  for each row execute function shared._record_history_write('-last_activity_at');

create trigger record_history_task_checklist_items
  after insert or update or delete on mos.task_checklist_items
  for each row execute function shared._record_history_write();

create trigger record_history_process_cadences
  after insert or update or delete on mos.process_cadences
  for each row execute function shared._record_history_write();

create trigger record_history_process_task_defs
  after insert or update or delete on mos.process_task_defs
  for each row execute function shared._record_history_write();

create trigger record_history_process_runs
  after insert or update or delete on mos.process_runs
  for each row execute function shared._record_history_write();

create trigger record_history_process_run_pending_tasks
  after insert or update or delete on mos.process_run_pending_tasks
  for each row execute function shared._record_history_write();
