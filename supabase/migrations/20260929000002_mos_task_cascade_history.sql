-- Change history batch 2a — the task cascade (#986, Slice 2 of the change-history rollout on the
-- ADR-0059 mechanism from 20260929000001). Attaches the one generic trigger to the six
-- task-cascade tables and registers their read arms in shared.can_read_history_record. No shape
-- changes: the mechanism, its grants and its policy are Slice 1's and are not restated here.
--
--   mos.tasks                    — the one table-specific mechanical exclude lives here:
--                                  '-last_activity_at' omits the clock mos._touch_task_last_activity
--                                  bumps whenever a task_event lands (and any direct clock write);
--                                  no human edits it, so it is never a change. The default uuid id
--                                  key applies. Real columns changed by the same statement still
--                                  record normally.
--   mos.task_checklist_items, mos.process_cadences, mos.process_task_defs, mos.process_runs,
--   mos.process_run_pending_tasks — plain registrations; the default uuid id key and the built-in
--                                  exclude list (id / org_id / created_at / updated_at) are the
--                                  whole registration.
--
-- None of the six hard-deletes — authenticated holds select/insert/update at most
-- (20260805000006_mos_access_control.sql), and the runs + pending rows are select-only — so the
-- DELETE branch stays inert for this batch and no delete arm is registered: a delete row, if one
-- ever existed, fails closed until its snapshot arm is wired.
--
-- DOWN (restore the pre-batch shape; the mechanism itself stays):
--   drop trigger record_history_tasks on mos.tasks;
--   drop trigger record_history_task_checklist_items on mos.task_checklist_items;
--   drop trigger record_history_process_cadences on mos.process_cadences;
--   drop trigger record_history_process_task_defs on mos.process_task_defs;
--   drop trigger record_history_process_runs on mos.process_runs;
--   drop trigger record_history_process_run_pending_tasks on mos.process_run_pending_tasks;
--   -- then create or replace function shared.can_read_history_record(text, text, text, text, jsonb)
--   -- back to its pre-batch body (the Slice-1 arms only):
--   --   create or replace function shared.can_read_history_record(
--   --     p_schema     text,
--   --     p_table      text,
--   --     p_record_key text,
--   --     p_action     text,
--   --     p_snapshot   jsonb
--   --   )
--   --   returns boolean
--   --   language plpgsql
--   --   stable
--   --   security invoker
--   --   set search_path = ''
--   --   as $$
--   --   begin
--   --     if p_action in ('insert', 'update') then
--   --       case
--   --         when p_schema = 'mos' and p_table = 'objectives' then
--   --           return exists (
--   --             select 1 from mos.objectives o
--   --             where o.id::text = p_record_key
--   --               and o.org_id = shared.current_org_id());
--   --         when p_schema = 'mos' and p_table = 'work_lines' then
--   --           return exists (
--   --             select 1 from mos.work_lines w
--   --             where w.id::text = p_record_key
--   --               and w.org_id = shared.current_org_id());
--   --         else
--   --           return false;
--   --       end case;
--   --     end if;
--   --     -- p_action = 'delete': no audited table hard-deletes; every delete row fails closed.
--   --     return false;
--   --   end;
--   --   $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Wire the six task-cascade tables (batch 2a)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Observer triggers alongside each table's existing BEFORE guard, exactly as Slice 1 wired
-- objectives and work_lines. mos.tasks registers its mechanical clock; the other five take the
-- bare default.
create trigger record_history_tasks
  after insert or update or delete on mos.tasks
  for each row execute function shared._record_history_write('-last_activity_at');

create trigger record_history_task_checklist_items
  after insert or update or delete on mos.task_checklist_items
  for each row execute function shared._record_history_write();

create trigger record_history_process_cadences
  after insert or update or delete on mos.process_cadences
  for each row execute function shared._record_history_write();

create trigger record_history_process_task_defs
  after insert or update or delete on mos.process_task_defs
  for each row execute function shared._record_history_write();

create trigger record_history_process_runs
  after insert or update or delete on mos.process_runs
  for each row execute function shared._record_history_write();

create trigger record_history_process_run_pending_tasks
  after insert or update or delete on mos.process_run_pending_tasks
  for each row execute function shared._record_history_write();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The read dispatch — the six new arms join the registry; everything else still fails closed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The whole body is restated (create or replace has no per-arm edit): each arm is the table's own
-- read predicate — for every table in this batch, plain org membership over a live lookup by
-- record_key, the same shape as the Slice-1 arms.
create or replace function shared.can_read_history_record(
  p_schema     text,
  p_table      text,
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    case
      when p_schema = 'mos' and p_table = 'objectives' then
        return exists (
          select 1 from mos.objectives o
          where o.id::text = p_record_key
            and o.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'work_lines' then
        return exists (
          select 1 from mos.work_lines w
          where w.id::text = p_record_key
            and w.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'tasks' then
        return exists (
          select 1 from mos.tasks t
          where t.id::text = p_record_key
            and t.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'task_checklist_items' then
        return exists (
          select 1 from mos.task_checklist_items c
          where c.id::text = p_record_key
            and c.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'process_cadences' then
        return exists (
          select 1 from mos.process_cadences pc
          where pc.id::text = p_record_key
            and pc.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'process_task_defs' then
        return exists (
          select 1 from mos.process_task_defs pd
          where pd.id::text = p_record_key
            and pd.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'process_runs' then
        return exists (
          select 1 from mos.process_runs pr
          where pr.id::text = p_record_key
            and pr.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'process_run_pending_tasks' then
        return exists (
          select 1 from mos.process_run_pending_tasks pp
          where pp.id::text = p_record_key
            and pp.org_id = shared.current_org_id());
      else
        return false;
    end case;
  end if;
  -- p_action = 'delete' (or anything unrecognized): the snapshot arm registers hard-deletable
  -- tables as their batches wire them. No audited table hard-deletes yet, so nothing is named
  -- here and every delete row fails closed (FR-013, NFR-007).
  return false;
end;
$$;
