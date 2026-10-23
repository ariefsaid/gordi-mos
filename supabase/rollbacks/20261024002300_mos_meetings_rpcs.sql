-- DOWN for 20261024002300. Removes the Meetings actions.
begin;
drop function mos.meeting_tasks(uuid);
drop function mos.meeting_still_open(uuid);
drop function mos.create_meeting_task(uuid, text, uuid, date, uuid, uuid);
drop function mos.start_next_meeting(uuid);
drop function mos.create_meeting(text, uuid, timestamptz, boolean, uuid, uuid, uuid[]);
commit;
