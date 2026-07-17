-- Step 6 (ADR-0051 D9): derived per-occurrence roll-up (no stored counts) + the scheduler-free "due" surface.
create or replace view mos.process_run_rollup as
select
  r.id as process_run_id, r.org_id, r.caption, r.scheduled_date, r.status,
  count(t.id) filter (where t.archived_at is null)                              as total,
  count(t.id) filter (where t.archived_at is null and t.status = 'Open')        as open,
  count(t.id) filter (where t.archived_at is null and t.status = 'In Progress') as in_progress,
  count(t.id) filter (where t.archived_at is null and t.status = 'Blocked')     as blocked,
  count(t.id) filter (where t.archived_at is null and t.status = 'Done')        as done,
  count(t.id) filter (where t.archived_at is null and t.status <> 'Done'
                        and t.due_date < (now() at time zone 'Asia/Jakarta')::date) as overdue,
  (select count(*) from mos.process_run_pending_tasks p where p.process_run_id = r.id and p.resolved_at is null) as pending_unresolved,
  round(coalesce(count(t.id) filter (where t.archived_at is null and t.status = 'Done')::numeric
        / nullif(count(t.id) filter (where t.archived_at is null), 0), 0) * 100, 1) as completion_pct
from mos.process_runs r
left join mos.tasks t on t.process_run_id = r.id
group by r.id, r.org_id, r.caption, r.scheduled_date, r.status;
alter view mos.process_run_rollup set (security_invoker = true);
grant select on mos.process_run_rollup to authenticated;

-- v1 "due" surface = daily-cadence processes whose today-WIB occurrence is unspawned for a Team the caller
-- may start. weekly/monthly are started by explicit date via the RPC (RATIFY-2/3). security_invoker.
create or replace function mos.due_process_runs()
returns table (work_line_id uuid, process_name text, owning_team_id uuid, team_name text, period_key text, scheduled_date date)
language sql stable security invoker set search_path = '' as $$
  select wl.id, wl.name, t.id, t.name,
         to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD'),
         (now() at time zone 'Asia/Jakarta')::date
  from mos.work_lines wl
  join mos.process_cadences c on c.work_line_id = wl.id and c.active and c.cadence_kind = 'daily'
  join shared.teams t on t.org_id = wl.org_id and t.archived_at is null
  where wl.org_id = shared.current_org_id() and wl.type = 'process' and wl.archived_at is null
    and mos.can_start_process_for_team(t.id)
    and not exists (
      select 1 from mos.process_runs r
      where r.work_line_id = wl.id and r.owning_team_id = t.id
        and r.period_key = to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD'));
$$;
comment on function mos.due_process_runs() is 'Scheduler-free due surface (FR-612): daily processes with an unspawned today-WIB occurrence for a startable Team.';

-- DOWN: drop function if exists mos.due_process_runs(); drop view if exists mos.process_run_rollup;
