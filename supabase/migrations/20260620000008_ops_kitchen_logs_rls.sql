-- RLS: any org member reads the org's logs (the review queue + pesanan are org-scoped);
-- any member INSERTs own Submitted (submitted_by server-stamped); the Submitted→Approved/Rejected
-- transition is ops_lead/admin only (FR-044). org_id is server-stamped (AC-002).
alter table ops.kitchen_logs enable row level security;
alter table ops.kitchen_logs force row level security;

create policy kitchen_logs_select_org on ops.kitchen_logs
  for select to authenticated using (org_id = shared.current_org_id());

create policy kitchen_logs_insert_member on ops.kitchen_logs
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and submitted_by = shared.current_person_id()
              and status = 'Submitted');

create policy kitchen_logs_update_reviewer on ops.kitchen_logs
  for update to authenticated
  using (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id());

-- Guard: the status transition is the GIGO gate, PLUS the cross-org FK seam the ops.log_entries
-- audit closed (mirrors ops._guard_log_entry). A member may NOT flip status out of Submitted; only
-- ops_lead/admin may transition to Approved/Rejected. SECURITY INVOKER (reads only current_person_id
-- + has_access_role claim helpers AND the org-readable shared.business_units / ops.wip_items rows;
-- nothing to revoke — definer-revoke lint stays clean), mirroring ops._guard_log_entry.
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
  -- a Submitted→Submitted UPDATE that flips action_type/wip_item_id/log_date is a re-target
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
  -- invisible → the lookup returns NULL → distinct from new.org_id → raise 23514. Runs on INSERT and
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
  'Guard (FR-044 + audit-parity): Submitted→Approved/Rejected is ops_lead/admin only; submitted_by + org_id + Submitted-key immutable (42501); business_unit_id/wip_item_id must be same-org as the log (23514, mirrors ops._guard_log_entry). SECURITY INVOKER.';

create trigger kitchen_logs_guard
  before insert or update on ops.kitchen_logs
  for each row execute function ops._guard_kitchen_log();

-- DOWN: drop trigger kitchen_logs_guard on ops.kitchen_logs;
--       drop function ops._guard_kitchen_log();
--       drop policy kitchen_logs_update_reviewer on ops.kitchen_logs;
--       drop policy kitchen_logs_insert_member on ops.kitchen_logs;
--       drop policy kitchen_logs_select_org on ops.kitchen_logs;
