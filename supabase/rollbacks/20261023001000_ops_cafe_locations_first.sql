-- DOWN for 20261023001000_ops_cafe_locations_first.sql. Keeps every row; plans lose only the Location pointers.
begin;
do $$ begin
  if exists (select 1 from ops.kitchen_plans p group by p.org_id, p.log_date, p.wip_item_id, p.branch_id, p.activity, p.action, p.destination_branch_id having count(*) > 1) then
    raise exception 'plans to several locations of one branch must be merged before rollback';
  end if;
end $$;
drop trigger a00_cafe_fill_plan_locations on ops.kitchen_plans;
drop trigger a00_cafe_fill_log_locations on ops.kitchen_logs;
drop function ops._fill_cafe_plan_locations();
drop function ops._fill_cafe_log_locations();
drop trigger kitchen_logs_z_books_guard on ops.kitchen_logs;
drop trigger kitchen_plans_z_books_guard on ops.kitchen_plans;
create or replace function ops._guard_cafe_books()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_produces boolean;
begin
  if (tg_op = 'INSERT' or (old.branch_id, old.activity, old.action, old.destination_branch_id)
      is distinct from (new.branch_id, new.activity, new.action, new.destination_branch_id))
     and new.branch_id is not null and new.activity is not null then
    select t.produces into v_produces from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id and b.archived_at is null
    where t.org_id = new.org_id and t.branch_id = new.branch_id
      and t.activity = new.activity and t.archived_at is null;
    if v_produces is distinct from true then
      raise exception 'the production stream does not produce' using errcode = '42501';
    end if;
    if new.action = 'transfer' and not exists (
      select 1 from ops.allowed_kitchen_destinations(new.org_id, new.branch_id, new.activity) d
      where d.destination_branch_id = new.destination_branch_id
    ) then
      raise exception 'the destination is outside the production stream''s allowed books' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_cafe_books() is
  'On an inserted or re-pointed Café movement, requires the actual row stream Team to produce and transfer destination to be in ops.allowed_kitchen_destinations (42501). SECURITY INVOKER.';
create trigger kitchen_logs_z_books_guard before insert or update of branch_id, activity, action, destination_branch_id
on ops.kitchen_logs for each row execute function ops._guard_cafe_books();
create trigger kitchen_plans_z_books_guard before insert or update of branch_id, activity, action, destination_branch_id
on ops.kitchen_plans for each row execute function ops._guard_cafe_books();
drop function ops.list_cafe_destination_locations(uuid);
create or replace function ops.update_cafe_transfer_route(p_key jsonb, p_expected_version bigint, p_input jsonb, p_client_request_id uuid)
returns table(
  origin_branch_id uuid,
  origin_activity text,
  destination_branch_id uuid,
  row_version bigint,
  updated_at timestamptz,
  updated_by uuid,
  eligibility text,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := (select shared.current_org_id());
  v_actor_id uuid := (select shared.current_person_id());
  v_key record;
  v_input record;
  v_payload jsonb;
  v_replay ops.cafe_transfer_route_audit%rowtype;
  v_before ops.cafe_destinations%rowtype;
  v_after ops.cafe_destinations%rowtype;
  v_version bigint;
begin
  if v_org_id is null or v_actor_id is null or not shared.is_org_member()
     or not shared.can('cafe.transfer_routes.manage') then
    raise exception 'transfer route management is admin-only' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'client_request_id and a positive expected_version are required' using errcode = '22023';
  end if;
  select * into v_key from ops._parse_cafe_transfer_route(p_key);
  select * into v_input from ops._parse_cafe_transfer_route(p_input);
  v_payload := jsonb_build_object('operation', 'update', 'key', p_key,
    'expected_version', p_expected_version, 'input', p_input);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_org_id::text || ':' || v_actor_id::text || ':' || p_client_request_id::text, 0));
  select * into v_replay from ops.cafe_transfer_route_audit a
   where a.org_id = v_org_id and a.actor_person_id = v_actor_id and a.request_id = p_client_request_id;
  if found then
    if v_replay.request_payload is distinct from v_payload or v_replay.operation <> 'update' then
      raise exception 'client_request_id was already used for a different route operation' using errcode = '22023';
    end if;
    return query select
      (v_replay.after_route ->> 'origin_branch_id')::uuid,
      v_replay.after_route ->> 'origin_activity',
      (v_replay.after_route ->> 'destination_branch_id')::uuid,
      (v_replay.after_route ->> 'row_version')::bigint,
      (v_replay.after_route ->> 'updated_at')::timestamptz,
      (v_replay.after_route ->> 'updated_by')::uuid,
      v_replay.after_route ->> 'eligibility', v_replay.after_route ->> 'reason';
    return;
  end if;
  select * into v_before from ops.cafe_destinations d
   where d.org_id = v_org_id and d.origin_branch_id = v_key.origin_branch_id
     and d.origin_activity = v_key.origin_activity and d.destination_branch_id = v_key.destination_branch_id
   for update;
  if not found then
    raise exception 'transfer route not found' using errcode = 'P0002';
  end if;
  if v_before.row_version <> p_expected_version then
    raise exception 'transfer route changed since it was loaded' using errcode = '40001';
  end if;
  perform ops._validate_cafe_transfer_route(v_org_id, v_input.origin_branch_id,
    v_input.origin_activity, v_input.destination_branch_id);
  if (v_input.origin_branch_id, v_input.origin_activity, v_input.destination_branch_id)
     is distinct from (v_before.origin_branch_id, v_before.origin_activity, v_before.destination_branch_id)
     and exists (
       select 1 from ops.cafe_destinations d
       where d.org_id = v_org_id and d.origin_branch_id = v_input.origin_branch_id
         and d.origin_activity = v_input.origin_activity and d.destination_branch_id = v_input.destination_branch_id
     ) then
    raise exception 'transfer route already exists' using errcode = '22023';
  end if;
  v_version := p_expected_version + 1;
  if (v_input.origin_branch_id, v_input.origin_activity, v_input.destination_branch_id)
     is distinct from (v_before.origin_branch_id, v_before.origin_activity, v_before.destination_branch_id) then
    delete from ops.cafe_destinations d where d.org_id = v_org_id
      and d.origin_branch_id = v_key.origin_branch_id and d.origin_activity = v_key.origin_activity
      and d.destination_branch_id = v_key.destination_branch_id;
    insert into ops.cafe_destinations
      (org_id, origin_branch_id, origin_activity, destination_branch_id, row_version, updated_at, updated_by)
    values (v_org_id, v_input.origin_branch_id, v_input.origin_activity, v_input.destination_branch_id,
      v_version, clock_timestamp(), v_actor_id)
    returning * into v_after;
  else
    update ops.cafe_destinations d set row_version = v_version, updated_at = clock_timestamp(), updated_by = v_actor_id
     where d.org_id = v_org_id and d.origin_branch_id = v_key.origin_branch_id
       and d.origin_activity = v_key.origin_activity and d.destination_branch_id = v_key.destination_branch_id
    returning * into v_after;
  end if;
  insert into ops.cafe_transfer_route_audit
    (org_id, before_route, after_route, operation, actor_person_id, request_id, request_payload, resulting_version)
  values (v_org_id,
    jsonb_build_object('org_id', v_before.org_id, 'origin_branch_id', v_before.origin_branch_id,
      'origin_activity', v_before.origin_activity, 'destination_branch_id', v_before.destination_branch_id,
      'row_version', v_before.row_version, 'updated_at', v_before.updated_at, 'updated_by', v_before.updated_by),
    jsonb_build_object('org_id', v_after.org_id, 'origin_branch_id', v_after.origin_branch_id,
      'origin_activity', v_after.origin_activity, 'destination_branch_id', v_after.destination_branch_id,
      'row_version', v_after.row_version, 'updated_at', v_after.updated_at, 'updated_by', v_after.updated_by,
      'eligibility', 'eligible', 'reason', null),
    'update', v_actor_id, p_client_request_id, v_payload, v_after.row_version);
  return query select v_after.origin_branch_id, v_after.origin_activity, v_after.destination_branch_id,
    v_after.row_version, v_after.updated_at, v_after.updated_by, 'eligible'::text, null::text;
exception when unique_violation then
  raise exception 'transfer route already exists' using errcode = '22023';
end;
$$;
drop function ops.set_cafe_route_record_in_esb(jsonb, boolean);
drop function ops.list_cafe_route_esb_switches();
drop function ops.esb_endpoint_for_movement(text, uuid, text, uuid);
drop function ops.cafe_route_records_in_esb(uuid, text, uuid);
revoke select on ops.cafe_destinations from authenticated;
alter table ops.cafe_destinations drop column record_in_esb;
grant select on ops.cafe_destinations to authenticated;
create or replace function ops._cafe_location_snapshot(p_location_id uuid)
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
drop function ops.list_cafe_locations(jsonb);
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
revoke execute on function ops.list_cafe_locations(jsonb) from public, anon, service_role;
grant execute on function ops.list_cafe_locations(jsonb) to authenticated;
drop function ops._validate_cafe_location_input(jsonb, uuid);
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
create or replace function ops.create_cafe_location(p_input jsonb, p_client_request_id uuid)
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
create or replace function ops.update_cafe_location(p_id uuid, p_expected_version bigint, p_input jsonb, p_client_request_id uuid)
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
alter table ops.kitchen_plans drop constraint kitchen_plans_day_item_stream_destination_uk;
alter table ops.kitchen_plans drop column from_location_id, drop column to_location_id;
alter table ops.kitchen_plans add constraint kitchen_plans_day_item_stream_action_dest_key
  unique nulls not distinct (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id);
drop function ops._cafe_move_keeps_stream_stock(uuid, text, uuid, text, uuid, uuid);
drop function ops._cafe_sole_storage_location(uuid, uuid, uuid);
drop function ops._cafe_stream_production_location(uuid, uuid, text);
drop function ops._cafe_location_stream(uuid, uuid);
drop trigger cafe_location_shape_location on ops.locations;
drop trigger cafe_location_shape_branches on ops.location_branches;
drop trigger cafe_location_shape_activities on ops.location_activities;
drop function ops._check_cafe_location_shape();
drop table ops.location_activities;
alter table ops.locations drop column site_id;
commit;
