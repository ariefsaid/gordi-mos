-- DOWN for 20261024002200. Removes the Meetings guard triggers and functions.
begin;
drop trigger meeting_attendees_guard on mos.meeting_attendees;
drop trigger meetings_guard on mos.meetings;
drop function mos._guard_meeting_attendees();
drop function mos._guard_meetings();
commit;
