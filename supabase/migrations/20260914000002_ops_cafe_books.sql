-- Café books: explicit producer facts and stream-derived destinations (#777, DD-MVP-9).
--
-- This is deliberately additive on the current chain. It does not replace either existing kitchen
-- guard: focused BEFORE triggers add the new refusal at write time, preserving every later review,
-- provenance, and same-org arm in their current definitions.
--
-- DOWN (manual, in one explicit transaction): first drop the two *_books_guard triggers and
-- ops._guard_cafe_books(), then ops.allowed_kitchen_destinations(uuid,uuid,text); restore
-- shared.seed_stream_teams() from 20260827000001_shared_cikal_branch.sql; only after confirming
-- no stream Team or dependent reader remains, drop teams_produces_pair_check and produces. Do not
-- apply that reversal to a database containing #777 rows without a reviewed migration plan.

alter table shared.teams add column produces boolean;

-- Existing catalog rows receive the adopted, explicit MVP map. Unknown current stream pairs fail
-- closed as receive-only; activity alone is never a production grant.
update shared.teams t
set produces = case
  when b.code in ('gordi_hq', 'rumah_rames') and t.activity in ('kitchen', 'bar') then true
  when b.code in ('radiant', 'cikal') and t.activity = 'bar' then true
  else false
end
from shared.branches b
where b.id = t.branch_id
  and b.org_id = t.org_id
  and t.branch_id is not null
  and t.activity is not null;

alter table shared.teams
  add constraint teams_produces_pair_check
    check ((branch_id is null and activity is null and produces is null)
        or (branch_id is not null and activity is not null and produces is not null));

create or replace function shared._set_team_produces_default()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.branch_id is not null and new.activity is not null and new.produces is null then
    new.produces := false;
  end if;
  return new;
end;
$$;
create trigger teams_produces_default before insert on shared.teams
for each row execute function shared._set_team_produces_default();
comment on column shared.teams.produces is
  'Database-owned permission-to-produce fact for a stream Team. NULL for a non-stream Team; FALSE means receiving-only.';

-- Preserve the Cikal-aware seed shape while making every seeded producer explicit.
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
end;
$$;

create or replace function ops.allowed_kitchen_destinations(
  p_org_id uuid, p_origin_branch_id uuid, p_origin_activity text
) returns table(destination_branch_id uuid)
language sql stable security invoker set search_path = '' as $$
  with origin as (
    select t.branch_id, t.activity, t.produces from shared.teams t
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
    and ((o.activity = 'kitchen' and b.id in (select branch_id from stream_branches) and b.id <> o.branch_id)
      or (o.activity = 'bar' and ((b.id = o.branch_id and b.id in (select branch_id from kitchen_branches))
        or (b.id <> o.branch_id and b.id in (select branch_id from bar_branches)))))
  order by b.name;
$$;
grant execute on function ops.allowed_kitchen_destinations(uuid, uuid, text) to authenticated;

-- A second focused trigger avoids re-authoring the current kitchen guards. It runs only when a
-- movement is first written or moved, so deciding a previously valid held row is not retroactively blocked.
create or replace function ops._guard_cafe_books()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_produces boolean;
begin
  if tg_op = 'INSERT' or (old.branch_id, old.activity, old.action, old.destination_branch_id)
       is distinct from (new.branch_id, new.activity, new.action, new.destination_branch_id) then
    select t.produces into v_produces from shared.teams t
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
create trigger kitchen_logs_books_guard before insert or update of branch_id, activity, action, destination_branch_id
on ops.kitchen_logs for each row execute function ops._guard_cafe_books();
create trigger kitchen_plans_books_guard before insert or update of branch_id, activity, action, destination_branch_id
on ops.kitchen_plans for each row execute function ops._guard_cafe_books();

comment on function ops._guard_cafe_books() is
  'On an inserted or re-pointed Café movement, requires the actual row stream Team to produce and transfer destination to be in ops.allowed_kitchen_destinations (42501). SECURITY INVOKER.';
