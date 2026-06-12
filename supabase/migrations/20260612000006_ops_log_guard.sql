-- P2-3 security hardening (audit 2026-06-12) — guard trigger on ops.log_entries.
-- Two seams the RLS policies cannot close on their own:
--
--  HIGH — created_by / org_id mutable on UPDATE (authorship re-attribution / forced handoff /
--    cross-org created_by). ops.can_edit_log_entry re-reads the row by id, so the UPDATE WITH CHECK
--    evaluates the gate against the OLD created_by and NEVER sees the NEW value: an author passes the
--    gate and can PATCH created_by to anyone (incl. a foreign-org person), and org_id is only loosely
--    held by WITH CHECK. WITH CHECK cannot compare OLD vs NEW, so this is fixed at the DB layer with a
--    BEFORE UPDATE trigger that RAISES 42501 when created_by or org_id changes (mirrors mos._guard_archive:
--    explicit raise, not a silent pin).
--
--  MEDIUM — cross-org business_unit_id / linked_task_id references (existence oracle). The FKs check
--    existence ONLY (FK lookups bypass RLS), so a WU-A entry could reference a WU-B business_unit or
--    task. On INSERT OR UPDATE the referenced shared.business_units.org_id must equal new.org_id, and
--    (when linked_task_id is non-null) mos.tasks.org_id must equal new.org_id; else RAISE 23514.
--
-- Both seams live in ONE function: the immutability check is UPDATE-only (guarded by TG_OP), the
-- org-consistency check runs on INSERT and UPDATE. SECURITY INVOKER is sufficient: both referenced
-- tables are org-readable (org_id = current_org_id()), so a same-org reference is visible and yields a
-- matching org_id, while a cross-org reference is invisible -> the read returns NULL -> the IS DISTINCT
-- FROM comparison fires the raise. INVOKER only (nothing to revoke; definer-revoke lint stays clean).
create or replace function ops._guard_log_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org    uuid;
  v_task_org  uuid;
begin
  -- HIGH: created_by and org_id are immutable once written (UPDATE only).
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable on a log entry' using errcode = '42501';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a log entry' using errcode = '42501';
    end if;
  end if;

  -- MEDIUM: every reference must resolve WITHIN the entry's org. A cross-org id is invisible under
  -- INVOKER RLS -> the lookup returns NULL -> distinct from new.org_id -> raise. A NULL business_unit_id
  -- is left to the NOT NULL column constraint (23502) so that the existing constraint test keeps its
  -- error-code contract — this guard never preempts the more fundamental column rule.
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org
      from shared.business_units bu
      where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id must belong to the same org as the log entry'
        using errcode = '23514';
    end if;
  end if;

  if new.linked_task_id is not null then
    select t.org_id into v_task_org
      from mos.tasks t
      where t.id = new.linked_task_id;
    if v_task_org is distinct from new.org_id then
      raise exception 'linked_task_id must belong to the same org as the log entry'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
comment on function ops._guard_log_entry() is
  'Guard (audit 2026-06-12): created_by/org_id immutable on UPDATE (42501, High); business_unit_id + linked_task_id must be same-org on INSERT/UPDATE (23514, Medium). SECURITY INVOKER — refs are org-readable.';

create trigger log_entries_guard
  before insert or update on ops.log_entries
  for each row execute function ops._guard_log_entry();

-- DOWN: drop trigger log_entries_guard on ops.log_entries;
--       drop function ops._guard_log_entry();
