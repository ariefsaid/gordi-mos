-- Completed approved actions retain their result across retries in the same run.
begin;
create extension if not exists pgtap with schema extensions;
select plan(70);
select shared._test_seed_directory();
insert into mos.agent_threads(id, org_id, owner_id, title) values
 ('00000000-0000-0000-0000-00000000a810','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','Completion proof');
insert into mos.agent_runs(id, thread_id, org_id, owner_id, status) values
 ('00000000-0000-0000-0000-00000000a811','00000000-0000-0000-0000-00000000a810','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','running'),
 ('00000000-0000-0000-0000-00000000a812','00000000-0000-0000-0000-00000000a810','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','running');
create function pg_temp.complete(n text, a jsonb, s integer, r uuid default '00000000-0000-0000-0000-00000000a811') returns jsonb
language sql as $$
 select mos.execute_agent_approved_write(r, gen_random_uuid(), s, gen_random_uuid()::text, 'call-'||s, n, a, 'hash-'||a::text)
$$;
create temp table results(k text, v jsonb);
grant all on results to authenticated;
create function pg_temp.reject_completion() returns trigger language plpgsql as $$
begin
 if current_setting('test.fail_completion', true) = 'on' and new.type = 'tool' and (new.payload->'input'->>'description' = 'reject-journal'
    or new.payload->'input'->>'label' = 'reject-journal') then
   raise exception using errcode = '23514', message = 'fixture journal rejection';
 end if;
 return new;
end $$;
create trigger completion_fixture before insert on mos.agent_events for each row execute function pg_temp.reject_completion();
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is(shared.current_org_id()::text,'00000000-0000-0000-0000-0000000000a1','caller org resolved');
select is((select count(*)::int from mos.agent_runs where id='00000000-0000-0000-0000-00000000a811'),1,'owned run visible to caller');
insert into results values ('create_task', pg_temp.complete('create_task','{"title": "Completion task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb,0));
select is((select count(*)::int from mos.tasks where title='Completion task'), 1, 'create_task: one business record');
select is((select payload->'result' from mos.agent_events where seq=0), (select v->'result' from results where k='create_task'), 'create_task: event contains actual business result');
select is((select payload->>'tool_call_id' from mos.agent_events where seq=0), 'call-0'::text, 'create_task: paired call retained');
select is((select tool_status from mos.agent_events where seq=0), 'completed'::text, 'create_task: completion evidence durable');
select is((select count(*)::int from mos.task_events where task_id=(select (v->'result'->>'id')::uuid from results where k='create_task') and event_type='created'), 1, 'create_task: created task activity committed');
select ok((select due_date='2026-11-02' and description='completion body' and consulted_person_ids='{}'::uuid[] and informed_person_ids='{}'::uuid[] and created_by=shared.current_person_id() from mos.tasks where id=(select (v->'result'->>'id')::uuid from results where k='create_task')), 'create_task: existing column mappings retained');
select is((select pg_temp.complete('create_task','{"title": "Completion task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb,1)->'result'), (select v->'result' from results where k='create_task'), 'create_task: later approval reuses committed result after lost response');
select is((select count(*)::int from mos.tasks where title='Completion task'), 1, 'create_task: retry adds no business record');
select is((select count(*)::int from mos.agent_events where tool_name='create_task' and tool_status='completed'), 2, 'create_task: retry appends one paired event');
select throws_ok($q$ select pg_temp.complete('create_task','{"title": "Collision create_task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb,0) $q$, '23505', null, 'create_task: sequence collision rejects transaction');
select is((select count(*)::int from mos.tasks where title='Collision create_task'), 0, 'create_task: seq collision rolled back business row');
select lives_ok($q$ select pg_temp.complete('create_task','{"title": "Collision create_task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb,2) $q$, 'create_task: new approval after collision succeeds');
select is((select count(*)::int from mos.tasks where title='Collision create_task'), 1, 'create_task: new approval executes once after rollback');
select set_config('test.fail_completion','on',true);
select throws_ok($q$ select pg_temp.complete('create_task','{"title": "Rejected task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "reject-journal"}'::jsonb,3) $q$, '23514', 'fixture journal rejection', 'create_task: journal error rejects transaction');
select is((select count(*)::int from mos.tasks where title='Rejected task'), 0, 'create_task: journal error rolled back business row');
select is((select count(*)::int from mos.task_events e join mos.tasks t on e.task_id=t.id where t.title='Rejected task'), 0, 'create_task: failed task has no activity');
select is((select count(*)::int from mos.agent_events where seq=3), 0, 'create_task: failure creates no completed evidence');
select set_config('test.fail_completion','off',true);
select lives_ok($q$ select pg_temp.complete('create_task','{"title": "Rejected task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "reject-journal"}'::jsonb,3) $q$, 'create_task: new approval after journal failure succeeds');
select is((select count(*)::int from mos.tasks where title='Rejected task'), 1, 'create_task: new approval executes exactly once after journal rollback');
select lives_ok($q$ select pg_temp.complete('create_task','{"title": "Completion task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb,0,'00000000-0000-0000-0000-00000000a812') $q$, 'create_task: same args in another run execute independently');
select is((select count(*)::int from mos.tasks where title='Completion task'), 2, 'create_task: different run owns independent business result');
insert into mos.agent_events(run_id,seq,type,tool_name,tool_args_hash,tool_status,payload) values ('00000000-0000-0000-0000-00000000a811',4,'tool','create_task','hash-'||'{"title": "Historic create_task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb::text,'completed',jsonb_build_object('name','create_task','input','{"title": "Historic create_task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb,'result',jsonb_build_object('id','historic-create_task')));
select is((select pg_temp.complete('create_task','{"title": "Historic create_task", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb,5)->'result'), '{"id":"historic-create_task"}'::jsonb, 'create_task: historic journal returns payload.result');
select is((select count(*)::int from mos.tasks where title='Historic create_task'), 0, 'create_task: historic completion is never reexecuted');
select throws_ok($q$ select pg_temp.complete('create_task','{"title": "Completion task", "businessUnitId": "00000000-0000-0000-0000-0000000000b2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "2026-11-02", "description": "completion body"}'::jsonb,6) $q$, '23514', null, 'create_task: invalid business input fails closed');
select is((select count(*)::int from mos.agent_events where seq=6), 0, 'create_task: business failure leaves no completion');
insert into results values ('post_update', pg_temp.complete('post_update','{"label": "Completion update", "progress": "blocked", "weekStart": "2026-10-26"}'::jsonb,100));
select is((select count(*)::int from mos.weekly_update_items where label='Completion update'), 1, 'post_update: one business record');
select is((select payload->'result' from mos.agent_events where seq=100), (select v->'result' from results where k='post_update'), 'post_update: event contains actual business result');
select is((select payload->>'tool_call_id' from mos.agent_events where seq=100), 'call-100'::text, 'post_update: paired call retained');
select is((select tool_status from mos.agent_events where seq=100), 'completed'::text, 'post_update: completion evidence durable');
select ok((select i.progress='blocked' and i.position=0 and u.week_start='2026-10-26' and u.person_id=shared.current_person_id() and u.status='draft' and u.summary='' from mos.weekly_update_items i join mos.weekly_updates u on u.id=i.weekly_update_id where i.id=(select (v->'result'->>'id')::uuid from results where k='post_update')), 'post_update: stored week and existing column mappings retained');
select is((select pg_temp.complete('post_update','{"label": "Completion update", "progress": "blocked", "weekStart": "2026-10-26"}'::jsonb,101)->'result'), (select v->'result' from results where k='post_update'), 'post_update: later approval reuses committed result after lost response');
select is((select count(*)::int from mos.weekly_update_items where label='Completion update'), 1, 'post_update: retry adds no business record');
select is((select count(*)::int from mos.agent_events where tool_name='post_update' and tool_status='completed'), 2, 'post_update: retry appends one paired event');
select throws_ok($q$ select pg_temp.complete('post_update','{"label": "Collision post_update", "progress": "blocked", "weekStart": "2026-10-26"}'::jsonb,100) $q$, '23505', null, 'post_update: sequence collision rejects transaction');
select is((select count(*)::int from mos.weekly_update_items where label='Collision post_update'), 0, 'post_update: seq collision rolled back business row');
select lives_ok($q$ select pg_temp.complete('post_update','{"label": "Collision post_update", "progress": "blocked", "weekStart": "2026-10-26"}'::jsonb,102) $q$, 'post_update: new approval after collision succeeds');
select is((select count(*)::int from mos.weekly_update_items where label='Collision post_update'), 1, 'post_update: new approval executes once after rollback');
select set_config('test.fail_completion','on',true);
select throws_ok($q$ select pg_temp.complete('post_update','{"label": "reject-journal", "progress": "blocked", "weekStart": "2026-11-02"}'::jsonb,103) $q$, '23514', 'fixture journal rejection', 'post_update: journal error rejects transaction');
select is((select count(*)::int from mos.weekly_update_items where label='reject-journal'), 0, 'post_update: journal error rolled back business row');
select is((select count(*)::int from mos.weekly_updates where week_start='2026-11-02'), 0, 'post_update: journal failure rolls back new draft');
select is((select count(*)::int from mos.agent_events where seq=103), 0, 'post_update: failure creates no completed evidence');
select set_config('test.fail_completion','off',true);
select lives_ok($q$ select pg_temp.complete('post_update','{"label": "reject-journal", "progress": "blocked", "weekStart": "2026-11-02"}'::jsonb,103) $q$, 'post_update: new approval after journal failure succeeds');
select is((select count(*)::int from mos.weekly_update_items where label='reject-journal'), 1, 'post_update: new approval executes exactly once after journal rollback');
select lives_ok($q$ select pg_temp.complete('post_update','{"label": "Completion update", "progress": "blocked", "weekStart": "2026-10-26"}'::jsonb,100,'00000000-0000-0000-0000-00000000a812') $q$, 'post_update: same args in another run execute independently');
select is((select count(*)::int from mos.weekly_update_items where label='Completion update'), 2, 'post_update: different run owns independent business result');
insert into mos.agent_events(run_id,seq,type,tool_name,tool_args_hash,tool_status,payload) values ('00000000-0000-0000-0000-00000000a811',104,'tool','post_update','hash-'||'{"label": "Historic post_update", "progress": "blocked", "weekStart": "2026-10-26"}'::jsonb::text,'completed',jsonb_build_object('name','post_update','input','{"label": "Historic post_update", "progress": "blocked", "weekStart": "2026-10-26"}'::jsonb,'result',jsonb_build_object('id','historic-post_update')));
select is((select pg_temp.complete('post_update','{"label": "Historic post_update", "progress": "blocked", "weekStart": "2026-10-26"}'::jsonb,105)->'result'), '{"id":"historic-post_update"}'::jsonb, 'post_update: historic journal returns payload.result');
select is((select count(*)::int from mos.weekly_update_items where label='Historic post_update'), 0, 'post_update: historic completion is never reexecuted');
select throws_ok($q$ select pg_temp.complete('post_update','{"label": "Completion update", "progress": "unknown", "weekStart": "2026-10-26"}'::jsonb,106) $q$, '22023', null, 'post_update: invalid business input fails closed');
select is((select count(*)::int from mos.agent_events where seq=106), 0, 'post_update: business failure leaves no completion');
select throws_ok($q$ select pg_temp.complete('create_task','{"title": "", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1"}',800) $q$, '22023', null, 'create_task direct validation boundary 1');
select throws_ok($q$ select pg_temp.complete('create_task','{"title": "Direct completion", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": null, "accountablePersonId": "00000000-0000-0000-0000-0000000000d1"}',801) $q$, '22023', null, 'create_task direct validation boundary 2');
select throws_ok($q$ select pg_temp.complete('create_task','{"title": "Direct completion", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "description": 14}',802) $q$, '22023', null, 'create_task direct validation boundary 3');
select throws_ok($q$ select pg_temp.complete('create_task','{"title": "Direct completion", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "dueDate": "next Monday"}',803) $q$, '22023', null, 'create_task direct validation boundary 4');
select throws_ok($q$ select pg_temp.complete('create_task','{"title": "Direct completion", "businessUnitId": "00000000-0000-0000-0000-0000000000a2", "responsiblePersonId": "00000000-0000-0000-0000-0000000000d1", "accountablePersonId": "00000000-0000-0000-0000-0000000000d1", "description": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',804) $q$, '22023', null, 'create_task direct validation boundary 5');
update mos.weekly_updates set status='submitted' where person_id=shared.current_person_id() and week_start='2026-10-26';
select throws_ok($q$ select pg_temp.complete('post_update','{"label":"Submitted parent","progress":"done","weekStart":"2026-10-26"}',805) $q$, '42501', null, 'direct completion cannot write lines to a submitted update');
select is((select count(*)::int from mos.weekly_update_items where label='Submitted parent'),0,'submitted update receives no new line');
select is((select count(*)::int from mos.agent_events where seq between 800 and 805),0,'direct invalid inputs leave no completion');
insert into mos.agent_events(run_id,seq,type,tool_name,tool_args_hash,tool_status,payload)
values ('00000000-0000-0000-0000-00000000a811',810,'tool','post_update','malformed-completion','completed',
  '{"name":"post_update","input":{"label":"Malformed prior result","progress":"done","weekStart":"2026-11-09"},"result":{"error":"unknown"}}');
select throws_ok($q$ select pg_temp.complete('post_update','{"label":"Malformed prior result","progress":"done","weekStart":"2026-11-09"}',811) $q$,'22023',null,'malformed prior completion cannot fabricate a result or execute again');
select is((select count(*)::int from mos.weekly_update_items where label='Malformed prior result'),0,'malformed completed evidence causes no business write');
select throws_ok($$ select pg_temp.complete('unsupported','{}',900) $$, '22023', null, 'unsupported actions fail closed');
select throws_ok($$ select pg_temp.complete('post_update','{"label":"Missing week","progress":"done"}',900) $$, '22023', null, 'RPC requires the stored proposal week');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["admin"]}');
select throws_ok($$ select pg_temp.complete('post_update','{"label":"Foreign owner","progress":"done","weekStart":"2026-10-26"}',900) $$, '42501', null, 'same-org admin cannot execute another owners run');
select is((select count(*)::int from mos.agent_events),0,'same-org admin cannot see owner journal');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}');
select throws_ok($$ select pg_temp.complete('post_update','{"label":"Foreign org","progress":"done","weekStart":"2026-10-26"}',900) $$, '42501', null, 'foreign-org admin cannot execute owner run');
select is((select count(*)::int from mos.agent_events),0,'foreign org cannot see owner journal');
reset role;
select ok(not (select prosecdef from pg_proc where oid='mos.execute_agent_approved_write(uuid,uuid,integer,text,text,text,jsonb,text)'::regprocedure),'transaction runs as caller');
select ok(has_function_privilege('authenticated','mos.execute_agent_approved_write(uuid,uuid,integer,text,text,text,jsonb,text)','EXECUTE') and not has_function_privilege('anon','mos.execute_agent_approved_write(uuid,uuid,integer,text,text,text,jsonb,text)','EXECUTE'), 'only authenticated callers may execute');
set local role anon;
select throws_ok($$ select mos.execute_agent_approved_write('00000000-0000-0000-0000-00000000a811', gen_random_uuid(), 900, 'anonymous','call-anon','post_update','{"label":"Anonymous","progress":"done","weekStart":"2026-10-26"}','hash') $$,'42501',null,'anonymous invocation denied');
reset role;
select * from finish();
rollback;
