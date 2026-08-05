-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Bar capture 6/8 — per-stream review with ops-lead fallback (#236, FR-040..043, NFR-002).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A STREAM REVIEWER is a person holding the supervisor access role whose LIVE PRIMARY Team is the
-- row's stream Team (FR-040, OD-WAY-48). This migration puts that predicate on the server, where
-- NFR-002 demands it live: the kitchen-log guard, the UPDATE policy's reviewer arm, and the
-- approval RPC all consult it — supervisor-on-their-own-stream OR ops_lead OR admin, so a stream
-- can decide its own rows and no stream is ever stranded waiting for one (FR-041's fallback).
--
-- "LIVE PRIMARY" is DELIBERATELY the same predicate as shared.default_stream() (...0806000001):
-- is_primary AND effective_from <= today AND effective_to IS NULL — the predicate of the
-- one-live-primary unique index, so at most one candidate team exists BY INDEX. A person whose
-- membership has ended, not yet started, or carries a future end date reviews nothing as a
-- supervisor; the ops-lead fallback is the honest path for a hand-over week, exactly as a missing
-- capture default falls back to an explicit choice.
--
-- THE STREAM STAYS A DEFAULT, NEVER A WALL, FOR MEMBERS (OD-WAY-49/31): no member read or write
-- predicate consults the stream — the org-wide SELECT policy and the submitter's own-row UPDATE
-- arm are untouched. The stream appears in the REVIEWER predicate only, which is the one place
-- FR-040 wants it.
--
-- Also here (FR-043, AC-010): the incumbent's ordering gate — transfer approvals wait for the
-- day's production to be reviewed — becomes a SERVER rule, per stream. It was page logic computed
-- over every Submitted row of the day, which both (a) let a direct approval skip it entirely and
-- (b) would let one stream's backlog freeze every other stream's transfers the moment two streams
-- capture at once. Now: a transfer approval for a stream/day is refused (P0004) while ANY of that
-- stream/day's production rows is still Submitted; a decided row — Approved or Rejected — clears
-- its lock; another stream's pending rows never lock this one.
--
-- DOWN (reversal, in order):
--   drop policy kitchen_logs_update_own_or_reviewer on ops.kitchen_logs;
--     re-create it exactly as in 20260805000010 (submitter's own Submitted rows OR ops_lead/admin,
--     same USING and WITH CHECK);
--   re-run `create or replace function ops._guard_kitchen_log()` from 20260805000010 (drops the
--     stream-reviewer arm and the P0004 gate);
--   re-run `create or replace function ops.approve_kitchen_log(uuid, text)` from 20260805000013
--     (with its revoke/grant pair);
--   drop function ops.can_review_stream(uuid, text);
--   drop function ops.is_stream_reviewer(uuid, text);

-- ── The stream-reviewer predicate (FR-040) ───────────────────────────────────────────────────
-- SECURITY INVOKER with EXPLICIT person/org scoping, and the explicitness is load-bearing twice
-- over. Called from a policy or the guard on a plain reviewer UPDATE, it runs as the caller and
-- RLS already scopes the directory reads — the filters are then merely redundant. Called from
-- inside ops.approve_kitchen_log, which runs as the function owner, RLS is NOT in effect — the
-- filters are then the only thing keeping one org's membership from authorising a decision in
-- another. Same pattern as the ops read helpers (...0011): scope explicitly, never lean on the
-- execution context.
create or replace function ops.is_stream_reviewer(p_branch_id uuid, p_activity text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.has_access_role('supervisor')
     and exists (
       select 1
       from shared.team_memberships m
       join shared.teams t
         on t.id = m.team_id
        and t.archived_at is null
       where m.person_id = shared.current_person_id()
         and m.org_id    = shared.current_org_id()
         and t.org_id    = shared.current_org_id()
         and m.is_primary
         and m.effective_from <= current_date
         and m.effective_to is null
         and t.branch_id = p_branch_id
         and t.activity  = p_activity
     )
$$;
comment on function ops.is_stream_reviewer(uuid, text) is
  'True iff the caller is the STREAM REVIEWER for (p_branch_id, p_activity): supervisor access '
  'role AND live primary membership of that stream''s Team (FR-040, OD-WAY-48). LIVE PRIMARY is '
  'deliberately shared.default_stream()''s predicate — is_primary AND started AND open-ended — '
  'the same shape the one-live-primary unique index polices, so at most one candidate team exists '
  'by index. Explicitly person/org-scoped so it stays correct inside the definer approval RPC, '
  'where RLS does not apply. Consulted by the reviewer predicate ONLY — never by a member '
  'read/write policy (OD-WAY-49).';
grant execute on function ops.is_stream_reviewer(uuid, text) to authenticated;

-- The full review-authority predicate: the stream's own reviewer, or the cross-stream fallback.
create or replace function ops.can_review_stream(p_branch_id uuid, p_activity text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.has_access_role('ops_lead')
      or shared.has_access_role('admin')
      or ops.is_stream_reviewer(p_branch_id, p_activity)
$$;
comment on function ops.can_review_stream(uuid, text) is
  'Review authority over one (branch, activity) stream: its stream reviewer (FR-040), or '
  'ops_lead/admin as the cross-stream fallback that keeps an unprovisioned stream from stalling '
  '(FR-041, OD-WAY-48). The single predicate the kitchen-log guard and the approval RPC gate on.';
grant execute on function ops.can_review_stream(uuid, text) to authenticated;

-- ── The guard, re-authored (a re-authored guard is a NEW contract — ops_08/ops_12 prove it
--    fail-closed fresh). Two arms change; every other carried invariant is verbatim ...0010. ────
--   1. The status-transition gate goes from ops_lead/admin to can_review_stream on the ROW'S OWN
--      stream (old.branch_id/old.activity — immutable through review, frozen below).
--   2. NEW: the per-stream ordering gate (FR-043). On Submitted→Approved of a TRANSFER, refuse
--      (P0004) while the same stream/day still has Submitted production. Approve normally travels
--      through ops.approve_kitchen_log, which raises the same refusal before minting anything —
--      this arm is the defense in depth that keeps the rule true on the direct-UPDATE path an
--      ops_lead also holds. Reject is deliberately NOT gated: FR-043 locks transfer APPROVALS,
--      and a rejected production row is a decided one.
create or replace function ops._guard_kitchen_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_wip_org  uuid;
  v_br_org   uuid;
  v_dest_org uuid;
  v_sub_org  uuid;
  v_rev_org  uuid;
begin
  -- 20260620000008: submitted_by is immutable post-insert — a log cannot be re-attributed.
  if tg_op = 'UPDATE' and new.submitted_by is distinct from old.submitted_by then
    raise exception 'submitted_by is immutable' using errcode = '42501';
  end if;
  -- 20260620000008: org_id is immutable post-insert (prevents cross-org re-homing on UPDATE).
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- OD-WAY-38: `source` is provenance and never changes. Without this a member could relabel
  -- their own MOS row as imported history, or an imported row as MOS-authored.
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'source is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- 20260620000008, re-gated for #236: EVERY status transition is a reviewer action, and the
  -- reviewer for a row is now decided BY THE ROW'S STREAM (FR-040): its stream reviewer —
  -- supervisor whose live primary Team is this stream's Team — or ops_lead/admin as the
  -- cross-stream fallback (FR-041). Keyed on OLD's stream: the stream columns are frozen through
  -- review by the re-target rule below, so OLD and NEW cannot disagree here.
  --
  -- Review stays ONE-WAY: Approved and Rejected are terminal for the app tier, and a correction
  -- is recorded as a new log (unchanged from ...0010 — see that header for the reasoning).
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not ops.can_review_stream(old.branch_id, old.activity) then
      raise exception 'only the stream''s supervisor or ops_lead/admin may approve or reject a kitchen log'
        using errcode = '42501';
    end if;
    if old.status <> 'Submitted' then
      raise exception 'a reviewed kitchen log keeps its status; record a correction as a new log'
        using errcode = '42501';
    end if;
    -- #236 review finding: THE DECIDE FREEZE. A status transition may change the status and the
    -- review fields — nothing else. Without this, the freeze below (Submitted→Submitted only)
    -- left a decide free to re-home the row's facts in the same statement: the transition was
    -- authorised against the OLD stream while WITH CHECK validated the NEW one, so a reject could
    -- carry branch_id/qty/date changes nobody authorised. Approve's legitimate stamps
    -- (reviewed_by/reviewed_at/review_note/batch_id) are set by the RPC — which by construction
    -- carries NO caller fields (it takes a log id and a note) — and reject's are stamped below;
    -- neither touches the columns listed here, so this arm fires on both paths purely as the
    -- refusal it is. qty and the submitter's note are included deliberately: a reviewer
    -- "correcting" a figure while deciding it is the same silent-rewrite class — a correction is
    -- a new log (or a pre-decision edit the submitter can see), never a side effect of a decision.
    if new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date
       or new.qty_porsi is distinct from old.qty_porsi
       or new.notes is distinct from old.notes then
      raise exception 'a decision changes only the status and the review fields; the log''s facts are frozen'
        using errcode = '42501';
    end if;
  end if;
  -- NEW (#236, FR-043/AC-010): the per-stream ordering gate. The incumbent's rule — transfers
  -- wait for the day's production count to be reviewed, because an approved transfer of WIP whose
  -- production is later rejected has moved stock that was never confirmed to exist — kept, but
  -- keyed on the ROW'S OWN stream and day. Only Submitted production locks; a decided row
  -- (Approved OR Rejected) has been looked at, which is all the ordering ever asked for.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Approved'
     and new.action = 'transfer' then
    if exists (
      select 1 from ops.kitchen_logs l
       where l.org_id    = new.org_id
         and l.branch_id = new.branch_id
         and l.activity  = new.activity
         and l.log_date  = new.log_date
         and l.action    = 'produce'
         and l.status    = 'Submitted'
    ) then
      raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
        using errcode = 'P0004';
    end if;
  end if;
  -- 20260620000012: Submitted→Rejected stamps reviewer provenance server-side (FR-044). Reject is a
  -- plain guarded UPDATE and the client sends only status + review_note, so reviewed_by/reviewed_at
  -- are attributed here. Approve is left to the approval function, which sets them explicitly, so
  -- this stamp deliberately does NOT fire on →Approved.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Rejected' then
    new.reviewed_by := shared.current_person_id();
    new.reviewed_at := now();
  end if;
  -- 20260620000008, extended: a Submitted→Submitted UPDATE that re-targets the row is forbidden —
  -- it would alter the day's actuals silently. The prior chains froze action_type/wip_item/log_date;
  -- the stream and movement columns that replaced action_type are frozen with them.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Submitted' then
    if new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date then
      raise exception 'the production stream, movement, wip item and date are immutable on a Submitted log'
        using errcode = '42501';
    end if;
  end if;
  -- 20260620000008: SAME-ORG FK seam. business_unit_id and wip_item_id are existence-only FKs and FK
  -- lookups bypass RLS, so a member could reference a foreign-org row. Under INVOKER RLS a same-org
  -- reference is visible and a cross-org one is not, so the lookup returns NULL and raises 23514.
  --
  -- EVERY arm below is guarded on `is not null`, and that is deliberate rather than defensive. A
  -- BEFORE ROW trigger runs before NOT NULL is checked, so an unguarded lookup on a missing value
  -- would report a same-org violation (23514) for what is actually a missing required column
  -- (23502) — the guard would pre-empt the more fundamental rule and give the wrong diagnosis.
  -- AC-007 depends on this: a log written without a stream must be refused BY the NOT NULL column,
  -- so the refusal survives any later change to this guard.
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  if new.wip_item_id is not null then
    select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
    if v_wip_org is distinct from new.org_id then
      raise exception 'wip_item_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  -- branch_id and destination_branch_id are the same class of existence-only FK, into a catalog
  -- that is itself org-scoped.
  if new.branch_id is not null then
    select b.org_id into v_br_org from shared.branches b where b.id = new.branch_id;
    if v_br_org is distinct from new.org_id then
      raise exception 'branch_id must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.destination_branch_id is not null then
    select b.org_id into v_dest_org from shared.branches b where b.id = new.destination_branch_id;
    if v_dest_org is distinct from new.org_id then
      raise exception 'destination_branch_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  -- The two PEOPLE references, held to the same rule as the four above (see ...0010 for why both
  -- arms are null-guarded).
  if new.submitted_by is not null then
    select p.org_id into v_sub_org from shared.people p where p.id = new.submitted_by;
    if v_sub_org is distinct from new.org_id then
      raise exception 'submitted_by must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.reviewed_by is not null then
    select p.org_id into v_rev_org from shared.people p where p.id = new.reviewed_by;
    if v_rev_org is distinct from new.org_id then
      raise exception 'reviewed_by must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_log() is
  'Guard (folds 20260620000008 + 20260620000012; #236 re-gates review per stream): '
  'Submitted→Approved/Rejected is the row''s stream reviewer — supervisor with live primary '
  'membership of the row''s stream Team — or ops_lead/admin (FR-040/041, 42501); a decide changes '
  'only the status and the review fields — the movement, stream, item, date, qty and submitter '
  'note are frozen through every status transition (42501); a transfer''s Submitted→Approved is '
  'refused while the same stream/day has Submitted production (FR-043, P0004); Submitted→Rejected '
  'stamps reviewed_by/reviewed_at; submitted_by, org_id and source are immutable, as is the row''s '
  'identity on a Submitted→Submitted edit (42501); business_unit_id, wip_item_id, branch_id, '
  'destination_branch_id, submitted_by and reviewed_by must be same-org (23514). SECURITY INVOKER.';

-- The trigger itself is unchanged and keeps firing this re-authored function; not re-created.

-- ── The UPDATE policy grows the stream-reviewer arm ──────────────────────────────────────────
-- Reject travels as a plain guarded UPDATE, so a stream reviewer needs UPDATE visibility of their
-- stream's Submitted rows or the guard never even runs — RLS would silently match zero rows. The
-- arm is scoped by BOTH terms, like the submitter's: their own stream's rows, and only while
-- Submitted — a stream reviewer decides pending rows and edits nothing decided (ops_lead/admin
-- keep review-edit at any status, unchanged). WITH CHECK deliberately admits only Submitted
-- (pre-decision edit, e.g. a qty fix) and Rejected (the decision itself) for this arm: →Approved
-- must travel through ops.approve_kitchen_log, which is what mints the batch and enqueues the
-- push, so a supervisor's direct UPDATE to Approved fails closed here even though the guard's
-- role arm would allow the transition.
--
-- This is a REVIEWER predicate carrying the stream, not a member policy growing one: the member
-- arms are byte-identical to ...0010 (OD-WAY-49 holds — members' reads and writes never consult
-- the stream).
drop policy kitchen_logs_update_own_or_reviewer on ops.kitchen_logs;
create policy kitchen_logs_update_own_or_reviewer on ops.kitchen_logs
  for update to authenticated
  using (
    org_id = shared.current_org_id()
    and ((submitted_by = shared.current_person_id() and status = 'Submitted')
         or shared.has_access_role('ops_lead')
         or shared.has_access_role('admin')
         or (ops.is_stream_reviewer(branch_id, activity) and status = 'Submitted')))
  with check (
    org_id = shared.current_org_id()
    and ((submitted_by = shared.current_person_id() and status = 'Submitted')
         or shared.has_access_role('ops_lead')
         or shared.has_access_role('admin')
         or (ops.is_stream_reviewer(branch_id, activity) and status in ('Submitted','Rejected'))));
comment on policy kitchen_logs_update_own_or_reviewer on ops.kitchen_logs is
  'Non-privileged edits are scoped to the submitter''s own rows AND to the period before review; '
  'ops_lead/admin retain review-edit at any status; #236 adds the stream reviewer — supervisor '
  'with live primary membership of the row''s stream Team — over their own stream''s Submitted '
  'rows, whose WITH CHECK admits Submitted or Rejected but never Approved: approval travels '
  'through the RPC that mints the batch. submitted_by is immutable post-insert '
  '(ops._guard_kitchen_log), so USING and WITH CHECK cannot disagree on the member arm. An '
  'imported row has a NULL submitted_by and therefore matches no member.';

-- ── The approval RPC, re-authored on the same two predicates ─────────────────────────────────
-- Verbatim ...0013 except: guard (4) gates on ops.can_review_stream (FR-040/041) instead of the
-- bare role pair, and a NEW guard (5) applies the per-stream ordering gate (FR-043) — BEFORE the
-- batch mint, so a refused transfer leaves no trace of any kind, not even a consumed sequence
-- number. The carried guard ORDER stays: not-found (P0002) → foreign org (42501) → not Submitted
-- (P0003) → missing authority (42501) → ordering gate (P0004). See ...0013's header for why org
-- precedes role and status precedes role; the ordering gate comes last because whether a transfer
-- is locked is stream state a caller with no authority over the stream has no business learning.
create or replace function ops.approve_kitchen_log(p_log_id uuid, p_review_note text)
returns text  -- the minted batch_id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log       ops.kitchen_logs;
  v_wip       ops.wip_items;
  v_prefix    text;
  v_next_n    integer;
  v_batch_id  text;
  v_endpoint  text;
  v_payload   jsonb;
  v_target    text;
  v_dedup     text;
  v_stock_qty numeric(12,2);
  v_branch_code text;
  v_dest_code   text;
begin
  -- (1) load and LOCK the log row. The lock is what makes the rest atomic against a second approver.
  select * into v_log from ops.kitchen_logs where id = p_log_id for update;

  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;

  -- (2) CARRIED. Cross-tenant guard, before the authority check and before any write.
  if v_log.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot approve a log outside your org' using errcode = '42501';
  end if;

  -- (3) CARRIED. AC-013 and one of DD-WAY-20's two structural re-POST protections: an imported
  -- row lands Approved, so it cannot be approved again, so it never gets an outbox row.
  if v_log.status <> 'Submitted' then
    raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003';
  end if;

  -- (4) #236 (FR-040/041): the row's stream decides its reviewer. Its stream reviewer — a
  -- supervisor whose live primary Team is this stream's Team — or ops_lead/admin as the
  -- cross-stream fallback. Defense in depth with ops._guard_kitchen_log's transition arm, stated
  -- here as well because this function is the single audited approval point.
  if not ops.can_review_stream(v_log.branch_id, v_log.activity) then
    raise exception 'only the stream''s supervisor or ops_lead/admin may approve' using errcode = '42501';
  end if;

  -- (5) #236 (FR-043/AC-010): the per-stream ordering gate, BEFORE the mint — a refused transfer
  -- consumes nothing. Only Submitted production of THIS stream and day locks; Approved and
  -- Rejected rows are decided; other streams never lock this one. Same refusal, same code, as the
  -- guard's arm — whichever path a transfer approval takes, it reads the same.
  if v_log.action = 'transfer' and exists (
    select 1 from ops.kitchen_logs l
     where l.org_id    = v_log.org_id
       and l.branch_id = v_log.branch_id
       and l.activity  = v_log.activity
       and l.log_date  = v_log.log_date
       and l.action    = 'produce'
       and l.status    = 'Submitted'
  ) then
    raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
      using errcode = 'P0004';
  end if;

  -- (6) mint the batch id (FR-050/051). The prefix is DERIVED (...0011) — PR/TR/TB is a counter
  -- namespace, not a stored action type, and no fact row keeps it.
  v_prefix := ops.kitchen_batch_prefix(v_log.action, v_log.branch_id, v_log.destination_branch_id);

  insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
  values (v_log.org_id, v_prefix, v_log.log_date, 1)
  on conflict (org_id, prefix, log_date) do update
    set last_n = ops.kitchen_batch_seq.last_n + 1
  returning last_n into v_next_n;

  v_batch_id := v_prefix || '-' || to_char(v_log.log_date, 'YYYYMMDD') || '-'
                || lpad(v_next_n::text, 3, '0');

  -- (7) flip to Approved with reviewer provenance. ops._guard_kitchen_log does NOT stamp reviewer
  -- fields on →Approved precisely because this path sets them explicitly. The decide freeze holds
  -- here twice over: this function takes a log id and a note — no caller field can reach the row —
  -- and the guard fires on this very UPDATE, so even a rewritten body could not carry an identity,
  -- qty or note change through an approval.
  update ops.kitchen_logs
     set status      = 'Approved',
         reviewed_by = shared.current_person_id(),
         reviewed_at = now(),
         review_note = p_review_note,
         batch_id    = v_batch_id
   where id = p_log_id;

  -- (8) recompute the stored end-of-day balance (FR-060/062), SCOPED TO THE PRODUCTION STREAM
  -- (OD-WAY-28). Sign convention unchanged: a produce adds, a transfer subtracts whatever its
  -- destination. Negatives are preserved rather than clamped (FR-061).
  select coalesce(sum(
    case when l.action = 'produce' then l.qty_porsi else -l.qty_porsi end
  ), 0)::numeric(12,2)
    into v_stock_qty
    from ops.kitchen_logs l
   where l.org_id      = v_log.org_id
     and l.wip_item_id = v_log.wip_item_id
     and l.branch_id   = v_log.branch_id
     and l.activity    = v_log.activity
     and l.log_date    = v_log.log_date
     and l.status      = 'Approved';

  insert into ops.kitchen_stock (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
  values (v_log.org_id, v_log.log_date, v_log.wip_item_id, v_log.branch_id, v_log.activity, v_stock_qty)
  on conflict (org_id, log_date, wip_item_id, branch_id, activity) do update
    set usable_qty = excluded.usable_qty, updated_at = now();

  -- (9) enqueue exactly one outbox row (FR-070). This is the only place in the baseline that writes
  -- integrations.esb_push, which is what makes DD-WAY-20's first structural protection true.
  select * into v_wip from ops.wip_items where id = v_log.wip_item_id;
  select b.code into v_branch_code from shared.branches b where b.id = v_log.branch_id;
  select b.code into v_dest_code   from shared.branches b where b.id = v_log.destination_branch_id;

  v_endpoint := ops.esb_endpoint_for(v_log.action, v_log.branch_id, v_log.destination_branch_id);

  v_payload := jsonb_build_object(
    'batch_id',                    v_batch_id,
    'log_date',                    v_log.log_date,
    'wip_item_id',                 v_log.wip_item_id,
    'esb_bom_id',                  v_wip.esb_bom_id,
    'esb_product_detail_id_porsi', v_wip.esb_product_detail_id_porsi,
    'qty_porsi',                   v_log.qty_porsi,
    -- The movement, in the stored model. There is no action_type here and there is not meant to be:
    -- the worker keys its dispatch on the `endpoint` COLUMN, which already carries the decision.
    'action',                      v_log.action,
    'activity',                    v_log.activity,
    'branch_id',                   v_log.branch_id,
    'branch_code',                 v_branch_code,
    'destination_branch_id',       v_log.destination_branch_id,
    'destination_branch_code',     v_dest_code);

  v_target := integrations.current_esb_target_env();
  v_dedup  := 'kitchen|' || v_batch_id || '|' || v_target;

  insert into integrations.esb_push
    (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key)
  values (v_log.org_id, 'kitchen', v_batch_id, v_endpoint, v_payload, v_target, v_dedup)
  on conflict (dedup_key) do nothing;  -- idempotent enqueue (OD-K-4)

  return v_batch_id;
end;
$$;
comment on function ops.approve_kitchen_log(uuid, text) is
  'Atomic approval (FR-044/050/062/070) and the SOLE creator of an integrations.esb_push row. '
  'Guards in carried order: foreign org (42501), not Submitted (P0003), then #236''s two: review '
  'authority is the row''s stream reviewer or ops_lead/admin (FR-040/041, 42501), and a transfer '
  'is refused while the same stream/day has Submitted production (FR-043, P0004) — both BEFORE '
  'the mint, so a refusal consumes nothing. Mints the batch id from the derived prefix, recomputes '
  'the (branch, activity) stream''s end-of-day stock, and enqueues one outbox row whose endpoint '
  'is derived structurally (OD-WAY-26). SECURITY DEFINER.';

revoke execute on function ops.approve_kitchen_log(uuid, text) from public, anon, authenticated;
grant  execute on function ops.approve_kitchen_log(uuid, text) to authenticated;
