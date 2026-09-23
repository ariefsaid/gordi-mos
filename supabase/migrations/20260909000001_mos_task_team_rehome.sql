-- Task Team ownership ratification (OD-WAY-94 #9, V3 AC-801..803).
--
-- The squashed baseline already carries nullable mos.tasks.team_id and its same-org/BU guard.
-- This migration supplies the missing, auditable rehome step without guessing an owner. It resolves
-- only process-run-backed rows with direct ownership evidence and records every result. It
-- deliberately does NOT infer ad-hoc ownership from today's BU directory, even when one candidate
-- exists, and does NOT make team_id NOT NULL: unresolved legacy rows require an owner decision
-- before that enforcement is safe.
--
-- DOWN (safe and reversible): while the ledger still exists, first run
--   select * from mos._rollback_task_team_rehome('<batch_id>');
-- and review its restored/skipped counts. It restores only untouched `via-run` rows whose current
-- Team still equals the migration's assigned Team; a later owner edit is skipped and preserved.
-- The migration's generated batch id is recoverable before DOWN with:
--   select distinct batch_id from mos.task_team_rehome_ledger order by batch_id;
-- Only after that review may the operator drop mos._rollback_task_team_rehome(uuid),
-- mos._rehome_task_teams(uuid), and mos.task_team_rehome_ledger. Do not drop the ledger first.
-- Do not drop mos.tasks.team_id: that column belongs to the squashed baseline.

create table mos.task_team_rehome_ledger (
  batch_id             uuid not null,
  task_id              uuid not null references mos.tasks(id),
  org_id               uuid not null references shared.orgs(id),
  business_unit_id     uuid not null references shared.business_units(id),
  process_run_id       uuid references mos.process_runs(id),
  previous_team_id     uuid references shared.teams(id),
  assigned_team_id     uuid references shared.teams(id),
  resolution_method    text check (resolution_method in ('via-run', 'owner')),
  unresolved_reason    text check (unresolved_reason in (
    'missing-run', 'cross-org-run', 'missing-run-team', 'run-team-bu-mismatch',
    'no-bu-candidate', 'multiple-bu-candidates', 'unique-bu-candidate-needs-ratification'
  )),
  candidate_team_ids   uuid[] not null default '{}',
  state                text not null check (state in ('auto_resolved', 'unresolved', 'owner_resolved')),
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  primary key (batch_id, task_id),
  constraint task_team_rehome_resolution_ck check (
    (state = 'unresolved' and assigned_team_id is null and unresolved_reason is not null)
    or (state in ('auto_resolved', 'owner_resolved') and assigned_team_id is not null and unresolved_reason is null)
  )
);

comment on table mos.task_team_rehome_ledger is
  '[applied-path-content: history-dependent] Auditable Task->Team rehome results. Auto-resolved rows use only process-run ownership with a matching BU; ad-hoc rows require explicit owner ratification before team_id can become NOT NULL.';
comment on column mos.task_team_rehome_ledger.candidate_team_ids is
  'All valid same-org active Team candidates for an ambiguous ad-hoc row, or the run Team for a BU mismatch; never a first/primary/name fallback.';

create index task_team_rehome_ledger_org_idx
  on mos.task_team_rehome_ledger (org_id, state);
create index task_team_rehome_ledger_task_idx
  on mos.task_team_rehome_ledger (task_id);

alter table mos.task_team_rehome_ledger enable row level security;
alter table mos.task_team_rehome_ledger force row level security;
-- No authenticated grant/policy: this maintenance ledger is not a tenant-wide UI read model.
-- Operators inspect it through the database/service role, avoiding a new cross-person data surface.

create or replace function mos._rehome_task_teams(p_batch_id uuid)
returns table(auto_resolved integer, unresolved integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task          record;
  v_run_org       uuid;
  v_run_team      uuid;
  v_team_org      uuid;
  v_team_bu       uuid;
  v_assigned      uuid;
  v_method        text;
  v_reason        text;
  v_candidates    uuid[];
  v_auto_count    integer := 0;
  v_unresolved_count integer := 0;
begin
  if p_batch_id is null then
    raise exception 'rehome batch_id is required' using errcode = '22004';
  end if;

  for v_task in
    select t.id, t.org_id, t.business_unit_id, t.process_run_id, t.team_id
      from mos.tasks t
     where t.team_id is null
     order by t.org_id, t.id
  loop
    v_assigned := null;
    v_method := null;
    v_reason := null;
    v_candidates := '{}'::uuid[];

    -- Generated occurrence Tasks must follow their process run. A broken run never falls through
    -- to BU inference: it is a distinct provenance problem for owner resolution.
    if v_task.process_run_id is not null then
      select pr.org_id, pr.owning_team_id
        into v_run_org, v_run_team
        from mos.process_runs pr
       where pr.id = v_task.process_run_id;
      if not found then
        v_reason := 'missing-run';
      elsif v_run_org is distinct from v_task.org_id then
        v_reason := 'cross-org-run';
      else
        select tm.org_id, tm.business_unit_id
          into v_team_org, v_team_bu
          from shared.teams tm
         where tm.id = v_run_team;
        if not found then
          v_reason := 'missing-run-team';
        elsif v_team_org is distinct from v_task.org_id then
          v_reason := 'cross-org-run';
        elsif v_team_bu is distinct from v_task.business_unit_id then
          v_reason := 'run-team-bu-mismatch';
          v_candidates := array[v_run_team];
        else
          v_assigned := v_run_team;
          v_method := 'via-run';
        end if;
      end if;
    else
      -- An ad-hoc legacy row has no historical ownership evidence in the current Task row. The
      -- candidate array is sorted and complete for the ratifier; no primary/name/first-row/unique-
      -- BU inference is allowed.
      select coalesce(array_agg(tm.id order by tm.id), '{}'::uuid[])
        into v_candidates
        from shared.teams tm
       where tm.org_id = v_task.org_id
         and tm.business_unit_id = v_task.business_unit_id
         and tm.archived_at is null;
      if cardinality(v_candidates) = 0 then
        v_reason := 'no-bu-candidate';
      elsif cardinality(v_candidates) > 1 then
        v_reason := 'multiple-bu-candidates';
      else
        v_reason := 'unique-bu-candidate-needs-ratification';
      end if;
    end if;

    if v_assigned is not null then
      update mos.tasks
         set team_id = v_assigned
       where id = v_task.id
         and team_id is null;
      insert into mos.task_team_rehome_ledger (
        batch_id, task_id, org_id, business_unit_id, process_run_id,
        previous_team_id, assigned_team_id, resolution_method,
        candidate_team_ids, state, resolved_at
      ) values (
        p_batch_id, v_task.id, v_task.org_id, v_task.business_unit_id, v_task.process_run_id,
        v_task.team_id, v_assigned, v_method, v_candidates, 'auto_resolved', now()
      ) on conflict (batch_id, task_id) do nothing;
      v_auto_count := v_auto_count + 1;
    else
      insert into mos.task_team_rehome_ledger (
        batch_id, task_id, org_id, business_unit_id, process_run_id,
        previous_team_id, unresolved_reason, candidate_team_ids, state
      ) values (
        p_batch_id, v_task.id, v_task.org_id, v_task.business_unit_id, v_task.process_run_id,
        v_task.team_id, v_reason, v_candidates, 'unresolved'
      ) on conflict (batch_id, task_id) do nothing;
      v_unresolved_count := v_unresolved_count + 1;
    end if;
  end loop;

  auto_resolved := v_auto_count;
  unresolved := v_unresolved_count;
  return next;
end;
$$;

comment on function mos._rehome_task_teams(uuid) is
  'Maintenance-only, fail-closed Task Team rehome. Only run-backed Tasks resolve through a valid same-org process-run owning Team with matching BU. Ad-hoc Tasks remain unresolved, with current active same-org BU candidates recorded for owner ratification.';
revoke all on function mos._rehome_task_teams(uuid) from public, anon, authenticated;

create or replace function mos._rollback_task_team_rehome(p_batch_id uuid)
returns table(restored integer, skipped integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row       record;
  v_restored  integer := 0;
  v_skipped   integer := 0;
begin
  if p_batch_id is null then
    raise exception 'rollback batch_id is required' using errcode = '22004';
  end if;

  -- Roll back only automatic run-backed assignments. The current-value predicate is the safety
  -- barrier: if an owner or another maintenance pass changed the Team after this migration, the
  -- row is skipped rather than clobbered. The ledger remains available for audit until the caller
  -- explicitly drops it as the final DOWN step.
  for v_row in
    select l.task_id, l.previous_team_id, l.assigned_team_id
      from mos.task_team_rehome_ledger l
     where l.batch_id = p_batch_id
       and l.state = 'auto_resolved'
       and l.resolution_method = 'via-run'
     order by l.task_id
  loop
    update mos.tasks
       set team_id = v_row.previous_team_id
     where id = v_row.task_id
       and team_id = v_row.assigned_team_id;
    if found then
      v_restored := v_restored + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  restored := v_restored;
  skipped := v_skipped;
  return next;
end;
$$;

comment on function mos._rollback_task_team_rehome(uuid) is
  'Maintenance-only safe DOWN helper. Restores only untouched via-run assignments from one batch; skips rows whose current Team no longer equals the recorded assignment, preserving later owner edits. Keep the ledger until the caller reviews the result.';
revoke all on function mos._rollback_task_team_rehome(uuid) from public, anon, authenticated;

-- Execute once for rows present at migration time. The result is intentionally returned to the
-- migration runner as the pre-enforcement evidence: auto_resolved and unresolved counts must be
-- reviewed before any future NOT NULL migration is authored.
select * from mos._rehome_task_teams(gen_random_uuid());
