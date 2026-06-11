-- P2-2 — mos.weekly_updates: person-keyed weekly recap (OD-P2-10/11/13/14). UPWARD-ONLY read (OD-P1-3).
-- Tables + indexes + CHECK + UNIQUE + lifecycle triggers. RLS lives in 20260612000002.
create table mos.weekly_updates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references shared.orgs(id) on delete cascade
                  default shared.current_org_id(),
  person_id     uuid not null references shared.people(id),
  week_start    date not null,
  summary       text not null default '',
  status        text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at  timestamptz,
  created_by    uuid not null references shared.people(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint weekly_updates_status_submitted_ck
    check ((status = 'submitted') = (submitted_at is not null)),
  constraint weekly_updates_person_week_uq
    unique (org_id, person_id, week_start)
);
comment on table mos.weekly_updates is 'Person-keyed weekly update (OD-P2-10/13). UPWARD-ONLY read: author + manager chain only (OD-P1-3), NOT org-readable. Author-only write.';
create index weekly_updates_person_week_idx on mos.weekly_updates (person_id, week_start);
create index weekly_updates_org_week_idx    on mos.weekly_updates (org_id, week_start);
create trigger weekly_updates_set_updated_at
  before update on mos.weekly_updates
  for each row execute function shared.set_updated_at();

create table mos.weekly_update_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references shared.orgs(id) on delete cascade
                      default shared.current_org_id(),
  weekly_update_id  uuid not null references mos.weekly_updates(id) on delete cascade,
  label             text not null check (btrim(label) <> ''),
  progress          text not null default 'in_progress'
                      check (progress in ('done','in_progress','blocked')),
  position          integer not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table mos.weekly_update_items is 'Update line: free text + progress marker + order (OD-P2-10). NO FK to mos.tasks. Inherits parent upward-only read; writes require parent own + draft.';
create index weekly_update_items_parent_idx on mos.weekly_update_items (weekly_update_id, position);
create trigger weekly_update_items_set_updated_at
  before update on mos.weekly_update_items
  for each row execute function shared.set_updated_at();

-- Owns submitted_at from the status transition so the app sets status only (§3.4, FR-005/013/014).
-- Into 'submitted' stamps now() when null; on 'draft' forces null. The CHECK then always holds.
create or replace function mos._stamp_submitted_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'submitted' then
    if new.submitted_at is null then new.submitted_at := now(); end if;
  else
    new.submitted_at := null;
  end if;
  return new;
end;
$$;
create trigger weekly_updates_stamp_submitted
  before insert or update on mos.weekly_updates
  for each row execute function mos._stamp_submitted_at();

-- Submit-lock for the summary (mirrors mos._guard_archive). Freezes summary edits while submitted,
-- but lets Reopen (submitted->draft) through. Raises 42501 (insufficient_privilege). (FR-015, AC-023 summary side)
create or replace function mos._guard_weekly_update_lock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'submitted'
     and new.status <> 'draft'
     and new.summary is distinct from old.summary then
    raise exception 'weekly update is submitted; reopen before editing the summary'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger weekly_updates_guard_lock
  before update on mos.weekly_updates
  for each row execute function mos._guard_weekly_update_lock();

-- DOWN (drop order — children/functions before parent table):
--   drop trigger weekly_updates_guard_lock on mos.weekly_updates;
--   drop function mos._guard_weekly_update_lock();
--   drop trigger weekly_updates_stamp_submitted on mos.weekly_updates;
--   drop function mos._stamp_submitted_at();
--   drop table mos.weekly_update_items cascade;
--   drop table mos.weekly_updates cascade;
