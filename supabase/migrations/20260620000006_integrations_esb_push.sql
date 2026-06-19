-- P4 Kitchen Module — Module-agnostic ESB outbox (ADR-0012 D1, FR-070/072). One row per batch;
-- unique dedup_key is the central double-post guard (AC-008). App tier (ops_lead) may READ its
-- org's rows; ONLY the worker/service role writes posting state (AC-007). The RPC enqueues
-- (inserts a 'pending' row); the worker (a later plan) transitions pending→posted/failed and stamps
-- posted_at — so the worker MUTATES this row, hence updated_at + the set_updated_at trigger (C3).
create table integrations.esb_push (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade
                   default shared.current_org_id(),
  source_module  text not null default 'kitchen'
                   check (source_module in ('kitchen','roastery')),
  source_ref     text not null,
  endpoint       text not null check (endpoint in ('assembly-actual','simple-transfer','noop')),
  payload        jsonb not null default '{}'::jsonb,
  target_env     text not null default 'dry_run'
                   check (target_env in ('goo','gkid','dry_run')),
  dedup_key      text not null,
  status         text not null default 'pending'
                   check (status in ('pending','in_flight','posted','failed','dead_letter')),
  retry_count    integer not null default 0,
  last_error     text,
  esb_doc_num    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  posted_at      timestamptz,
  unique (dedup_key)
);
comment on table integrations.esb_push is
  'Module-agnostic ESB outbox (ADR-0012, FR-070). One row/batch. Unique dedup_key = (source_module, source_ref, target_env) — the double-post guard (AC-008). The worker mutates status/posted_at → has updated_at + set_updated_at trigger.';

create index esb_push_pending_idx on integrations.esb_push (status, created_at) where status in ('pending','failed');
create index esb_push_org_idx     on integrations.esb_push (org_id, created_at desc);

-- The worker flips status/posted_at on this row, so it carries updated_at and the standard trigger
-- (C3: shared.set_updated_at() writes new.updated_at — the column must exist or every UPDATE raises
-- "record new has no field updated_at"; the pending→posted flip is exactly such an UPDATE).
create trigger esb_push_set_updated_at
  before update on integrations.esb_push
  for each row execute function shared.set_updated_at();

-- Base privileges. SELECT to authenticated (RLS: ops_lead/admin read own org). The RPC enqueues via
-- SECURITY DEFINER (runs as postgres internally). NO insert/update to authenticated for posting
-- state (AC-007: only the worker/service role flips posted/esb_doc_num).
grant select on integrations.esb_push to authenticated;

alter table integrations.esb_push enable row level security;
alter table integrations.esb_push force row level security;
-- AC-007: ops_lead/admin READ their org's push rows; nobody else.
create policy esb_push_select_ops on integrations.esb_push
  for select to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
-- (No INSERT/UPDATE policy for authenticated → the app tier cannot write posting state. The RPC's
--  enqueue and the worker's status flips run as service_role/postgres, bypassing RLS. AC-007.)

-- DOWN: drop policy esb_push_select_ops on integrations.esb_push;
--       drop table integrations.esb_push cascade;
