# Plan — Occurrence-as-Tasks (redesign buildout Step 6)

**Spec (contract):** `docs/specs/occurrence-as-tasks.spec.md`. **ADR:** `docs/adr/0051-occurrence-as-tasks-schema.md`.
**Master plan row:** `docs/plans/2026-07-14-redesign-buildout.md` Step 6. **Read-first:**
`docs/experience-contract.md` (Rules 1–12, blocking), `docs/decisions.md` OD-REDESIGN-11/12/14/40/41/58 + OD-41.
**Binding prior art:** ADR-0050 (`shared.teams`/`shared.team_memberships`), `mos.follow_ups` (the single-DEFINER-
RPC idiom), `mos.work_lines` (the Process catalog), the shipped Tasks DB-view (ADR-0007/0008).

> **No-placeholder rule.** Every task has an exact path, real code/SQL, a cited `AC-###` (behavior tasks), and an
> exact verify command. TDD order: the **failing test is written first**, then the implementation makes it pass.
>
> **pgTAP runs in CI, not the sandbox.** The sandbox has **no Docker**, so `supabase test db` cannot run
> locally. Track A migrations verify locally only that they *parse/apply* is not possible either without Docker;
> the authoritative gate is the **`integration.yml` `workflow_dispatch`**:
> `gh workflow run integration.yml --ref <branch>` then `gh run watch` (pgTAP suite + definer-revoke lint +
> live-stack e2e). Track B/C verify with `npm test -- <file>` / `npx playwright test` from `mos-app/`.

## Parallelization map (mirrors `docs/plans/2026-07-16-signals-v1.md`)

- **Track A — Schema + RLS + spawn + pgTAP** (`supabase/`): **A1–A13**. Sequential *within* migrations
  (each builds on the prior — A1 tables → A2 runs/tasks-delta → A3 helpers → A4 spawn RPCs → A5 rollup → A6 seed);
  the pgTAP files (A8–A13) are parallel once A1–A7 land. **This is the hard, opus-tier track.**
- **Track B — DAL + thin UI** (`mos-app/`): **B1–B9**. Depends only on the **type contract** frozen in **B1**
  (`processes.types.ts`), not on a live DB (DAL tests mock supabase; component tests mock the DAL). **A and B run
  fully in parallel.**
- **Track C — Wiring + e2e + review + gates** (`mos-app/` + `docs/`): **C1–C5**. Depends on **A and B merged**.

Recommended split: **Builder 1 = Track A** (opus — RLS + the spawn RPC are the bug-prone surface),
**Builder 2 = Track B** (sonnet), **Director = Track C** + the mandatory security-auditor pass (§ spec 7).

---

## Track A — Schema + RLS + spawn + pgTAP

### A1 — Migration: `work_lines` delta + `process_cadences` + `process_task_defs` + capabilities
**File:** `supabase/migrations/20260716000010_mos_process_definitions.sql` (create).
```sql
-- Step 6 (ADR-0051 D1/D2/D3/D8): the Process-definition layer. Extend the shipped Project/Process
-- catalog mos.work_lines with governance columns; add per-process cadence + generated Task templates.
-- Reversible: manual DOWN at foot; pre-prod `supabase db reset`.

-- D1 — work_lines governance delta (additive, nullable; Projects unaffected).
alter table mos.work_lines
  add column if not exists business_unit_id      uuid references shared.business_units(id),
  add column if not exists accountable_person_id uuid references shared.people(id),
  add column if not exists responsible_person_id uuid references shared.people(id),
  add column if not exists definition_version    int not null default 1;
comment on column mos.work_lines.accountable_person_id is
  'Process A (governance). Drives generated-Task Supervisor inheritance (OD-REDESIGN-14). Nullable until the designer lands.';
comment on column mos.work_lines.definition_version is
  'Bumped on a generation-config edit; snapshotted onto each process_run (ADR-0051 D5).';

-- D2 — per-process cadence (one row per process).
create table mos.process_cadences (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  work_line_id   uuid not null unique references mos.work_lines(id) on delete cascade,
  cadence_kind   text not null check (cadence_kind in ('manual','daily','weekly','monthly')),
  cadence_config jsonb not null default '{}'::jsonb,
  timezone       text not null default 'Asia/Jakarta',
  anchor_date    date,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index process_cadences_org_idx on mos.process_cadences (org_id);
create trigger process_cadences_set_updated_at before update on mos.process_cadences
  for each row execute function shared.set_updated_at();

-- D3 — generated Task templates (the job-function PIC binding lives here).
create table mos.process_task_defs (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  work_line_id          uuid not null references mos.work_lines(id) on delete cascade,
  title                 text not null check (btrim(title) <> ''),
  description           text,
  position              int not null default 0,
  due_offset_days       int not null default 0,
  checklist_items       jsonb not null default '[]'::jsonb,
  pic_person_id         uuid references shared.people(id),
  pic_role_id           uuid references shared.roles(id),
  pic_team_id           uuid references shared.teams(id),
  supervisor_person_id  uuid references shared.people(id),
  supervisor_role_id    uuid references shared.roles(id),
  supervisor_team_id    uuid references shared.teams(id),
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- never an ownerless definition (ADR-0051 D3): some PIC binding is mandatory.
  constraint process_task_defs_pic_binding check (pic_person_id is not null or pic_role_id is not null)
);
create index process_task_defs_wl_idx on mos.process_task_defs (work_line_id) where archived_at is null;
create trigger process_task_defs_set_updated_at before update on mos.process_task_defs
  for each row execute function shared.set_updated_at();

-- D8 — capability registration (fail-closed; seed-only, no self-assign path).
insert into shared.role_capabilities (role, capability, scope) values
  ('ops_lead', 'process.start', 'org'),
  ('admin',    'process.start', 'org'),
  ('admin',    'process.adopt', 'org')
on conflict (role, capability) do nothing;

-- RLS: definition tables are org-readable with admin/ops_lead authoring (mirror mos.work_lines).
grant select, insert, update on mos.process_cadences  to authenticated;
grant select, insert, update on mos.process_task_defs to authenticated;
alter table mos.process_cadences  enable row level security; alter table mos.process_cadences  force row level security;
alter table mos.process_task_defs enable row level security; alter table mos.process_task_defs force row level security;

create policy process_cadences_select_org on mos.process_cadences
  for select to authenticated using (org_id = shared.current_org_id());
create policy process_cadences_write_ops on mos.process_cadences
  for insert to authenticated
  with check (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
create policy process_cadences_update_ops on mos.process_cadences
  for update to authenticated
  using (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')))
  with check (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));

create policy process_task_defs_select_org on mos.process_task_defs
  for select to authenticated using (org_id = shared.current_org_id());
create policy process_task_defs_write_ops on mos.process_task_defs
  for insert to authenticated
  with check (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
create policy process_task_defs_update_ops on mos.process_task_defs
  for update to authenticated
  using (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')))
  with check (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));

-- DOWN (manual, pre-production):
-- drop policy if exists process_task_defs_update_ops on mos.process_task_defs;
-- drop policy if exists process_task_defs_write_ops  on mos.process_task_defs;
-- drop policy if exists process_task_defs_select_org on mos.process_task_defs;
-- drop policy if exists process_cadences_update_ops  on mos.process_cadences;
-- drop policy if exists process_cadences_write_ops   on mos.process_cadences;
-- drop policy if exists process_cadences_select_org  on mos.process_cadences;
-- delete from shared.role_capabilities where capability in ('process.start','process.adopt');
-- drop table if exists mos.process_task_defs cascade;
-- drop table if exists mos.process_cadences  cascade;
-- alter table mos.work_lines drop column if exists definition_version;
-- alter table mos.work_lines drop column if exists responsible_person_id;
-- alter table mos.work_lines drop column if exists accountable_person_id;
-- alter table mos.work_lines drop column if exists business_unit_id;
```
**Verify:** `gh workflow run integration.yml --ref <branch>` boots + applies the migration clean (checked by A13 CI run).

### A2 — Migration: `process_runs` + `process_run_pending_tasks` + `mos.tasks` provenance + guard extend
**File:** `supabase/migrations/20260716000011_mos_process_runs.sql` (create).
```sql
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
```
**Verify:** covered by the A13 CI run.

### A3 — Migration: resolver + team-auth helpers
**File:** `supabase/migrations/20260716000012_mos_process_helpers.sql` (create).
```sql
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
```
**Verify:** covered by the A13 CI run.

### A4 — Migration: `spawn_process_run` + `resolve_pending_task` + `complete_process_run` (the gated write RPCs)
**File:** `supabase/migrations/20260716000013_mos_spawn_process_run.sql` (create). ADR-0051 D6/D7.
```sql
-- Step 6 (ADR-0051 D6/D7): the single gated write points for runs/tasks. SECURITY DEFINER; each RPC
-- cross-org-guards + capability/Team-gates before any write. revoke PUBLIC execute (CI lint).

create or replace function mos.spawn_process_run(p_work_line_id uuid, p_owning_team_id uuid, p_target_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid := shared.current_org_id();
  v_wl      mos.work_lines;
  v_cad     mos.process_cadences;
  v_team    shared.teams;
  v_period  text; v_caption text; v_snapshot jsonb;
  v_run_id  uuid; v_created int := 0; v_pending int := 0;
  td        mos.process_task_defs%rowtype;
  v_holders uuid[]; v_pic uuid; v_sup uuid; v_task_id uuid; v_label text; v_pos int;
begin
  select * into v_wl from mos.work_lines where id = p_work_line_id;
  if v_wl.id is null then raise exception 'process not found' using errcode = 'P0002'; end if;
  if v_wl.type <> 'process' then raise exception 'work_line % is not a process', p_work_line_id using errcode = 'P0003'; end if;
  -- cross-org guard FIRST (DEFINER bypasses RLS).
  if v_wl.org_id is distinct from v_org then raise exception 'cannot start a process outside your org' using errcode = '42501'; end if;
  select * into v_team from shared.teams where id = p_owning_team_id and org_id = v_org;
  if v_team.id is null then raise exception 'owning team not found in org' using errcode = 'P0002'; end if;
  -- capability + Team-authorization gate.
  if not (shared.can('process.start') and mos.can_start_process_for_team(p_owning_team_id)) then
    raise exception 'not authorized to start this process (needs process.start + owning-Team membership)' using errcode = '42501';
  end if;
  select * into v_cad from mos.process_cadences where work_line_id = p_work_line_id and org_id = v_org;
  if v_cad.id is null then raise exception 'process has no cadence configured' using errcode = 'P0003'; end if;

  -- deterministic WIB period key (idempotency grain).
  v_period := case v_cad.cadence_kind
                when 'daily'   then to_char(p_target_date, 'YYYY-MM-DD')
                when 'weekly'  then to_char(p_target_date, 'IYYY"W"IW')
                when 'monthly' then to_char(p_target_date, 'YYYY-MM')
                else                to_char(p_target_date, 'YYYY-MM-DD') end;
  v_caption := v_wl.name || ' · ' || to_char(p_target_date, 'DD Mon YYYY');

  -- version snapshot (immutable copy of the active defs).
  select jsonb_build_object('definition_version', v_wl.definition_version, 'process_name', v_wl.name,
           'task_defs', coalesce(jsonb_agg(to_jsonb(d.*) order by d.position), '[]'::jsonb))
    into v_snapshot
    from mos.process_task_defs d where d.work_line_id = p_work_line_id and d.org_id = v_org and d.archived_at is null;

  -- idempotent insert: on conflict, return the existing run and generate NOTHING.
  insert into mos.process_runs (org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
                                definition_version, spec_snapshot, started_by)
  values (v_org, p_work_line_id, p_owning_team_id, v_period, v_caption, p_target_date,
          v_wl.definition_version, v_snapshot, shared.current_person_id())
  on conflict (org_id, work_line_id, owning_team_id, period_key) do nothing
  returning id into v_run_id;
  if v_run_id is null then
    select id into v_run_id from mos.process_runs
      where org_id = v_org and work_line_id = p_work_line_id and owning_team_id = p_owning_team_id and period_key = v_period;
    return jsonb_build_object('run_id', v_run_id, 'created', 0, 'pending', 0, 'idempotent', true);
  end if;

  -- generate a Task (single holder) or a pending human-choice row (0/many holders) per active def.
  for td in select * from mos.process_task_defs
            where work_line_id = p_work_line_id and org_id = v_org and archived_at is null order by position loop
    if td.pic_person_id is not null then
      v_pic := td.pic_person_id;
    else
      select array_agg(h) into v_holders from mos._function_holders(v_org, td.pic_role_id, td.pic_team_id) h;
      v_pic := case when v_holders is not null and array_length(v_holders,1) = 1 then v_holders[1] else null end;
    end if;

    if v_pic is null then
      insert into mos.process_run_pending_tasks (org_id, process_run_id, task_def_id, candidate_person_ids, reason)
      values (v_org, v_run_id, td.id, coalesce(v_holders, '{}'),
              case when v_holders is null then 'none' else 'multiple' end);
      v_pending := v_pending + 1;
      continue;  -- OD-41: never guess a PIC.
    end if;

    -- Supervisor: explicit → role holder (if unique) → process A → PIC self.
    v_sup := td.supervisor_person_id;
    if v_sup is null and td.supervisor_role_id is not null then
      select array_agg(h) into v_holders from mos._function_holders(v_org, td.supervisor_role_id, td.supervisor_team_id) h;
      if v_holders is not null and array_length(v_holders,1) = 1 then v_sup := v_holders[1]; end if;
    end if;
    v_sup := coalesce(v_sup, v_wl.accountable_person_id, v_pic);

    insert into mos.tasks (org_id, title, description, business_unit_id, status,
                           responsible_person_id, accountable_person_id, due_date,
                           work_line_id, process_run_id, generated_from_task_def_id, created_by)
    values (v_org, td.title, td.description, v_team.business_unit_id, 'Open',
            v_pic, v_sup, p_target_date + td.due_offset_days,
            p_work_line_id, v_run_id, td.id, shared.current_person_id())
    returning id into v_task_id;
    v_created := v_created + 1;

    v_pos := 0;
    for v_label in select value from jsonb_array_elements_text(td.checklist_items) loop
      insert into mos.task_checklist_items (org_id, task_id, label, position) values (v_org, v_task_id, v_label, v_pos);
      v_pos := v_pos + 1;
    end loop;
  end loop;

  return jsonb_build_object('run_id', v_run_id, 'created', v_created, 'pending', v_pending, 'idempotent', false);
end $$;
comment on function mos.spawn_process_run(uuid,uuid,date) is
  'Idempotent occurrence spawn (FR-602..608): cross-org guard → process.start + Team gate → period key → on-conflict-do-nothing run → snapshot → per def resolve PIC (1 holder ⇒ Task; 0/many ⇒ pending, never guessed). SECURITY DEFINER.';
revoke execute on function mos.spawn_process_run(uuid,uuid,date) from public, anon, authenticated;
grant  execute on function mos.spawn_process_run(uuid,uuid,date) to authenticated;

create or replace function mos.resolve_pending_task(p_pending_id uuid, p_pic_person_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := shared.current_org_id();
  v_pend mos.process_run_pending_tasks; v_run mos.process_runs; v_td mos.process_task_defs;
  v_team shared.teams; v_wl mos.work_lines; v_sup uuid; v_task_id uuid; v_holders uuid[]; v_label text; v_pos int := 0;
begin
  select * into v_pend from mos.process_run_pending_tasks where id = p_pending_id for update;
  if v_pend.id is null then raise exception 'pending item not found' using errcode = 'P0002'; end if;
  if v_pend.org_id is distinct from v_org then raise exception 'cannot resolve outside your org' using errcode = '42501'; end if;
  if v_pend.resolved_at is not null then raise exception 'pending item already resolved' using errcode = 'P0003'; end if;
  select * into v_run from mos.process_runs where id = v_pend.process_run_id;
  if not (shared.can('process.start') and mos.can_start_process_for_team(v_run.owning_team_id)) then
    raise exception 'not authorized to resolve this pending item' using errcode = '42501'; end if;
  if not exists (select 1 from shared.people where id = p_pic_person_id and org_id = v_org and archived_at is null) then
    raise exception 'chosen PIC is not a current-org active person' using errcode = '42501'; end if;
  if v_pend.reason = 'multiple' and not (p_pic_person_id = any (v_pend.candidate_person_ids)) then
    raise exception 'chosen PIC is not one of the candidates' using errcode = 'P0003'; end if;

  select * into v_td   from mos.process_task_defs where id = v_pend.task_def_id;
  select * into v_wl   from mos.work_lines        where id = v_run.work_line_id;
  select * into v_team from shared.teams          where id = v_run.owning_team_id;

  v_sup := v_td.supervisor_person_id;
  if v_sup is null and v_td.supervisor_role_id is not null then
    select array_agg(h) into v_holders from mos._function_holders(v_org, v_td.supervisor_role_id, v_td.supervisor_team_id) h;
    if v_holders is not null and array_length(v_holders,1) = 1 then v_sup := v_holders[1]; end if;
  end if;
  v_sup := coalesce(v_sup, v_wl.accountable_person_id, p_pic_person_id);

  insert into mos.tasks (org_id, title, description, business_unit_id, status,
                         responsible_person_id, accountable_person_id, due_date,
                         work_line_id, process_run_id, generated_from_task_def_id, created_by)
  values (v_org, v_td.title, v_td.description, v_team.business_unit_id, 'Open',
          p_pic_person_id, v_sup, v_run.scheduled_date + v_td.due_offset_days,
          v_run.work_line_id, v_run.id, v_td.id, shared.current_person_id())
  returning id into v_task_id;
  for v_label in select value from jsonb_array_elements_text(v_td.checklist_items) loop
    insert into mos.task_checklist_items (org_id, task_id, label, position) values (v_org, v_task_id, v_label, v_pos);
    v_pos := v_pos + 1;
  end loop;
  update mos.process_run_pending_tasks
     set resolved_at = now(), resolved_by = shared.current_person_id(), materialized_task_id = v_task_id
   where id = p_pending_id;
  return v_task_id;
end $$;
comment on function mos.resolve_pending_task(uuid,uuid) is
  'Human resolves an ambiguous/vacant PIC by choosing a person → materializes the Task (FR-606). SECURITY DEFINER; cross-org + capability + Team-gated; candidate-checked.';
revoke execute on function mos.resolve_pending_task(uuid,uuid) from public, anon, authenticated;
grant  execute on function mos.resolve_pending_task(uuid,uuid) to authenticated;

create or replace function mos.complete_process_run(p_run_id uuid)
returns mos.process_runs language plpgsql security definer set search_path = '' as $$
declare v_org uuid := shared.current_org_id(); v_run mos.process_runs;
begin
  select * into v_run from mos.process_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'run not found' using errcode = 'P0002'; end if;
  if v_run.org_id is distinct from v_org then raise exception 'cannot complete a run outside your org' using errcode = '42501'; end if;
  if not (shared.can('process.start') and mos.can_start_process_for_team(v_run.owning_team_id)) then
    raise exception 'not authorized to complete this run' using errcode = '42501'; end if;
  update mos.process_runs set status = 'completed', completed_at = now(), completed_by = shared.current_person_id(), updated_at = now()
   where id = p_run_id;
  select * into v_run from mos.process_runs where id = p_run_id;
  return v_run;
end $$;
comment on function mos.complete_process_run(uuid) is 'Human marks a run complete (FR-610). SECURITY DEFINER; cross-org + capability + Team-gated.';
revoke execute on function mos.complete_process_run(uuid) from public, anon, authenticated;
grant  execute on function mos.complete_process_run(uuid) to authenticated;

-- DOWN: drop function if exists mos.complete_process_run(uuid), mos.resolve_pending_task(uuid,uuid), mos.spawn_process_run(uuid,uuid,date);
```
**Verify:** covered by the A13 CI run (incl. the definer-revoke lint — every DEFINER fn here has its revoke).

### A5 — Migration: derived roll-up view + `due_process_runs` read-model
**File:** `supabase/migrations/20260716000014_mos_process_rollup.sql` (create). ADR-0051 D9.
```sql
-- Step 6 (ADR-0051 D9): derived per-occurrence roll-up (no stored counts) + the scheduler-free "due" surface.
create or replace view mos.process_run_rollup as
select
  r.id as process_run_id, r.org_id, r.caption, r.scheduled_date, r.status,
  count(t.id) filter (where t.archived_at is null)                          as total,
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
```
**Verify:** covered by the A13 CI run.

### A6 — Migration: pgTAP test-seed fixture
**File:** `supabase/migrations/20260716000015_mos_process_test_seed.sql` (create). Extends the ADR-0050 signal
seed (`mos._test_seed_signal_tree()`, which already builds org `…00a1`, BU Unit-1 `…00a2`, and Teams by code
`own_team`/`sibling_team`) with a process + cadence + three task-defs exercising all three PIC-resolution paths.
SECURITY DEFINER, revoked (test-only; called inside a pgTAP txn).
```sql
create or replace function mos._test_seed_process_tree()
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := '00000000-0000-0000-0000-0000000000a1';
        v_bu  uuid := '00000000-0000-0000-0000-0000000000a2';  -- Unit-1
        v_team uuid;
begin
  perform mos._test_seed_signal_tree();                       -- org + BU + Teams(own_team/sibling_team) + memberships
  select id into v_team from shared.teams where org_id = v_org and code = 'own_team';

  -- People: Solo (1 holder), TwinA + TwinB (2 holders), Boss (process A).
  insert into shared.people (id, org_id, full_name) values
    ('00000000-0000-0000-0000-00000000f001', v_org, 'Solo Holder'),
    ('00000000-0000-0000-0000-00000000f002', v_org, 'Twin A'),
    ('00000000-0000-0000-0000-00000000f003', v_org, 'Twin B'),
    ('00000000-0000-0000-0000-00000000f004', v_org, 'Boss (Process A)')
  on conflict (id) do nothing;

  -- Roles: RoleSolo (1 holder), RoleTwin (2 holders), RoleVacant (0 holders).
  insert into shared.roles (id, org_id, business_unit_id, name) values
    ('00000000-0000-0000-0000-00000000e001', v_org, v_bu, 'Opener'),
    ('00000000-0000-0000-0000-00000000e002', v_org, v_bu, 'Twin Station'),
    ('00000000-0000-0000-0000-00000000e003', v_org, v_bu, 'Vacant Station')
  on conflict (id) do nothing;
  insert into shared.person_roles (org_id, person_id, role_id) values
    (v_org, '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001'),
    (v_org, '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e002'),
    (v_org, '00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e002')
  on conflict do nothing;

  -- Team memberships (active) so pic_team_id scoping resolves.
  insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
    (v_org, '00000000-0000-0000-0000-00000000f001', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f002', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f003', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f004', v_team, false)
  on conflict do nothing;

  -- Process definition (type=process, BU Unit-1, A=Boss) + daily cadence.
  insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id, definition_version) values
    ('00000000-0000-0000-0000-00000000c001', v_org, 'Café Opening', 'process', v_bu,
     '00000000-0000-0000-0000-00000000f004', 1) on conflict (id) do nothing;
  insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind) values
    ('00000000-0000-0000-0000-00000000c002', v_org, '00000000-0000-0000-0000-00000000c001', 'daily')
    on conflict (id) do nothing;

  -- Three task-defs: TdSolo (resolvable, checklist), TdVacant (0), TdTwin (2).
  insert into mos.process_task_defs (id, org_id, work_line_id, title, position, due_offset_days, checklist_items, pic_role_id, pic_team_id) values
    ('00000000-0000-0000-0000-00000000d001', v_org, '00000000-0000-0000-0000-00000000c001', 'Open the café', 0, 0,
     '["Unlock door","Turn on machine"]'::jsonb, '00000000-0000-0000-0000-00000000e001', v_team),
    ('00000000-0000-0000-0000-00000000d002', v_org, '00000000-0000-0000-0000-00000000c001', 'Vacant step', 1, 0,
     '[]'::jsonb, '00000000-0000-0000-0000-00000000e003', v_team),
    ('00000000-0000-0000-0000-00000000d003', v_org, '00000000-0000-0000-0000-00000000c001', 'Twin step', 2, 0,
     '[]'::jsonb, '00000000-0000-0000-0000-00000000e002', v_team)
  on conflict (id) do nothing;
end $$;
revoke execute on function mos._test_seed_process_tree() from public, anon, authenticated;
-- DOWN: drop function if exists mos._test_seed_process_tree();
```
**Verify:** covered by the A13 CI run.

### A7 — Edit `seed.sql` (fresh-reset parity, dev demo)
**File:** `supabase/seed.dev-processes.sql` (create), `supabase/config.toml` (wire).
- Create `seed.dev-processes.sql` (mirrors `seed.dev-tasks.sql`/`seed.dev-signals.sql`: DEV-only, idempotent,
  resolves BU by `code` and people by `*.dev@example.test`): insert one *"Café HQ daily opening"* `work_lines`
  (`type='process'`, BU Retail Ops, A = a dev manager), a `daily` `process_cadences`, and 2 `process_task_defs`
  (one with a `pic_role_id` held by exactly one dev person → resolvable; one with a `pic_role_id` held by two →
  a pending demo). Guard with `if exists (select 1 from mos.process_cadences limit 1) then return; end if;`.
- In `config.toml` `[db.seed] sql_paths`, add `"seed.dev-processes.sql"` **after** `seed.dev-signals.sql`.
**Verify:** covered by the A13 CI run (`supabase start` applies seeds); no local Docker.

### A8 — pgTAP: substrate + RLS forced + constraints + no-delete (**AC-601**)
**File:** `supabase/tests/90_process_substrate.sql` (create). Follow the `83_signal_substrate.sql` layout
(`begin; select plan(N); select mos._test_seed_process_tree(); set local role authenticated; …`). Assert:
`mos.process_cadences`, `mos.process_task_defs`, `mos.process_runs`, `mos.process_run_pending_tasks` each have
`relrowsecurity AND relforcerowsecurity`; the run idempotency `unique(org_id,work_line_id,owning_team_id,period_key)`
exists (query `pg_indexes`); the `process_task_defs_pic_binding` CHECK rejects a row with both PIC columns NULL
(`throws_ok … '23514'`); `mos.tasks` has columns `process_run_id`,`generated_from_task_def_id` (`has_column`);
and **no** table grants DELETE to `authenticated` (`has_table_privilege(... , 'DELETE')` is false for each new
table). Tag the plan's assertions `AC-601`.
**Verify:** `gh workflow run integration.yml --ref <branch>` (this file green in the pgTAP step).

### A9 — pgTAP: idempotency + version snapshot (**AC-602, AC-603**)
**File:** `supabase/tests/91_process_spawn_idempotency.sql` (create). Set claims for Boss (`…f004`) with
`access_roles:["admin"]`. Call `select mos.spawn_process_run('…c001', <own_team>, current_date)`; capture
`created`. Call it **again** with the same args; assert `(result->>'idempotent')::bool` is true, `process_runs`
count for that key = **1**, and the `mos.tasks where process_run_id = run` count is unchanged (**AC-602**). Then
`update mos.process_task_defs set title='CHANGED' where id='…d001'`; re-read the run's `spec_snapshot` and its
Tasks; assert both are **unchanged** (title still original in the snapshot + on the generated Task) (**AC-603**).
**Verify:** `gh workflow run integration.yml --ref <branch>`.

### A10 — pgTAP: PIC resolution — single / vacant / ambiguous + org-wall (**AC-604, AC-605, AC-612**)
**File:** `supabase/tests/92_process_holder_resolution.sql` (create). As admin Boss, spawn today's run. Assert:
- **AC-604** a `mos.tasks` row exists for def `…d001` (`generated_from_task_def_id='…d001'`) with
  `responsible_person_id='…f001'` (Solo).
- **AC-605** **no** Task exists for `…d002` (vacant) and a `process_run_pending_tasks` row `reason='none'`
  exists; **no** Task for `…d003` (twin) and a pending row `reason='multiple'` with
  `candidate_person_ids @> array['…f002','…f003']`.
- **AC-612** set claims `org_id` to a foreign org uuid and `spawn_process_run('…c001', <own_team>, current_date)`
  ⇒ `throws_ok … '42501'` (cross-org); and assert `select count(*) from mos._function_holders('…a1',
  '…e003', <own_team>)` = **0** (vacant role resolves no holder — the org-walled resolver never invents a PIC).
Tag each assertion.
**Verify:** `gh workflow run integration.yml --ref <branch>`.

### A11 — pgTAP: pending resolution + materialized-Task shape + checklist (**AC-606, AC-607, AC-608**)
**File:** `supabase/tests/93_process_pending_and_task_shape.sql` (create). Spawn today's run as admin Boss.
- **AC-606** find the `reason='multiple'` pending row for `…d003`; call `mos.resolve_pending_task(<pending>,
  '…f002')` ⇒ `lives_ok`; assert a Task now exists (`generated_from_task_def_id='…d003'`, PIC `…f002`,
  `process_run_id`=run) and the pending row has `resolved_at`+`materialized_task_id`; call
  `resolve_pending_task(<pending>, '…f002')` again ⇒ `throws_ok '…already resolved…' P0003`; and
  `resolve_pending_task(<vacant pending>, '…f004')` where `…f004` is fine but for a `reason='multiple'` a
  non-candidate is rejected — cover with a `resolve_pending_task(<multiple pending copy>, '…f004')` `throws_ok`.
- **AC-607** the `…d001` Task: `business_unit_id` = own_team's BU (`…a2`), `accountable_person_id` = process A
  (`…f004`), `status='Open'`, `process_run_id` set, `due_date = current_date + 0`.
- **AC-608** exactly **2** `mos.task_checklist_items` rows for the `…d001` Task (`Unlock door`, `Turn on
  machine`), and no extra Task was created for those steps.
**Verify:** `gh workflow run integration.yml --ref <branch>`.

### A12 — pgTAP: roll-up + completion + authz (**AC-609, AC-610, AC-611, AC-613**)
**File:** `supabase/tests/94_process_rollup_authz.sql` (create). Spawn today's run as admin Boss.
- **AC-609** update the `…d001` Task to `status='Done'`; read `mos.process_run_rollup where process_run_id=run`;
  assert `done=1`, `total=1` (only one Task materialized; two defs went pending), `pending_unresolved=2`,
  `completion_pct=100.0`; set `due_date` to yesterday + status `Open` on a second materialized Task (resolve one
  pending first) and assert `overdue` counts it.
- **AC-610** `mos.complete_process_run(run)` as admin ⇒ `status='completed'` + `completed_at` set and the run's
  Tasks still exist; as a `member` (no `process.start`) ⇒ `throws_ok '42501'`.
- **AC-611** as `authenticated` attempt `insert into mos.process_runs(...)` directly ⇒ `throws_ok` (no policy);
  the same for `mos.process_run_pending_tasks`; call `spawn_process_run` with claims `access_roles:["member"]`
  (no `process.start`) ⇒ `throws_ok '42501'`.
- **AC-613** `select count(*) from mos.due_process_runs()` includes `…c001` before spawn; after
  `spawn_process_run('…c001', <own_team>, current_date)` succeeds, re-select ⇒ `…c001`/own_team no longer
  listed.
**Verify:** `gh workflow run integration.yml --ref <branch>`.

### A13 — Full CI gate (pgTAP suite + definer-revoke lint + e2e) green
**Verify:** `gh workflow run integration.yml --ref <branch>` then `gh run watch` — the `db` job passes: the
definer-revoke lint (every DEFINER fn in A4/A6 has its `revoke`), the **full** pgTAP suite (90–94 + the
pre-existing suite, no regression), and the live-stack e2e (AC-630 from C3).

---

## Track B — DAL + thin UI (`mos-app/`)

### B1 — Type contract (freeze first; unblocks all of B)
**File:** `mos-app/src/lib/db/processes.types.ts` (create). No test (pure types).
```ts
export type CadenceKind = 'manual' | 'daily' | 'weekly' | 'monthly'
export type ProcessRunStatus = 'open' | 'completed' | 'cancelled'

export interface DueProcessRun {
  work_line_id: string; process_name: string
  owning_team_id: string; team_name: string
  period_key: string; scheduled_date: string
}
export interface SpawnResult { run_id: string; created: number; pending: number; idempotent: boolean }
export interface ProcessRunRow {
  id: string; work_line_id: string; owning_team_id: string; period_key: string
  caption: string; scheduled_date: string; status: ProcessRunStatus; definition_version: number
}
export interface ProcessRunRollup {
  process_run_id: string; caption: string; scheduled_date: string; status: ProcessRunStatus
  total: number; open: number; in_progress: number; blocked: number; done: number
  overdue: number; pending_unresolved: number; completion_pct: number
}
export interface PendingTaskRow {
  id: string; process_run_id: string; task_def_id: string
  candidate_person_ids: string[]; reason: 'none' | 'multiple'; resolved_at: string | null
}
```
**Verify:** `cd mos-app && npm run typecheck` (zero errors).

### B2 — DAL: `startRun` + `listDueRuns` (**AC-620 backing**)
**Test first (AC-620):** `mos-app/src/lib/db/processes.test.ts` (create) — mock a `ProcessSupabase` shape
(mirror `signals.test.ts`/`tasks.ts` mocks); assert `startRun(processId, teamId, date)` calls
`.rpc('spawn_process_run', { p_work_line_id, p_owning_team_id, p_target_date })` and returns the parsed
`SpawnResult`; an RPC error is re-thrown; `listDueRuns()` calls `.rpc('due_process_runs')` and returns
`DueProcessRun[]`. Tag the `startRun` assertion `AC-620`.
**Impl:** `mos-app/src/lib/db/processes.ts` (create) using `supabase.schema('mos')` — never send `org_id`,
throw on PostgREST error (mirror `tasks.ts`).
**Verify:** `cd mos-app && npm test -- src/lib/db/processes.test.ts`.

### B3 — DAL: `listPendingTasks` + `resolvePendingTask` (**AC-621 backing**)
**Test first (AC-621):** in `processes.test.ts` — `listPendingTasks(runId)` selects `process_run_pending_tasks`
filtered `.is('resolved_at', null).eq('process_run_id', runId)`; `resolvePendingTask(pendingId, picId)` calls
`.rpc('resolve_pending_task', { p_pending_id, p_pic_person_id })` and returns the new task id; both throw on
error. Tag `AC-621`.
**Impl:** add to `processes.ts`.
**Verify:** `cd mos-app && npm test -- src/lib/db/processes.test.ts`.

### B4 — DAL: `getRunRollup` + `listRunTasks` + `completeRun`
**Test first:** `getRunRollup(runId)` reads `process_run_rollup`; `listRunTasks(runId)` reads `mos.tasks` where
`process_run_id=runId` (reuse the `tasks.ts` `TaskListRow` shape — do not re-implement task fetching);
`completeRun(runId)` calls `.rpc('complete_process_run', …)`. (No AC — plumbing under AC-622/AC-630.)
**Impl:** add to `processes.ts` (import `TaskListRow` from `./tasks.types`).
**Verify:** `cd mos-app && npm test -- src/lib/db/processes.test.ts`.

### B5 — Occurrence grouping helper (**AC-622**)
**Test first (AC-622):** `mos-app/src/lib/processes/occurrence-grouping.test.ts` (create) — a pure
`groupTasksByOccurrence(tasks, captionByRunId)` that partitions tasks carrying a `process_run_id` into
caption-labelled groups (ad-hoc tasks stay ungrouped); assert the returned group labels are the run **captions**
and the string `'Process Run'` is **never** produced. Tag `AC-622`.
**Impl:** `mos-app/src/lib/processes/occurrence-grouping.ts` (create).
**Verify:** `cd mos-app && npm test -- src/lib/processes/occurrence-grouping.test.ts`.

### B6 — Start-run control component (**AC-623**)
**Test first (AC-623):** `mos-app/src/components/processes/start-run-control.test.tsx` (create) — render with a
mocked `listDueRuns` returning one due row and a `useCapabilities` mock; when the viewer has `process.start`,
the due row renders with a **"Start run"** button (assert the accessible name is verb+object, never a bare
"Create" — Rule 7), and clicking it calls `startRun`; when the viewer lacks `process.start`, the control is
absent. Tag `AC-623`.
**Impl:** `mos-app/src/components/processes/start-run-control.tsx` (create) — reuse the existing button/list
primitives + the capability hook (`mos-app/src/lib/auth/*` — do not re-implement capability checks).
**Verify:** `cd mos-app && npm test -- src/components/processes/start-run-control.test.tsx`.

### B7 — Pending-PIC resolution surface (**AC-624**)
**Test first (AC-624):** `mos-app/src/components/processes/pending-resolution.test.tsx` (create) — given a
`reason='multiple'` pending row with two candidate ids resolved to names (mock the people loader), the two
candidates render as choices and selecting one calls `resolvePendingTask(id, picId)`; given `reason='none'`, a
full person picker is offered. Tag `AC-624`.
**Impl:** `mos-app/src/components/processes/pending-resolution.tsx` (create) — reuse the existing person picker
(`mos-app/src/components/**` people select) rather than a new one (Rule 11).
**Verify:** `cd mos-app && npm test -- src/components/processes/pending-resolution.test.tsx`.

### B8 — Occurrence caption group header in the Tasks DB-view (reuse, no rebuild)
**Test first:** `mos-app/src/components/tasks/group-header-row.test.tsx` (extend, or a sibling test) — when the
Tasks view is grouped by occurrence, the group header renders the run **caption** + the `process_run_rollup`
summary (done/total, N overdue, N unresolved) using the **existing** `group-header-row` grammar; assert no
new/divergent header component is introduced (Rule 11). (Backs AC-622 render.)
**Impl:** wire an `occurrence` group-by option into the shipped `mos-app/src/components/tasks/*` view via
`groupTasksByOccurrence` (B5) — **extend** `TasksWorkspace`/`group-header-row`, do NOT rebuild the table
(OD-REDESIGN-60 / Rule 11).
**Verify:** `cd mos-app && npm test -- src/components/tasks/group-header-row.test.tsx`.

### B9 — i18n strings
**File:** `mos-app/src/i18n/messages.ts` (edit). Add: `processes.action.startRun` (`Start run`),
`processes.pending.title` (`Assign — two people could own this`), `processes.pending.choose` (`Choose PIC`),
`processes.rollup.summary` (`{done}/{total} done · {overdue} overdue · {pending} to assign`),
`processes.due.empty` (`No recurring work due to start.`). No new test; typecheck covers key existence.
**Verify:** `cd mos-app && npm run typecheck`.

---

## Track C — Wiring, e2e, review, gates (depends on A + B merged)

### C1 — Mount the occurrence group-by + Start control on `/work/tasks`
**Test first:** `mos-app/src/pages/tasks-page.test.tsx` (extend) — the Tasks page exposes an **Occurrence**
group-by option that groups generated tasks under captions (via B5/B8) and renders the `StartRunControl`
(B6) in the toolbar/header region; assert `'Process Run'` never appears in the DOM (FR-611). **Impl:** wire
`StartRunControl` + the occurrence group-by into the existing tasks page — extend, do not rebuild.
**Verify:** `cd mos-app && npm test -- src/pages/tasks-page.test.tsx`.

### C2 — Mount the pending-resolution surface on the occurrence group header
**Test first:** `mos-app/src/components/tasks/group-header-row.test.tsx` (extend) — an occurrence group with
`pending_unresolved > 0` shows an "N to assign" affordance that opens `PendingResolution` (B7). **Impl:** wire
`PendingResolution` open-on-click into the occurrence group header.
**Verify:** `cd mos-app && npm test -- src/components/tasks/group-header-row.test.tsx`.

### C3 — E2E: start-occurrence journey (**AC-630**)
**Test first (this IS the test):** `mos-app/e2e/AC-630-start-occurrence.spec.ts` (create) — follow the e2e
conventions (`e2e/helpers/login.ts`, `e2e/fixtures/users.ts`). As an authorized lead (a fixture user with
`process.start` + owning-Team membership; add to the fixture/seed if absent), open `/work/tasks`, use the Start
control to Start the seeded *"Café HQ daily opening"* occurrence; assert its single-holder Tasks appear grouped
under the occurrence caption; assert an ambiguous step shows as **"N to assign"**; open it, resolve to a PIC,
and assert the Task now appears in the same group. Tag the title `AC-630`. (May fold into F2 *today's-opening*
at Step 7.)
**Verify:** `gh workflow run integration.yml --ref <branch>` (e2e runs on the live stack; no local Docker).

### C4 — Review-ledger scaffold + mandatory security-auditor dispatch
**File:** `docs/reviews/<branch>.md` (create/append) — record the Step-6 **scope card** (IN: process
definition/cadence/task-defs, thin run record + pending queue, spawn/resolve/complete RPCs, roll-up + due
surface, thin Start/grouping/resolution UI; DEFERRED: Process designer=OD-REDESIGN-13, Standards/Checks=
OD-REDESIGN-4/30/31, scheduler/auto-materialize=RATIFY-3, full manager-chain Supervisor=RATIFY-4, per-Team
adoption=OD-REDESIGN-54, Café bridge=Step 7, Task BU→Team re-home). **Dispatch the mandatory security-auditor**
per spec §7 (spawn RPC privilege/injection, `_function_holders` tenancy, RLS seams, `org_id` on generated
Tasks, resolve/complete gates, capability grants) — findings recorded here; any Critical/High blocks merge.
(Doc only; no verify command — Director's review-battery input.)

### C5 — Final gates (blocking; the whole slice)
Run and confirm green:
- `gh workflow run integration.yml --ref <branch>` → `gh run watch` — pgTAP suite (Track A) + definer-revoke
  lint + live-stack e2e (AC-630) all pass.
- `cd mos-app && npm run typecheck` — zero errors.
- `cd mos-app && npm run lint -- --max-warnings=0` — zero.
- `cd mos-app && npm test` — full Vitest suite green; coverage ≥80% on changed lines
  (`src/lib/db/processes.ts` + `src/lib/processes/*` + `src/components/processes/*`).
- `cd mos-app && npx playwright test` — curated journeys green (F1/F2/F3 no regression).
- `bash scripts/pre-merge-check.sh` — exit 0 (review ledger present; battery incl. security-auditor recorded).
**Verify:** all commands above exit 0 / the CI `db` job is green.

---

## Task count & AC coverage

**27 tasks:** Track A = A1–A13 (13), Track B = B1–B9 (9), Track C = C1–C5 (5).

**AC → task map:**
- **AC-601** → A8 · **AC-602/603** → A9 · **AC-604/605/612** → A10 · **AC-606/607/608** → A11 ·
  **AC-609/610/611/613** → A12 (full CI gate A13).
- **AC-620** → B2 · **AC-621** → B3 · **AC-622** → B5 (rendered in B8/C1) · **AC-623** → B6 · **AC-624** → B7.
- **AC-630** (e2e) → C3.

**FR coverage:** FR-601 → A1/A6 · FR-602 → A9 · FR-603 → A9 · FR-604 → A10 · FR-605 → A10 · FR-606 → A11 ·
FR-607 → A11 · FR-608 → A11 · FR-609 → A12 · FR-610 → A12 · FR-611 → B5/C1 · FR-612 → A12/B6 · FR-613 → A9 ·
FR-614 → A10/A12. NFR-601..603 → A8/A10/A12; NFR-604 → every migration DOWN; NFR-605 → C5.

**Parallelizable:** Track A and Track B run concurrently after B1 (type freeze); A8–A12 parallel after A1–A7;
B2–B4 (DAL) and B5–B8 (UI) parallel after B1. Track C is the integration seam — after A + B merge.
