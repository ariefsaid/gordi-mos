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
-- get_staff_roster: the admin-or-lead check from 20261022001000_ops_staff_attendance_stage1.sql.
create or replace function ops.get_staff_roster(p_team_id uuid, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_roster ops.staff_rosters; v_result jsonb;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if not (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_ROSTER_FORBIDDEN' using errcode = '42501'; end if;
  if p_week_start is null or p_week_start <> ops._attendance_week_start(p_week_start) then raise exception 'STAFF_WEEK_INVALID' using errcode = '22023'; end if;
  select * into v_roster from ops.staff_rosters where org_id=v_org and team_id=p_team_id and week_start=p_week_start;
  select jsonb_build_object(
    'team_id',t.id,'team_name',t.name,'site_id',coalesce(v_roster.site_id,t.site_id),'site_name',s.name,
    'week_start',p_week_start,'status',coalesce(v_roster.status,'draft'),
    'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'person_id',x.person_id,'person_name',p.full_name,'local_date',x.local_date,'template_id',x.template_id,'template_name',x.template_name,'start_at',x.start_at,'end_at',x.end_at) order by x.local_date,x.start_at,p.full_name)
      from ops.staff_shifts x join shared.people p on p.id=x.person_id and p.org_id=x.org_id where x.org_id=v_org and x.roster_id=v_roster.id and x.removed_at is null),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'full_name',p.full_name) order by p.full_name)
      from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
      where m.org_id=v_org and m.team_id=t.id and p.archived_at is null and m.effective_from<=p_week_start+6 and (m.effective_to is null or m.effective_to>=p_week_start)),'[]'::jsonb)
  ) into v_result from shared.teams t left join shared.sites s on s.id=coalesce(v_roster.site_id,t.site_id) and s.org_id=t.org_id where t.org_id=v_org and t.id=p_team_id and t.archived_at is null;
  if v_result is null then raise exception 'STAFF_TEAM_NOT_FOUND' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;
revoke execute on function ops.get_staff_roster(uuid,date) from public, anon;
grant execute on function ops.get_staff_roster(uuid,date) to authenticated;
commit;
