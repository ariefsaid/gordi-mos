-- Step 6 (ADR-0051 D7/D8). SECURITY INVOKER helpers (no DEFINER → CI definer-revoke lint clean).

-- Current holders of a job function: person holds the Role in p_org AND (if a Team scope is set) is an
-- active member of that Team. Pinned to explicit p_org → a cross-org Role/Team resolves NO holder.
create or replace function mos._function_holders(p_org uuid, p_role_id uuid, p_team_id uuid)
returns setof uuid language sql stable set search_path = '' as $$
  select distinct pr.person_id
  from shared.person_roles pr
  join shared.roles  r on r.id = pr.role_id
  join shared.people p on p.id = pr.person_id
  where p_role_id is not null
    and pr.org_id = p_org and r.org_id = p_org and p.org_id = p_org
    and p.archived_at is null
    and pr.role_id = p_role_id
    and (
      p_team_id is null
      or exists (
        select 1 from shared.team_memberships m
        where m.person_id = pr.person_id and m.team_id = p_team_id and m.org_id = p_org
          and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date)
      )
    )
$$;
comment on function mos._function_holders(uuid,uuid,uuid) is
  'Current holders of a job function (Role + optional active-Team scope), pinned to p_org (org-walled). ADR-0051 D7.';

-- May the caller start a run for p_team_id? admin, or an active member of that Team.
create or replace function mos.can_start_process_for_team(p_team_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select shared.has_access_role('admin')
     or exists (
       select 1 from shared.team_memberships m
       where m.team_id = p_team_id and m.person_id = shared.current_person_id()
         and m.org_id = shared.current_org_id()
         and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date));
$$;
comment on function mos.can_start_process_for_team(uuid) is 'Team-authorization gate for spawn/resolve/complete (ADR-0051 D8).';

-- DOWN: drop function if exists mos.can_start_process_for_team(uuid); drop function if exists mos._function_holders(uuid,uuid,uuid);
