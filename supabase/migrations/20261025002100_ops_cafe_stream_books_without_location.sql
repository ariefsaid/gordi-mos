-- Café back to stream-first (2 of 2): a stream's books no longer depend on one production Location.
--  * A plan row's stream is its own Branch and Activity; the fill rule no longer works the stream out of
--    from_location_id. The column stays (nullable) for history.
--  * ops._cafe_stream_production_location (the "exactly one production Location" helper) is gone, and
--    so are its uses: the plan fill rule, the one-off locations backfill (which no longer points plans
--    and logs at a stream's single Location), and the outlet-send places (back to the stream defaults).
--
-- DOWN: run supabase/rollbacks/20261025002100_ops_cafe_stream_books_without_location.sql.

create or replace function ops._fill_cafe_plan_locations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.org_id, shared.current_org_id());
  v_branches uuid[];
begin
  -- The row's Branch and Activity are the stream it is for; from_location_id is history and names no stream.
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

create or replace function ops.cafe_outlet_send_places(p_branch uuid, p_activity text)
returns table(from_location_id uuid,to_location_id uuid)
language sql stable security invoker set search_path = '' as $$
 with defaults as (
  select d.* from ops.stream_location_defaults d
  join shared.teams t on t.org_id=d.org_id and t.branch_id=d.branch_id and t.activity=d.activity
  join shared.branches b on b.org_id=t.org_id and b.id=t.branch_id and b.archived_at is null
  where d.org_id=shared.current_org_id() and d.branch_id=p_branch and d.activity=p_activity
    and p_activity='kitchen' and t.produces and t.archived_at is null
 ), active as (
  select l.id,l.use from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
  where l.org_id=shared.current_org_id() and b.branch_id=p_branch and l.archived_at is null
 ), choices as (
  select d.storage_location_id as source, outlet.id as destination from defaults d
  join active production on production.id=d.production_location_id and production.use in ('production','both')
  join active storage on storage.id=d.storage_location_id and storage.use in ('storage','both')
  join active outlet on outlet.id<>production.id and outlet.id<>storage.id and outlet.use in ('storage','both')
 ) select source,destination from choices where (select count(*) from choices)=1
$$;

create or replace function ops._backfill_cafe_locations_first()
returns void
language plpgsql
set search_path = ''
as $backfill$
declare
  r record;
  v_id uuid;
  v_name text;
  v_n integer;
  v_demoted integer;
  v_created integer := 0;
  v_plans_converted integer;
  v_logs_converted integer;
begin
  -- Plan and log history is rewritten as data, not as a user edit: their guards and history
  -- recorders stay quiet for this one transaction.
  alter table ops.kitchen_logs disable trigger user;
  alter table ops.kitchen_plans disable trigger user;

  -- Which Location an outlet send used to go to, read once from the old defaults (the only time
  -- the defaults are read for a decision): the stream's production and storage defaults plus the
  -- one other storage Location of the Branch.
  drop table if exists pg_temp.outlet_places;
  create temporary table outlet_places on commit drop as
  with defaults as (
    select d.* from ops.stream_location_defaults d
      join shared.teams t on t.org_id = d.org_id and t.branch_id = d.branch_id and t.activity = d.activity
     where d.activity = 'kitchen' and t.produces and t.archived_at is null
  ), active as (
    select l.org_id, l.id, l.use, b.branch_id from ops.locations l
      join ops.location_branches b on b.org_id = l.org_id and b.location_id = l.id
     where l.archived_at is null
  ), choices as (
    select d.org_id, d.branch_id, d.activity, d.storage_location_id as source, outlet.id as destination, outlet.use as destination_use
      from defaults d
      join active production on production.org_id = d.org_id and production.id = d.production_location_id
                            and production.branch_id = d.branch_id and production.use in ('production', 'both')
      join active storage on storage.org_id = d.org_id and storage.id = d.storage_location_id
                         and storage.branch_id = d.branch_id and storage.use in ('storage', 'both')
      join active outlet on outlet.org_id = d.org_id and outlet.branch_id = d.branch_id
                        and outlet.id <> production.id and outlet.id <> storage.id and outlet.use in ('storage', 'both')
  )
  select c.org_id, c.branch_id, c.activity, c.destination as to_location_id, c.destination_use
    from choices c
   where (select count(*) from choices x where x.org_id = c.org_id and x.branch_id = c.branch_id and x.activity = c.activity) = 1;

  -- 1. A stream's default places work in that stream's Activity (storage-only places only, so a
  --    production Location never picks up a second Activity from a storage default).
  insert into ops.location_activities (org_id, location_id, activity)
  select d.org_id, d.production_location_id, d.activity from ops.stream_location_defaults d
   where d.production_location_id is not null
  on conflict do nothing;
  insert into ops.location_activities (org_id, location_id, activity)
  select d.org_id, d.storage_location_id, d.activity
    from ops.stream_location_defaults d
    join ops.locations l on l.org_id = d.org_id and l.id = d.storage_location_id and l.use = 'storage'
   where d.storage_location_id is not null
  on conflict do nothing;

  -- 2. Rule 1 for what exists. A one-Branch production Location with no Activity takes its
  --    Branch's only producing Activity when there is exactly one.
  insert into ops.location_activities (org_id, location_id, activity)
  select l.org_id, l.id, min(t.activity)
    from ops.locations l
    join ops.location_branches lb on lb.org_id = l.org_id and lb.location_id = l.id
    join shared.teams t on t.org_id = l.org_id and t.branch_id = lb.branch_id and t.archived_at is null and t.produces
   where l.use in ('production', 'both') and l.archived_at is null
     and not exists (select 1 from ops.location_activities x where x.org_id = l.org_id and x.location_id = l.id)
     and (select count(*) from ops.location_branches x where x.org_id = l.org_id and x.location_id = l.id) = 1
   group by l.org_id, l.id
  having count(distinct t.activity) = 1
  on conflict do nothing;

  update ops.locations l
     set use = 'storage', row_version = l.row_version + 1, updated_at = clock_timestamp()
   where l.use in ('production', 'both') and l.archived_at is null
     and ((select count(*) from ops.location_branches x where x.org_id = l.org_id and x.location_id = l.id) <> 1
       or (select count(*) from ops.location_activities x where x.org_id = l.org_id and x.location_id = l.id) <> 1);
  get diagnostics v_demoted = row_count;

  -- 3. Every producing Stream has one production Location.
  for r in
    select t.org_id, t.branch_id, t.activity, b.name as branch_name, a.name as activity_name
      from shared.teams t
      join shared.branches b on b.org_id = t.org_id and b.id = t.branch_id and b.archived_at is null
      join shared.activities a on a.code = t.activity
     where t.archived_at is null and t.produces is true and t.branch_id is not null and t.activity is not null
       and not exists (
         select 1 from ops.locations l
           join ops.location_branches lb on lb.org_id = l.org_id and lb.location_id = l.id and lb.branch_id = t.branch_id
           join ops.location_activities la on la.org_id = l.org_id and la.location_id = l.id and la.activity = t.activity
          where l.org_id = t.org_id and l.archived_at is null and l.use in ('production', 'both'))
     order by b.name, a.name
  loop
    v_name := r.branch_name || ' ' || r.activity_name;
    v_n := 1;
    while exists (select 1 from ops.locations l
                   where l.org_id = r.org_id and l.parent_id is null and l.archived_at is null
                     and lower(regexp_replace(btrim(l.name), '\s+', ' ', 'g')) = lower(v_name)) loop
      v_n := v_n + 1;
      v_name := r.branch_name || ' ' || r.activity_name || ' production' || case when v_n > 2 then ' ' || v_n else '' end;
    end loop;
    insert into ops.locations (org_id, name, use, site_id)
    values (r.org_id, v_name, 'both',
            (select s.id from shared.sites s
              where s.org_id = r.org_id and s.archived_at is null and lower(btrim(s.name)) = lower(btrim(r.branch_name))
              order by s.code limit 1))
    returning id into v_id;
    insert into ops.location_branches (org_id, location_id, branch_id) values (r.org_id, v_id, r.branch_id);
    insert into ops.location_activities (org_id, location_id, activity) values (r.org_id, v_id, r.activity);
    v_created := v_created + 1;
  end loop;

  -- The outlet an old send went to now works in the sending Stream's Activity, so the converted
  -- send keeps leaving the Stream's stock untouched (a storage-only place; see the rollback note).
  insert into ops.location_activities (org_id, location_id, activity)
  select p.org_id, p.to_location_id, p.activity from pg_temp.outlet_places p where p.destination_use = 'storage'
  on conflict do nothing;

  insert into ops.location_activities (org_id, location_id, activity)
  select distinct l.org_id, l.to_storage_location_id, l.activity
    from ops.kitchen_logs l
    join ops.locations dest on dest.org_id = l.org_id and dest.id = l.to_storage_location_id and dest.use = 'storage'
   where l.action = 'outlet_send' and l.to_storage_location_id is not null
  on conflict do nothing;

  -- 4a. Plans: a transfer points at its destination Location when the destination Branch has exactly one to go to.
  update ops.kitchen_plans p
     set to_location_id = ops._cafe_sole_storage_location(p.org_id, p.destination_branch_id, p.from_location_id)
   where p.action = 'transfer' and p.to_location_id is null and p.destination_branch_id is not null;

  -- 4b. outlet_send plans become a transfer inside the Branch (rows that would collide on the
  --     plan key stay outlet_send).
  update ops.kitchen_plans p
     set action = 'transfer', destination_branch_id = p.branch_id,
         to_location_id = (select o.to_location_id from pg_temp.outlet_places o
                            where o.org_id = p.org_id and o.branch_id = p.branch_id and o.activity = p.activity)
   where p.action = 'outlet_send'
     and not exists (
       select 1 from ops.kitchen_plans q
        where q.org_id = p.org_id and q.log_date = p.log_date and q.wip_item_id = p.wip_item_id
          and q.branch_id = p.branch_id and q.activity = p.activity and q.action = 'transfer'
          and q.destination_branch_id = p.branch_id
          and q.to_location_id is not distinct from
              (select o.to_location_id from pg_temp.outlet_places o
                where o.org_id = p.org_id and o.branch_id = p.branch_id and o.activity = p.activity));
  get diagnostics v_plans_converted = row_count;

  -- 4c. Logs: a reviewed transfer points at its destination Location. Pending logs keep their own places. Waste is left alone.
  update ops.kitchen_logs l
     set to_storage_location_id = ops._cafe_sole_storage_location(l.org_id, l.destination_branch_id, l.from_storage_location_id)
   where l.action = 'transfer' and l.status in ('Approved', 'Rejected') and l.to_storage_location_id is null;
  update ops.kitchen_logs l
     set action = 'transfer', destination_branch_id = l.branch_id
   where l.action = 'outlet_send';
  get diagnostics v_logs_converted = row_count;

  alter table ops.kitchen_logs enable trigger user;
  alter table ops.kitchen_plans enable trigger user;

  raise notice 'cafe locations backfill: % production location(s) became storage, % stream location(s) created, % outlet send plan(s) and % log(s) converted to transfers',
    v_demoted, v_created, v_plans_converted, v_logs_converted;
end;
$backfill$;

drop function ops._cafe_stream_production_location(uuid, uuid, text);
