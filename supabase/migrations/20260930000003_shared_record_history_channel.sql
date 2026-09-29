-- Channel attribution in change history (#1006, ADR-0060 D10, integration-operation-layer FR-030).
-- Every shared.record_history row records how the change reached the database:
--   app    — a write outside any api_v1 function (the MOS app, a service or seed write);
--   api    — a write inside an api_v1 function, made with a person's own session;
--   agent  — the session's token carries a client_id claim; the client id is recorded beside it.
-- The channel is derived, never supplied. A BEFORE INSERT trigger on the history table overwrites both
-- columns from the session, so the generic history trigger (shared._record_history_write) is
-- unchanged and every table it is wired to is stamped the same way.
--
-- The "api" marker is a per-transaction token, not a flag. api_private.begin_write sets it to a hash of
-- a database-local secret and the transaction id; api_private.channel() recomputes the hash and
-- compares. A session that writes the marker setting itself, in a transaction that never entered an
-- api_v1 function, cannot produce the token, so the row reads `app`. The secret lives in a table no
-- application role can read.
--
-- Existing rows read `app`: the label they carry is the one ADR-0060 D10 gives every write that did not
-- come through an api_v1 function, and no earlier row can be attributed more precisely.
--
-- DOWN (order matters):
--   drop function api_v1.get_record_history(text, uuid, text, integer);
--   drop trigger record_history_stamp_channel on shared.record_history;
--   drop function shared._record_history_stamp_channel();
--   alter table shared.record_history drop constraint record_history_agent_client_pairing,
--     drop column agent_client_id, drop column channel;
--   restore api_private.begin_write and api_private.channel from 20260930000001_api_v1_operation_layer.sql;
--   drop function shared._api_channel_token();
--   drop table api_private.channel_secret;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The per-database marker secret and the token derived from it
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table api_private.channel_secret (
  id     boolean primary key default true check (id),
  secret text    not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
insert into api_private.channel_secret default values;
revoke all on api_private.channel_secret from public, anon, authenticated, service_role;
alter table api_private.channel_secret enable row level security;
comment on table api_private.channel_secret is
  'One row: the database-local secret behind the api channel marker. No application role holds any grant, so only the SECURITY DEFINER helpers (owner) read it.';

-- Invoker on purpose, with EXECUTE closed to every application role: it is called only from the
-- definer helpers below, which run as the owner and so can read the secret. Never granted to
-- authenticated, because the token it returns is what proves "this transaction opened an API write".
create function shared._api_channel_token()
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(
    (select s.secret from api_private.channel_secret s) || ':' || pg_current_xact_id()::text, 'UTF8')), 'hex')
$$;
revoke execute on function shared._api_channel_token() from public, anon, authenticated;
comment on function shared._api_channel_token() is
  'The current transaction''s api-channel token: a hash of the database secret and the transaction id. Callable only from the definer helpers api_private.begin_write and api_private.channel.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The two api_private helpers that touch the marker
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- begin_write is 20260930000001's body with one line changed: the marker is the token, not a flag.
create or replace function api_private.begin_write(p_operation text, p_idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid := shared.current_person_id();
  v_org    uuid := shared.current_org_id();
  v_prior_record_id  uuid;
  v_used   integer;
begin
  if v_person is null or v_org is null then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;
  if p_idempotency_key is not null and (btrim(p_idempotency_key) = '' or length(p_idempotency_key) > 200) then
    raise exception using errcode = 'PT400', detail = 'invalid_input', hint = 'idempotency_key',
      message = 'idempotency_key must be 1 to 200 characters.';
  end if;

  perform set_config('api.channel', shared._api_channel_token(), true);
  perform pg_advisory_xact_lock(hashtextextended('api_write:' || v_person::text, 0));

  if p_idempotency_key is not null then
    select l.record_id into v_prior_record_id
      from shared.api_write_log l
     where l.person_id = v_person
       and l.org_id = v_org
       and l.operation = p_operation
       and l.idempotency_key = p_idempotency_key
       and l.created_at > clock_timestamp() - interval '24 hours'
     order by l.created_at desc
     limit 1;
    if v_prior_record_id is not null then
      return v_prior_record_id;
    end if;
  end if;

  select count(*) into v_used
    from shared.api_write_log l
   where l.person_id = v_person
     and l.created_at > clock_timestamp() - interval '60 seconds';
  if v_used >= 60 then
    raise exception using errcode = 'PT429', detail = 'rate_limited',
      message = 'Too many changes in the last minute. Wait a moment and try again.';
  end if;
  return null;
end
$$;

-- channel() becomes SECURITY DEFINER so it can compare the marker with the token; it reads and
-- returns nothing else.
create or replace function api_private.channel()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when api_private.claim_client_id() is not null then 'agent'
    when current_setting('api.channel', true) = shared._api_channel_token() then 'api'
    else 'app'
  end
$$;

comment on function api_private.begin_write(text, text) is 'SECURITY DEFINER, touches only the write log and the channel marker: marks the transaction as an API write, takes the caller''s advisory lock, returns the record id of an earlier write with the same idempotency key (24 hours), else spends one unit of the 60-per-minute write budget (rate_limited when spent).';
comment on function api_private.channel() is 'SECURITY DEFINER, read-only: agent when the claims carry a client_id, api when this transaction opened an API write (the marker matches its token), otherwise app.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The history row carries the channel and the agent client id
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table shared.record_history
  add column channel         text not null default 'app' check (channel in ('app', 'api', 'agent')),
  add column agent_client_id text check (agent_client_id is null or agent_client_id <> ''),
  add constraint record_history_agent_client_pairing check ((channel = 'agent') = (agent_client_id is not null));
-- Existing rows took 'app' from the default above; a new row must be stamped by the trigger below.
alter table shared.record_history alter column channel drop default;

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
-- 4. api_v1.get_record_history
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
