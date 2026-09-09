-- Task completion clock (OD-WAY-94 #6).
--
-- Done is not a permanent default queue. My work and Team work retain Done rows only for seven
-- days from the DB-managed completed_at timestamp; All and an explicit Completed view retain the
-- full history. Existing Done rows are deliberately NOT backfilled: their completion date is not
-- known, so completed_at NULL is treated as stale by those live-work selectors.
--
-- DOWN (reversible): drop trigger tasks_completion_clock on mos.tasks; drop function
-- mos._stamp_task_completion(); drop index if exists tasks_completed_at_idx; alter table mos.tasks
-- drop column completed_at;

alter table mos.tasks
  add column if not exists completed_at timestamptz;

comment on column mos.tasks.completed_at is
  'DB-managed completion timestamp. Set when status enters Done, cleared when it leaves Done, and intentionally NULL for legacy Done rows whose completion time is unknown.';

create index if not exists tasks_completed_at_idx
  on mos.tasks (org_id, completed_at)
  where status = 'Done' and archived_at is null;

create or replace function mos._stamp_task_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- A caller cannot choose historical completion time. New Done rows start their clock now;
    -- non-Done rows must not carry a misleading completion timestamp.
    new.completed_at := case when new.status = 'Done' then now() else null end;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.completed_at := case when new.status = 'Done' then now() else null end;
  elsif new.completed_at is distinct from old.completed_at then
    -- Keep the field DB-managed even when a client includes it in a generic update payload.
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;

comment on function mos._stamp_task_completion() is
  'DB-managed Task completion clock: status entering Done stamps now(), leaving Done clears it, and direct completed_at edits are ignored. Legacy Done rows with NULL remain NULL until a real transition.';

create trigger tasks_completion_clock
  before insert or update on mos.tasks
  for each row execute function mos._stamp_task_completion();
