-- Pending approvals are private to their person and can be consumed once before expiry.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select shared._test_seed_directory();

insert into shared.agent_pending_actions (id, org_id, person_id, action_name, args, tool_call_id, created_at, expires_at)
values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1',
   'create_task', '{"title":"Stored title"}', 'call-stored', pg_catalog.now(), pg_catalog.now() + interval '5 minutes'),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1',
   'post_update', '{"label":"Expired"}', 'call-expired', pg_catalog.now() - interval '2 minutes', pg_catalog.now() - interval '1 minute');

select throws_ok($$
  insert into shared.agent_pending_actions (id, org_id, person_id, action_name, args, tool_call_id, expires_at)
  values ('00000000-0000-0000-0000-00000000a104', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000d1', 'create_task', '{"title":"Long lived"}', 'call-long', pg_catalog.now() + interval '6 minutes')
$$, '23514', null, 'the database bounds pending-action lifetime');

select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_catalog.pg_class where oid = 'shared.agent_pending_actions'::regclass),
  'pending actions enforce row-level security');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';

select is((select count(*)::int from shared.agent_pending_actions), 2,
  'the owner can read their own pending actions');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select is((select count(*)::int from shared.agent_pending_actions), 0,
  'another person in the same org cannot read the owner''s pending actions');
select is((select count(*)::int from shared.consume_agent_pending_action('00000000-0000-0000-0000-00000000a101')), 0,
  'another person cannot consume the owner''s action');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4"}';
select is((select count(*)::int from shared.agent_pending_actions), 0,
  'another org cannot read pending actions');
select is((select count(*)::int from shared.consume_agent_pending_action('00000000-0000-0000-0000-00000000a101')), 0,
  'another org cannot consume a pending action');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select throws_ok($$
  insert into shared.agent_pending_actions (id, org_id, person_id, action_name, args, tool_call_id, expires_at)
  values ('00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000d1', 'create_task', '{"title":"Direct"}', 'call-direct', pg_catalog.now() + interval '5 minutes')
$$, '42501', null, 'authenticated callers cannot create pending actions directly');
select throws_ok($$
  update shared.agent_pending_actions set consumed_at = pg_catalog.now()
   where id = '00000000-0000-0000-0000-00000000a101'
$$, '42501', null, 'authenticated callers cannot bypass atomic consumption');
select throws_ok($$
  delete from shared.agent_pending_actions where id = '00000000-0000-0000-0000-00000000a101'
$$, '42501', null, 'authenticated callers cannot delete pending actions');

select is((select count(*)::int from shared.consume_agent_pending_action('00000000-0000-0000-0000-00000000a102')), 0,
  'an expired action cannot be consumed');
select results_eq($$
  select action_name, args, tool_call_id
    from shared.consume_agent_pending_action('00000000-0000-0000-0000-00000000a101')
$$, $$values ('create_task'::text, '{"title":"Stored title"}'::jsonb, 'call-stored'::text)$$,
  'consumption returns the server-stored action and arguments');
select is((select count(*)::int from shared.consume_agent_pending_action('00000000-0000-0000-0000-00000000a101')), 0,
  'the same pending action cannot be consumed twice');

reset role;
select ok(
  has_table_privilege('authenticated', 'shared.agent_pending_actions', 'SELECT')
  and not has_table_privilege('authenticated', 'shared.agent_pending_actions', 'INSERT')
  and not has_table_privilege('authenticated', 'shared.agent_pending_actions', 'UPDATE')
  and not has_table_privilege('authenticated', 'shared.agent_pending_actions', 'DELETE')
  and not has_table_privilege('anon', 'shared.agent_pending_actions', 'SELECT')
  and has_table_privilege('service_role', 'shared.agent_pending_actions', 'INSERT')
  and not has_table_privilege('service_role', 'shared.agent_pending_actions', 'UPDATE')
  and has_function_privilege('authenticated', 'shared.consume_agent_pending_action(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'shared.consume_agent_pending_action(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'shared.consume_agent_pending_action(uuid)', 'EXECUTE'),
  'only authenticated callers can read and consume through the restricted interface');

select * from finish();
rollback;
