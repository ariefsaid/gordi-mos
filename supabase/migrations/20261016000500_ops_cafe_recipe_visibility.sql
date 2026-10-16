-- Hide selected ESB recipe references in MOS without changing the retained source copy.
-- DOWN: run supabase/rollbacks/20261016000500_ops_cafe_recipe_visibility.sql.
-- The guarded rollback refuses to drop saved visibility choices or audit history.

create table ops.recipe_visibility (
  org_id uuid not null default shared.current_org_id()
    references shared.orgs(id) on delete cascade,
  esb_code text not null check (btrim(esb_code) <> ''),
  menu_id integer not null,
  hidden boolean not null,
  row_version integer not null default 1 check (row_version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references shared.people(id) on delete set null,
  primary key (org_id, esb_code, menu_id)
);
comment on table ops.recipe_visibility is
  'Per-org MOS-only visibility choices for copied ESB recipes. Missing rows are shown; no ESB status or recipe data is changed.';
comment on column ops.recipe_visibility.row_version is
  'Starts at one and increases only when the shown/hidden value changes. A missing row has implicit version zero.';

create table ops.recipe_visibility_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  actor_id uuid references shared.people(id) on delete set null,
  client_request_id uuid not null,
  esb_code text not null,
  menu_id integer not null,
  expected_version integer,
  before_hidden boolean not null,
  result_hidden boolean not null,
  result_row_version integer not null,
  result_updated_at timestamptz not null,
  result_updated_by uuid references shared.people(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (org_id, actor_id, client_request_id),
  check (expected_version is null or expected_version >= 0),
  check (result_row_version > 0)
);
comment on table ops.recipe_visibility_audit is
  'Append-only record of accepted recipe visibility requests, including replay data for idempotent retries.';

alter table ops.recipe_visibility enable row level security;
alter table ops.recipe_visibility force row level security;
alter table ops.recipe_visibility_audit enable row level security;
alter table ops.recipe_visibility_audit force row level security;

revoke all on ops.recipe_visibility, ops.recipe_visibility_audit
  from public, anon, authenticated, service_role;
grant select on ops.recipe_visibility to authenticated;

create policy recipe_visibility_select_org on ops.recipe_visibility
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.is_org_member()));
comment on policy recipe_visibility_select_org on ops.recipe_visibility is
  'Café members read only visibility choices in their active organization.';

create function ops._reject_recipe_visibility_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Preserve ordinary org/person FK cleanup while rejecting direct audit mutations.
  if pg_catalog.pg_trigger_depth() > 1 then
    return null;
  end if;
  raise exception 'Recipe visibility audit rows are immutable' using errcode = '55000';
end;
$$;
revoke execute on function ops._reject_recipe_visibility_audit_mutation() from public, anon, authenticated, service_role;
create trigger recipe_visibility_audit_immutable
  before update or delete or truncate on ops.recipe_visibility_audit
  for each statement execute function ops._reject_recipe_visibility_audit_mutation();

create function ops.list_recipe_visibility()
returns table(
  recipe_key text,
  hidden boolean,
  row_version integer,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
begin
  if v_org_id is null or not shared.is_org_member() then
    return;
  end if;

  return query
    select v.esb_code || ':' || v.menu_id::text,
           v.hidden,
           v.row_version,
           v.updated_at,
           v.updated_by
      from ops.recipe_visibility v
     where v.org_id = v_org_id
     order by v.esb_code, v.menu_id;
end;
$$;
comment on function ops.list_recipe_visibility() is
  'Lists the caller organization''s recipe visibility choices. Recipe data and ESB status are not read or changed.';
revoke execute on function ops.list_recipe_visibility() from public, anon, authenticated, service_role;
grant execute on function ops.list_recipe_visibility() to authenticated;

create function ops.set_recipe_visibility(
  p_recipe_key text,
  p_hidden boolean,
  p_expected_version integer,
  p_client_request_id uuid
)
returns table(
  recipe_key text,
  hidden boolean,
  row_version integer,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_actor_id uuid := shared.current_person_id();
  v_key_parts text[];
  v_esb_code text;
  v_menu_text text;
  v_menu_id integer;
  v_recipe_key text;
  v_prior ops.recipe_visibility_audit%rowtype;
  v_current ops.recipe_visibility%rowtype;
  v_before_hidden boolean := false;
  v_result_hidden boolean;
  v_result_version integer;
  v_result_updated_at timestamptz;
  v_result_updated_by uuid;
begin
  if v_org_id is null or v_actor_id is null or not shared.is_org_member()
     or not coalesce(
       ops.can_manage_cafe_item_settings('kitchen')
       or ops.can_manage_cafe_item_settings('bar'), false
     ) then
    raise exception using errcode = '42501', message = 'Recipe visibility is not available to this account.';
  end if;
  if p_recipe_key is null or length(p_recipe_key) > 256 or p_hidden is null
     or p_client_request_id is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'Recipe visibility request is invalid.';
  end if;

  v_key_parts := pg_catalog.regexp_match(p_recipe_key, '^(.*):([0-9]+)$');
  if v_key_parts is null or btrim(v_key_parts[1]) = '' then
    raise exception using errcode = '22023', message = 'Recipe key must contain an ESB code and menu id.';
  end if;
  v_esb_code := v_key_parts[1];
  v_menu_text := v_key_parts[2];
  begin
    v_menu_id := v_menu_text::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Recipe menu id is invalid.';
  end;
  if v_menu_id::text <> v_menu_text then
    raise exception using errcode = '22023', message = 'Recipe menu id is not canonical.';
  end if;
  v_recipe_key := v_esb_code || ':' || v_menu_id::text;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'recipe-visibility-request:' || v_org_id::text || ':' || v_actor_id::text || ':' || p_client_request_id::text, 0));
  select a.* into v_prior
    from ops.recipe_visibility_audit a
   where a.org_id = v_org_id
     and a.actor_id = v_actor_id
     and a.client_request_id = p_client_request_id;
  if found then
    if v_prior.esb_code is distinct from v_esb_code
       or v_prior.menu_id is distinct from v_menu_id
       or v_prior.result_hidden is distinct from p_hidden
       or v_prior.expected_version is distinct from p_expected_version then
      raise exception using errcode = '22023', message = 'Recipe visibility request id was reused with different input.';
    end if;
    recipe_key := v_prior.esb_code || ':' || v_prior.menu_id::text;
    hidden := v_prior.result_hidden;
    row_version := v_prior.result_row_version;
    updated_at := v_prior.result_updated_at;
    updated_by := v_prior.result_updated_by;
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'recipe-visibility-row:' || v_org_id::text || ':' || v_recipe_key, 0));
  select v.* into v_current
    from ops.recipe_visibility v
   where v.org_id = v_org_id
     and v.esb_code = v_esb_code
     and v.menu_id = v_menu_id
   for update;
  if found then
    if p_expected_version is null or p_expected_version <> v_current.row_version then
      raise exception using errcode = 'P0019', message = 'Recipe visibility changed. Reload before saving.';
    end if;
    v_before_hidden := v_current.hidden;
    if v_current.hidden is distinct from p_hidden then
      update ops.recipe_visibility v
         set hidden = p_hidden,
             row_version = v.row_version + 1,
             updated_at = pg_catalog.now(),
             updated_by = v_actor_id
       where v.org_id = v_org_id
         and v.esb_code = v_esb_code
         and v.menu_id = v_menu_id
       returning v.* into v_current;
    end if;
  else
    if p_expected_version is not null then
      raise exception using errcode = 'P0019', message = 'Recipe visibility changed. Reload before saving.';
    end if;
    insert into ops.recipe_visibility (org_id, esb_code, menu_id, hidden, row_version, updated_by)
    values (v_org_id, v_esb_code, v_menu_id, p_hidden, 1, v_actor_id)
    returning * into v_current;
  end if;

  v_result_hidden := v_current.hidden;
  v_result_version := v_current.row_version;
  v_result_updated_at := v_current.updated_at;
  v_result_updated_by := v_current.updated_by;
  insert into ops.recipe_visibility_audit (
    org_id, actor_id, client_request_id, esb_code, menu_id, expected_version,
    before_hidden, result_hidden, result_row_version, result_updated_at, result_updated_by
  ) values (
    v_org_id, v_actor_id, p_client_request_id, v_esb_code, v_menu_id, p_expected_version,
    v_before_hidden, v_result_hidden, v_result_version, v_result_updated_at, v_result_updated_by
  );

  recipe_key := v_recipe_key;
  hidden := v_result_hidden;
  row_version := v_result_version;
  updated_at := v_result_updated_at;
  updated_by := v_result_updated_by;
  return next;
end;
$$;
comment on function ops.set_recipe_visibility(text, boolean, integer, uuid) is
  'Authorized Café settings manager changes one organization-local MOS visibility choice. Version checks, idempotency and audit are atomic; ESB is untouched.';
revoke execute on function ops.set_recipe_visibility(text, boolean, integer, uuid) from public, anon, authenticated, service_role;
grant execute on function ops.set_recipe_visibility(text, boolean, integer, uuid) to authenticated;
