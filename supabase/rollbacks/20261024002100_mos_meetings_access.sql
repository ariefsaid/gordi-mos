-- DOWN for 20261024002100. Removes the Meetings policies and access functions.
begin;
drop policy meeting_attendees_select on mos.meeting_attendees;
drop policy meeting_attendees_insert on mos.meeting_attendees;
drop policy meeting_attendees_update on mos.meeting_attendees;
drop policy meetings_select on mos.meetings;
drop policy meetings_update on mos.meetings;
alter table mos.meetings no force row level security;
alter table mos.meetings disable row level security;
alter table mos.meeting_attendees no force row level security;
alter table mos.meeting_attendees disable row level security;
drop function mos.can_pick_meeting_team(uuid);
drop function mos.can_edit_meeting(uuid);
drop function mos.can_read_meeting(uuid);
commit;
