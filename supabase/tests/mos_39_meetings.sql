-- Meetings (#1840): who reads and edits a Meeting, Private Meetings, series, Tasks created in a
-- Meeting, the Still-open list, the minutes document guards, mention notices and history.
--
-- Personas (shared._test_seed_directory, org A unless noted):
--   A Author ...d1   attendee of every Meeting below (creator); also on the owning Team
--   B DirectMgr ...d2  attendee       C Peer ...d4  primary member of the owning Team, NOT an attendee
--   D Report ...d5     other org member (briefly an attendee of the public Meeting)
--   E GrandMgr ...d3   admin          G DualHat ...d6  attendee of the private Meeting only
--   F ForeignMgr ...b4 (org B)
begin;
create extension if not exists pgtap with schema extensions;
select plan(108);

select shared._test_seed_directory();
insert into shared.teams (id, org_id, business_unit_id, name, code) values
 ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Meeting Team','meeting-team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-00000000e001',true,current_date),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000e001',false,current_date);
insert into mos.objectives (id, org_id, name) values ('00000000-0000-0000-0000-00000000e0b1','00000000-0000-0000-0000-0000000000a1','Objective One');
insert into mos.work_lines (id, org_id, name, type) values ('00000000-0000-0000-0000-00000000e0b2','00000000-0000-0000-0000-0000000000a1','Project One','project');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select set_config('t.m1', mos.create_meeting('Weekly ops', '00000000-0000-0000-0000-00000000e001', now(), false, null, '00000000-0000-0000-0000-00000000e0b1', array['00000000-0000-0000-0000-0000000000d2']::uuid[])::text, true);
select set_config('t.m2', mos.create_meeting('Salary review', '00000000-0000-0000-0000-00000000e001', now(), true, '00000000-0000-0000-0000-00000000e0b2', null, array['00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d6']::uuid[])::text, true);
select is((select count(*)::int from mos.meeting_attendees where meeting_id = current_setting('t.m1')::uuid and removed_at is null), 2,
  'AC2: create_meeting stores the creator and the named attendee');
select throws_ok($$ insert into mos.meetings (title, owning_team_id) values ('direct', '00000000-0000-0000-0000-00000000e001') $$, '42501', null,
  'AC2: a Meeting is created only through mos.create_meeting (no direct INSERT)');
select throws_ok($$ select mos.create_meeting('Both links', '00000000-0000-0000-0000-00000000e001', null, false, '00000000-0000-0000-0000-00000000e0b2', '00000000-0000-0000-0000-00000000e0b1') $$,
  '23514', null, 'AC2: a Meeting links at most one of Project/Process and Objective');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting read: A');
select is(mos.can_edit_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting edit: A');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting read: B');
select is(mos.can_edit_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting edit: B');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting read: C');
select is(mos.can_edit_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting edit: C');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting read: D');
select is(mos.can_edit_meeting(current_setting('t.m1')::uuid), false, 'AC3: public meeting edit: D');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select is(mos.can_read_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting read: E');
select is(mos.can_edit_meeting(current_setting('t.m1')::uuid), true, 'AC3: public meeting edit: E');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m1')::uuid), false, 'AC3: public meeting read: F');
select is(mos.can_edit_meeting(current_setting('t.m1')::uuid), false, 'AC3: public meeting edit: F');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m2')::uuid), true, 'AC3: private meeting read: A');
select is(mos.can_edit_meeting(current_setting('t.m2')::uuid), true, 'AC3: private meeting edit: A');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m2')::uuid), true, 'AC3: private meeting read: B');
select is(mos.can_edit_meeting(current_setting('t.m2')::uuid), true, 'AC3: private meeting edit: B');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m2')::uuid), false, 'AC3: private meeting read: C');
select is(mos.can_edit_meeting(current_setting('t.m2')::uuid), false, 'AC3: private meeting edit: C');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m2')::uuid), false, 'AC3: private meeting read: D');
select is(mos.can_edit_meeting(current_setting('t.m2')::uuid), false, 'AC3: private meeting edit: D');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select is(mos.can_read_meeting(current_setting('t.m2')::uuid), true, 'AC3: private meeting read: E');
select is(mos.can_edit_meeting(current_setting('t.m2')::uuid), true, 'AC3: private meeting edit: E');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
select is(mos.can_read_meeting(current_setting('t.m2')::uuid), false, 'AC3: private meeting read: F');
select is(mos.can_edit_meeting(current_setting('t.m2')::uuid), false, 'AC3: private meeting edit: F');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from mos.meetings where id = current_setting('t.m2')::uuid) + (select count(*)::int from mos.meeting_attendees where meeting_id = current_setting('t.m2')::uuid) + (select count(*)::int from mos.meetings where title = 'Salary review'), 0, 'AC3: C reads no row, no title and no attendee of the private Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from mos.meetings where id = current_setting('t.m2')::uuid) + (select count(*)::int from mos.meeting_attendees where meeting_id = current_setting('t.m2')::uuid) + (select count(*)::int from mos.meetings where title = 'Salary review'), 0, 'AC3: D reads no row, no title and no attendee of the private Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
select is((select count(*)::int from mos.meetings where id = current_setting('t.m2')::uuid) + (select count(*)::int from mos.meeting_attendees where meeting_id = current_setting('t.m2')::uuid) + (select count(*)::int from mos.meetings where title = 'Salary review'), 0, 'AC3: F reads no row, no title and no attendee of the private Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from mos.meetings where id = current_setting('t.m1')::uuid), 1, 'AC3: any org member reads a public Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
select is((select count(*)::int from mos.meetings where id = current_setting('t.m1')::uuid), 0, 'AC3: another org reads nothing of a public Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
update mos.meetings set title = 'Weekly ops (team)' where id = current_setting('t.m1')::uuid;
select is((select title from mos.meetings where id = current_setting('t.m1')::uuid), 'Weekly ops (team)', 'AC3: an owning-Team member edits a public Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
update mos.meetings set title = 'hijack' where id = current_setting('t.m1')::uuid;
select is((select title from mos.meetings where id = current_setting('t.m1')::uuid), 'Weekly ops (team)', 'AC3: another org member cannot edit a Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
update mos.meetings set title = 'hijack' where id = current_setting('t.m2')::uuid;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is((select title from mos.meetings where id = current_setting('t.m2')::uuid), 'Salary review', 'AC3: an owning-Team member cannot edit a private Meeting they are not in');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select lives_ok($$ update mos.meetings set minutes = '[{"type":"paragraph","content":"hello"}]'::jsonb where id = current_setting('t.m1')::uuid $$, 'AC2: an attendee saves the minutes');
select throws_ok($$ update mos.meetings set minutes = '{"type":"paragraph"}'::jsonb where id = current_setting('t.m1')::uuid $$, '23514', null, 'AC2: minutes must be a block array');
select throws_ok($$ update mos.meetings set minutes = jsonb_build_array(jsonb_build_object('type','paragraph','content', repeat('x', 300000))) where id = current_setting('t.m1')::uuid $$, '23514', null, 'AC2: minutes over 256 KB are refused');
select throws_ok($$ update mos.meetings set previous_meeting_id = current_setting('t.m1')::uuid where id = current_setting('t.m2')::uuid $$, '42501', null, 'AC7: the series chain is not editable by hand');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select lives_ok($$ insert into mos.meeting_attendees (meeting_id, person_id) values (current_setting('t.m1')::uuid, '00000000-0000-0000-0000-0000000000d5') $$, 'AC3: an owning-Team member adds an attendee to a public Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is(mos.can_edit_meeting(current_setting('t.m1')::uuid), true, 'AC3: the added person is an attendee, so can edit');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select throws_ok($$ insert into mos.meeting_attendees (meeting_id, person_id) values (current_setting('t.m2')::uuid, '00000000-0000-0000-0000-0000000000d4') $$, '42501', null, 'AC3: a Team member cannot add themself to a private Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$ insert into mos.meeting_attendees (meeting_id, person_id) values (current_setting('t.m1')::uuid, '00000000-0000-0000-0000-0000000000b4') $$, '23503', null, 'AC2: an attendee must be in the same org');
update mos.meeting_attendees set removed_at = now() where meeting_id = current_setting('t.m1')::uuid and person_id = '00000000-0000-0000-0000-0000000000d5';
select is((select count(*)::int from mos.meeting_attendees where meeting_id = current_setting('t.m1')::uuid and person_id = '00000000-0000-0000-0000-0000000000d5' and removed_at is not null), 1, 'AC3: an attendee removes another softly');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is(mos.can_edit_meeting(current_setting('t.m1')::uuid), false, 'AC3: a removed attendee loses edit rights');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$ update mos.meeting_attendees set person_id = '00000000-0000-0000-0000-0000000000d4' where meeting_id = current_setting('t.m1')::uuid and person_id = '00000000-0000-0000-0000-0000000000d2' $$, '42501', null, 'AC2: only removed_at moves on an attendee row');
select set_config('t.m3', mos.start_next_meeting(current_setting('t.m2')::uuid)::text, true);
select is((select title || '|' || is_private || '|' || owning_team_id || '|' || coalesce(work_line_id::text,'-') || '|' || coalesce(starts_at::text,'unset') from mos.meetings where id = current_setting('t.m3')::uuid),
  'Salary review|true|00000000-0000-0000-0000-00000000e001|00000000-0000-0000-0000-00000000e0b2|unset', 'AC7: Start next meeting copies title, Team, Private and link, and leaves the date unset');
select is((select array_agg(person_id order by person_id) from mos.meeting_attendees where meeting_id = current_setting('t.m3')::uuid and removed_at is null),
  array['00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d6']::uuid[], 'AC7: Start next meeting copies the live attendees');
select is((select sequence_number from mos.meetings where id = current_setting('t.m3')::uuid), 2, 'AC7: the next meeting is number 2 of the series');
select is((select (series_id = (select series_id from mos.meetings where id = current_setting('t.m2')::uuid)) and previous_meeting_id = current_setting('t.m2')::uuid from mos.meetings where id = current_setting('t.m3')::uuid), true, 'AC7: Previous links back inside the same series');
select is((select id from mos.meetings where previous_meeting_id = current_setting('t.m2')::uuid), current_setting('t.m3')::uuid, 'AC7: Next is the meeting that names this one as Previous');
select throws_ok($$ select mos.start_next_meeting(current_setting('t.m2')::uuid) $$, '23505', null, 'AC7: a Meeting has at most one next meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$ select mos.start_next_meeting(current_setting('t.m1')::uuid) $$, '42501', null, 'AC7: someone who cannot edit the Meeting cannot start its next one');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from mos.meetings where id = current_setting('t.m3')::uuid), 0, 'AC3: the next meeting of a private Meeting is private too');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select set_config('t.pub', mos.create_meeting_task(current_setting('t.m1')::uuid, 'Public follow-up', null, date '2027-01-15')::text, true);
select set_config('t.priv', mos.create_meeting_task(current_setting('t.m2')::uuid, 'Private follow-up', null, date '2027-01-20')::text, true);
select set_config('t.priv2', mos.create_meeting_task(current_setting('t.m2')::uuid, 'Done follow-up', null, null)::text, true);
select is((select meeting_id from mos.tasks where id = current_setting('t.pub')::uuid), current_setting('t.m1')::uuid, 'AC4: a Task created in a Meeting carries meeting_id');
select is((select responsible_person_id || '|' || accountable_person_id || '|' || team_id || '|' || due_date || '|' || is_private from mos.tasks where id = current_setting('t.pub')::uuid),
  '00000000-0000-0000-0000-0000000000d1|00000000-0000-0000-0000-0000000000d2|00000000-0000-0000-0000-00000000e001|2027-01-15|false', 'AC4: defaults - PIC is me, Supervisor my one manager, Team the Meeting Team, a public Meeting gives a public Task');
select is((select count(*)::int from mos.task_events where task_id = current_setting('t.pub')::uuid and event_type = 'created'), 1, 'AC4: the created event is written');
select is((select is_private from mos.tasks where id = current_setting('t.priv')::uuid), true, 'AC6: a Task created in a private Meeting is private');
select throws_ok($$ select mos.create_meeting_task(current_setting('t.m1')::uuid, 'Needs a supervisor', '00000000-0000-0000-0000-0000000000d5') $$, '23502', null, 'AC4: a PIC with no single manager needs an explicit Supervisor');
select lives_ok($$ select mos.create_meeting_task(current_setting('t.m1')::uuid, 'For Report', '00000000-0000-0000-0000-0000000000d5', null, null, '00000000-0000-0000-0000-0000000000d2') $$, 'AC4: a downline PIC with an explicit Supervisor is created');
select throws_ok($$ update mos.tasks set meeting_id = null where id = current_setting('t.pub')::uuid $$, '42501', null, 'AC4: meeting_id never changes');
select is((select array_agg(title order by title) from mos.meeting_tasks(current_setting('t.m1')::uuid)), array['For Report','Public follow-up']::text[], 'AC5: tasks of this meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where meeting_id = current_setting('t.m2')::uuid), 2, 'AC6: private Meeting Tasks as B: attendees and admin read them, everyone else reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where meeting_id = current_setting('t.m2')::uuid), 2, 'AC6: private Meeting Tasks as G: attendees and admin read them, everyone else reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select is((select count(*)::int from mos.tasks where meeting_id = current_setting('t.m2')::uuid), 2, 'AC6: private Meeting Tasks as E: attendees and admin read them, everyone else reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where meeting_id = current_setting('t.m2')::uuid), 0, 'AC6: private Meeting Tasks as C: attendees and admin read them, everyone else reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where meeting_id = current_setting('t.m2')::uuid), 0, 'AC6: private Meeting Tasks as D: attendees and admin read them, everyone else reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where meeting_id = current_setting('t.m2')::uuid), 0, 'AC6: private Meeting Tasks as F: attendees and admin read them, everyone else reads none');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from mos.meeting_tasks(current_setting('t.m2')::uuid)), 2, 'AC6: an attendee who is neither creator, PIC nor Supervisor reads the private Meeting''s Tasks');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select throws_ok($$ select mos.create_meeting_task(current_setting('t.m2')::uuid, 'sneak', null) $$, '42501', null, 'AC6: a non-attendee cannot create a Task in a private Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$ insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by, meeting_id) values ('direct', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d5', current_setting('t.m2')::uuid) $$, '42501', null, 'AC6: a direct insert naming a private Meeting you cannot open is refused');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select throws_ok($$ update mos.tasks set is_private = false where id = current_setting('t.priv')::uuid $$, '42501', null, 'AC6: a non-attendee (even admin) cannot make a private Meeting''s Task public');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select lives_ok($$ update mos.tasks set status = 'Done' where id = current_setting('t.priv2')::uuid $$, 'setup: one private Task is completed');
select lives_ok($$ update mos.tasks set is_private = false where id = current_setting('t.priv2')::uuid $$, 'AC6: an attendee can make a private Meeting''s Task public');
select set_config('t.m4', mos.start_next_meeting(current_setting('t.m1')::uuid)::text, true);
select is((select array_agg(title order by title) from mos.meeting_still_open(current_setting('t.m4')::uuid)), array['For Report','Public follow-up']::text[], 'AC8: Still open from last time lists the previous Meeting''s Tasks that are not Done');
select is((select array_agg(title order by title) from mos.meeting_still_open((select id from mos.meetings where previous_meeting_id = current_setting('t.m2')::uuid))), array['Private follow-up']::text[], 'AC8: Done Tasks drop out of the list');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from mos.meeting_still_open(current_setting('t.m3')::uuid)), 0, 'AC8: a reader who cannot open the private Meeting gets no still-open rows');
select is((select count(*)::int from mos.meeting_still_open(current_setting('t.m4')::uuid)), 2, 'AC8: a reader of the public Meeting gets its public rows');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.meetings set minutes = '[{"type":"paragraph","content":[{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d4"}},{"type":"mention","props":{"kind":"team","id":"00000000-0000-0000-0000-00000000e001"}}]}]'::jsonb where id = current_setting('t.m1')::uuid;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where title = 'You were mentioned in meeting minutes'), 1, 'AC9: a person mentioned in the minutes (also as a Team member) gets exactly one Inbox notice');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where title = 'You were mentioned in meeting minutes'), 0, 'AC9: the author (a Team member) is not notified of their own mention');
update mos.meetings set minutes = '[{"type":"paragraph","content":[{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d4"}},{"type":"mention","props":{"kind":"team","id":"00000000-0000-0000-0000-00000000e001"}},{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d5"}}]}]'::jsonb where id = current_setting('t.m1')::uuid;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where title = 'You were mentioned in meeting minutes'), 1, 'AC9: saving again does not notify an already-mentioned person twice');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where title = 'You were mentioned in meeting minutes'), 1, 'AC9: a newly added mention is notified');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.meetings set minutes = '[{"type":"paragraph","content":[{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d5"}},{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d2"}}]}]'::jsonb where id = current_setting('t.m2')::uuid;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where metadata->'entity'->>'id' = current_setting('t.m2')), 0, 'AC3: a mention of a non-attendee in a private Meeting sends no notice');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where metadata->'entity'->>'id' = current_setting('t.m2')), 1, 'AC3: an attendee mentioned in a private Meeting is notified');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select ok((select count(*) from shared.record_history where table_name = 'meetings' and record_key = current_setting('t.m2') and field_name = 'minutes') >= 1, 'history: a minutes change is recorded for attendees');
select is((select count(*)::int from shared.record_history where table_name = 'meetings' and record_key = current_setting('t.m2') and (old_value is not null or new_value is not null)), 0, 'history: the minutes content is never copied');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from shared.record_history where table_name = 'meetings' and record_key = current_setting('t.m2')), 0, 'AC3: a private Meeting''s history is invisible to outsiders');
-- Security-review fixes (#1840): Private switch, task read arm, Task attach, hardening.
reset role;
insert into shared.teams (id, org_id, business_unit_id, name, code, archived_at) values
 ('00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Archived Team','archived-team', now()),
 ('00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Active Team','active-team', null),
 ('00000000-0000-0000-0000-00000000e0b3','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','B Team','b-team', null);
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-00000000e002',false,current_date),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-00000000e003',false,current_date);
insert into mos.meetings (id, org_id, title, owning_team_id, series_id, created_by) values
 ('00000000-0000-0000-0000-00000000e0b4','00000000-0000-0000-0000-0000000000b1','Org B meeting','00000000-0000-0000-0000-00000000e0b3','00000000-0000-0000-0000-00000000e0b4','00000000-0000-0000-0000-0000000000b4');
select throws_ok($$ insert into mos.tasks (org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, meeting_id) values ('00000000-0000-0000-0000-0000000000a1', 'cross-org', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000e0b4') $$, '23503', null, 'hardening: a Task cannot point at another org''s Meeting, even past the guards');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.meetings set minutes = '[{"type":"paragraph","content":[{"type":"mention","props":{"kind":"team","id":"00000000-0000-0000-0000-00000000e002"}},{"type":"mention","props":{"kind":"team","id":"00000000-0000-0000-0000-00000000e003"}},{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d2"}}]}]'::jsonb where id = current_setting('t.m4')::uuid;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where metadata->'entity'->>'id' = current_setting('t.m4')), 0, 'hardening: a mention of an archived Team notifies none of its members');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where metadata->'entity'->>'id' = current_setting('t.m4')), 1, 'hardening: a mention of an active Team notifies its members');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$ insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by, meeting_id) values ('injected', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d5', current_setting('t.m4')::uuid) $$, '42501', null, 'a reader of a public Meeting cannot attach a Task to it');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select lives_ok($$ update mos.meetings set is_private = true where id = current_setting('t.m4')::uuid $$, 'an attendee turns a public Meeting private');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where metadata->'entity'->>'id' = current_setting('t.m4')), 0, 'turning a Meeting private removes its mention notices from people who can no longer read it');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select is((select count(*)::int from mos.notifications where metadata->'entity'->>'id' = current_setting('t.m4')), 1, 'turning a Meeting private keeps the notices of its attendees');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select throws_ok($$ update mos.meetings set is_private = true where id = current_setting('t.m1')::uuid $$, '42501', null, 'a non-attendee Team member cannot turn a Meeting private');
select throws_ok($$ select mos.start_next_meeting(current_setting('t.m1')::uuid) $$, '42501', null, 'Start next meeting does not reveal a hidden next meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$ update mos.meetings set owning_team_id = '00000000-0000-0000-0000-00000000e003' where id = current_setting('t.m4')::uuid $$, '42501', null, 'the owning Team cannot be changed to a Team the caller is not in');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select throws_ok($$ select mos.create_meeting('Other team', '00000000-0000-0000-0000-00000000e001') $$, '42501', null, 'a Meeting cannot be created for a Team the caller is not in');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select lives_ok($$ select mos.create_meeting('Admin picks', '00000000-0000-0000-0000-00000000e001') $$, 'an admin can create a Meeting for any Team');
select lives_ok($$ update mos.meetings set owning_team_id = '00000000-0000-0000-0000-00000000e003' where id = current_setting('t.m4')::uuid $$, 'an admin can change the owning Team to any Team');
select hasnt_function('mos', '_meeting_is_private', array['uuid'], 'no function tells a caller whether an unreadable Meeting is private');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select set_config('t.outp', mos.create_meeting_task(current_setting('t.m2')::uuid, 'Outsider PIC', '00000000-0000-0000-0000-0000000000d5', null, null, '00000000-0000-0000-0000-0000000000d2')::text, true);
select lives_ok($$ update mos.meetings set is_private = false where id = current_setting('t.m2')::uuid $$, 'an attendee turns a private Meeting public');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where id = current_setting('t.priv')::uuid), 1, 'a private Task stays readable by the Meeting''s attendees after the Meeting turns public');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where id = current_setting('t.priv')::uuid), 0, 'a private Task stays hidden from others after the Meeting turns public');
select throws_ok($$ update mos.tasks set is_private = false where id = current_setting('t.outp')::uuid $$, '42501', null, 'a PIC outside the Meeting still cannot turn the Task public after the Meeting turns public');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select lives_ok($$ update mos.tasks set is_private = false where id = current_setting('t.outp')::uuid $$, 'an attendee can still turn the Task public after the Meeting turns public');
reset role;
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d6';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$ insert into mos.meeting_attendees (meeting_id, person_id) values (current_setting('t.m1')::uuid, '00000000-0000-0000-0000-0000000000d6') $$, '42501', null, 'an archived person cannot be added as an attendee');
update mos.meeting_attendees set removed_at = now() where meeting_id = current_setting('t.m2')::uuid and person_id = '00000000-0000-0000-0000-0000000000d6';
select throws_ok($$ update mos.meeting_attendees set removed_at = null where meeting_id = current_setting('t.m2')::uuid and person_id = '00000000-0000-0000-0000-0000000000d6' $$, '42501', null, 'an archived person cannot be re-added as an attendee');
select * from finish();
rollback;
