-- OD-CAFE-MVP-7: cross-branch destinations are reference rows, not branch-code rules.
-- The current Gordi HQ routes start with Cikal; an added destination is another row, not a
-- change to ops.allowed_kitchen_destinations(). Intra-branch bar movements remain derived.
--
-- DOWN: restore shared.seed_stream_teams(), ops._test_seed_streams(), and
-- ops.allowed_kitchen_destinations(uuid,uuid,text) from 20260914000002_ops_cafe_books.sql;
-- then drop ops.seed_cafe_destinations(). Migration 20261002000001 owns the route table.

-- Seed values are route data, not derivation logic; the org-scoped RLS relation is in 000001. Future destination changes add rows here for
-- fresh/dev seeds and in a new migration for existing orgs.
create or replace function ops.seed_cafe_destinations()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into ops.cafe_destinations
    (org_id, origin_branch_id, origin_activity, destination_branch_id)
  select o.id, origin.id, route.origin_activity, destination.id
  from shared.orgs o
  cross join (values
    ('gordi_hq',    'kitchen', 'cikal'),
    ('gordi_hq',    'bar',     'cikal'),
    ('rumah_rames', 'kitchen', 'radiant'),
    ('rumah_rames', 'kitchen', 'cikal'),
    ('rumah_rames', 'bar',     'gordi_hq'),
    ('rumah_rames', 'bar',     'radiant'),
    ('rumah_rames', 'bar',     'cikal'),
    ('radiant',     'bar',     'gordi_hq'),
    ('radiant',     'bar',     'rumah_rames'),
    ('radiant',     'bar',     'cikal'),
    ('cikal',       'bar',     'gordi_hq'),
    ('cikal',       'bar',     'rumah_rames'),
    ('cikal',       'bar',     'radiant')
  ) as route(origin_code, origin_activity, destination_code)
  join shared.branches origin
    on origin.org_id = o.id and origin.code = route.origin_code and origin.archived_at is null
  join shared.branches destination
    on destination.org_id = o.id and destination.code = route.destination_code
   and destination.archived_at is null
  on conflict (org_id, origin_branch_id, origin_activity, destination_branch_id) do nothing;
end;
$$;
comment on function ops.seed_cafe_destinations() is
  'Seed/migration-only route-data loader. Kept out of authenticated write paths.';
revoke execute on function ops.seed_cafe_destinations() from public, anon, authenticated;

-- Stream-team seeding is the existing single bootstrap used by migrations and seed.sql. Extend it
-- so both a migration-time org and a fresh-seed org receive the same route rows.
create or replace function shared.seed_stream_teams()
returns void language plpgsql set search_path = '' as $$
declare o record; v_missing text;
begin
  for o in select id as org_id from shared.orgs loop
    insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity, produces)
    select o.org_id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code, b.id, a.code,
      case
        when b.code in ('gordi_hq', 'rumah_rames') and a.code in ('kitchen', 'bar') then true
        when b.code in ('radiant', 'cikal') and a.code = 'bar' then true
        else false
      end
    from shared.branches b cross join shared.activities a
    join shared.business_units bu on bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null
    where b.org_id = o.org_id and b.archived_at is null
      and (b.code in ('gordi_hq', 'rumah_rames', 'radiant') or (b.code = 'cikal' and a.code = 'bar'))
    on conflict (org_id, code) do nothing;

    select string_agg(e.branch_code || '/' || e.activity, ', ' order by e.branch_code, e.activity)
      into v_missing
    from (
      select b.code as branch_code, a.code as activity, b.id as branch_id
      from shared.branches b cross join shared.activities a
      where b.org_id = o.org_id and b.archived_at is null
        and (b.code in ('gordi_hq', 'rumah_rames', 'radiant') or (b.code = 'cikal' and a.code = 'bar'))
        and exists (select 1 from shared.business_units bu
                    where bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null)
    ) e
    where not exists (select 1 from shared.teams t
                      where t.org_id = o.org_id and t.branch_id = e.branch_id
                        and t.activity = e.activity and t.archived_at is null);
    if v_missing is not null then
      raise exception 'stream-team seed shortfall for org %: missing %', o.org_id, v_missing;
    end if;
  end loop;
  perform ops.seed_cafe_destinations();
end;
$$;
revoke execute on function shared.seed_stream_teams() from public, anon, authenticated;

-- The production/dev orgs already present at migration time receive the reference rows now;
-- fresh-reset orgs receive them when seed.sql calls shared.seed_stream_teams().
select shared.seed_stream_teams();

-- Keep isolated pgTAP fixtures in parity with the deployed route catalog.
create or replace function ops._test_seed_streams()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_streams is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;
  insert into shared.business_units (id, org_id, name, code) values
    ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar','retail_ops'),
    ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B Kitchen','retail_ops')
  on conflict (id) do nothing;
  insert into shared.branches (id, org_id, code, name) values
    ('00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-0000000000a1','gordi_hq','Gordi HQ'),
    ('00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
    ('00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-0000000000a1','radiant','Radiant'),
    ('00000000-0000-0000-0000-00000000bf09','00000000-0000-0000-0000-0000000000b1','b_branch','B Branch')
  on conflict (id) do nothing;
  insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity, produces)
  select o.id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code,
         b.id, a.code,
         case
           when a.code = 'bar' then true
           when b.code in ('gordi_hq', 'rumah_rames') and a.code = 'kitchen' then true
           when b.code = 'b_branch' and a.code = 'kitchen' then true
           when b.code = 'radiant' and a.code = 'kitchen' then false
           else false
         end
    from shared.orgs o
    join shared.business_units bu on bu.org_id=o.id and bu.code='retail_ops' and bu.archived_at is null
    join shared.branches b on b.org_id=o.id and b.archived_at is null
    cross join shared.activities a
   where (o.id='00000000-0000-0000-0000-0000000000a1' and b.code in ('gordi_hq','rumah_rames','radiant'))
      or (o.id='00000000-0000-0000-0000-0000000000b1' and b.code='b_branch' and a.code='kitchen')
  on conflict (org_id, branch_id, activity) where branch_id is not null and archived_at is null
  do update set produces = excluded.produces;
  perform ops.seed_cafe_destinations();
end;
$$;
comment on function ops._test_seed_streams() is
  'TEST-ONLY fixture: idempotently seeds the test branch, Café business unit, and producing stream Teams.';
revoke execute on function ops._test_seed_streams() from public, anon, authenticated;

-- Destination matrix reads only the explicit cross-branch rows. The original bar-only held
-- intra-branch movement remains available when a kitchen stream exists at that branch.
create or replace function ops.allowed_kitchen_destinations(
  p_org_id uuid, p_origin_branch_id uuid, p_origin_activity text
) returns table(destination_branch_id uuid)
language sql stable security invoker set search_path = '' as $$
  with origin as (
    select t.branch_id, t.activity, t.produces from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id and b.archived_at is null
    where t.org_id = p_org_id and t.branch_id = p_origin_branch_id
      and t.activity = p_origin_activity and t.archived_at is null
  ), stream_branches as (
    select distinct t.branch_id from shared.teams t join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.branch_id is not null and t.archived_at is null and b.archived_at is null
  ), bar_branches as (
    select distinct t.branch_id from shared.teams t join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.activity = 'bar' and t.archived_at is null and b.archived_at is null
  ), kitchen_branches as (
    select distinct t.branch_id from shared.teams t join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.activity = 'kitchen' and t.archived_at is null and b.archived_at is null
  )
  select b.id from shared.branches b cross join origin o
  where b.org_id = p_org_id and b.archived_at is null and o.produces
    and ((o.activity = 'kitchen'
          and b.id <> o.branch_id
          and b.id in (select branch_id from stream_branches)
          and exists (select 1 from ops.cafe_destinations d
                      where d.org_id = p_org_id and d.origin_branch_id = o.branch_id
                        and d.origin_activity = o.activity and d.destination_branch_id = b.id))
      or (o.activity = 'bar' and ((b.id = o.branch_id and b.id in (select branch_id from kitchen_branches))
        or (b.id <> o.branch_id and b.id in (select branch_id from bar_branches)
          and exists (select 1 from ops.cafe_destinations d
                      where d.org_id = p_org_id and d.origin_branch_id = o.branch_id
                        and d.origin_activity = o.activity and d.destination_branch_id = b.id)))))
  order by b.name;
$$;
grant execute on function ops.allowed_kitchen_destinations(uuid, uuid, text) to authenticated;
