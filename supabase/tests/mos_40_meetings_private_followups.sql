-- Meetings (#1840) x Private Tasks (#1839) follow-up rules:
--   the attendee arm applies only to Tasks created in a private Meeting (server-derived flag),
--   removing an attendee deletes the Task notices they can no longer read,
--   revoking admin keeps Task notices a Meeting attendee still reads.
-- Personas (shared._test_seed_directory, org A): A ...d1 creator, B ...d2 A's manager (Supervisor),
-- G ...d6 attendee only, E ...d3 admin, D ...d5 other member.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select shared._test_seed_directory();
insert into shared.teams (id, org_id, business_unit_id, name, code) values
 ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Meeting Team','meeting-team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000e001',true,current_date);

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select set_config('t.pubm', mos.create_meeting('Public sync', '00000000-0000-0000-0000-00000000e001', now(), false, null, null, array['00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d3']::uuid[])::text, true);
select set_config('t.privm', mos.create_meeting('Private sync', '00000000-0000-0000-0000-00000000e001', now(), true, null, null, array['00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d3']::uuid[])::text, true);
select set_config('t.tpub', mos.create_meeting_task(current_setting('t.pubm')::uuid, 'Made in public', null)::text, true);
select set_config('t.tpriv', mos.create_meeting_task(current_setting('t.privm')::uuid, 'Made in private', null)::text, true);
select set_config('t.tg', mos.create_meeting_task(current_setting('t.privm')::uuid, 'D is PIC', '00000000-0000-0000-0000-0000000000d5', null, null, '00000000-0000-0000-0000-0000000000d2')::text, true);

-- 1. The flag is derived, not sent.
select is((select created_in_private_meeting from mos.tasks where id = current_setting('t.tpub')::uuid), false, 'a Task made in a public Meeting is not flagged');
select is((select created_in_private_meeting from mos.tasks where id = current_setting('t.tpriv')::uuid), true, 'a Task made in a private Meeting is flagged');
update mos.tasks set created_in_private_meeting = true where id = current_setting('t.tpub')::uuid;
select is((select created_in_private_meeting from mos.tasks where id = current_setting('t.tpub')::uuid), false, 'a client update cannot set the flag');
update mos.tasks set created_in_private_meeting = false where id = current_setting('t.tpriv')::uuid;
select is((select created_in_private_meeting from mos.tasks where id = current_setting('t.tpriv')::uuid), true, 'a client update cannot clear the flag');
with i as (
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by, created_in_private_meeting)
  values ('direct', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', true)
  returning created_in_private_meeting)
select is((select created_in_private_meeting from i), false, 'a client insert cannot set the flag');

-- 2. A Task made in a public Meeting, marked Private later: attendees are not readers.
update mos.tasks set is_private = true where id = current_setting('t.tpub')::uuid;
select is((select is_private from mos.tasks where id = current_setting('t.tpub')::uuid), true, 'setup: the creator marks the Task private');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where id = current_setting('t.tpub')::uuid), 0, 'a listed attendee of the public Meeting does not read a Task later marked private');
select is((select count(*)::int from mos.tasks where id = current_setting('t.tpriv')::uuid), 1, 'an attendee reads a Task made in the private Meeting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where id = current_setting('t.tpub')::uuid), 1, 'the Supervisor still reads it');

-- 3. A Task made in a private Meeting stays with its attendees after the Meeting turns public.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.meetings set is_private = false where id = current_setting('t.privm')::uuid;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from mos.tasks where id = current_setting('t.tpriv')::uuid), 1, 'an attendee still reads the private-Meeting Task after the Meeting turns public');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.meetings set is_private = true where id = current_setting('t.privm')::uuid;

-- 4. Removing an attendee deletes Task notices they can no longer read.
reset role;
insert into mos.notifications (org_id, owner_id, severity, title, metadata)
select '00000000-0000-0000-0000-0000000000a1', o, 'info', 'task notice', jsonb_build_object('source', s, 'entity', jsonb_build_object('type', 'task', 'id', t))
  from (values ('00000000-0000-0000-0000-0000000000d6'::uuid, 'comment_mention', current_setting('t.tpriv')::uuid),
               ('00000000-0000-0000-0000-0000000000d5'::uuid, 'task_assignment', current_setting('t.tg')::uuid),
               ('00000000-0000-0000-0000-0000000000d5'::uuid, 'comment_mention', current_setting('t.tpriv')::uuid),
               ('00000000-0000-0000-0000-0000000000d3'::uuid, 'task_mention',    current_setting('t.tpriv')::uuid),
               ('00000000-0000-0000-0000-0000000000d3'::uuid, 'task_mention',    current_setting('t.tpub')::uuid)) v(o, s, t);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.meeting_attendees set removed_at = now() where meeting_id = current_setting('t.privm')::uuid and person_id in ('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d6');
reset role;
select is((select count(*)::int from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000d6' and metadata #>> '{entity,id}' = current_setting('t.tpriv')), 0, 'a removed attendee loses the notice about a Task they can no longer read');
select is((select count(*)::int from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000d5' and metadata #>> '{entity,id}' = current_setting('t.tpriv')), 0, 'a removed attendee loses a Task notice of any kind they can no longer read');
select is((select count(*)::int from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000d5' and metadata #>> '{entity,id}' = current_setting('t.tg')), 1, 'a removed attendee keeps the notice about a Task they are PIC of');

-- 5. Ex-admin who attends the private Meeting keeps its Task notices.
insert into shared.person_access_roles (org_id, person_id, access_role) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','admin') on conflict do nothing;
alter table shared.person_access_roles disable trigger person_access_roles_guard;
update shared.person_access_roles set revoked_at = now() where person_id = '00000000-0000-0000-0000-0000000000d3' and access_role = 'admin';
alter table shared.person_access_roles enable trigger person_access_roles_guard;
select is((select count(*)::int from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}' = current_setting('t.tpriv')), 1, 'an ex-admin who attends the Meeting keeps the notice about its private Task');
select is((select count(*)::int from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}' = current_setting('t.tpub')), 0, 'an ex-admin loses the notice about a private Task they cannot read');

-- 6. A minutes save that would notify more than 50 people is refused.
reset role;
insert into shared.teams (id, org_id, business_unit_id, name, code) values
 ('00000000-0000-0000-0000-00000000e050','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Big Team','big-team');
insert into shared.people (id, org_id, full_name)
select ('00000000-0000-0000-0000-00000000f' || lpad(g::text, 3, '0'))::uuid, '00000000-0000-0000-0000-0000000000a1', 'Bulk person ' || g from generate_series(1, 51) g;
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', ('00000000-0000-0000-0000-00000000f' || lpad(g::text, 3, '0'))::uuid, '00000000-0000-0000-0000-00000000e050', false, current_date from generate_series(1, 51) g;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$ update mos.meetings set minutes = '[{"type":"paragraph","content":[{"type":"mention","props":{"kind":"team","id":"00000000-0000-0000-0000-00000000e050"}}]}]'::jsonb where id = current_setting('t.pubm')::uuid $$,
  '22023', null, 'a minutes save that would notify 51 people is refused');

update mos.meetings set minutes = '[{"type":"paragraph","content":[{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d5"}}]}]'::jsonb where id = current_setting('t.pubm')::uuid;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select metadata #>> '{actor,id}' from mos.notifications where metadata ->> 'source' = 'meeting_mention' and owner_id = '00000000-0000-0000-0000-0000000000d5'), '00000000-0000-0000-0000-0000000000d1', 'a Meeting mention notice carries the author');

select * from finish();
rollback;
