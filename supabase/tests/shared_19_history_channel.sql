-- shared — change history records the channel of every change (#1006, ADR-0060 D10):
-- `app` for a direct write, `api` for a write that ran inside an api_v1 function, `agent` plus the
-- client id when the session's token carries a client_id claim. The channel is derived by the
-- history row's own trigger and is never an input; api_v1.get_record_history returns it, reading
-- only history rows the caller can already read (AC-027).
--
-- Order matters: an api_v1 write marks the WHOLE transaction as an API write, and a pgTAP file is
-- one transaction, so every "app" assertion runs before the first api_v1 write.
--
-- Personas (shared._test_seed_directory + _test_seed_access_roles): d3 (admin, may edit
-- Objectives and Projects/Processes) in org a1; b4 is a member of another org (b1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

-- ── schema posture ───────────────────────────────────────────────────────────────────────────
select has_column('shared', 'record_history', 'channel', 'a history row carries its channel');
select has_column('shared', 'record_history', 'agent_client_id', 'a history row carries the agent client id');
select col_not_null('shared', 'record_history', 'channel', 'channel is never unknown');
select col_is_null('shared', 'record_history', 'agent_client_id', 'the agent client id is null outside the agent channel');
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_trigger t
     join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'shared.record_history'::regclass and not t.tgisinternal),
  array['_record_history_stamp_channel'],
  'one trigger stamps the channel on every history row');
select is(
  (select c.relrowsecurity and not has_table_privilege('authenticated', c.oid, 'select')
                            and not has_table_privilege('anon', c.oid, 'select')
     from pg_class c where c.oid = 'api_private.channel_secret'::regclass),
  true, 'the marker secret is unreadable to application roles');

-- ── fixtures (as postgres: a service write carries no claims, so it reads as app) ────────────
insert into mos.objectives (id, org_id, name)
values ('00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-0000000000a1', 'Objective A');
insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id)
values ('00000000-0000-0000-0000-000000009b01', '00000000-0000-0000-0000-0000000000a1', 'Line B', 'project',
        '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d2');

select is(
  (select channel || '|' || coalesce(agent_client_id, '-') from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009a01' and action = 'insert'),
  'app|-', 'a service write with no claims reads as app with no client');

-- ── the app path: a direct table write by a signed-in person ─────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

update mos.objectives set name = 'App edit' where id = '00000000-0000-0000-0000-000000009a01';
select is(
  (select channel || '|' || coalesce(agent_client_id, '-') from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009a01' and field_name = 'name' and new_value = 'App edit'),
  'app|-', 'AC-027: a direct write stamps app');

-- ── spoofing: nothing a session can set changes the label ────────────────────────────────────
select set_config('api.channel', 'api', true);
update mos.objectives set name = 'Spoofed marker' where id = '00000000-0000-0000-0000-000000009a01';
select is(
  (select channel from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009a01' and field_name = 'name' and new_value = 'Spoofed marker'),
  'app', 'setting the transaction marker by hand outside an api_v1 function does not label a write api');
select is(api_private.channel(), 'app', 'the channel helper agrees: a hand-set marker reads as app');

select throws_ok(
  $$ insert into shared.record_history (org_id, schema_name, table_name, record_key, action, channel)
     values ('00000000-0000-0000-0000-0000000000a1', 'mos', 'objectives', 'x', 'insert', 'agent') $$,
  '42501', null, 'no application role can insert a history row, so no role can name a channel');

-- A history row inserted by the table owner still gets the derived channel, whatever it supplies.
reset role;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
insert into shared.record_history (id, org_id, schema_name, table_name, record_key, action, channel, agent_client_id)
values ('00000000-0000-0000-0000-000000009f01', '00000000-0000-0000-0000-0000000000a1', 'mos', 'objectives',
        '00000000-0000-0000-0000-000000009a01', 'insert', 'agent', 'agent-forged');
select is(
  (select channel || '|' || coalesce(agent_client_id, '-') from shared.record_history
    where id = '00000000-0000-0000-0000-000000009f01'),
  'app|-', 'a supplied channel or client id is ignored: the trigger overwrites both from the session');

select throws_ok(
  $$ alter table shared.record_history disable trigger user; insert into shared.record_history (org_id, schema_name, table_name, record_key, action) values ('00000000-0000-0000-0000-0000000000a1', 'mos', 'objectives', 'y', 'insert') $$,
  '23502', null, 'a row inserted with the trigger disabled has no default channel, so it is refused, never guessed');

-- ── the api path: a write inside an api_v1 function ─────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

select api_v1.edit_project_process(
  id => '00000000-0000-0000-0000-000000009b01', changes => '{"name":"Via API"}');
select is(
  (select channel || '|' || coalesce(agent_client_id, '-') from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009b01' and field_name = 'name' and new_value = 'Via API'),
  'api|-', 'AC-027: a write through an api_v1 function stamps api');
select is(api_private.channel(), 'api', 'the channel helper reports api after an API write opened the transaction');

select is(
  (select actor_person_id::text from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009b01' and field_name = 'name' and new_value = 'Via API'),
  '00000000-0000-0000-0000-0000000000d3', 'the api row still names the acting person');

-- ── the agent path: the token carries client_id ─────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"],"client_id":"agent-x"}';
select api_v1.edit_project_process(
  id => '00000000-0000-0000-0000-000000009b01', changes => '{"name":"Via agent"}');
select is(
  (select channel || '|' || coalesce(agent_client_id, '-') from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009b01' and field_name = 'name' and new_value = 'Via agent'),
  'agent|agent-x', 'AC-027: an api_v1 write with a client_id claim stamps agent and the client id');

update mos.objectives set name = 'Agent direct' where id = '00000000-0000-0000-0000-000000009a01';
select is(
  (select channel || '|' || coalesce(agent_client_id, '-') from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009a01' and field_name = 'name' and new_value = 'Agent direct'),
  'agent|agent-x', 'a client_id claim wins over the marker: a direct write with an agent token is still agent');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"],"client_id":""}';
update mos.objectives set name = 'Blank client' where id = '00000000-0000-0000-0000-000000009a01';
select is(
  (select channel || '|' || coalesce(agent_client_id, '-') from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009a01' and field_name = 'name' and new_value = 'Blank client'),
  'api|-', 'a blank client_id claim is no client: the row reads by the marker alone');

-- ── channel is never an input to an operation ───────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok(
  $$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-000000009b01', changes => '{"channel":"app"}') $$,
  'PT400', null, 'an edit carrying channel is invalid_input');
select is(
  (select count(*)::int from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009b01' and channel = 'app' and action = 'update'),
  0, 'and no history row was written for it');

-- ── get_record_history ──────────────────────────────────────────────────────────────────────
select is(
  (select array_agg((i ->> 'channel') || '|' || coalesce(i ->> 'agent_client_id', '-') || '|' || (i ->> 'action') order by i ->> 'channel')
     from jsonb_array_elements(api_v1.get_record_history(
            record_type => 'project_process', id => '00000000-0000-0000-0000-000000009b01') -> 'items') i),
  array['agent|agent-x|update', 'api|-|update', 'app|-|insert'],
  'get_record_history returns each row''s channel and agent client id');
select is(
  (select bool_and(i ->> 'actor_person_id' is not null and i ->> 'actor_name' is not null)
     from jsonb_array_elements(api_v1.get_record_history(
            record_type => 'project_process', id => '00000000-0000-0000-0000-000000009b01') -> 'items') i
    where i ->> 'action' = 'update'),
  true, 'get_record_history names the acting person and their name');
select is(
  (select (i ->> 'field') || '|' || (i ->> 'old_value') || '|' || (i ->> 'new_value')
     from jsonb_array_elements(api_v1.get_record_history(
            record_type => 'project_process', id => '00000000-0000-0000-0000-000000009b01') -> 'items') i
    where i ->> 'channel' = 'agent'),
  'name|Via API|Via agent', 'get_record_history returns field, old value and new value');
select is(
  jsonb_array_length(api_v1.get_record_history(record_type => 'project_process', id => '00000000-0000-0000-0000-000000009b01', "limit" => 2) -> 'items'),
  2, 'limit caps the page');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
insert into ctx values ('p1', api_v1.get_record_history(record_type => 'project_process', id => '00000000-0000-0000-0000-000000009b01', "limit" => 2)::text);
insert into ctx values ('p2', api_v1.get_record_history(record_type => 'project_process', id => '00000000-0000-0000-0000-000000009b01',
  cursor => (select v::jsonb ->> 'next_cursor' from ctx where k = 'p1'), "limit" => 2)::text);
select is(
  (select jsonb_array_length(v::jsonb -> 'items') || '|' || coalesce(v::jsonb ->> 'next_cursor', '-') from ctx where k = 'p2'),
  '1|-', 'the cursor continues to the last row and ends there');
select is(
  (select count(distinct e ->> 'id')::int
     from jsonb_array_elements((select v::jsonb -> 'items' from ctx where k = 'p1')
                               || (select v::jsonb -> 'items' from ctx where k = 'p2')) e),
  3, 'paging returns every row exactly once');

select is(
  api_v1.get_record_history(record_type => 'task', id => '00000000-0000-0000-0000-0000000000f1'),
  '{"items": [], "next_cursor": null}'::jsonb, 'a record type whose history is not yet recorded returns no items');
select throws_ok(
  $$ select api_v1.get_record_history(record_type => 'thing', id => '00000000-0000-0000-0000-000000009b01') $$,
  'PT400', null, 'an unknown record_type is invalid_input');
select throws_ok(
  $$ select api_v1.get_record_history(record_type => 'objective', id => null) $$,
  'PT400', null, 'a missing id is invalid_input');
select throws_ok(
  $$ select api_v1.get_record_history(record_type => 'objective', id => '00000000-0000-0000-0000-000000009a01', cursor => 'zz') $$,
  'PT400', null, 'a bad cursor is invalid_input');
select throws_ok(
  $$ select api_v1.get_record_history(record_type => 'objective', id => '00000000-0000-0000-0000-000000009a01', "limit" => 0) $$,
  'PT400', null, 'a limit below 1 is invalid_input');

-- ── readers see the channel only on rows they can already read ──────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  api_v1.get_record_history(record_type => 'project_process', id => '00000000-0000-0000-0000-000000009b01'),
  '{"items": [], "next_cursor": null}'::jsonb, 'a person in another org reads no history rows, so sees no channel');
select is(
  (select count(*)::int from shared.record_history),
  0, 'and the table itself shows them nothing');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select count(*)::int from shared.record_history
    where record_key = '00000000-0000-0000-0000-000000009b01' and channel in ('api', 'agent')),
  2, 'a colleague in the same org reads the channel on the rows the source record already shows them');

reset role;
select is(
  (select count(*)::int from shared.record_history where channel = 'agent' and agent_client_id is null),
  0, 'no agent row lacks its client id (pairing constraint)');

select * from finish();
rollback;
