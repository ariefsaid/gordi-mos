-- #752 — completion clock for the live-work window (AC-015/016).
-- UP: add the nullable clock, backfill existing Done rows from updated_at, and extend the ONE
-- mos.tasks guard so authenticated writes cannot forge or retain a stale completion timestamp.
-- DOWN: restore mos._guard_tasks() from 20260905000003_mos_task_permission_rules.sql, then run:
--   drop index if exists mos.tasks_completed_at_idx;
--   alter table mos.tasks drop column completed_at;

alter table mos.tasks add column completed_at timestamptz;
comment on column mos.tasks.completed_at is
  'Guard-owned completion clock (#752): stamped when status enters Done, cleared when it leaves Done; nullable on every non-Done task.';

create index tasks_completed_at_idx
  on mos.tasks (org_id, completed_at)
  where status = 'Done' and completed_at is not null;

-- Existing Done rows have no transition for the new guard to observe. updated_at is the only
-- available historical clock, so it is the conservative backfill; newly completed rows are
-- stamped with now() by the replacement guard below.
update mos.tasks
set completed_at = updated_at
where status = 'Done' and completed_at is null;

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

  -- (E) WHO MAY BE PIC (#742 AC-053/054/055). On INSERT, and on any UPDATE that changes the PIC,
  -- the new PIC must be the writer or a person in the writer's downline.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.responsible_person_id <> shared.current_person_id()
         and not shared.is_manager_of(new.responsible_person_id) then
        raise exception 'PIC must be the writer or a person in the writer''s downline' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' and new.responsible_person_id is distinct from old.responsible_person_id then
      if new.responsible_person_id <> shared.current_person_id()
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
  'on INSERT and on any UPDATE that changes the PIC, the new PIC must be the writer or a person in '
  'the writer''s downline (42501); BU, R, A, created_by, the consulted/informed arrays and a '
  'supplied team_id must be same-org, and team BU must equal task BU (23514). For authenticated '
  'writes, completed_at is now() only when status enters Done, null otherwise. SECURITY INVOKER.';
