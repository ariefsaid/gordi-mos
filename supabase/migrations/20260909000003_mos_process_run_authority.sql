-- Process-run completion/cancellation authority and cancellation audit.
--
-- Existing start paths remain unchanged. In particular, Café Opening keeps its historical
-- branch-specific start gate and canonical Team; other processes keep process.start plus active
-- membership of the owning Team (or admin). This migration narrows completion from those start
-- paths to the run's starter, ops_lead, or admin. The Team-lead arm is deliberately not inferred
-- here: the current schema has no Team-lead relation, and the authoritative work-systems spec
-- leaves it dependent on `mos.is_team_lead` (#767). A follow-up migration must extend
-- mos.can_close_process_run once the owner chooses the supported Team-lead identity.
--
-- DOWN (manual, before production):
--   recreate mos.complete_process_run(uuid) from 20260805000007_mos_functions.sql;
--   drop function if exists mos.cancel_process_run(uuid, text);
--   drop function if exists mos.can_close_process_run(mos.process_runs);
--   alter table mos.process_runs drop constraint if exists process_runs_cancelled_audit_check;
--   alter table mos.process_runs drop column if exists cancelled_at;
--   alter table mos.process_runs drop column if exists cancelled_by;
--   alter table mos.process_runs drop column if exists cancel_reason;

alter table mos.process_runs
  add column cancelled_at  timestamptz,
  add column cancelled_by  uuid references shared.people(id),
  add column cancel_reason text;

alter table mos.process_runs
  add constraint process_runs_cancelled_audit_check
  check (
    status <> 'cancelled'
    or (
      cancelled_at is not null
      and cancelled_by is not null
      and btrim(coalesce(cancel_reason, '')) <> ''
    )
  ) not valid;

-- NOT VALID is deliberate. Runs cancelled before this migration have no trustworthy actor, time,
-- or reason to backfill; validating the historical rows here would either abort deployment or
-- fabricate audit history. PostgreSQL still applies this CHECK to every new row and every later
-- update, so new cancellations cannot omit their audit fields.

comment on function mos.can_start_process_for_team(uuid) is
  'Team-authorization gate for the existing Team-scoped spawn/resolve paths (ADR-0051 D8). '
  'Café Opening spawn uses its branch gate and canonical Team; completion/cancellation use '
  'mos.can_close_process_run instead.';

comment on column mos.process_runs.cancelled_at is
  'Server-stamped cancellation time; set only by mos.cancel_process_run.';
comment on column mos.process_runs.cancelled_by is
  'Server-stamped cancelling person; set only by mos.cancel_process_run.';
comment on column mos.process_runs.cancel_reason is
  'Required audit reason for cancellation; set only by mos.cancel_process_run.';

-- The run is passed by value from the row locked inside each SECURITY DEFINER RPC. Keeping this
-- predicate separate makes the actor rule one auditable seam and leaves no Team/BU inference path.
create or replace function mos.can_close_process_run(p_run mos.process_runs)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(shared.has_access_role('admin'), false)
      or coalesce(shared.has_access_role('ops_lead'), false)
      or coalesce(p_run.started_by = shared.current_person_id(), false)
$$;
comment on function mos.can_close_process_run(mos.process_runs) is
  'Completion/cancellation actor gate: admin, ops_lead, or the run starter. The Team-lead arm is '
  'intentionally pending the owner-approved mos.is_team_lead identity (#767); no reporting-line '
  'manager inference is permitted here.';
revoke execute on function mos.can_close_process_run(mos.process_runs) from public, anon, authenticated;

create or replace function mos.complete_process_run(p_run_id uuid)
returns mos.process_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_run mos.process_runs;
begin
  -- Scope the lookup itself to the caller's org. A foreign id and a missing id therefore produce
  -- the same result, closing the existence oracle before any actor/status check runs.
  select * into v_run from mos.process_runs where id = p_run_id and org_id = v_org for update;
  if v_run.id is null then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  if mos.can_close_process_run(v_run) is not true then
    raise exception 'not authorized to complete this run' using errcode = '42501';
  end if;
  if v_run.status <> 'open' then
    raise exception 'run is already %', v_run.status using errcode = 'P0003';
  end if;

  update mos.process_runs
     set status = 'completed', completed_at = now(), completed_by = shared.current_person_id(), updated_at = now()
   where id = p_run_id;
  select * into v_run from mos.process_runs where id = p_run_id;
  return v_run;
end;
$$;
comment on function mos.complete_process_run(uuid) is
  'A human marks an open occurrence complete. SECURITY DEFINER; org-scoped lookup, row-locked, and '
  'admitted only for the starter, ops_lead, or admin until the Team-lead predicate is ratified.';
revoke execute on function mos.complete_process_run(uuid) from public, anon, authenticated;
grant  execute on function mos.complete_process_run(uuid) to authenticated;

create or replace function mos.cancel_process_run(p_run_id uuid, p_reason text)
returns mos.process_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := shared.current_org_id();
  v_run    mos.process_runs;
  v_reason text := nullif(btrim(p_reason), '');
begin
  -- Match complete_process_run: foreign and missing ids are intentionally indistinguishable.
  select * into v_run from mos.process_runs where id = p_run_id and org_id = v_org for update;
  if v_run.id is null then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  if mos.can_close_process_run(v_run) is not true then
    raise exception 'not authorized to cancel this run' using errcode = '42501';
  end if;
  if v_run.status <> 'open' then
    raise exception 'run is already %', v_run.status using errcode = 'P0003';
  end if;
  if v_reason is null then
    raise exception 'cancellation reason is required' using errcode = 'P0003';
  end if;

  update mos.process_runs
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = shared.current_person_id(),
         cancel_reason = v_reason,
         updated_at = now()
   where id = p_run_id;
  select * into v_run from mos.process_runs where id = p_run_id;
  return v_run;
end;
$$;
comment on function mos.cancel_process_run(uuid, text) is
  'A human cancels an open occurrence with a required audit reason. SECURITY DEFINER; org-scoped lookup, '
  'row-locked, actor-gated, and does not mutate generated Tasks.';
revoke execute on function mos.cancel_process_run(uuid, text) from public, anon, authenticated;
grant  execute on function mos.cancel_process_run(uuid, text) to authenticated;
