-- DOWN for 20261024002400. Removes the Meetings mention-notice and purge triggers; notices already
-- delivered stay in Inboxes.
begin;
drop trigger meetings_purge_notices on mos.meetings;
drop trigger meetings_mention_notices on mos.meetings;
drop function mos._purge_meeting_notices();
drop function mos._fan_out_meeting_mentions();
drop function mos._meeting_mentions(jsonb);
commit;
