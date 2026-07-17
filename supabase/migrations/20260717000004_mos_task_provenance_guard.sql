-- SECURITY LOW-1 (Step 6 fix wave, occurrence-as-tasks review) — provenance write-guard on
-- mos.tasks. process_run_id / generated_from_task_def_id are additive/nullable (D10) and only
-- FK-checked for same-org (mos._guard_task_cascade_refs); nothing stopped an ordinary member from
-- stamping a REAL, same-org run/def id onto a direct INSERT/UPDATE via the existing
-- tasks_insert_member / tasks_update_editor RLS policies — forging "this Task came from a
-- recurring process occurrence" provenance that should only ever be RPC-stamped
-- (mos.spawn_process_run / mos.resolve_pending_task, both SECURITY DEFINER).
--
-- Mirrors the ADR-0016 shared._guard_people idiom (20260626000001): scope the block to
-- `current_user = 'authenticated'`, the exact RPC-only seam. A direct app write runs as the
-- `authenticated` role; the spawn/resolve DEFINER RPCs (and any privileged seed) run as the
-- function owner (`postgres` on the local stack) while INSERTing/UPDATEing mos.tasks from inside
-- the DEFINER body, so current_user there is NOT 'authenticated' and the guard is a no-op —
-- confirmed by the existing spawn/resolve pgTAP coverage staying green (91/93/94/95).
create or replace function mos._guard_task_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
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
  return new;
end;
$$;
comment on function mos._guard_task_provenance() is
  'Guard (SECURITY LOW-1, Step 6 fix wave): process_run_id/generated_from_task_def_id are RPC-only provenance — a direct authenticated INSERT/UPDATE stamping either column is rejected (42501). Scoped to current_user=''authenticated'' (mirrors shared._guard_people, ADR-0016) so the spawn/resolve SECURITY DEFINER RPCs remain unaffected. SECURITY INVOKER.';

drop trigger if exists tasks_guard_provenance on mos.tasks;
create trigger tasks_guard_provenance
  before insert or update on mos.tasks
  for each row execute function mos._guard_task_provenance();

-- DOWN: drop trigger tasks_guard_provenance on mos.tasks; drop function mos._guard_task_provenance();
