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
