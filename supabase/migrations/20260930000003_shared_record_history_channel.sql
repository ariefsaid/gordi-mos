-- Channel attribution in change history (#1006, ADR-0060 D10, integration-operation-layer FR-030).
-- Every shared.record_history row records how the change reached the database:
--   app    — a write outside any api_v1 function (the MOS app, a service or seed write);
--   api    — a write inside an api_v1 function, made with a person's own session;
--   agent  — the session's token carries a client_id claim; the client id is recorded beside it.
-- The channel is derived, never supplied. A BEFORE INSERT trigger on the history table overwrites both
-- columns from the session, so the generic history trigger (shared._record_history_write) is
-- unchanged and every table it is wired to is stamped the same way.
--
-- Trust boundary for the "api" label: api_private is not in the data API's exposed schemas, one request
-- runs one RPC or one table operation in its own transaction, and a client can set only request.*
-- settings. So a data-API client cannot open the api.channel marker (set by api_private.begin_write) and
-- then write a table. A raw SQL session as `authenticated` can call begin_write itself; that is
-- outside the model, the same boundary as app.reporting_org, and the actor on the row stays exact.
-- `agent` comes from the client_id claim of an auth-issued token.
--
-- Existing rows read `app`: the label they carry is the one ADR-0060 D10 gives every write that did not
-- come through an api_v1 function, and no earlier row can be attributed more precisely.
--
-- DOWN (order matters):
--   drop function api_v1.get_record_history(text, uuid, text, integer);
--   drop index shared.record_history_record_keyset_idx;
--   drop trigger record_history_stamp_channel on shared.record_history;
--   drop function shared._record_history_stamp_channel();
--   alter table shared.record_history drop constraint record_history_agent_client_pairing,
--     drop column agent_client_id, drop column channel;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The history row carries the channel and the agent client id
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table shared.record_history
  add column channel         text not null default 'app' check (channel in ('app', 'api', 'agent')),
  add column agent_client_id text check (agent_client_id is null or agent_client_id <> ''),
  add constraint record_history_agent_client_pairing check ((channel = 'agent') = (agent_client_id is not null));
-- Existing rows took 'app' from the default above; a new row must be stamped by the trigger below.
alter table shared.record_history alter column channel drop default;

-- Serves get_record_history's (occurred_at desc, id desc) keyset order; the older index ends at occurred_at.
create index record_history_record_keyset_idx
  on shared.record_history (org_id, schema_name, table_name, record_key, occurred_at desc, id desc);

comment on column shared.record_history.channel is
  'app, api or agent (ADR-0060 D10), derived by shared._record_history_stamp_channel from the writing session and never supplied: agent when the token carries a client_id, else api when the write ran inside an api_v1 function, else app.';
comment on column shared.record_history.agent_client_id is
  'The client_id claim of the agent token that made the change; NULL unless channel is agent. Derived from the session claims, never supplied.';

create function shared._record_history_stamp_channel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.agent_client_id := api_private.claim_client_id();
  new.channel := api_private.channel();
  return new;
end
$$;
revoke execute on function shared._record_history_stamp_channel() from public, anon, authenticated;
comment on function shared._record_history_stamp_channel() is
  'BEFORE INSERT on shared.record_history: overwrites channel and agent_client_id from the writing session, so neither can be supplied by any writer of the table.';

create trigger record_history_stamp_channel
  before insert on shared.record_history
  for each row execute function shared._record_history_stamp_channel();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. api_v1.get_record_history
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Invoker: the read goes through shared.record_history's own policy, so a caller sees exactly the
-- history rows the app shows them, each with its channel. A record type whose history is not yet
-- recorded, or a record the caller cannot read, returns no items.
create function api_v1.get_record_history(
  record_type text, id uuid, cursor text default null, "limit" integer default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_type      text := get_record_history.record_type;
  v_id        uuid := get_record_history.id;
  v_table     text;
  v_page_size integer := api_private.page_limit(get_record_history."limit");
  v_cursor    jsonb := api_private.decode_cursor(get_record_history.cursor);
  v_cursor_at timestamptz;
  v_items     jsonb; v_has_more boolean; v_last_at timestamptz; v_last_id uuid;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  v_table := case v_type
    when 'task' then 'tasks'
    when 'signal' then 'signals'
    when 'project_process' then 'work_lines'
    when 'objective' then 'objectives'
  end;
  if v_table is null then
    perform api_private.invalid('record_type', 'record_type must be one of task, signal, project_process, objective.');
  end if;
  if v_id is null then
    perform api_private.invalid('id', 'id is required.');
  end if;
  if v_cursor is not null then
    begin
      v_cursor_at := (v_cursor ->> 0)::timestamptz;
      if v_cursor_at is null or (v_cursor ->> 1) is null then
        raise exception 'null cursor key';
      end if;
    exception when others then
      perform api_private.invalid('cursor', 'cursor is not valid.');
    end;
  end if;

  select coalesce(jsonb_agg(r.item order by r.rn) filter (where r.rn <= v_page_size), '[]'::jsonb),
         coalesce(max(r.rn) > v_page_size, false),
         (array_agg(r.occurred_at order by r.rn) filter (where r.rn = v_page_size))[1],
         (array_agg(r.id order by r.rn) filter (where r.rn = v_page_size))[1]
    into v_items, v_has_more, v_last_at, v_last_id
    from (
      select h.id, h.occurred_at,
             row_number() over (order by h.occurred_at desc, h.id desc) as rn,
             jsonb_build_object(
               'id', h.id, 'action', h.action, 'field', h.field_name,
               'old_value', h.old_value, 'new_value', h.new_value,
               'actor_person_id', h.actor_person_id, 'actor_name', p.full_name,
               'channel', h.channel, 'agent_client_id', h.agent_client_id,
               'occurred_at', h.occurred_at) as item
        from shared.record_history h
        left join shared.people p on p.id = h.actor_person_id
       where h.org_id = shared.current_org_id()
         and h.schema_name = 'mos'
         and h.table_name = v_table
         and h.record_key = v_id::text
         and (v_cursor is null or (h.occurred_at, h.id) < (v_cursor_at, (v_cursor ->> 1)::uuid))
       order by h.occurred_at desc, h.id desc
       limit v_page_size + 1) r;
  return jsonb_build_object('items', v_items,
    'next_cursor', case when v_has_more then api_private.encode_cursor(v_last_at::text, v_last_id) end);
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

comment on function api_v1.get_record_history(text, uuid, text, integer) is
  'Purpose: the change history of one record, newest first, read through the same visibility rule as the app. Inputs: record_type (task, signal, project_process or objective), id, cursor (opaque, from next_cursor), limit (default 50, at most 100). Returns: {items [{id, action (insert, update or delete), field, old_value, new_value, actor_person_id, actor_name, channel (app, api or agent), agent_client_id, occurred_at}], next_cursor}. A record type whose history is not yet recorded, or a record the caller cannot read, returns no items. Errors: invalid_input (record_type, id, cursor, limit).';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Execute grants: authenticated only, on every function in both schemas
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace in ('api_v1'::regnamespace, 'api_private'::regnamespace)
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;
