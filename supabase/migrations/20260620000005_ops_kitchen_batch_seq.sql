-- P4 Kitchen Module — the per-(prefix, date) batch_id counter (KQ-5, FR-051). The approval RPC
-- INSERTs … ON CONFLICT (org, prefix, log_date) DO UPDATE SET last_n = last_n + 1 RETURNING last_n,
-- which atomically locks + increments + returns; it mints '<PREFIX>-YYYYMMDD-NNN'. The lock is held
-- for the sub-ms mint; the unique(batch_id) on kitchen_logs is the collision backstop.
create table ops.kitchen_batch_seq (
  org_id    uuid not null references shared.orgs(id) on delete cascade,
  prefix    text not null check (prefix in ('PR','TR','TB')),
  log_date  date not null,
  last_n    integer not null default 0,
  primary key (org_id, prefix, log_date)
);
comment on table ops.kitchen_batch_seq is
  'Per-(org, prefix, date) batch_id counter (FR-051). RPC upserts (locks + increments + returns), mints. Collision-safe.';

-- RLS enabled + FORCED with NO authenticated policy: only the SECURITY DEFINER approval RPC (which
-- runs as postgres, bypassing RLS) reads/writes the counter. The app tier has no grant and no
-- policy → cannot read or mint directly (the counter is an RPC-internal mechanism).
alter table ops.kitchen_batch_seq enable row level security;
alter table ops.kitchen_batch_seq force row level security;

-- DOWN: drop table ops.kitchen_batch_seq;
