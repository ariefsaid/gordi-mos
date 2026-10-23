-- DOWN for 20261024001300.
begin;
drop trigger record_history_task_viewers on mos.task_viewers;
delete from shared.record_history_readers where schema_name = 'mos' and table_name = 'task_viewers';
drop function shared._history_reader_mos_task_viewers(text, text, jsonb);
commit;
