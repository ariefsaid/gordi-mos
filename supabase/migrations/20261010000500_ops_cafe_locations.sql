-- Physical Café locations: a shared place catalog, its branch availability, and a same-stream
-- movement ledger. Historical records remain unassigned; the balance RPC never invents an opening
-- allocation from a branch, Site, Team, or current default.
--
-- DOWN (manual, after the UI and optional capture writes are disabled):
--   drop function ops.cafe_record_locations(text, uuid[]);
--   drop function ops.move_cafe_stock(jsonb, uuid);
--   drop function ops.cafe_location_balances(date, uuid, text);
--   drop function ops.get_cafe_stream_location_defaults(uuid, text);
--   drop function ops.save_cafe_stream_location_defaults(uuid, text, jsonb, integer, uuid);
--   drop function ops.archive_cafe_location(uuid, bigint, uuid);
--   drop function ops.update_cafe_location(uuid, bigint, jsonb, uuid);
--   drop function ops.create_cafe_location(jsonb, uuid);
--   drop function ops.list_cafe_locations(jsonb);
--   drop function ops._validate_cafe_location_input(jsonb, uuid);
--   drop function ops._cafe_location_snapshot(uuid);
--   drop function ops._reject_location_ledger_mutation();
--   drop table ops.stream_location_defaults;
--   drop table ops.location_movements;
--   drop table ops.location_audit;
--   drop table ops.location_branches;
--   drop table ops.locations;
--   drop index ops.item_units_org_id_id_uk;
--   drop index ops.wip_items_org_id_id_uk;
--   drop function ops._guard_cafe_capture_locations();
--   drop trigger cafe_kitchen_log_location_guard on ops.kitchen_logs;
--   drop trigger cafe_count_line_location_guard on ops.cafe_count_lines;
--   drop trigger cafe_receipt_line_location_guard on ops.cafe_receipt_lines;
--   alter table ops.kitchen_logs drop column production_location_id, drop column from_storage_location_id, drop column to_storage_location_id;
--   alter table ops.cafe_count_lines drop column storage_location_id;
--   alter table ops.cafe_receipt_lines drop column storage_location_id;
--   drop index ops.cafe_count_lines_live_branch_item_day_uidx;
--   create unique index cafe_count_lines_live_branch_item_day_uidx on ops.cafe_count_lines (org_id, branch_id, count_date, wip_item_id) where status in ('Submitted', 'Confirmed');

create table ops.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  use text not null check (use in ('production', 'storage', 'both')),
  parent_id uuid,
  archived_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references shared.people(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references shared.people(id) on delete set null,
  constraint locations_org_id_id_uk unique (org_id, id),
  constraint locations_parent_same_org_fk foreign key (org_id, parent_id)
    references ops.locations (org_id, id) on delete restrict,
  constraint locations_parent_not_self check (parent_id is null or parent_id <> id)
);
comment on table ops.locations is
  'A physical production or storage place. It is not a Branch, Site, Team, or production stream; a shared place may be available to several branches without combining their books.';
comment on column ops.locations.row_version is
  'Optimistic version incremented by each admin catalog write.';
create unique index locations_active_name_per_parent_uk
  on ops.locations (org_id, parent_id, (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))))
  nulls not distinct where archived_at is null;
create index locations_org_active_idx on ops.locations (org_id, archived_at, name, id);

create table ops.location_branches (
  org_id uuid not null,
  location_id uuid not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (org_id, location_id, branch_id),
  constraint location_branches_location_fk foreign key (org_id, location_id)
    references ops.locations (org_id, id) on delete cascade,
  constraint location_branches_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade
);
comment on table ops.location_branches is
  'Physical availability only. A location linked to multiple branches does not co-mingle their inventory or accounting books.';
create index location_branches_branch_idx on ops.location_branches (org_id, branch_id, location_id);

create table ops.location_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  location_id uuid,
  actor_id uuid not null references shared.people(id) on delete restrict,
  client_request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  action text not null check (action in ('create', 'update', 'archive', 'defaults')),
  row_version bigint not null check (row_version > 0),
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  constraint location_audit_location_fk foreign key (org_id, location_id)
    references ops.locations (org_id, id) on delete restrict,
  constraint location_audit_request_uk unique (org_id, actor_id, client_request_id)
);
comment on table ops.location_audit is
  'Append-only actor, request, version, and before/after history for physical location configuration.';

create unique index wip_items_org_id_id_uk on ops.wip_items (org_id, id);
create unique index item_units_org_id_id_uk on ops.item_units (org_id, id);

create table ops.location_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  branch_id uuid not null,
  activity text not null references shared.activities(code),
  item_id uuid not null,
  item_unit_id uuid not null,
  from_location_id uuid,
  to_location_id uuid,
  quantity numeric(14,4) not null check (quantity > 0),
  movement_date date not null,
  kind text not null check (kind in ('opening', 'production', 'waste', 'receipt', 'transfer', 'move')),
  source_type text not null check (source_type in ('opening', 'log', 'count', 'receipt', 'move')),
  source_id uuid,
  actor_id uuid references shared.people(id) on delete set null,
  client_request_id uuid,
  payload_hash text check (payload_hash is null or payload_hash ~ '^[0-9a-f]{32}$'),
  note text check (note is null or char_length(note) <= 500),
  row_version integer not null default 1 check (row_version = 1),
  reversal_of uuid,
  created_at timestamptz not null default now(),
  constraint location_movements_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete restrict,
  constraint location_movements_item_fk foreign key (org_id, item_id)
    references ops.wip_items (org_id, id) on delete restrict,
  constraint location_movements_unit_fk foreign key (org_id, item_unit_id)
    references ops.item_units (org_id, id) on delete restrict,
  constraint location_movements_from_fk foreign key (org_id, from_location_id)
    references ops.locations (org_id, id) on delete restrict,
  constraint location_movements_to_fk foreign key (org_id, to_location_id)
    references ops.locations (org_id, id) on delete restrict,
  constraint location_movements_endpoint_ck check (
    from_location_id is distinct from to_location_id
    and (kind <> 'move' or (from_location_id is not null and to_location_id is not null))
  ),
  constraint location_movements_request_key_ck check (
    (client_request_id is null and payload_hash is null)
    or (client_request_id is not null and payload_hash is not null and actor_id is not null)
  ),
  constraint location_movements_request_uk unique (org_id, actor_id, client_request_id),
  constraint location_movements_org_id_id_uk unique (org_id, id),
  constraint location_movements_reversal_fk foreign key (org_id, reversal_of)
    references ops.location_movements (org_id, id) on delete restrict
);
create unique index location_movements_source_uk
  on ops.location_movements (org_id, source_type, source_id, kind) where source_id is not null;
comment on table ops.location_movements is
  'Append-only physical quantity movements, separate from branch books. A same-stream internal move has one source and destination in the same row and creates no ESB transaction.';
create index location_movements_stream_item_date_idx
  on ops.location_movements (org_id, branch_id, activity, item_id, item_unit_id, movement_date, id);
create index location_movements_location_balance_idx
  on ops.location_movements (org_id, branch_id, activity, item_unit_id, movement_date, from_location_id, to_location_id);

create table ops.stream_location_defaults (
  org_id uuid not null references shared.orgs(id) on delete cascade,
  branch_id uuid not null,
  activity text not null,
  production_location_id uuid,
  storage_location_id uuid,
  row_version bigint not null default 1 check (row_version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references shared.people(id) on delete set null,
  primary key (org_id, branch_id, activity),
  constraint stream_location_defaults_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade,
  constraint stream_location_defaults_production_fk foreign key (org_id, production_location_id)
    references ops.locations (org_id, id) on delete restrict,
  constraint stream_location_defaults_storage_fk foreign key (org_id, storage_location_id)
    references ops.locations (org_id, id) on delete restrict,
  constraint stream_location_defaults_activity_fk foreign key (activity) references shared.activities(code)
);
comment on table ops.stream_location_defaults is
  'Optional convenience defaults for one production stream. Defaults never authorize a capture and never backfill historical records.';

alter table ops.kitchen_logs
  add column production_location_id uuid,
  add column from_storage_location_id uuid,
  add column to_storage_location_id uuid,
  add constraint kitchen_logs_production_location_fk foreign key (org_id, production_location_id)
    references ops.locations (org_id, id) on delete restrict,
  add constraint kitchen_logs_from_storage_location_fk foreign key (org_id, from_storage_location_id)
    references ops.locations (org_id, id) on delete restrict,
  add constraint kitchen_logs_to_storage_location_fk foreign key (org_id, to_storage_location_id)
    references ops.locations (org_id, id) on delete restrict;

alter table ops.cafe_count_lines
  add column storage_location_id uuid,
  add constraint cafe_count_lines_storage_location_fk foreign key (org_id, storage_location_id)
    references ops.locations (org_id, id) on delete restrict;
drop index ops.cafe_count_lines_live_branch_item_day_uidx;
create unique index cafe_count_lines_live_branch_item_day_location_uidx
  on ops.cafe_count_lines (org_id, branch_id, count_date, wip_item_id, storage_location_id)
  nulls not distinct where status in ('Submitted', 'Confirmed');

alter table ops.cafe_receipt_lines
  add column storage_location_id uuid,
  add constraint cafe_receipt_lines_storage_location_fk foreign key (org_id, storage_location_id)
    references ops.locations (org_id, id) on delete restrict;

-- Every table added here has RLS in the same migration. Configuration and ledger writes are RPC-only.
DO $locations_rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['locations', 'location_branches', 'location_audit', 'location_movements', 'stream_location_defaults'] LOOP
    EXECUTE format('alter table ops.%I enable row level security', table_name);
    EXECUTE format('alter table ops.%I force row level security', table_name);
  END LOOP;
END;
$locations_rls$;

revoke all on ops.locations, ops.location_branches, ops.location_audit,
  ops.location_movements, ops.stream_location_defaults
  from public, anon, authenticated, service_role;
grant select on ops.locations, ops.location_branches, ops.location_movements, ops.stream_location_defaults to authenticated;
create policy locations_select_org on ops.locations
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.is_org_member()));
create policy location_branches_select_org on ops.location_branches
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.is_org_member()));
create policy stream_location_defaults_select_org on ops.stream_location_defaults
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.is_org_member()));
create policy location_movements_select_org on ops.location_movements
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.is_org_member()));
comment on policy locations_select_org on ops.locations is
  'Current-org members read active and archived identities; writes are admin-only through versioned RPCs.';
comment on policy location_branches_select_org on ops.location_branches is
  'Current-org members read physical branch availability; links do not imply shared inventory.';
comment on policy stream_location_defaults_select_org on ops.stream_location_defaults is
  'Current-org members read optional stream defaults; writes are admin-only and defaults do not grant authority.';

create function ops._reject_location_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Tenant deletion is a permitted FK cascade; direct ledger mutation remains blocked.
  if pg_catalog.pg_trigger_depth() > 1 then return null; end if;
  raise exception 'location history is append-only' using errcode = '55000';
end;
$$;
revoke execute on function ops._reject_location_ledger_mutation() from public, anon, authenticated, service_role;
create trigger location_audit_immutable
  before update or delete or truncate on ops.location_audit
  for each statement execute function ops._reject_location_ledger_mutation();
create trigger location_movements_immutable
  before update or delete or truncate on ops.location_movements
  for each statement execute function ops._reject_location_ledger_mutation();

create function ops._cafe_location_snapshot(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'name', l.name, 'use', l.use, 'parent_id', l.parent_id,
    'branch_ids', coalesce((select jsonb_agg(lb.branch_id order by lb.branch_id)
                              from ops.location_branches lb
                             where lb.org_id = l.org_id and lb.location_id = l.id), '[]'::jsonb),
    'archived_at', l.archived_at, 'row_version', l.row_version,
    'updated_at', l.updated_at, 'updated_by', l.updated_by
  )
  from ops.locations l
  where l.org_id = (select shared.current_org_id()) and l.id = p_location_id
$$;
revoke execute on function ops._cafe_location_snapshot(uuid) from public, anon, authenticated, service_role;

create function ops._validate_cafe_location_input(p_input jsonb, p_current_id uuid)
returns table(location_name text, location_use text, parent_id uuid, branch_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_name text;
  v_use text;
  v_parent uuid;
  v_branches uuid[];
begin
  if jsonb_typeof(p_input) is distinct from 'object'
     or jsonb_typeof(p_input -> 'branch_ids') is distinct from 'array'
     or jsonb_array_length(p_input -> 'branch_ids') > 200 then
    raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
  end if;
  v_name := nullif(btrim(regexp_replace(coalesce(p_input ->> 'name', ''), '\s+', ' ', 'g')), '');
  v_use := p_input ->> 'use';
  if v_name is null or char_length(v_name) > 120
     or v_use not in ('production', 'storage', 'both') then
    raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
  end if;
  if nullif(p_input ->> 'parent_id', '') is not null then
    v_parent := (p_input ->> 'parent_id')::uuid;
  end if;
  select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[])
    into v_branches
    from jsonb_array_elements_text(p_input -> 'branch_ids') as requested(value);
  if cardinality(v_branches) <> (select count(distinct branch_id) from unnest(v_branches) as ids(branch_id)) then
    raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_branches) as requested(branch_id)
    where not exists (select 1 from shared.branches b where b.org_id = v_org and b.id = requested.branch_id and b.archived_at is null)
  ) then
    raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
  end if;
  if v_parent is not null then
    if not exists (select 1 from ops.locations l where l.org_id = v_org and l.id = v_parent and l.archived_at is null) then
      raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
    end if;
    if p_current_id is not null and exists (
      with recursive ancestors(id, parent_id) as (
        select l.id, l.parent_id from ops.locations l where l.org_id = v_org and l.id = v_parent
        union all
        select parent.id, parent.parent_id from ops.locations parent join ancestors child on parent.id = child.parent_id
         where parent.org_id = v_org
      ) select 1 from ancestors where id = p_current_id
    ) then
      raise exception 'CAFE_LOCATION_CYCLE' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(v_branches) child_branch
      where not exists (select 1 from ops.location_branches parent_branch
                         where parent_branch.org_id = v_org and parent_branch.location_id = v_parent
                           and parent_branch.branch_id = child_branch)
    ) then
      raise exception 'CAFE_LOCATION_PARENT_BRANCH_MISMATCH' using errcode = '22023';
    end if;
  end if;
  return query select v_name, v_use, v_parent, v_branches;
end;
$$;
revoke execute on function ops._validate_cafe_location_input(jsonb, uuid) from public, anon, authenticated, service_role;

create function ops.list_cafe_locations(p_filter jsonb default '{}'::jsonb)
returns table(
  id uuid, name text, use text, parent_id uuid, branch_ids uuid[], archived_at timestamptz,
  row_version bigint, updated_at timestamptz, updated_by uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.name, l.use, l.parent_id,
         coalesce(array_agg(lb.branch_id order by lb.branch_id) filter (where lb.branch_id is not null), '{}'::uuid[]),
         l.archived_at, l.row_version, l.updated_at, l.updated_by
    from ops.locations l
    left join ops.location_branches lb on lb.org_id = l.org_id and lb.location_id = l.id
   where l.org_id = (select shared.current_org_id())
     and (p_filter is null or (p_filter ? 'ids') or (l.archived_at is not null) = coalesce((p_filter ->> 'archived')::boolean, false))
     and (p_filter is null or not (p_filter ? 'branch_id') or exists (
       select 1 from ops.location_branches wanted where wanted.org_id = l.org_id and wanted.location_id = l.id
         and wanted.branch_id = (p_filter ->> 'branch_id')::uuid))
     and (p_filter is null or not (p_filter ? 'use') or l.use = p_filter ->> 'use' or l.use = 'both')
     and (p_filter is null or not (p_filter ? 'ids') or l.id = any(array(select jsonb_array_elements_text(p_filter -> 'ids')::uuid)))
   group by l.id
   order by l.name, l.id
$$;
comment on function ops.list_cafe_locations(jsonb) is
  'Current-org location catalog, including archived identities when requested. Stable name/id ordering supports complete keyset-style range reads.';
revoke execute on function ops.list_cafe_locations(jsonb) from public, anon, service_role;
grant execute on function ops.list_cafe_locations(jsonb) to authenticated;

create function ops.create_cafe_location(p_input jsonb, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_input record;
  v_id uuid;
  v_hash text := md5('create|' || coalesce(p_input, 'null'::jsonb)::text);
  v_existing ops.location_audit%rowtype;
  v_snapshot jsonb;
begin
  if v_org is null or v_actor is null or not shared.is_org_member()
     or not shared.has_access_role('admin') then
    raise exception 'CAFE_LOCATION_FORBIDDEN' using errcode = '42501';
  end if;
  if p_client_request_id is null then raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || v_actor::text || ':' || p_client_request_id::text, 0));
  select * into v_existing from ops.location_audit a
   where a.org_id = v_org and a.actor_id = v_actor and a.client_request_id = p_client_request_id;
  if found then
    if v_existing.action <> 'create' or v_existing.request_hash <> v_hash then
      raise exception 'CAFE_LOCATION_REQUEST_CONFLICT' using errcode = '22023';
    end if;
    return v_existing.after_state;
  end if;
  select * into v_input from ops._validate_cafe_location_input(p_input, null);
  insert into ops.locations (org_id, name, use, parent_id, created_by, updated_by)
  values (v_org, v_input.location_name, v_input.location_use, v_input.parent_id, v_actor, v_actor)
  returning id into v_id;
  insert into ops.location_branches (org_id, location_id, branch_id)
  select v_org, v_id, branch_id from unnest(v_input.branch_ids) as branches(branch_id);
  v_snapshot := ops._cafe_location_snapshot(v_id);
  insert into ops.location_audit (org_id, location_id, actor_id, client_request_id, request_hash, action, row_version, after_state)
  values (v_org, v_id, v_actor, p_client_request_id, v_hash, 'create', 1, v_snapshot);
  return v_snapshot;
exception when unique_violation then
  raise exception 'CAFE_LOCATION_DUPLICATE' using errcode = '23505';
end;
$$;
comment on function ops.create_cafe_location(jsonb, uuid) is
  'Admin-only, same-org, idempotent creation with validated branch availability and append-only audit.';
revoke execute on function ops.create_cafe_location(jsonb, uuid) from public, anon, service_role;
grant execute on function ops.create_cafe_location(jsonb, uuid) to authenticated;

create function ops.update_cafe_location(p_id uuid, p_expected_version bigint, p_input jsonb, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_input record;
  v_location ops.locations%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_hash text := md5('update|' || p_id::text || '|' || p_expected_version::text || '|' || coalesce(p_input, 'null'::jsonb)::text);
  v_existing ops.location_audit%rowtype;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() or not shared.has_access_role('admin') then
    raise exception 'CAFE_LOCATION_FORBIDDEN' using errcode = '42501';
  end if;
  if p_id is null or p_expected_version is null or p_client_request_id is null then
    raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || v_actor::text || ':' || p_client_request_id::text, 0));
  select * into v_existing from ops.location_audit a where a.org_id = v_org and a.actor_id = v_actor and a.client_request_id = p_client_request_id;
  if found then
    if v_existing.action <> 'update' or v_existing.request_hash <> v_hash then raise exception 'CAFE_LOCATION_REQUEST_CONFLICT' using errcode = '22023'; end if;
    return v_existing.after_state;
  end if;
  select * into v_location from ops.locations l where l.org_id = v_org and l.id = p_id for update;
  if not found then raise exception 'CAFE_LOCATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_location.row_version <> p_expected_version then raise exception 'CAFE_LOCATION_VERSION_CONFLICT' using errcode = '40001'; end if;
  if v_location.archived_at is not null then raise exception 'CAFE_LOCATION_ARCHIVED' using errcode = '22023'; end if;
  select * into v_input from ops._validate_cafe_location_input(p_input, p_id);
  if exists (
    select 1 from ops.location_branches child
    where child.org_id = v_org and child.location_id in (select id from ops.locations where org_id = v_org and parent_id = p_id and archived_at is null)
      and not (child.branch_id = any(v_input.branch_ids))
  ) then raise exception 'CAFE_LOCATION_IN_USE' using errcode = 'P0001'; end if;
  if exists (
    select 1 from ops.location_movements m
    where m.org_id = v_org and (m.from_location_id = p_id or m.to_location_id = p_id)
      and not (m.branch_id = any(v_input.branch_ids))
  ) or exists (
    select 1 from ops.kitchen_logs l
    where l.org_id=v_org and l.status in ('Draft','Submitted')
      and p_id in (l.production_location_id,l.from_storage_location_id,l.to_storage_location_id)
      and not (case when l.action='transfer' and l.to_storage_location_id=p_id then l.destination_branch_id else l.branch_id end = any(v_input.branch_ids))
  ) or exists (
    select 1 from ops.cafe_count_lines c
    where c.org_id=v_org and c.status='Submitted' and c.storage_location_id=p_id and not (c.branch_id=any(v_input.branch_ids))
  ) or exists (
    select 1 from ops.cafe_receipts r join ops.cafe_receipt_lines line on line.org_id=r.org_id and line.receipt_id=r.id
    where r.org_id=v_org and r.status in ('Counted','Submitted') and line.storage_location_id=p_id and not (r.branch_id=any(v_input.branch_ids))
  ) then raise exception 'CAFE_LOCATION_IN_USE' using errcode = 'P0001'; end if;
  v_before := ops._cafe_location_snapshot(p_id);
  update ops.locations set name = v_input.location_name, use = v_input.location_use, parent_id = v_input.parent_id,
         row_version = row_version + 1, updated_at = clock_timestamp(), updated_by = v_actor
   where org_id = v_org and id = p_id returning * into v_location;
  delete from ops.location_branches where org_id = v_org and location_id = p_id;
  insert into ops.location_branches (org_id, location_id, branch_id)
  select v_org, p_id, branch_id from unnest(v_input.branch_ids) as branches(branch_id);
  v_after := ops._cafe_location_snapshot(p_id);
  insert into ops.location_audit (org_id, location_id, actor_id, client_request_id, request_hash, action, row_version, before_state, after_state)
  values (v_org, p_id, v_actor, p_client_request_id, v_hash, 'update', v_location.row_version, v_before, v_after);
  return v_after;
exception when unique_violation then
  raise exception 'CAFE_LOCATION_DUPLICATE' using errcode = '23505';
end;
$$;
comment on function ops.update_cafe_location(uuid, bigint, jsonb, uuid) is
  'Admin-only optimistic update. Rejects stale versions, cycles, parent-availability violations, and branch unlinks used by movement history.';
revoke execute on function ops.update_cafe_location(uuid, bigint, jsonb, uuid) from public, anon, service_role;
grant execute on function ops.update_cafe_location(uuid, bigint, jsonb, uuid) to authenticated;

create function ops.archive_cafe_location(p_id uuid, p_expected_version bigint, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_location ops.locations%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_hash text := md5('archive|' || p_id::text || '|' || p_expected_version::text);
  v_existing ops.location_audit%rowtype;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() or not shared.has_access_role('admin') then
    raise exception 'CAFE_LOCATION_FORBIDDEN' using errcode = '42501';
  end if;
  if p_id is null or p_expected_version is null or p_client_request_id is null then raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || v_actor::text || ':' || p_client_request_id::text, 0));
  select * into v_existing from ops.location_audit a where a.org_id = v_org and a.actor_id = v_actor and a.client_request_id = p_client_request_id;
  if found then
    if v_existing.action <> 'archive' or v_existing.request_hash <> v_hash then raise exception 'CAFE_LOCATION_REQUEST_CONFLICT' using errcode = '22023'; end if;
    return v_existing.after_state;
  end if;
  select * into v_location from ops.locations l where l.org_id = v_org and l.id = p_id for update;
  if not found then raise exception 'CAFE_LOCATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_location.row_version <> p_expected_version then raise exception 'CAFE_LOCATION_VERSION_CONFLICT' using errcode = '40001'; end if;
  if v_location.archived_at is not null then return ops._cafe_location_snapshot(p_id); end if;
  if exists (select 1 from ops.locations child where child.org_id = v_org and child.parent_id = p_id and child.archived_at is null)
     or exists (
       select 1 from ops.location_movements m
       where m.org_id = v_org and (m.from_location_id = p_id or m.to_location_id = p_id)
       group by m.item_unit_id
       having sum(case when m.to_location_id = p_id then m.quantity else 0 end)
            - sum(case when m.from_location_id = p_id then m.quantity else 0 end) <> 0
     )
     or exists (select 1 from ops.kitchen_logs l where l.org_id = v_org and l.status in ('Submitted', 'Draft')
                 and p_id in (l.production_location_id, l.from_storage_location_id, l.to_storage_location_id))
     or exists (select 1 from ops.cafe_count_lines c where c.org_id = v_org and c.status = 'Submitted' and c.storage_location_id = p_id)
     or exists (select 1 from ops.cafe_receipts r join ops.cafe_receipt_lines l on l.org_id = r.org_id and l.receipt_id = r.id
                 where r.org_id = v_org and r.status in ('Counted', 'Submitted') and l.storage_location_id = p_id) then
    raise exception 'CAFE_LOCATION_IN_USE' using errcode = 'P0001';
  end if;
  v_before := ops._cafe_location_snapshot(p_id);
  update ops.locations set archived_at = clock_timestamp(), row_version = row_version + 1,
         updated_at = clock_timestamp(), updated_by = v_actor
   where org_id = v_org and id = p_id returning * into v_location;
  v_after := ops._cafe_location_snapshot(p_id);
  insert into ops.location_audit (org_id, location_id, actor_id, client_request_id, request_hash, action, row_version, before_state, after_state)
  values (v_org, p_id, v_actor, p_client_request_id, v_hash, 'archive', v_location.row_version, v_before, v_after);
  return v_after;
end;
$$;
comment on function ops.archive_cafe_location(uuid, bigint, uuid) is
  'Admin-only soft archive. Preserves identity and history and refuses nonzero balances, active children, and pending capture references.';
revoke execute on function ops.archive_cafe_location(uuid, bigint, uuid) from public, anon, service_role;
grant execute on function ops.archive_cafe_location(uuid, bigint, uuid) to authenticated;

create function ops.get_cafe_stream_location_defaults(p_branch_id uuid, p_activity text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_row ops.stream_location_defaults%rowtype;
begin
  if v_org is null or not shared.is_org_member() then raise exception 'CAFE_LOCATION_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_row from ops.stream_location_defaults d where d.org_id = v_org and d.branch_id = p_branch_id and d.activity = p_activity;
  if not found then return null; end if;
  return jsonb_build_object('production_location_id', v_row.production_location_id, 'storage_location_id', v_row.storage_location_id, 'row_version', v_row.row_version);
end;
$$;
revoke execute on function ops.get_cafe_stream_location_defaults(uuid, text) from public, anon, service_role;
grant execute on function ops.get_cafe_stream_location_defaults(uuid, text) to authenticated;

create function ops.save_cafe_stream_location_defaults(
  p_branch_id uuid, p_activity text, p_defaults jsonb, p_expected_version integer, p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id();
  v_production uuid; v_storage uuid; v_row ops.stream_location_defaults%rowtype;
  v_before jsonb; v_after jsonb; v_hash text; v_existing ops.location_audit%rowtype;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() or not shared.has_access_role('admin') then
    raise exception 'CAFE_LOCATION_FORBIDDEN' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_client_request_id is null or p_defaults is null or jsonb_typeof(p_defaults) <> 'object'
     or p_activity is null or p_activity not in ('kitchen', 'bar') or p_branch_id is null then
    raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
  end if;
  if nullif(p_defaults ->> 'production_location_id', '') is not null then v_production := (p_defaults ->> 'production_location_id')::uuid; end if;
  if nullif(p_defaults ->> 'storage_location_id', '') is not null then v_storage := (p_defaults ->> 'storage_location_id')::uuid; end if;
  v_hash := md5(jsonb_build_object('branch_id',p_branch_id,'activity',p_activity,'defaults',p_defaults,'expected_version',p_expected_version)::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || v_actor::text || ':' || p_client_request_id::text,0));
  select * into v_existing from ops.location_audit a
   where a.org_id=v_org and a.actor_id=v_actor and a.client_request_id=p_client_request_id;
  if found then
    if v_existing.action<>'defaults' or v_existing.request_hash<>v_hash then
      raise exception 'CAFE_LOCATION_REQUEST_CONFLICT' using errcode = '22023';
    end if;
    return jsonb_build_object('row_version',(v_existing.after_state->>'row_version')::bigint);
  end if;
  if not exists (select 1 from shared.teams t where t.org_id=v_org and t.branch_id=p_branch_id and t.activity=p_activity and t.archived_at is null) then
    raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
  end if;
  if (v_production is not null and not exists (
        select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
        where l.org_id=v_org and l.id=v_production and l.archived_at is null and l.use in ('production','both') and b.branch_id=p_branch_id))
     or (v_storage is not null and not exists (
        select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
        where l.org_id=v_org and l.id=v_storage and l.archived_at is null and l.use in ('storage','both') and b.branch_id=p_branch_id)) then
    raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
  end if;
  select jsonb_build_object('production_location_id',d.production_location_id,'storage_location_id',d.storage_location_id,'row_version',d.row_version)
    into v_before from ops.stream_location_defaults d where d.org_id=v_org and d.branch_id=p_branch_id and d.activity=p_activity;
  select * into v_row from ops.stream_location_defaults d where d.org_id=v_org and d.branch_id=p_branch_id and d.activity=p_activity for update;
  if not found then
    if p_expected_version <> 0 then raise exception 'CAFE_LOCATION_VERSION_CONFLICT' using errcode = '40001'; end if;
    insert into ops.stream_location_defaults (org_id, branch_id, activity, production_location_id, storage_location_id, updated_by)
    values (v_org,p_branch_id,p_activity,v_production,v_storage,v_actor) returning * into v_row;
  else
    if v_row.row_version <> p_expected_version then raise exception 'CAFE_LOCATION_VERSION_CONFLICT' using errcode = '40001'; end if;
    update ops.stream_location_defaults set production_location_id=v_production, storage_location_id=v_storage,
      row_version=row_version+1, updated_at=clock_timestamp(), updated_by=v_actor
    where org_id=v_org and branch_id=p_branch_id and activity=p_activity returning * into v_row;
  end if;
  v_after := jsonb_build_object('branch_id',p_branch_id,'activity',p_activity,
    'production_location_id',v_row.production_location_id,'storage_location_id',v_row.storage_location_id,'row_version',v_row.row_version);
  insert into ops.location_audit (org_id,location_id,actor_id,client_request_id,request_hash,action,row_version,before_state,after_state)
  values (v_org,null,v_actor,p_client_request_id,v_hash,'defaults',v_row.row_version,v_before,v_after);
  return jsonb_build_object('row_version',v_row.row_version);
end;
$$;
revoke execute on function ops.save_cafe_stream_location_defaults(uuid,text,jsonb,integer,uuid) from public, anon, service_role;
grant execute on function ops.save_cafe_stream_location_defaults(uuid,text,jsonb,integer,uuid) to authenticated;

create function ops.cafe_location_balances(p_as_of date, p_branch_id uuid, p_activity text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_rows jsonb;
  v_unassigned boolean;
  v_bad_unit boolean;
  v_overallocated boolean;
  v_coverage text;
  v_reason text;
begin
  if v_org is null or not shared.is_org_member() then raise exception 'CAFE_LOCATION_FORBIDDEN' using errcode = '42501'; end if;
  if p_as_of is null or p_activity not in ('kitchen','bar') then
    raise exception 'CAFE_LOCATION_BALANCE_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from shared.teams t where t.org_id=v_org and t.branch_id=p_branch_id and t.activity=p_activity and t.archived_at is null) then
    return jsonb_build_object('rows','[]'::jsonb,'as_of',clock_timestamp(),'coverage','unavailable','reason','stream_unavailable');
  end if;
  with stock as materialized (
    select * from ops.kitchen_stock_for_date(p_as_of,p_branch_id,p_activity)
  ), book as materialized (
    select stock.wip_item_id as item_id, unit.id as item_unit_id,
           stock.usable_qty, stock.available_qty
      from stock
      join ops.item_units unit on unit.wip_item_id=stock.wip_item_id and unit.org_id=v_org and unit.is_default
  ), location_balances as materialized (
    select m.item_id, m.item_unit_id, place.location_id,
           sum(case when m.to_location_id=place.location_id then m.quantity else 0 end)
             - sum(case when m.from_location_id=place.location_id then m.quantity else 0 end) as usable_qty,
           sum(case when m.movement_date<p_as_of and m.to_location_id=place.location_id then m.quantity else 0 end)
             - sum(case when m.movement_date<p_as_of and m.from_location_id=place.location_id then m.quantity else 0 end) as available_qty
      from ops.location_movements m
      cross join lateral (values (m.from_location_id),(m.to_location_id)) as place(location_id)
     where m.org_id=v_org and m.branch_id=p_branch_id and m.activity=p_activity
       and place.location_id is not null and m.movement_date<=p_as_of
     group by m.item_id,m.item_unit_id,place.location_id
  ), residuals as materialized (
    select null::uuid as location_id, book.item_id, book.item_unit_id,
           book.usable_qty-coalesce(sum(location_balances.usable_qty),0) as usable_qty,
           book.available_qty-coalesce(sum(location_balances.available_qty),0) as available_qty
      from book left join location_balances using (item_id,item_unit_id)
     group by book.item_id,book.item_unit_id,book.usable_qty,book.available_qty
  ), all_rows as materialized (
    select location_id,item_id,item_unit_id,usable_qty,available_qty from location_balances
    union all
    select location_id,item_id,item_unit_id,usable_qty,available_qty from residuals
     where usable_qty is null or available_qty is null or usable_qty<>0 or available_qty<>0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'location_id',all_rows.location_id,'item_id',all_rows.item_id,'item_unit_id',all_rows.item_unit_id,
           'usable_qty',all_rows.usable_qty::text,'available_qty',all_rows.available_qty::text
         ) order by all_rows.item_id,all_rows.item_unit_id,all_rows.location_id nulls first),'[]'::jsonb),
         exists(select 1 from residuals where usable_qty<>0 or available_qty<>0),
         exists(select 1 from residuals where usable_qty<0 or available_qty<0),
         exists(select 1 from stock where available_qty is null or not exists (
           select 1 from ops.item_units unit where unit.wip_item_id=stock.wip_item_id and unit.org_id=v_org and unit.is_default
         )) or exists(select 1 from location_balances lb where not exists (
           select 1 from book where book.item_id=lb.item_id and book.item_unit_id=lb.item_unit_id
         ))
    into v_rows,v_unassigned,v_overallocated,v_bad_unit
    from all_rows;
  if v_bad_unit or v_overallocated then
    v_coverage := 'unavailable'; v_reason := case when v_bad_unit then 'historical_unit_unavailable' else 'location_balance_exceeds_stream' end;
  elsif v_unassigned then
    v_coverage := 'unallocated'; v_reason := 'opening_allocation_required';
  else
    v_coverage := 'complete'; v_reason := null;
  end if;
  return jsonb_build_object('rows',v_rows,'as_of',statement_timestamp(),'coverage',v_coverage,'reason',v_reason);
end;
$$;
comment on function ops.cafe_location_balances(date, uuid, text) is
  'Returns the existing stream usable/available totals only in Unassigned until opening allocation history exists. It never reconstructs a physical place from old production, a branch, a Site, or a default.';
revoke execute on function ops.cafe_location_balances(date, uuid, text) from public, anon, service_role;
grant execute on function ops.cafe_location_balances(date, uuid, text) to authenticated;

create function ops.move_cafe_stock(p_input jsonb, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id();
  v_branch uuid; v_activity text; v_unit uuid; v_item uuid; v_quantity numeric;
  v_from uuid; v_to uuid; v_date date; v_note text; v_hash text;
  v_existing ops.location_movements%rowtype; v_balance numeric; v_row ops.location_movements%rowtype;
  v_movement_id uuid := gen_random_uuid();
begin
  if v_org is null or v_actor is null or not shared.is_org_member()
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_LOCATION_MOVE_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'stream') is distinct from 'object'
     or p_client_request_id is null then raise exception 'CAFE_LOCATION_MOVE_INVALID' using errcode = '22023'; end if;
  v_branch := (p_input->'stream'->>'branch_id')::uuid; v_activity := p_input->'stream'->>'activity';
  v_unit := (p_input->>'item_unit_id')::uuid; v_from := (p_input->>'from_location_id')::uuid; v_to := (p_input->>'to_location_id')::uuid;
  if coalesce(p_input->>'quantity','') !~ '^[0-9]{1,10}([.,][0-9]{1,4})?$' then
    raise exception 'CAFE_LOCATION_MOVE_INVALID' using errcode = '22023';
  end if;
  v_quantity := replace(p_input->>'quantity',',','.')::numeric; v_date := (p_input->>'movement_date')::date;
  v_note := nullif(btrim(p_input->>'note'),'');
  if v_branch is null or v_activity is null or v_activity not in ('kitchen','bar') or v_unit is null
     or v_from is null or v_to is null or v_from=v_to or v_quantity is null
     or v_quantity <= 0 or v_quantity > 9999999999.9999 or v_date is null
     or (v_note is not null and char_length(v_note)>500) then
    raise exception 'CAFE_LOCATION_MOVE_INVALID' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('stream',jsonb_build_object('branch_id',v_branch,'activity',v_activity),
      'item_unit_id',v_unit,'quantity',v_quantity::text,'from_location_id',v_from,'to_location_id',v_to,
      'movement_date',v_date,'note',v_note)::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || v_actor::text || ':' || p_client_request_id::text, 0));
  select * into v_existing from ops.location_movements m where m.org_id=v_org and m.actor_id=v_actor and m.client_request_id=p_client_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'CAFE_LOCATION_MOVE_REQUEST_CONFLICT' using errcode = '22023'; end if;
    return jsonb_build_object('movement_id',v_existing.id,'row_version',v_existing.row_version);
  end if;
  -- A stream membership permits help-out on another stream, matching Café capture; it does not grant admin settings rights.
  if not exists (select 1 from shared.teams t join shared.branches b on b.org_id=t.org_id and b.id=t.branch_id
    where t.org_id=v_org and t.branch_id=v_branch and t.activity=v_activity and t.archived_at is null and b.archived_at is null) then
    raise exception 'CAFE_LOCATION_MOVE_STREAM_INVALID' using errcode = '22023';
  end if;
  select unit.wip_item_id into v_item from ops.item_units unit
   join ops.wip_items item on item.id=unit.wip_item_id and item.org_id=unit.org_id and item.flag_active
   where unit.org_id=v_org and unit.id=v_unit and unit.confirmed_at is not null and unit.is_default;
  if v_item is null or not exists (select 1 from ops.stream_items si where si.org_id=v_org and si.branch_id=v_branch and si.activity=v_activity and si.wip_item_id=v_item) then
    raise exception 'CAFE_LOCATION_MOVE_ITEM_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from ops.locations l join ops.location_branches lb on lb.org_id=l.org_id and lb.location_id=l.id
      where l.org_id=v_org and l.id=v_from and l.archived_at is null and l.use in ('storage','both') and lb.branch_id=v_branch)
     or not exists (select 1 from ops.locations l join ops.location_branches lb on lb.org_id=l.org_id and lb.location_id=l.id
      where l.org_id=v_org and l.id=v_to and l.archived_at is null and l.use in ('storage','both') and lb.branch_id=v_branch) then
    raise exception 'CAFE_LOCATION_MOVE_LOCATION_INVALID' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || v_branch::text || ':' || v_activity || ':' || v_unit::text, 0));
  select coalesce(sum(case when m.to_location_id=v_from then m.quantity else 0 end)
                   - sum(case when m.from_location_id=v_from then m.quantity else 0 end),0)
    into v_balance from ops.location_movements m
   where m.org_id=v_org and m.branch_id=v_branch and m.activity=v_activity and m.item_unit_id=v_unit and m.movement_date<=v_date;
  if v_balance < v_quantity then raise exception 'CAFE_LOCATION_MOVE_INSUFFICIENT_STOCK' using errcode = 'P0001'; end if;
  if (ops.cafe_location_balances(v_date,v_branch,v_activity)->>'coverage') <> 'complete' then
    raise exception 'CAFE_LOCATION_MOVE_BALANCE_UNALLOCATED' using errcode = 'P0001';
  end if;
  insert into ops.location_movements (id,org_id,branch_id,activity,item_id,item_unit_id,from_location_id,to_location_id,
    quantity,movement_date,kind,source_type,source_id,actor_id,client_request_id,payload_hash,note)
  values (v_movement_id,v_org,v_branch,v_activity,v_item,v_unit,v_from,v_to,v_quantity,v_date,'move','move',v_movement_id,v_actor,p_client_request_id,v_hash,v_note)
  returning * into v_row;
  return jsonb_build_object('movement_id',v_row.id,'row_version',v_row.row_version);
end;
$$;
comment on function ops.move_cafe_stock(jsonb, uuid) is
  'Posts one atomic, idempotent, same-stream physical move after checking complete location coverage and the exact item-unit source balance. It writes no ESB transaction.';
revoke execute on function ops.move_cafe_stock(jsonb, uuid) from public, anon, service_role;
grant execute on function ops.move_cafe_stock(jsonb, uuid) to authenticated;

create function ops.cafe_record_locations(p_source text, p_ids uuid[])
returns table(
  record_id uuid, production_location_id uuid, from_storage_location_id uuid,
  to_storage_location_id uuid, storage_location_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not shared.is_org_member() or p_ids is null or cardinality(p_ids)>200
     or p_source not in ('log','count','receipt','move') then
    raise exception 'CAFE_LOCATION_RECORDS_INVALID' using errcode = '22023';
  end if;
  if p_source='log' then
    return query select l.id,l.production_location_id,l.from_storage_location_id,l.to_storage_location_id,null::uuid
      from ops.kitchen_logs l where l.org_id=shared.current_org_id() and l.id=any(p_ids);
  elsif p_source='count' then
    return query select c.id,null::uuid,null::uuid,null::uuid,c.storage_location_id
      from ops.cafe_count_lines c where c.org_id=shared.current_org_id() and c.id=any(p_ids);
  elsif p_source='receipt' then
    return query select l.id,null::uuid,null::uuid,null::uuid,l.storage_location_id
      from ops.cafe_receipt_lines l join ops.cafe_receipts r on r.org_id=l.org_id and r.id=l.receipt_id
      where l.org_id=shared.current_org_id() and l.id=any(p_ids);
  else
    return query select m.id,null::uuid,m.from_location_id,m.to_location_id,null::uuid
      from ops.location_movements m where m.org_id=shared.current_org_id() and m.id=any(p_ids);
  end if;
end;
$$;
comment on function ops.cafe_record_locations(text, uuid[]) is
  'Location projection by stored record ids. Parent-table RLS remains the read authority; missing historical values remain NULL.';
revoke execute on function ops.cafe_record_locations(text, uuid[]) from public, anon, service_role;
grant execute on function ops.cafe_record_locations(text, uuid[]) to authenticated;

-- Optional capture fields are validated against the active physical catalog and branch availability.
-- A NULL value is retained as Unassigned; this guard never chooses a first location.
create function ops._guard_cafe_capture_locations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action text;
  v_to_branch uuid;
  v_capture_org uuid := coalesce(new.org_id, shared.current_org_id());
begin
  if tg_table_name='kitchen_logs' then
    v_action := new.action;
    if (v_action='produce' and new.from_storage_location_id is not null)
       or (v_action='transfer' and new.production_location_id is not null)
       or (v_action='waste' and (new.production_location_id is not null or new.to_storage_location_id is not null)) then
      raise exception 'CAFE_LOCATION_FIELD_NOT_ALLOWED' using errcode = '22023';
    end if;
    if v_action='transfer' then v_to_branch := new.destination_branch_id; else v_to_branch := new.branch_id; end if;
    if new.production_location_id is not null and (tg_op='INSERT' or new.production_location_id is distinct from old.production_location_id) and not exists (
      select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
       where l.org_id=v_capture_org and l.id=new.production_location_id and l.archived_at is null
         and l.use in ('production','both') and b.branch_id=new.branch_id) then
      raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514';
    end if;
    if new.from_storage_location_id is not null and (tg_op='INSERT' or new.from_storage_location_id is distinct from old.from_storage_location_id) and not exists (
      select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
       where l.org_id=v_capture_org and l.id=new.from_storage_location_id and l.archived_at is null
         and l.use in ('storage','both') and b.branch_id=new.branch_id) then
      raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514';
    end if;
    if new.to_storage_location_id is not null and (tg_op='INSERT' or new.to_storage_location_id is distinct from old.to_storage_location_id) and not exists (
      select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
       where l.org_id=v_capture_org and l.id=new.to_storage_location_id and l.archived_at is null
         and l.use in ('storage','both') and b.branch_id=v_to_branch) then
      raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514';
    end if;
    if tg_op='UPDATE' and old.status in ('Approved','Rejected') and
       (new.production_location_id,new.from_storage_location_id,new.to_storage_location_id)
       is distinct from (old.production_location_id,old.from_storage_location_id,old.to_storage_location_id) then
      raise exception 'CAFE_LOCATION_FACTS_IMMUTABLE' using errcode = '42501';
    end if;
  elsif tg_table_name='cafe_count_lines' then
    if tg_op='UPDATE' and new.storage_location_id is distinct from old.storage_location_id then
      raise exception 'CAFE_LOCATION_FACTS_IMMUTABLE' using errcode = '42501';
    end if;
    if new.storage_location_id is not null and tg_op='INSERT' and not exists (
      select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
       where l.org_id=v_capture_org and l.id=new.storage_location_id and l.archived_at is null
         and l.use in ('storage','both') and b.branch_id=new.branch_id) then
      raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514';
    end if;
  else
    if tg_op='UPDATE' and new.storage_location_id is distinct from old.storage_location_id then
      raise exception 'CAFE_LOCATION_FACTS_IMMUTABLE' using errcode = '42501';
    end if;
    select r.branch_id into v_to_branch from ops.cafe_receipts r where r.org_id=v_capture_org and r.id=new.receipt_id;
    if new.storage_location_id is not null and tg_op='INSERT' and not exists (
      select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
       where l.org_id=v_capture_org and l.id=new.storage_location_id and l.archived_at is null
         and l.use in ('storage','both') and b.branch_id=v_to_branch) then
      raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function ops._guard_cafe_capture_locations() from public, anon, authenticated, service_role;
create trigger cafe_kitchen_log_location_guard before insert or update on ops.kitchen_logs
  for each row execute function ops._guard_cafe_capture_locations();
create trigger cafe_count_line_location_guard before insert or update on ops.cafe_count_lines
  for each row execute function ops._guard_cafe_capture_locations();
create trigger cafe_receipt_line_location_guard before insert or update on ops.cafe_receipt_lines
  for each row execute function ops._guard_cafe_capture_locations();

-- Existing capture RPC shape is retained; optional per-line locations are now stored and validated.
create or replace function ops.insert_cafe_capture_logs(p_rows jsonb)
returns setof ops.kitchen_logs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid := (select shared.current_org_id());
  v_client_request_id uuid;
begin
  if v_org_id is null then raise exception 'an authenticated organization is required' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'capture rows must be a JSON array' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as requested(client_request_id uuid) where requested.client_request_id is null) then
    raise exception 'client_request_id is required for each café capture row' using errcode = '22023';
  end if;
  for v_client_request_id in
    select distinct requested.client_request_id from jsonb_to_recordset(p_rows) as requested(client_request_id uuid)
    order by requested.client_request_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org_id::text || ':' || v_client_request_id::text, 0));
  end loop;
  if exists (
    select 1
      from jsonb_to_recordset(p_rows) as requested(
        client_request_id uuid, production_location_id uuid, from_storage_location_id uuid, to_storage_location_id uuid)
      join ops.kitchen_logs existing on existing.org_id=v_org_id and existing.client_request_id=requested.client_request_id
     where (existing.production_location_id,existing.from_storage_location_id,existing.to_storage_location_id)
       is distinct from (requested.production_location_id,requested.from_storage_location_id,requested.to_storage_location_id)
  ) then raise exception 'CAFE_CAPTURE_CLIENT_REQUEST_CONFLICT' using errcode = '22023'; end if;
  with input_rows as materialized (
    select capture.*, requested.ordinality
      from jsonb_array_elements(p_rows) with ordinality as requested(value, ordinality)
      cross join lateral jsonb_to_record(requested.value) as capture(
        client_request_id uuid,business_unit_id uuid,log_date date,branch_id uuid,activity text,action text,
        destination_branch_id uuid,wip_item_id uuid,item_unit_id uuid,qty_porsi numeric,entry_quantity numeric,
        entry_unit_factor numeric,entry_unit_name text,notes text,production_location_id uuid,
        from_storage_location_id uuid,to_storage_location_id uuid)
  )
  insert into ops.kitchen_logs (
    business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,item_unit_id,
    qty_porsi,entry_quantity,entry_unit_factor,entry_unit_name,notes,production_location_id,
    from_storage_location_id,to_storage_location_id,status,client_request_id
  )
  select input.business_unit_id,input.log_date,input.branch_id,input.activity,input.action,input.destination_branch_id,
         input.wip_item_id,input.item_unit_id,input.qty_porsi,input.entry_quantity,input.entry_unit_factor,
         input.entry_unit_name,input.notes,input.production_location_id,input.from_storage_location_id,
         input.to_storage_location_id,case when input.action='waste' then 'Draft' else 'Submitted' end,input.client_request_id
    from input_rows input
   where not exists (select 1 from ops.kitchen_logs existing where existing.org_id=v_org_id and existing.client_request_id=input.client_request_id)
  on conflict (org_id,client_request_id) do nothing;
  return query
  with input_rows as materialized (
    select capture.client_request_id,requested.ordinality
      from jsonb_array_elements(p_rows) with ordinality as requested(value,ordinality)
      cross join lateral jsonb_to_record(requested.value) as capture(client_request_id uuid)
  )
  select existing.* from input_rows input join ops.kitchen_logs existing
    on existing.org_id=v_org_id and existing.client_request_id=input.client_request_id
   order by input.ordinality;
end;
$$;
revoke execute on function ops.insert_cafe_capture_logs(jsonb) from public, anon;
grant execute on function ops.insert_cafe_capture_logs(jsonb) to authenticated;

create or replace function ops.submit_cafe_counts(p_branch_id uuid, p_activity text, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb; v_key uuid; v_item_id uuid; v_qty numeric; v_location_id uuid;
  v_existing ops.cafe_count_lines%rowtype; v_item record; v_result jsonb := '[]'::jsonb; v_outcome jsonb;
  v_org_id uuid := shared.current_org_id(); v_submitter_id uuid := shared.current_person_id();
  v_today date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
begin
  if v_org_id is null or v_submitter_id is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.teams t join shared.branches b on b.id=t.branch_id and b.org_id=t.org_id
    where t.org_id=v_org_id and t.branch_id=p_branch_id and t.activity=p_activity and t.archived_at is null and b.archived_at is null) then
    raise exception 'CAFE_COUNT_STREAM_NOT_FOUND' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>150 then
    raise exception 'CAFE_COUNT_SUBMIT_LIMIT: submit between 0 and 150 lines' using errcode = '22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    v_key:=null; v_item_id:=null; v_qty:=null; v_location_id:=null;
    if jsonb_typeof(v_line)<>'object' or v_line ? 'production_location_id' or v_line ? 'from_storage_location_id' or v_line ? 'to_storage_location_id'
       or coalesce(v_line->>'client_key','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_line->>'client_key','outcome','refused','reason','invalid_line'));
      continue;
    end if;
    v_key:=(v_line->>'client_key')::uuid;
    if coalesce(v_line->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_line->>'quantity','') !~ '^([0-9]+)([.,][0-9]{1,4})?$'
       or (v_line ? 'storage_location_id' and nullif(v_line->>'storage_location_id','') is not null
           and coalesce(v_line->>'storage_location_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','invalid_quantity_or_item'));
      continue;
    end if;
    v_item_id:=(v_line->>'item_id')::uuid; v_qty:=replace(v_line->>'quantity',',','.')::numeric;
    if nullif(v_line->>'storage_location_id','') is not null then v_location_id:=(v_line->>'storage_location_id')::uuid; end if;
    if v_qty>9999999999.9999 then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','invalid_quantity'));
      continue;
    end if;
    if v_location_id is not null and not exists (
      select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
       where l.org_id=v_org_id and l.id=v_location_id and l.archived_at is null and l.use in ('storage','both') and b.branch_id=p_branch_id
    ) then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','invalid_location'));
      continue;
    end if;
    select * into v_existing from ops.cafe_count_lines line where line.org_id=v_org_id and line.client_key=v_key;
    if found then
      if v_existing.submitted_by=v_submitter_id and v_existing.branch_id=p_branch_id and v_existing.activity=p_activity
         and v_existing.wip_item_id=v_item_id and v_existing.counted_quantity=v_qty
         and v_existing.storage_location_id is not distinct from v_location_id then
        v_outcome:=jsonb_build_object('client_key',v_key,'outcome','existing','line_id',v_existing.id);
      else
        v_outcome:=jsonb_build_object('client_key',v_key,'outcome','refused','reason','client_key_conflict');
      end if;
      v_result:=v_result||jsonb_build_array(v_outcome); continue;
    end if;
    select * into v_item from ops.cafe_countable_items(p_branch_id,p_activity) item where item.item_id=v_item_id;
    if not found then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','item_not_countable'));
      continue;
    end if;
    begin
      insert into ops.cafe_count_lines (
        org_id,branch_id,activity,count_date,wip_item_id,item_name,item_category,item_kind,item_unit_id,unit_name,
        counted_quantity,storage_location_id,client_key,source,status,posting_status,submitted_by
      ) values (
        v_org_id,p_branch_id,p_activity,v_today,v_item.item_id,v_item.item_name,v_item.item_category,v_item.item_kind,
        v_item.item_unit_id,v_item.unit_name,v_qty,v_location_id,v_key,'mos','Submitted','not_posted',v_submitter_id
      ) on conflict (org_id,client_key) do nothing returning * into v_existing;
      if found then
        v_outcome:=jsonb_build_object('client_key',v_key,'outcome','submitted','line_id',v_existing.id);
      else
        select * into v_existing from ops.cafe_count_lines line where line.org_id=v_org_id and line.client_key=v_key;
        if found and v_existing.submitted_by=v_submitter_id and v_existing.branch_id=p_branch_id and v_existing.activity=p_activity
           and v_existing.wip_item_id=v_item_id and v_existing.counted_quantity=v_qty
           and v_existing.storage_location_id is not distinct from v_location_id then
          v_outcome:=jsonb_build_object('client_key',v_key,'outcome','existing','line_id',v_existing.id);
        else v_outcome:=jsonb_build_object('client_key',v_key,'outcome','refused','reason','client_key_conflict'); end if;
      end if;
    exception when unique_violation then
      v_outcome:=jsonb_build_object('client_key',v_key,'outcome','refused','reason','already_counted');
    end;
    v_result:=v_result||jsonb_build_array(v_outcome);
  end loop;
  return v_result;
end;
$$;
revoke execute on function ops.submit_cafe_counts(uuid,text,jsonb) from public, anon;
grant execute on function ops.submit_cafe_counts(uuid,text,jsonb) to authenticated;

create or replace function ops.submit_cafe_receipt(
  p_branch_id uuid,p_activity text,p_arrival_date date,p_client_key uuid,p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid:=shared.current_org_id(); v_person_id uuid:=shared.current_person_id();
  v_line jsonb; v_requested jsonb; v_existing ops.cafe_receipts%rowtype;
  v_existing_lines jsonb; v_receipt ops.cafe_receipts%rowtype; v_item record;
begin
  if v_org_id is null or v_person_id is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode='42501';
  end if;
  if p_client_key is null then raise exception 'CAFE_RECEIPT_CLIENT_KEY_REQUIRED' using errcode='22023'; end if;
  if not exists (select 1 from shared.teams t join shared.branches b on b.id=t.branch_id and b.org_id=t.org_id
    where t.org_id=v_org_id and t.branch_id=p_branch_id and t.activity=p_activity and t.archived_at is null and b.archived_at is null) then
    raise exception 'CAFE_RECEIPT_STREAM_NOT_FOUND' using errcode='22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 150 then
    raise exception 'CAFE_RECEIPT_LINE_LIMIT: submit between 1 and 150 lines' using errcode='22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    if jsonb_typeof(v_line)<>'object' or v_line ? 'production_location_id' or v_line ? 'from_storage_location_id' or v_line ? 'storage_location_id'
       or coalesce(v_line->>'item_unit_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_line->>'quantity','') !~ '^[0-9]{1,10}([.,][0-9]{1,4})?$'
       or replace(v_line->>'quantity',',','.')::numeric<=0
       or (v_line ? 'damaged_wrong' and jsonb_typeof(v_line->'damaged_wrong')<>'boolean')
       or (v_line ? 'to_storage_location_id' and nullif(v_line->>'to_storage_location_id','') is not null
           and coalesce(v_line->>'to_storage_location_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'CAFE_RECEIPT_LINE_INVALID' using errcode='22023';
    end if;
  end loop;
  if (select count(distinct value->>'item_unit_id') from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) then
    raise exception 'CAFE_RECEIPT_LINE_DUPLICATE' using errcode='22023';
  end if;
  select jsonb_agg(jsonb_build_array(l.item_unit_id,l.quantity,l.damaged_wrong,l.to_storage_location_id) order by l.item_unit_id)
    into v_requested
    from (select (value->>'item_unit_id')::uuid as item_unit_id,
                 replace(value->>'quantity',',','.')::numeric as quantity,
                 coalesce((value->>'damaged_wrong')::boolean,false) as damaged_wrong,
                 nullif(value->>'to_storage_location_id','')::uuid as to_storage_location_id
            from jsonb_array_elements(p_lines)) l;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org_id::text||':'||p_client_key::text,0));
  select * into v_existing from ops.cafe_receipts r where r.org_id=v_org_id and r.client_key=p_client_key;
  if found then
    select jsonb_agg(jsonb_build_array(l.item_unit_id,l.received_quantity,('damaged_wrong'=any(l.conditions)),l.storage_location_id) order by l.item_unit_id)
      into v_existing_lines from ops.cafe_receipt_lines l where l.org_id=v_org_id and l.receipt_id=v_existing.id;
    if v_existing.received_by=v_person_id and v_existing.branch_id=p_branch_id and v_existing.activity=p_activity
       and (p_arrival_date is null or v_existing.arrival_date=p_arrival_date) and v_existing_lines=v_requested then
      return jsonb_build_object('receipt_id',v_existing.id,'outcome','existing','status',v_existing.status,'row_version',v_existing.row_version,
        'lines',(select coalesce(jsonb_agg(jsonb_build_object(
          'id',l.id,'item_unit_id',l.item_unit_id,'item_name',l.item_name,'item_category',l.item_category,'unit_name',l.unit_name,
          'received_quantity',trim_scale(l.received_quantity)::text,'storage_location_id',l.storage_location_id,
          'conditions',l.conditions,'condition_reason',l.condition_reason,'condition_updated_at',l.condition_updated_at,'photos','[]'::jsonb
        ) order by l.item_name,l.id),'[]'::jsonb) from ops.cafe_receipt_lines l where l.org_id=v_org_id and l.receipt_id=v_existing.id));
    end if;
    raise exception 'CAFE_RECEIPT_CLIENT_KEY_CONFLICT' using errcode='23505';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as requested(to_storage_location_id uuid)
     where requested.to_storage_location_id is not null and not exists (
       select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
        where l.org_id=v_org_id and l.id=requested.to_storage_location_id and l.archived_at is null
          and l.use in ('storage','both') and b.branch_id=p_branch_id
     )
  ) then raise exception 'CAFE_RECEIPT_LOCATION_INVALID' using errcode='22023'; end if;
  insert into ops.cafe_receipts (org_id,branch_id,activity,arrival_date,client_key,received_by)
  values (v_org_id,p_branch_id,p_activity,p_arrival_date,p_client_key,v_person_id) returning * into v_receipt;
  perform set_config('app.cafe_receipt_action','count_submit',true);
  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    select * into v_item
      from ops.cafe_receivable_items(p_branch_id,p_activity) item
     where item.item_unit_id=(v_line->>'item_unit_id')::uuid;
    if not found then raise exception 'CAFE_RECEIPT_ITEM_NOT_RECEIVABLE' using errcode='23514'; end if;
    insert into ops.cafe_receipt_lines (
      org_id,receipt_id,wip_item_id,item_name,item_category,item_unit_id,unit_name,received_quantity,conditions,storage_location_id
    ) values (
      v_org_id,v_receipt.id,v_item.item_id,v_item.item_name,v_item.item_category,v_item.item_unit_id,v_item.unit_name,
      replace(v_line->>'quantity',',','.')::numeric,
      case when coalesce((v_line->>'damaged_wrong')::boolean,false) then array['damaged_wrong']::text[] else '{}'::text[] end,
      nullif(v_line->>'to_storage_location_id','')::uuid
    );
  end loop;
  perform set_config('app.cafe_receipt_action','',true);
  return jsonb_build_object('receipt_id',v_receipt.id,'outcome','created','status',v_receipt.status,
    'row_version',v_receipt.row_version,'posting_status',v_receipt.posting_status,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',l.id,'item_unit_id',l.item_unit_id,'item_name',l.item_name,'item_category',l.item_category,'unit_name',l.unit_name,
      'received_quantity',trim_scale(l.received_quantity)::text,'storage_location_id',l.storage_location_id,
      'conditions',l.conditions,'condition_reason',l.condition_reason,'condition_updated_at',l.condition_updated_at,'photos','[]'::jsonb
    ) order by l.item_name,l.id),'[]'::jsonb) from ops.cafe_receipt_lines l where l.org_id=v_org_id and l.receipt_id=v_receipt.id));
end;
$$;
revoke execute on function ops.submit_cafe_receipt(uuid,text,date,uuid,jsonb) from public, anon;
grant execute on function ops.submit_cafe_receipt(uuid,text,date,uuid,jsonb) to authenticated;
