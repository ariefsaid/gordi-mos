-- P2-1 — task children: checklist items (OD-P2-7) + auto change-events (OD-P2-8, OD-P0-9b).
create table mos.task_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  task_id     uuid not null references mos.tasks(id) on delete cascade,
  label       text not null check (btrim(label) <> ''),
  is_done     boolean not null default false,
  position    integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.task_checklist_items is 'Lightweight subtask: label/done/order child of a task (OD-P2-7). No RACI/status/BU/due.';
create index task_checklist_task_idx on mos.task_checklist_items (task_id);

create trigger task_checklist_set_updated_at
  before update on mos.task_checklist_items
  for each row execute function shared.set_updated_at();

create table mos.task_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade
                     default shared.current_org_id(),
  task_id          uuid not null references mos.tasks(id) on delete cascade,
  actor_person_id  uuid not null references shared.people(id),
  event_type       text not null check (event_type in
                     ('created','status_changed','field_edited','raci_edited','archived','unarchived')),
  from_value       text,
  to_value         text,
  created_at       timestamptz not null default now()
);
comment on table mos.task_events is 'Auto change-log (OD-P2-8). NOT comments (P2-1b). Drives tasks.last_activity_at.';
create index task_events_task_idx on mos.task_events (task_id, created_at desc);

-- §3.4: every event bumps the parent task's last_activity_at to the event time (one canonical clock).
create or replace function mos._touch_last_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update mos.tasks
    set last_activity_at = new.created_at
    where id = new.task_id;
  return new;
end;
$$;

create trigger task_events_touch_activity
  after insert on mos.task_events
  for each row execute function mos._touch_last_activity();
