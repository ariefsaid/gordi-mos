-- Stream destinations require the same Branch or a route, and exclude the own output place.
-- DOWN: supabase/rollbacks/20261026000100_ops_cafe_own_output_destinations.sql.
begin;
do $$
declare v_logs integer; v_plans integer;
begin
  select count(*) into v_logs from ops.kitchen_logs l
   where l.action = 'transfer' and l.status = 'Submitted' and l.destination_branch_id is distinct from l.branch_id
     and ops._cafe_location_at_stream_site(l.org_id, l.branch_id, l.activity, l.to_storage_location_id)
     and not exists (select 1 from ops.cafe_destinations d where d.org_id = l.org_id and d.origin_branch_id = l.branch_id
                       and d.origin_activity = l.activity and d.destination_branch_id = l.destination_branch_id);
  select count(*) into v_plans from ops.kitchen_plans p
   where p.action = 'transfer' and p.destination_branch_id is distinct from p.branch_id
     and ops._cafe_location_at_stream_site(p.org_id, p.branch_id, p.activity, p.to_location_id)
     and not exists (select 1 from ops.cafe_destinations d where d.org_id = p.org_id and d.origin_branch_id = p.branch_id
                       and d.origin_activity = p.activity and d.destination_branch_id = p.destination_branch_id);
  raise notice 'migration 20261026000100: % submitted (unapproved) cross-branch transfer(s) and % cross-branch transfer plan(s) have no route and were valid only under the same-Site rule', v_logs, v_plans;
end $$;
alter table ops.locations add column is_stream_output boolean not null default false;
comment on column ops.locations.is_stream_output is
  'Designated own output place for its single Branch/Activity; takes precedence over the unique-place fallback.';
-- Owner-confirmed mapping; only an unambiguous active Central in the linked stream is designated.
with candidates as (
  select l.id, l.org_id, b.branch_id, a.activity,
         count(*) over (partition by l.org_id, b.branch_id, a.activity) as matches
    from ops.locations l
    join ops.location_branches b on b.org_id = l.org_id and b.location_id = l.id
    join shared.branches branch on branch.org_id = b.org_id and branch.id = b.branch_id
    join ops.location_activities a on a.org_id = l.org_id and a.location_id = l.id
   where l.name = 'RRS Central' and branch.name = 'Rumah Rames' and a.activity = 'kitchen'
     and branch.archived_at is null and l.archived_at is null and l.use = 'both'
)
update ops.locations l set is_stream_output = true from candidates c
 where c.matches = 1 and l.org_id = c.org_id and l.id = c.id;
create function ops._cafe_stream_output_location(p_org uuid, p_branch uuid, p_activity text)
returns uuid language sql stable security invoker set search_path = '' as $$
  with eligible as (
    select l.id, l.is_stream_output
      from ops.locations l
      join ops.location_branches b on b.org_id = l.org_id and b.location_id = l.id and b.branch_id = p_branch
      join ops.location_activities a on a.org_id = l.org_id and a.location_id = l.id and a.activity = p_activity
     where l.org_id = p_org and l.archived_at is null and l.use = 'both'
       and (select count(*) from ops.location_branches x where x.org_id = l.org_id and x.location_id = l.id) = 1
       and (select count(*) from ops.location_activities x where x.org_id = l.org_id and x.location_id = l.id) = 1
  ), preferred as (
    select * from eligible where is_stream_output or not exists (select 1 from eligible where is_stream_output)
  )
  select case when count(*) = 1 then (array_agg(id))[1] end from preferred
$$;
revoke execute on function ops._cafe_stream_output_location(uuid, uuid, text) from public, anon, service_role;
grant execute on function ops._cafe_stream_output_location(uuid, uuid, text) to authenticated;

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
    'site_id', l.site_id, 'is_stream_output', l.is_stream_output,
    'activities', coalesce((select jsonb_agg(la.activity order by la.activity)
                              from ops.location_activities la
                             where la.org_id = l.org_id and la.location_id = l.id), '[]'::jsonb),
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
  row_version bigint, updated_at timestamptz, updated_by uuid, site_id uuid, activities text[], is_stream_output boolean
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
                    where la.org_id = l.org_id and la.location_id = l.id), '{}'::text[]), l.is_stream_output
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

create or replace function ops.list_cafe_destination_locations(p_branch_id uuid, p_activity text)
returns table(location_id uuid, name text, branch_id uuid, same_branch boolean)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.branch_id, c.same_branch
    from (
      select distinct on (s.id) s.id, s.name, sb.branch_id, sb.branch_id = p_branch_id as same_branch
        from ops.locations s
        join ops.location_branches sb on sb.org_id = s.org_id and sb.location_id = s.id
       where s.org_id = (select shared.current_org_id()) and s.archived_at is null
         and s.use in ('storage', 'both')
         and s.id is distinct from ops._cafe_stream_output_location(s.org_id, p_branch_id, p_activity)
         and (select shared.is_org_member())
         and exists (select 1 from shared.teams t
                      where t.org_id = s.org_id and t.branch_id = p_branch_id and t.activity = p_activity
                        and t.archived_at is null)
         and (sb.branch_id = p_branch_id
              or exists (select 1 from ops.allowed_kitchen_destinations(s.org_id, p_branch_id, p_activity) d
                          where d.destination_branch_id = sb.branch_id))
       order by s.id, (sb.branch_id <> p_branch_id), sb.branch_id
    ) c
   order by (not c.same_branch), c.name, c.id
$$;
comment on function ops.list_cafe_destination_locations(uuid, text) is
  'Every active storage Location the stream can send to: in its Branch or a routed Branch, excluding its own output place.';
revoke execute on function ops.list_cafe_destination_locations(uuid, text) from public, anon, service_role;
grant execute on function ops.list_cafe_destination_locations(uuid, text) to authenticated;

commit;
