-- DOWN for 20261022011000. Refuses to erase absences, cover history, clock records or settings.
begin;
lock table ops.staff_absences, ops.staff_shift_offers, ops.staff_shift_claims, ops.staff_shift_alerts,
  ops.staff_shift_outcomes, ops.staff_cover_config in access exclusive mode;
do $$
begin
  if exists (select 1 from ops.staff_absences) or exists (select 1 from ops.staff_shift_offers)
     or exists (select 1 from ops.staff_shift_claims) or exists (select 1 from ops.staff_shift_alerts)
     or exists (select 1 from ops.staff_shift_outcomes) or exists (select 1 from ops.staff_cover_config)
     or exists (select 1 from storage.objects where bucket_id = 'staff-notes') then
    raise exception 'Rollback refused: export and separately preserve absence, cover, clock and note history first';
  end if;
end $$;
drop policy staff_notes_select on storage.objects;
drop policy staff_notes_insert on storage.objects;
delete from storage.buckets where id = 'staff-notes';
drop function ops.set_noshow_recording_from(timestamptz);
drop function ops._attendance_clock_counts(uuid,date,date);
drop function ops.list_staff_monthly_totals(date);
drop function ops.list_staff_absences(date,date,uuid);
drop function ops._attendance_visible_teams();
drop function ops.list_staff_cover_queue();
drop function ops.list_open_staff_shifts();
drop function ops.list_my_staff_absences();
drop function ops.assign_staff_cover(uuid,uuid);
drop function ops.decide_staff_claim(uuid,boolean,text);
drop function ops._attendance_fill_offer(uuid,ops.staff_shift_offers,ops.staff_shifts,uuid,uuid);
drop function ops.withdraw_staff_claim(uuid);
drop function ops.claim_staff_shift(uuid);
drop function ops.cancel_staff_offer(uuid);
drop function ops.offer_staff_shift(uuid);
drop function ops.attach_staff_absence_note(uuid,text);
drop function ops.can_add_staff_note(text);
drop function ops.can_read_staff_note(text);
drop function ops.staff_note_absence_id(text);
drop function ops.cancel_staff_absence(uuid);
drop function ops.decide_staff_absence(uuid,boolean,text);
drop function ops.report_staff_absence(text,uuid,uuid,date,uuid,text);
drop function ops._attendance_cover_eligible(uuid,ops.staff_shifts,uuid);
drop function ops._attendance_reopen_offer(uuid,uuid);
drop function ops._attendance_open_offer(uuid,ops.staff_shifts,text,uuid,uuid);
drop function ops._attendance_standing_occurrence(uuid,uuid,uuid,date);
drop function ops._attendance_alert(uuid,ops.staff_shifts,text);
drop function ops._attendance_can_lead(uuid);
drop function ops._attendance_notify_team(uuid,uuid,uuid,text,text,text,text,uuid,text);
drop function ops._attendance_recipients(uuid,uuid,uuid);
drop function ops._attendance_notify(uuid,uuid,text,text,text,text,uuid,text);
drop function ops._attendance_setting(uuid,text);
drop policy staff_shifts_read on ops.staff_shifts;
create policy staff_shifts_read on ops.staff_shifts for select to authenticated
  using (org_id = (select shared.current_org_id()) and ((select shared.has_access_role('admin'))
    or person_id = (select shared.current_person_id())
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))));
drop policy staff_rosters_read on ops.staff_rosters;
create policy staff_rosters_read on ops.staff_rosters for select to authenticated
  using (org_id = (select shared.current_org_id()) and ((select shared.has_access_role('admin'))
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))));
drop table ops.staff_shift_outcomes;
drop table ops.staff_shift_alerts;
drop table ops.staff_shift_claims;
drop table ops.staff_shift_offers;
drop table ops.staff_absences;
drop table ops.staff_cover_config;
alter table ops.staff_shifts drop column cover_for_person_id, drop column origin;
-- get_staff_roster: restore the admin-or-lead check from 20261022001000_ops_staff_attendance_stage1.sql.
commit;
