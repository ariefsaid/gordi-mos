-- DOWN for 20261024002400. Removes the Meetings mention-notice and purge triggers (turning Private, attendee removal, admin revoke); notices already
-- delivered stay in Inboxes.
begin;
drop trigger person_access_roles_purge_meeting_notices on shared.person_access_roles;
drop trigger meeting_attendees_purge_notices on mos.meeting_attendees;
drop function mos._purge_meeting_notices_for_ex_admin();
drop function mos._purge_removed_attendee_notices();
drop trigger meetings_purge_notices on mos.meetings;
drop trigger meetings_mention_notices on mos.meetings;
drop function mos._purge_meeting_notices();
drop function mos._fan_out_meeting_mentions();
drop function mos._meeting_mentions(jsonb);
commit;
