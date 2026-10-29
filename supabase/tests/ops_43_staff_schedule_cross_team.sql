begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select set_config('app.allow_test_seeds', 'on', true);
select set_config('app.attendance_now', '2026-10-22 03:00:00+00', true);
select mos._test_seed_signal_tree();

reset role;
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-0000000000a1','Crew 101'),
  ('00000000-0000-0000-0000-00000000f102','00000000-0000-0000-0000-0000000000a1','Crew 102'),
  ('00000000-0000-0000-0000-00000000f103','00000000-0000-0000-0000-0000000000a1','Crew 103'),
  ('00000000-0000-0000-0000-00000000f104','00000000-0000-0000-0000-0000000000a1','Crew 104'),
  ('00000000-0000-0000-0000-00000000f105','00000000-0000-0000-0000-0000000000a1','Crew 105'),
  ('00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-0000000000a1','Office 201'),
  ('00000000-0000-0000-0000-00000000f202','00000000-0000-0000-0000-0000000000a1','Office 202'),
  ('00000000-0000-0000-0000-00000000f203','00000000-0000-0000-0000-0000000000a1','Office 203'),
  ('00000000-0000-0000-0000-00000000f204','00000000-0000-0000-0000-0000000000a1','Office 204'),
  ('00000000-0000-0000-0000-00000000f205','00000000-0000-0000-0000-0000000000a1','Office 205');
insert into shared.sites (id, org_id, name, code) values
  ('00000000-0000-0000-0000-000000005a02','00000000-0000-0000-0000-0000000000b1','Foreign Site','foreign_site');
insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
  ('00000000-0000-0000-0000-000000005b03','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000005a02','Foreign Team','foreign_team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-000000005b01',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f102','00000000-0000-0000-0000-000000005b01',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f103','00000000-0000-0000-0000-000000005b01',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f104','00000000-0000-0000-0000-000000005b01',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f105','00000000-0000-0000-0000-000000005b01',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-000000005b02',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f202','00000000-0000-0000-0000-000000005b02',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f203','00000000-0000-0000-0000-000000005b02',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f204','00000000-0000-0000-0000-000000005b02',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f205','00000000-0000-0000-0000-000000005b02',false);
-- All fixture memberships, including seeded leads, predate the fixed attendance scenarios.
update shared.team_memberships set effective_from = date '2026-10-01'
 where org_id = '00000000-0000-0000-0000-0000000000a1';
insert into shared.team_lead_assignments (org_id, team_id, lead_person_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-0000000000d4');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select ops.save_attendance_team_site('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-000000005a01');
select set_config('app.test_template',ops.save_site_shift_template('00000000-0000-0000-0000-000000005a01',null,'Morning','09:00','17:00')::text,true);
select ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f101','2026-10-26',current_setting('app.test_template')::uuid,null);
select ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f102','2026-10-27',current_setting('app.test_template')::uuid,null);
select ops.publish_staff_roster('00000000-0000-0000-0000-000000005b01','2026-10-26');
reset role;
update shared.team_memberships set effective_to='2026-11-02' where person_id='00000000-0000-0000-0000-00000000f102' and team_id='00000000-0000-0000-0000-000000005b01';
insert into shared.team_memberships(org_id,person_id,team_id,is_primary,effective_from) values
('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-000000005b02',false,'2026-10-01'),
('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f103','00000000-0000-0000-0000-000000005b02',false,'2026-10-01'),
('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f104','00000000-0000-0000-0000-000000005b02',false,'2026-10-01');
set local role authenticated;
select is(ops.copy_staff_roster('00000000-0000-0000-0000-000000005b01','2026-11-02'),1,'copy excludes a shift after membership ends');
select is(jsonb_array_length(ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-11-02')->'shifts'),1,'only the eligible shift is copied');
select throws_ok($$select ops.save_standing_hours('00000000-0000-0000-0000-000000005b02',null,array[0]::smallint[],'09:00','17:00',true)$$,'23P01','STAFF_STANDING_CONFLICT','team standing hours reject another team shift');
select ops.remove_staff_shift((ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-11-02')->'shifts'->0->>'id')::uuid);
select ops.save_standing_hours('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-00000000f103',array[]::smallint[],null,null,false);
select set_config('app.test_evening',ops.save_site_shift_template('00000000-0000-0000-0000-000000005a01',null,'Evening','18:30','19:30')::text,true);
select ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f103','2026-11-10',current_setting('app.test_evening')::uuid,null);
select set_config('app.test_early',ops.save_site_shift_template('00000000-0000-0000-0000-000000005a01',null,'Early','01:00','03:00')::text,true);
select ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f104','2026-11-12',current_setting('app.test_early')::uuid,null);
select ops.save_standing_hours('00000000-0000-0000-0000-000000005b01',null,array[2]::smallint[],'09:00','17:00',true);
select throws_ok($$select ops.save_standing_hours('00000000-0000-0000-0000-000000005b02',null,array[2]::smallint[],'10:00','18:00',true)$$,'23P01','STAFF_STANDING_CONFLICT','team standing hours reject another team recurring schedule');
select is(ops.save_standing_hours('00000000-0000-0000-0000-000000005b02',null,array[1]::smallint[],'18:00','20:00',true),date '2026-10-26','non-overlapping team hours remain available');
select throws_ok($$select ops.save_standing_hours('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-00000000f103',array[2]::smallint[],'10:00','18:00',true)$$,'23P01','STAFF_STANDING_CONFLICT','a person exception rejects another team recurring schedule');
select throws_ok($$select ops.save_standing_hours('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-00000000f103',array[]::smallint[],null,null,null)$$,'23P01','STAFF_STANDING_CONFLICT','restoring team hours rejects another team shift');
select throws_ok($$select ops.save_standing_hours('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-00000000f104',array[2]::smallint[],'23:00','02:00',true)$$,'23P01','STAFF_STANDING_CONFLICT','overnight standing hours reject another team shift on the next day');
select * from finish();
rollback;
