-- 0.17.1 Task and Meeting fixes:
--   a Task made in a Meeting can be given a chosen Supervisor, and still defaults as before;
--   the Meeting task readers return each Task's own privacy;
--   the plain-text copy of a Task document is not cut at 2000 characters;
--   an archived Meeting is read-only and its editors can unarchive it.
-- Personas (shared._test_seed_directory, org A): A ...d1 creator and Team member, B ...d2 A's manager,
-- E ...d3 admin, C ...d4 peer of A, D ...d5 A's report (managers: A and C), F ...b4 foreign org.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select shared._test_seed_directory();
insert into shared.teams (id, org_id, business_unit_id, name, code) values
 ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Meeting Team','meeting-team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000e001',true,current_date);

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select set_config('t.pubm', mos.create_meeting('Weekly ops', '00000000-0000-0000-0000-00000000e001', now(), false, null, null, array['00000000-0000-0000-0000-0000000000d5']::uuid[])::text, true);
select set_config('t.privm', mos.create_meeting('Salary review', '00000000-0000-0000-0000-00000000e001', now(), true, null, null, array['00000000-0000-0000-0000-0000000000d5']::uuid[])::text, true);

-- 1. A chosen Supervisor
select throws_ok($$ select mos.create_meeting_task(current_setting('t.pubm')::uuid, 'No manager chosen', '00000000-0000-0000-0000-0000000000d5') $$, '23502', null,
  'a PIC with two managers needs a chosen Supervisor');
select set_config('t.t1', mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Chosen manager', '00000000-0000-0000-0000-0000000000d5', null, null, '00000000-0000-0000-0000-0000000000d1')::text, true);
select is((select accountable_person_id from mos.tasks where id = current_setting('t.t1')::uuid), '00000000-0000-0000-0000-0000000000d1'::uuid,
  'the chosen Supervisor is stored');
select set_config('t.t2', mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Own manager', null, null, null, '00000000-0000-0000-0000-0000000000d2')::text, true);
select is((select accountable_person_id from mos.tasks where id = current_setting('t.t2')::uuid), '00000000-0000-0000-0000-0000000000d2'::uuid,
  'a chosen Supervisor wins over the default for the caller as PIC');
select set_config('t.t3', mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Just me', null, null, null, '00000000-0000-0000-0000-0000000000d1')::text, true);
select is((select accountable_person_id from mos.tasks where id = current_setting('t.t3')::uuid), '00000000-0000-0000-0000-0000000000d1'::uuid,
  'None, just me: the caller as PIC may be their own Supervisor');
select set_config('t.t4', mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Default', null)::text, true);
select is((select accountable_person_id from mos.tasks where id = current_setting('t.t4')::uuid), '00000000-0000-0000-0000-0000000000d2'::uuid,
  'no chosen Supervisor still defaults to the PIC''s one manager');
select throws_ok($$ select mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Foreign', null, null, null, '00000000-0000-0000-0000-0000000000b4') $$, '23514', null,
  'a Supervisor from another organisation is refused');
select set_config('t.priv1', mos.create_meeting_task(current_setting('t.privm')::uuid, 'Private just me', null, null, null, '00000000-0000-0000-0000-0000000000d1')::text, true);
select is((select is_private from mos.tasks where id = current_setting('t.priv1')::uuid), true, 'a Task made in a private Meeting is private');
select throws_ok($$ select mos.create_meeting_task(current_setting('t.privm')::uuid, 'Report just them', '00000000-0000-0000-0000-0000000000d5', null, null, '00000000-0000-0000-0000-0000000000d5') $$, '23514', null,
  'None, just me is refused when the PIC is not the creator');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select throws_ok($$ select mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Outsider', null, null, null, '00000000-0000-0000-0000-0000000000d1') $$, '42501', null,
  'someone who cannot edit the Meeting cannot add a Task with a chosen Supervisor');

-- 2. The readers carry each Task's own privacy
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is((select is_private from mos.meeting_tasks(current_setting('t.pubm')::uuid) where id = current_setting('t.t1')::uuid), false, 'meeting_tasks: a public Task is not private');
select is((select created_in_private_meeting from mos.meeting_tasks(current_setting('t.privm')::uuid) where id = current_setting('t.priv1')::uuid), true, 'meeting_tasks: the Task knows it was made in a private Meeting');
update mos.meetings set is_private = false where id = current_setting('t.privm')::uuid;
select is((select created_in_private_meeting and is_private from mos.meeting_tasks(current_setting('t.privm')::uuid) where id = current_setting('t.priv1')::uuid), true,
  'the Task keeps its own flags after the Meeting is made public');
select set_config('t.next', mos.start_next_meeting(current_setting('t.pubm')::uuid)::text, true);
select is((select count(*)::int from mos.meeting_still_open(current_setting('t.next')::uuid) where is_private = false), 4, 'meeting_still_open returns each Task''s privacy');

-- 3. The Task text is the whole document
select set_config('t.doc', mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Long notes', null)::text, true);
update mos.tasks set body = jsonb_build_array(jsonb_build_object('type','paragraph','content',
  jsonb_build_array(jsonb_build_object('type','text','text', repeat('word ', 1200))))) where id = current_setting('t.doc')::uuid;
select is((select char_length(description) from mos.tasks where id = current_setting('t.doc')::uuid), 5999, 'a long document keeps all its text');
update mos.tasks set description = repeat('a', 3000) where id = current_setting('t.doc')::uuid;
select is((select char_length(description) from mos.tasks where id = current_setting('t.doc')::uuid), 3000, 'a text write over 2000 characters is kept');
select throws_ok($$ update mos.tasks set description = repeat('a', 262145) where id = current_setting('t.doc')::uuid $$, '23514', null,
  'the text is still bounded by the document cap');

-- 4. Archive
select is((select count(*)::int from mos.meetings where id = current_setting('t.pubm')::uuid and archived_at is null), 1, 'the Meeting starts unarchived');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
update mos.meetings set archived_at = now() where id = current_setting('t.pubm')::uuid;
select is((select archived_at is null from mos.meetings where id = current_setting('t.pubm')::uuid), true, 'someone who cannot edit the Meeting cannot archive it');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.meetings set archived_at = now() where id = current_setting('t.pubm')::uuid;
select is((select archived_at is not null from mos.meetings where id = current_setting('t.pubm')::uuid), true, 'an editor archives the Meeting');
select is((select count(*)::int from mos.meetings where id = current_setting('t.pubm')::uuid), 1, 'an archived Meeting stays readable by id');
select throws_ok($$ update mos.meetings set title = 'Renamed' where id = current_setting('t.pubm')::uuid $$, '42501', null, 'an archived Meeting''s title cannot change');
select throws_ok($$ update mos.meetings set minutes = '[]'::jsonb where id = current_setting('t.pubm')::uuid $$, '42501', null, 'an archived Meeting''s minutes cannot change');
select throws_ok($$ insert into mos.meeting_attendees (meeting_id, person_id) values (current_setting('t.pubm')::uuid, '00000000-0000-0000-0000-0000000000d2') $$, '42501', null, 'no attendee is added to an archived Meeting');
select throws_ok($$ select mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Late', null) $$, '42501', null, 'no Task is created in an archived Meeting');
select throws_ok($$ select mos.start_next_meeting(current_setting('t.pubm')::uuid) $$, '42501', null, 'an archived Meeting starts no next meeting');
update mos.meetings set archived_at = null where id = current_setting('t.pubm')::uuid;
select is((select archived_at is null from mos.meetings where id = current_setting('t.pubm')::uuid), true, 'an editor unarchives the Meeting');
update mos.meetings set title = 'Weekly ops (renamed)' where id = current_setting('t.pubm')::uuid;
select is((select title from mos.meetings where id = current_setting('t.pubm')::uuid), 'Weekly ops (renamed)', 'an unarchived Meeting is editable again');

select * from finish();
rollback;
