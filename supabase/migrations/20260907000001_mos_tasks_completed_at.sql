-- #752 (OD-WAY-94 rule 6): My work and Team work show live work — a Done task ages out 7 days
-- after completion; All shows every non-archived row. Row has no completion clock, so add one:
-- mos.tasks gains a nullable completed_at, and the existing merged guard (mos._guard_tasks)
-- stamps it. Not a second trigger — the ticket names the merged guard as the one home for this
-- rule, so the completed_at clause joins (A)..(F) as (G).
--
-- Semantics stamped by the guard:
--   • INSERT status='Done'                     → completed_at := now()
--   • INSERT status<>'Done'                    → completed_at := null
--   • UPDATE status  Open/InP/Blocked → Done   → completed_at := now()
--   • UPDATE status  Done → Open/InP/Blocked   → completed_at := null
--   • UPDATE status Done → Done                → completed_at unchanged (kept from OLD; a
--                                                caller-supplied override is discarded so
--                                                the stamp cannot be forged or back-dated)
--   • UPDATE status unchanged, not Done        → completed_at := null (defensive: keeps the
--                                                invariant "completed_at is set ⇔ status='Done'"
--                                                even against a caller who tries to sneak a
--                                                value in without a status change)
--
-- The value is guard-owned end to end for authenticated writers: every path here reassigns
-- new.completed_at before RETURN NEW, so the column cannot be forged. The (G) clause is scoped
-- to current_user='authenticated' — the same seam the (C)/(E)/(F) clauses use — so a service
-- role (dev seed, migration backfill) can seed explicit completed_at values on Done rows, and
-- the SECURITY DEFINER RPCs stay untouched (they run as the function owner, not 'authenticated',
-- and today none of them writes status='Done' anyway).
--
-- DOWN:
--   create or replace function mos._guard_tasks() with the pre-#752 body from
--   20260905000003_mos_task_permission_rules.sql (drop the completed_at (G) clause); then
--   alter table mos.tasks drop column completed_at;
--
-- Executable DOWN, verbatim:
--   -- alter table mos.tasks drop column completed_at;
--   -- (then re-run the mos._guard_tasks CREATE OR REPLACE from
--   --  20260905000003_mos_task_permission_rules.sql to restore the pre-#752 body.)

alter table mos.tasks add column completed_at timestamptz;

comment on column mos.tasks.completed_at is
  'When status became ''Done'' (mos._guard_tasks (G)). NULL for every non-Done row. '
  'Stamped and cleared by the guard so it cannot be forged: a direct write''s value is discarded.';

create index tasks_completed_at_idx on mos.tasks (completed_at) where completed_at is not null;

-- Backfill: existing Done rows in the database get an approximate completion timestamp so the
-- aging-out rule has a value to read from day one. Best available signal is updated_at (the
-- guard could not have run when these rows became Done because it did not exist yet). The dev
-- seed's two Done rows carry an explicit completed_at (seed.dev-tasks.sql) — this backfill only
-- matters for any real Done row that predates this migration.
update mos.tasks set completed_at = updated_at where status = 'Done' and completed_at is null;

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
  -- it any member could stamp a real same-org run id and forge "this came from a process
  -- occurrence" — the same idiom as shared._guard_people's user_id block.
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
  -- new one — so an editor who passes the gate could otherwise re-attribute authorship, including
  -- to a foreign-org person.
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
  -- An empty array produces no rows from unnest, so the outer EXISTS is false and it passes.
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
  -- the new PIC must be the writer or a person in the writer's downline — the existing manager
  -- chain walk, direction reversed: is_manager_of(new PIC) is true iff the writer manages the new
  -- PIC. Reads OLD so the check fires only when responsible_person_id actually changes. Runs LAST,
  -- after the same-org checks above, so a cross-org PIC value is refused as 23514 (an internally
  -- inconsistent row) rather than 42501 — the (D) checks already caught it and own that code.
  -- Scoped to current_user='authenticated' for the same reason as (C): a SECURITY DEFINER RPC
  -- (mos.spawn_process_run) and a `reset role` test fixture both assign a PIC the session itself
  -- did not choose, and neither is the direct-write path this clause exists to gate.
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

  -- (F) CREATED BY IS THE CALLER ON A DIRECT INSERT (#742 delta). The column default only fills
  -- created_by when the insert OMITS it; without this a direct writer could name someone else as
  -- the author explicitly. Scoped to current_user='authenticated' for the same reason as (C)/(E):
  -- the SECURITY DEFINER spawn/resolve RPCs stamp authorship on the session's behalf and must
  -- pass through untouched. Runs after the (D) same-org checks, like (E), so a cross-org
  -- created_by is refused as 23514 by (D) — the internally-inconsistent-row code — before this
  -- caller-identity clause ever speaks.
  if current_user = 'authenticated' and tg_op = 'INSERT' then
    if new.created_by is distinct from shared.current_person_id() then
      raise exception 'created_by must be the caller on a direct insert' using errcode = '42501';
    end if;
  end if;

  -- (G) COMPLETION CLOCK (#752 AC-015). Scoped to current_user='authenticated' for the same
  -- reason as (C)/(E)/(F): a direct app write runs as 'authenticated', while the SECURITY
  -- DEFINER RPCs and the dev-seed writer run as their function/role owner — those paths already
  -- assign completion timestamps intentionally (the seed's back-dated Done rows are the visible
  -- case) and must pass through untouched. Within the authenticated seam the trigger owns
  -- completed_at end to end: every path reassigns new.completed_at before RETURN NEW, so a
  -- caller cannot forge or back-date the stamp. The invariant is
  -- "completed_at is set ⇔ status='Done'", enforced on INSERT and on every UPDATE regardless
  -- of what the caller wrote in the SET list. A Done→Done edit keeps OLD.completed_at (the
  -- original completion moment survives an unrelated field edit); every other transition
  -- either stamps now() or clears it.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.status = 'Done' then
        new.completed_at := now();
      else
        new.completed_at := null;
      end if;
    elsif tg_op = 'UPDATE' then
      if new.status = 'Done' and old.status <> 'Done' then
        new.completed_at := now();
      elsif new.status <> 'Done' then
        new.completed_at := null;
      else
        -- Done → Done (or the row was already Done). Preserve the original stamp; a caller-supplied
        -- override is discarded here so the value can never be moved from what the guard set.
        new.completed_at := old.completed_at;
      end if;
    end if;
  end if;

  return new;
end;
$$;
comment on function mos._guard_tasks() is
  'The ONE guard on mos.tasks, merged from four and narrowed by #742 and extended by #752 '
  '(archive gate, cascade/occurrence same-org, RPC-only provenance, directory tenancy + '
  'immutability, PIC value, created_by is the caller on a direct insert, completion clock). '
  'Archive requires Supervisor or a manager above the PIC (42501); objective/work_line/process_run '
  'must be same-org (42501); process_run_id and generated_from_task_def_id are RPC-only (42501); '
  'created_by/org_id immutable on UPDATE and created_by equal to the caller on INSERT (42501); on '
  'INSERT and on any UPDATE that changes the PIC, the new PIC must be the writer or a person in '
  'the writer''s downline (42501); BU, R, A, created_by, the consulted/informed arrays and a '
  'supplied team_id must be same-org, and team BU must equal task BU (23514). completed_at is '
  'guard-owned: stamped now() on the transition into Done, cleared on the transition out, '
  'preserved across a Done→Done update; a caller-supplied value is discarded. SECURITY INVOKER — '
  'every reference it checks is org-readable, so a cross-org id is invisible and the lookup '
  'fails closed.';
