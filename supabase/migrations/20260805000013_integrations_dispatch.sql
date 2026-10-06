-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — `integrations`: the dispatch path (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ READ THIS BEFORE ADDING ANYTHING. The outbox TABLE is not here and must not be re-created.
--
-- integrations.esb_push — the table, its indexes, its updated_at trigger, its RLS posture, its one
-- policy, its grants and the AC-012 enqueue refusal — was authored in the `ops` pass (...0009 and
-- ...0010) for a dependency reason, not by accident: the enqueue refusal is a TRIGGER, and a trigger
-- cannot be created on a table that does not exist. Same class as reporting.esb_ar_reduction landing
-- in the `mos` pass. This file was written against that shape after verifying it, and it adds only
-- what was genuinely still missing.
--
-- ── What #183 already provides, verified rather than assumed ─────────────────────────────────
--   * integrations.esb_push, with the unique dedup_key, the five-state status CHECK, retry_count,
--     last_error, esb_doc_num and the pending/failed partial index the drain reads.
--   * RLS ENABLED and FORCED, one SELECT policy (ops_lead/admin, own org), no INSERT or UPDATE
--     policy for authenticated, no DELETE grant to anybody.
--   * integrations._guard_esb_push_not_posted() and its trigger, firing on INSERT **and** on an
--     UPDATE OF source_ref, with EXECUTE revoked from public/anon/authenticated.
--
-- ── What this file adds ──────────────────────────────────────────────────────────────────────
--   1. integrations.current_esb_target_env() — the GUC read that stamps target_env at enqueue.
--      CARRIED from 20260620000007 on both prior chains. ...0011's header named it as deferred
--      to this pass, so it is not a discovery; it is the item that file left on the list.
--   2. ops.approve_kitchen_log(uuid, text) — THE SOLE LEGITIMATE CREATOR OF AN OUTBOX ROW.
--      CARRIED from 20260620000009 as superseded by 20260620000014 (the Daily-Log mirror was
--      deferred parity-first, and stays deferred), re-authored against `ops`'s new shape: no
--      action_type anywhere, the (branch, activity) production stream carried through the stock
--      recompute, and the ERP operation derived structurally rather than by a three-way CASE on a
--      label. It lives in `ops` by schema but belongs to this pass by ownership: its guards are what
--      AC-013 tests and what DD-WAY-20 names as one of the two structural re-POST protections.
--
-- ── Why the dispatch path is thinner than "a worker" ─────────────────────────────────────────
-- Dispatch drains rows filtered pending/failed. In the database that is three things and all three
-- are already here: the partial index that makes the filter cheap, the service_role grants that let
-- the worker read those rows and flip their status, and the absence of any DELETE grant so a push
-- that failed cannot be made to disappear. The worker itself is a process, not a schema object, and
-- the incumbent's is a Python poller holding service_role. Nothing was invented here to make this
-- file look fuller; what the schema owes is asserted in supabase/tests/integrations_03_*.sql.
--
-- ── The one thing this file deliberately does NOT decide ─────────────────────────────────────
-- Nothing sets status = 'dead_letter'. The incumbent's retry budget is an env var (ESB_MAX_RETRY,
-- default 5) read by the poller, and a row at the budget is SKIPPED and left in the queue "until
-- manual reset of retry_count" — there is no gated exit from that state in the incumbent either.
-- Reproducing the budget as a schema constant, and deciding who may return a dead-lettered row to
-- pending, are worker-ticket calls that no ruling settles. Raised in the PR rather than resolved
-- here. What IS asserted is the part that holds today: a failed push stays visible, stays inside the
-- drain filter, and cannot be deleted by anyone.
--
-- DOWN: revoke execute on function ops.approve_kitchen_log(uuid, text) from authenticated;
--       drop function ops.approve_kitchen_log(uuid, text);
--       drop function integrations.current_esb_target_env();
--       (integrations.esb_push itself is dropped by ...0009's DOWN, which owns it.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The target environment stamped at enqueue
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CARRIED from 20260620000007, unchanged in behaviour. Default 'dry_run'; a pre-flip deployment sets
-- the GUC to 'goo'; 'gkid' is reached ONLY at the owner-gated flip (OD-K-2, FR-080..082).
--
-- THE MECHANISM IS A GUC, NOT A JWT CLAIM, and that distinction is the control. A claim travels with
-- a user's token, so any session could assert its own target environment and a single mis-issued
-- token would point one user's approvals at production GKID. A GUC is set by the deployment, so the
-- environment is a property of the server rather than of the caller.
--
-- Note what this does and does not buy, because OD-K-4 is easy to over-trust here (DD-WAY-14): the
-- value lands inside dedup_key, so the uniqueness guarantee is at most one post per batch PER
-- ENVIRONMENT. A dry-run post is correctly not a real one, but that means the flip's safety comes
-- from stopping the other writer, not from dedup.
create or replace function integrations.current_esb_target_env()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.esb_target_env', true), ''),
    'dry_run'
  )
$$;
comment on function integrations.current_esb_target_env() is
  'The ERP target environment stamped on an outbox row at enqueue (FR-080/081). Reads the GUC app.esb_target_env — a deployment property, NOT a JWT claim, so a caller cannot choose which environment their approval posts to. Default dry_run; a deployment sets goo; gkid only at the owner-gated flip (OD-K-2). SECURITY INVOKER.';
-- `integrations` is exposed through PostgREST, so the default PUBLIC execute would publish which
-- environment the outbox is pointed at as a callable RPC. Nothing in the app tier needs it — the
-- only caller is the approval path, which runs as the owner.
revoke execute on function integrations.current_esb_target_env() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. ops.approve_kitchen_log — the single audited multi-write point, and the only enqueuer
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- One SECURITY DEFINER function doing, in one transaction: (1) load and lock the log; (2) refuse a
-- foreign org; (3) refuse anything not Submitted; (4) refuse a caller without the role; (5) mint the
-- batch id; (6) flip to Approved with reviewer provenance; (7) recompute the stream's end-of-day
-- stock; (8) enqueue exactly one outbox row.
--
-- ── The guard ORDER is carried verbatim and is not cosmetic ──────────────────────────────────
-- not-found (P0002) → foreign org (42501) → not Submitted (P0003) → missing role (42501).
--
-- Org before role, because this function bypasses RLS: the load can lock ANY org's row, and another
-- tenant's ops_lead satisfies the role gate. Checking org first means neither the row's existence
-- nor the caller's role is an oracle about another tenant.
--
-- Status before role, which is the prior chains' order and is kept so the error CODE a given
-- violation produces is unchanged (the same rule ...0010 applied when it merged four guards into
-- one). It leaks nothing: ops.kitchen_logs is org-readable by policy, so a same-org member can
-- already see the status this raise mentions.
--
-- ── What the reshape changed, and what it deliberately did not ───────────────────────────────
-- The prior body branched three ways on the action_type literal, three separate times — for the
-- batch prefix, for the stock sign, and for the ERP endpoint. DD-WAY-13 deletes that column, so each
-- of those three is now a call to the derivation that owns it (...0011) or a test on `action`. The
-- endpoint one matters most: 'noop' is no longer "the destination is Bungur", it is
-- `destination_branch_id = branch_id` — the ERP already books that branch as holding the WIP, so
-- there is nothing for it to record (OD-WAY-26). That generalises to every branch pair, including
-- the four streams the incumbent never covered.
--
-- A no-op still gets an outbox row. That is carried, not overlooked: OD-K-4 wants one row per batch
-- whatever the batch turns out to owe the ERP, the row is the audit trail that the movement was
-- considered, and the incumbent closes such a batch with a sentinel document number rather than
-- skipping it.
--
-- The Daily-Log mirror stays deferred (20260620000014). The Daily Log UI is still flag-hidden and the
-- mirror is net-new logic with no incumbent equivalent; re-adding it is a one-migration change when
-- the module ships, and the partial unique index that makes it idempotent is already in ...0009.
--
-- ── The payload is a MESSAGE, so it is a snapshot and that is correct ────────────────────────
-- Everywhere else this baseline links rather than copies. An outbox row is the exception by nature:
-- it is a message about a fact as it stood when the fact was approved, and it must stay dispatchable
-- without the worker re-reading tables it may not be granted. service_role holds no grant on
-- shared.branches, so the branch CODES travel on the message rather than being joined at dispatch.
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

  -- (2) CARRIED from 20260620000009. Cross-tenant guard, before the role check and before any write.
  if v_log.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot approve a log outside your org' using errcode = '42501';
  end if;

  -- (3) CARRIED from 20260620000009. AC-013 and the second of DD-WAY-20's two structural re-POST
  -- protections: an imported row lands Approved, so it cannot be approved again, so it never gets an
  -- outbox row. The raise is BEFORE the batch mint, the status flip and the enqueue, so a refusal
  -- leaves no trace of any kind — not a consumed sequence number, not a row.
  if v_log.status <> 'Submitted' then
    raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003';
  end if;

  -- (4) CARRIED from 20260620000009. Defense in depth: ops._guard_kitchen_log already refuses a
  -- Submitted→Approved transition by anyone without the role, and this function is the single
  -- audited point, so the gate is stated where the audit is.
  if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'only ops_lead/admin may approve' using errcode = '42501';
  end if;

  -- (5) mint the batch id (FR-050/051). The prefix is DERIVED (...0011) — PR/TR/TB is a counter
  -- namespace, not a stored action type, and no fact row keeps it.
  v_prefix := ops.kitchen_batch_prefix(v_log.action, v_log.branch_id, v_log.destination_branch_id);

  insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
  values (v_log.org_id, v_prefix, v_log.log_date, 1)
  on conflict (org_id, prefix, log_date) do update
    set last_n = ops.kitchen_batch_seq.last_n + 1
  returning last_n into v_next_n;

  v_batch_id := v_prefix || '-' || to_char(v_log.log_date, 'YYYYMMDD') || '-'
                || lpad(v_next_n::text, 3, '0');

  -- (6) flip to Approved with reviewer provenance. ops._guard_kitchen_log does NOT stamp reviewer
  -- fields on →Approved precisely because this path sets them explicitly.
  update ops.kitchen_logs
     set status      = 'Approved',
         reviewed_by = shared.current_person_id(),
         reviewed_at = now(),
         review_note = p_review_note,
         batch_id    = v_batch_id
   where id = p_log_id;

  -- (7) recompute the stored end-of-day balance (FR-060/062), SCOPED TO THE PRODUCTION STREAM
  -- (OD-WAY-28). The prior body summed by (org, item, date) alone, which was sufficient while there
  -- was one implicit stream and becomes a silent cross-branch sum the moment there is more than one
  -- — it would add Gordi HQ's balance to Rumah Rames's and write the total as both. Sign convention
  -- unchanged: a produce adds, a transfer subtracts whatever its destination, including a transfer
  -- within one branch's books, because the WIP has still left the kitchen's hands. Negatives are
  -- preserved rather than clamped (FR-061).
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

  -- (8) enqueue exactly one outbox row (FR-070). This is the only place in the baseline that writes
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
  'Atomic approval (FR-044/050/062/070) and the SOLE creator of an integrations.esb_push row. Guards in carried order: foreign org (42501), not Submitted (P0003), missing role (42501) — the status guard is one of DD-WAY-20''s two structural re-POST protections. Mints the batch id from the derived prefix, recomputes the (branch, activity) stream''s end-of-day stock, and enqueues one outbox row whose endpoint is derived structurally (OD-WAY-26). Daily-Log mirror stays deferred (20260620000014). SECURITY DEFINER.';

revoke execute on function ops.approve_kitchen_log(uuid, text) from public, anon, authenticated;
grant  execute on function ops.approve_kitchen_log(uuid, text) to authenticated;
