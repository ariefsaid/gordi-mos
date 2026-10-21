begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

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
insert into shared.team_lead_assignments (org_id, team_id, lead_person_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-0000000000d4');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select ops.save_attendance_site('00000000-0000-0000-0000-000000005a01', 0, 0, 100);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$select ops.save_attendance_site('00000000-0000-0000-0000-000000005a01', 0, 0, 100)$$,
  '42501','STAFF_ADMIN_FORBIDDEN','AC-001 a Team lead cannot change Site coordinates');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select ops.save_attendance_team_site('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-000000005a01');
select is(jsonb_array_length(ops.list_led_staff_teams()),2,'AC-001 an administrator can open the Team roster surface');
select throws_ok($$select ops.save_attendance_site('00000000-0000-0000-0000-000000005a02', 0, 0, 100)$$,
  'P0002','STAFF_SITE_NOT_FOUND','AC-001 an administrator cannot edit a Site in another org');
select throws_ok($$select ops.save_attendance_team_site('00000000-0000-0000-0000-000000005b03','00000000-0000-0000-0000-000000005a01')$$,
  'P0002','STAFF_TEAM_NOT_FOUND','AC-001 an administrator cannot link another org’s Team');
select set_config('app.staff_pagi', ops.save_site_shift_template('00000000-0000-0000-0000-000000005a01', null, 'Pagi', '07:00', '15:00')::text, true);
select set_config('app.staff_siang', ops.save_site_shift_template('00000000-0000-0000-0000-000000005a01', null, 'Siang', '14:00', '22:00')::text, true);
select set_config('app.staff_malam', ops.save_site_shift_template('00000000-0000-0000-0000-000000005a01', null, 'Malam', '22:00', '02:00')::text, true);
select ok((select latitude = 0 and longitude = 0 and attendance_radius_m = 100 from shared.sites where id='00000000-0000-0000-0000-000000005a01'),
  'AC-027 Site map point and radius are saved by an administrator');
select ok(not has_table_privilege('authenticated','ops.staff_shifts','INSERT')
      and not has_table_privilege('authenticated','ops.staff_rosters','UPDATE')
      and not has_table_privilege('authenticated','ops.staff_rosters','SELECT')
      and (select bool_and(c.relrowsecurity and c.relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='ops' and c.relname=any(array['staff_shift_templates','staff_rosters','staff_shifts','staff_standing_hours'])),
  'AC-001 schedule reads and writes use checked actions with FORCE RLS enabled');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$select ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f201','2026-10-26',current_setting('app.staff_pagi')::uuid,null)$$,
  '42501','STAFF_SHIFT_PERSON_NOT_MEMBER','AC-001 a lead cannot assign a person outside their Team');
select is(ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f101','2026-10-26',current_setting('app.staff_pagi')::uuid,null) is not null,true,
  'AC-001 a designated lead assigns an active Team member');
select throws_ok($$select ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f101','2026-10-26',current_setting('app.staff_siang')::uuid,null)$$,
  '23P01','STAFF_SHIFT_OVERLAP','AC-002 overlapping assignments are refused');
select is(ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f102','2026-10-26',current_setting('app.staff_pagi')::uuid,null) is not null,true,
  'AC-002 non-overlapping assignments remain available');
select is(ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f103','2026-10-27',current_setting('app.staff_pagi')::uuid,null) is not null,true,
  'AC-004 a lead drafts the published week');
select is(ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f104','2026-10-28',current_setting('app.staff_pagi')::uuid,null) is not null,true,
  'AC-004 the weekly roster accepts another active Person');
select is(ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f105','2026-10-29',current_setting('app.staff_pagi')::uuid,null) is not null,true,
  'AC-004 the weekly roster accepts five distinct people');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select ops.save_site_shift_template('00000000-0000-0000-0000-000000005a01',current_setting('app.staff_pagi')::uuid,'Pagi','08:00','16:00');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select ok(exists(select 1 from jsonb_array_elements(ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-10-26')->'shifts') as shifts(shift)
  where shift->>'person_id'='00000000-0000-0000-0000-00000000f101' and shift->>'template_name'='Pagi'
    and ((shift->>'start_at')::timestamptz at time zone 'Asia/Jakarta')::time=time '07:00'),
  'AC-003 changing a Site template leaves existing assignment hours and names unchanged');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select is(ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-10-26')->>'team_name',
  (select name from shared.teams where id='00000000-0000-0000-0000-000000005b01'),
  'AC-001 an administrator can read the Team roster through its checked action');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is(ops.publish_staff_roster('00000000-0000-0000-0000-000000005b01','2026-10-26'),5,
  'AC-004 publish creates one Inbox notice per assigned Person');
select is(ops.copy_staff_roster('00000000-0000-0000-0000-000000005b01','2026-11-02'),5,
  'AC-005 copy brings last week’s five shifts into a new draft');
select is(ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-11-02')->>'status','draft',
  'AC-005 copy creates a new draft week');
select is(jsonb_array_length(ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-11-02')->'shifts'),5,
  'AC-005 the copied draft keeps the five assigned shifts');
select is(ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f101','2026-11-09',current_setting('app.staff_malam')::uuid,null) is not null,true,
  'AC-003 overnight template assignment succeeds');
select ok(exists(select 1 from jsonb_array_elements(ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-11-09')->'shifts') as shifts(shift)
  where shift->>'person_id'='00000000-0000-0000-0000-00000000f101'
    and ((shift->>'end_at')::timestamptz at time zone 'Asia/Jakarta')=timestamp '2026-11-10 02:00:00'),
  'AC-003 overnight shift ends Tuesday at 02:00 WIB');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select set_config('app.staff_conflict_shift',ops.save_staff_shift('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-00000000f205','2026-10-27',current_setting('app.staff_pagi')::uuid,null)::text,true);
select throws_ok($$select ops.save_standing_hours('00000000-0000-0000-0000-000000005b02',null,array[0,1,2,3,4]::smallint[],'09:00','17:00',true)$$,
  '23P01','STAFF_STANDING_CONFLICT','AC-006 standing hours cannot overlap an existing future roster shift');
select ops.remove_staff_shift(current_setting('app.staff_conflict_shift')::uuid);
select is(ops.save_standing_hours('00000000-0000-0000-0000-000000005b02',null,array[0,1,2,3,4]::smallint[],'09:00','17:00',true),date '2026-10-26',
  'AC-006 standing-hour changes take effect next Monday');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f201","access_roles":["member"]}');
select is(jsonb_array_length(ops.list_my_staff_shifts('2026-10-19')),0,
  'AC-006 the current week remains unchanged');
select is(jsonb_array_length(ops.list_my_staff_shifts('2026-10-26')),5,
  'AC-006 Team standing hours generate five weekday shifts');
select is(ops.list_my_staff_shifts('2026-10-26')->0->'crew',
  '["Office 202","Office 203","Office 204","Office 205","Peer"]'::jsonb,
  'AC-007 the Person sees only names assigned to the same shift');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is(ops.save_standing_hours('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-00000000f201',array[0,1,2,3]::smallint[],'10:00','18:00',true),date '2026-10-26',
  'AC-006 a Person exception is effective from next Monday');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f201","access_roles":["member"]}');
select is(jsonb_array_length(ops.list_my_staff_shifts('2026-10-26')),4,
  'AC-006 the Person exception replaces the Team default');
select is(((ops.list_my_staff_shifts('2026-10-26')->0->>'start_at')::timestamptz at time zone 'Asia/Jakarta')::time,time '10:00',
  'AC-006 the Person exception supplies its own hours');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is(ops.save_standing_hours('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-00000000f201',array[]::smallint[],null,null,null),date '2026-10-26',
  'AC-006 removing a Person exception preserves the effective date');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f201","access_roles":["member"]}');
select is(jsonb_array_length(ops.list_my_staff_shifts('2026-10-26')),5,
  'AC-006 removing an exception restores the Team default');

reset role;
select is((select count(*)::int from mos.notifications where metadata->>'source'='staff_roster' and metadata->>'week_start'='2026-10-26'),5,
  'AC-004 publishing the roster creates exactly five Inbox rows');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
set local role authenticated;
select is(jsonb_array_length(ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-10-26')->'shifts'),5,
  'AC-004 published shifts remain visible after notifications are written');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f105","access_roles":["member"]}');
select throws_ok($$select ops.save_staff_shift('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-00000000f105','2026-11-09',current_setting('app.staff_pagi')::uuid,null)$$,
  '42501','STAFF_SHIFT_FORBIDDEN','AC-001 an ordinary member cannot create a roster shift');
select throws_ok($$select ops.get_staff_roster('00000000-0000-0000-0000-000000005b01','2026-10-26')$$,
  '42501','STAFF_ROSTER_FORBIDDEN','AC-001 an ordinary member cannot read the Team roster');
select * from finish();
rollback;
