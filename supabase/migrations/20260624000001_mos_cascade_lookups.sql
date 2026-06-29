-- Cascade first slice (ADR-0014, OD-C-1): mos.objectives + mos.work_lines lookup tables,
-- nullable FK columns on mos.tasks, same-org guard trigger, and RLS.
-- No app-tier delete granted anywhere (NFR-002 extends to lookup tables).

----------------------------------------------------------------------
-- 1. mos.objectives
----------------------------------------------------------------------
create table mos.objectives (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references shared.orgs(id) on delete cascade
                            default shared.current_org_id(),
  name        text        not null check (btrim(name) <> ''),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.objectives is
  'Org-level objective catalog; tasks bridge to these via objective_id (ADR-0014, OD-C-1).';

create index objectives_org_active_idx
  on mos.objectives (org_id)
  where archived_at is null;

create trigger objectives_set_updated_at
  before update on mos.objectives
  for each row execute function shared.set_updated_at();

----------------------------------------------------------------------
-- 2. mos.work_lines
----------------------------------------------------------------------
create table mos.work_lines (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references shared.orgs(id) on delete cascade
                            default shared.current_org_id(),
  name        text        not null check (btrim(name) <> ''),
  type        text        not null check (type in ('project', 'process')),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.work_lines is
  'Work-line catalog (project or process); tasks bridge via work_line_id (ADR-0014, OD-C-1).';

create index work_lines_org_active_idx
  on mos.work_lines (org_id)
  where archived_at is null;

create trigger work_lines_set_updated_at
  before update on mos.work_lines
  for each row execute function shared.set_updated_at();

----------------------------------------------------------------------
-- 3. Nullable FK columns on mos.tasks (no backfill — ADR-0014)
----------------------------------------------------------------------
alter table mos.tasks
  add column objective_id  uuid references mos.objectives(id),
  add column work_line_id  uuid references mos.work_lines(id);

create index tasks_objective_idx  on mos.tasks (objective_id);
create index tasks_work_line_idx  on mos.tasks (work_line_id);

----------------------------------------------------------------------
-- 4. Same-org guard: task.objective_id and task.work_line_id must be
--    in the same org as the task (FK alone does not enforce this —
--    NFR-201). Raises 42501 (insufficient_privilege) on violation.
----------------------------------------------------------------------
create or replace function mos._guard_task_cascade_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.objective_id is not null then
    if not exists (
      select 1 from mos.objectives
      where id = new.objective_id
        and org_id = new.org_id
    ) then
      raise exception 'objective_id belongs to a different org'
        using errcode = '42501';
    end if;
  end if;

  if new.work_line_id is not null then
    if not exists (
      select 1 from mos.work_lines
      where id = new.work_line_id
        and org_id = new.org_id
    ) then
      raise exception 'work_line_id belongs to a different org'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
comment on function mos._guard_task_cascade_refs() is
  'BEFORE INSERT/UPDATE guard: objective_id and work_line_id must belong to task.org_id (NFR-201).';

create trigger tasks_guard_cascade_refs
  before insert or update on mos.tasks
  for each row execute function mos._guard_task_cascade_refs();

----------------------------------------------------------------------
-- 5. RLS on mos.objectives
----------------------------------------------------------------------
grant select, insert, update on mos.objectives to authenticated;
-- NO delete grant (NFR-002 extends to lookup tables)

alter table mos.objectives enable row level security;
alter table mos.objectives force  row level security;

-- SELECT: any org member can read (for pickers)
create policy objectives_select_org on mos.objectives
  for select to authenticated
  using (org_id = shared.current_org_id());

-- INSERT: admin or ops_lead only (catalog management)
create policy objectives_insert_admin_or_ops_lead on mos.objectives
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and (shared.has_access_role('admin') or shared.has_access_role('ops_lead'))
  );

-- UPDATE: admin or ops_lead only
create policy objectives_update_admin_or_ops_lead on mos.objectives
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (
    org_id = shared.current_org_id()
    and (shared.has_access_role('admin') or shared.has_access_role('ops_lead'))
  );

----------------------------------------------------------------------
-- 6. RLS on mos.work_lines
----------------------------------------------------------------------
grant select, insert, update on mos.work_lines to authenticated;
-- NO delete grant (NFR-002)

alter table mos.work_lines enable row level security;
alter table mos.work_lines force  row level security;

-- SELECT: any org member can read
create policy work_lines_select_org on mos.work_lines
  for select to authenticated
  using (org_id = shared.current_org_id());

-- INSERT: admin or ops_lead only
create policy work_lines_insert_admin_or_ops_lead on mos.work_lines
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and (shared.has_access_role('admin') or shared.has_access_role('ops_lead'))
  );

-- UPDATE: admin or ops_lead only
create policy work_lines_update_admin_or_ops_lead on mos.work_lines
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (
    org_id = shared.current_org_id()
    and (shared.has_access_role('admin') or shared.has_access_role('ops_lead'))
  );

-- DOWN:
-- drop trigger if exists tasks_guard_cascade_refs on mos.tasks;
-- drop function if exists mos._guard_task_cascade_refs();
-- drop index if exists tasks_work_line_idx;
-- drop index if exists tasks_objective_idx;
-- alter table mos.tasks drop column if exists work_line_id;
-- alter table mos.tasks drop column if exists objective_id;
-- drop table if exists mos.work_lines;
-- drop table if exists mos.objectives;
