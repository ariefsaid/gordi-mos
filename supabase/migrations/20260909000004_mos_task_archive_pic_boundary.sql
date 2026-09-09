-- Task archive/unarchive boundary for OD-WAY-94.
--
-- 20260908000001 replaces mos._guard_tasks() with the completion-clock version, so this is an
-- additive trigger rather than another copy of that large guard. The existing tasks_guard keeps
-- the Supervisor/manager-above-PIC gate; this seam closes the remaining case where the PIC has
-- also been assigned as Supervisor and could therefore pass that gate.
--
-- DOWN (manual, before production):
--   drop trigger if exists tasks_archive_pic_boundary_guard on mos.tasks;
--   revoke execute on function mos._guard_task_archive_pic_boundary() from public, anon, authenticated;
--   drop function if exists mos._guard_task_archive_pic_boundary();

create or replace function mos._guard_task_archive_pic_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Read OLD so a PIC cannot change the RACI fields and archive/unarchive in one UPDATE. The
  -- existing guard separately decides whether a non-PIC actor is the Supervisor or above the PIC.
  if old.responsible_person_id = shared.current_person_id() then
    raise exception 'archive requires Supervisor or a manager above the PIC' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_task_archive_pic_boundary() is
  'Additional OD-WAY-94 archive boundary: the current PIC cannot archive or unarchive the Task, '
  'even when also stored as its Supervisor. The existing mos._guard_tasks() retains the '
  'Supervisor/manager-above-PIC gate. SECURITY INVOKER.';
revoke execute on function mos._guard_task_archive_pic_boundary() from public, anon, authenticated;

create trigger tasks_archive_pic_boundary_guard
  before update of archived_at on mos.tasks
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function mos._guard_task_archive_pic_boundary();
