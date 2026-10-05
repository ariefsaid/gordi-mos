begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select mos._test_seed_follow_ups();
select set_config('app.allow_test_seeds', 'off', true);

insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id,
                       accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000008031','00000000-0000-0000-0000-0000000000a1','Comment target',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');
insert into mos.weekly_updates (id, org_id, person_id, week_start, created_by)
values ('00000000-0000-0000-0000-000000008032','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1','2026-10-05','00000000-0000-0000-0000-0000000000d1');
insert into mos.comments (id, org_id, author_id, entity_type, entity_id, body)
select '00000000-0000-0000-0000-000000008033','00000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-0000000000d1','task','00000000-0000-0000-0000-000000008031',
       'Please review @' || lower(split_part(p.full_name, ' ', 1))
from shared.people p where p.id = '00000000-0000-0000-0000-0000000000d2';
insert into mos.comments (id, org_id, author_id, entity_type, entity_id, body)
values
  ('00000000-0000-0000-0000-000000008034','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','weekly_update','00000000-0000-0000-0000-000000008032','Update discussion'),
  ('00000000-0000-0000-0000-000000008035','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','follow_up','00000000-0000-0000-0000-000000000e01','Follow-up discussion'),
  ('00000000-0000-0000-0000-000000008036','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d2','task','00000000-0000-0000-0000-000000008031','A manager comment');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select ok(not has_function_privilege('authenticated',
  'mos.create_notification(uuid,text,text,text,jsonb)', 'EXECUTE'),
  'the notification insertion helper is not an authenticated RPC');
select isnt(mos.create_comment_mention_notification(
  '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000008033','en'),
  null, 'a comment author can notify a person named by that comment');
reset role;
select is((select title || '|' || (metadata->>'source') || '|' || (metadata#>>'{actor,id}') || '|' ||
                  (metadata#>>'{actor,name}') || '|' || (metadata#>>'{entity,type}') || '|' ||
                  (metadata#>>'{entity,id}') || '|' || (metadata#>>'{entity,route}')
             from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000d2'
               and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000008031'
             order by created_at desc limit 1),
  'Author mentioned you in a task|mention|00000000-0000-0000-0000-0000000000d1|Author|task|00000000-0000-0000-0000-000000008031|/work/tasks?record=00000000-0000-0000-0000-000000008031',
  'notification source, actor and destination come from the authenticated comment');
set local role authenticated;
select throws_ok($$
  select mos.create_comment_mention_notification(
    '00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000008033','en')
  $$, '42501', 'comment recipient must be named in the comment',
  'a notification recipient must be named in the source comment');
select throws_ok($$
  select mos.create_comment_mention_notification(
    '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000008036','en')
  $$, '42501', 'comment notification requires its author',
  'only the comment author can deliver its notification');
select throws_ok($$
  select mos.create_comment_mention_notification(
    '00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-000000008033','en')
  $$, '42501', 'comment recipient must be active in the current org',
  'comment notifications remain within the active organization');

-- Comments follow the same parent visibility as weekly updates and follow-ups.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-000000008032'),1,
  'the manager can read the parent weekly update');
select is((select count(*)::int from mos.comments where id='00000000-0000-0000-0000-000000008034'),1,
  'the manager can read its weekly-update comment');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates where id='00000000-0000-0000-0000-000000008032'),0,
  'a peer cannot read the parent weekly update');
select is((select count(*)::int from mos.comments where id='00000000-0000-0000-0000-000000008034'),0,
  'a peer cannot read its weekly-update comment');
select is((select count(*)::int from mos.follow_ups where id='00000000-0000-0000-0000-000000000e01'),0,
  'a member outside the follow-up lane cannot read the parent');
select is((select count(*)::int from mos.comments where id='00000000-0000-0000-0000-000000008035'),0,
  'a member outside the follow-up lane cannot read its comment');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from mos.follow_ups where id='00000000-0000-0000-0000-000000000e01'),1,
  'an authorized reader can read the parent follow-up');
select is((select count(*)::int from mos.comments where id='00000000-0000-0000-0000-000000008035'),1,
  'an authorized reader can read its follow-up comment');

select * from finish();
rollback;
