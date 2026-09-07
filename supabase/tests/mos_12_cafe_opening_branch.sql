begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree(); select shared._test_seed_access_roles(); select ops._test_seed_cafe();
update mos.work_lines set code = 'cafe_opening' where id = '00000000-0000-0000-0000-00000000c001';
insert into shared.teams (id,org_id,business_unit_id,name,code,branch_id,activity) values
 ('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','GHQ bar','ghq-bar','00000000-0000-0000-0000-00000000bf01','bar'),
 ('00000000-0000-0000-0000-00000000cc02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','RRS kitchen','rrs-kitchen','00000000-0000-0000-0000-00000000bf02','kitchen'),
 ('00000000-0000-0000-0000-00000000cc03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','RRS bar','rrs-bar','00000000-0000-0000-0000-00000000bf02','bar'),
 ('00000000-0000-0000-0000-00000000cc04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','GHQ kitchen','ghq-kitchen','00000000-0000-0000-0000-00000000bf01','kitchen');
insert into shared.team_memberships (org_id,person_id,team_id,is_primary,effective_from) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-00000000cc02',true,current_date),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-00000000cc01',true,current_date),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-00000000cc03',false,current_date),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-00000000cc04',true,current_date)
 on conflict do nothing;
insert into shared.person_access_roles (org_id,person_id,access_role) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','supervisor') on conflict do nothing;
delete from shared.team_memberships where person_id='00000000-0000-0000-0000-0000000000d5' and team_id='00000000-0000-0000-0000-00000000cc04';
insert into shared.team_memberships (org_id,person_id,team_id,is_primary) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-000000005b01',true) on conflict do nothing;
insert into ops.kitchen_logs (id,org_id,business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi,status,submitted_by,notes) values
 ('00000000-0000-0000-0000-00000000ac20','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01',current_date,'00000000-0000-0000-0000-00000000bf02','bar','produce','00000000-0000-0000-0000-00000000ab03',8,'Submitted','00000000-0000-0000-0000-0000000000d6','extra order'),
 ('00000000-0000-0000-0000-00000000ac21','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01',current_date,'00000000-0000-0000-0000-00000000bf02','bar','produce','00000000-0000-0000-0000-00000000ab01',9,'Submitted','00000000-0000-0000-0000-0000000000d6',null),
 ('00000000-0000-0000-0000-00000000ac22','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01',current_date,'00000000-0000-0000-0000-00000000bf02','bar','produce','00000000-0000-0000-0000-00000000ab03',10,'Submitted','00000000-0000-0000-0000-0000000000d6',null);
set local role authenticated;
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}';
select is(shared.cafe_opening_team('00000000-0000-0000-0000-00000000bf02'::uuid),'00000000-0000-0000-0000-00000000cc02'::uuid,'AC-007: branch opening owner is kitchen stream');
select is((select count(*)::int from mos.due_process_runs() where process_name='Café Opening'),1,'AC-009: kitchen hand sees exactly one due opening for their own branch');
select ok((mos.spawn_process_run('00000000-0000-0000-0000-00000000c001'::uuid,'00000000-0000-0000-0000-00000000cc02'::uuid,current_date)->>'run_id') is not null,'AC-007: kitchen member starts opening returns a run id');
select is((select count(*)::int from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-00000000cc02'),1,'AC-007: one run exists');
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
select is((mos.spawn_process_run('00000000-0000-0000-0000-00000000c001'::uuid,'00000000-0000-0000-0000-00000000cc03'::uuid,current_date)->>'run_id')::uuid,(select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001'::uuid and period_key=to_char(current_date,'YYYY-MM-DD')),'AC-007: bar supervisor receives the canonical existing run id');
select is((select count(*)::int from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and period_key=to_char(current_date,'YYYY-MM-DD')),1,'AC-007: kitchen and bar return one run');
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member","finance"]}';
select throws_ok($$select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000cc04',current_date)$$,'42501',null,'AC-008: back-office primary is refused');
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member","finance"]}';
select is((select count(*)::int from mos.due_process_runs() where process_name='Café Opening'),0,'AC-009: finance sees no due opening in the same org');
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from mos.due_process_runs() where process_name='Café Opening'),1,'AC-009: ops lead is listed for the remaining unopened branch opening');
select ok((mos.spawn_process_run('00000000-0000-0000-0000-00000000c001'::uuid,'00000000-0000-0000-0000-00000000cc01'::uuid,current_date)->>'run_id') is not null,'AC-008: ops lead without membership starts the opening');
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
select ok(ops.is_stream_reviewer('00000000-0000-0000-0000-00000000bf02','bar'),'AC-011: secondary stream membership reviews');
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
insert into ops.kitchen_plans (org_id,log_date,wip_item_id,branch_id,activity,action,qty_porsi) values
 ('00000000-0000-0000-0000-0000000000a1',current_date,'00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-00000000bf02','bar','produce',7);
select lives_ok($$select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac20',null)$$,'AC-012: planned quantity deviation with submitter note is approved without a reviewer note');
select lives_ok($$select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac21',null)$$,'AC-012: unplanned log needs no reviewer note');
select throws_ok($$update ops.kitchen_logs set status='Rejected' where id='00000000-0000-0000-0000-00000000ac22'$$,'42501',null,'AC-012: rejection without reason is refused');
select lives_ok($$insert into ops.kitchen_plans(log_date,wip_item_id,branch_id,activity,action,qty_porsi) values(current_date,'00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-00000000bf02','bar','produce',4) on conflict do nothing$$,'AC-010: two-stream supervisor writes secondary plan');
select throws_ok($$insert into ops.kitchen_plans(log_date,wip_item_id,branch_id,activity,action,qty_porsi) values(current_date,'00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-00000000bf02','kitchen','produce',4)$$,'42501',null,'AC-010: supervisor cannot write kitchen plan');
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select ok((select count(*)::int from integrations.esb_push) > 0,'AC-013: ops lead reads outbox');
set local request.jwt.claims='{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from integrations.esb_push),0,'AC-013: member reads no outbox');
select * from finish(); rollback;
