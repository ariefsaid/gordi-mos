-- Staff attendance stage 2: the hr access role, absences, cover offers and claims, the doctor's-note
-- bucket, the lead's queue, HR views and the timed cover job. Time rules run on a fixed clock.
begin;
create extension if not exists pgtap with schema extensions;
select plan(119);

select set_config('app.allow_test_seeds', 'on', true);
select set_config('app.attendance_now', '2026-10-25 21:00:00+00', true); -- Mon 04:00 Jakarta
select mos._test_seed_signal_tree();

create function pg_temp.p(code text) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-' || lpad(code, 12, '0'))::uuid $$;
create function pg_temp.as_(person text, roles text default 'member', org text default 'a1') returns void language sql as $$
  select shared._test_set_access_roles(
    '{"org_id":"' || pg_temp.p(org) || '","person_id":"' || pg_temp.p(person) || '","access_roles":["' || replace(roles, ',', '","') || '"]}')
$$;
create function pg_temp.notes(owner text, title_like text) returns integer language sql as $$
  select count(*)::int from mos.notifications where owner_id = pg_temp.p(owner) and title like title_like
$$;

reset role;
insert into shared.people (id, org_id, full_name) values
  (pg_temp.p('f101'), pg_temp.p('a1'), 'Crew 101'), (pg_temp.p('f102'), pg_temp.p('a1'), 'Crew 102'),
  (pg_temp.p('f103'), pg_temp.p('a1'), 'Crew 103'), (pg_temp.p('f104'), pg_temp.p('a1'), 'Crew 104'),
  (pg_temp.p('f105'), pg_temp.p('a1'), 'Crew 105'),
  (pg_temp.p('f201'), pg_temp.p('a1'), 'Office 201'), (pg_temp.p('f202'), pg_temp.p('a1'), 'Office 202'),
  (pg_temp.p('f203'), pg_temp.p('a1'), 'Office 203'),
  (pg_temp.p('f301'), pg_temp.p('a1'), 'Other Site 301'), (pg_temp.p('f401'), pg_temp.p('a1'), 'HR Person'),
  (pg_temp.p('f501'), pg_temp.p('a1'), 'Unled 501');
insert into shared.sites (id, org_id, name, code) values (pg_temp.p('5a03'), pg_temp.p('a1'), 'Other Site', 'other_site');
insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
  (pg_temp.p('5b04'), pg_temp.p('a1'), pg_temp.p('a2'), pg_temp.p('5a03'), 'Other Team', 'other_team'),
  (pg_temp.p('5b05'), pg_temp.p('a1'), pg_temp.p('a2'), null, 'Unled Team', 'unled_team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  (pg_temp.p('a1'), pg_temp.p('f101'), pg_temp.p('5b01'), false), (pg_temp.p('a1'), pg_temp.p('f102'), pg_temp.p('5b01'), false),
  (pg_temp.p('a1'), pg_temp.p('f103'), pg_temp.p('5b01'), false), (pg_temp.p('a1'), pg_temp.p('f104'), pg_temp.p('5b01'), false),
  (pg_temp.p('a1'), pg_temp.p('f105'), pg_temp.p('5b01'), false),
  (pg_temp.p('a1'), pg_temp.p('f201'), pg_temp.p('5b02'), false), (pg_temp.p('a1'), pg_temp.p('f202'), pg_temp.p('5b02'), false),
  (pg_temp.p('a1'), pg_temp.p('f203'), pg_temp.p('5b02'), false),
  (pg_temp.p('a1'), pg_temp.p('f301'), pg_temp.p('5b04'), false), (pg_temp.p('a1'), pg_temp.p('f501'), pg_temp.p('5b05'), false);
insert into shared.team_lead_assignments (org_id, team_id, lead_person_id) values
  (pg_temp.p('a1'), pg_temp.p('5b01'), pg_temp.p('d1')), (pg_temp.p('a1'), pg_temp.p('5b02'), pg_temp.p('d4'));

-- ── hr: the seventh access role (ADR-0063) ───────────────────────────────────────────────────────
select lives_ok($$select 'hr'::shared.access_role$$, 'AC-020 the access-role vocabulary accepts hr');
select throws_ok($$select 'payroll'::shared.access_role$$, '23514', null, 'AC-020 the vocabulary stays closed to other values');
select is((select array_agg(capability order by capability) from shared.role_capabilities where role = 'hr'),
  array['attendance.correct','attendance.read_all','attendance.receive_unled'],
  'AC-020 hr holds only the three attendance grants, and no money or roster grant');
select ok(exists (select 1 from shared.role_capabilities where role = 'admin' and capability = 'attendance.read_all'),
  'AC-034 admin reads every Team through the same named grant');

set local role authenticated;
select pg_temp.as_('d3', 'admin');
select ops.save_attendance_team_site(pg_temp.p('5b01'), pg_temp.p('5a01'));
select ops.save_attendance_team_site(pg_temp.p('5b02'), pg_temp.p('5a01'));
select ops.save_attendance_team_site(pg_temp.p('5b05'), pg_temp.p('5a01'));
select set_config('app.pagi', ops.save_site_shift_template(pg_temp.p('5a01'), null, 'Pagi', '07:00', '15:00')::text, true);
select set_config('app.siang', ops.save_site_shift_template(pg_temp.p('5a01'), null, 'Siang', '14:00', '22:00')::text, true);
select throws_ok($$insert into shared.person_access_roles (org_id, person_id, access_role) values (pg_temp.p('a1'), pg_temp.p('d3'), 'hr')$$,
  '42501', null, 'AC-020 an admin can never give themselves hr');
insert into shared.person_access_roles (org_id, person_id, access_role) values (pg_temp.p('a1'), pg_temp.p('f401'), 'hr');
select pg_temp.as_('f401', 'hr');
select is(shared.can('attendance.read_all'), true, 'AC-034 hr holds the read-all grant');

-- ── Rosters the scenarios hang on ────────────────────────────────────────────────────────────────
select pg_temp.as_('d1');
select set_config('app.s1', ops.save_staff_shift(pg_temp.p('5b01'), pg_temp.p('f101'), '2026-10-26', current_setting('app.pagi')::uuid)::text, true);
select set_config('app.s2', ops.save_staff_shift(pg_temp.p('5b01'), pg_temp.p('f102'), '2026-10-26', current_setting('app.pagi')::uuid)::text, true);
select set_config('app.s3', ops.save_staff_shift(pg_temp.p('5b01'), pg_temp.p('f103'), '2026-10-30', current_setting('app.pagi')::uuid)::text, true);
select set_config('app.s4', ops.save_staff_shift(pg_temp.p('5b01'), pg_temp.p('f104'), '2026-10-28', current_setting('app.pagi')::uuid)::text, true);
select set_config('app.s6', ops.save_staff_shift(pg_temp.p('5b01'), pg_temp.p('f102'), '2026-10-27', current_setting('app.siang')::uuid)::text, true);
select set_config('app.s5', ops.save_staff_shift(pg_temp.p('5b01'), pg_temp.p('f105'), '2026-11-02', current_setting('app.pagi')::uuid)::text, true);
select ops.publish_staff_roster(pg_temp.p('5b01'), '2026-10-26');
select ops.publish_staff_roster(pg_temp.p('5b01'), '2026-11-02');
select pg_temp.as_('d3', 'admin');
select set_config('app.s7', ops.save_staff_shift(pg_temp.p('5b05'), pg_temp.p('f501'), '2026-11-02', current_setting('app.pagi')::uuid)::text, true);
select ops.publish_staff_roster(pg_temp.p('5b05'), '2026-11-02');

-- ── AC-010 sick today: accepted at once, flagged, shift open, lead told ──────────────────────────
select pg_temp.as_('f101');
select set_config('app.a1', ops.report_staff_absence('sick', current_setting('app.s1')::uuid, null, null)::text, true);
select is((select jsonb_path_query_first(ops.list_my_staff_absences(), '$[0]')->>'status'), 'accepted', 'AC-010 a same-day sick report is accepted without waiting');
select is((select (jsonb_path_query_first(ops.list_my_staff_absences(), '$[0]')->>'flagged')::boolean), true, 'AC-010 a same-day sick report is flagged');
select pg_temp.as_('f102');
select is((select jsonb_array_length(ops.list_open_staff_shifts()->'open')), 1, 'AC-010 a teammate at the same Site sees the shift open');
select ok(not (ops.list_open_staff_shifts()::text like '%sick%'), 'AC-010 teammates never see why a shift is open');
reset role;
select is(pg_temp.notes('d1', 'Sick today%'), 1, 'AC-010 the Team lead is notified of the sick report');
select is((select count(*)::int from ops.staff_shift_offers where shift_id = current_setting('app.s1')::uuid and status = 'open' and kind = 'absence'), 1, 'AC-010 the shift is open to teammates');
set local role authenticated;

select pg_temp.as_('f101');
select throws_ok($$select ops.report_staff_absence('sick', current_setting('app.s1')::uuid, null, null)$$, '23505', 'STAFF_ABSENCE_EXISTS', 'AC-010 the same shift cannot be reported twice');
select pg_temp.as_('f103');
select throws_ok($$select ops.report_staff_absence('sick', current_setting('app.s3')::uuid, null, null)$$, '22023', 'STAFF_SICK_SAME_DAY_ONLY', 'AC-010 sick for a later day is asked for as permission or leave');

-- ── AC-011 / AC-012 permission and leave: the 3-day cutoff and the lead's approval ───────────────
select set_config('app.a3', ops.report_staff_absence('leave', current_setting('app.s3')::uuid, null, null)::text, true);
select is((select jsonb_path_query_first(ops.list_my_staff_absences(), '$[0]')->>'status'), 'pending', 'AC-011 leave 4 days ahead waits for the lead');
reset role;
select is(pg_temp.notes('d1', 'Absence request%'), 1, 'AC-011 the request reaches the lead''s Inbox');
select is((select count(*)::int from ops.staff_shift_offers where shift_id = current_setting('app.s3')::uuid), 0, 'AC-011 the shift is not open before approval');
set local role authenticated;
select pg_temp.as_('f104');
select throws_ok($$select ops.report_staff_absence('leave', current_setting('app.s4')::uuid, null, null)$$, '23514', 'STAFF_ABSENCE_TOO_LATE', 'AC-012 leave 2 days ahead is refused');
select pg_temp.as_('f102');
select throws_ok($$select ops.report_staff_absence('leave', current_setting('app.s4')::uuid, null, null, pg_temp.p('f104'))$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-012 a colleague cannot record it on their behalf');
select pg_temp.as_('d1');
select set_config('app.a4', ops.report_staff_absence('leave', current_setting('app.s4')::uuid, null, null, pg_temp.p('f104'))::text, true);
select is((select count(*)::int from jsonb_array_elements(ops.list_staff_absences('2026-10-01', '2026-10-31')) a where a->>'person_name' = 'Crew 104' and a->>'status' = 'approved'), 1, 'AC-012 the lead can record the late leave and it is accepted');
select pg_temp.as_('f102');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a3')::uuid, true)$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-011 a teammate cannot approve');
select pg_temp.as_('f401', 'hr');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a3')::uuid, true)$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-020 hr cannot approve a Team it does not lead');
select pg_temp.as_('d1');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a3')::uuid, false)$$, '22023', 'STAFF_REASON_REQUIRED', 'AC-011 a rejection needs a reason');
select ops.decide_staff_absence(current_setting('app.a3')::uuid, true);
select is((select count(*)::int from ops.list_staff_cover_queue() q, jsonb_array_elements(q->'uncovered') u where u->>'person_name' = 'Crew 103'), 1, 'AC-011 approval opens the shift');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a3')::uuid, true)$$, 'P0003', 'STAFF_ABSENCE_NOT_PENDING', 'AC-011 a decided request cannot be decided again');

-- ── AC-013 doctor's note: private, insert-only, read through the checking function ───────────────
select pg_temp.as_('f101');
select lives_ok(format($f$insert into storage.objects (bucket_id, name) values ('staff-notes', %L)$f$,
  pg_temp.p('a1') || '/' || current_setting('app.a1') || '/' || pg_temp.p('c001') || '.jpg'), 'AC-013 the sick Person uploads a note photo to their own absence');
select throws_ok(format($f$insert into storage.objects (bucket_id, name) values ('staff-notes', %L)$f$,
  pg_temp.p('a1') || '/' || current_setting('app.a1') || '/notes.pdf'), '42501', null, 'AC-013 only canonical image paths are accepted');
select pg_temp.as_('f102');
select throws_ok(format($f$insert into storage.objects (bucket_id, name) values ('staff-notes', %L)$f$,
  pg_temp.p('a1') || '/' || current_setting('app.a1') || '/' || pg_temp.p('c002') || '.jpg'), '42501', null, 'AC-013 a teammate cannot add a note to someone else''s absence');
select pg_temp.as_('f101');
select ops.attach_staff_absence_note(current_setting('app.a1')::uuid, pg_temp.p('a1') || '/' || current_setting('app.a1') || '/' || pg_temp.p('c001') || '.jpg');
select is((select (jsonb_path_query_first(ops.list_my_staff_absences(), '$[0]')->>'documented')::boolean), true, 'AC-013 the sick day now shows as documented');
select throws_ok(format($f$select ops.attach_staff_absence_note(%L, %L)$f$, current_setting('app.a1'), pg_temp.p('a1') || '/' || current_setting('app.a1') || '/' || pg_temp.p('c001') || '.jpg'),
  '23505', 'STAFF_NOTE_EXISTS', 'AC-013 a note cannot be replaced');
select is((select count(*)::int from storage.objects where bucket_id = 'staff-notes'), 1, 'AC-013 the Person reads their own note');
update storage.objects set name = name || 'x' where bucket_id = 'staff-notes';
select throws_like($$delete from storage.objects where bucket_id = 'staff-notes'$$, 'Direct deletion%', 'AC-013 a stored note cannot be deleted by a user');
select is((select count(*)::int from storage.objects where bucket_id = 'staff-notes' and name not like '%x'), 1, 'AC-013 a stored note cannot be overwritten by a user');
select pg_temp.as_('f102');
select is((select count(*)::int from storage.objects where bucket_id = 'staff-notes'), 0, 'AC-034 a teammate reads no one else''s note');
select pg_temp.as_('d4');
select is((select count(*)::int from storage.objects where bucket_id = 'staff-notes'), 0, 'AC-034 a lead of another Team reads nothing');
select pg_temp.as_('d1');
select is((select count(*)::int from storage.objects where bucket_id = 'staff-notes'), 1, 'AC-034 the Team lead reads the note');
select pg_temp.as_('f401', 'hr');
select is((select count(*)::int from storage.objects where bucket_id = 'staff-notes'), 1, 'AC-034 hr reads the note');
select pg_temp.as_('b4', 'member', 'b1');
select is((select count(*)::int from storage.objects where bucket_id = 'staff-notes'), 0, 'AC-034 another organization reads nothing');

-- ── AC-014 / AC-015 / AC-016 claims: same Site only, first claim wins, the lead confirms ─────────
reset role;
select set_config('app.o1', (select id::text from ops.staff_shift_offers where shift_id = current_setting('app.s1')::uuid), true);
set local role authenticated;
select pg_temp.as_('f301');
select throws_ok($$select ops.claim_staff_shift(current_setting('app.o1')::uuid)$$, '42501', 'STAFF_CLAIM_NOT_ELIGIBLE', 'AC-014 a Person at another Site cannot claim');
select pg_temp.as_('f101');
select throws_ok($$select ops.claim_staff_shift(current_setting('app.o1')::uuid)$$, '42501', 'STAFF_CLAIM_OWN_SHIFT', 'AC-014 the absent Person cannot claim their own shift');
select pg_temp.as_('f201');
select set_config('app.c1', ops.claim_staff_shift(current_setting('app.o1')::uuid)::text, true);
select is((select jsonb_path_query_first(ops.list_open_staff_shifts(), '$.open[0].my_claim_status') #>> '{}'), 'pending', 'AC-014 a teammate at the same Site holds a pending claim');
select pg_temp.as_('f202');
select throws_ok($$select ops.claim_staff_shift(current_setting('app.o1')::uuid)$$, '23505', 'STAFF_CLAIM_TAKEN', 'AC-015 the second claimant loses');
reset role;
select is((select count(*)::int from ops.staff_shift_claims where offer_id = current_setting('app.o1')::uuid and status = 'pending'), 1, 'AC-015 exactly one claim is recorded');
select throws_ok(format($f$insert into ops.staff_shift_claims (org_id, offer_id, claimant_id) values (%L, %L, %L)$f$, pg_temp.p('a1'), current_setting('app.o1'), pg_temp.p('f202')),
  '23505', null, 'AC-015 the database itself refuses a second pending claim');
set local role authenticated;
select pg_temp.as_('f201');
select ops.withdraw_staff_claim(current_setting('app.c1')::uuid);
reset role;
select is(pg_temp.notes('d1', 'Cover fell through%'), 1, 'AC-016 a claim that falls through tells the lead');
select is((select status from ops.staff_shift_offers where id = current_setting('app.o1')::uuid), 'open', 'AC-016 and reopens the shift to teammates');
set local role authenticated;
select pg_temp.as_('f202');
select set_config('app.c2', ops.claim_staff_shift(current_setting('app.o1')::uuid)::text, true);
select pg_temp.as_('d1');
select ops.decide_staff_claim(current_setting('app.c2')::uuid, false, 'Prefer a Team member');
reset role;
select is((select status from ops.staff_shift_offers where id = current_setting('app.o1')::uuid), 'open', 'AC-016 a declined claim reopens the shift');
select is(pg_temp.notes('f202', 'Claim not accepted%'), 1, 'AC-016 the claimant is told');
set local role authenticated;
select pg_temp.as_('f201');
select set_config('app.c3', ops.claim_staff_shift(current_setting('app.o1')::uuid)::text, true);
select pg_temp.as_('f102');
select throws_ok($$select ops.decide_staff_claim(current_setting('app.c3')::uuid, true)$$, '42501', 'STAFF_CLAIM_FORBIDDEN', 'AC-016 only the lead confirms');
select pg_temp.as_('d1');
select ops.decide_staff_claim(current_setting('app.c3')::uuid, true);
reset role;
select is((select person_id from ops.staff_shifts where id = current_setting('app.s1')::uuid), pg_temp.p('f201'), 'AC-016 the claimant holds the shift');
select is((select origin || ':' || (cover_for_person_id = pg_temp.p('f101'))::text from ops.staff_shifts where id = current_setting('app.s1')::uuid), 'cover:true', 'AC-016 the shift records whom it covers');
select ok(pg_temp.notes('f201', 'You are covering%') = 1 and pg_temp.notes('f101', 'Your shift is covered%') = 1, 'AC-016 both people are notified');
set local role authenticated;

-- ── swap offers: the original Person stays assigned until it is covered ──────────────────────────
select pg_temp.as_('f105');
select set_config('app.o5', ops.offer_staff_shift(current_setting('app.s5')::uuid)::text, true);
reset role;
select is((select person_id from ops.staff_shifts where id = current_setting('app.s5')::uuid), pg_temp.p('f105'), 'AC-014 a swap offer leaves the Person assigned');
set local role authenticated;
select pg_temp.as_('f202');
select set_config('app.c5', ops.claim_staff_shift(current_setting('app.o5')::uuid)::text, true);
select pg_temp.as_('f105');
select ops.cancel_staff_offer(current_setting('app.o5')::uuid);
reset role;
select is((select status from ops.staff_shift_claims where id = current_setting('app.c5')::uuid), 'void', 'AC-014 withdrawing a swap voids the pending claim');
set local role authenticated;
select pg_temp.as_('f102');
select throws_ok($$select ops.offer_staff_shift(current_setting('app.s5')::uuid)$$, 'P0002', 'STAFF_SHIFT_NOT_FOUND', 'AC-014 only the assigned Person offers a swap');

-- ── direct assignment bypasses claims ────────────────────────────────────────────────────────────
reset role;
select set_config('app.o4', (select id::text from ops.staff_shift_offers where shift_id = current_setting('app.s4')::uuid), true);
set local role authenticated;
select pg_temp.as_('d1');
select throws_ok($$select ops.assign_staff_cover(current_setting('app.o4')::uuid, pg_temp.p('f301'))$$, '42501', 'STAFF_CLAIM_NOT_ELIGIBLE', 'AC-014 direct cover still has to be a teammate at the Site');

-- ── uncovered shift opened inside the 2-hour window alerts the lead at once ──────────────────────
select set_config('app.attendance_now', '2026-10-27 05:30:00+00', true); -- Tue 12:30 Jakarta, shift at 14:00
select pg_temp.as_('f102');
select ops.report_staff_absence('sick', current_setting('app.s6')::uuid, null, null);
reset role;
select is((select count(*)::int from ops.staff_shift_alerts where shift_id = current_setting('app.s6')::uuid and kind = 'uncovered'), 1, 'AC-017 an offer opened late alerts the lead straight away');

-- ── AC-017 the timed job: one uncovered alert per shift ──────────────────────────────────────────
select set_config('app.attendance_now', '2026-10-27 21:59:00+00', true);
select is((ops.run_staff_attendance_jobs())->>'uncovered', '0', 'AC-017 nothing is alerted before the 2-hour mark');
select set_config('app.attendance_now', '2026-10-27 22:00:00+00', true); -- Wed 05:00, shift at 07:00
select is((ops.run_staff_attendance_jobs())->>'uncovered', '1', 'AC-017 an open shift 2 hours from its start alerts the lead');
select is((select count(*)::int from ops.staff_shift_alerts where shift_id = current_setting('app.s4')::uuid), 1, 'AC-017 one alert is stored for the shift');
select is((ops.run_staff_attendance_jobs())->>'uncovered', '0', 'AC-017 running the job again adds none');
select is((select count(*)::int from mos.notifications where owner_id = pg_temp.p('d1') and title like 'Shift still uncovered%'), 2, 'AC-017 the lead holds one alert per uncovered shift, not one per run');
select ok(not has_function_privilege('authenticated', 'ops.run_staff_attendance_jobs()', 'execute'), 'AC-017 clients cannot run the job');

-- direct cover for the uncovered shift
set local role authenticated;
select pg_temp.as_('d1');
select ops.assign_staff_cover(current_setting('app.o4')::uuid, pg_temp.p('f203'));
reset role;
select is((select person_id from ops.staff_shifts where id = current_setting('app.s4')::uuid), pg_temp.p('f203'), 'AC-014 the lead assigns cover directly');

-- ── AC-019 no-show: ended, no clock-in, no reported absence ──────────────────────────────────────
do $$
begin
  if to_regclass('ops.attendance_records') is null then
    create table ops.attendance_records (
      id uuid primary key default gen_random_uuid(), org_id uuid not null, person_id uuid not null, team_id uuid, site_id uuid,
      shift_start_at timestamptz not null, shift_end_at timestamptz, status text not null default 'pending',
      clock_in_at timestamptz, late boolean not null default false, early_leave boolean not null default false);
  end if;
end $$;
select set_config('app.attendance_now', '2026-10-28 12:00:00+00', true);
select is((ops.run_staff_attendance_jobs())->>'no_show', '0', 'AC-019 nothing is judged until an admin switches no-show recording on');
set local role authenticated;
select pg_temp.as_('d3', 'admin');
select ops.set_noshow_recording_from('2026-10-01 00:00:00+00');
select pg_temp.as_('f102');
select throws_ok($$select ops.set_noshow_recording_from(null)$$, '42501', 'STAFF_ADMIN_FORBIDDEN', 'AC-019 only an admin changes the switch');
reset role;
insert into ops.attendance_records (org_id, person_id, team_id, site_id, shift_start_at, shift_end_at, status, clock_in_at)
select s.org_id, s.person_id, s.team_id, s.site_id, s.start_at, s.end_at, 'in', s.start_at from ops.staff_shifts s where s.id = current_setting('app.s4')::uuid;
select is((ops.run_staff_attendance_jobs())->>'no_show', '2', 'AC-019 ended shifts with no clock-in and no absence are recorded');
select is((select array_agg(person_id::text order by person_id::text) from ops.staff_shift_outcomes), array[pg_temp.p('f102')::text, pg_temp.p('f201')::text],
  'AC-019 only the two who neither clocked in nor reported are no-shows');
select is((select count(*)::int from ops.staff_shift_outcomes o where o.person_id = pg_temp.p('f102') and o.shift_start_at = (select start_at from ops.staff_shifts where id = current_setting('app.s6')::uuid)), 0,
  'AC-019 an accepted absence is not a no-show');
select is((select count(*)::int from ops.staff_shift_outcomes o where o.person_id = pg_temp.p('f203')), 0, 'AC-019 a clock-in is not a no-show');
select is((ops.run_staff_attendance_jobs())->>'no_show', '0', 'AC-019 running the job again records nothing new');

-- ── AC-020 a Team with no lead: requests reach hr, and hr decides them ───────────────────────────
set local role authenticated;
select pg_temp.as_('f501');
select set_config('app.a7', ops.report_staff_absence('leave', current_setting('app.s7')::uuid, null, null)::text, true);
reset role;
select is(pg_temp.notes('f401', 'Absence request%'), 1, 'AC-020 a leave request from a Team without a lead reaches hr');
set local role authenticated;
select pg_temp.as_('f401', 'hr');
select is((select count(*)::int from jsonb_array_elements(ops.list_staff_cover_queue()->'absences') a where a->>'person_name' = 'Unled 501'), 1, 'AC-020 hr sees it in the queue');
select is((select (a->>'can_decide')::boolean from jsonb_array_elements(ops.list_staff_cover_queue()->'absences') a where a->>'person_name' = 'Unled 501'), true, 'AC-020 and is told it can decide');
select lives_ok($$select ops.decide_staff_absence(current_setting('app.a7')::uuid, true)$$, 'AC-020 hr approves a request from a Team without a lead');
select pg_temp.as_('d3', 'admin');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a7')::uuid, true)$$, 'P0003', 'STAFF_ABSENCE_NOT_PENDING', 'AC-020 the decision stands');

-- ── standing-hours shifts have no row: absences key on the occurrence ────────────────────────────
select pg_temp.as_('d4');
select ops.save_standing_hours(pg_temp.p('5b02'), null, array[0,1,2,3,4]::smallint[], '09:00', '17:00', true);
select pg_temp.as_('f202');
select lives_ok($$select ops.report_staff_absence('leave', null, pg_temp.p('5b02'), '2026-11-04')$$, 'AC-011 a standing-hours day can be requested off');
select throws_ok($$select ops.report_staff_absence('leave', null, pg_temp.p('5b02'), '2026-11-07')$$, 'P0002', 'STAFF_SHIFT_NOT_FOUND', 'AC-011 a day with no standing shift is refused');

-- ── HR and lead views: who sees what ─────────────────────────────────────────────────────────────
select pg_temp.as_('f401', 'hr');
select ok((select count(distinct a->>'team_name') from jsonb_array_elements(ops.list_staff_absences('2026-10-01', '2026-11-30')) a) >= 3, 'AC-034 hr sees absences from every Team');
select is((select count(*)::int from jsonb_array_elements(ops.get_staff_roster(pg_temp.p('5b01'), '2026-10-26')->'shifts')), 5, 'AC-034 hr reads any Team''s roster');
select throws_ok($$select ops.save_staff_shift(pg_temp.p('5b01'), pg_temp.p('f102'), '2026-11-03', current_setting('app.pagi')::uuid)$$, '42501', 'STAFF_SHIFT_FORBIDDEN', 'AC-034 hr cannot plan another Team''s roster');
select throws_ok($$select ops.assign_staff_cover(current_setting('app.o4')::uuid, pg_temp.p('f102'))$$, '42501', 'STAFF_OFFER_FORBIDDEN', 'AC-034 hr cannot assign cover');
select pg_temp.as_('d1');
select is((select count(*)::int from jsonb_array_elements(ops.list_staff_absences('2026-10-01', '2026-11-30')) a where a->>'team_name' <> (select name from shared.teams where id = pg_temp.p('5b01'))), 0, 'AC-034 a lead sees only their own Team');
select pg_temp.as_('f102');
select throws_ok($$select ops.list_staff_absences('2026-10-01', '2026-11-30')$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-034 an ordinary member sees no one else''s absences');
select throws_ok($$select count(*) from ops.staff_absences$$, '42501', null, 'AC-034 the tables are closed to direct reads');
select pg_temp.as_('b4', 'member', 'b1');
select is(jsonb_array_length(ops.list_staff_cover_queue()->'absences'), 0, 'AC-034 another organization gets an empty queue');
select throws_ok($$select ops.claim_staff_shift(current_setting('app.o1')::uuid)$$, 'P0002', 'STAFF_OFFER_NOT_FOUND', 'AC-034 another organization cannot reach an offer');

-- ── AC-040 monthly totals ────────────────────────────────────────────────────────────────────────
select pg_temp.as_('f401', 'hr');
select is((select to_jsonb(t) - 'person_id' - 'team_id' - 'full_name' - 'team_name' - 'shifts_worked' - 'late' - 'early_leave'
             from jsonb_array_elements(ops.list_staff_monthly_totals('2026-10-15')) t where t->>'full_name' = 'Crew 101'),
  '{"permission":0,"leave":0,"no_show":0,"sick_documented":1,"sick_undocumented":0}'::jsonb, 'AC-040 a documented sick day counts as documented');
select is((select (t->>'sick_undocumented') || ':' || (t->>'no_show') from jsonb_array_elements(ops.list_staff_monthly_totals('2026-10-15')) t where t->>'full_name' = 'Crew 102'),
  '1:1', 'AC-040 an undocumented sick day and a no-show are counted for the same Person');
select is((select (t->>'leave') from jsonb_array_elements(ops.list_staff_monthly_totals('2026-10-15')) t where t->>'full_name' = 'Crew 103'), '1', 'AC-040 approved leave is counted');
select is((select (t->>'leave') from jsonb_array_elements(ops.list_staff_monthly_totals('2026-10-15')) t where t->>'full_name' = 'Crew 104'), '1', 'AC-040 leave recorded by the lead is counted');
select is((select (t->>'no_show') from jsonb_array_elements(ops.list_staff_monthly_totals('2026-10-15')) t where t->>'full_name' = 'Office 201'), '1', 'AC-040 the Person who took over a shift and did not come is the no-show');
select is((select (t->>'shifts_worked') from jsonb_array_elements(ops.list_staff_monthly_totals('2026-10-15')) t where t->>'full_name' = 'Office 203'), '1', 'AC-040 worked shifts come from clock records');
select is((select count(*)::int from jsonb_array_elements(ops.list_staff_monthly_totals('2026-11-15')) t where (t->>'sick_undocumented')::int > 0 or (t->>'no_show')::int > 0), 0, 'AC-040 a month shows only its own days');

-- ── Owner rule: nobody decides their own request; a lead's goes to admin or hr, hr's goes to admin ──
reset role;
insert into shared.team_lead_assignments (org_id, team_id, lead_person_id) values (pg_temp.p('a1'), pg_temp.p('5b01'), pg_temp.p('f105'));
insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values (pg_temp.p('a1'), pg_temp.p('f401'), pg_temp.p('5b02'), false);
set local role authenticated;
select pg_temp.as_('f105');
select set_config('app.a8', ops.report_staff_absence('leave', current_setting('app.s5')::uuid, null, null)::text, true);
reset role;
select is(pg_temp.notes('d3', 'Absence request%'), 1, 'AC-020 a lead''s own request reaches admin');
select is(pg_temp.notes('f401', 'Absence request%'), 2, 'AC-020 a lead''s own request reaches hr');
select is(pg_temp.notes('d1', 'Absence request%'), 1, 'AC-020 a lead''s own request does not reach the co-lead');
set local role authenticated;
select pg_temp.as_('d1');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a8')::uuid, true)$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-020 a co-lead cannot decide a lead''s own absence');
select pg_temp.as_('f105');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a8')::uuid, true)$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-020 nobody decides their own absence');
select is((select (a->>'can_decide')::boolean from jsonb_array_elements(ops.list_staff_cover_queue()->'absences') a where a->>'person_name' = 'Crew 105'), false, 'AC-020 the queue shows a lead their own request as not theirs to decide');
select pg_temp.as_('f401', 'hr');
select is((select (a->>'can_decide')::boolean from jsonb_array_elements(ops.list_staff_cover_queue()->'absences') a where a->>'person_name' = 'Crew 105'), true, 'AC-020 the queue shows hr a lead''s own request as theirs to decide');
select lives_ok($$select ops.decide_staff_absence(current_setting('app.a8')::uuid, true)$$, 'AC-020 hr decides a lead''s own absence');

select set_config('app.a9', ops.report_staff_absence('leave', null, pg_temp.p('5b02'), '2026-11-05')::text, true);
reset role;
select is(pg_temp.notes('d3', 'Absence request%'), 2, 'AC-020 an hr holder''s own request reaches admin');
select is(pg_temp.notes('d4', 'Absence request%'), 1, 'AC-020 an hr holder''s own request does not reach the Team lead');
select is(pg_temp.notes('f401', 'Absence request%'), 2, 'AC-020 an hr holder is not told of their own request');
set local role authenticated;
select pg_temp.as_('f401', 'hr');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a9')::uuid, true)$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-020 an hr holder cannot decide their own absence');
select pg_temp.as_('d4');
select throws_ok($$select ops.decide_staff_absence(current_setting('app.a9')::uuid, true)$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-020 the Team lead cannot decide an hr holder''s absence');
select pg_temp.as_('d3', 'admin');
select lives_ok($$select ops.decide_staff_absence(current_setting('app.a9')::uuid, true)$$, 'AC-020 admin decides an hr holder''s absence');

reset role;
select set_config('app.o3', (select id::text from ops.staff_shift_offers where shift_id = current_setting('app.s3')::uuid), true);
set local role authenticated;
select pg_temp.as_('f105');
select set_config('app.c8', ops.claim_staff_shift(current_setting('app.o3')::uuid)::text, true);
select throws_ok($$select ops.decide_staff_claim(current_setting('app.c8')::uuid, true)$$, '42501', 'STAFF_CLAIM_FORBIDDEN', 'AC-016 nobody decides their own cover claim');
select pg_temp.as_('d1');
select throws_ok($$select ops.decide_staff_claim(current_setting('app.c8')::uuid, true)$$, '42501', 'STAFF_CLAIM_FORBIDDEN', 'AC-016 a co-lead cannot decide a lead''s cover claim');
select is((select (c->>'can_decide')::boolean from jsonb_array_elements(ops.list_staff_cover_queue()->'claims') c where c->>'claimant_name' = 'Crew 105'), false, 'AC-016 the queue shows the co-lead the claim as not theirs to decide');
select pg_temp.as_('d3', 'admin');
select is((select (c->>'can_decide')::boolean from jsonb_array_elements(ops.list_staff_cover_queue()->'claims') c where c->>'claimant_name' = 'Crew 105'), true, 'AC-016 the queue shows admin the claim as theirs to decide');
select lives_ok($$select ops.decide_staff_claim(current_setting('app.c8')::uuid, true)$$, 'AC-016 admin confirms a lead''s cover claim');

-- ── hr revoked: the next request loses the access (ADR-0063) ─────────────────────────────────────
select pg_temp.as_('d3', 'admin');
update shared.person_access_roles set revoked_at = now() where person_id = pg_temp.p('f401') and access_role = 'hr';
select pg_temp.as_('f401', 'member');
select throws_ok($$select ops.list_staff_monthly_totals('2026-10-15')$$, '42501', 'STAFF_ABSENCE_FORBIDDEN', 'AC-034 revoking hr removes the view on the next request');
reset role;
select is((select count(*)::int from ops._attendance_recipients(pg_temp.p('a1'), pg_temp.p('5b05'), null)), 0, 'AC-020 a revoked hr holder receives no requests for a Team without a lead');
set local role authenticated;

-- ── structure: every new table is closed and forced; every definer function is pinned ────────────
reset role;
select ok(not has_table_privilege('authenticated', 'ops.staff_absences', 'SELECT') and not has_table_privilege('authenticated', 'ops.staff_shift_claims', 'INSERT')
      and (select bool_and(c.relrowsecurity and c.relforcerowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'ops' and c.relname = any(array['staff_absences','staff_shift_offers','staff_shift_claims','staff_shift_alerts','staff_shift_outcomes','staff_cover_config'])),
  'AC-034 the new tables are closed to direct access with forced row-level security');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'ops' and p.proname = any(array['report_staff_absence','decide_staff_absence','cancel_staff_absence','attach_staff_absence_note','offer_staff_shift','cancel_staff_offer','claim_staff_shift','withdraw_staff_claim','decide_staff_claim','assign_staff_cover','list_my_staff_absences','list_open_staff_shifts','list_staff_cover_queue','list_staff_absences','list_staff_monthly_totals','set_noshow_recording_from','run_staff_attendance_jobs'])
              and p.prosecdef and 'search_path=""' = any(p.proconfig)), 17, 'AC-034 every action is a definer function with a pinned search path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'ops' and p.proname = any(array['report_staff_absence','claim_staff_shift','list_staff_absences','set_noshow_recording_from'])
              and has_function_privilege('anon', p.oid, 'execute')), 0, 'AC-034 anonymous callers reach none of them');
select is((select count(*)::int from storage.buckets where id = 'staff-notes' and not public), 1, 'AC-013 the note bucket is private');

select * from finish();
rollback;
