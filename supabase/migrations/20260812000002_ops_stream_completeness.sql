-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Bar capture 8/8 — per-stream completeness confirmation (#238, FR-031, OD-WAY-47).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Spec: docs/specs/bar-capture.spec.md — FR-031; Implementation Decision "Completeness
-- confirmation". Two roles, neither sufficient alone (OD-WAY-47): procurement/ops-support records
-- an item-unit's ERP COORDINATES and confirms them (FR-030, ops.item_units, migration ...0807000001),
-- and the stream's own supervisor/lead confirms that the stream's ITEM LIST IS COMPLETE — that the
-- things their people actually make are all on the form.
--
-- THIS GATES NOTHING STRUCTURALLY, AND THAT IS THE DESIGN. DD-WAY-29's coordinate gate already
-- decides which rows appear on any capture form (ops.capture_form_items), and NFR-004 wants that
-- gate to stay a query predicate with nothing to bypass. Completeness is the OTHER half: a record
-- that somebody with standing looked at the list and said "nothing of mine is missing". Its whole
-- value is that a stream's gaps become a TRACKED STATE with a name and a date on them, instead of
-- tribal knowledge held by whoever last noticed. So: no policy consults this table, no form query
-- joins it, nothing is refused for want of a row here. An unconfirmed stream is simply an
-- unconfirmed stream, visibly.
--
-- THE WRITE PREDICATE IS ops.can_review_stream (…0811000001), REUSED, NOT RE-DERIVED. FR-031 says
-- "the stream's supervisor/lead"; FR-040 already defines exactly that person on the server — a
-- supervisor whose live primary Team is the stream's Team — with ops_lead/admin as the cross-stream
-- fallback that keeps an unprovisioned stream from stalling (FR-041). Authoring a second predicate
-- for the same sentence is how two answers to one question drift apart; there is one predicate and
-- both slices gate on it.
--
-- DOWN (reversal, in order):
--   drop trigger stream_completeness_stamp on ops.stream_completeness;
--   drop function ops._stamp_stream_completeness();
--   drop table ops.stream_completeness;   -- drops its policies and indexes with it

-- ── The table ────────────────────────────────────────────────────────────────────────────────
-- ONE ROW PER STREAM, re-confirmable in place, deliberately NOT an append-only event log. What
-- the surfaces and the spec ask is "is this stream's list confirmed, by whom, as of when" — a
-- current state, singular, and a unique key makes the answer unambiguous by construction rather
-- than by an ORDER BY … LIMIT 1 every reader must remember to write. The history of past
-- confirmations is not a stated need (FR-031 asks for the fact, not its succession), and inventing
-- an event table for it would be speculative shape. Re-confirming overwrites who/when, which is
-- what "as of when" means.
create table ops.stream_completeness (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references shared.orgs(id) on delete cascade,
  -- The stream, in the ONLY form this codebase has one: the denormalised (branch_id, activity)
  -- pair (Implementation Decision "No new stream table"). Same shape as the pair on kitchen_logs,
  -- kitchen_plans, kitchen_stock and shared.teams.
  branch_id    uuid not null,
  activity     text not null,
  -- The confirmation event. Both columns are SERVER-STAMPED by ops._stamp_stream_completeness
  -- below — a client-supplied who/when is overridden, never stored, exactly as the item-unit
  -- confirmation is (…0807000001). NOT NULL on both halves, unlike item_units': that table
  -- backfilled system-migrated rows with no human confirmer, and this one never does. A
  -- completeness confirmation with nobody attached to it is the tribal knowledge this record
  -- exists to replace, so it is made unrepresentable. The FK therefore carries NO delete action
  -- (NO ACTION = restrict): a person row cannot be deleted out from under a confirmation, which
  -- is consistent with ops' no-hard-delete posture anyway.
  confirmed_by uuid not null references shared.people(id),
  confirmed_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint stream_completeness_stream_uk unique (org_id, branch_id, activity),
  -- The same-org seam, declaratively, via the composite FK shared.teams uses for its own branch
  -- link. A plain existence FK would accept another org's branch and need a guard arm; this one
  -- refuses it as a foreign key.
  constraint stream_completeness_branch_same_org_fkey
    foreign key (org_id, branch_id) references shared.branches (org_id, id)
);
comment on table ops.stream_completeness is
  'Per-stream completeness confirmation (FR-031, OD-WAY-47): the stream''s supervisor/lead records '
  'that their (branch, activity) stream''s item list is complete — stream + who + when. Distinct '
  'from and after the per-item-unit COORDINATE confirmation (ops.item_units, FR-030): two roles, '
  'neither sufficient alone. GATES NOTHING — DD-WAY-29''s query predicate already decides which '
  'rows reach a capture form (NFR-004); this exists so a stream''s gaps are a tracked state rather '
  'than tribal knowledge. One row per stream, re-confirmable in place.';
comment on column ops.stream_completeness.confirmed_by is
  'Server-stamped from the session (shared.current_person_id()); a client-supplied value is '
  'overridden. NOT NULL — an unattributed completeness claim is the very thing this record '
  'replaces.';
comment on column ops.stream_completeness.confirmed_at is
  'Server-stamped as now() on every write, including a re-confirmation. "Complete AS OF when" is '
  'the whole fact; a stale confirmation is a visible stale date, never a silent one.';

create index stream_completeness_org_idx on ops.stream_completeness (org_id);

alter table ops.stream_completeness alter column org_id set default shared.current_org_id();

create trigger stream_completeness_set_updated_at
  before update on ops.stream_completeness
  for each row execute function shared.set_updated_at();

-- ── Guard / stamp ────────────────────────────────────────────────────────────────────────────
-- Three jobs, all of them refusals of things a plain column write would otherwise allow:
--
--   1. THE EVENT IS SERVER-STAMPED. confirmed_by := the session's person, confirmed_at := now(),
--      on INSERT and on UPDATE alike. Without this an ops_lead could file a confirmation under a
--      colleague's name or back-date one — provenance by convention rather than by structure.
--
--   2. THE ROW'S STREAM IS IMMUTABLE, as is its org. A confirmation belongs to the stream it was
--      made about. Re-pointing one (org_id/branch_id/activity) would move a lead's assertion onto
--      a stream they never looked at, and the write predicate authorised it against the OLD
--      stream — the same class of silent re-homing the kitchen-log decide freeze refuses.
--      Re-confirmation is an UPDATE of who/when, and only of who/when.
--
--   3. THE PAIR MUST BE A LIVE STREAM (FR-005, OD-WAY-42). The composite FK proves branch_id is a
--      branch of this org; it cannot prove the branch RUNS this activity. Roastery is a branch and
--      carries no production stream, deliberately and permanently — confirming "the roastery bar's
--      item list is complete" would record a fact about something that does not exist. The check
--      is a live stream Team, which IS the six-stream catalog (Implementation Decision "No new
--      stream table"), so it stays true if the catalog ever legitimately changes.
--
-- SECURITY INVOKER: shared.teams is org-readable under its own SELECT policy, so the lookup sees
-- the caller's own org and nothing else. Nothing here is authorization — the write predicate is
-- the RLS policies' ops.can_review_stream, below.
create or replace function ops._stamp_stream_completeness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity then
      raise exception 'a completeness confirmation belongs to its stream; record another stream''s in its own row'
        using errcode = '42501';
    end if;
  end if;
  if not exists (
    select 1
    from shared.teams t
    where t.org_id      = new.org_id
      and t.branch_id   = new.branch_id
      and t.activity    = new.activity
      and t.archived_at is null
  ) then
    raise exception '(branch, activity) is not a live production stream' using errcode = '23514';
  end if;
  new.confirmed_by := shared.current_person_id();
  new.confirmed_at := now();
  return new;
end;
$$;
comment on function ops._stamp_stream_completeness() is
  'Guard + stamp for ops.stream_completeness (FR-031): confirmed_by/confirmed_at are stamped from '
  'the session on INSERT and UPDATE, overriding anything the client sent; org_id, branch_id and '
  'activity are immutable — a confirmation belongs to its stream (42501); and the pair must be a '
  'LIVE STREAM TEAM, so the roastery (a branch with no production stream, OD-WAY-42) and any other '
  'non-stream pair cannot be confirmed at all (23514). SECURITY INVOKER.';

create trigger stream_completeness_stamp
  before insert or update on ops.stream_completeness
  for each row execute function ops._stamp_stream_completeness();

-- ── Grants + RLS ─────────────────────────────────────────────────────────────────────────────
-- No DELETE grant, in line with the whole of ops: a confirmation that was made is a fact that was
-- made. Un-confirming is not a stated need (FR-031 records the confirmation; the item list itself
-- is governed by DD-WAY-29), and if it ever becomes one it is a status column, not an erasure.
grant select, insert, update on ops.stream_completeness to authenticated;
grant select                 on ops.stream_completeness to service_role;

alter table ops.stream_completeness enable row level security;
alter table ops.stream_completeness force  row level security;

-- READ IS ORG-WIDE, deliberately. Whether a stream's list has been confirmed is exactly the thing
-- that must stop being tribal knowledge — scoping the read to the stream's own lead would rebuild
-- the silo this record exists to open. It also matches OD-WAY-49's posture everywhere else in this
-- chain: org-wide read, scoped WRITE.
create policy stream_completeness_select_org on ops.stream_completeness
  for select to authenticated
  using (org_id = shared.current_org_id());
comment on policy stream_completeness_select_org on ops.stream_completeness is
  'Org-readable: a stream''s completeness state — confirmed or not, by whom, when — is visible to '
  'the org. The point of the record is that the gap is not private (FR-031).';

-- WRITE IS ops.can_review_stream ON THE ROW'S OWN STREAM (…0811000001, FR-040/041) — the stream's
-- supervisor (live primary membership of that stream's Team) or ops_lead/admin. Reused, not
-- re-derived: FR-031's "the stream's supervisor/lead" and FR-040's stream reviewer are the same
-- sentence, and one predicate is how they stay the same answer.
create policy stream_completeness_insert_stream_lead on ops.stream_completeness
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and ops.can_review_stream(branch_id, activity));
comment on policy stream_completeness_insert_stream_lead on ops.stream_completeness is
  'A stream''s completeness is confirmed by that stream''s supervisor/lead — ops.can_review_stream '
  '(FR-031 via FR-040/041): the stream reviewer, or ops_lead/admin as the cross-stream fallback. '
  'A supervisor of ANOTHER stream is refused, as is a member of this one.';

create policy stream_completeness_update_stream_lead on ops.stream_completeness
  for update to authenticated
  using (org_id = shared.current_org_id()
         and ops.can_review_stream(branch_id, activity))
  with check (org_id = shared.current_org_id()
              and ops.can_review_stream(branch_id, activity));
comment on policy stream_completeness_update_stream_lead on ops.stream_completeness is
  'Re-confirmation is an UPDATE, held to the same predicate as the first confirmation. USING and '
  'WITH CHECK cannot disagree: the stream columns are immutable (ops._stamp_stream_completeness), '
  'so the row''s stream is the same one on both sides.';
