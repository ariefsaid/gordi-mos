-- DOWN for 20261024001100. Restores the org-readable Task policies and the previous comments and
-- signal_tasks policies. Refuses while any Task is private, because the restored policies would
-- make every private Task, checklist, event, comment and Signal link readable org-wide.
begin;
do $$
begin
  if exists (select 1 from mos.tasks where is_private) then
    raise exception 'Rollback refused: make every private Task public (or archive the data) first';
  end if;
end $$;
drop policy tasks_select_readable on mos.tasks;
create policy tasks_select_org on mos.tasks
  for select to authenticated using (org_id = (select shared.current_org_id()));
drop policy task_checklist_select_readable on mos.task_checklist_items;
create policy task_checklist_select_org on mos.task_checklist_items
  for select to authenticated using (org_id = (select shared.current_org_id()));
drop policy task_events_select_readable on mos.task_events;
create policy task_events_select_org on mos.task_events
  for select to authenticated using (org_id = (select shared.current_org_id()));
drop policy comments_select on mos.comments;
create policy comments_select on mos.comments
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and case entity_type
      when 'task' then exists (
        select 1 from mos.tasks parent
         where parent.id = mos.comments.entity_id and parent.org_id = mos.comments.org_id)
      when 'signal' then mos.can_read_signal(entity_id)
      when 'weekly_update' then exists (
        select 1 from mos.weekly_updates parent
         where parent.id = mos.comments.entity_id and parent.org_id = mos.comments.org_id)
      when 'follow_up' then exists (
        select 1 from mos.follow_ups parent
         where parent.id = mos.comments.entity_id and parent.org_id = mos.comments.org_id)
      when 'daily_log' then exists (
        select 1 from ops.kitchen_logs parent
         where parent.id = mos.comments.entity_id and parent.org_id = mos.comments.org_id)
      else false
    end
  );
comment on policy comments_select on mos.comments is
  'Comments follow their parent row visibility and organization boundary.';
drop policy signal_tasks_select on mos.signal_tasks;
create policy signal_tasks_select on mos.signal_tasks
  for select to authenticated using (mos.can_read_signal(signal_id));
drop policy signal_tasks_insert on mos.signal_tasks;
create policy signal_tasks_insert on mos.signal_tasks
  for insert to authenticated
  with check (org_id = (select shared.current_org_id())
              and created_by = (select shared.current_person_id())
              and mos.can_read_signal(signal_id));
commit;
