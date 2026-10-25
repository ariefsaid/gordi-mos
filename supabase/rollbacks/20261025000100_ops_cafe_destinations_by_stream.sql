-- DOWN for 20261025000100_ops_cafe_destinations_by_stream.sql. Restores the list keyed by the origin
-- Location and the guard that allows a transfer only inside the Branch or on a route.
begin;
drop function ops.list_cafe_destination_locations(uuid, text);
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

create or replace function ops._lock_cafe_transfer_route()
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
drop function ops._cafe_location_at_branch_site(uuid, uuid, uuid);
commit;
