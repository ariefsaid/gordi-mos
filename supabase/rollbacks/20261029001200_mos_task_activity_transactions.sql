drop trigger if exists task_checklist_record_activity on mos.task_checklist_items;
drop trigger if exists tasks_record_activity on mos.tasks;
drop trigger if exists task_events_write_guard on mos.task_events;
drop function if exists mos._record_checklist_activity();
drop function if exists mos._record_task_activity();
drop function if exists mos._guard_task_event_write();
