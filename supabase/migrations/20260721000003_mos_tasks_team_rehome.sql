-- V3 Issue 8 (Tasks 2–3) — re-home mos.tasks from business-unit ownership to a real executing Team.
-- docs/plans/2026-07-20-v3-cafe-canonical-records.md §"Deterministic backfill". This is the REVERSIBLE
-- nullable-repair stage: it adds a NULLABLE mos.tasks.team_id, an audit table for rows that cannot be
-- resolved deterministically, a same-org + BU-equality guard for supplied Teams, and the deterministic
-- maintenance function mos._rehome_task_teams(). The final NOT NULL enforcement is a SEPARATE, held
-- migration (20260721000004_mos_tasks_team_rehome_enforce.sql.HOLD) that must not apply until the owner
-- resolves every ambiguous row.
--
-- The classifier rules and every UNRESOLVED reason category here MIRROR EXACTLY the DB-free reference
-- implementation in mos-app/src/lib/team-context/task-team-rehome.ts. No first-row / primary-flag /
-- Team-name / membership / BU-as-Team fallback is legal: an unresolvable legacy Task stays honestly
-- unresolved with a reason category for explicit human resolution.
--
-- Legacy columns (business_unit_id, responsible_person_id, accountable_person_id) are preserved; no
-- site_id is added (Site derives from the Team). Reversibility (pre-production): `supabase db reset`;
-- manual DOWN at foot.

-- 1. Nullable team_id + FK + indexes (the active-Task access pattern the collection reads by).
alter table mos.tasks
  add column team_id uuid references shared.teams(id);
create index tasks_team_idx        on mos.tasks (team_id);
create index tasks_org_team_idx    on mos.tasks (org_id, team_id);
create index tasks_active_team_idx on mos.tasks (org_id, team_id) where archived_at is null;
comment on column mos.tasks.team_id is
  'V3 Issue 8: the executing Team. NULLABLE during the reversible re-home window; enforced NOT NULL only after every mos.task_team_rehome_ambiguities row is owner-resolved. BU/Site derive from this Team.';

-- 2. Migration-only audit table: the unresolved re-home report. This is NOT a record type — RLS is
--    enabled + forced and NO grant is issued to public/anon/authenticated, so no application role can
--    read it; only the migration/service_role and the owner-resolution path touch it. Rows are kept as
--    an audit trail (resolved_* columns record an eventual explicit mapping), never deleted on resolve.
create table mos.task_team_rehome_ambiguities (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references mos.tasks(id) on delete cascade,
  org_id             uuid not null references shared.orgs(id) on delete cascade,
  business_unit_id   uuid not null references shared.business_units(id),
  process_run_id     uuid references mos.process_runs(id),
  reason             text not null check (reason in (
                       'missing-run','cross-org-run','missing-run-team',
                       'run-team-bu-mismatch','no-bu-candidate','multiple-bu-candidates')),
  candidate_team_ids uuid[] not null default '{}',
  detected_at        timestamptz not null default now(),
  resolved_team_id   uuid references shared.teams(id),
  resolved_at        timestamptz,
  resolved_by        uuid references shared.people(id),
  unique (task_id)
);
comment on table mos.task_team_rehome_ambiguities is
  'V3 Issue 8 migration audit trail: legacy Tasks the deterministic re-home could not resolve, with reason category + candidate Teams for explicit owner resolution. RLS-forced, no application grant — migration/owner-resolution path only.';
create index task_team_rehome_ambiguities_org_idx on mos.task_team_rehome_ambiguities (org_id);
create index task_team_rehome_ambiguities_unresolved_idx
  on mos.task_team_rehome_ambiguities (org_id) where resolved_at is null;

alter table mos.task_team_rehome_ambiguities enable row level security;
alter table mos.task_team_rehome_ambiguities force  row level security;
-- Deliberately NO grant and NO policy for public/anon/authenticated: the audit report is invisible to
-- every application role (a SELECT under `authenticated` fails with 42501 permission-denied).

-- 3. Extend the task reference guard: when team_id is supplied it must be same-org and its BU must
--    equal the Task's business_unit_id (the compatibility mirror). This is additive — a NULL team_id
--    (the whole repair window) skips the check, so existing writes are unaffected. The rest of the
--    guard body (created_by/org_id immutability + same-org scalar/array refs) is reproduced verbatim
--    from 20260711000001_mos_tasks_tenancy_guard.sql.
create or replace function mos._guard_task_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org       uuid;
  v_resp_org     uuid;
  v_acc_org      uuid;
  v_creator_org  uuid;
  v_team_org     uuid;
  v_team_bu      uuid;
begin
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable on a task' using errcode = '42501';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a task' using errcode = '42501';
    end if;
  end if;

  select bu.org_id into v_bu_org
    from shared.business_units bu
    where bu.id = new.business_unit_id;
  if v_bu_org is distinct from new.org_id then
    raise exception 'business_unit_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  select p.org_id into v_resp_org
    from shared.people p
    where p.id = new.responsible_person_id;
  if v_resp_org is distinct from new.org_id then
    raise exception 'responsible_person_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  select p.org_id into v_acc_org
    from shared.people p
    where p.id = new.accountable_person_id;
  if v_acc_org is distinct from new.org_id then
    raise exception 'accountable_person_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  select p.org_id into v_creator_org
    from shared.people p
    where p.id = new.created_by;
  if v_creator_org is distinct from new.org_id then
    raise exception 'created_by must belong to the same org as the task'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(new.consulted_person_ids) pid
    where not exists (
      select 1 from shared.people p where p.id = pid and p.org_id = new.org_id
    )
  ) then
    raise exception 'every consulted_person_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(new.informed_person_ids) pid
    where not exists (
      select 1 from shared.people p where p.id = pid and p.org_id = new.org_id
    )
  ) then
    raise exception 'every informed_person_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  -- V3 Issue 8 (additive): a supplied Team must be same-org and its BU must equal the task BU.
  if new.team_id is not null then
    select tm.org_id, tm.business_unit_id into v_team_org, v_team_bu
      from shared.teams tm where tm.id = new.team_id;
    if v_team_org is distinct from new.org_id then
      raise exception 'team_id must belong to the same org as the task'
        using errcode = '23514';
    end if;
    if v_team_bu is distinct from new.business_unit_id then
      raise exception 'business_unit_id must equal the team''s business_unit_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
comment on function mos._guard_task_refs() is
  'Guard: created_by/org_id immutable on UPDATE (42501); business_unit_id, responsible/accountable, created_by, consulted/informed arrays same-org on INSERT/UPDATE (23514); and (V3 Issue 8) a supplied team_id must be same-org and BU-equal to the task (23514). SECURITY INVOKER — refs are org-readable.';

-- 4. Deterministic re-home maintenance function. SECURITY DEFINER so it can read/write across the
--    directory under RLS; revoked from every application role. Applies EXACTLY the rules in
--    mos-app/src/lib/team-context/task-team-rehome.ts, fills team_id on deterministic rows, and upserts
--    the unresolved report. Returns per-method counts. Note: the DB's own FKs + the cascade guard make
--    the `missing-run` / `missing-run-team` / `cross-org-run` anomalies structurally unreachable for
--    live rows, but the branches are retained so the function is a faithful mirror of the classifier.
create or replace function mos._rehome_task_teams()
returns table (resolved_via_run int, resolved_via_bu int, unresolved int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t            record;
  v_run        record;
  v_team       record;
  v_candidates uuid[];
  v_team_id    uuid;
  v_reason     text;
  v_cands      uuid[];
  c_run int := 0;
  c_bu  int := 0;
  c_un  int := 0;
begin
  for t in
    select id, org_id, business_unit_id, process_run_id
      from mos.tasks
     where team_id is null
  loop
    v_team_id := null;
    v_reason  := null;
    v_cands   := '{}';

    if t.process_run_id is not null then
      -- Rule 1: occurrence Task -> its run's owning Team, same-org and BU-equal.
      select pr.org_id, pr.owning_team_id
        into v_run
        from mos.process_runs pr
       where pr.id = t.process_run_id;
      if not found then
        v_reason := 'missing-run';
      elsif v_run.org_id is distinct from t.org_id then
        v_reason := 'cross-org-run';
      else
        select tm.org_id, tm.business_unit_id
          into v_team
          from shared.teams tm
         where tm.id = v_run.owning_team_id;
        if not found then
          v_reason := 'missing-run-team';
        elsif v_team.org_id is distinct from t.org_id then
          v_reason := 'cross-org-run';
        elsif v_team.business_unit_id is distinct from t.business_unit_id then
          v_reason := 'run-team-bu-mismatch';
          v_cands  := array[v_run.owning_team_id];
        else
          v_team_id := v_run.owning_team_id;
        end if;
      end if;
    else
      -- Rule 2: ad-hoc Task -> the sole active same-org Team in its BU, only when unique.
      select array_agg(tm.id order by tm.id)
        into v_candidates
        from shared.teams tm
       where tm.org_id = t.org_id
         and tm.business_unit_id = t.business_unit_id
         and tm.archived_at is null;
      v_candidates := coalesce(v_candidates, '{}');
      if array_length(v_candidates, 1) is null then
        v_reason := 'no-bu-candidate';
      elsif array_length(v_candidates, 1) > 1 then
        v_reason := 'multiple-bu-candidates';
        v_cands  := v_candidates;
      else
        v_team_id := v_candidates[1];
      end if;
    end if;

    if v_team_id is not null then
      update mos.tasks set team_id = v_team_id where id = t.id;
      if t.process_run_id is not null then
        c_run := c_run + 1;
      else
        c_bu := c_bu + 1;
      end if;
    else
      insert into mos.task_team_rehome_ambiguities
        (task_id, org_id, business_unit_id, process_run_id, reason, candidate_team_ids)
      values (t.id, t.org_id, t.business_unit_id, t.process_run_id, v_reason, v_cands)
      on conflict (task_id) do update
        set reason             = excluded.reason,
            candidate_team_ids = excluded.candidate_team_ids,
            business_unit_id   = excluded.business_unit_id,
            process_run_id     = excluded.process_run_id,
            detected_at        = now();
      c_un := c_un + 1;
    end if;
  end loop;

  return query select c_run, c_bu, c_un;
end;
$$;
revoke execute on function mos._rehome_task_teams() from public, anon, authenticated;
comment on function mos._rehome_task_teams() is
  'V3 Issue 8 deterministic BU->Team re-home (mirror of task-team-rehome.ts). Fills mos.tasks.team_id on deterministic rows; upserts unresolved rows into mos.task_team_rehome_ambiguities. SECURITY DEFINER, revoked from application roles. Callable by the migration/owner-resolution path only.';

-- 5. Run the re-home once. Unresolved rows stay visible in the audit table; NO NOT NULL is set here.
do $$
begin
  perform mos._rehome_task_teams();
end $$;

-- ── Manual rollback (pre-production) ────────────────────────────────────────────
-- drop function if exists mos._rehome_task_teams();
-- (restore mos._guard_task_refs to its 20260711000001 body — drop the team_id block)
-- drop table if exists mos.task_team_rehome_ambiguities cascade;
-- drop index if exists mos.tasks_active_team_idx;
-- drop index if exists mos.tasks_org_team_idx;
-- drop index if exists mos.tasks_team_idx;
-- alter table mos.tasks drop column if exists team_id;
