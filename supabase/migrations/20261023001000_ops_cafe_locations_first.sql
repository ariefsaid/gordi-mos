-- Café locations first, part 1 (schema and rules). A Location now carries where it physically is
-- (Site) and its Activities; a production Location is exactly one Branch and one Activity, which
-- is its Stream. Plans point at Locations; the Branch, Activity and destination Branch are filled
-- from them, so permissions, review queues and ESB keep reading the columns they always read.
-- Moves inside one Branch need no route. Each route gets a "Record in ESB" switch, off by
-- default and readable and changeable by admins only.
--
-- DOWN: run supabase/rollbacks/20261023001000_ops_cafe_locations_first.sql. It keeps all rows; plans
-- keep their Branch columns and lose only the new Location pointers.

-- ── Site: where a Location physically is ─────────────────────────────────────────────────────
-- shared.sites (org_id, id) is already unique (staff attendance), so the composite key below can reference it.
alter table ops.locations
  add column site_id uuid,
  add constraint locations_site_fk foreign key (org_id, site_id)
    references shared.sites (org_id, id) on delete set null (site_id);
comment on column ops.locations.site_id is
  'Physically at (a Site). Informational: a Site is not a Branch and carries no books.';

-- ── Activities of a Location ─────────────────────────────────────────────────────────────────
create table ops.location_activities (
  org_id uuid not null,
  location_id uuid not null,
  activity text not null references shared.activities(code),
  created_at timestamptz not null default now(),
  primary key (org_id, location_id, activity),
  constraint location_activities_location_fk foreign key (org_id, location_id)
    references ops.locations (org_id, id) on delete cascade
);
comment on table ops.location_activities is
  'Activities a Location works in. A production Location has exactly one, so it always gives one Stream; a storage Location may hold several.';
create index location_activities_activity_idx on ops.location_activities (org_id, activity, location_id);

alter table ops.location_activities enable row level security;
alter table ops.location_activities force row level security;
revoke all on ops.location_activities from public, anon, authenticated, service_role;
grant select on ops.location_activities to authenticated;
create policy location_activities_select_org on ops.location_activities
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.is_org_member()));
comment on policy location_activities_select_org on ops.location_activities is
  'Current-org members read Location activities; writes are admin-only through the Location RPCs.';

-- ── Rule 1: a production Location is exactly one Branch and one Activity ─────────────────────
-- Checked when the transaction commits, so a Location, its Branch and its Activity can be written
-- in any order inside one transaction. Archived Locations are exempt so they can still be archived.
create function ops._check_cafe_location_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_loc ops.locations%rowtype;
begin
  if tg_table_name = 'locations' then
    v_org := new.org_id; v_id := new.id;
  elsif tg_op = 'DELETE' then
    v_org := old.org_id; v_id := old.location_id;
  else
    v_org := new.org_id; v_id := new.location_id;
  end if;
  select * into v_loc from ops.locations l where l.org_id = v_org and l.id = v_id;
  if not found or v_loc.archived_at is not null or v_loc.use = 'storage' then return null; end if;
  if (select count(*) from ops.location_branches b where b.org_id = v_org and b.location_id = v_id) <> 1
     or (select count(*) from ops.location_activities a where a.org_id = v_org and a.location_id = v_id) <> 1 then
    raise exception 'CAFE_LOCATION_PRODUCTION_SHAPE' using errcode = '23514',
      detail = 'A production location has exactly one branch and one activity.';
  end if;
  return null;
end;
$$;
revoke execute on function ops._check_cafe_location_shape() from public, anon, authenticated, service_role;
create constraint trigger cafe_location_shape_location
  after insert or update of use, archived_at on ops.locations
  deferrable initially deferred for each row execute function ops._check_cafe_location_shape();
create constraint trigger cafe_location_shape_branches
  after insert or update or delete on ops.location_branches
  deferrable initially deferred for each row execute function ops._check_cafe_location_shape();
create constraint trigger cafe_location_shape_activities
  after insert or update or delete on ops.location_activities
  deferrable initially deferred for each row execute function ops._check_cafe_location_shape();

-- ── Location lookups the plan and log rules share ────────────────────────────────────────────
create function ops._cafe_location_stream(p_org uuid, p_location uuid)
returns table(branch_id uuid, activity text)
language sql stable security invoker set search_path = '' as $$
  select lb.branch_id, la.activity
    from ops.locations l
    join ops.location_branches lb on lb.org_id = l.org_id and lb.location_id = l.id
    join ops.location_activities la on la.org_id = l.org_id and la.location_id = l.id
   where l.org_id = p_org and l.id = p_location and l.archived_at is null and l.use in ('production', 'both')
     and (select count(*) from ops.location_branches x where x.org_id = l.org_id and x.location_id = l.id) = 1
     and (select count(*) from ops.location_activities x where x.org_id = l.org_id and x.location_id = l.id) = 1
$$;
revoke execute on function ops._cafe_location_stream(uuid, uuid) from public, anon, service_role;
grant execute on function ops._cafe_location_stream(uuid, uuid) to authenticated;

create function ops._cafe_stream_production_location(p_org uuid, p_branch uuid, p_activity text)
returns uuid
language sql stable security invoker set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(l.id))[1] end
    from ops.locations l
    join ops.location_branches lb on lb.org_id = l.org_id and lb.location_id = l.id and lb.branch_id = p_branch
    join ops.location_activities la on la.org_id = l.org_id and la.location_id = l.id and la.activity = p_activity
   where l.org_id = p_org and l.archived_at is null and l.use in ('production', 'both')
$$;
revoke execute on function ops._cafe_stream_production_location(uuid, uuid, text) from public, anon, service_role;
grant execute on function ops._cafe_stream_production_location(uuid, uuid, text) to authenticated;

create function ops._cafe_sole_storage_location(p_org uuid, p_branch uuid, p_exclude uuid)
returns uuid
language sql stable security invoker set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(l.id))[1] end
    from ops.locations l
    join ops.location_branches lb on lb.org_id = l.org_id and lb.location_id = l.id and lb.branch_id = p_branch
   where l.org_id = p_org and l.archived_at is null and l.use in ('storage', 'both')
     and l.id is distinct from p_exclude
$$;
revoke execute on function ops._cafe_sole_storage_location(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function ops._cafe_sole_storage_location(uuid, uuid, uuid) to authenticated;

-- A move that stays inside the Stream's own stock: a send to a Location in the same Branch that
-- works in the same Activity. Such a move changes where stock sits, not the Stream's book.
create function ops._cafe_move_keeps_stream_stock(
  p_org uuid, p_action text, p_branch uuid, p_activity text, p_destination_branch uuid, p_to_location uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select p_action = 'outlet_send'
      or (p_action = 'transfer' and p_destination_branch is not distinct from p_branch and p_to_location is not null
          and exists (select 1 from ops.location_activities a
                       where a.org_id = p_org and a.location_id = p_to_location and a.activity = p_activity))
$$;
revoke execute on function ops._cafe_move_keeps_stream_stock(uuid, text, uuid, text, uuid, uuid) from public, anon, service_role;
grant execute on function ops._cafe_move_keeps_stream_stock(uuid, text, uuid, text, uuid, uuid) to authenticated;

-- ── Plans point at Locations ─────────────────────────────────────────────────────────────────
alter table ops.kitchen_plans
  add column from_location_id uuid,
  add column to_location_id uuid,
  add constraint kitchen_plans_from_location_fk foreign key (org_id, from_location_id)
    references ops.locations (org_id, id) on delete restrict,
  add constraint kitchen_plans_to_location_fk foreign key (org_id, to_location_id)
    references ops.locations (org_id, id) on delete restrict;
comment on column ops.kitchen_plans.from_location_id is
  'The production Location this plan row is for. Branch and Activity are filled from it.';
comment on column ops.kitchen_plans.to_location_id is
  'For a transfer, the Location it goes to. The destination Branch is filled from it.';

-- The key moves from the destination Branch to the destination Location: two Locations in one
-- Branch are two plan rows. The destination Branch stays in the key for rows with no Location.
do $$
declare v_name text;
begin
  select c.conname into v_name
    from pg_constraint c
   where c.conrelid = 'ops.kitchen_plans'::regclass and c.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname::text) from unnest(c.conkey) k
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
         = array['action', 'activity', 'branch_id', 'destination_branch_id', 'log_date', 'org_id', 'wip_item_id'];
  if v_name is null then raise exception 'kitchen_plans day/item/stream key not found'; end if;
  execute format('alter table ops.kitchen_plans drop constraint %I', v_name);
end;
$$;
alter table ops.kitchen_plans
  add constraint kitchen_plans_day_item_stream_destination_uk
  unique nulls not distinct (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, to_location_id);

create function ops._fill_cafe_plan_locations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.org_id, shared.current_org_id());
  v_branch uuid;
  v_activity text;
  v_branches uuid[];
begin
  if new.from_location_id is not null then
    if tg_op = 'INSERT' or new.from_location_id is distinct from old.from_location_id
       or (new.branch_id, new.activity) is distinct from (old.branch_id, old.activity) then
      select s.branch_id, s.activity into v_branch, v_activity from ops._cafe_location_stream(v_org, new.from_location_id) s;
      if v_branch is null then raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514'; end if;
      if new.branch_id is null then new.branch_id := v_branch;
      elsif new.branch_id <> v_branch then raise exception 'CAFE_LOCATION_STREAM_MISMATCH' using errcode = '22023'; end if;
      if new.activity is null then new.activity := v_activity;
      elsif new.activity <> v_activity then raise exception 'CAFE_LOCATION_STREAM_MISMATCH' using errcode = '22023'; end if;
    end if;
  elsif new.branch_id is not null and new.activity is not null
        and (tg_op = 'INSERT' or (new.branch_id, new.activity) is distinct from (old.branch_id, old.activity)) then
    new.from_location_id := ops._cafe_stream_production_location(v_org, new.branch_id, new.activity);
  end if;

  if new.action = 'transfer' then
    if new.to_location_id is not null then
      if tg_op = 'INSERT' or new.to_location_id is distinct from old.to_location_id
         or new.destination_branch_id is distinct from old.destination_branch_id then
        if not exists (select 1 from ops.locations l where l.org_id = v_org and l.id = new.to_location_id
                         and l.archived_at is null and l.use in ('storage', 'both')) then
          raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514';
        end if;
        select array_agg(b.branch_id) into v_branches from ops.location_branches b
         where b.org_id = v_org and b.location_id = new.to_location_id;
        if new.destination_branch_id is null then
          if cardinality(v_branches) = 1 then new.destination_branch_id := v_branches[1];
          else raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514'; end if;
        elsif not (new.destination_branch_id = any(v_branches)) then
          raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514';
        end if;
        if new.to_location_id is not distinct from new.from_location_id then
          raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514';
        end if;
      end if;
    elsif new.destination_branch_id is not null
          and (tg_op = 'INSERT' or new.destination_branch_id is distinct from old.destination_branch_id) then
      new.to_location_id := ops._cafe_sole_storage_location(v_org, new.destination_branch_id, new.from_location_id);
    end if;
  elsif new.to_location_id is not null and (tg_op = 'INSERT' or new.to_location_id is distinct from old.to_location_id) then
    raise exception 'CAFE_LOCATION_FIELD_NOT_ALLOWED' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function ops._fill_cafe_plan_locations() from public, anon, authenticated, service_role;
-- The "a00" prefix runs it before every other trigger (they fire in name order), which read the filled columns.
create trigger a00_cafe_fill_plan_locations before insert or update on ops.kitchen_plans
  for each row execute function ops._fill_cafe_plan_locations();

-- A log that names its production Location books to that Location's Branch and Activity.
create function ops._fill_cafe_log_locations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.org_id, shared.current_org_id());
  v_branch uuid;
  v_activity text;
  v_branches uuid[];
begin
  if new.action = 'produce' and new.production_location_id is not null
     and (tg_op = 'INSERT' or new.production_location_id is distinct from old.production_location_id) then
    select s.branch_id, s.activity into v_branch, v_activity from ops._cafe_location_stream(v_org, new.production_location_id) s;
    if v_branch is null then raise exception 'CAFE_LOCATION_INVALID' using errcode = '23514'; end if;
    if new.branch_id is null then new.branch_id := v_branch;
    elsif new.branch_id <> v_branch then raise exception 'CAFE_LOCATION_STREAM_MISMATCH' using errcode = '22023'; end if;
    if new.activity is null then new.activity := v_activity;
    elsif new.activity <> v_activity then raise exception 'CAFE_LOCATION_STREAM_MISMATCH' using errcode = '22023'; end if;
  end if;
  if new.action = 'transfer' and tg_op = 'INSERT' then
    if new.from_storage_location_id is not null and (new.branch_id is null or new.activity is null) then
      select s.branch_id, s.activity into v_branch, v_activity from ops._cafe_location_stream(v_org, new.from_storage_location_id) s;
      new.branch_id := coalesce(new.branch_id, v_branch);
      new.activity := coalesce(new.activity, v_activity);
    end if;
    if new.to_storage_location_id is not null and new.destination_branch_id is null then
      select array_agg(b.branch_id) into v_branches from ops.location_branches b
       where b.org_id = v_org and b.location_id = new.to_storage_location_id;
      if cardinality(v_branches) = 1 then new.destination_branch_id := v_branches[1]; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function ops._fill_cafe_log_locations() from public, anon, authenticated, service_role;
create trigger a00_cafe_fill_log_locations before insert or update on ops.kitchen_logs
  for each row execute function ops._fill_cafe_log_locations();

-- ── Rule 2: where a Location may send ────────────────────────────────────────────────────────
-- A move inside one Branch needs no route and is always recorded in MOS. A move to another Branch
-- needs a route (ops.allowed_kitchen_destinations). The guard still refuses a Stream that does not
-- produce, and a move to the Location itself.
create or replace function ops._guard_cafe_books()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_produces boolean; v_from uuid; v_to uuid; v_changed boolean;
begin
  if tg_table_name = 'kitchen_plans' then
    v_from := new.from_location_id; v_to := new.to_location_id;
    v_changed := tg_op = 'INSERT' or (old.branch_id, old.activity, old.action, old.destination_branch_id, old.to_location_id)
      is distinct from (new.branch_id, new.activity, new.action, new.destination_branch_id, new.to_location_id);
  else
    v_from := new.from_storage_location_id; v_to := new.to_storage_location_id;
    v_changed := tg_op = 'INSERT' or (old.branch_id, old.activity, old.action, old.destination_branch_id, old.to_storage_location_id)
      is distinct from (new.branch_id, new.activity, new.action, new.destination_branch_id, new.to_storage_location_id);
  end if;
  if v_changed and new.branch_id is not null and new.activity is not null then
    select t.produces into v_produces from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id and b.archived_at is null
    where t.org_id = new.org_id and t.branch_id = new.branch_id
      and t.activity = new.activity and t.archived_at is null;
    if v_produces is distinct from true then
      raise exception 'the production stream does not produce' using errcode = '42501';
    end if;
    if new.action = 'transfer' and not (
      exists (
        select 1 from ops.allowed_kitchen_destinations(new.org_id, new.branch_id, new.activity) d
        where d.destination_branch_id = new.destination_branch_id)
      or (new.destination_branch_id is not distinct from new.branch_id and v_to is not null)
    ) then
      raise exception 'the destination is outside the production stream''s allowed books' using errcode = '42501';
    end if;
    if new.action = 'transfer' and v_to is not null and v_to is not distinct from v_from then
      raise exception 'a transfer must go to a different location' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_cafe_books() is
  'On an inserted or re-pointed Café movement, requires the row stream Team to produce and a transfer to be inside the allowed books: a route for another Branch, or any Location of its own Branch (42501). SECURITY INVOKER.';
drop trigger kitchen_logs_z_books_guard on ops.kitchen_logs;
drop trigger kitchen_plans_z_books_guard on ops.kitchen_plans;
create trigger kitchen_logs_z_books_guard
  before insert or update of branch_id, activity, action, destination_branch_id, from_storage_location_id, to_storage_location_id
  on ops.kitchen_logs for each row execute function ops._guard_cafe_books();
create trigger kitchen_plans_z_books_guard
  before insert or update of branch_id, activity, action, destination_branch_id, from_location_id, to_location_id
  on ops.kitchen_plans for each row execute function ops._guard_cafe_books();

-- Everything a planner or a transfer screen needs: the Locations L may send to.
create function ops.list_cafe_destination_locations(p_from_location_id uuid)
returns table(location_id uuid, name text, branch_id uuid, same_branch boolean)
language sql stable security invoker set search_path = '' as $$
  with origin as (
    select p_from_location_id as id, s.branch_id, s.activity
      from ops._cafe_location_stream((select shared.current_org_id()), p_from_location_id) s
  )
  select s.id, s.name, sb.branch_id, sb.branch_id = o.branch_id
    from origin o
    join ops.locations s on s.org_id = (select shared.current_org_id()) and s.archived_at is null
                        and s.use in ('storage', 'both') and s.id <> o.id
    join ops.location_branches sb on sb.org_id = s.org_id and sb.location_id = s.id
   where sb.branch_id = o.branch_id
      or exists (select 1 from ops.allowed_kitchen_destinations((select shared.current_org_id()), o.branch_id, o.activity) d
                  where d.destination_branch_id = sb.branch_id)
   order by (sb.branch_id <> o.branch_id), s.name, s.id
$$;
comment on function ops.list_cafe_destination_locations(uuid) is
  'Rule 2: every active storage Location other than the origin that is in the origin''s Branch, or in a Branch it has a route to.';
revoke execute on function ops.list_cafe_destination_locations(uuid) from public, anon, service_role;
grant execute on function ops.list_cafe_destination_locations(uuid) to authenticated;

-- ── Record in ESB: a switch on each route, admin-only, off by default ─────────────────────────
alter table ops.cafe_destinations add column record_in_esb boolean not null default false;
comment on column ops.cafe_destinations.record_in_esb is
  'Whether a cross-branch transfer on this route is recorded in ESB. Off by default; only admins read or change it.';
-- Members still read the route; the switch column is not part of what they may select.
revoke select on ops.cafe_destinations from authenticated;
grant select (org_id, origin_branch_id, origin_activity, destination_branch_id, row_version, updated_at, updated_by)
  on ops.cafe_destinations to authenticated;

create function ops.cafe_route_records_in_esb(p_branch_id uuid, p_activity text, p_destination_branch_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select d.record_in_esb from ops.cafe_destinations d
                    where d.origin_branch_id = p_branch_id and d.origin_activity = p_activity
                      and d.destination_branch_id = p_destination_branch_id), false)
$$;
revoke execute on function ops.cafe_route_records_in_esb(uuid, text, uuid) from public, anon, authenticated, service_role;

-- esb_endpoint_for keeps its two-Branch rule; this adds the route switch on top of it.
create function ops.esb_endpoint_for_movement(p_action text, p_branch_id uuid, p_activity text, p_destination_branch_id uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select case when x.endpoint = 'simple-transfer'
                and not ops.cafe_route_records_in_esb(p_branch_id, p_activity, p_destination_branch_id)
              then 'noop' else x.endpoint end
    from (select ops.esb_endpoint_for(p_action, p_branch_id, p_destination_branch_id) as endpoint) x
$$;
comment on function ops.esb_endpoint_for_movement(text, uuid, text, uuid) is
  'The ERP operation for a movement on a route: esb_endpoint_for, except a cross-branch transfer on a route whose Record in ESB switch is off is noop and never queued.';
revoke execute on function ops.esb_endpoint_for_movement(text, uuid, text, uuid) from public, anon, authenticated, service_role;

create function ops.list_cafe_route_esb_switches()
returns table(origin_branch_id uuid, origin_activity text, destination_branch_id uuid, record_in_esb boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := shared.current_org_id();
begin
  if v_org is null or not shared.is_org_member() or not shared.has_access_role('admin') then
    raise exception 'CAFE_ROUTE_ESB_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
    select d.origin_branch_id, d.origin_activity, d.destination_branch_id, d.record_in_esb
      from ops.cafe_destinations d where d.org_id = v_org
     order by d.origin_branch_id, d.origin_activity, d.destination_branch_id;
end;
$$;
revoke execute on function ops.list_cafe_route_esb_switches() from public, anon, service_role;
grant execute on function ops.list_cafe_route_esb_switches() to authenticated;

create function ops.set_cafe_route_record_in_esb(p_key jsonb, p_enabled boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_key record;
  v_before ops.cafe_destinations%rowtype;
  v_after ops.cafe_destinations%rowtype;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() or not shared.has_access_role('admin') then
    raise exception 'CAFE_ROUTE_ESB_ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'CAFE_ROUTE_ESB_INVALID' using errcode = '22023'; end if;
  select * into v_key from ops._parse_cafe_transfer_route(p_key);
  select * into v_before from ops.cafe_destinations d
   where d.org_id = v_org and d.origin_branch_id = v_key.origin_branch_id
     and d.origin_activity = v_key.origin_activity and d.destination_branch_id = v_key.destination_branch_id
   for update;
  if not found then raise exception 'CAFE_ROUTE_ESB_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_before.record_in_esb = p_enabled then
    return jsonb_build_object('record_in_esb', v_before.record_in_esb, 'row_version', v_before.row_version);
  end if;
  update ops.cafe_destinations d
     set record_in_esb = p_enabled, row_version = d.row_version + 1, updated_at = clock_timestamp(), updated_by = v_actor
   where d.org_id = v_org and d.origin_branch_id = v_key.origin_branch_id
     and d.origin_activity = v_key.origin_activity and d.destination_branch_id = v_key.destination_branch_id
  returning * into v_after;
  insert into ops.cafe_transfer_route_audit
    (org_id, before_route, after_route, operation, actor_person_id, resulting_version)
  values (v_org,
    jsonb_build_object('org_id', v_before.org_id, 'origin_branch_id', v_before.origin_branch_id,
      'origin_activity', v_before.origin_activity, 'destination_branch_id', v_before.destination_branch_id,
      'row_version', v_before.row_version, 'record_in_esb', v_before.record_in_esb),
    jsonb_build_object('org_id', v_after.org_id, 'origin_branch_id', v_after.origin_branch_id,
      'origin_activity', v_after.origin_activity, 'destination_branch_id', v_after.destination_branch_id,
      'row_version', v_after.row_version, 'record_in_esb', v_after.record_in_esb),
    'update', v_actor, v_after.row_version);
  return jsonb_build_object('record_in_esb', v_after.record_in_esb, 'row_version', v_after.row_version);
end;
$$;
comment on function ops.set_cafe_route_record_in_esb(jsonb, boolean) is
  'Admin-only writer for a route''s Record in ESB switch; audited like any other route change.';
revoke execute on function ops.set_cafe_route_record_in_esb(jsonb, boolean) from public, anon, service_role;
grant execute on function ops.set_cafe_route_record_in_esb(jsonb, boolean) to authenticated;

-- Re-keying a route keeps its switch.
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
      (org_id, origin_branch_id, origin_activity, destination_branch_id, row_version, updated_at, updated_by, record_in_esb)
    values (v_org_id, v_input.origin_branch_id, v_input.origin_activity, v_input.destination_branch_id,
      v_version, clock_timestamp(), v_actor_id, v_before.record_in_esb)
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

-- ── Location RPCs carry the Site and the Activities ──────────────────────────────────────────
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
    'site_id', l.site_id,
    'activities', coalesce((select jsonb_agg(la.activity order by la.activity)
                              from ops.location_activities la
                             where la.org_id = l.org_id and la.location_id = l.id), '[]'::jsonb),
    'archived_at', l.archived_at, 'row_version', l.row_version,
    'updated_at', l.updated_at, 'updated_by', l.updated_by
  )
  from ops.locations l
  where l.org_id = (select shared.current_org_id()) and l.id = p_location_id
$$;

drop function ops._validate_cafe_location_input(jsonb, uuid);
create function ops._validate_cafe_location_input(p_input jsonb, p_current_id uuid)
returns table(location_name text, location_use text, parent_id uuid, branch_ids uuid[], site_id uuid, activities text[])
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
  v_site uuid;
  v_activities text[];
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
  -- Physically at: a key present sets it (null clears it); a key absent keeps the current value.
  if p_input ? 'site_id' then
    if nullif(p_input ->> 'site_id', '') is not null then
      v_site := (p_input ->> 'site_id')::uuid;
      if not exists (select 1 from shared.sites s where s.org_id = v_org and s.id = v_site and s.archived_at is null) then
        raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
      end if;
    end if;
  elsif p_current_id is not null then
    select l.site_id into v_site from ops.locations l where l.org_id = v_org and l.id = p_current_id;
  end if;
  -- Activities: a key present replaces them; a key absent keeps the current ones.
  if p_input ? 'activities' then
    if jsonb_typeof(p_input -> 'activities') is distinct from 'array' or jsonb_array_length(p_input -> 'activities') > 20 then
      raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct value order by value), '{}'::text[]) into v_activities
      from jsonb_array_elements_text(p_input -> 'activities') as requested(value);
    if exists (select 1 from unnest(v_activities) as a(code) where not exists (select 1 from shared.activities x where x.code = a.code)) then
      raise exception 'CAFE_LOCATION_INVALID' using errcode = '22023';
    end if;
  elsif p_current_id is not null then
    select coalesce(array_agg(la.activity order by la.activity), '{}'::text[]) into v_activities
      from ops.location_activities la where la.org_id = v_org and la.location_id = p_current_id;
  else
    v_activities := '{}'::text[];
  end if;
  -- A client that sends no Activities for a new production Location gets the Branch's only producing Stream.
  if v_use in ('production', 'both') and not (p_input ? 'activities') and cardinality(v_activities) = 0
     and cardinality(v_branches) = 1 then
    select coalesce(array_agg(distinct t.activity), '{}'::text[]) into v_activities
      from shared.teams t
     where t.org_id = v_org and t.branch_id = v_branches[1] and t.archived_at is null and t.produces is true;
    if cardinality(v_activities) <> 1 then v_activities := '{}'::text[]; end if;
  end if;
  -- Rule 1: a production Location is exactly one Branch and one Activity.
  if v_use in ('production', 'both') and (cardinality(v_branches) <> 1 or cardinality(v_activities) <> 1) then
    raise exception 'CAFE_LOCATION_PRODUCTION_SHAPE' using errcode = '22023';
  end if;
  return query select v_name, v_use, v_parent, v_branches, v_site, v_activities;
end;
$$;
revoke execute on function ops._validate_cafe_location_input(jsonb, uuid) from public, anon, authenticated, service_role;

drop function ops.list_cafe_locations(jsonb);
create function ops.list_cafe_locations(p_filter jsonb default '{}'::jsonb)
returns table(
  id uuid, name text, use text, parent_id uuid, branch_ids uuid[], archived_at timestamptz,
  row_version bigint, updated_at timestamptz, updated_by uuid, site_id uuid, activities text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.name, l.use, l.parent_id,
         coalesce((select array_agg(lb.branch_id order by lb.branch_id) from ops.location_branches lb
                    where lb.org_id = l.org_id and lb.location_id = l.id), '{}'::uuid[]),
         l.archived_at, l.row_version, l.updated_at, l.updated_by, l.site_id,
         coalesce((select array_agg(la.activity order by la.activity) from ops.location_activities la
                    where la.org_id = l.org_id and la.location_id = l.id), '{}'::text[])
    from ops.locations l
   where l.org_id = (select shared.current_org_id())
     and (p_filter is null or (p_filter ? 'ids') or (l.archived_at is not null) = coalesce((p_filter ->> 'archived')::boolean, false))
     and (p_filter is null or not (p_filter ? 'branch_id') or exists (
       select 1 from ops.location_branches wanted where wanted.org_id = l.org_id and wanted.location_id = l.id
         and wanted.branch_id = (p_filter ->> 'branch_id')::uuid))
     and (p_filter is null or not (p_filter ? 'activity') or exists (
       select 1 from ops.location_activities wanted where wanted.org_id = l.org_id and wanted.location_id = l.id
         and wanted.activity = p_filter ->> 'activity'))
     and (p_filter is null or not (p_filter ? 'use') or l.use = p_filter ->> 'use' or l.use = 'both')
     and (p_filter is null or not (p_filter ? 'ids') or l.id = any(array(select jsonb_array_elements_text(p_filter -> 'ids')::uuid)))
   order by l.name, l.id
$$;
comment on function ops.list_cafe_locations(jsonb) is
  'Current-org location catalog with Site and Activities, including archived identities when requested. Stable name/id ordering supports complete range reads.';
revoke execute on function ops.list_cafe_locations(jsonb) from public, anon, service_role;
grant execute on function ops.list_cafe_locations(jsonb) to authenticated;

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
  insert into ops.locations (org_id, name, use, parent_id, site_id, created_by, updated_by)
  values (v_org, v_input.location_name, v_input.location_use, v_input.parent_id, v_input.site_id, v_actor, v_actor)
  returning id into v_id;
  insert into ops.location_branches (org_id, location_id, branch_id)
  select v_org, v_id, branch_id from unnest(v_input.branch_ids) as branches(branch_id);
  insert into ops.location_activities (org_id, location_id, activity)
  select v_org, v_id, code from unnest(v_input.activities) as activities(code);
  v_snapshot := ops._cafe_location_snapshot(v_id);
  insert into ops.location_audit (org_id, location_id, actor_id, client_request_id, request_hash, action, row_version, after_state)
  values (v_org, v_id, v_actor, p_client_request_id, v_hash, 'create', 1, v_snapshot);
  return v_snapshot;
exception when unique_violation then
  raise exception 'CAFE_LOCATION_DUPLICATE' using errcode = '23505';
end;
$$;
revoke execute on function ops.create_cafe_location(jsonb, uuid) from public, anon, service_role;
grant execute on function ops.create_cafe_location(jsonb, uuid) to authenticated;
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
         site_id = v_input.site_id,
         row_version = row_version + 1, updated_at = clock_timestamp(), updated_by = v_actor
   where org_id = v_org and id = p_id returning * into v_location;
  delete from ops.location_branches where org_id = v_org and location_id = p_id;
  insert into ops.location_branches (org_id, location_id, branch_id)
  select v_org, p_id, branch_id from unnest(v_input.branch_ids) as branches(branch_id);
  delete from ops.location_activities where org_id = v_org and location_id = p_id;
  insert into ops.location_activities (org_id, location_id, activity)
  select v_org, p_id, code from unnest(v_input.activities) as activities(code);
  v_after := ops._cafe_location_snapshot(p_id);
  insert into ops.location_audit (org_id, location_id, actor_id, client_request_id, request_hash, action, row_version, before_state, after_state)
  values (v_org, p_id, v_actor, p_client_request_id, v_hash, 'update', v_location.row_version, v_before, v_after);
  return v_after;
exception when unique_violation then
  raise exception 'CAFE_LOCATION_DUPLICATE' using errcode = '23505';
end;
$$;
revoke execute on function ops.update_cafe_location(uuid, bigint, jsonb, uuid) from public, anon, service_role;
grant execute on function ops.update_cafe_location(uuid, bigint, jsonb, uuid) to authenticated;
