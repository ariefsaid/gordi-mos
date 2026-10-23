-- DOWN: run supabase/rollbacks/20261024001100_mos_private_task_read_paths.sql
-- Private Task (#1839): every Task read path follows mos.can_read_task.
-- Tasks, checklist, events, comments and Signal-to-Task links stop being org-readable for a private
-- Task. A public Task reads exactly as before: the tasks policy tests is_private first, so public
-- rows never pay for the function call. History readers, views, api_private/api_v1 functions and
-- the app's table reads are SECURITY INVOKER and read mos.tasks / the children through these
-- policies, so they follow without change.

drop policy tasks_select_org on mos.tasks;
create policy tasks_select_readable on mos.tasks
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (
      not is_private
      -- Inline creator arm: a stable function cannot see the row its own statement is inserting,
      -- so INSERT ... RETURNING of a private Task would fail without it.
      or created_by = (select shared.current_person_id())
      or mos.can_read_task(id)
    )
  );
comment on policy tasks_select_readable on mos.tasks is
  'Org-readable, except a private Task reads only for who mos.can_read_task allows (#1839); the creator arm is inline so INSERT ... RETURNING works.';

drop policy task_checklist_select_org on mos.task_checklist_items;
create policy task_checklist_select_readable on mos.task_checklist_items
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and mos.can_read_task(task_id));

drop policy task_events_select_org on mos.task_events;
create policy task_events_select_readable on mos.task_events
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and mos.can_read_task(task_id));

drop policy comments_select on mos.comments;
create policy comments_select on mos.comments
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and case entity_type
      when 'task' then mos.can_read_task(entity_id)
      when 'signal' then mos.can_read_signal(entity_id)
      when 'weekly_update' then exists (
        select 1 from mos.weekly_updates parent
         where parent.id = mos.comments.entity_id
           and parent.org_id = mos.comments.org_id
      )
      when 'follow_up' then exists (
        select 1 from mos.follow_ups parent
         where parent.id = mos.comments.entity_id
           and parent.org_id = mos.comments.org_id
      )
      when 'daily_log' then exists (
        select 1 from ops.kitchen_logs parent
         where parent.id = mos.comments.entity_id
           and parent.org_id = mos.comments.org_id
      )
      else false
    end
  );
comment on policy comments_select on mos.comments is
  'Comments follow their parent row visibility and organization boundary; Task comments follow mos.can_read_task.';

-- A Signal-to-Task link is readable only by someone who can read both ends, so a Signal reader
-- sees no trace of a private Task; linking needs both ends readable too.
drop policy signal_tasks_select on mos.signal_tasks;
create policy signal_tasks_select on mos.signal_tasks
  for select to authenticated
  using (mos.can_read_signal(signal_id) and mos.can_read_task(task_id));

drop policy signal_tasks_insert on mos.signal_tasks;
create policy signal_tasks_insert on mos.signal_tasks
  for insert to authenticated
  with check (org_id = (select shared.current_org_id())
              and created_by = (select shared.current_person_id())
              and mos.can_read_signal(signal_id)
              and mos.can_read_task(task_id));
