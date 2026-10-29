begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
insert into mos.tasks (id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000004201', 'Activity task',
'00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1',
'00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 1, 'creating a task atomically creates one event');
create temp table activity_before as select last_activity_at from mos.tasks where id = '00000000-0000-0000-0000-000000004201';
insert into mos.task_events(task_id, actor_person_id, event_type, from_value, to_value, created_at)
values ('00000000-0000-0000-0000-000000004201','00000000-0000-0000-0000-0000000000d1','status_changed','Open','Done','2099-01-01');
insert into mos.task_events(task_id, actor_person_id, event_type, created_at)
values ('00000000-0000-0000-0000-000000004201','00000000-0000-0000-0000-0000000000d1','created','2000-01-01');
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 1, 'legacy event inserts cannot create facts or replay creation');
select is((select last_activity_at from mos.tasks where id = '00000000-0000-0000-0000-000000004201'), (select last_activity_at from activity_before), 'client event times cannot move activity forwards or backwards');
update mos.tasks set status = 'In Progress' where id = '00000000-0000-0000-0000-000000004201';
select results_eq($$select event_type, from_value, to_value from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201' and event_type = 'status_changed'$$, $$values ('status_changed'::text,'Open'::text,'In Progress'::text)$$, 'status history uses the actual database transition');
select ok((select bool_and(actor_person_id = '00000000-0000-0000-0000-0000000000d1' and created_at between now() and clock_timestamp()) from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 'events use the session actor and database clock');
select is((select last_activity_at from mos.tasks where id = '00000000-0000-0000-0000-000000004201'), (select max(created_at) from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 'activity equals the canonical event clock');
update mos.tasks set title = 'Renamed' where id = '00000000-0000-0000-0000-000000004201';
select results_eq($$select from_value, to_value from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201' and event_type = 'field_edited'$$, $$values ('Activity task'::text,'Renamed'::text)$$, 'field history uses persisted old and new values');
update mos.tasks set title = title where id = '00000000-0000-0000-0000-000000004201';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 3, 'a no-op update produces no activity');
update mos.tasks set consulted_person_ids = array['00000000-0000-0000-0000-0000000000d2'::uuid] where id = '00000000-0000-0000-0000-000000004201';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201' and event_type = 'raci_edited'), 1, 'RACI changes produce their expected event');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
update mos.tasks set archived_at = now() where id = '00000000-0000-0000-0000-000000004201';
update mos.tasks set archived_at = null where id = '00000000-0000-0000-0000-000000004201';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201' and event_type in ('archived','unarchived')), 2, 'archive and restore each produce their expected event');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
insert into mos.task_checklist_items(id,task_id,label,position) values ('00000000-0000-0000-0000-000000004202','00000000-0000-0000-0000-000000004201','Step',0);
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 7, 'adding a checklist item creates one event');
update mos.task_checklist_items set position=1 where id='00000000-0000-0000-0000-000000004202';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 7, 'checklist ordering is not activity');
update mos.task_checklist_items set is_done=true where id='00000000-0000-0000-0000-000000004202';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 8, 'completing a checklist item creates one event');
update mos.task_checklist_items set label='Revised step' where id='00000000-0000-0000-0000-000000004202';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 9, 'editing a checklist label creates one event');
delete from mos.task_checklist_items where id='00000000-0000-0000-0000-000000004202';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 10, 'deleting a checklist item creates one event');
update mos.tasks set body = '[{"type":"paragraph","content":[{"type":"text","text":"Body update"}]}]'::jsonb where id = '00000000-0000-0000-0000-000000004201';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 11, 'a block document save creates one event including its derived description');
select throws_ok($$update mos.tasks set last_activity_at='2099-01-01' where id='00000000-0000-0000-0000-000000004201'$$, '42501', null, 'direct activity-time updates remain refused');
select is(has_table_privilege('authenticated','mos.task_events','UPDATE'), false, 'event facts remain immutable');
select is(has_table_privilege('authenticated','mos.task_events','DELETE'), false, 'event history remains append-only');
update mos.tasks set is_private=true where id='00000000-0000-0000-0000-000000004201';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 12, 'privacy changes produce activity');
update mos.tasks set status='Done', title='Final' where id='00000000-0000-0000-0000-000000004201';
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-000000004201'), 14, 'one atomic multi-field change records each actual transition');
update mos.tasks set body = '[{"type":"paragraph","content":[{"type":"text","text":"Body update","styles":{"bold":true}}]}]'::jsonb where id='00000000-0000-0000-0000-000000004201';
select is((select count(*)::int from mos.task_events where task_id='00000000-0000-0000-0000-000000004201'),15,'a formatting-only body save creates one event');
select ok((select from_value is null and to_value is null from mos.task_events where task_id='00000000-0000-0000-0000-000000004201' order by created_at desc limit 1),'formatting activity does not copy the authored document');
select * from finish();
rollback;
