-- Admin-managed Café transfer routes. Route removal only affects new plans/captures; existing
-- kitchen rows and their review lifecycle retain their recorded destination.
--
-- DOWN (after exporting the route audit and observing queued work):
--   drop trigger kitchen_logs_zz_transfer_route_lock on ops.kitchen_logs;
--   drop trigger kitchen_plans_zz_transfer_route_lock on ops.kitchen_plans;
--   drop trigger cafe_transfer_route_audit_immutable on ops.cafe_transfer_route_audit;
--   drop trigger cafe_transfer_route_audit_no_truncate on ops.cafe_transfer_route_audit;
--   drop function ops._lock_cafe_transfer_route();
--   drop function ops._reject_cafe_transfer_route_audit_mutation();
--   drop function ops.remove_cafe_transfer_route(jsonb,bigint,uuid);
--   drop function ops.update_cafe_transfer_route(jsonb,bigint,jsonb,uuid);
--   drop function ops.create_cafe_transfer_route(jsonb,uuid);
--   drop function ops.list_cafe_transfer_routes();
--   drop function ops._validate_cafe_transfer_route(uuid,uuid,text,uuid);
--   drop function ops._parse_cafe_transfer_route(jsonb);
--   drop table ops.cafe_transfer_route_audit;
--   drop policy cafe_destinations_select_org on ops.cafe_destinations;
--   create policy cafe_destinations_select_org on ops.cafe_destinations for select to authenticated
--     using (org_id = shared.current_org_id());
--   alter table ops.cafe_destinations drop constraint cafe_destinations_activity_ck;
--   alter table ops.cafe_destinations drop column updated_by, drop column updated_at, drop column row_version;
--   delete from shared.role_capabilities where role = 'admin' and capability = 'cafe.transfer_routes.manage';
--   -- Existing ops.cafe_destinations rows are never removed by this rollback.

alter table ops.cafe_destinations
  add column row_version bigint not null default 1 check (row_version > 0),
  add column updated_at timestamptz not null default '2026-10-10 00:00:00+00'::timestamptz,
  add column updated_by uuid references shared.people(id) on delete set null,
  add constraint cafe_destinations_activity_ck check (origin_activity in ('kitchen', 'bar'));

comment on column ops.cafe_destinations.row_version is
  'Optimistic version for admin route edits. Legacy rows start at version 1; removal history remains in cafe_transfer_route_audit.';
comment on column ops.cafe_destinations.updated_at is
  'Last admin configuration change. Existing routes receive the explicit legacy migration timestamp.';
comment on column ops.cafe_destinations.updated_by is
  'Person who last configured this route; NULL for rows present before route administration shipped.';

insert into shared.role_capabilities (role, capability, scope)
values ('admin', 'cafe.transfer_routes.manage', 'org')
on conflict (role, capability) do nothing;

create table ops.cafe_transfer_route_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  before_route jsonb,
  after_route jsonb,
  operation text not null check (operation in ('create', 'update', 'remove')),
  actor_person_id uuid references shared.people(id) on delete set null,
  occurred_at timestamptz not null default now(),
  request_id uuid,
  request_payload jsonb,
  resulting_version bigint not null check (resulting_version > 0),
  constraint cafe_transfer_route_audit_payload_ck check (
    (before_route is null or jsonb_typeof(before_route) = 'object')
    and (after_route is null or jsonb_typeof(after_route) = 'object')
    and (request_payload is null or jsonb_typeof(request_payload) = 'object')
  ),
  constraint cafe_transfer_route_audit_shape_ck check (
    (operation = 'create' and before_route is null and after_route is not null)
    or (operation = 'update' and before_route is not null and after_route is not null)
    or (operation = 'remove' and before_route is not null and after_route is null)
  )
);
comment on table ops.cafe_transfer_route_audit is
  'Append-only configuration history for ops.cafe_destinations. Legacy rows are recorded as actorless creates; route removal never erases this history.';

alter table ops.cafe_transfer_route_audit enable row level security;
alter table ops.cafe_transfer_route_audit force row level security;
revoke all on ops.cafe_transfer_route_audit from public, anon, authenticated, service_role;
grant select on ops.cafe_transfer_route_audit to authenticated;
create policy cafe_transfer_route_audit_select_admin on ops.cafe_transfer_route_audit
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (select shared.is_org_member())
    and (select shared.can('cafe.transfer_routes.manage'))
  );

revoke all on ops.cafe_destinations from public, anon, authenticated, service_role;
grant select on ops.cafe_destinations to authenticated;
drop policy cafe_destinations_select_org on ops.cafe_destinations;
create policy cafe_destinations_select_org on ops.cafe_destinations
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (select shared.is_org_member())
  );

-- Routes present before route administration shipped carry no audit event: the audit records admin actions only.

create function ops._parse_cafe_transfer_route(p_route jsonb)
returns table(origin_branch_id uuid, origin_activity text, destination_branch_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_route is null or jsonb_typeof(p_route) is distinct from 'object' then
    raise exception 'route must be an object' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_route)) <> 3 or not (p_route ?& array[
    'origin_branch_id', 'origin_activity', 'destination_branch_id'
  ]) then
    raise exception 'route must contain only origin_branch_id, origin_activity, and destination_branch_id'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_route -> 'origin_branch_id') is distinct from 'string'
     or jsonb_typeof(p_route -> 'origin_activity') is distinct from 'string'
     or jsonb_typeof(p_route -> 'destination_branch_id') is distinct from 'string' then
    raise exception 'route identifiers and activity must be strings' using errcode = '22023';
  end if;
  if p_route ->> 'origin_activity' not in ('kitchen', 'bar') then
    raise exception 'route activity is invalid' using errcode = '22023';
  end if;
  begin
    return query select (p_route ->> 'origin_branch_id')::uuid,
                        p_route ->> 'origin_activity',
                        (p_route ->> 'destination_branch_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'route branch identifier is invalid' using errcode = '22023';
  end;
end;
$$;
revoke execute on function ops._parse_cafe_transfer_route(jsonb) from public, anon, authenticated, service_role;

create function ops._validate_cafe_transfer_route(
  p_org_id uuid,
  p_origin_branch_id uuid,
  p_origin_activity text,
  p_destination_branch_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_origin_branch_id = p_destination_branch_id then
    raise exception 'origin and destination must be different branches' using errcode = '22023';
  end if;
  if not exists (
    select 1 from shared.branches b
    where b.org_id = p_org_id and b.id = p_origin_branch_id and b.archived_at is null
  ) then
    raise exception 'origin branch is not active in this organization' using errcode = '22023';
  end if;
  if not exists (
    select 1 from shared.teams t
    join shared.branches b on b.org_id = t.org_id and b.id = t.branch_id
    where t.org_id = p_org_id and t.branch_id = p_origin_branch_id
      and t.activity = p_origin_activity and t.archived_at is null
      and t.produces is true and b.archived_at is null
  ) then
    raise exception 'origin stream is not active and producing' using errcode = '22023';
  end if;
  if not exists (
    select 1 from shared.branches b
    where b.org_id = p_org_id and b.id = p_destination_branch_id and b.archived_at is null
      and (
        (p_origin_activity = 'kitchen' and exists (
          select 1 from shared.teams t
          where t.org_id = p_org_id and t.branch_id = b.id and t.archived_at is null
        ))
        or (p_origin_activity = 'bar' and exists (
          select 1 from shared.teams t
          where t.org_id = p_org_id and t.branch_id = b.id and t.activity = 'bar' and t.archived_at is null
        ))
      )
  ) then
    raise exception 'destination is not eligible for this origin stream' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function ops._validate_cafe_transfer_route(uuid,uuid,text,uuid) from public, anon, authenticated, service_role;

-- The session's org/person and the granted capability are resolved on every invocation; no caller
-- supplied tenant or actor can widen this check.
create function ops.list_cafe_transfer_routes()
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
stable
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid := (select shared.current_org_id());
begin
  if v_org_id is null or not (select shared.is_org_member()) then
    raise exception 'active organization membership required' using errcode = '42501';
  end if;
  return query
  select d.origin_branch_id, d.origin_activity, d.destination_branch_id,
         d.row_version, d.updated_at, d.updated_by,
         case when exists (
           select 1 from ops.allowed_kitchen_destinations(
             d.org_id, d.origin_branch_id, d.origin_activity
           ) allowed where allowed.destination_branch_id = d.destination_branch_id
         ) then 'eligible' else 'needs_attention' end,
         case
           when origin.id is null then 'origin_unknown'
           when origin_team.id is null then 'origin_unknown'
           when origin_team.produces is not true then 'origin_not_producing'
           when d.origin_branch_id = d.destination_branch_id then 'same_branch'
           when destination.id is null then 'destination_unknown'
           when d.origin_activity = 'bar' and not exists (
             select 1 from shared.teams target_bar
             where target_bar.org_id = d.org_id and target_bar.branch_id = d.destination_branch_id
               and target_bar.activity = 'bar' and target_bar.archived_at is null
           ) then 'no_destination_bar'
           when d.origin_activity = 'kitchen' and not exists (
             select 1 from shared.teams target_stream
             where target_stream.org_id = d.org_id and target_stream.branch_id = d.destination_branch_id
               and target_stream.archived_at is null
           ) then 'destination_not_eligible'
           else null
         end
    from ops.cafe_destinations d
    left join shared.branches origin
      on origin.org_id = d.org_id and origin.id = d.origin_branch_id and origin.archived_at is null
    left join shared.teams origin_team
      on origin_team.org_id = d.org_id and origin_team.branch_id = d.origin_branch_id
     and origin_team.activity = d.origin_activity and origin_team.archived_at is null
    left join shared.branches destination
      on destination.org_id = d.org_id and destination.id = d.destination_branch_id
     and destination.archived_at is null
   where d.org_id = v_org_id
   order by origin.name nulls last, d.origin_activity, destination.name nulls last,
            d.origin_branch_id, d.destination_branch_id;
end;
$$;
comment on function ops.list_cafe_transfer_routes() is
  'Complete caller-org route list, ordered by canonical branch names and annotated when current stream/destination eligibility needs attention.';
revoke execute on function ops.list_cafe_transfer_routes() from public, anon, service_role;
grant execute on function ops.list_cafe_transfer_routes() to authenticated;

create function ops.create_cafe_transfer_route(p_input jsonb, p_client_request_id uuid)
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
  v_input record;
  v_payload jsonb;
  v_replay ops.cafe_transfer_route_audit%rowtype;
  v_route ops.cafe_destinations%rowtype;
  v_version bigint;
begin
  if v_org_id is null or v_actor_id is null or not shared.is_org_member()
     or not shared.can('cafe.transfer_routes.manage') then
    raise exception 'transfer route management is admin-only' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id is required' using errcode = '22023';
  end if;
  select * into v_input from ops._parse_cafe_transfer_route(p_input);
  v_payload := jsonb_build_object('operation', 'create', 'input', p_input);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_org_id::text || ':' || v_actor_id::text || ':' || p_client_request_id::text, 0));
  select * into v_replay from ops.cafe_transfer_route_audit a
   where a.org_id = v_org_id and a.actor_person_id = v_actor_id and a.request_id = p_client_request_id;
  if found then
    if v_replay.request_payload is distinct from v_payload or v_replay.operation <> 'create' then
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
  perform ops._validate_cafe_transfer_route(v_org_id, v_input.origin_branch_id,
    v_input.origin_activity, v_input.destination_branch_id);
  if exists (
    select 1 from ops.cafe_destinations d
    where d.org_id = v_org_id and d.origin_branch_id = v_input.origin_branch_id
      and d.origin_activity = v_input.origin_activity
      and d.destination_branch_id = v_input.destination_branch_id
  ) then
    raise exception 'transfer route already exists' using errcode = '22023';
  end if;
  select coalesce(max(
      case when a.operation = 'remove' then a.resulting_version
           else greatest(coalesce((a.before_route ->> 'row_version')::bigint, 0),
                         coalesce((a.after_route ->> 'row_version')::bigint, 0)) end
    ), 0) + 1
    into v_version
    from ops.cafe_transfer_route_audit a
   where a.org_id = v_org_id
     and (
       (a.before_route ->> 'origin_branch_id' = v_input.origin_branch_id::text
        and a.before_route ->> 'origin_activity' = v_input.origin_activity
        and a.before_route ->> 'destination_branch_id' = v_input.destination_branch_id::text)
       or
       (a.after_route ->> 'origin_branch_id' = v_input.origin_branch_id::text
        and a.after_route ->> 'origin_activity' = v_input.origin_activity
        and a.after_route ->> 'destination_branch_id' = v_input.destination_branch_id::text)
     );
  insert into ops.cafe_destinations
    (org_id, origin_branch_id, origin_activity, destination_branch_id, row_version, updated_at, updated_by)
  values (v_org_id, v_input.origin_branch_id, v_input.origin_activity, v_input.destination_branch_id,
          v_version, clock_timestamp(), v_actor_id)
  returning * into v_route;
  insert into ops.cafe_transfer_route_audit
    (org_id, before_route, after_route, operation, actor_person_id, request_id, request_payload, resulting_version)
  values (v_org_id, null,
    jsonb_build_object('org_id', v_route.org_id, 'origin_branch_id', v_route.origin_branch_id,
      'origin_activity', v_route.origin_activity, 'destination_branch_id', v_route.destination_branch_id,
      'row_version', v_route.row_version, 'updated_at', v_route.updated_at, 'updated_by', v_route.updated_by,
      'eligibility', 'eligible', 'reason', null),
    'create', v_actor_id, p_client_request_id, v_payload, v_route.row_version);
  return query select v_route.origin_branch_id, v_route.origin_activity, v_route.destination_branch_id,
    v_route.row_version, v_route.updated_at, v_route.updated_by, 'eligible'::text, null::text;
exception when unique_violation then
  raise exception 'transfer route already exists' using errcode = '22023';
end;
$$;
comment on function ops.create_cafe_transfer_route(jsonb,uuid) is
  'Admin-only, idempotent create for one eligible cross-branch route. Stamps org, actor, version and audit in one transaction.';
revoke execute on function ops.create_cafe_transfer_route(jsonb,uuid) from public, anon, service_role;
grant execute on function ops.create_cafe_transfer_route(jsonb,uuid) to authenticated;

create function ops.update_cafe_transfer_route(p_key jsonb, p_expected_version bigint, p_input jsonb, p_client_request_id uuid)
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
comment on function ops.update_cafe_transfer_route(jsonb,bigint,jsonb,uuid) is
  'Admin-only, optimistic and idempotent update; key replacement and audit are atomic.';
revoke execute on function ops.update_cafe_transfer_route(jsonb,bigint,jsonb,uuid) from public, anon, service_role;
grant execute on function ops.update_cafe_transfer_route(jsonb,bigint,jsonb,uuid) to authenticated;

create function ops.remove_cafe_transfer_route(p_key jsonb, p_expected_version bigint, p_client_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := (select shared.current_org_id());
  v_actor_id uuid := (select shared.current_person_id());
  v_key record;
  v_payload jsonb;
  v_replay ops.cafe_transfer_route_audit%rowtype;
  v_before ops.cafe_destinations%rowtype;
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
  v_payload := jsonb_build_object('operation', 'remove', 'key', p_key, 'expected_version', p_expected_version);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_org_id::text || ':' || v_actor_id::text || ':' || p_client_request_id::text, 0));
  select * into v_replay from ops.cafe_transfer_route_audit a
   where a.org_id = v_org_id and a.actor_person_id = v_actor_id and a.request_id = p_client_request_id;
  if found then
    if v_replay.request_payload is distinct from v_payload or v_replay.operation <> 'remove' then
      raise exception 'client_request_id was already used for a different route operation' using errcode = '22023';
    end if;
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
  v_version := v_before.row_version + 1;
  delete from ops.cafe_destinations d where d.org_id = v_org_id
    and d.origin_branch_id = v_key.origin_branch_id and d.origin_activity = v_key.origin_activity
    and d.destination_branch_id = v_key.destination_branch_id;
  insert into ops.cafe_transfer_route_audit
    (org_id, before_route, after_route, operation, actor_person_id, request_id, request_payload, resulting_version)
  values (v_org_id,
    jsonb_build_object('org_id', v_before.org_id, 'origin_branch_id', v_before.origin_branch_id,
      'origin_activity', v_before.origin_activity, 'destination_branch_id', v_before.destination_branch_id,
      'row_version', v_before.row_version, 'updated_at', v_before.updated_at, 'updated_by', v_before.updated_by),
    null, 'remove', v_actor_id, p_client_request_id, v_payload, v_version);
end;
$$;
comment on function ops.remove_cafe_transfer_route(jsonb,bigint,uuid) is
  'Admin-only, optimistic and idempotent route disable. Existing capture/review rows and their destinations remain unchanged.';
revoke execute on function ops.remove_cafe_transfer_route(jsonb,bigint,uuid) from public, anon, service_role;
grant execute on function ops.remove_cafe_transfer_route(jsonb,bigint,uuid) to authenticated;

create function ops._reject_cafe_transfer_route_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from shared.orgs o where o.id = old.org_id
  ) then
    return old;
  end if;
  raise exception 'transfer route audit is append-only' using errcode = '55000';
end;
$$;
revoke execute on function ops._reject_cafe_transfer_route_audit_mutation() from public, anon, authenticated, service_role;
create trigger cafe_transfer_route_audit_immutable
  before update or delete on ops.cafe_transfer_route_audit
  for each row execute function ops._reject_cafe_transfer_route_audit_mutation();
create trigger cafe_transfer_route_audit_no_truncate
  before truncate on ops.cafe_transfer_route_audit
  for each statement execute function ops._reject_cafe_transfer_route_audit_mutation();

-- Lock an enabled route after the existing books guard has accepted the movement. If a route is
-- being disabled concurrently, row locking gives the submission and disable a deterministic order.
create function ops._lock_cafe_transfer_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or (old.branch_id, old.activity, old.action, old.destination_branch_id)
      is distinct from (new.branch_id, new.activity, new.action, new.destination_branch_id))
     and new.action = 'transfer'
     and new.branch_id is distinct from new.destination_branch_id
     and new.branch_id is not null and new.activity is not null and new.destination_branch_id is not null then
    perform 1 from ops.cafe_destinations d
     where d.org_id = new.org_id and d.origin_branch_id = new.branch_id
       and d.origin_activity = new.activity and d.destination_branch_id = new.destination_branch_id
     for key share;
    if not found then
      raise exception 'transfer route was disabled before submission' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function ops._lock_cafe_transfer_route() from public, anon, authenticated, service_role;
create trigger kitchen_logs_zz_transfer_route_lock
  before insert or update of branch_id, activity, action, destination_branch_id on ops.kitchen_logs
  for each row execute function ops._lock_cafe_transfer_route();
create trigger kitchen_plans_zz_transfer_route_lock
  before insert or update of branch_id, activity, action, destination_branch_id on ops.kitchen_plans
  for each row execute function ops._lock_cafe_transfer_route();
