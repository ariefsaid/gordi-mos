-- An org-wide creator may log the `created` event of a Task they just assigned outside their own
-- reporting line (#1172, OD-ROLE-1).
--
-- The org-wide PIC exemption in mos._guard_tasks lets such a writer name a PIC they do not manage;
-- mos.can_edit_task is then false for them, and the app's create path (insert, then the `created`
-- event) would fail after the row exists. The exemption is the creator's own `created` event only:
-- every other event, and every other writer, still needs mos.can_edit_task.
--
-- DOWN: drop policy task_events_insert_editor on mos.task_events; then recreate it as
--   for insert to authenticated with check (org_id = shared.current_org_id()
--     and actor_person_id = shared.current_person_id() and mos.can_edit_task(task_id));

drop policy task_events_insert_editor on mos.task_events;
create policy task_events_insert_editor on mos.task_events
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and actor_person_id = shared.current_person_id()
    and (
      mos.can_edit_task(task_id)
      or (
        event_type = 'created'
        and shared.is_org_wide()
        and exists (
          select 1 from mos.tasks t
          where t.id = task_id and t.created_by = shared.current_person_id()
        )
      )
    )
  );
