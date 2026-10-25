-- Café back to stream-first (1 of 2): where a stream can send.
-- A stream sends to its own branch's storage Locations, to any storage Location physically at the same
-- Site as one of the stream's own Locations (so Gordi HQ's kitchen can send to a Location sitting at the
-- same Site under another branch, and the reverse), and to the Locations of branches it has a route to. No route is needed
-- for the first two; a route's "Record in ESB" switch still decides whether a cross-branch transfer
-- is posted to ESB, so without a route such a transfer is recorded in MOS only.
-- The list is asked of the stream (branch + activity), not of one production Location.
--
-- DOWN: run supabase/rollbacks/20261025002000_ops_cafe_destinations_by_stream.sql.

-- True when the storage Location sits at the same Site as any active Location of the stream (a Location of
-- its Branch that works in its Activity). Sites are on Locations, not Teams, and the rule is symmetric.
create function ops._cafe_location_at_stream_site(p_org uuid, p_branch uuid, p_activity text, p_location uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from ops.locations l
     where l.org_id = p_org and l.id = p_location and l.archived_at is null
       and l.use in ('storage', 'both') and l.site_id is not null
       and exists (
         select 1 from ops.locations own
           join ops.location_branches ob on ob.org_id = own.org_id and ob.location_id = own.id and ob.branch_id = p_branch
           join ops.location_activities oa on oa.org_id = own.org_id and oa.location_id = own.id and oa.activity = p_activity
          where own.org_id = p_org and own.archived_at is null and own.site_id = l.site_id))
$$;
revoke execute on function ops._cafe_location_at_stream_site(uuid, uuid, text, uuid) from public, anon, service_role;
grant execute on function ops._cafe_location_at_stream_site(uuid, uuid, text, uuid) to authenticated;

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
      or (v_to is not null and ops._cafe_location_at_stream_site(new.org_id, new.branch_id, new.activity, v_to))
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
  'On an inserted or re-pointed Café movement, requires the row stream Team to produce and a transfer to be inside the allowed books: a route for another Branch, any Location of its own Branch, or a Location at the same Site as one of the stream''s own Locations (42501). SECURITY INVOKER.';

-- The route lock also lets a movement to a Location at the Branch's Site through (see the books guard).
create or replace function ops._lock_cafe_transfer_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_to uuid;
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
    -- A destination Location physically at the same Site as one of the stream's own Locations needs no route (the books guard
    -- has already accepted it); a route's Record in ESB switch still decides whether it is posted.
    if not found then
      if tg_table_name = 'kitchen_plans' then v_to := new.to_location_id; else v_to := new.to_storage_location_id; end if;
      if v_to is null or not ops._cafe_location_at_stream_site(new.org_id, new.branch_id, new.activity, v_to) then
        raise exception 'transfer route was disabled before submission' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function ops._lock_cafe_transfer_route() from public, anon, authenticated, service_role;

drop function ops.list_cafe_destination_locations(uuid);
create function ops.list_cafe_destination_locations(p_branch_id uuid, p_activity text)
returns table(location_id uuid, name text, branch_id uuid, same_branch boolean)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.branch_id, c.same_branch
    from (
      select distinct on (s.id) s.id, s.name, sb.branch_id, sb.branch_id = p_branch_id as same_branch
        from ops.locations s
        join ops.location_branches sb on sb.org_id = s.org_id and sb.location_id = s.id
       where s.org_id = (select shared.current_org_id()) and s.archived_at is null
         and s.use in ('storage', 'both')
         and (select shared.is_org_member())
         and exists (select 1 from shared.teams t
                      where t.org_id = s.org_id and t.branch_id = p_branch_id and t.activity = p_activity
                        and t.archived_at is null)
         and (sb.branch_id = p_branch_id
              or ops._cafe_location_at_stream_site(s.org_id, p_branch_id, p_activity, s.id)
              or exists (select 1 from ops.allowed_kitchen_destinations(s.org_id, p_branch_id, p_activity) d
                          where d.destination_branch_id = sb.branch_id))
       order by s.id, (sb.branch_id <> p_branch_id), sb.branch_id
    ) c
   order by (not c.same_branch), c.name, c.id
$$;
comment on function ops.list_cafe_destination_locations(uuid, text) is
  'Every active storage Location the stream can send to: in its Branch, physically at the same Site as one of the stream''s own Locations, or in a Branch it has a route to.';
revoke execute on function ops.list_cafe_destination_locations(uuid, text) from public, anon, service_role;
grant execute on function ops.list_cafe_destination_locations(uuid, text) to authenticated;
