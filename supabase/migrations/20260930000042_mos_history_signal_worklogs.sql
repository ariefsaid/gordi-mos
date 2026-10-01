-- Change history batch 2b — Signals & work items (#987), on the registry mechanism of 20260930000040_shared_record_history_registry.sql
-- (ADR-0059, DA-3). This migration ONLY creates the batch's reader functions, registers them in
-- shared.record_history_readers and attaches the one generic trigger; it does not replace the
-- read dispatch, so batches are order-independent and none can drop another's arms.
-- The reader bodies and trigger registrations are the batch's reviewed arms, ported unchanged
-- from the batch's tip (feat/987-*).
--
--   mos.signals                  — '-edited_at': the mechanical clock mos._guard_signals stamps
--                                  whenever a content edit lands is the companion of that edit's
--                                  own recorded rows (body / occurred_at / category / attention),
--                                  never a human change in itself — the tasks.last_activity_at
--                                  precedent. Retraction is NOT excluded: retracted_at /
--                                  retract_reason ARE the retraction's content. The default uuid
--                                  id key applies.
--   mos.weekly_updates           — '-submitted_at': the clock mos._guard_weekly_updates owns
--                                  server-side (status carries the change; the CHECK pins the
--                                  pair together, so the timestamp is pure derived noise).
--   mos.signal_mentions          — plain registrations; revoked_at stays recorded (revoking a
--   mos.signal_acknowledgements    mention is a real author-owned change). The default uuid id key
--   mos.signal_tasks              and the built-in exclude list (id / org_id / created_at /
--   mos.weekly_update_items       updated_at) are the whole registration for these.
--   mos.events                   — archived_at stays recorded: archiving is a human action, like
--                                  retraction.
--   mos.follow_ups               — plain registration; notes / promise_date and the transition
--                                  columns are the record's substance.
--
-- One hard-DELETE in this batch: mos.weekly_update_items holds the only authenticated DELETE grant
-- (own-author via mos.can_write_own_update, 20260805000006) — so it is the one table needing the
-- snapshot arm, registering the item's own SELECT predicate
-- (weekly_update_items_select_upward: org membership plus the parent update's upward read) against
-- the captured snapshot columns, with the parent read gate mos.can_read_weekly_update reused
-- verbatim. Every other table here is select/insert/update at most (signals retraction is soft and
-- "no DELETE anywhere" by comment contract; events, follow_ups and the rest hold no DELETE grant),
-- so a delete row for them, if one ever existed, fails closed until its snapshot arm is wired.
--
-- DOWN (drop the observers first, then the registry rows, then the readers they name):
--   drop trigger record_history_signals on mos.signals;
--   drop trigger record_history_signal_mentions on mos.signal_mentions;
--   drop trigger record_history_signal_acknowledgements on mos.signal_acknowledgements;
--   drop trigger record_history_signal_tasks on mos.signal_tasks;
--   drop trigger record_history_weekly_updates on mos.weekly_updates;
--   drop trigger record_history_weekly_update_items on mos.weekly_update_items;
--   drop trigger record_history_events on mos.events;
--   drop trigger record_history_follow_ups on mos.follow_ups;
--   delete from shared.record_history_readers where (schema_name, table_name) in (
--     ('mos','signals'), ('mos','signal_mentions'), ('mos','signal_acknowledgements'), ('mos','signal_tasks'), ('mos','weekly_updates'), ('mos','weekly_update_items'), ('mos','events'), ('mos','follow_ups'));
--   drop function shared._history_reader_mos_signals(text, text, jsonb);
--   drop function shared._history_reader_mos_signal_mentions(text, text, jsonb);
--   drop function shared._history_reader_mos_signal_acknowledgements(text, text, jsonb);
--   drop function shared._history_reader_mos_signal_tasks(text, text, jsonb);
--   drop function shared._history_reader_mos_weekly_updates(text, text, jsonb);
--   drop function shared._history_reader_mos_weekly_update_items(text, text, jsonb);
--   drop function shared._history_reader_mos_events(text, text, jsonb);
--   drop function shared._history_reader_mos_follow_ups(text, text, jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Reader functions — one per table, the table's own read predicate
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function shared._history_reader_mos_signals(
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
      select 1 from mos.signals s
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and s.id = p_record_key::uuid
        and s.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_signals(text, text, jsonb) is
  'History read predicate for mos.signals (#987): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_signal_mentions(
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
      select 1 from mos.signal_mentions m
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and m.id = p_record_key::uuid
        and m.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_signal_mentions(text, text, jsonb) is
  'History read predicate for mos.signal_mentions (#987): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_signal_acknowledgements(
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
      select 1 from mos.signal_acknowledgements a
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and a.id = p_record_key::uuid
        and a.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_signal_acknowledgements(text, text, jsonb) is
  'History read predicate for mos.signal_acknowledgements (#987): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_signal_tasks(
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
      select 1 from mos.signal_tasks st
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and st.id = p_record_key::uuid
        and st.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_signal_tasks(text, text, jsonb) is
  'History read predicate for mos.signal_tasks (#987): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_weekly_updates(
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
      select 1 from mos.weekly_updates wu
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and wu.id = p_record_key::uuid
        and wu.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_weekly_updates(text, text, jsonb) is
  'History read predicate for mos.weekly_updates (#987): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_weekly_update_items(
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
      select 1 from mos.weekly_update_items wi
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and wi.id = p_record_key::uuid
        and wi.org_id = shared.current_org_id());
  elsif p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
      and exists (
        select 1 from mos.weekly_updates w
        where w.id = (p_snapshot ->> 'weekly_update_id')::uuid
          and mos.can_read_weekly_update(w.person_id));
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_weekly_update_items(text, text, jsonb) is
  'History read predicate for mos.weekly_update_items (#987): the table''s own SELECT predicate over the live row '
  'for insert/update rows, and over the captured snapshot columns for delete rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_events(
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
      select 1 from mos.events e
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and e.id = p_record_key::uuid
        and e.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_events(text, text, jsonb) is
  'History read predicate for mos.events (#987): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_follow_ups(
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
      select 1 from mos.follow_ups fu
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and fu.id = p_record_key::uuid
        and fu.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_follow_ups(text, text, jsonb) is
  'History read predicate for mos.follow_ups (#987): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

revoke execute on function shared._history_reader_mos_signals(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_signals(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_signal_mentions(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_signal_mentions(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_signal_acknowledgements(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_signal_acknowledgements(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_signal_tasks(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_signal_tasks(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_weekly_updates(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_weekly_updates(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_weekly_update_items(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_weekly_update_items(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_events(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_events(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_follow_ups(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_follow_ups(text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Registry rows
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('mos', 'signals', 'shared._history_reader_mos_signals(text, text, jsonb)'),
  ('mos', 'signal_mentions', 'shared._history_reader_mos_signal_mentions(text, text, jsonb)'),
  ('mos', 'signal_acknowledgements', 'shared._history_reader_mos_signal_acknowledgements(text, text, jsonb)'),
  ('mos', 'signal_tasks', 'shared._history_reader_mos_signal_tasks(text, text, jsonb)'),
  ('mos', 'weekly_updates', 'shared._history_reader_mos_weekly_updates(text, text, jsonb)'),
  ('mos', 'weekly_update_items', 'shared._history_reader_mos_weekly_update_items(text, text, jsonb)'),
  ('mos', 'events', 'shared._history_reader_mos_events(text, text, jsonb)'),
  ('mos', 'follow_ups', 'shared._history_reader_mos_follow_ups(text, text, jsonb)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Wire the observer triggers
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create trigger record_history_signals
  after insert or update or delete on mos.signals
  for each row execute function shared._record_history_write('-edited_at');

create trigger record_history_signal_mentions
  after insert or update or delete on mos.signal_mentions
  for each row execute function shared._record_history_write();

create trigger record_history_signal_acknowledgements
  after insert or update or delete on mos.signal_acknowledgements
  for each row execute function shared._record_history_write();

create trigger record_history_signal_tasks
  after insert or update or delete on mos.signal_tasks
  for each row execute function shared._record_history_write();

create trigger record_history_weekly_updates
  after insert or update or delete on mos.weekly_updates
  for each row execute function shared._record_history_write('-submitted_at');

create trigger record_history_weekly_update_items
  after insert or update or delete on mos.weekly_update_items
  for each row execute function shared._record_history_write();

create trigger record_history_events
  after insert or update or delete on mos.events
  for each row execute function shared._record_history_write();

create trigger record_history_follow_ups
  after insert or update or delete on mos.follow_ups
  for each row execute function shared._record_history_write();
