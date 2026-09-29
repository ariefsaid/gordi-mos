-- Shared operation layer, slice (a): the `api_v1` schema (plumbing, context reads, Task reads and
-- writes, refusals) and the `api_private` helpers behind it (integration-operation-layer.spec.md,
-- ADR-0060, OD-API-1).
--
-- Rules this migration keeps:
--   * Every api_v1 function is SECURITY INVOKER with an empty search_path, executable by
--     `authenticated` only. Business writes therefore run as `authenticated`, so RLS and every guard
--     trigger decide exactly as they do for a direct table write.
--   * No function accepts an actor, author, creator, org or channel: they all come from the claims.
--   * Only api_private.begin_write and api_private.log_write are SECURITY DEFINER; both write only the
--     write log and read only it, and EXECUTE is held by `authenticated` alone.
--   * One jsonb value out. Errors carry a PT4xx code (HTTP status), DETAIL = machine code, HINT = the
--     offending field, MESSAGE = text for a person.
--
-- DOWN (manual, before production):
--   drop schema api_v1 cascade;
--   drop schema api_private cascade;
--   drop table shared.api_write_log;
--   and remove "api_v1" from [api] schemas in supabase/config.toml (self-hosted: the data API's
--   exposed-schema setting).

create schema api_private;
create schema api_v1;
grant usage on schema api_private to authenticated;
grant usage on schema api_v1 to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Write log: idempotency store, write-budget counter and call audit
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table shared.api_write_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references shared.orgs (id),
  person_id       uuid not null references shared.people (id),
  operation       text not null,
  record_type     text,
  record_id       uuid,
  channel         text not null check (channel in ('api', 'agent')),
  client_id       text,
  idempotency_key text,
  created_at      timestamptz not null default clock_timestamp()
);

create index api_write_log_person_time_idx on shared.api_write_log (person_id, created_at desc);
create index api_write_log_idempotency_idx
  on shared.api_write_log (person_id, operation, idempotency_key, created_at desc)
  where idempotency_key is not null;

alter table shared.api_write_log enable row level security;
alter table shared.api_write_log force row level security;

create policy api_write_log_select on shared.api_write_log
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (person_id = shared.current_person_id() or shared.has_access_role('admin'))
  );

revoke all on shared.api_write_log from public, anon, authenticated;
grant select on shared.api_write_log to authenticated;

comment on table shared.api_write_log is
  'One row per successful API or agent write: who, which operation and record, which channel and client, and the idempotency key. Doubles as the idempotency store (24 hours) and the per-person write-budget counter (60 per minute). Written only by api_private.log_write; a person reads their own rows, an admin the org''s.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_private: invoker helpers
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_private.claim_client_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'client_id', '')
$$;

create function api_private.channel()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when api_private.claim_client_id() is not null then 'agent'
    when current_setting('api.channel', true) = 'api' then 'api'
    else 'app'
  end
$$;

-- RAISE cannot take a null option, so the hint is added only when there is one.
create function api_private.raise_api(p_state text, p_message text, p_detail text, p_hint text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_hint is null then
    raise exception using errcode = p_state, message = p_message, detail = p_detail;
  end if;
  raise exception using errcode = p_state, message = p_message, detail = p_detail, hint = p_hint;
end
$$;

create function api_private.invalid(p_field text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform api_private.raise_api('PT400', p_message, 'invalid_input', p_field);
end
$$;

create function api_private.not_found(p_what text, p_field text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform api_private.raise_api('PT404', p_what || ' not found.', 'not_found', p_field);
end
$$;

create function api_private.refuse(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'PT403', detail = p_code, message = case p_code
    when 'refused.archive' then 'Archiving, restoring and retracting can''t be done through the API or an agent. Do this in MOS.'
    when 'refused.delete' then 'Deleting can''t be done through the API or an agent. Do this in MOS.'
    when 'refused.targets' then 'Objective settings and key-result targets can''t be changed through the API or an agent. Do this in MOS.'
    when 'refused.permissions' then 'People, roles and access can''t be changed through the API or an agent. Do this in MOS.'
    when 'refused.money' then 'Money can''t be read or changed through the API or an agent yet. Do this in MOS.'
  end;
end
$$;

-- Maps whatever a function's body raised to the stable error contract; always raises.
create function api_private.raise_mapped(
  p_state text, p_message text, p_detail text, p_hint text, p_column text, p_constraint text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_state like 'PT%' then
    perform api_private.raise_api(p_state, p_message, p_detail, p_hint);
  elsif p_state = '42501' then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = case
        when p_message ~ '^(new row violates row-level security policy|permission denied|must be owner)'
          then 'You don''t have permission to do this in MOS.'
        else p_message
      end;
  elsif p_state = '23514' then
    perform api_private.raise_api('PT400',
      case when p_message like 'new row for relation%' then 'A value is not allowed here.' else p_message end,
      'invalid_input', p_column);
  elsif p_state = 'P0001' then
    raise exception using errcode = 'PT400', detail = 'invalid_input', message = p_message;
  elsif p_state = '23502' then
    perform api_private.raise_api('PT400', 'A required value is missing.', 'invalid_input', p_column);
  elsif p_state = '23503' then
    raise exception using errcode = 'PT400', detail = 'invalid_input',
      message = 'A referenced record does not exist.';
  elsif p_state = '23505' or p_state in ('40001', '40P01') then
    raise exception using errcode = 'PT409', detail = 'conflict',
      message = 'This conflicts with another change. Try again.';
  elsif p_state like '22%' then
    raise exception using errcode = 'PT400', detail = 'invalid_input',
      message = 'A value has the wrong format.';
  else
    raise exception using errcode = 'PT500', detail = 'internal_error',
      message = 'Something went wrong. Try again.';
  end if;
end
$$;

create function api_private.page_limit(p_limit integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_limit is null then return 50; end if;
  if p_limit < 1 then
    perform api_private.invalid('limit', 'limit must be at least 1.');
  end if;
  return least(p_limit, 100);
end
$$;

create function api_private.encode_cursor(p_key text, p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(convert_to(jsonb_build_array(p_key, p_id)::text, 'UTF8'), 'hex')
$$;

create function api_private.decode_cursor(p_cursor text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_cursor is null then return null; end if;
  begin
    v := convert_from(decode(p_cursor, 'hex'), 'UTF8')::jsonb;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 2 then v := null; end if;
    if v is not null then perform (v ->> 1)::uuid; end if;
  exception when others then
    v := null;
  end;
  if v is null then
    perform api_private.invalid('cursor', 'cursor is not valid.');
  end if;
  return v;
end
$$;

create function api_private.like_pattern(p_q text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create function api_private.text_arg(p_val text, p_field text, p_max integer, p_required boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(p_val);
begin
  if v is null or v = '' then
    if p_required then
      perform api_private.invalid(p_field, p_field || ' must not be blank.');
    end if;
    return null;
  end if;
  if length(v) > p_max then
    perform api_private.invalid(p_field, p_field || ' must be at most ' || p_max || ' characters.');
  end if;
  return v;
end
$$;

create function api_private.json_text(p_val jsonb, p_field text, p_max integer, p_required boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    return api_private.text_arg(null, p_field, p_max, p_required);
  end if;
  if jsonb_typeof(p_val) <> 'string' then
    perform api_private.invalid(p_field, p_field || ' must be text.');
  end if;
  return api_private.text_arg(p_val #>> '{}', p_field, p_max, p_required);
end
$$;

create function api_private.json_uuid(p_val jsonb, p_field text, p_nullable boolean)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    if not p_nullable then
      perform api_private.invalid(p_field, p_field || ' must not be null.');
    end if;
    return null;
  end if;
  if jsonb_typeof(p_val) <> 'string' then
    perform api_private.invalid(p_field, p_field || ' must be an id.');
  end if;
  begin
    return (p_val #>> '{}')::uuid;
  exception when others then
    perform api_private.invalid(p_field, p_field || ' must be an id.');
  end;
  return null;
end
$$;

create function api_private.json_uuid_array(p_val jsonb, p_field text)
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v uuid[] := '{}';
  e jsonb;
begin
  if p_val is null or jsonb_typeof(p_val) <> 'array' then
    perform api_private.invalid(p_field, p_field || ' must be a list of ids.');
  end if;
  if jsonb_array_length(p_val) > 50 then
    perform api_private.invalid(p_field, p_field || ' holds at most 50 ids.');
  end if;
  for e in select x from jsonb_array_elements(p_val) x loop
    v := v || api_private.json_uuid(e, p_field, false);
  end loop;
  return v;
end
$$;

create function api_private.json_date(p_val jsonb, p_field text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_val is null or jsonb_typeof(p_val) = 'null' then return null; end if;
  if jsonb_typeof(p_val) <> 'string' then
    perform api_private.invalid(p_field, p_field || ' must be a date (YYYY-MM-DD).');
  end if;
  begin
    return (p_val #>> '{}')::date;
  exception when others then
    perform api_private.invalid(p_field, p_field || ' must be a date (YYYY-MM-DD).');
  end;
  return null;
end
$$;

create function api_private.status_arg(p_val text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_val is null or p_val <> all (array['Open', 'In Progress', 'Blocked', 'Done']) then
    perform api_private.invalid('status', 'status must be one of Open, In Progress, Blocked, Done.');
  end if;
  return p_val;
end
$$;

create function api_private.task_json(t mos.tasks)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'status', t.status,
    'team_id', t.team_id,
    'business_unit_id', t.business_unit_id,
    'responsible_person_id', t.responsible_person_id,
    'accountable_person_id', t.accountable_person_id,
    'consulted_person_ids', to_jsonb(t.consulted_person_ids),
    'informed_person_ids', to_jsonb(t.informed_person_ids),
    'description', t.description,
    'due_date', t.due_date,
    'objective_id', t.objective_id,
    'work_line_id', t.work_line_id,
    'process_run_id', t.process_run_id,
    'archived_at', t.archived_at,
    'completed_at', t.completed_at,
    'last_activity_at', t.last_activity_at,
    'created_by', t.created_by,
    'created_at', t.created_at,
    'updated_at', t.updated_at)
$$;

-- The Task as get_task returns it (null when the caller cannot read it).
create function api_private.task_detail(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api_private.task_json(t) || jsonb_build_object(
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'is_done', i.is_done, 'position', i.position)
                       order by i.position, i.created_at, i.id)
        from (select * from mos.task_checklist_items c where c.task_id = t.id
               order by c.position, c.created_at, c.id limit 100) i), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'actor_person_id', e.actor_person_id,
                                          'from_value', e.from_value, 'to_value', e.to_value, 'created_at', e.created_at)
                       order by e.created_at desc, e.id desc)
        from (select * from mos.task_events x where x.task_id = t.id
               order by x.created_at desc, x.id desc limit 50) e), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'author_id', m.author_id, 'body', m.body,
                                          'created_at', m.created_at, 'updated_at', m.updated_at)
                       order by m.created_at desc, m.id desc)
        from (select * from mos.comments k where k.entity_type = 'task' and k.entity_id = t.id
               order by k.created_at desc, k.id desc limit 50) m), '[]'::jsonb),
    'signal_ids', coalesce((
      select jsonb_agg(s.signal_id order by s.created_at, s.signal_id)
        from (select * from mos.signal_tasks z where z.task_id = t.id
               order by z.created_at, z.signal_id limit 100) s), '[]'::jsonb))
  from mos.tasks t
  where t.id = p_id
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_private: the write-log helpers (SECURITY DEFINER; they touch only the write log)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Opens an API write: marks the transaction's channel, serialises the caller's writes, returns the
-- record id of an earlier write made with the same key (a replay), else spends one unit of the
-- 60-per-minute budget.
create function api_private.begin_write(p_operation text, p_idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid := shared.current_person_id();
  v_org    uuid := shared.current_org_id();
  v_prior  uuid;
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

  perform set_config('api.channel', 'api', true);
  perform pg_advisory_xact_lock(hashtextextended('api_write:' || v_person::text, 0));

  if p_idempotency_key is not null then
    select l.record_id into v_prior
      from shared.api_write_log l
     where l.person_id = v_person
       and l.org_id = v_org
       and l.operation = p_operation
       and l.idempotency_key = p_idempotency_key
       and l.created_at > clock_timestamp() - interval '24 hours'
     order by l.created_at desc
     limit 1;
    if v_prior is not null then
      return v_prior;
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

-- Records a successful API write; person, org, channel and client come from the claims.
create function api_private.log_write(
  p_operation text, p_record_type text, p_record_id uuid, p_idempotency_key text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into shared.api_write_log (org_id, person_id, operation, record_type, record_id, channel, client_id, idempotency_key)
  values (shared.current_org_id(), shared.current_person_id(), p_operation, p_record_type, p_record_id,
          case when api_private.claim_client_id() is not null then 'agent' else 'api' end,
          api_private.claim_client_id(), p_idempotency_key);
end
$$;

revoke execute on function api_private.begin_write(text, text) from public, anon;
revoke execute on function api_private.log_write(text, text, uuid, text) from public, anon;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_v1: context reads
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.whoami()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  return jsonb_build_object(
    'person', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email)
                 from shared.people p where p.id = shared.current_person_id()),
    'org_id', shared.current_org_id(),
    'access_roles', to_jsonb(shared.current_access_roles()),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name, 'business_unit_id', t.business_unit_id,
                                          'is_primary', tm.is_primary and tm.effective_to is null)
                       order by (tm.is_primary and tm.effective_to is null) desc, t.name, t.id)
        from shared.team_memberships tm
        join shared.teams t on t.id = tm.team_id
       where tm.person_id = shared.current_person_id()
         and tm.effective_from <= current_date
         and (tm.effective_to is null or tm.effective_to >= current_date)
         and t.archived_at is null), '[]'::jsonb),
    'authority', jsonb_build_object(
      'signal', (select to_jsonb(s) from mos.get_signal_post_authority() s),
      'work', (select to_jsonb(w) from mos.get_work_write_scopes() w)));
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

create function api_v1.list_people(
  q text default null, team_id uuid default null, include_archived boolean default false,
  cursor text default null, "limit" integer default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_q      text := nullif(btrim(list_people.q), '');
  v_team   uuid := list_people.team_id;
  v_arch   boolean := coalesce(list_people.include_archived, false);
  v_lim    integer := api_private.page_limit(list_people."limit");
  v_cur    jsonb := api_private.decode_cursor(list_people.cursor);
  v_items  jsonb; v_more boolean; v_ck text; v_cid uuid;
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  select coalesce(jsonb_agg(r.item order by r.rn) filter (where r.rn <= v_lim), '[]'::jsonb),
         coalesce(max(r.rn) > v_lim, false),
         (array_agg(r.full_name order by r.rn) filter (where r.rn = v_lim))[1],
         (array_agg(r.id order by r.rn) filter (where r.rn = v_lim))[1]
    into v_items, v_more, v_ck, v_cid
    from (
      select p.id, p.full_name,
             row_number() over (order by p.full_name, p.id) as rn,
             jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email,
               'teams', coalesce((
                 select jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name) order by t.name, t.id)
                   from shared.team_memberships tm join shared.teams t on t.id = tm.team_id
                  where tm.person_id = p.id and tm.effective_from <= current_date
                    and (tm.effective_to is null or tm.effective_to >= current_date)
                    and t.archived_at is null), '[]'::jsonb)) as item
        from shared.people p
       where p.org_id = shared.current_org_id()
         and (v_arch or p.archived_at is null)
         and (v_q is null or p.full_name ilike api_private.like_pattern(v_q) or p.email ilike api_private.like_pattern(v_q))
         and (v_team is null or exists (
               select 1 from shared.team_memberships tm
                where tm.person_id = p.id and tm.team_id = v_team and tm.effective_from <= current_date
                  and (tm.effective_to is null or tm.effective_to >= current_date)))
         and (v_cur is null or (p.full_name, p.id) > (v_cur ->> 0, (v_cur ->> 1)::uuid))
       order by p.full_name, p.id
       limit v_lim + 1) r;
  return jsonb_build_object('items', v_items,
    'next_cursor', case when v_more then api_private.encode_cursor(v_ck, v_cid) end);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

create function api_v1.list_teams(
  q text default null, business_unit_id uuid default null, cursor text default null, "limit" integer default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_q      text := nullif(btrim(list_teams.q), '');
  v_bu     uuid := list_teams.business_unit_id;
  v_lim    integer := api_private.page_limit(list_teams."limit");
  v_cur    jsonb := api_private.decode_cursor(list_teams.cursor);
  v_items  jsonb; v_more boolean; v_ck text; v_cid uuid;
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  select coalesce(jsonb_agg(r.item order by r.rn) filter (where r.rn <= v_lim), '[]'::jsonb),
         coalesce(max(r.rn) > v_lim, false),
         (array_agg(r.name order by r.rn) filter (where r.rn = v_lim))[1],
         (array_agg(r.id order by r.rn) filter (where r.rn = v_lim))[1]
    into v_items, v_more, v_ck, v_cid
    from (
      select t.id, t.name,
             row_number() over (order by t.name, t.id) as rn,
             jsonb_build_object('id', t.id, 'name', t.name, 'code', t.code, 'business_unit_id', t.business_unit_id,
                                'business_unit_name', b.name, 'site_id', t.site_id) as item
        from shared.teams t
        join shared.business_units b on b.id = t.business_unit_id
       where t.org_id = shared.current_org_id()
         and t.archived_at is null
         and (v_q is null or t.name ilike api_private.like_pattern(v_q) or t.code ilike api_private.like_pattern(v_q))
         and (v_bu is null or t.business_unit_id = v_bu)
         and (v_cur is null or (t.name, t.id) > (v_cur ->> 0, (v_cur ->> 1)::uuid))
       order by t.name, t.id
       limit v_lim + 1) r;
  return jsonb_build_object('items', v_items,
    'next_cursor', case when v_more then api_private.encode_cursor(v_ck, v_cid) end);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

create function api_v1.list_business_units()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code) order by b.name, b.id)
        from (select * from shared.business_units u
               where u.org_id = shared.current_org_id() and u.archived_at is null
               order by u.name, u.id limit 100) b), '[]'::jsonb),
    'next_cursor', null);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_v1: Task reads
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.list_tasks(
  status text[] default null, team_id uuid default null, business_unit_id uuid default null,
  responsible_person_id uuid default null, accountable_person_id uuid default null,
  objective_id uuid default null, work_line_id uuid default null,
  due_from date default null, due_to date default null, updated_since timestamptz default null,
  q text default null, include_archived boolean default false,
  cursor text default null, "limit" integer default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_status text[] := list_tasks.status;
  v_team   uuid := list_tasks.team_id;
  v_bu     uuid := list_tasks.business_unit_id;
  v_resp   uuid := list_tasks.responsible_person_id;
  v_acc    uuid := list_tasks.accountable_person_id;
  v_obj    uuid := list_tasks.objective_id;
  v_wl     uuid := list_tasks.work_line_id;
  v_from   date := list_tasks.due_from;
  v_to     date := list_tasks.due_to;
  v_since  timestamptz := list_tasks.updated_since;
  v_q      text := nullif(btrim(list_tasks.q), '');
  v_arch   boolean := coalesce(list_tasks.include_archived, false);
  v_lim    integer := api_private.page_limit(list_tasks."limit");
  v_cur    jsonb := api_private.decode_cursor(list_tasks.cursor);
  v_cur_ts timestamptz;
  v_items  jsonb; v_more boolean; v_ck timestamptz; v_cid uuid;
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  if v_status is not null and exists (
       select 1 from unnest(v_status) s where s is null or s <> all (array['Open', 'In Progress', 'Blocked', 'Done'])) then
    perform api_private.invalid('status', 'status must hold only Open, In Progress, Blocked, Done.');
  end if;
  if v_cur is not null then
    begin
      v_cur_ts := (v_cur ->> 0)::timestamptz;
    exception when others then
      perform api_private.invalid('cursor', 'cursor is not valid.');
    end;
  end if;

  select coalesce(jsonb_agg(r.item order by r.rn) filter (where r.rn <= v_lim), '[]'::jsonb),
         coalesce(max(r.rn) > v_lim, false),
         (array_agg(r.updated_at order by r.rn) filter (where r.rn = v_lim))[1],
         (array_agg(r.id order by r.rn) filter (where r.rn = v_lim))[1]
    into v_items, v_more, v_ck, v_cid
    from (
      select t.id, t.updated_at,
             row_number() over (order by t.updated_at desc, t.id desc) as rn,
             api_private.task_json(t) as item
        from mos.tasks t
       where t.org_id = shared.current_org_id()
         and (v_arch or t.archived_at is null)
         and (v_status is null or t.status = any (v_status))
         and (v_team is null or t.team_id = v_team)
         and (v_bu is null or t.business_unit_id = v_bu)
         and (v_resp is null or t.responsible_person_id = v_resp)
         and (v_acc is null or t.accountable_person_id = v_acc)
         and (v_obj is null or t.objective_id = v_obj)
         and (v_wl is null or t.work_line_id = v_wl)
         and (v_from is null or t.due_date >= v_from)
         and (v_to is null or t.due_date <= v_to)
         and (v_since is null or t.updated_at >= v_since)
         and (v_q is null or t.title ilike api_private.like_pattern(v_q))
         and (v_cur is null or (t.updated_at, t.id) < (v_cur_ts, (v_cur ->> 1)::uuid))
       order by t.updated_at desc, t.id desc
       limit v_lim + 1) r;
  return jsonb_build_object('items', v_items,
    'next_cursor', case when v_more then api_private.encode_cursor(
      to_char(v_ck at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), v_cid) end);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

create function api_v1.get_task(id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id     uuid := get_task.id;
  v_item   jsonb;
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  if v_id is null then
    perform api_private.invalid('id', 'id is required.');
  end if;
  v_item := api_private.task_detail(v_id);
  if v_item is null then
    perform api_private.not_found('Task');
  end if;
  return jsonb_build_object('item', v_item);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_v1: Task writes
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.create_task(
  title text, team_id uuid, responsible_person_id uuid, accountable_person_id uuid,
  description text default null, due_date date default null, status text default 'Open',
  consulted_person_ids uuid[] default null, informed_person_ids uuid[] default null,
  objective_id uuid default null, work_line_id uuid default null,
  checklist text[] default null, idempotency_key text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_title  text := api_private.text_arg(create_task.title, 'title', 300, true);
  v_desc   text := api_private.text_arg(create_task.description, 'description', 2000, false);
  v_status text := api_private.status_arg(coalesce(create_task.status, 'Open'));
  v_team   uuid := create_task.team_id;
  v_resp   uuid := create_task.responsible_person_id;
  v_acc    uuid := create_task.accountable_person_id;
  v_cons   uuid[] := api_private.json_uuid_array(coalesce(to_jsonb(create_task.consulted_person_ids), '[]'::jsonb), 'consulted_person_ids');
  v_inf    uuid[] := api_private.json_uuid_array(coalesce(to_jsonb(create_task.informed_person_ids), '[]'::jsonb), 'informed_person_ids');
  v_key    text := create_task.idempotency_key;
  v_labels text[] := '{}';
  v_label  text;
  v_bu     uuid;
  v_prior  uuid;
  v_item   jsonb;
  v_id     uuid := gen_random_uuid();
  v_me     uuid := shared.current_person_id();
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  if v_team is null then perform api_private.invalid('team_id', 'team_id is required.'); end if;
  if v_resp is null then perform api_private.invalid('responsible_person_id', 'responsible_person_id is required.'); end if;
  if v_acc is null then perform api_private.invalid('accountable_person_id', 'accountable_person_id is required.'); end if;
  if create_task.checklist is not null then
    if cardinality(create_task.checklist) > 50 then
      perform api_private.invalid('checklist', 'checklist holds at most 50 labels.');
    end if;
    foreach v_label in array create_task.checklist loop
      v_labels := v_labels || api_private.text_arg(v_label, 'checklist', 300, true);
    end loop;
  end if;

  v_prior := api_private.begin_write('create_task', v_key);
  if v_prior is not null then
    v_item := api_private.task_detail(v_prior);
    if v_item is not null then
      return jsonb_build_object('item', v_item, 'replayed', true);
    end if;
  end if;

  select t.business_unit_id into v_bu from shared.teams t where t.id = v_team and t.archived_at is null;
  if not found then
    perform api_private.not_found('Team', 'team_id');
  end if;

  insert into mos.tasks (id, title, description, status, business_unit_id, team_id, responsible_person_id,
                         accountable_person_id, consulted_person_ids, informed_person_ids, due_date,
                         objective_id, work_line_id, created_by)
  values (v_id, v_title, v_desc, v_status, v_bu, v_team, v_resp, v_acc, v_cons, v_inf,
          create_task.due_date, create_task.objective_id, create_task.work_line_id, v_me);
  insert into mos.task_events (task_id, actor_person_id, event_type) values (v_id, v_me, 'created');
  insert into mos.task_checklist_items (task_id, label, position)
  select v_id, l.label, l.ord - 1 from unnest(v_labels) with ordinality as l(label, ord);

  perform api_private.log_write('create_task', 'task', v_id, v_key);
  return jsonb_build_object('item', api_private.task_detail(v_id), 'replayed', false);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

create function api_v1.edit_task(id uuid, changes jsonb, expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id       uuid := edit_task.id;
  v_changes  jsonb := edit_task.changes;
  v_expected timestamptz := edit_task.expected_updated_at;
  v_me       uuid := shared.current_person_id();
  v_key      text;
  v_val      jsonb;
  v_old      mos.tasks;
  v_new      mos.tasks;
  v_team     uuid;
  v_bu       uuid;
  v_ev       record;
  v_rows     integer;
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  if v_id is null then perform api_private.invalid('id', 'id is required.'); end if;
  if v_changes is null or jsonb_typeof(v_changes) <> 'object' or v_changes = '{}'::jsonb then
    perform api_private.invalid('changes', 'changes must be an object with at least one field.');
  end if;
  if v_changes ?| array['archived', 'archived_at', 'retracted', 'retracted_at', 'retract_reason'] then
    perform api_private.refuse('refused.archive');
  end if;
  for v_key in select k from jsonb_object_keys(v_changes) k loop
    if v_key <> all (array['title', 'description', 'due_date', 'status', 'team_id', 'responsible_person_id',
                           'accountable_person_id', 'consulted_person_ids', 'informed_person_ids',
                           'objective_id', 'work_line_id']) then
      perform api_private.invalid(v_key, v_key || ' is not an editable field.');
    end if;
  end loop;

  perform api_private.begin_write('edit_task', null);

  perform 1 from mos.tasks t where t.id = v_id;
  if not found then
    perform api_private.not_found('Task');
  end if;
  select * into v_old from mos.tasks t where t.id = v_id for update;
  if not found then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;
  if v_expected is not null and v_old.updated_at is distinct from v_expected then
    raise exception using errcode = 'PT409', detail = 'conflict',
      message = 'This Task changed since you read it. Read it again and retry.';
  end if;

  v_new := v_old;
  for v_key, v_val in select k, x from jsonb_each(v_changes) as e(k, x) loop
    case v_key
      when 'title' then v_new.title := api_private.json_text(v_val, 'title', 300, true);
      when 'description' then v_new.description := api_private.json_text(v_val, 'description', 2000, false);
      when 'due_date' then v_new.due_date := api_private.json_date(v_val, 'due_date');
      when 'status' then v_new.status := api_private.status_arg(api_private.json_text(v_val, 'status', 20, true));
      when 'team_id' then
        v_team := api_private.json_uuid(v_val, 'team_id', false);
        select t.business_unit_id into v_bu from shared.teams t where t.id = v_team and t.archived_at is null;
        if not found then
          perform api_private.not_found('Team', 'team_id');
        end if;
        v_new.team_id := v_team;
        v_new.business_unit_id := v_bu;
      when 'responsible_person_id' then v_new.responsible_person_id := api_private.json_uuid(v_val, 'responsible_person_id', false);
      when 'accountable_person_id' then v_new.accountable_person_id := api_private.json_uuid(v_val, 'accountable_person_id', false);
      when 'consulted_person_ids' then v_new.consulted_person_ids := api_private.json_uuid_array(v_val, 'consulted_person_ids');
      when 'informed_person_ids' then v_new.informed_person_ids := api_private.json_uuid_array(v_val, 'informed_person_ids');
      when 'objective_id' then v_new.objective_id := api_private.json_uuid(v_val, 'objective_id', true);
      when 'work_line_id' then v_new.work_line_id := api_private.json_uuid(v_val, 'work_line_id', true);
    end case;
  end loop;

  if v_new is not distinct from v_old then
    return jsonb_build_object('item', api_private.task_detail(v_id));
  end if;

  -- Events first: an editor who hands the Task away may stop being an editor once the row changes.
  if v_new.status is distinct from v_old.status then
    insert into mos.task_events (task_id, actor_person_id, event_type, from_value, to_value)
    values (v_id, v_me, 'status_changed', v_old.status, v_new.status);
  end if;
  for v_ev in
    select f.old_v, f.new_v
      from (values
        (v_old.title, v_new.title),
        (v_old.description, v_new.description),
        (v_old.due_date::text, v_new.due_date::text),
        (v_old.team_id::text, v_new.team_id::text),
        (v_old.responsible_person_id::text, v_new.responsible_person_id::text),
        (v_old.accountable_person_id::text, v_new.accountable_person_id::text),
        (v_old.objective_id::text, v_new.objective_id::text),
        (v_old.work_line_id::text, v_new.work_line_id::text)) as f(old_v, new_v)
     where f.old_v is distinct from f.new_v
  loop
    insert into mos.task_events (task_id, actor_person_id, event_type, from_value, to_value)
    values (v_id, v_me, 'field_edited', v_ev.old_v, v_ev.new_v);
  end loop;
  if v_new.consulted_person_ids is distinct from v_old.consulted_person_ids
     or v_new.informed_person_ids is distinct from v_old.informed_person_ids then
    insert into mos.task_events (task_id, actor_person_id, event_type) values (v_id, v_me, 'raci_edited');
  end if;

  update mos.tasks t set
    title = v_new.title, description = v_new.description, due_date = v_new.due_date, status = v_new.status,
    team_id = v_new.team_id, business_unit_id = v_new.business_unit_id,
    responsible_person_id = v_new.responsible_person_id, accountable_person_id = v_new.accountable_person_id,
    consulted_person_ids = v_new.consulted_person_ids, informed_person_ids = v_new.informed_person_ids,
    objective_id = v_new.objective_id, work_line_id = v_new.work_line_id
  where t.id = v_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;

  perform api_private.log_write('edit_task', 'task', v_id, null);
  return jsonb_build_object('item', api_private.task_detail(v_id));
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

create function api_v1.add_checklist_item(task_id uuid, label text, "position" integer default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_task   uuid := add_checklist_item.task_id;
  v_label  text := api_private.text_arg(add_checklist_item.label, 'label', 300, true);
  v_pos    integer := add_checklist_item."position";
  v_count  integer;
  v_me     uuid := shared.current_person_id();
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  if v_task is null then perform api_private.invalid('task_id', 'task_id is required.'); end if;
  if v_pos is not null and v_pos < 0 then
    perform api_private.invalid('position', 'position must be 0 or more.');
  end if;

  perform api_private.begin_write('add_checklist_item', null);

  perform 1 from mos.tasks t where t.id = v_task;
  if not found then
    perform api_private.not_found('Task', 'task_id');
  end if;
  select count(*) into v_count from mos.task_checklist_items c where c.task_id = v_task;
  if v_count >= 100 then
    perform api_private.invalid('task_id', 'A Task holds at most 100 checklist items.');
  end if;

  insert into mos.task_checklist_items (task_id, label, position) values (v_task, v_label, coalesce(v_pos, v_count));
  insert into mos.task_events (task_id, actor_person_id, event_type) values (v_task, v_me, 'field_edited');

  perform api_private.log_write('add_checklist_item', 'task', v_task, null);
  return jsonb_build_object('item', api_private.task_detail(v_task));
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

create function api_v1.set_checklist_item(item_id uuid, label text default null, is_done boolean default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_item   uuid := set_checklist_item.item_id;
  v_label  text := api_private.text_arg(set_checklist_item.label, 'label', 300, false);
  v_done   boolean := set_checklist_item.is_done;
  v_task   uuid;
  v_rows   integer;
  v_me     uuid := shared.current_person_id();
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  if v_item is null then perform api_private.invalid('item_id', 'item_id is required.'); end if;
  if set_checklist_item.label is not null and v_label is null then
    perform api_private.invalid('label', 'label must not be blank.');
  end if;
  if v_label is null and v_done is null then
    perform api_private.invalid('label', 'Give a label, is_done, or both.');
  end if;

  perform api_private.begin_write('set_checklist_item', null);

  select c.task_id into v_task from mos.task_checklist_items c where c.id = v_item;
  if not found then
    perform api_private.not_found('Checklist item', 'item_id');
  end if;
  update mos.task_checklist_items c
     set label = coalesce(v_label, c.label), is_done = coalesce(v_done, c.is_done)
   where c.id = v_item;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;
  insert into mos.task_events (task_id, actor_person_id, event_type) values (v_task, v_me, 'field_edited');

  perform api_private.log_write('set_checklist_item', 'task', v_task, null);
  return jsonb_build_object('item', api_private.task_detail(v_task));
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_v1: refusals
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.refused_action(action text, record_type text default null, id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_action text := refused_action.action;
  v_state text; v_msg text; v_detail text; v_hint text; v_col text; v_con text;
begin
  if v_action is null or v_action <> all (array['archive', 'restore', 'retract', 'delete', 'change_objective',
                                                'change_target', 'change_permissions', 'money']) then
    perform api_private.invalid('action', 'action must be one of archive, restore, retract, delete, change_objective, change_target, change_permissions, money.');
  end if;
  perform api_private.refuse(case v_action
    when 'archive' then 'refused.archive'
    when 'restore' then 'refused.archive'
    when 'retract' then 'refused.archive'
    when 'delete' then 'refused.delete'
    when 'change_objective' then 'refused.targets'
    when 'change_target' then 'refused.targets'
    when 'change_permissions' then 'refused.permissions'
    else 'refused.money'
  end);
  return null;
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_col = column_name, v_con = constraint_name;
  perform api_private.raise_mapped(v_state, v_msg, v_detail, v_hint, v_col, v_con);
  return null;
end
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Function comments (the source of the generated reference)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
comment on function api_v1.whoami() is
  'Purpose: who is calling and what they may do. Inputs: none. Returns: {person {id, full_name, email}, org_id, access_roles, teams [{team_id, name, business_unit_id, is_primary}], authority {signal, work}} where authority is what the Signal-post and Work write-scope authority functions return for the caller. Errors: none expected.';
comment on function api_v1.list_people(text, uuid, boolean, text, integer) is
  'Purpose: people in the caller''s org. Inputs: q (name or email contains), team_id (live members of that Team), include_archived (default false), cursor (opaque, from next_cursor), limit (default 50, at most 100). Returns: {items [{id, full_name, email, teams [{team_id, name}]}], next_cursor}. Errors: invalid_input (cursor, limit).';
comment on function api_v1.list_teams(text, uuid, text, integer) is
  'Purpose: live Teams in the caller''s org. Inputs: q (name or code contains), business_unit_id, cursor, limit (default 50, at most 100). Returns: {items [{id, name, code, business_unit_id, business_unit_name, site_id}], next_cursor}. Errors: invalid_input (cursor, limit).';
comment on function api_v1.list_business_units() is
  'Purpose: live Business Units in the caller''s org. Inputs: none. Returns: {items [{id, name, code}] (at most 100), next_cursor: null}. Errors: none expected.';
comment on function api_v1.list_tasks(text[], uuid, uuid, uuid, uuid, uuid, uuid, date, date, timestamptz, text, boolean, text, integer) is
  'Purpose: Tasks the caller can read, newest updated_at first. Inputs: status (list of Open, In Progress, Blocked, Done), team_id, business_unit_id, responsible_person_id, accountable_person_id, objective_id, work_line_id, due_from, due_to, updated_since, q (title contains), include_archived (default false), cursor, limit (default 50, at most 100). Returns: {items [Task], next_cursor}. Errors: invalid_input (status, cursor, limit).';
comment on function api_v1.get_task(uuid) is
  'Purpose: one Task with its checklist (at most 100), latest 50 events, latest 50 comments and linked Signal ids. Inputs: id. Returns: {item}. Errors: not_found (missing or not readable), invalid_input (id).';
comment on function api_v1.create_task(text, uuid, uuid, uuid, text, date, text, uuid[], uuid[], uuid, uuid, text[], text) is
  'Purpose: create a Task; the Business Unit comes from the Team and the created event is written with it. Inputs: title (at most 300 characters), team_id, responsible_person_id, accountable_person_id, description (at most 2000), due_date, status (default Open), consulted_person_ids and informed_person_ids (at most 50 each), objective_id, work_line_id, checklist (at most 50 labels of at most 300 characters), idempotency_key (1 to 200 characters; the same person repeating it within 24 hours gets the same Task back with replayed true). Returns: {item, replayed}. Errors: invalid_input, not_found (team_id), forbidden (a rule such as who may be person in charge), rate_limited (60 writes a minute per person).';
comment on function api_v1.edit_task(uuid, jsonb, timestamptz) is
  'Purpose: change a Task. Inputs: id; changes, an object holding any of title, description, due_date, status, team_id (the Business Unit follows), responsible_person_id, accountable_person_id, consulted_person_ids, informed_person_ids, objective_id, work_line_id; expected_updated_at (the updated_at you read; a newer one is a conflict). The same task events the app writes are recorded. Archive keys are refused. Returns: {item}. Errors: invalid_input (unknown key or bad value), refused.archive, not_found, forbidden, conflict, rate_limited.';
comment on function api_v1.add_checklist_item(uuid, text, integer) is
  'Purpose: add a checklist item to a Task (at most 100 items). Inputs: task_id, label (at most 300 characters), position (default: the end). Returns: {item} (the Task as get_task returns it). Errors: invalid_input, not_found (task_id), forbidden, rate_limited.';
comment on function api_v1.set_checklist_item(uuid, text, boolean) is
  'Purpose: rename or tick a checklist item. Inputs: item_id, label, is_done (give at least one). Returns: {item} (the Task as get_task returns it). Errors: invalid_input, not_found (item_id), forbidden, rate_limited.';
comment on function api_v1.refused_action(text, text, uuid) is
  'Purpose: answers a risky request with the fixed "do this in MOS" refusal. Inputs: action (archive, restore, retract, delete, change_objective, change_target, change_permissions, money); record_type and id are accepted and never read. Always raises: refused.archive, refused.delete, refused.targets, refused.permissions or refused.money; invalid_input for an unknown action.';

comment on function api_private.claim_client_id() is 'Helper: the client_id claim of the current request, or null.';
comment on function api_private.channel() is 'Helper: agent when the claims carry a client_id, api after an API write opened the transaction, otherwise app.';
comment on function api_private.raise_api(text, text, text, text) is 'Helper: raises an error with a code, message, machine code and an optional hint.';
comment on function api_private.invalid(text, text) is 'Helper: raises invalid_input (PT400) naming the offending field.';
comment on function api_private.not_found(text, text) is 'Helper: raises not_found (PT404); the same answer for a missing and an unreadable record.';
comment on function api_private.refuse(text) is 'Helper: raises the fixed refusal (PT403) for a refused.* code.';
comment on function api_private.raise_mapped(text, text, text, text, text, text) is 'Helper: maps any error a function body raised to the stable error contract (PT4xx code, DETAIL machine code, HINT field) and re-raises it.';
comment on function api_private.page_limit(integer) is 'Helper: page size, default 50, clamped to 100; below 1 is invalid_input.';
comment on function api_private.encode_cursor(text, uuid) is 'Helper: opaque keyset cursor from a sort key and an id.';
comment on function api_private.decode_cursor(text) is 'Helper: reads a cursor made by encode_cursor; anything else is invalid_input (cursor).';
comment on function api_private.like_pattern(text) is 'Helper: a contains-pattern for ILIKE with wildcards escaped.';
comment on function api_private.text_arg(text, text, integer, boolean) is 'Helper: trims a text input and enforces required and maximum length.';
comment on function api_private.json_text(jsonb, text, integer, boolean) is 'Helper: a text value from a changes object, with the text_arg rules.';
comment on function api_private.json_uuid(jsonb, text, boolean) is 'Helper: an id from a changes object.';
comment on function api_private.json_uuid_array(jsonb, text) is 'Helper: a list of at most 50 ids from a changes object.';
comment on function api_private.json_date(jsonb, text) is 'Helper: a date (or null) from a changes object.';
comment on function api_private.status_arg(text) is 'Helper: a Task status, one of Open, In Progress, Blocked, Done.';
comment on function api_private.task_json(mos.tasks) is 'Helper: the Task record shape returned by every Task read and write.';
comment on function api_private.task_detail(uuid) is 'Helper: the Task record plus checklist, latest events, latest comments and linked Signal ids; null when the caller cannot read it.';
comment on function api_private.begin_write(text, text) is 'SECURITY DEFINER, touches only the write log: marks the transaction as an API write, takes the caller''s advisory lock, returns the record id of an earlier write with the same idempotency key (24 hours), else spends one unit of the 60-per-minute write budget (rate_limited when spent).';
comment on function api_private.log_write(text, text, uuid, text) is 'SECURITY DEFINER, touches only the write log: records a successful API or agent write; person, org, channel and client come from the claims.';

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
