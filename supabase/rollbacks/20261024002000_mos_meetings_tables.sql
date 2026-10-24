-- DOWN for 20261024002000. Removes the Meetings tables and tasks.meeting_id (drops their data).
begin;
drop index mos.tasks_meeting_idx;
alter table mos.tasks drop constraint tasks_meeting_same_org_fk;
alter table mos.tasks drop column meeting_id;
drop table mos.meeting_attendees;
drop table mos.meetings;
commit;
