-- Composer destinations are the intersection of the database-owned post and read-back gates.

create or replace function mos.teams_author_can_read_back(
  p_author_id uuid default shared.current_person_id()
)
returns table (id uuid, name text, business_unit_id uuid, site_id uuid, is_primary boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select tm.id, tm.name, tm.business_unit_id, tm.site_id,
         exists (
           select 1 from shared.team_memberships m
           where m.team_id = tm.id and m.person_id = shared.current_person_id()
             and m.org_id = shared.current_org_id()
             and m.is_primary
             and m.effective_from <= current_date
             and (m.effective_to is null or m.effective_to >= current_date)
         ) as is_primary
  from shared.teams tm
  where tm.org_id = shared.current_org_id()
    and tm.archived_at is null
    and p_author_id = shared.current_person_id()
    -- The org_id check above is a fail-closed tightening: rules also require tm.org_id = shared.current_org_id().
    and mos.can_post_signal_for_team(tm.id)
    and mos._can_read_signal_rules(null, tm.id, shared.current_person_id())
  order by is_primary desc, tm.name
$$;
comment on function mos.teams_author_can_read_back(uuid) is
  'Returns destination Teams where the current user can post and a Signal would pass mos.can_read_signal. The optional author id must equal the current user. Destination rules also require tm.org_id = shared.current_org_id() (fail-closed). R4 explicit mentions are out of scope because no destination mention exists yet.';
revoke execute on function mos.teams_author_can_read_back(uuid) from public, anon;
grant execute on function mos.teams_author_can_read_back(uuid) to authenticated;
revoke execute on function mos._can_read_signal_rules(uuid, uuid, uuid) from public, anon;
grant execute on function mos._can_read_signal_rules(uuid, uuid, uuid) to authenticated;

-- DOWN: drop function mos.teams_author_can_read_back(uuid);
