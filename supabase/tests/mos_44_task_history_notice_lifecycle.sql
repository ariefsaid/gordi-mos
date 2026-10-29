begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
select shared._test_seed_directory();
insert into shared.teams (id, org_id, business_unit_id, name, code) values
 ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Meeting Team','meeting-team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000e001',true,current_date);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select set_config('t.meeting', mos.create_meeting('Private', '00000000-0000-0000-0000-00000000e001', now(), true, null, null, array['00000000-0000-0000-0000-0000000000d3']::uuid[])::text, true);
select set_config('t.attendee', mos.create_meeting_task(current_setting('t.meeting')::uuid, 'Attendee', null)::text, true);
reset role;
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, is_private, description)
select ('00000000-0000-0000-0000-00000000700' || n)::uuid, '00000000-0000-0000-0000-0000000000a1', 'Task', '00000000-0000-0000-0000-0000000000a2',
 case when n=2 then '00000000-0000-0000-0000-0000000000d3' else '00000000-0000-0000-0000-0000000000d1' end::uuid,
 case when n=3 then '00000000-0000-0000-0000-0000000000d3' else '00000000-0000-0000-0000-0000000000d2' end::uuid,
 case when n=1 then '00000000-0000-0000-0000-0000000000d3' else '00000000-0000-0000-0000-0000000000d1' end::uuid, true, 'hello'
from generate_series(1,5) n;
insert into mos.task_viewers (org_id, task_id, person_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000007004','00000000-0000-0000-0000-0000000000d3');
update mos.tasks set body = '[{"type":"paragraph","content":[{"type":"text","text":"hello","styles":{"bold":true}}]}]' where id='00000000-0000-0000-0000-000000007005';
select is((select count(*)::int from shared.record_history where record_key='00000000-0000-0000-0000-000000007005' and field_name='body' and old_value is null and new_value is null), 1, 'formatting records a summary');
update mos.tasks set body = '[{"type":"paragraph","content":[{"type":"text","text":"hello","styles":{"bold":true}},{"type":"recordLink","props":{"kind":"task","id":"00000000-0000-0000-0000-000000007001"}}]}]' where id='00000000-0000-0000-0000-000000007005';
select is((select count(*)::int from shared.record_history where record_key='00000000-0000-0000-0000-000000007005' and field_name='body' and old_value is null and new_value is null), 2, 'record link records a summary');
update mos.tasks set description='changed' where id='00000000-0000-0000-0000-000000007005';
select is((select count(*)::int from shared.record_history where record_key='00000000-0000-0000-0000-000000007005' and field_name='description' and new_value='changed'), 1, 'plain text history remains once');
select is((select count(*)::int from shared.record_history where record_key='00000000-0000-0000-0000-000000007005' and field_name='body'), 2, 'text edit does not duplicate history');
insert into mos.notifications (org_id, owner_id, severity, title, metadata)
select '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','info','Notice',jsonb_build_object('entity',jsonb_build_object('type','task','id',id)) from mos.tasks where id in (select ('00000000-0000-0000-0000-00000000700' || n)::uuid from generate_series(1,5) n) or id=current_setting('t.attendee')::uuid;
insert into mos.notifications (org_id, owner_id, severity, title, metadata) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d3','info','Other org',jsonb_build_object('entity',jsonb_build_object('type','task','id','00000000-0000-0000-0000-000000007005')));
insert into shared.person_access_roles (org_id, person_id, access_role) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','admin') on conflict do nothing;
select set_config('request.jwt.claims','{}',true);
select is(shared.current_org_id(), null::uuid, 'role removal has no org session');
alter table shared.person_access_roles disable trigger person_access_roles_guard;
update shared.person_access_roles set revoked_at=now() where person_id='00000000-0000-0000-0000-0000000000d3' and access_role='admin';
alter table shared.person_access_roles enable trigger person_access_roles_guard;
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}'='00000000-0000-0000-0000-000000007001'), 1, 'creator keeps notice');
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}'='00000000-0000-0000-0000-000000007002'), 1, 'PIC keeps notice');
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}'='00000000-0000-0000-0000-000000007003'), 1, 'supervisor keeps notice');
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}'='00000000-0000-0000-0000-000000007004'), 1, 'viewer keeps notice');
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}'=current_setting('t.attendee')), 1, 'attendee keeps notice');
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d3' and org_id='00000000-0000-0000-0000-0000000000a1' and metadata #>> '{entity,id}'='00000000-0000-0000-0000-000000007005'), 0, 'ineligible notice removed');
select is((select count(*)::int from mos.notifications where title='Other org'), 1, 'other org notice is untouched');
select ok(not has_function_privilege('authenticated', 'mos._task_read_in_org(uuid,uuid,boolean,uuid)', 'execute'), 'explicit org predicate is internal');
select ok(not has_function_privilege('anon', 'mos._task_read_in_org(uuid,uuid,boolean,uuid)', 'execute'), 'anonymous cannot use explicit org predicate');
select ok(not mos.can_person_read_task('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000d3',false), 'existing predicate remains session scoped');
select * from finish();
rollback;
