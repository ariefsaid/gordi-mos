-- FR-044: stamp reviewer provenance on the kitchen-log REJECT transition.
-- The approve path (ops.approve_kitchen_log RPC) stamps reviewed_by/reviewed_at/review_note
-- explicitly. Reject, however, is a plain guarded UPDATE (Submitted->Rejected via the
-- kitchen_logs_update_reviewer policy): the client may send only status + review_note and MUST
-- NOT send reviewed_by/reviewed_at (those are client-forgeable provenance). So a rejected log
-- previously kept review_note but no reviewer attribution. Fix: the guard stamps reviewed_by +
-- reviewed_at server-side on Submitted->Rejected, symmetric with approve.
--
-- This CREATE OR REPLACE adds ONLY the reject-stamp; every prior guard responsibility
-- (status/role gate, submitted_by + org_id immutability, Submitted-key immutability, same-org FK
-- seam) is preserved verbatim. The approve path is unaffected: the stamp fires only on ->Rejected,
-- and the RPC's ->Approved UPDATE is left to the RPC. SECURITY INVOKER (reads only
-- current_person_id) — no new DEFINER, no definer-revoke lint impact.
create or replace function ops._guard_kitchen_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_wip_org  uuid;
begin
  -- submitted_by is immutable post-insert (a log can't be re-attributed).
  if tg_op = 'UPDATE' and new.submitted_by is distinct from old.submitted_by then
    raise exception 'submitted_by is immutable' using errcode = '42501';
  end if;
  -- org_id is immutable post-insert (mirrors ops.log_entries; prevents cross-org re-homing on UPDATE).
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- status transitions: leaving Submitted (to Approved/Rejected) requires ops_lead/admin.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status <> 'Submitted' then
    if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
      raise exception 'only ops_lead/admin may approve or reject a kitchen log' using errcode = '42501';
    end if;
  end if;
  -- Submitted->Rejected stamps reviewer provenance server-side (FR-044). Reject is a plain guarded
  -- UPDATE (the client sends status + review_note only); reviewed_by/reviewed_at are NOT client-sent,
  -- so the guard attributes them to the session person here. Approve is left to the RPC (which sets
  -- these explicitly), so this stamp deliberately does NOT fire on ->Approved.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Rejected' then
    new.reviewed_by := shared.current_person_id();
    new.reviewed_at := now();
  end if;
  -- a Submitted->Submitted UPDATE that flips action_type/wip_item_id/log_date is a re-target
  -- (forbidden — it would alter the day's actuals silently).
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Submitted' then
    if new.action_type is distinct from old.action_type
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date then
      raise exception 'action_type/wip_item/log_date are immutable on a Submitted log' using errcode = '42501';
    end if;
  end if;
  -- SAME-ORG FK seam (mirrors ops._guard_log_entry): business_unit_id and wip_item_id are plain
  -- existence-only FKs (FK lookups bypass RLS), so a member could reference a foreign-org BU or WIP
  -- item. Under INVOKER RLS a same-org reference is visible (org_id matches) and a cross-org one is
  -- invisible -> the lookup returns NULL -> distinct from new.org_id -> raise 23514. Runs on INSERT and
  -- UPDATE (NOT NULL columns, so a NULL never reaches here — the column constraint fires 23502 first).
  select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
  if v_bu_org is distinct from new.org_id then
    raise exception 'business_unit_id must belong to the same org as the kitchen log'
      using errcode = '23514';
  end if;
  select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
  if v_wip_org is distinct from new.org_id then
    raise exception 'wip_item_id must belong to the same org as the kitchen log'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_log() is
  'Guard (FR-044 + audit-parity): Submitted->Approved/Rejected is ops_lead/admin only; Submitted->Rejected stamps reviewed_by + reviewed_at server-side (approve provenance is set by the RPC); submitted_by + org_id + Submitted-key immutable (42501); business_unit_id/wip_item_id must be same-org as the log (23514, mirrors ops._guard_log_entry). SECURITY INVOKER.';

-- DOWN: revert ops._guard_kitchen_log() to its prior body (the version defined in
--       20260620000008_ops_kitchen_logs_rls.sql) — i.e. remove the Submitted->Rejected provenance
--       stamp; the trigger ops.kitchen_logs.kitchen_logs_guard and all RLS policies are unchanged.
