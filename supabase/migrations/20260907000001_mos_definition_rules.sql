-- Work-systems definition rules ratified for #801 (OD-WAY-97 (1) (2) (3) (5) (10)): who writes the
-- two definition catalogs (Projects & Processes, Objectives) and a Process's cadence and step
-- definitions. Reading stays org membership alone and is not touched here.
--
--   1. mos.can_manage_definition(business_unit_id): admin and ops_lead anywhere; a LEAD — a person
--      who holds at least one report in the reporting line, or heads a Business unit — in a unit
--      where they hold a role or a live Team membership; nobody else. A definition with no unit is
--      admin/ops_lead only. The predicate WIDENS the existing capability grants (workline.manage,
--      objective.manage); it does not replace them.
--   2. mos.can_manage_process_definition(work_line_id): the Process's Accountable person, admin or
--      ops_lead — the gate on a Process's cadence and step definitions.
--   3. work_lines.type defaults to 'project' and locks once an occurrence (a process_run) exists.
--   4. Objectives carry ownership: business_unit_id, accountable_person_id, period_year — all
--      nullable, same-org enforced by the table's one guard. No measure/target/lane/R/C/I column
--      (OD-WAY-33).
--   5. INSERT/UPDATE policies on objectives and work_lines re-created with the widened gate; the
--      cadence and task-def policies re-created with the Process-A arm.
--
-- DOWN:
--   drop policy objectives_insert_can_manage_or_unit_lead on mos.objectives;
--   drop policy objectives_update_can_manage_or_unit_lead on mos.objectives;
--   drop policy work_lines_insert_can_manage_or_unit_lead on mos.work_lines;
--   drop policy work_lines_update_can_manage_or_unit_lead on mos.work_lines;
--   drop policy process_cadences_insert_ops_lead_or_admin_or_process_a  on mos.process_cadences;
--   drop policy process_cadences_update_ops_lead_or_admin_or_process_a  on mos.process_cadences;
--   drop policy process_task_defs_insert_ops_lead_or_admin_or_process_a on mos.process_task_defs;
--   drop policy process_task_defs_update_ops_lead_or_admin_or_process_a on mos.process_task_defs;
--   -- then re-create the eight policies with their bodies from 20260805000006_mos_access_control.sql
--   -- under the names there (cadence/task-def names as renamed by 20260824000001).
--   drop trigger objectives_guard on mos.objectives;
--   drop function mos._guard_objectives();
--   alter table mos.objectives drop column period_year, drop column accountable_person_id,
--     drop column business_unit_id;
--   alter table mos.work_lines alter column type drop default;
--   create or replace function mos._guard_work_lines() with its body from
--     20260805000006_mos_access_control.sql (no type-lock arm, no unit arm);
--   drop function mos.can_manage_process_definition(uuid);
--   drop function mos.can_manage_definition(uuid);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The predicate: who manages a definition in a unit
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER so every directory read below is RLS-scoped to the caller's org. The "holds a
-- report" arm is the same downward walk shared.is_manager_of does upward (UNION, cycle-safe) — a
-- lead is someone with at least one person somewhere below them, not merely a role with an empty
-- child. The "heads a unit" arm mirrors the app's buHeadsForViewer: the viewer holds a unit role
-- whose parent role is outside the unit or absent.
create or replace function mos.can_manage_definition(p_business_unit_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive
  mine as (
    select pr.role_id
    from shared.person_roles pr
    where pr.person_id = shared.current_person_id()
  ),
  downline as (
    select r.id
    from shared.roles r
    join mine on r.reports_to_role_id = mine.role_id
    union
    select child.id
    from shared.roles child
    join downline d on child.reports_to_role_id = d.id
  )
  select
    -- The unit must be the caller's org's before any role arm speaks: a foreign unit is false for
    -- everyone, admin included.
    (p_business_unit_id is null
     or exists (
       select 1 from shared.business_units bu
       where bu.id = p_business_unit_id and bu.org_id = shared.current_org_id()))
    and (
      shared.has_access_role('admin')
      or shared.has_access_role('ops_lead')
      or (
        p_business_unit_id is not null
        -- a lead …
        and (
          exists (
            select 1 from shared.person_roles held
            join downline d on d.id = held.role_id
            where held.person_id <> shared.current_person_id())
          or exists (
            select 1 from mine
            join shared.roles r on r.id = mine.role_id
            left join shared.roles parent on parent.id = r.reports_to_role_id
            where r.business_unit_id is not null
              and (parent.id is null or parent.business_unit_id is distinct from r.business_unit_id))
        )
        -- … in a unit they belong to
        and (
          exists (
            select 1 from mine
            join shared.roles r on r.id = mine.role_id
            where r.business_unit_id = p_business_unit_id)
          or exists (
            select 1 from shared.team_memberships m
            join shared.teams t on t.id = m.team_id
            where m.person_id = shared.current_person_id()
              and m.effective_to is null
              and t.archived_at is null
              and t.business_unit_id = p_business_unit_id)
        )
      )
    )
$$;
comment on function mos.can_manage_definition(uuid) is
  'Definition write gate (#801, OD-WAY-97): admin and ops_lead anywhere (null unit included); a '
  'lead — holds at least one report below them, or heads a Business unit — in a unit where they '
  'hold a role or a live Team membership. False for a null unit otherwise, and false for a unit '
  'outside the caller''s org. SECURITY INVOKER.';
revoke execute on function mos.can_manage_definition(uuid) from public, anon;
grant  execute on function mos.can_manage_definition(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The Process-definition gate: cadence and step definitions
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function mos.can_manage_process_definition(p_work_line_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    shared.has_access_role('admin')
    or shared.has_access_role('ops_lead')
    or exists (
      select 1 from mos.work_lines w
      where w.id = p_work_line_id
        and w.org_id = shared.current_org_id()
        and w.accountable_person_id = shared.current_person_id())
$$;
comment on function mos.can_manage_process_definition(uuid) is
  'Cadence and step-definition write gate (#801): the Process''s Accountable person, admin or '
  'ops_lead. A lead of the Process''s unit who is not its A does not qualify. SECURITY INVOKER.';
revoke execute on function mos.can_manage_process_definition(uuid) from public, anon;
grant  execute on function mos.can_manage_process_definition(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. work_lines: type defaults to project and locks once an occurrence exists
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table mos.work_lines alter column type set default 'project';

create or replace function mos._guard_work_lines()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_acc_org  uuid;
  v_resp_org uuid;
begin
  if new.objective_id is not null then
    if not exists (
      select 1 from mos.objectives o
      where o.id = new.objective_id and o.org_id = new.org_id
    ) then
      raise exception 'objective_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  -- Every arm is guarded on `is not null` because all three columns are nullable, and a NULL means
  -- "not set" rather than "set to nothing" — the lookup would return NULL and the comparison would
  -- report a tenancy violation for a value the caller never supplied.
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if new.accountable_person_id is not null then
    select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
    if v_acc_org is distinct from new.org_id then
      raise exception 'accountable_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if new.responsible_person_id is not null then
    select p.org_id into v_resp_org from shared.people p where p.id = new.responsible_person_id;
    if v_resp_org is distinct from new.org_id then
      raise exception 'responsible_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- TYPE LOCK (#801 AC-005). A Process with a run has generated Tasks that carry its
    -- occurrence; re-labelling it a Project would orphan them.
    if new.type is distinct from old.type
       and exists (select 1 from mos.process_runs r where r.work_line_id = new.id) then
      raise exception 'type is locked once an occurrence exists' using errcode = '42501';
    end if;

    -- THE OLD UNIT DECIDES (#801 AC-003). The UPDATE policy's WITH CHECK reads the NEW row, so a
    -- lead could pull a row out of a unit they do not manage by re-pointing business_unit_id to
    -- one they do. Scoped to current_user='authenticated', the direct-write path: seeds and the
    -- SECURITY DEFINER RPCs run as the owner and are not the writer this arm gates.
    if current_user = 'authenticated'
       and new.business_unit_id is distinct from old.business_unit_id
       and not (shared.can('workline.manage') or mos.can_manage_definition(old.business_unit_id)) then
      raise exception 'the definition''s current unit is not one you manage' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
comment on function mos._guard_work_lines() is
  'The ONE guard on mos.work_lines (DD-WAY-15, #801): the Objective, the business unit and the '
  'Accountable/Responsible people must all belong to the Project/Process''s OWN org (42501); type '
  'is locked once a process_run exists (42501); on a direct UPDATE that moves the row to another '
  'unit, the OLD unit must be one the writer manages (42501). SECURITY INVOKER.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Objectives carry ownership
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table mos.objectives
  add column business_unit_id      uuid references shared.business_units(id),
  add column accountable_person_id uuid references shared.people(id),
  add column period_year           int;
comment on column mos.objectives.business_unit_id is
  'The unit the Objective belongs to (#801). Nullable: an org-wide Objective has none, and is then admin/ops_lead-writable only. Same-org enforced by mos._guard_objectives.';
comment on column mos.objectives.accountable_person_id is
  'The Objective''s owner (#801). Nullable. Same-org enforced by mos._guard_objectives.';
comment on column mos.objectives.period_year is
  'The year the Objective is set for (#801). Nullable.';

create or replace function mos._guard_objectives()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org  uuid;
  v_acc_org uuid;
begin
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if new.accountable_person_id is not null then
    select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
    if v_acc_org is distinct from new.org_id then
      raise exception 'accountable_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  -- Same shape as mos._guard_work_lines: the OLD unit decides a move.
  if tg_op = 'UPDATE'
     and current_user = 'authenticated'
     and new.business_unit_id is distinct from old.business_unit_id
     and not (shared.can('objective.manage') or mos.can_manage_definition(old.business_unit_id)) then
    raise exception 'the definition''s current unit is not one you manage' using errcode = '42501';
  end if;

  return new;
end;
$$;
comment on function mos._guard_objectives() is
  'The ONE guard on mos.objectives (#801): the business unit and the Accountable person must belong '
  'to the Objective''s OWN org (42501); on a direct UPDATE that moves the row to another unit, the '
  'OLD unit must be one the writer manages (42501). SECURITY INVOKER.';

create trigger objectives_guard
  before insert or update on mos.objectives
  for each row execute function mos._guard_objectives();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Policies — the capability grants stay; the predicate widens them
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- USING stays org-only on the two catalogs so an unauthorised edit is a 42501 from WITH CHECK,
-- never a silent no-op (mos_03 pins that shape). The cadence/task-def gate stays in USING as
-- before, so a plain member's edit remains the silent no-op mos_03 pins there.
drop policy objectives_insert_can_manage on mos.objectives;
drop policy objectives_update_can_manage on mos.objectives;
drop policy work_lines_insert_can_manage on mos.work_lines;
drop policy work_lines_update_can_manage on mos.work_lines;
drop policy process_cadences_insert_ops_lead_or_admin  on mos.process_cadences;
drop policy process_cadences_update_ops_lead_or_admin  on mos.process_cadences;
drop policy process_task_defs_insert_ops_lead_or_admin on mos.process_task_defs;
drop policy process_task_defs_update_ops_lead_or_admin on mos.process_task_defs;

create policy objectives_insert_can_manage_or_unit_lead on mos.objectives
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and (shared.can('objective.manage') or mos.can_manage_definition(business_unit_id)));

create policy objectives_update_can_manage_or_unit_lead on mos.objectives
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id()
              and (shared.can('objective.manage') or mos.can_manage_definition(business_unit_id)));

create policy work_lines_insert_can_manage_or_unit_lead on mos.work_lines
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and (shared.can('workline.manage') or mos.can_manage_definition(business_unit_id)));

create policy work_lines_update_can_manage_or_unit_lead on mos.work_lines
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id()
              and (shared.can('workline.manage') or mos.can_manage_definition(business_unit_id)));

comment on policy work_lines_insert_can_manage_or_unit_lead on mos.work_lines is
  'Creating a Project/Process needs workline.manage or mos.can_manage_definition on its unit (#801). The Objective''s tenancy is enforced by mos._guard_work_lines, not here: a WITH CHECK cannot join to another table''s org without re-opening the read.';

create policy process_cadences_insert_ops_lead_or_admin_or_process_a on mos.process_cadences
  for insert to authenticated
  with check (org_id = shared.current_org_id() and mos.can_manage_process_definition(work_line_id));
create policy process_cadences_update_ops_lead_or_admin_or_process_a on mos.process_cadences
  for update to authenticated
  using      (org_id = shared.current_org_id() and mos.can_manage_process_definition(work_line_id))
  with check (org_id = shared.current_org_id() and mos.can_manage_process_definition(work_line_id));

create policy process_task_defs_insert_ops_lead_or_admin_or_process_a on mos.process_task_defs
  for insert to authenticated
  with check (org_id = shared.current_org_id() and mos.can_manage_process_definition(work_line_id));
create policy process_task_defs_update_ops_lead_or_admin_or_process_a on mos.process_task_defs
  for update to authenticated
  using      (org_id = shared.current_org_id() and mos.can_manage_process_definition(work_line_id))
  with check (org_id = shared.current_org_id() and mos.can_manage_process_definition(work_line_id));
