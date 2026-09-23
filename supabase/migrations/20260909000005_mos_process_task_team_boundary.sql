-- Process-generated Task Team boundary.
--
-- Every Task linked to a process run inherits process_runs.owning_team_id and must agree with the
-- process run's org, work line, Team, and business unit. Ad-hoc Tasks remain nullable and are not
-- assigned from a BU or directory fallback.
--
-- DOWN (reversible, before production):
--   drop trigger if exists tasks_process_run_team_guard on mos.tasks;
--   revoke all on function mos._guard_process_task_team() from public, anon, authenticated;
--   drop function if exists mos._guard_process_task_team();

create or replace function mos._guard_process_task_team()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_org       uuid;
  v_run_work_line uuid;
  v_run_team      uuid;
  v_team_org      uuid;
  v_team_bu       uuid;
begin
  -- A legacy/ad-hoc Task has no occurrence owner to derive. Its existing same-org Team/BU checks
  -- remain in mos._guard_tasks; this seam deliberately does not invent a Team for it.
  if new.process_run_id is null then
    return new;
  end if;

  select r.org_id, r.work_line_id, r.owning_team_id
    into v_run_org, v_run_work_line, v_run_team
    from mos.process_runs r
   where r.id = new.process_run_id;
  if not found then
    raise exception 'process_run_id must reference an existing process run' using errcode = '23514';
  end if;
  if v_run_team is null then
    raise exception 'process_run owning Team is required' using errcode = '23514';
  end if;
  if new.org_id is distinct from v_run_org then
    raise exception 'process_run_id must belong to the task org' using errcode = '23514';
  end if;
  if new.work_line_id is distinct from v_run_work_line then
    raise exception 'work_line_id must equal process_run.work_line_id' using errcode = '23514';
  end if;

  -- Only the authoritative process-run relationship may fill a missing Team; a supplied different
  -- Team is never repaired.
  if new.team_id is null then
    new.team_id := v_run_team;
  elsif new.team_id is distinct from v_run_team then
    raise exception 'team_id must equal process_run.owning_team_id' using errcode = '23514';
  end if;

  select t.org_id, t.business_unit_id
    into v_team_org, v_team_bu
    from shared.teams t
   where t.id = v_run_team;
  if not found or v_team_org is distinct from v_run_org then
    raise exception 'process_run owning Team must belong to the same org' using errcode = '23514';
  end if;
  if v_team_bu is distinct from new.business_unit_id then
    raise exception 'business_unit_id must equal process_run owning Team business_unit_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function mos._guard_process_task_team() is
  'Process-generated Task boundary: derive team_id only from process_runs.owning_team_id and reject process-run/work-line/Team/org/BU mismatches. Ad-hoc Tasks remain unresolved; SECURITY INVOKER.';
revoke all on function mos._guard_process_task_team() from public, anon, authenticated;

create trigger tasks_process_run_team_guard
  before insert or update on mos.tasks
  for each row execute function mos._guard_process_task_team();
