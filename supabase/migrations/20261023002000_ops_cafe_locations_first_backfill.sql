-- Café locations first, part 2 (backfill, so nothing breaks on release day).
--   1. Locations that were a stream's default place get that stream's Activity.
--   2. A production Location that is not exactly one Branch and one Activity can no longer be a
--      production Location (rule 1): it becomes a storage Location. Nothing is deleted.
--   3. Every producing Stream with no production Location gets "<Branch> <Activity>" (use both,
--      that Branch, that Activity, Site matched by name when one exists).
--   4. Plans and logs point at those Locations. outlet_send rows become a transfer to the
--      Location in the same Branch; outlet_send stays a valid value so history stays readable.
--
-- DOWN: run supabase/rollbacks/20261023002000_ops_cafe_locations_first_backfill.sql. It restores the
-- outlet_send rows it converted and clears the Location pointers it set. The Locations it created
-- or demoted stay as they are: they are data an admin may already have renamed or used.

-- Kept as a function so the same backfill can be run again, and proven, against legacy-shaped data.
create function ops._backfill_cafe_locations_first()
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

  -- 4a. Plans: every row points at its Stream's production Location; a transfer also at its
  --     destination Location when the destination Branch has exactly one to go to.
  update ops.kitchen_plans p
     set from_location_id = ops._cafe_stream_production_location(p.org_id, p.branch_id, p.activity)
   where p.from_location_id is null;
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

  -- 4c. Logs: production points at the Stream's production Location; a reviewed transfer at its
  --     source and destination Locations. Pending logs keep their own places. Waste is left alone.
  update ops.kitchen_logs l
     set production_location_id = ops._cafe_stream_production_location(l.org_id, l.branch_id, l.activity)
   where l.action = 'produce' and l.production_location_id is null;
  update ops.kitchen_logs l
     set from_storage_location_id = coalesce(l.from_storage_location_id,
           ops._cafe_stream_production_location(l.org_id, l.branch_id, l.activity)),
         to_storage_location_id = coalesce(l.to_storage_location_id,
           ops._cafe_sole_storage_location(l.org_id, l.destination_branch_id,
             coalesce(l.from_storage_location_id, ops._cafe_stream_production_location(l.org_id, l.branch_id, l.activity))))
   where l.action = 'transfer' and l.status in ('Approved', 'Rejected')
     and (l.from_storage_location_id is null or l.to_storage_location_id is null);
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
revoke execute on function ops._backfill_cafe_locations_first() from public, anon, authenticated, service_role;

select ops._backfill_cafe_locations_first();
