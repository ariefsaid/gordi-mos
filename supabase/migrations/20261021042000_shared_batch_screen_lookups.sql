-- Batch screen-level Process authority and Café Opening team resolution without changing either
-- scalar authorization contract or the current-org visibility boundary.

-- DOWN (manual, before production):
--   drop function shared.cafe_opening_teams(uuid[], uuid[]);
--   drop function mos.process_occurrence_authority(uuid[], uuid[]);

create or replace function mos.process_occurrence_authority(p_team_ids uuid[], p_run_ids uuid[])
returns table(authority_kind text, target_id uuid, allowed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with team_targets as (
    select distinct requested.target_id
      from unnest(coalesce(p_team_ids, array[]::uuid[])) as requested(target_id)
     where requested.target_id is not null
  ), run_targets as (
    select distinct requested.target_id
      from unnest(coalesce(p_run_ids, array[]::uuid[])) as requested(target_id)
     where requested.target_id is not null
  )
  select 'start'::text, teams.target_id, mos.can_start_process_for_team(teams.target_id)
    from team_targets teams
  union all
  select 'close'::text, runs.target_id, mos.can_close_process_run_id(runs.target_id)
    from run_targets runs
$$;
comment on function mos.process_occurrence_authority(uuid[], uuid[]) is
  'Batched Process occurrence affordances; delegates every result to the existing scalar authority predicates.';
revoke execute on function mos.process_occurrence_authority(uuid[], uuid[]) from public, anon, service_role;
grant execute on function mos.process_occurrence_authority(uuid[], uuid[]) to authenticated;

create or replace function shared.cafe_opening_teams(p_source_team_ids uuid[], p_branch_ids uuid[])
returns table(source_team_id uuid, branch_id uuid, opening_team_id uuid, opening_team_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with source_teams as (
    select t.id as source_team_id, t.branch_id
      from shared.teams t
     where t.org_id = shared.current_org_id()
       and t.id = any(coalesce(p_source_team_ids, array[]::uuid[]))
       and t.branch_id is not null
  ), requested_branches as (
    select s.source_team_id, s.branch_id
      from source_teams s
    union all
    select null::uuid, requested.branch_id
      from unnest(coalesce(p_branch_ids, array[]::uuid[])) as requested(branch_id)
     where requested.branch_id is not null
  ), canonical_teams as (
    select distinct on (t.branch_id) t.branch_id, t.id, t.name
      from shared.teams t
     where t.org_id = shared.current_org_id()
       and t.archived_at is null
       and t.activity in ('kitchen', 'bar')
       and t.branch_id in (select distinct rb.branch_id from requested_branches rb)
     order by t.branch_id, case t.activity when 'kitchen' then 0 else 1 end, t.id
  )
  select rb.source_team_id, rb.branch_id, canonical.id, canonical.name
    from requested_branches rb
    join canonical_teams canonical on canonical.branch_id = rb.branch_id
$$;
comment on function shared.cafe_opening_teams(uuid[], uuid[]) is
  'Batched org-scoped equivalent of cafe_opening_team for source Teams and branch choices.';
revoke execute on function shared.cafe_opening_teams(uuid[], uuid[]) from public, anon, service_role;
grant execute on function shared.cafe_opening_teams(uuid[], uuid[]) to authenticated;
