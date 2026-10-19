-- Restore the prior module defaults without changing explicit org settings or audit history.
begin;

comment on table mos.org_module_settings is
  'Explicit org-level module switches. Missing rows are enabled; application roles manage settings only through the admin RPC.';

create or replace function mos.list_org_module_settings()
returns table(
  module_id text,
  enabled boolean,
  row_version bigint,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
begin
  if v_org is null or not shared.has_access_role('admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
    select c.id,
           coalesce(s.enabled, true),
           coalesce(s.row_version, 0),
           s.updated_at,
           s.updated_by
      from mos.module_catalog c
      left join mos.org_module_settings s
        on s.org_id = v_org and s.module_id = c.id
     order by case c.id
       when 'work' then 1
       when 'money' then 2
       when 'cafe' then 3
       when 'roastery' then 4
       when 'ecommerce' then 5
       when 'assistant' then 6
       else 7
     end;
end;
$$;

create or replace function mos.viewer_module_availability()
returns table(module_id text, enabled boolean, revision text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_revision text;
begin
  if v_org is null then
    raise exception 'signed-in org required' using errcode = '42501';
  end if;

  select pg_catalog.md5(pg_catalog.string_agg(
           c.id || ':' || coalesce(s.row_version, 0)::text,
           ',' order by case c.id
             when 'work' then 1
             when 'money' then 2
             when 'cafe' then 3
             when 'roastery' then 4
             when 'ecommerce' then 5
             when 'assistant' then 6
             else 7
           end))
    into v_revision
    from mos.module_catalog c
    left join mos.org_module_settings s
      on s.org_id = v_org and s.module_id = c.id;

  return query
    select c.id, coalesce(s.enabled, true), v_revision
      from mos.module_catalog c
      left join mos.org_module_settings s
        on s.org_id = v_org and s.module_id = c.id
     order by case c.id
       when 'work' then 1
       when 'money' then 2
       when 'cafe' then 3
       when 'roastery' then 4
       when 'ecommerce' then 5
       when 'assistant' then 6
       else 7
     end;
end;
$$;

create or replace function mos.save_org_module_settings(p_rows jsonb, p_client_request_id uuid)
returns table(
  module_id text,
  enabled boolean,
  row_version bigint,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_person uuid := shared.current_person_id();
  v_row jsonb;
  v_module_id text;
  v_expected_version bigint;
  v_seen text[] := '{}'::text[];
  v_old mos.org_module_settings%rowtype;
  v_new mos.org_module_settings%rowtype;
  v_exists boolean;
  v_before jsonb;
  v_enabled boolean;
begin
  if v_org is null or not shared.has_access_role('admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id is required' using errcode = '22023';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'module settings rows must be a JSON array' using errcode = '22023';
  end if;

  for v_row in select item.value from pg_catalog.jsonb_array_elements(p_rows) as item(value) loop
    if pg_catalog.jsonb_typeof(v_row) is distinct from 'object'
       or not (v_row ?& array['module_id', 'enabled', 'expected_version']) then
      raise exception 'each module setting needs module_id, enabled, and expected_version' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(v_row -> 'module_id') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_row -> 'enabled') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(v_row -> 'expected_version') is distinct from 'number'
       or (v_row ->> 'expected_version') !~ '^-?[0-9]+$' then
      raise exception 'module setting fields have invalid types' using errcode = '22023';
    end if;

    v_module_id := v_row ->> 'module_id';
    if v_module_id = '' then
      raise exception 'module_id is required' using errcode = '22023';
    end if;
    if v_module_id = any(v_seen) then
      raise exception 'duplicate module id in one save' using errcode = '22023';
    end if;
    v_seen := pg_catalog.array_append(v_seen, v_module_id);

    if not exists (
      select 1 from mos.module_catalog c
       where c.id = v_module_id and c.switchable
    ) then
      raise exception 'unknown or non-switchable module id' using errcode = '22023';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mos.org_module_settings:' || v_org::text, 0));

  if exists (
    select 1 from mos.module_settings_audit a
     where a.org_id = v_org and a.client_request_id = p_client_request_id
  ) then
    return query
      select c.id, coalesce(s.enabled, true), coalesce(s.row_version, 0), s.updated_at, s.updated_by
        from mos.module_catalog c
        left join mos.org_module_settings s on s.org_id = v_org and s.module_id = c.id
       order by case c.id
         when 'work' then 1
         when 'money' then 2
         when 'cafe' then 3
         when 'roastery' then 4
         when 'ecommerce' then 5
         when 'assistant' then 6
         else 7
       end;
    return;
  end if;

  for v_row in select item.value from pg_catalog.jsonb_array_elements(p_rows) as item(value) loop
    v_module_id := v_row ->> 'module_id';
    v_expected_version := (v_row ->> 'expected_version')::bigint;
    if v_expected_version is distinct from coalesce((
      select s.row_version from mos.org_module_settings s
       where s.org_id = v_org and s.module_id = v_module_id
    ), 0) then
      raise exception 'module settings changed, reload' using errcode = '40001';
    end if;
  end loop;

  for v_row in select item.value from pg_catalog.jsonb_array_elements(p_rows) as item(value) loop
    v_module_id := v_row ->> 'module_id';
    v_enabled := (v_row ->> 'enabled')::boolean;
    select s.* into v_old
      from mos.org_module_settings s
     where s.org_id = v_org and s.module_id = v_module_id;
    v_exists := found;
    v_before := case when v_exists then pg_catalog.to_jsonb(v_old) else null end;

    if v_exists then
      update mos.org_module_settings s
         set enabled = v_enabled,
             row_version = v_old.row_version + 1,
             updated_at = pg_catalog.now(),
             updated_by = v_person
       where s.org_id = v_org and s.module_id = v_module_id
       returning s.* into v_new;
    else
      insert into mos.org_module_settings (org_id, module_id, enabled, row_version, updated_at, updated_by)
      values (v_org, v_module_id, v_enabled, 1, pg_catalog.now(), v_person)
      returning * into v_new;
    end if;

    insert into mos.module_settings_audit (
      org_id, module_id, before, after, actor, client_request_id, resulting_version
    ) values (
      v_org, v_module_id, v_before, pg_catalog.to_jsonb(v_new), v_person,
      p_client_request_id, v_new.row_version
    );
  end loop;

  return query
    select c.id, coalesce(s.enabled, true), coalesce(s.row_version, 0), s.updated_at, s.updated_by
      from mos.module_catalog c
      left join mos.org_module_settings s
        on s.org_id = v_org and s.module_id = c.id
     order by case c.id
       when 'work' then 1
       when 'money' then 2
       when 'cafe' then 3
       when 'roastery' then 4
       when 'ecommerce' then 5
       when 'assistant' then 6
       else 7
     end;
end;
$$;

comment on function mos.list_org_module_settings() is
  'Admin-only org module settings list in catalog order; absent rows materialize as enabled at version zero.';
revoke execute on function mos.list_org_module_settings() from public, anon, authenticated;
grant execute on function mos.list_org_module_settings() to authenticated;

comment on function mos.viewer_module_availability() is
  'Returns the caller org''s six module availability values and a shared revision hash, without exposing other orgs.';
revoke execute on function mos.viewer_module_availability() from public, anon, authenticated;
grant execute on function mos.viewer_module_availability() to authenticated;

comment on function mos.save_org_module_settings(jsonb, uuid) is
  'Atomically saves admin-provided org module settings with optimistic versions, per-org serialization, and idempotent audit records.';
revoke execute on function mos.save_org_module_settings(jsonb, uuid) from public, anon, authenticated;
grant execute on function mos.save_org_module_settings(jsonb, uuid) to authenticated;

commit;
