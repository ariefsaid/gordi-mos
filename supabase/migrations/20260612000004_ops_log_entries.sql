-- P2-3 — ops.log_entries: the chronological floor record (OD-P2-15..19, ADR-0006).
-- First table in the ops schema. org-readable; any-member add; edit/archive author-or-manager;
-- soft-archive only (no DELETE grant). Mirrors mos.tasks conventions.
create table ops.log_entries (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade
                     default shared.current_org_id(),
  business_unit_id uuid not null references shared.business_units(id),
  origin           text not null default 'manual'
                     check (origin in ('manual','kitchen_app','roastery_app')),
  event_type       text not null default 'other'
                     check (event_type in ('production','receiving','qc','follow_up','other')),
  title            text not null check (btrim(title) <> ''),
  detail           text,
  occurred_at      timestamptz not null default now(),
  needs_attention  boolean not null default false,
  linked_task_id   uuid references mos.tasks(id) on delete set null,
  archived_at      timestamptz,
  created_by       uuid not null references shared.people(id)
                     default shared.current_person_id(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table ops.log_entries is
  'Past-tense floor record; no owner/RACI/status (OD-P2-16). org-readable, author-or-manager write (OD-P2-19).';

create index log_entries_org_occurred_idx   on ops.log_entries (org_id, occurred_at desc);
create index log_entries_active_org_idx      on ops.log_entries (org_id, occurred_at desc)
  where archived_at is null;
create index log_entries_business_unit_idx   on ops.log_entries (org_id, business_unit_id);
create index log_entries_event_type_idx      on ops.log_entries (org_id, event_type);
create index log_entries_needs_attn_idx       on ops.log_entries (org_id, needs_attention)
  where needs_attention and archived_at is null;
create index log_entries_linked_task_idx      on ops.log_entries (linked_task_id)
  where linked_task_id is not null;

create trigger log_entries_set_updated_at
  before update on ops.log_entries
  for each row execute function shared.set_updated_at();

-- DOWN: drop table ops.log_entries;  (trigger + indexes drop with the table)
