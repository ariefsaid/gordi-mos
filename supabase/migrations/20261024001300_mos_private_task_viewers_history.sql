-- DOWN: run supabase/rollbacks/20261024001300_mos_private_task_viewers_history.sql
-- Private Task (#1839): changes to the who-can-see list are recorded in change history. A row is a
-- hard delete (removing a person is the verb), so the delete arm answers from the captured
-- snapshot, and only to someone who can read the Task it belonged to.

create or replace function shared._history_reader_mos_task_viewers(
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
    -- Read through the list's own policy: the Task must be readable by the caller.
    return exists (
      select 1 from mos.task_viewers v
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and v.id = p_record_key::uuid
        and v.org_id = shared.current_org_id());
  end if;
  if p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
       and mos.can_read_task((p_snapshot ->> 'task_id')::uuid);
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_task_viewers(text, text, jsonb) is
  'History read predicate for mos.task_viewers (#1839): a live row through its own policy for insert/update; for delete the snapshot''s Task must be readable by the caller. Dispatched only through shared.record_history_readers.';
revoke execute on function shared._history_reader_mos_task_viewers(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_task_viewers(text, text, jsonb) to authenticated;

insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('mos', 'task_viewers', 'shared._history_reader_mos_task_viewers(text, text, jsonb)');

create trigger record_history_task_viewers
  after insert or update or delete on mos.task_viewers
  for each row execute function shared._record_history_write();
