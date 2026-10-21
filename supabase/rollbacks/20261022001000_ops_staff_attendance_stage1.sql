-- DOWN for 20261022001000. Refuses to erase any Site settings or schedule history.
begin;
lock table ops.staff_shift_templates, ops.staff_rosters, ops.staff_shifts, ops.staff_standing_hours in access exclusive mode;
do $$
begin
  if exists (select 1 from ops.staff_shift_templates)
     or exists (select 1 from ops.staff_rosters)
     or exists (select 1 from ops.staff_shifts)
     or exists (select 1 from ops.staff_standing_hours)
     or exists (select 1 from shared.sites where latitude is not null or longitude is not null or attendance_radius_m <> 100) then
    raise exception 'Rollback refused: export and separately preserve Site settings and staff schedule history first';
  end if;
end $$;
drop table ops.staff_shifts;
drop table ops.staff_rosters;
drop table ops.staff_standing_hours;
drop table ops.staff_shift_templates;
drop function ops.list_next_my_staff_shifts();
drop function ops.list_my_staff_shifts(date);
drop function ops.list_staff_standing_hours(uuid);
drop function ops.save_standing_hours(uuid,uuid,smallint[],time,time,boolean);
drop function ops.get_staff_roster(uuid,date);
drop function ops.list_led_staff_teams();
drop function ops.remove_staff_shift(uuid);
drop function ops.publish_staff_roster(uuid,date);
drop function ops.copy_staff_roster(uuid,date);
drop function ops.save_staff_shift(uuid,uuid,date,uuid,uuid);
drop function ops.list_staff_site_templates(uuid);
drop function ops.archive_site_shift_template(uuid);
drop function ops.save_site_shift_template(uuid,uuid,text,time,time);
drop function ops.save_attendance_team_site(uuid,uuid);
drop function ops.save_attendance_site(uuid,double precision,double precision,integer);
drop function ops._attendance_shift_overlaps(uuid,date,timestamptz,timestamptz,uuid);
drop function ops._attendance_standing_version(uuid,uuid,date);
drop function ops._attendance_week_start(date);
drop function ops._attendance_days_valid(smallint[]);
drop function ops._attendance_now();
drop index shared.people_org_id_id_uk;
drop index shared.sites_org_id_id_uk;
drop index shared.teams_org_id_id_uk;
alter table shared.sites drop constraint sites_attendance_pin_pair_ck,
  drop column latitude, drop column longitude, drop column attendance_radius_m;
commit;
