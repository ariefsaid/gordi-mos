-- OD-CAFE-MVP-7: GHQ sends externally only to Cikal; remove the GHQ↔RRS kitchen pair.
-- Reversal: restore ops.allowed_kitchen_destinations from 20260914000002_ops_cafe_books.sql.

create or replace function ops.allowed_kitchen_destinations(
  p_org_id uuid, p_origin_branch_id uuid, p_origin_activity text
) returns table(destination_branch_id uuid)
language sql stable security invoker set search_path = '' as $$
  with origin as (
    select t.branch_id, t.activity, t.produces, b.code as branch_code
    from shared.teams t
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
        and b.id in (select branch_id from stream_branches)
        and b.id <> o.branch_id
        and (o.branch_code <> 'gordi_hq' or b.code = 'cikal')
        and not (o.branch_code = 'rumah_rames' and b.code = 'gordi_hq'))
      or (o.activity = 'bar' and ((b.id = o.branch_id and b.id in (select branch_id from kitchen_branches))
        or (b.id <> o.branch_id and b.id in (select branch_id from bar_branches)
          and (o.branch_code <> 'gordi_hq' or b.code = 'cikal')))))
  order by b.name;
$$;

grant execute on function ops.allowed_kitchen_destinations(uuid, uuid, text) to authenticated;
