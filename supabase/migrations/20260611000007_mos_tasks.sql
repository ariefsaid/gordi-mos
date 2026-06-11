-- P2-1 — mos.tasks: the core owned-work entity (OD-P2-1/4/5/6/9, ADR-0003).
create table mos.tasks (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references shared.orgs(id) on delete cascade
                           default shared.current_org_id(),
  title                  text not null check (btrim(title) <> ''),
  business_unit_id       uuid not null references shared.business_units(id),
  status                 text not null default 'Open'
                           check (status in ('Open','In Progress','Blocked','Done')),
  responsible_person_id  uuid not null references shared.people(id),
  accountable_person_id  uuid not null references shared.people(id),
  consulted_person_ids   uuid[] not null default '{}',
  informed_person_ids    uuid[] not null default '{}',
  description            text,
  due_date              date,
  last_activity_at      timestamptz not null default now(),
  archived_at           timestamptz,
  created_by            uuid not null references shared.people(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table mos.tasks is 'Owned-work unit; cascade-bridgeable (ADR-0003). org-readable, R/A/mgr-write (OD-P2-3).';

create index tasks_org_idx              on mos.tasks (org_id);
create index tasks_business_unit_idx    on mos.tasks (business_unit_id);
create index tasks_status_idx           on mos.tasks (status);
create index tasks_due_date_idx         on mos.tasks (due_date);
create index tasks_responsible_idx      on mos.tasks (responsible_person_id);
create index tasks_accountable_idx      on mos.tasks (accountable_person_id);
create index tasks_consulted_gin        on mos.tasks using gin (consulted_person_ids);
create index tasks_informed_gin         on mos.tasks using gin (informed_person_ids);
create index tasks_active_org_idx       on mos.tasks (org_id) where archived_at is null;

create trigger tasks_set_updated_at
  before update on mos.tasks
  for each row execute function shared.set_updated_at();
