-- Meetings (#1840), part 6: change history for mos.meetings on the shared registry.
-- The minutes are a document column: history records THAT they changed, never a content copy (~minutes).
-- Read follows the Meeting's own read rule, so a Private Meeting's history is invisible to outsiders.
-- Attendees are not audited separately.
--
-- DOWN: supabase/rollbacks/20261024002500_mos_meetings_history.sql

create or replace function shared._history_reader_mos_meetings(
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
    return p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and mos.can_read_meeting(p_record_key::uuid);
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_meetings(text, text, jsonb) is
  'History read predicate for mos.meetings (#1840): the Meeting''s own read gate over the live row for insert/update rows; false for any other action.';
revoke execute on function shared._history_reader_mos_meetings(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_meetings(text, text, jsonb) to authenticated;

insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('mos', 'meetings', 'shared._history_reader_mos_meetings(text, text, jsonb)');

create trigger record_history_meetings
  after insert or update or delete on mos.meetings
  for each row execute function shared._record_history_write('~minutes');
