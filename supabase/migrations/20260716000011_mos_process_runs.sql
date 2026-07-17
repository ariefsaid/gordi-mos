-- Step 6 (ADR-0051 D4/D7/D10): the thin occurrence record + the ambiguity human-choice queue + the
-- generated-Task provenance columns. Runs/pending are RPC-write-only (RLS: no insert/update policy).

create table mos.process_runs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  work_line_id       uuid not null references mos.work_lines(id),
  owning_team_id     uuid not null references shared.teams(id),
  period_key         text not null,
  caption            text not null,
  scheduled_date     date not null,
  status             text not null default 'open' check (status in ('open','completed','cancelled')),
  completed_at       timestamptz,
  completed_by       uuid references shared.people(id),
  definition_version int not null,
  spec_snapshot      jsonb not null,
  started_by         uuid references shared.people(id) default shared.current_person_id(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- idempotency: at most one run per (process, adopting Team, occurrence period) — the at-most-once key.
  unique (org_id, work_line_id, owning_team_id, period_key)
);
create index process_runs_org_idx    on mos.process_runs (org_id);
create index process_runs_wl_idx     on mos.process_runs (work_line_id);
create index process_runs_team_idx   on mos.process_runs (owning_team_id);
create index process_runs_open_idx   on mos.process_runs (org_id) where status = 'open';
create trigger process_runs_set_updated_at before update on mos.process_runs
  for each row execute function shared.set_updated_at();

create table mos.process_run_pending_tasks (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  process_run_id       uuid not null references mos.process_runs(id) on delete cascade,
  task_def_id          uuid not null references mos.process_task_defs(id),
  candidate_person_ids uuid[] not null default '{}',
  reason               text not null check (reason in ('none','multiple')),
  resolved_at          timestamptz,
  resolved_by          uuid references shared.people(id),
  materialized_task_id uuid references mos.tasks(id),
  created_at           timestamptz not null default now()
);
create unique index process_run_pending_one_unresolved
  on mos.process_run_pending_tasks (process_run_id, task_def_id) where resolved_at is null;
create index process_run_pending_open_idx
  on mos.process_run_pending_tasks (process_run_id) where resolved_at is null;

-- D10 — generated-Task provenance (additive, nullable; shipped tasks unaffected).
alter table mos.tasks
  add column if not exists process_run_id              uuid references mos.process_runs(id),
  add column if not exists generated_from_task_def_id  uuid references mos.process_task_defs(id);
create index tasks_process_run_idx on mos.tasks (process_run_id) where process_run_id is not null;

-- Extend the shipped cascade guard so a non-NULL process_run_id must be same-org (FK checks existence only).
create or replace function mos._guard_task_cascade_refs()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.objective_id is not null and not exists (
    select 1 from mos.objectives where id = new.objective_id and org_id = new.org_id) then
    raise exception 'objective_id belongs to a different org' using errcode = '42501';
  end if;
  if new.work_line_id is not null and not exists (
    select 1 from mos.work_lines where id = new.work_line_id and org_id = new.org_id) then
    raise exception 'work_line_id belongs to a different org' using errcode = '42501';
  end if;
  if new.process_run_id is not null and not exists (
    select 1 from mos.process_runs where id = new.process_run_id and org_id = new.org_id) then
    raise exception 'process_run_id belongs to a different org' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- RLS: runs + pending are org-readable, RPC-write-only (no insert/update policy → only DEFINER RPC / service_role).
grant select on mos.process_runs, mos.process_run_pending_tasks to authenticated;
grant select, insert, update on mos.process_runs, mos.process_run_pending_tasks to service_role;
alter table mos.process_runs               enable row level security; alter table mos.process_runs               force row level security;
alter table mos.process_run_pending_tasks  enable row level security; alter table mos.process_run_pending_tasks  force row level security;
create policy process_runs_select_org on mos.process_runs
  for select to authenticated using (org_id = shared.current_org_id());
create policy process_run_pending_select_org on mos.process_run_pending_tasks
  for select to authenticated using (org_id = shared.current_org_id());
-- NO insert/update/delete policy for authenticated → writes flow only through the spawn/resolve/complete RPCs.

-- DOWN (manual):
-- (restore mos._guard_task_cascade_refs to its 20260624000001 body — objective_id + work_line_id only)
-- drop index if exists tasks_process_run_idx;
-- alter table mos.tasks drop column if exists generated_from_task_def_id;
-- alter table mos.tasks drop column if exists process_run_id;
-- drop table if exists mos.process_run_pending_tasks cascade;
-- drop table if exists mos.process_runs cascade;
