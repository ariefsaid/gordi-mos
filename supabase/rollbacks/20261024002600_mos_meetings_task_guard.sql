-- DOWN for 20261024002600. Removes the Meetings rules on mos.tasks.
begin;
drop trigger tasks_meeting_guard on mos.tasks;
drop function mos._guard_task_meeting();
delete from shared.record_history where schema_name = 'mos' and table_name = 'tasks' and field_name = 'meeting_id';
commit;
