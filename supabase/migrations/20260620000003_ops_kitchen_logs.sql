-- P4 Kitchen Module — the core fact table (ADR-0012, FR-020..024). One row per submitted line;
-- increment semantics (FR-021) — a new log inserts a new row, never overwrites. status transitions
-- Submitted→Approved/Rejected are RLS+guard-gated (RLS migration). batch_id set at approval (FR-050).
-- ESB-posting history mirrored from the outbox for audit (posted_to_esb/esb_doc_num/posted_at).
create table ops.kitchen_logs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references shared.orgs(id) on delete cascade
                    default shared.current_org_id(),
  business_unit_id uuid not null references shared.business_units(id),
  log_date        date not null,
  action_type     text not null check (action_type in ('Production','Transfer to Bungur','Transfer to Radiant')),
  wip_item_id     uuid not null references ops.wip_items(id) on delete restrict,
  qty_porsi       numeric(12,2) not null check (qty_porsi > 0),
  notes           text,
  status          text not null default 'Submitted'
                    check (status in ('Submitted','Approved','Rejected')),
  submitted_by    uuid not null references shared.people(id) on delete set null
                    default shared.current_person_id(),
  review_note     text,
  reviewed_by     uuid references shared.people(id) on delete set null,
  reviewed_at     timestamptz,
  batch_id        text unique,
  posted_to_esb   boolean not null default false,
  esb_doc_num     text,
  posted_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table ops.kitchen_logs is
  'Kitchen fact table (FR-020). Increment semantics (FR-021). Submitted until RLS-gated approval (FR-024/044).';

create index kitchen_logs_org_date_idx   on ops.kitchen_logs (org_id, log_date);
create index kitchen_logs_org_status_idx on ops.kitchen_logs (org_id, status);
create index kitchen_logs_item_date_idx  on ops.kitchen_logs (org_id, wip_item_id, log_date);

create trigger kitchen_logs_set_updated_at
  before update on ops.kitchen_logs
  for each row execute function shared.set_updated_at();

-- Base privileges: SELECT to authenticated (RLS filters org); INSERT to authenticated (member inserts
-- own Submitted); UPDATE to authenticated (RLS gates the status transition). NO DELETE (NFR-002).
grant select, insert, update on ops.kitchen_logs to authenticated;

-- DOWN: drop table ops.kitchen_logs cascade;
