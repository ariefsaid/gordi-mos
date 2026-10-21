begin;
create extension if not exists pgtap with schema extensions;
select plan(71);

select set_config('app.allow_test_seeds', 'on', true);
select set_config('app.attendance_now', '2026-10-21 23:00:00+00', true);
select mos._test_seed_signal_tree();

create function public.t_as(p_person uuid, p_role text default 'member') returns void language sql as $$
  select shared._test_set_access_roles(jsonb_build_object('org_id','00000000-0000-0000-0000-0000000000a1','person_id',p_person,'access_roles',jsonb_build_array(p_role))::text)
$$;
create function public.t_clock(p_at text) returns text language sql as $$ select set_config('app.attendance_now', p_at, true) $$;
create function public.t_rename_selfies() returns integer language plpgsql as $$
declare n integer; begin update storage.objects set name = name || 'x' where bucket_id = 'attendance-selfies'; get diagnostics n = row_count; return n; end $$;
create function public.t_selfie(p_attempt uuid) returns void language sql as $$
  insert into storage.objects (bucket_id, name) values ('attendance-selfies', '00000000-0000-0000-0000-0000000000a1/' || p_attempt || '/' || gen_random_uuid() || '.jpg')
$$;

reset role;
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-0000000000a1','Crew 101'),
  ('00000000-0000-0000-0000-00000000f102','00000000-0000-0000-0000-0000000000a1','Crew 102'),
  ('00000000-0000-0000-0000-00000000f103','00000000-0000-0000-0000-0000000000a1','Crew 103'),
  ('00000000-0000-0000-0000-00000000f104','00000000-0000-0000-0000-0000000000a1','Crew 104'),
  ('00000000-0000-0000-0000-00000000f105','00000000-0000-0000-0000-0000000000a1','Crew 105');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
select '00000000-0000-0000-0000-0000000000a1', p, '00000000-0000-0000-0000-000000005b01', false
  from unnest(array['00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-00000000f102','00000000-0000-0000-0000-00000000f103','00000000-0000-0000-0000-00000000f104','00000000-0000-0000-0000-00000000f105']::uuid[]) p;
insert into shared.team_lead_assignments (org_id, team_id, lead_person_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-0000000000d1');
update shared.sites set latitude = 0, longitude = 0, attendance_radius_m = 100 where id = '00000000-0000-0000-0000-000000005a01';
insert into ops.staff_rosters (id, org_id, team_id, site_id, week_start, status, created_by, published_at) values
  ('00000000-0000-0000-0000-0000000a0001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-000000005a01','2026-10-19','published','00000000-0000-0000-0000-0000000000d1','2026-10-18 03:00:00+00');
insert into ops.staff_shifts (org_id, roster_id, team_id, site_id, person_id, local_date, template_name, start_at, end_at, created_by)
select '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000a0001','00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-000000005a01', p, d, 'Pagi',
       (d + time '07:00') at time zone 'Asia/Jakarta', (d + time '15:00') at time zone 'Asia/Jakarta', '00000000-0000-0000-0000-0000000000d1'
  from (values ('00000000-0000-0000-0000-00000000f101'::uuid, date '2026-10-22'), ('00000000-0000-0000-0000-00000000f101', date '2026-10-23'),
               ('00000000-0000-0000-0000-00000000f102', date '2026-10-22'), ('00000000-0000-0000-0000-00000000f103', date '2026-10-22'),
               ('00000000-0000-0000-0000-00000000f104', date '2026-10-22'), ('00000000-0000-0000-0000-00000000f105', date '2026-10-22')) v(p, d);

select ok((select bool_and(c.relrowsecurity and c.relforcerowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops' and c.relname = any(array['attendance_settings','attendance_consents','attendance_records','attendance_record_history','attendance_alerts','attendance_selfie_purge_queue']))
      and not has_table_privilege('authenticated','ops.attendance_records','SELECT')
      and not has_table_privilege('authenticated','ops.attendance_records','INSERT'),
  'NFR-001 every new attendance table forces RLS and is closed to direct access');
select ok(ops._attendance_distance_m(0,0,0,0.0009) between 99.9 and 100.3 and ops._attendance_distance_m(0,0,0,0) = 0
      and ops._attendance_distance_m(-6.2,106.82,-6.2,106.82) = 0,
  'AC-031 great-circle distance is metre-accurate with no extension');

-- Consent comes first and records version, language and time.
set local role authenticated;
select public.t_as('00000000-0000-0000-0000-00000000f102');
select public.t_clock('2026-10-21 23:55:00+00');
select is(ops.begin_attendance_clock_in('2026-10-22 00:00:00+00')->>'reason','consent_needed','AC-035 clock-in asks for consent before any capture');
select throws_ok($$select ops.record_attendance_consent('old-notice','en')$$,'22023','STAFF_NOTICE_STALE','AC-035 consent is recorded only against the current notice');
select ops.record_attendance_consent('attendance-2026-10','id');
select ops.record_attendance_consent('attendance-2026-10','id');
reset role;
select is((select count(*)::int from ops.attendance_consents where person_id = '00000000-0000-0000-0000-00000000f102' and language = 'id'),1,
  'AC-035 consent keeps one row with the notice version and language');
set local role authenticated;
select public.t_as('00000000-0000-0000-0000-00000000f101');
select ops.record_attendance_consent('attendance-2026-10','en');
select public.t_as('00000000-0000-0000-0000-00000000f103');
select ops.record_attendance_consent('attendance-2026-10','en');
select public.t_as('00000000-0000-0000-0000-00000000f104');
select ops.record_attendance_consent('attendance-2026-10','en');
select public.t_as('00000000-0000-0000-0000-00000000f105');
select ops.record_attendance_consent('attendance-2026-10','en');

-- Window: opens 30 minutes before the shift.
select public.t_as('00000000-0000-0000-0000-00000000f101');
select public.t_clock('2026-10-21 23:25:00+00');
select is(ops.begin_attendance_clock_in('2026-10-22 00:00:00+00')->>'reason','too_early','AC-031 a 07:00 shift refuses clock-in at 06:25');
select is(ops.begin_attendance_clock_in('2026-10-22 01:00:00+00')->>'reason','no_shift','AC-031 clock-in needs a shift for that Person at that start');
select public.t_clock('2026-10-21 23:55:00+00');
select set_config('app.a101', ops.begin_attendance_clock_in('2026-10-22 00:00:00+00')->>'attempt_id', true);
select ok(current_setting('app.a101')::uuid is not null,'AC-031 clock-in opens at 06:30 and 06:55 starts a capture attempt');

-- Position, accuracy and selfie checks (Site pin 0,0 radius 100 m).
select public.t_clock('2026-10-22 00:05:00+00');
select is(ops.clock_in_attendance(current_setting('app.a101')::uuid, 0.00071945, 0, 20)->>'reason','photo_needed','AC-030 no selfie is refused with photo needed');
select public.t_selfie(current_setting('app.a101')::uuid);
select is(ops.clock_in_attendance(current_setting('app.a101')::uuid, 0.00134898, 0, 20)->>'reason','too_far','AC-030 150 m from a 100 m Site is refused as too far');
select is(ops.clock_in_attendance(current_setting('app.a101')::uuid, 0.00071945, 0, 80)->>'reason','weak_gps','AC-030 80 m accuracy is refused as weak GPS');
select is((ops.clock_in_attendance(current_setting('app.a101')::uuid, 0.00071945, 0, 20))->>'late','false','AC-030 80 m away with 20 m accuracy and a selfie is accepted, and 07:05 is on time (AC-031)');
select throws_ok($$select ops.clock_in_attendance(current_setting('app.a101')::uuid, 0, 0, 5)$$,'23505','STAFF_CLOCK_ALREADY','AC-030 an accepted clock-in cannot be repeated');
select is(ops.begin_attendance_clock_in('2026-10-22 00:00:00+00')->>'reason','already_in','AC-030 a second attempt for the same shift is refused');
select throws_ok($$select public.t_selfie(current_setting('app.a101')::uuid)$$,'42501',null,'NFR-002 an accepted attempt takes no more images');

-- Geofence boundary and the grace boundary.
select public.t_as('00000000-0000-0000-0000-00000000f102');
select public.t_clock('2026-10-21 23:56:00+00');
select set_config('app.a102', ops.begin_attendance_clock_in('2026-10-22 00:00:00+00')->>'attempt_id', true);
select public.t_selfie(current_setting('app.a102')::uuid);
select public.t_clock('2026-10-22 00:05:00+00');
select is(ops.clock_in_attendance(current_setting('app.a102')::uuid, 0.00090023, 0, 20)->>'reason','too_far','AC-030 100.1 m is just outside a 100 m radius');
select is((ops.clock_in_attendance(current_setting('app.a102')::uuid, 0.00089842, 0, 20))->>'ok','true','AC-030 99.9 m is just inside a 100 m radius');
select public.t_as('00000000-0000-0000-0000-00000000f103');
select public.t_clock('2026-10-21 23:57:00+00');
select set_config('app.a103', ops.begin_attendance_clock_in('2026-10-22 00:00:00+00')->>'attempt_id', true);
select public.t_selfie(current_setting('app.a103')::uuid);
select public.t_clock('2026-10-22 00:10:00+00');
select is((ops.clock_in_attendance(current_setting('app.a103')::uuid, 0, 0, 10))->>'late','false','AC-031 07:10 is within the 10-minute grace');
select public.t_as('00000000-0000-0000-0000-00000000f104');
select public.t_clock('2026-10-22 00:12:00+00');
select set_config('app.a104', ops.begin_attendance_clock_in('2026-10-22 00:00:00+00')->>'attempt_id', true);
select public.t_selfie(current_setting('app.a104')::uuid);
select public.t_clock('2026-10-22 00:15:00+00');
select is((ops.clock_in_attendance(current_setting('app.a104')::uuid, 0, 0, 10))->>'late_minutes','15','AC-031 07:15 is late by 15 minutes');

-- Clock-out: same position check, no selfie, early leave flagged.
select public.t_as('00000000-0000-0000-0000-00000000f101');
select public.t_clock('2026-10-22 07:40:00+00');
select is(ops.clock_out_attendance(current_setting('app.a101')::uuid, 0.002, 0, 10)->>'reason','too_far','FR-033 clock-out applies the same position check');
select is(ops.clock_out_attendance(current_setting('app.a101')::uuid, 0, 0, 10)->>'early_minutes','20','FR-033 leaving 20 minutes before the end is flagged early');
select public.t_as('00000000-0000-0000-0000-00000000f103');
select public.t_clock('2026-10-22 08:00:00+00');
select is(ops.clock_out_attendance(current_setting('app.a103')::uuid, 0, 0, 10)->>'early_leave','false','FR-033 clock-out at the shift end is not early');

-- Missing-clock-in alert, once per shift.
select public.t_as('00000000-0000-0000-0000-00000000f105');
select public.t_clock('2026-10-21 23:59:00+00');
select set_config('app.a105', ops.begin_attendance_clock_in('2026-10-22 00:00:00+00')->>'attempt_id', true);
select public.t_selfie(current_setting('app.a105')::uuid);
reset role;
select public.t_clock('2026-10-22 00:29:00+00');
select is((ops.run_attendance_jobs()->>'missing_alerts')::int,0,'AC-018 no alert 29 minutes into the shift');
select public.t_clock('2026-10-22 00:31:00+00');
select is((ops.run_attendance_jobs()->>'missing_alerts')::int,1,'AC-018 a missing alert is raised 31 minutes in');
select is((ops.run_attendance_jobs()->>'missing_alerts')::int,0,'AC-018 running the job again adds none');
select is((select count(*)::int from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000d1' and metadata->>'kind' = 'missing'),1,
  'AC-018 the Team lead has exactly one missing-clock-in notice');
select ok(not exists(select 1 from mos.notifications where metadata->>'kind' = 'missing' and (body ~ '[0-9]+\.[0-9]{3,}' or title ~ '[0-9]+\.[0-9]{3,}')),
  'ADR-0064 alerts carry no coordinates');

-- No clock-out closes 2 hours after the shift ends; abandoned attempts are cleared.
select public.t_clock('2026-10-22 09:59:00+00');
select is((ops.run_attendance_jobs()->>'closed_no_clock_out')::int,0,'AC-032 nothing closes before 2 hours after the end');
select public.t_clock('2026-10-22 10:00:00+00');
select is((ops.run_attendance_jobs()->>'closed_no_clock_out')::int,2,'AC-032 two clock-ins without clock-out close at 2 hours');
select is((select status || '/' || closure from ops.attendance_records where id = current_setting('app.a102')::uuid),'closed/no_clock_out','AC-032 the record is closed as no clock-out');
select is((ops.run_attendance_jobs()->>'closed_no_clock_out')::int,0,'AC-032 the closing job is idempotent');
select is((select count(*)::int from ops.attendance_records where status = 'pending'),0,'ADR-0064 an abandoned capture attempt is cleared');
select is((select count(*)::int from ops.attendance_selfie_purge_queue where path like '%/' || current_setting('app.a105') || '/%'),1,
  'ADR-0064 the abandoned attempt''s image is queued for the Storage API worker');

-- Reads: the Person, their lead and admin; nobody else.
set local role authenticated;
select public.t_as('00000000-0000-0000-0000-00000000f102');
select throws_ok($$select ops.get_attendance_record(current_setting('app.a101')::uuid)$$,'42501','STAFF_ATTENDANCE_FORBIDDEN','AC-034 a coworker cannot read another member''s attendance');
select throws_ok($$select count(*) from ops.attendance_records$$,'42501',null,'AC-034 attendance tables cannot be read directly');
select is((select count(*)::int from storage.objects where bucket_id = 'attendance-selfies' and name like '%/' || current_setting('app.a101') || '/%'),0,'AC-034 a coworker cannot read another member''s selfie');
select is(ops.can_read_attendance_selfie((ops.get_attendance_record(current_setting('app.a102')::uuid))->>'selfie_path'),true,'AC-034 the Person can read their own selfie');
select public.t_as('00000000-0000-0000-0000-0000000000d2');
select throws_ok($$select ops.list_team_attendance('00000000-0000-0000-0000-000000005b01','2026-10-22')$$,'42501','STAFF_ATTENDANCE_FORBIDDEN','AC-034 a non-lead cannot read a Team''s attendance');
select public.t_as('00000000-0000-0000-0000-0000000000d1');
select is((ops.get_attendance_record(current_setting('app.a101')::uuid))->>'status','out','AC-034 the Team lead reads their Team''s record');
select is((select count(*)::int from storage.objects where bucket_id = 'attendance-selfies' and name like '%/' || current_setting('app.a101') || '/%'),1,'AC-034 the Team lead reads their Team''s selfie');
select is(jsonb_array_length(ops.list_team_attendance('00000000-0000-0000-0000-000000005b01','2026-10-22')),5,'FR-040 the lead''s today view lists every Team member');
select is((select r->>'status' from jsonb_array_elements(ops.list_team_attendance('00000000-0000-0000-0000-000000005b01','2026-10-22')) r where r->>'person_id' = '00000000-0000-0000-0000-00000000f105'),'missing','FR-040 a Person with no clock-in is shown as missing');
select public.t_as('00000000-0000-0000-0000-0000000000d3','admin');
select is((ops.get_attendance_record(current_setting('app.a101')::uuid))->>'status','out','AC-034 an administrator reads the record');
select public.t_as('00000000-0000-0000-0000-0000000000b4');
select throws_ok($$select ops.get_attendance_record(current_setting('app.a101')::uuid)$$,'42501',null,'AC-034 a Person in another org gets nothing');
select is((select count(*)::int from storage.objects where bucket_id = 'attendance-selfies'),0,'AC-034 another org sees no selfie objects');

-- HR reads every Team once stage 2 adds the hr role; until then this is skipped, never faked.
reset role;
select case
  when exists(select 1 from pg_constraint c join pg_type t on t.oid = c.contypid where t.typname = 'access_role' and pg_get_constraintdef(c.oid) like '%''hr''%')
  then (select is((ops.get_attendance_record(current_setting('app.a101')::uuid))->>'status', 'out', 'AC-034 hr reads every Team''s record')
          from (select public.t_as('00000000-0000-0000-0000-0000000000d2', 'hr')) as switched)
  else skip('AC-034 hr read waits for the hr role from stage 2', 1) end;

-- Storage is insert-only and bound to a pending attempt.
set local role authenticated;
select public.t_as('00000000-0000-0000-0000-00000000f101');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('attendance-selfies','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000dead/00000000-0000-0000-0000-00000000beef.jpg')$$,'42501',null,'NFR-002 an image cannot be added to an attempt that is not yours and pending');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('attendance-selfies','not-a-canonical-path.jpg')$$,'42501',null,'NFR-002 only canonical org/attempt/image paths are accepted');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('DELETE','UPDATE','ALL')
             and coalesce(qual, '') || coalesce(with_check, '') like '%attendance-selfies%'),0,'NFR-002 no policy lets a member delete or overwrite a selfie');
select is(public.t_rename_selfies(),0,'NFR-002 no member can overwrite a selfie');

-- Corrections need a reason and keep the original.
select public.t_as('00000000-0000-0000-0000-00000000f102');
select throws_ok($$select ops.correct_attendance_record('00000000-0000-0000-0000-00000000f104','2026-10-22 00:00:00+00','2026-10-22 00:05:00+00','2026-10-22 08:00:00+00','Dead phone')$$,'42501','STAFF_ATTENDANCE_FORBIDDEN','AC-033 a member cannot correct a record');
select public.t_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select ops.correct_attendance_record('00000000-0000-0000-0000-00000000f104','2026-10-22 00:00:00+00','2026-10-22 00:05:00+00','2026-10-22 08:00:00+00','  ')$$,'22023','STAFF_REASON_REQUIRED','AC-033 a correction without a reason is refused');
select ok(ops.correct_attendance_record('00000000-0000-0000-0000-00000000f104','2026-10-22 00:00:00+00','2026-10-22 00:05:00+00','2026-10-22 08:00:00+00','Phone died at the door') is not null,'AC-033 a correction with a reason is saved');
select is(jsonb_array_length(ops.get_attendance_record(current_setting('app.a104')::uuid)->'history'),1,'AC-033 the change and the original both appear in record history');
select is((ops.get_attendance_record(current_setting('app.a104')::uuid)->'history'->0->'before'->>'status') || '>' || (ops.get_attendance_record(current_setting('app.a104')::uuid)->'history'->0->'after'->>'status'),'closed>out','AC-033 the original state is kept beside the corrected state');
select is((ops.get_attendance_record(current_setting('app.a104')::uuid)->>'late')::boolean,false,'AC-033 a corrected clock-in re-evaluates the late flag');
select throws_ok($$select ops.correct_attendance_record('00000000-0000-0000-0000-0000000000d1','2026-10-22 00:00:00+00','2026-10-22 00:05:00+00',null,'Own record')$$,'42501','STAFF_ATTENDANCE_FORBIDDEN','AC-033 nobody corrects their own record');
select ok(ops.correct_attendance_record('00000000-0000-0000-0000-00000000f105','2026-10-22 00:00:00+00','2026-10-22 00:20:00+00',null,'Clocked in on paper') is not null,'AC-033 a lead can record a clock-in that never reached the server');

-- Settings apply from the next shift only.
select public.t_as('00000000-0000-0000-0000-00000000f101');
select throws_ok($$select ops.save_attendance_settings(5,30,50,30,120,120,3,90)$$,'42501','STAFF_ADMIN_FORBIDDEN','AC-036 a member cannot change attendance settings');
select public.t_as('00000000-0000-0000-0000-0000000000d3','admin');
select throws_ok($$select ops.save_attendance_settings(5,30,50,30,120,120,3,91)$$,'22023','STAFF_SETTINGS_INVALID','NFR-002 selfie retention cannot exceed the disclosed 90 days');
select public.t_clock('2026-10-22 10:30:00+00');
select ok(ops.save_attendance_settings(0,30,50,30,120,120,3,90) is not null,'AC-036 an administrator saves the late grace');
select is((ops.get_attendance_settings())->>'late_grace_min','0','AC-036 the new grace is the current setting');
reset role;
select is((select grace_min from ops.attendance_records where id = current_setting('app.a101')::uuid),10,'AC-036 recorded attendance keeps the grace it was judged with');
select is((ops._attendance_settings_at('00000000-0000-0000-0000-0000000000a1','2026-10-22 00:00:00+00')).late_grace_min,10,'AC-036 a shift that already started keeps the old grace');
select is((ops._attendance_settings_at('00000000-0000-0000-0000-0000000000a1','2026-10-23 00:00:00+00')).late_grace_min,0,'AC-036 the next shift uses the new grace');
set local role authenticated;
select public.t_as('00000000-0000-0000-0000-00000000f101');
select public.t_clock('2026-10-22 23:55:00+00');
select set_config('app.b101', ops.begin_attendance_clock_in('2026-10-23 00:00:00+00')->>'attempt_id', true);
select public.t_selfie(current_setting('app.b101')::uuid);
select public.t_clock('2026-10-23 00:03:00+00');
select is((ops.clock_in_attendance(current_setting('app.b101')::uuid, 0, 0, 10))->>'late','true','AC-036 the new grace applies to the next shift (07:03 is late at grace 0)');

-- Selfie retention: 90 days from capture, newer ones stay.
reset role;
update ops.attendance_records set selfie_captured_at = '2027-01-10 00:00:00+00' where id = current_setting('app.a103')::uuid;
select public.t_clock('2027-01-19 00:00:00+00');
select is((ops.run_attendance_jobs()->>'selfies_queued')::int,0,'AC-042 nothing is queued before 90 days');
select public.t_clock('2027-01-21 00:00:00+00');
select is((ops.run_attendance_jobs()->>'selfies_queued')::int,3,'AC-042 selfies older than 90 days are queued for deletion');
select is((select count(*)::int from ops.attendance_records where selfie_path is not null),2,'AC-042 the newer selfies are kept');
select is((select count(*)::int from ops.attendance_records where selfie_path is null and selfie_purged_at is not null),3,'AC-042 the old references are cleared at once');
select is((ops.run_attendance_jobs()->>'selfies_queued')::int,0,'AC-042 the retention job is idempotent');

select * from finish();
rollback;
