begin;
create extension if not exists pgtap with schema extensions;
select plan(19);
select set_config('app.allow_test_seeds','on',true);
select mos._test_seed_process_tree();
insert into shared.teams(id,org_id,business_unit_id,name,code) values
('00000000-0000-0000-0000-000000004303','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','Outside Team','notice_outside');
insert into mos.signals(id,org_id,author_id,audience,owning_team_id,occurred_at,body) values
('00000000-0000-0000-0000-000000004301','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','team','00000000-0000-0000-0000-000000004303',now(),'Restricted Signal');
insert into mos.comments(id,org_id,entity_type,entity_id,author_id,body) values
('00000000-0000-0000-0000-000000004302','00000000-0000-0000-0000-0000000000a1','signal','00000000-0000-0000-0000-000000004301','00000000-0000-0000-0000-0000000000d1','Private words @peer @report @author @directmgr');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["admin"]}');
select is(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000004302','en'), null::uuid, 'a comment mention does not grant its recipient Signal access even when the sender is admin');
reset role;
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d4' and metadata #>> '{entity,id}'='00000000-0000-0000-0000-000000004301'),0,'no title, body, route or Signal id is delivered to a non-reader');
-- Compare recipient checks with the real read policy, rather than a second expected matrix.
create temp table notice_readers(person_id uuid primary key, can_read boolean);
grant all on notice_readers to authenticated;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
insert into notice_readers values ('00000000-0000-0000-0000-0000000000d1',mos.can_read_signal('00000000-0000-0000-0000-000000004301'));
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
insert into notice_readers values ('00000000-0000-0000-0000-0000000000d2',mos.can_read_signal('00000000-0000-0000-0000-000000004301'));
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}');
insert into notice_readers values ('00000000-0000-0000-0000-0000000000d3',mos.can_read_signal('00000000-0000-0000-0000-000000004301'));
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
insert into notice_readers values ('00000000-0000-0000-0000-0000000000d4',mos.can_read_signal('00000000-0000-0000-0000-000000004301'));
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
insert into notice_readers values ('00000000-0000-0000-0000-0000000000d5',mos.can_read_signal('00000000-0000-0000-0000-000000004301'));
reset role;
select ok((select bool_and(mos.person_can_read_signal(person_id,'00000000-0000-0000-0000-000000004301')=can_read) from notice_readers), 'recipient checks match session read gates for author and outside members');
insert into mos.signal_mentions(org_id,signal_id,mention_kind,target_person_id) values
('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000004301','person','00000000-0000-0000-0000-0000000000d5');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-000000004302','en'),null::uuid,'an explicit Signal mention recipient receives comment notifications');
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000004302','id'),null::uuid,'the Signal author remains a legitimate recipient');
reset role;
select is((select body from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d5' and metadata #>> '{entity,id}'='00000000-0000-0000-0000-000000004301' and metadata->>'source'='mention'), 'Private words @peer @report @author @directmgr', 'a reader receives the persisted comment body');
insert into mos.signal_mentions(id,org_id,signal_id,mention_kind,target_team_id) values
('00000000-0000-0000-0000-000000004306','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000004301','team','00000000-0000-0000-0000-000000005b02');
select is(mos.person_can_read_signal('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000004301'),true,'an explicit Team mention grants its active member recipient access');
update mos.signal_mentions set revoked_at=now() where id='00000000-0000-0000-0000-000000004306';
select is(mos.person_can_read_signal('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000004301'),false,'a revoked Team mention grants no recipient access');
insert into mos.signal_mentions(id,org_id,signal_id,mention_kind,target_bu_id) values
('00000000-0000-0000-0000-000000004307','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000004301','bu','00000000-0000-0000-0000-0000000000a2');
select is(mos.person_can_read_signal('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000004301'),true,'an explicit BU mention grants its role holder recipient access');
update mos.signal_mentions set revoked_at=now() where id='00000000-0000-0000-0000-000000004307';
select is(mos.person_can_read_signal('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000004301'),false,'a revoked BU mention grants no recipient access');
insert into shared.team_memberships(org_id,team_id,person_id,effective_from) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000004303','00000000-0000-0000-0000-0000000000d4',current_date);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000004302','en'),null::uuid,'an active owning-Team member receives the notice');
reset role;
insert into shared.person_access_roles(org_id,person_id,access_role) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','ops_lead');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000004302','en'),null::uuid,'recipient-side moderation authority grants delivery without sender authority');
reset role;
select is(mos.person_can_read_signal('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-000000004301'),false,'foreign-org recipients cannot read the Signal');
update shared.people set archived_at=now() where id='00000000-0000-0000-0000-0000000000d5';
select is(mos.person_can_read_signal('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-000000004301'),false,'archived recipients are excluded');
select is(has_function_privilege('authenticated','mos.person_can_read_signal(uuid,uuid)','EXECUTE'),false,'recipient checks are internal');
select is(has_function_privilege('authenticated','shared.person_role_authority_allows(uuid,text,uuid,uuid,uuid)','EXECUTE'),false,'recipient authority checks are internal');
update shared.person_access_roles set revoked_at=now() where person_id='00000000-0000-0000-0000-0000000000d2' and access_role='ops_lead';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000004302','en'),null::uuid,'revoked recipient moderation authority stops new delivery immediately');
select is(shared.current_person_id(),'00000000-0000-0000-0000-0000000000d1'::uuid,'recipient checks preserve the caller identity');
reset role;
insert into mos.signals(id,org_id,author_id,audience,occurred_at,body) values
('00000000-0000-0000-0000-000000004304','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','org',now(),'All Teams Signal');
insert into mos.comments(id,org_id,entity_type,entity_id,author_id,body) values
('00000000-0000-0000-0000-000000004305','00000000-0000-0000-0000-0000000000a1','signal','00000000-0000-0000-0000-000000004304','00000000-0000-0000-0000-0000000000d1','Visible to all @directmgr');
set local role authenticated;
select isnt(mos.create_comment_mention_notification('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000004305','en'),null::uuid,'an ordinary active org reader receives All Teams comment mentions');
select * from finish();
rollback;
