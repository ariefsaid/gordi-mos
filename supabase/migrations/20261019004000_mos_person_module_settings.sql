-- Per-person module presentation overrides. Explicit Inherit rows are versioned tombstones.
-- DOWN: run supabase/rollbacks/20261019004000_mos_person_module_settings.sql.
-- Export person settings and audit first if they must be recoverable; DOWN removes both.
begin;

alter table shared.people
  add constraint people_org_id_id_module_settings_key unique (org_id, id);

create table mos.person_module_settings (
  org_id uuid not null references shared.orgs(id),
  person_id uuid not null,
  module_id text not null references mos.module_catalog(id),
  override text not null check (override in ('inherit', 'allow', 'block')),
  row_version bigint not null default 1 check (row_version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, person_id, module_id),
  foreign key (org_id, person_id) references shared.people(org_id, id),
  foreign key (org_id, updated_by) references shared.people(org_id, id)
);
comment on table mos.person_module_settings is
  'Per-person module presentation overrides. Inherit is stored as a versioned tombstone; composite person and updater foreign keys enforce the org seam.';
comment on column mos.person_module_settings.override is
  'Presentation admission only; Allow does not grant protected data or actions.';

create table mos.person_module_settings_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  person_id uuid not null,
  module_id text not null,
  before jsonb,
  after jsonb not null,
  actor uuid not null,
  occurred_at timestamptz not null default now(),
  client_request_id uuid not null,
  resulting_version bigint not null,
  unique (org_id, person_id, client_request_id, module_id)
);
comment on table mos.person_module_settings_audit is
  'Append-only historical snapshots of per-person module settings. Identity columns are snapshots without live person foreign keys.';
comment on column mos.person_module_settings_audit.before is
  'Full prior settings row, or null when the module had no explicit setting.';

alter table mos.person_module_settings enable row level security;
alter table mos.person_module_settings force row level security;
alter table mos.person_module_settings_audit enable row level security;
alter table mos.person_module_settings_audit force row level security;

revoke all on mos.person_module_settings, mos.person_module_settings_audit
  from public, anon, authenticated, service_role;
revoke all on sequence mos.person_module_settings_audit_id_seq
  from public, anon, authenticated, service_role;
grant select on mos.person_module_settings to service_role;
grant select on mos.person_module_settings_audit to authenticated;

create policy person_module_settings_service_select
  on mos.person_module_settings for select to service_role using (true);
comment on policy person_module_settings_service_select on mos.person_module_settings is
  'Only the trusted edge gate reads person settings directly; browsers use the identity-bound viewer RPC.';
create policy person_module_settings_audit_admin_select
  on mos.person_module_settings_audit for select to authenticated
  using (org_id = (select shared.current_org_id())
         and (select shared.has_access_role('admin')));
comment on policy person_module_settings_audit_admin_select on mos.person_module_settings_audit is
  'Audit snapshots are readable only by administrators of the recorded org.';

create trigger person_module_settings_audit_append_only
  before update or delete or truncate on mos.person_module_settings_audit
  for each statement execute function mos._reject_module_settings_audit_mutation();

create function mos.list_person_module_settings(p_person_id uuid)
returns table (
  person_id uuid, module_id text, override text,
  row_version bigint, updated_at timestamptz, updated_by uuid,
  org_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
begin
  if v_org is null or v_actor is null
     or not shared.has_access_role('admin')
     or not exists (select 1 from shared.people p where p.org_id = v_org and p.id = v_actor)
     or p_person_id is null
     or not exists (select 1 from shared.people p where p.org_id = v_org and p.id = p_person_id) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
    select p_person_id, c.id, coalesce(ps.override, 'inherit'),
           coalesce(ps.row_version, 0), ps.updated_at, ps.updated_by,
           coalesce(os.enabled, c.id <> 'assistant')
      from mos.module_catalog c
      left join mos.person_module_settings ps
        on ps.org_id = v_org and ps.person_id = p_person_id and ps.module_id = c.id
      left join mos.org_module_settings os
        on os.org_id = v_org and os.module_id = c.id
     order by case c.id
       when 'work' then 1 when 'money' then 2 when 'cafe' then 3
       when 'roastery' then 4 when 'ecommerce' then 5 when 'assistant' then 6
       else 7 end;
end;
$$;
comment on function mos.list_person_module_settings(uuid) is
  'Admin-only list for a person in the caller org, in catalog order. Missing person settings materialize as Inherit at version zero.';
revoke execute on function mos.list_person_module_settings(uuid)
  from public, anon, authenticated, service_role;
grant execute on function mos.list_person_module_settings(uuid) to authenticated;

create function mos.save_person_module_settings(
  p_person_id uuid, p_rows jsonb, p_client_request_id uuid
)
returns table (
  person_id uuid, module_id text, override text,
  row_version bigint, updated_at timestamptz, updated_by uuid,
  org_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_row jsonb;
  v_module_id text;
  v_override text;
  v_expected_version bigint;
  v_expected_numeric numeric;
  v_seen text[] := '{}'::text[];
  v_old mos.person_module_settings%rowtype;
  v_new mos.person_module_settings%rowtype;
  v_exists boolean;
  v_before jsonb;
  v_now timestamptz;
begin
  if v_org is null or v_actor is null
     or not shared.has_access_role('admin')
     or not exists (select 1 from shared.people p where p.org_id = v_org and p.id = v_actor)
     or p_person_id is null
     or not exists (select 1 from shared.people p where p.org_id = v_org and p.id = p_person_id) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_client_request_id is null
     or p_rows is null
     or pg_catalog.jsonb_typeof(p_rows) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_rows) = 0 then
    raise exception 'person module settings require a nonempty array and request id' using errcode = '22023';
  end if;

  for v_row in select item.value from pg_catalog.jsonb_array_elements(p_rows) as item(value) loop
    if pg_catalog.jsonb_typeof(v_row) is distinct from 'object'
       or not (v_row ?& array['module_id', 'override', 'expected_version']) then
      raise exception 'each person module setting needs module_id, override, and expected_version' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(v_row -> 'module_id') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_row -> 'override') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_row -> 'expected_version') is distinct from 'number' then
      raise exception 'person module setting fields have invalid types' using errcode = '22023';
    end if;

    v_module_id := v_row ->> 'module_id';
    v_override := v_row ->> 'override';
    if v_module_id = '' or v_override not in ('inherit', 'allow', 'block') then
      raise exception 'person module setting value is invalid' using errcode = '22023';
    end if;
    if v_module_id = any(v_seen) then
      raise exception 'duplicate module id in one save' using errcode = '22023';
    end if;
    v_seen := pg_catalog.array_append(v_seen, v_module_id);

    if not exists (
      select 1 from mos.module_catalog c where c.id = v_module_id and c.switchable
    ) then
      raise exception 'unknown or non-switchable module id' using errcode = '22023';
    end if;
    begin
      v_expected_numeric := (v_row ->> 'expected_version')::numeric;
      if v_expected_numeric < 0 or pg_catalog.trunc(v_expected_numeric) <> v_expected_numeric then
        raise exception 'expected_version must be a nonnegative integer' using errcode = '22023';
      end if;
      v_expected_version := v_expected_numeric::bigint;
    exception when numeric_value_out_of_range then
      raise exception 'expected_version is out of range' using errcode = '22023';
    end;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mos.person_module_settings:' || v_org::text || ':' || p_person_id::text, 0));

  if not exists (select 1 from shared.people p where p.org_id = v_org and p.id = p_person_id) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if exists (
    select 1 from mos.person_module_settings_audit a
     where a.org_id = v_org and a.person_id = p_person_id
       and a.client_request_id = p_client_request_id
  ) then
    return query
      select p_person_id, c.id, coalesce(ps.override, 'inherit'),
             coalesce(ps.row_version, 0), ps.updated_at, ps.updated_by,
             coalesce(os.enabled, c.id <> 'assistant')
        from mos.module_catalog c
        left join mos.person_module_settings ps
          on ps.org_id = v_org and ps.person_id = p_person_id and ps.module_id = c.id
        left join mos.org_module_settings os
          on os.org_id = v_org and os.module_id = c.id
       order by case c.id
         when 'work' then 1 when 'money' then 2 when 'cafe' then 3
         when 'roastery' then 4 when 'ecommerce' then 5 when 'assistant' then 6
         else 7 end;
    return;
  end if;

  for v_row in select item.value from pg_catalog.jsonb_array_elements(p_rows) as item(value) loop
    v_module_id := v_row ->> 'module_id';
    v_expected_version := (v_row ->> 'expected_version')::numeric::bigint;
    if v_expected_version is distinct from coalesce((
      select ps.row_version from mos.person_module_settings ps
       where ps.org_id = v_org and ps.person_id = p_person_id and ps.module_id = v_module_id
    ), 0) then
      raise exception 'module settings changed, reload' using errcode = '40001';
    end if;
  end loop;

  for v_row in select item.value from pg_catalog.jsonb_array_elements(p_rows) as item(value) loop
    v_module_id := v_row ->> 'module_id';
    v_override := v_row ->> 'override';
    select ps.* into v_old
      from mos.person_module_settings ps
     where ps.org_id = v_org and ps.person_id = p_person_id and ps.module_id = v_module_id;
    v_exists := found;
    v_before := case when v_exists then pg_catalog.to_jsonb(v_old) else null end;
    v_now := pg_catalog.now();

    if v_exists then
      update mos.person_module_settings ps
         set override = v_override,
             row_version = v_old.row_version + 1,
             updated_at = v_now,
             updated_by = v_actor
       where ps.org_id = v_org and ps.person_id = p_person_id and ps.module_id = v_module_id
       returning ps.* into v_new;
    else
      insert into mos.person_module_settings (
        org_id, person_id, module_id, override, row_version, updated_at, updated_by
      ) values (
        v_org, p_person_id, v_module_id, v_override, 1, v_now, v_actor
      ) returning * into v_new;
    end if;

    insert into mos.person_module_settings_audit (
      org_id, person_id, module_id, before, after, actor, occurred_at,
      client_request_id, resulting_version
    ) values (
      v_org, p_person_id, v_module_id, v_before, pg_catalog.to_jsonb(v_new),
      v_actor, v_now, p_client_request_id, v_new.row_version
    );
  end loop;

  return query
    select p_person_id, c.id, coalesce(ps.override, 'inherit'),
           coalesce(ps.row_version, 0), ps.updated_at, ps.updated_by,
           coalesce(os.enabled, c.id <> 'assistant')
      from mos.module_catalog c
      left join mos.person_module_settings ps
        on ps.org_id = v_org and ps.person_id = p_person_id and ps.module_id = c.id
      left join mos.org_module_settings os
        on os.org_id = v_org and os.module_id = c.id
     order by case c.id
       when 'work' then 1 when 'money' then 2 when 'cafe' then 3
       when 'roastery' then 4 when 'ecommerce' then 5 when 'assistant' then 6
       else 7 end;
end;
$$;
comment on function mos.save_person_module_settings(uuid, jsonb, uuid) is
  'Atomically saves admin-provided per-person presentation overrides with target-scoped serialization, optimistic versions, and append-only audit snapshots.';
revoke execute on function mos.save_person_module_settings(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function mos.save_person_module_settings(uuid, jsonb, uuid) to authenticated;

-- DROP is required because Postgres cannot replace a function with a changed OUT-row shape.
drop function mos.viewer_module_availability();
create function mos.viewer_module_availability()
returns table (module_id text, enabled boolean, revision text, person_override text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_person uuid := shared.current_person_id();
  v_revision text;
begin
  if v_org is null or v_person is null
     or not exists (select 1 from shared.people p where p.org_id = v_org and p.id = v_person) then
    raise exception 'signed-in person required' using errcode = '42501';
  end if;

  select pg_catalog.md5(v_org::text || ':' || v_person::text || ':' ||
           pg_catalog.string_agg(
             c.id || ':' || coalesce(os.row_version, 0)::text || ':' || coalesce(ps.row_version, 0)::text,
             ',' order by case c.id
               when 'work' then 1 when 'money' then 2 when 'cafe' then 3
               when 'roastery' then 4 when 'ecommerce' then 5 when 'assistant' then 6
               else 7 end))
    into v_revision
    from mos.module_catalog c
    left join mos.org_module_settings os
      on os.org_id = v_org and os.module_id = c.id
    left join mos.person_module_settings ps
      on ps.org_id = v_org and ps.person_id = v_person and ps.module_id = c.id;

  return query
    select c.id, coalesce(os.enabled, c.id <> 'assistant'), v_revision,
           coalesce(ps.override, 'inherit')
      from mos.module_catalog c
      left join mos.org_module_settings os
        on os.org_id = v_org and os.module_id = c.id
      left join mos.person_module_settings ps
        on ps.org_id = v_org and ps.person_id = v_person and ps.module_id = c.id
     order by case c.id
       when 'work' then 1 when 'money' then 2 when 'cafe' then 3
       when 'roastery' then 4 when 'ecommerce' then 5 when 'assistant' then 6
       else 7 end;
end;
$$;
comment on function mos.viewer_module_availability() is
  'Returns the caller person''s org switch facts and own presentation overrides, plus an identity-scoped revision hash.';
revoke execute on function mos.viewer_module_availability()
  from public, anon, authenticated, service_role;
grant execute on function mos.viewer_module_availability() to authenticated;

commit;
