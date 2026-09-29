-- Change history batch 2b — Signals & work items (#987, Slice 4 of the change-history rollout on
-- the ADR-0059 mechanism from 20260929000001). Attaches the one generic trigger to the eight
-- Signal-family and work-log tables and registers their read arms in
-- shared.can_read_history_record. No shape changes: the mechanism, its grants and its policy are
-- Slice 1's and are not restated here.
--
-- MERGE-ORDER CONTRACT for every batch migration: the CREATE OR REPLACE of
-- shared.can_read_history_record must restate ALL arms landed by every earlier batch, and each
-- batch's DOWN restores only that batch's own prior body. A batch rebased after a sibling merged
-- unions the sibling's arms into both bodies; landing a batch whose body drops an earlier batch's
-- arms leaves those tables writing history nobody can read.
--
--   mos.signals                  — '-edited_at': the mechanical clock mos._guard_signals stamps
--                                  whenever a content edit lands is the companion of that edit's
--                                  own recorded rows (body / occurred_at / category / attention),
--                                  never a human change in itself — the tasks.last_activity_at
--                                  precedent. Retraction is NOT excluded: retracted_at /
--                                  retract_reason ARE the retraction's content. The default uuid
--                                  id key applies.
--   mos.weekly_updates           — '-submitted_at': the clock mos._guard_weekly_updates owns
--                                  server-side (status carries the change; the CHECK pins the
--                                  pair together, so the timestamp is pure derived noise).
--   mos.signal_mentions          — plain registrations; revoked_at stays recorded (revoking a
--   mos.signal_acknowledgements    mention is a real author-owned change). The default uuid id key
--   mos.signal_tasks              and the built-in exclude list (id / org_id / created_at /
--   mos.weekly_update_items       updated_at) are the whole registration for these.
--   mos.events                   — archived_at stays recorded: archiving is a human action, like
--                                  retraction.
--   mos.follow_ups               — plain registration; notes / promise_date and the transition
--                                  columns are the record's substance.
--
-- One hard-DELETE in this batch: mos.weekly_update_items holds the only authenticated DELETE grant
-- (own-author via mos.can_write_own_update, 20260805000006) — so it is the one table needing the
-- snapshot arm, registering the item's own SELECT predicate
-- (weekly_update_items_select_upward: org membership plus the parent update's upward read) against
-- the captured snapshot columns, with the parent read gate mos.can_read_weekly_update reused
-- verbatim. Every other table here is select/insert/update at most (signals retraction is soft and
-- "no DELETE anywhere" by comment contract; events, follow_ups and the rest hold no DELETE grant),
-- so a delete row for them, if one ever existed, fails closed until its snapshot arm is wired.
--
-- DOWN (restore the pre-batch shape; the mechanism itself stays):
--   drop trigger record_history_signals on mos.signals;
--   drop trigger record_history_signal_mentions on mos.signal_mentions;
--   drop trigger record_history_signal_acknowledgements on mos.signal_acknowledgements;
--   drop trigger record_history_signal_tasks on mos.signal_tasks;
--   drop trigger record_history_weekly_updates on mos.weekly_updates;
--   drop trigger record_history_weekly_update_items on mos.weekly_update_items;
--   drop trigger record_history_events on mos.events;
--   drop trigger record_history_follow_ups on mos.follow_ups;
--   -- then create or replace function shared.can_read_history_record(text, text, text, text, jsonb)
--   -- back to its pre-batch body (Slice 1's arms only, as of 808aa13b):
--   --   create or replace function shared.can_read_history_record(
--   --     p_schema     text,
--   --     p_table      text,
--   --     p_record_key text,
--   --     p_action     text,
--   --     p_snapshot   jsonb
--   --   )
--   --   returns boolean
--   --   language plpgsql
--   --   stable
--   --   security invoker
--   --   set search_path = ''
--   --   as $$
--   --   begin
--   --     if p_action in ('insert', 'update') then
--   --       case
--   --         -- The registered key of every arm below is a bare uuid (DA-1's id::text shape), so the
--   --         -- stored key is cast BACK to uuid against the PK — index-preserving, per the review of
--   --         -- this migration. The shape test keeps a malformed stored key fail-closed (no row) instead
--   --         -- of erroring the whole policy query. A future composite-key table (DA-1) whose key is not
--   --         -- one uuid registers a plain text-comparison arm instead.
--   --         when p_schema = 'mos' and p_table = 'objectives' then
--   --           return exists (
--   --             select 1 from mos.objectives o
--   --             where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   --               and o.id = p_record_key::uuid
--   --               and o.org_id = shared.current_org_id());
--   --         when p_schema = 'mos' and p_table = 'work_lines' then
--   --           return exists (
--   --             select 1 from mos.work_lines w
--   --             where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   --               and w.id = p_record_key::uuid
--   --               and w.org_id = shared.current_org_id());
--   --         else
--   --           return false;
--   --       end case;
--   --     end if;
--   --     -- p_action = 'delete' (or anything unrecognized): the snapshot arm registers hard-deletable
--   --     -- tables as their batches wire them. No audited table hard-deletes yet, so nothing is named
--   --     -- here and every delete row fails closed (FR-013, NFR-007).
--   --     return false;
--   --   end;
--   --   $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Wire the eight Signal-family and work-log tables (batch 2b)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Observer triggers alongside each table's existing BEFORE guard, exactly as the earlier slices
-- wired theirs. The two mechanical clocks above are the batch's only registrations beyond the
-- bare default.
create trigger record_history_signals
  after insert or update or delete on mos.signals
  for each row execute function shared._record_history_write('-edited_at');

create trigger record_history_signal_mentions
  after insert or update or delete on mos.signal_mentions
  for each row execute function shared._record_history_write();

create trigger record_history_signal_acknowledgements
  after insert or update or delete on mos.signal_acknowledgements
  for each row execute function shared._record_history_write();

create trigger record_history_signal_tasks
  after insert or update or delete on mos.signal_tasks
  for each row execute function shared._record_history_write();

create trigger record_history_weekly_updates
  after insert or update or delete on mos.weekly_updates
  for each row execute function shared._record_history_write('-submitted_at');

create trigger record_history_weekly_update_items
  after insert or update or delete on mos.weekly_update_items
  for each row execute function shared._record_history_write();

create trigger record_history_events
  after insert or update or delete on mos.events
  for each row execute function shared._record_history_write();

create trigger record_history_follow_ups
  after insert or update or delete on mos.follow_ups
  for each row execute function shared._record_history_write();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The read dispatch — the eight new arms join the registry; everything else still fails closed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The whole body is restated (create or replace has no per-arm edit). Each live arm is the table's
-- own read predicate — org membership over a live lookup by record_key, the guarded uuid cast that
-- preserves the PK index; the lookups run under the caller and that table's own RLS, so the
-- Signal-family rows read through mos.can_read_signal and the weekly-update rows through the
-- upward gate without being restated here (Slice 1's shape). The delete branch registers the
-- batch's one hard-deletable table against its SNAPSHOT columns, because the row itself is gone.
create or replace function shared.can_read_history_record(
  p_schema     text,
  p_table      text,
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    case
      when p_schema = 'mos' and p_table = 'objectives' then
        return exists (
          select 1 from mos.objectives o
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and o.id = p_record_key::uuid
            and o.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'work_lines' then
        return exists (
          select 1 from mos.work_lines w
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and w.id = p_record_key::uuid
            and w.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'signals' then
        return exists (
          select 1 from mos.signals s
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and s.id = p_record_key::uuid
            and s.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'signal_mentions' then
        return exists (
          select 1 from mos.signal_mentions m
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and m.id = p_record_key::uuid
            and m.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'signal_acknowledgements' then
        return exists (
          select 1 from mos.signal_acknowledgements a
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and a.id = p_record_key::uuid
            and a.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'signal_tasks' then
        return exists (
          select 1 from mos.signal_tasks st
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and st.id = p_record_key::uuid
            and st.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'weekly_updates' then
        return exists (
          select 1 from mos.weekly_updates wu
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and wu.id = p_record_key::uuid
            and wu.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'weekly_update_items' then
        return exists (
          select 1 from mos.weekly_update_items wi
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and wi.id = p_record_key::uuid
            and wi.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'events' then
        return exists (
          select 1 from mos.events e
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and e.id = p_record_key::uuid
            and e.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'follow_ups' then
        return exists (
          select 1 from mos.follow_ups fu
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and fu.id = p_record_key::uuid
            and fu.org_id = shared.current_org_id());
      else
        return false;
    end case;
  end if;
  -- p_action = 'delete' (or anything unrecognized): the row is gone, so the table's read predicate
  -- is evaluated against the captured snapshot columns. mos.weekly_update_items is this batch's
  -- one hard-deletable table (own-author DELETE via mos.can_write_own_update): its arm restates
  -- its own SELECT predicate (weekly_update_items_select_upward) over the snapshot, with the
  -- parent update's upward read gate reused verbatim. A table without a registered delete arm —
  -- including every other table in this batch — stays fail closed (FR-013, NFR-007).
  if p_action = 'delete' then
    case
      when p_schema = 'mos' and p_table = 'weekly_update_items' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
          and exists (
            select 1 from mos.weekly_updates w
            where w.id = (p_snapshot ->> 'weekly_update_id')::uuid
              and mos.can_read_weekly_update(w.person_id));
      else
        return false;
    end case;
  end if;
  return false;
end;
$$;
