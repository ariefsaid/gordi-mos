-- Round-2 audit finding A1 (Sec-High) — guard trigger on mos.tasks.
-- Two seams the FKs + RLS policies cannot close on their own:
--
--  HIGH (immutability, UPDATE only) — created_by / org_id mutable on UPDATE (authorship
--    re-attribution / forced handoff / cross-org created_by). The tasks UPDATE WITH CHECK evaluates
--    mos.can_edit_task(id), which re-reads the row by id, so it evaluates the gate against the OLD
--    created_by and NEVER sees the NEW value: an editor who passes the gate could PATCH created_by to
--    anyone (incl. a foreign-org person). WITH CHECK cannot compare OLD vs NEW, so this is fixed at the
--    DB layer with a BEFORE UPDATE trigger that RAISES 42501 when created_by or org_id changes (mirrors
--    ops._guard_log_entry + mos._guard_archive: explicit raise, not a silent pin; TG_OP gate keeps
--    INSERT untouched).
--
--  HIGH (cross-org reference seam) — business_unit_id, responsible_person_id, accountable_person_id,
--    created_by and the consulted_person_ids[] / informed_person_ids[] arrays are plain existence-FKs.
--    FKs check existence ONLY (FK lookups bypass RLS), so a member in org A could hang a task off org
--    B's BU/person. The RLS insert policy tasks_insert_member only checks the ROW's own org_id, never
--    the referenced ids. On INSERT OR UPDATE every reference must resolve WITHIN the task's org; else
--    RAISE 23514. NULLs for the scalar refs are NOT NULL columns already — left to the column
--    constraint (23502) so the existing column-constraint tests keep their error-code contract.
--
-- SECURITY INVOKER is sufficient: shared.business_units + shared.people are org-readable
-- (org_id = current_org_id()), so a same-org reference is visible and yields a matching org_id, while a
-- cross-org reference is invisible -> the lookup returns NULL -> the IS DISTINCT FROM comparison (and
-- the arrays' inner not-exists) fires the raise. INVOKER only (nothing to revoke; definer-revoke lint
-- stays clean). Mirrors ops._guard_log_entry (20260612000006).
create or replace function mos._guard_task_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org       uuid;
  v_resp_org     uuid;
  v_acc_org      uuid;
  v_creator_org  uuid;
begin
  -- HIGH (immutability): created_by and org_id are immutable once written (UPDATE only).
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable on a task' using errcode = '42501';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a task' using errcode = '42501';
    end if;
  end if;

  -- HIGH (cross-org references): every scalar reference must resolve WITHIN the task's org. A
  -- cross-org id is invisible under INVOKER RLS -> the lookup returns NULL -> distinct from
  -- new.org_id -> raise. A NULL business_unit_id / responsible / accountable / created_by is left to
  -- the NOT NULL column constraint (23502) so the existing column-constraint tests keep their
  -- error-code contract — this guard never preempts the more fundamental column rule.
  select bu.org_id into v_bu_org
    from shared.business_units bu
    where bu.id = new.business_unit_id;
  if v_bu_org is distinct from new.org_id then
    raise exception 'business_unit_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  select p.org_id into v_resp_org
    from shared.people p
    where p.id = new.responsible_person_id;
  if v_resp_org is distinct from new.org_id then
    raise exception 'responsible_person_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  select p.org_id into v_acc_org
    from shared.people p
    where p.id = new.accountable_person_id;
  if v_acc_org is distinct from new.org_id then
    raise exception 'accountable_person_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  select p.org_id into v_creator_org
    from shared.people p
    where p.id = new.created_by;
  if v_creator_org is distinct from new.org_id then
    raise exception 'created_by must belong to the same org as the task'
      using errcode = '23514';
  end if;

  -- Arrays: every element must resolve to a same-org person. A foreign-org id is invisible under
  -- INVOKER RLS (and would also fail p.org_id = new.org_id) -> inner not-exists is true -> raise.
  -- Empty array = no rows from unnest = outer exists is false = pass.
  if exists (
    select 1 from unnest(new.consulted_person_ids) pid
    where not exists (
      select 1 from shared.people p where p.id = pid and p.org_id = new.org_id
    )
  ) then
    raise exception 'every consulted_person_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(new.informed_person_ids) pid
    where not exists (
      select 1 from shared.people p where p.id = pid and p.org_id = new.org_id
    )
  ) then
    raise exception 'every informed_person_id must belong to the same org as the task'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
comment on function mos._guard_task_refs() is
  'Guard (round-2 audit A1, Sec-High): created_by/org_id immutable on UPDATE (42501); business_unit_id, responsible_person_id, accountable_person_id, created_by and consulted/informed arrays must be same-org on INSERT/UPDATE (23514). SECURITY INVOKER — refs are org-readable. Mirrors ops._guard_log_entry.';

drop trigger if exists tasks_guard_refs on mos.tasks;
create trigger tasks_guard_refs
  before insert or update on mos.tasks
  for each row execute function mos._guard_task_refs();

-- DOWN: drop trigger tasks_guard_refs on mos.tasks;
--       drop function mos._guard_task_refs();
