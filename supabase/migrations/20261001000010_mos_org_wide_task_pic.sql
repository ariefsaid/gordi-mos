-- Org-wide roles may name any same-org person as a Task PIC (#1172, OD-ROLE-1).
--
-- shared.is_org_wide(): the session holds the admin access role or the top-of-chain role (a role
-- that reports to no other role) — the same two facts the app reads as "org-wide".
-- mos._guard_tasks clause (E) lets an org-wide writer name any person on insert or PIC change; the
-- same-org checks above it still bind. Every other writer keeps writer-or-downline. Edit and
-- archive gates (can_edit_task, clause (A)) are unchanged.
--
-- DOWN: restore mos._guard_tasks() from 20260908000001_mos_tasks_completion_clock.sql, then
--   drop function shared.is_org_wide();

create or replace function shared.is_org_wide()
returns boolean
language sql
stable
set search_path = ''
as $$
  select shared.has_access_role('admin')
    or exists (
      select 1
      from shared.person_roles pr
      join shared.roles r on r.id = pr.role_id
      where pr.person_id = shared.current_person_id()
        and r.reports_to_role_id is null
    )
$$;
comment on function shared.is_org_wide() is
  'True iff the session holds the admin access role or the top-of-chain role (reports to no role): '
  'the org-wide roles that act across every Team. SECURITY INVOKER; reads the caller''s own role rows.';

create or replace function mos._guard_tasks()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org      uuid;
  v_resp_org    uuid;
  v_acc_org     uuid;
  v_creator_org uuid;
  v_team_org    uuid;
  v_team_bu     uuid;
begin
  -- (A) ARCHIVE GATE (ADR-0004 D2, narrowed #742 AC-057). Supervisor or a manager above the PIC —
  -- a manager of the Supervisor alone no longer qualifies (same narrowing as can_edit_task).
  -- Covers archive and unarchive symmetrically, and reads OLD so a caller cannot re-point
  -- PIC/Supervisor in the same statement to grant themselves the right they lack.
  if tg_op = 'UPDATE' and new.archived_at is distinct from old.archived_at then
    if not (
      old.accountable_person_id = shared.current_person_id()
      or shared.is_manager_of(old.responsible_person_id)
    ) then
      raise exception 'archive requires Supervisor or a manager above the PIC' using errcode = '42501';
    end if;
  end if;

  -- (B) CASCADE + OCCURRENCE REFERENCES ARE SAME-ORG (NFR-201). Existence-only FKs.
  if new.objective_id is not null and not exists (
    select 1 from mos.objectives where id = new.objective_id and org_id = new.org_id) then
    raise exception 'objective_id belongs to a different org' using errcode = '42501';
  end if;
  if new.work_line_id is not null and not exists (
    select 1 from mos.work_lines where id = new.work_line_id and org_id = new.org_id) then
    raise exception 'work_line_id belongs to a different org' using errcode = '42501';
  end if;
  if new.process_run_id is not null and not exists (
    select 1 from mos.process_runs where id = new.process_run_id and org_id = new.org_id) then
    raise exception 'process_run_id belongs to a different org' using errcode = '42501';
  end if;

  -- (C) OCCURRENCE PROVENANCE IS RPC-ONLY (SECURITY LOW-1). Scoped to current_user='authenticated',
  -- which IS the RPC-only seam: a direct app write runs as `authenticated`, while the spawn/resolve
  -- SECURITY DEFINER RPCs run as the function owner, so the block is a no-op inside them. Without
  -- it any member could stamp a real same-org run id and forge a process occurrence.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.process_run_id is not null or new.generated_from_task_def_id is not null then
        raise exception 'process_run_id / generated_from_task_def_id are set only by the process spawn/resolve RPCs, not a direct write'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.process_run_id is distinct from old.process_run_id
         or new.generated_from_task_def_id is distinct from old.generated_from_task_def_id then
        raise exception 'process_run_id / generated_from_task_def_id are immutable on a direct write'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- (D) IMMUTABILITY (round-2 audit A1). The tasks UPDATE policy's WITH CHECK evaluates
  -- can_edit_task(id), which re-reads the row BY ID and therefore sees the OLD created_by, never the
  -- new one — so an editor who passes the gate could otherwise re-attribute authorship.
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable on a task' using errcode = '42501';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a task' using errcode = '42501';
    end if;
  end if;

  -- (D) DIRECTORY REFERENCES ARE SAME-ORG (round-2 audit A1). A NULL in any NOT NULL column is left
  -- to the column constraint (23502) rather than pre-empted here, so the column rule keeps its own
  -- error contract.
  select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
  if v_bu_org is distinct from new.org_id then
    raise exception 'business_unit_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_resp_org from shared.people p where p.id = new.responsible_person_id;
  if v_resp_org is distinct from new.org_id then
    raise exception 'responsible_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
  if v_acc_org is distinct from new.org_id then
    raise exception 'accountable_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_creator_org from shared.people p where p.id = new.created_by;
  if v_creator_org is distinct from new.org_id then
    raise exception 'created_by must belong to the same org as the task' using errcode = '23514';
  end if;

  -- The RACI arrays are FK-free uuid[] columns, so they have no existence check at all without this.
  if exists (
    select 1 from unnest(new.consulted_person_ids) pid
    where not exists (select 1 from shared.people p where p.id = pid and p.org_id = new.org_id)
  ) then
    raise exception 'every consulted_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(new.informed_person_ids) pid
    where not exists (select 1 from shared.people p where p.id = pid and p.org_id = new.org_id)
  ) then
    raise exception 'every informed_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  -- (D) A supplied Team must be same-org AND its BU must equal the task's. NULL skips both, which is
  -- what keeps team_id genuinely optional (see the .HOLD disposition in ...0005).
  if new.team_id is not null then
    select tm.org_id, tm.business_unit_id into v_team_org, v_team_bu
      from shared.teams tm where tm.id = new.team_id;
    if v_team_org is distinct from new.org_id then
      raise exception 'team_id must belong to the same org as the task' using errcode = '23514';
    end if;
    if v_team_bu is distinct from new.business_unit_id then
      raise exception 'business_unit_id must equal the team''s business_unit_id' using errcode = '23514';
    end if;
  end if;

  -- (E) WHO MAY BE PIC (#742 AC-053/054/055; org-wide exemption #1172). On INSERT, and on any
  -- UPDATE that changes the PIC, the new PIC must be the writer, a person in the writer's
  -- downline, or ANY person when the writer is org-wide (shared.is_org_wide()). The same-org
  -- checks in (D) have already run, so an org-wide writer still cannot reach across orgs.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.responsible_person_id <> shared.current_person_id()
         and not shared.is_org_wide()
         and not shared.is_manager_of(new.responsible_person_id) then
        raise exception 'PIC must be the writer or a person in the writer''s downline' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' and new.responsible_person_id is distinct from old.responsible_person_id then
      if new.responsible_person_id <> shared.current_person_id()
         and not shared.is_org_wide()
         and not shared.is_manager_of(new.responsible_person_id) then
        raise exception 'PIC must be the writer or a person in the writer''s downline' using errcode = '42501';
      end if;
    end if;
  end if;

  -- (F) CREATED BY IS THE CALLER ON A DIRECT INSERT (#742 delta). SECURITY DEFINER spawn/resolve
  -- RPCs stamp authorship on the session's behalf and pass through untouched.
  if current_user = 'authenticated' and tg_op = 'INSERT' then
    if new.created_by is distinct from shared.current_person_id() then
      raise exception 'created_by must be the caller on a direct insert' using errcode = '42501';
    end if;
  end if;

  -- (G) COMPLETION CLOCK (#752 AC-015). The application cannot provide a completion timestamp:
  -- the guard owns it. RPC/seed roles may preserve an explicit historical value; authenticated
  -- writes always derive it from the status transition.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.status = 'Done' then
        new.completed_at := now();
      else
        new.completed_at := null;
      end if;
    elsif tg_op = 'UPDATE' then
      if new.status = 'Done' and old.status is distinct from 'Done' then
        new.completed_at := now();
      elsif new.status is distinct from 'Done' then
        new.completed_at := null;
      else
        new.completed_at := old.completed_at;
      end if;
    end if;
  end if;

  return new;
end;
$$;
comment on function mos._guard_tasks() is
  'The ONE guard on mos.tasks, merged from four and narrowed once more by #742, with the #752 '
  'guard-owned completion clock (archive gate, cascade/occurrence same-org, RPC-only provenance, '
  'directory tenancy + immutability, PIC value, created_by caller, and Done transition clock). '
  'Archive requires Supervisor or a manager above the PIC (42501); objective/work_line/process_run '
  'must be same-org (42501); process_run_id and generated_from_task_def_id are RPC-only (42501); '
  'created_by/org_id immutable on UPDATE and created_by equal to the caller on INSERT (42501); '
  'on INSERT and on any UPDATE that changes the PIC, the new PIC must be the writer, a person in '
  'the writer''s downline, or anyone in the org when the writer is org-wide (42501); BU, R, A, created_by, the consulted/informed arrays and a '
  'supplied team_id must be same-org, and team BU must equal task BU (23514). For authenticated '
  'writes, completed_at is now() only when status enters Done, null otherwise. SECURITY INVOKER.';
