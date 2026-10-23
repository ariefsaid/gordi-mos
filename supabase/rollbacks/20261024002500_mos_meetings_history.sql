-- DOWN for 20261024002500. Removes Meetings history capture and the Meetings rows it wrote.
begin;
drop trigger record_history_meetings on mos.meetings;
delete from shared.record_history_readers where schema_name = 'mos' and table_name = 'meetings';
drop function shared._history_reader_mos_meetings(text, text, jsonb);
delete from shared.record_history where schema_name = 'mos' and table_name = 'meetings';
commit;
