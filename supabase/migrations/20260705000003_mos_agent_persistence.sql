-- mos.agent_threads / mos.agent_runs / mos.agent_events — the deputy's persisted transcript
-- (ADR-0018 D6 P2 §1 D1/D2, ADR-0017 D10 observability). Adapted from the sibling internal
-- project's 0046_agent_persistence.sql; MOS deltas: schema-qualified `mos.*` (not `public.*`),
-- `org_id default shared.current_org_id()` / `owner_id default shared.current_person_id()`
-- (NOT PMO's `auth_org_id()`/`auth.uid()`/`profiles(id)` — MOS has no profiles table; owner_id
-- references shared.people(id) directly), no seed-org fallback (MOS has real orgs from day 1),
-- policies use `shared.current_org_id()`/`shared.current_person_id()` (P1 mos.user_views pattern:
-- org-gate on EVERY branch, WITH CHECK pinning on every write branch). Threads/runs/events are the
-- OWNER's alone in P2 — NO manager-share, NO admin cross-owner read (ADR-0017 D2/D10; FR-P2-PS-004).
-- Reversibility (pre-production): `supabase db reset`. Manual rollback at file foot (per-table, spelled
-- out — no "repeat above", per the standing DOWN-comment review note).

-- ── mos.agent_threads ──────────────────────────────────────────────────────────
-- One conversation container per deputy session. Title is a short caller-set or model-derived
-- label for the ThreadList (T27); nullable until the first turn names it.
create table mos.agent_threads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  owner_id    uuid not null references shared.people(id)
                default shared.current_person_id(),
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index mos_agent_threads_org_idx   on mos.agent_threads (org_id);
create index mos_agent_threads_owner_idx on mos.agent_threads (owner_id);

alter table mos.agent_threads enable row level security;
alter table mos.agent_threads force  row level security;

grant select, insert, update on mos.agent_threads to authenticated; -- no delete (append-only thread log)

-- SELECT: org-gate first, then owner-only (no shared_team — P2 has no manager-share, ADR-0017 D2).
create policy agent_threads_select on mos.agent_threads
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- INSERT: org + owner pinned to the caller (defaults + WITH CHECK; a browser holds a valid JWT +
-- anon key, so the post-image predicate is required, not optional — P1 user_views lesson).
create policy agent_threads_insert on mos.agent_threads
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- UPDATE: owner-only; org + owner re-pinned on the post-image (cannot reassign ownership/org).
create policy agent_threads_update on mos.agent_threads
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- ── mos.agent_runs ─────────────────────────────────────────────────────────────
-- One run per deputy turn-loop invocation within a thread. `route` carries the P2-slimmed
-- RunContext (route only — entity/selection are P3, plan §Phase E T21).
create table mos.agent_runs (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references mos.agent_threads(id) on delete cascade,
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  owner_id    uuid not null references shared.people(id)
                default shared.current_person_id(),
  status      text not null default 'running'
                check (status in ('running','needs-approval','completed','error','cancelled')),
  route       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index mos_agent_runs_thread_idx on mos.agent_runs (thread_id);
create index mos_agent_runs_org_idx    on mos.agent_runs (org_id);
create index mos_agent_runs_owner_idx  on mos.agent_runs (owner_id);

alter table mos.agent_runs enable row level security;
alter table mos.agent_runs force  row level security;

grant select, insert, update on mos.agent_runs to authenticated; -- no delete (append-only run log)

create policy agent_runs_select on mos.agent_runs
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create policy agent_runs_insert on mos.agent_runs
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- UPDATE: owner-only, status/route transitions (e.g. running -> needs-approval -> completed);
-- org + owner re-pinned on the post-image.
create policy agent_runs_update on mos.agent_runs
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- ── mos.agent_events ───────────────────────────────────────────────────────────
-- The replayable transcript: every assistant/tool/status/system event, seq-ordered per run
-- (FR-P2-PS-003). Tool-call journal columns (tool_name/tool_args_hash/tool_status) land in the
-- SAME insert as the tool event row (FR-P2-OB-001, D10 observability seam) — never a second write.
create table mos.agent_events (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references mos.agent_runs(id) on delete cascade,
  org_id             uuid not null references shared.orgs(id) on delete cascade
                       default shared.current_org_id(),
  owner_id           uuid not null references shared.people(id)
                       default shared.current_person_id(),
  seq                integer not null,
  type               text not null check (type in ('assistant','tool','status','system')),
  text               text,
  payload            jsonb not null default '{}'::jsonb,
  tool_name          text,
  tool_args_hash     text,
  tool_status        text check (tool_status in ('pending','completed','errored')),
  rating             text check (rating in ('up','down')),
  downvote_reason    text,
  created_at         timestamptz not null default now(),
  constraint agent_events_run_seq_uk unique (run_id, seq)
);

create index mos_agent_events_run_idx   on mos.agent_events (run_id, seq);
create index mos_agent_events_org_idx   on mos.agent_events (org_id);
create index mos_agent_events_owner_idx on mos.agent_events (owner_id);

alter table mos.agent_events enable row level security;
alter table mos.agent_events force  row level security;

grant select, insert, update on mos.agent_events to authenticated; -- no delete (append-only)

-- SELECT: org-gate first, then owner-only. NO admin cross-owner read policy (FR-P2-PS-004) —
-- the deputy transcript is the owner's alone, even to same-org admin.
create policy agent_events_select on mos.agent_events
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create policy agent_events_insert on mos.agent_events
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- UPDATE: owner-only, org/owner re-pinned; the column-pin trigger below narrows this further to a
-- feedback-only mutation (rating/downvote_reason) on the owner's own type='assistant' row.
create policy agent_events_update on mos.agent_events
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- ── agent_events_feedback_only guard trigger (FR-P2-PS-002) ───────────────────────────────────
-- RLS's WITH CHECK cannot compare OLD vs NEW (P1 ops._guard_log_entry lesson) so the append-only
-- + narrow-feedback-exception invariant is enforced here: any UPDATE that changes a column OTHER
-- than rating/downvote_reason is rejected (42501), and even the feedback columns may only be
-- touched on the owner's own type='assistant' row (a tool/status/system row is fully immutable).
create or replace function mos._guard_agent_event_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.run_id            is distinct from old.run_id
     or new.org_id         is distinct from old.org_id
     or new.owner_id       is distinct from old.owner_id
     or new.seq            is distinct from old.seq
     or new.type           is distinct from old.type
     or new.text           is distinct from old.text
     or new.payload        is distinct from old.payload
     or new.tool_name      is distinct from old.tool_name
     or new.tool_args_hash is distinct from old.tool_args_hash
     or new.tool_status    is distinct from old.tool_status
     or new.created_at     is distinct from old.created_at
  then
    raise exception 'agent_events is append-only: only rating/downvote_reason may be updated'
      using errcode = '42501';
  end if;

  if (new.rating is distinct from old.rating or new.downvote_reason is distinct from old.downvote_reason)
     and old.type is distinct from 'assistant'
  then
    raise exception 'feedback (rating/downvote_reason) may only be recorded on an assistant event'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
comment on function mos._guard_agent_event_update() is
  'Guard (FR-P2-PS-002): agent_events is append-only except rating/downvote_reason on the owner''s own type=assistant row; all other column drift raises 42501. SECURITY INVOKER.';

create trigger agent_events_feedback_only
  before update on mos.agent_events
  for each row execute function mos._guard_agent_event_update();

-- ── Manual rollback ───────────────────────────────────────────────────────────
-- drop trigger if exists agent_events_feedback_only on mos.agent_events;
-- drop function if exists mos._guard_agent_event_update();
-- drop policy if exists agent_events_update on mos.agent_events;
-- drop policy if exists agent_events_insert on mos.agent_events;
-- drop policy if exists agent_events_select on mos.agent_events;
-- alter table mos.agent_events disable row level security;
-- drop index if exists mos_agent_events_owner_idx;
-- drop index if exists mos_agent_events_org_idx;
-- drop index if exists mos_agent_events_run_idx;
-- drop table if exists mos.agent_events;
--
-- drop policy if exists agent_runs_update on mos.agent_runs;
-- drop policy if exists agent_runs_insert on mos.agent_runs;
-- drop policy if exists agent_runs_select on mos.agent_runs;
-- alter table mos.agent_runs disable row level security;
-- drop index if exists mos_agent_runs_owner_idx;
-- drop index if exists mos_agent_runs_org_idx;
-- drop index if exists mos_agent_runs_thread_idx;
-- drop table if exists mos.agent_runs;
--
-- drop policy if exists agent_threads_update on mos.agent_threads;
-- drop policy if exists agent_threads_insert on mos.agent_threads;
-- drop policy if exists agent_threads_select on mos.agent_threads;
-- alter table mos.agent_threads disable row level security;
-- drop index if exists mos_agent_threads_owner_idx;
-- drop index if exists mos_agent_threads_org_idx;
-- drop table if exists mos.agent_threads;
