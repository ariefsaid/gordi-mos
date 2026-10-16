-- Org-level module switches. A missing settings row means the module is enabled.
-- DOWN (manual, before production):
--   drop function mos.list_org_module_settings();
--   drop function mos.viewer_module_availability();
--   drop function mos.save_org_module_settings(jsonb, uuid);
--   drop trigger module_settings_audit_append_only on mos.module_settings_audit;
--   drop function mos._reject_module_settings_audit_mutation();
--   drop table mos.module_settings_audit;
--   drop table mos.org_module_settings;
--   drop table mos.module_catalog;

create table mos.module_catalog (
  id text primary key,
  switchable boolean not null default true,
  introduced_at timestamptz not null default now()
);
comment on table mos.module_catalog is
  'Migration-managed catalog of org-switchable MOS modules. Catalog absence is not used as an enabled setting.';

insert into mos.module_catalog (id) values
  ('work'),
  ('money'),
  ('cafe'),
  ('roastery'),
  ('ecommerce'),
  ('assistant');

create table mos.org_module_settings (
  org_id uuid not null references shared.orgs(id),
  module_id text not null references mos.module_catalog(id),
  enabled boolean not null,
  row_version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references shared.people(id),
  primary key (org_id, module_id)
);
comment on table mos.org_module_settings is
  'Explicit org-level module switches. Missing rows are enabled; application roles manage settings only through the admin RPC.';

create table mos.module_settings_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  module_id text not null,
  before jsonb,
  after jsonb not null,
  actor uuid,
  occurred_at timestamptz not null default now(),
  client_request_id uuid not null,
  resulting_version bigint not null,
  unique (org_id, client_request_id, module_id)
);
comment on table mos.module_settings_audit is
  'Append-only history of org module setting saves, readable only by administrators of the recorded org.';

alter table mos.module_catalog enable row level security;
alter table mos.module_catalog force row level security;
alter table mos.org_module_settings enable row level security;
alter table mos.org_module_settings force row level security;
alter table mos.module_settings_audit enable row level security;
alter table mos.module_settings_audit force row level security;

revoke all on mos.module_catalog, mos.org_module_settings, mos.module_settings_audit
  from public, anon, authenticated, service_role;
grant select on mos.org_module_settings to service_role;
grant select on mos.module_settings_audit to authenticated;

create policy org_module_settings_service_select on mos.org_module_settings
  for select to service_role
  using (true);
comment on policy org_module_settings_service_select on mos.org_module_settings is
  'Allows the trusted assistant edge check to read org module switches; browser roles have no table policy.';

create policy module_settings_audit_admin_select on mos.module_settings_audit
  for select to authenticated
  using (org_id = (select shared.current_org_id())
         and (select shared.has_access_role('admin')));
comment on policy module_settings_audit_admin_select on mos.module_settings_audit is
  'Audit rows are visible only to administrators in the row''s org.';

create function mos._reject_module_settings_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'module settings audit is append-only' using errcode = '55000';
end;
$$;
comment on function mos._reject_module_settings_audit_mutation() is
  'Rejects updates, deletes, and truncation so module setting audit history remains append-only.';
revoke execute on function mos._reject_module_settings_audit_mutation() from public, anon, authenticated, service_role;
create trigger module_settings_audit_append_only
  before update or delete or truncate on mos.module_settings_audit
  for each statement execute function mos._reject_module_settings_audit_mutation();

create function mos.list_org_module_settings()
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
comment on function mos.list_org_module_settings() is
  'Admin-only org module settings list in catalog order; absent rows materialize as enabled at version zero.';
revoke execute on function mos.list_org_module_settings() from public, anon, authenticated;
grant execute on function mos.list_org_module_settings() to authenticated;

create function mos.viewer_module_availability()
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
comment on function mos.viewer_module_availability() is
  'Returns the caller org''s six module availability values and a shared revision hash, without exposing other orgs.';
revoke execute on function mos.viewer_module_availability() from public, anon, authenticated;
grant execute on function mos.viewer_module_availability() to authenticated;

create function mos.save_org_module_settings(p_rows jsonb, p_client_request_id uuid)
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
comment on function mos.save_org_module_settings(jsonb, uuid) is
  'Atomically saves admin-provided org module settings with optimistic versions, per-org serialization, and idempotent audit records.';
revoke execute on function mos.save_org_module_settings(jsonb, uuid) from public, anon, authenticated;
grant execute on function mos.save_org_module_settings(jsonb, uuid) to authenticated;
