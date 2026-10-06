-- Client error sink: a signed-in member may submit bounded summaries only through the RPC;
-- only an admin in the same org can read them, and the per-person hourly cap drops silently.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

select has_table('shared', 'client_errors', 'client error table exists');
select ok((select relrowsecurity from pg_class where oid = 'shared.client_errors'::regclass),
  'client error table enforces row-level security');
select has_function('shared', 'report_client_error', array['text', 'text', 'text', 'text', 'text'],
  'client error RPC exists');
select is((select prosecdef from pg_proc where oid = 'shared.report_client_error(text,text,text,text,text)'::regprocedure),
  true, 'client error RPC is SECURITY DEFINER');
select ok((select proconfig from pg_proc where oid = 'shared.report_client_error(text,text,text,text,text)'::regprocedure)
  @> array['search_path=""'], 'client error RPC pins an empty search_path');
select ok(has_function_privilege('authenticated', 'shared.report_client_error(text,text,text,text,text)', 'execute'),
  'authenticated callers can submit client errors through the RPC');
select ok(not has_function_privilege('anon', 'shared.report_client_error(text,text,text,text,text)', 'execute'),
  'anonymous callers cannot submit client errors');
select ok(not has_function_privilege('service_role', 'shared.report_client_error(text,text,text,text,text)', 'execute'),
  'service role has no ambient RPC execution grant');
select ok(has_table_privilege('authenticated', 'shared.client_errors', 'select'),
  'authenticated role can query the table subject to its admin-only read policy');
select ok(not has_table_privilege('authenticated', 'shared.client_errors', 'insert'),
  'authenticated role cannot insert directly into the table');
select ok(not has_table_privilege('anon', 'shared.client_errors', 'select'),
  'anonymous role cannot read client errors');
select ok(not has_table_privilege('service_role', 'shared.client_errors', 'select'),
  'service role has no table read grant');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');

select throws_ok($$ insert into shared.client_errors
  (org_id, person_id, message, stack, route, release_sha, user_agent)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1',
          'forged', '', '/tasks', 'sha', 'agent') $$,
  '42501', null, 'a member cannot bypass the RPC with a direct insert');
select lives_ok($$ select shared.report_client_error(
  'Failure at https://mos.example/tasks?token=not-stored on /tasks?route-token=not-stored password=not-stored Bearer secret-token',
  'at https://mos.example/call?token=stack-secret password=stack-secret Bearer stack-bearer' || repeat('s', 9000),
  '/tasks?secret=not-stored#fragment', repeat('a', 90), repeat('u', 600)) $$,
  'a signed-in member submits a client error');
select is((select count(*)::integer from shared.client_errors), 0,
  'ordinary members cannot read submitted client errors');

reset role;
select is((select count(*)::integer from shared.client_errors), 1,
  'the RPC recorded one report');
select is((select route from shared.client_errors limit 1), '/tasks',
  'the stored route excludes its query string and fragment');
select is((select message from shared.client_errors limit 1),
  'Failure at https://mos.example/tasks on /tasks password=[redacted] Bearer [redacted]',
  'the RPC removes URL queries and redacts credential-shaped message text');
select ok((select position('?token=' in message) = 0 and position('stack-secret' in stack) = 0
                 and position('stack-bearer' in stack) = 0
                 and char_length(message) <= 1000 and char_length(stack) <= 8000
                 and char_length(release_sha) <= 64 and char_length(user_agent) <= 500
            from shared.client_errors limit 1),
  'the RPC caps message, stack, release SHA, and user-agent lengths');
select is((select org_id from shared.client_errors limit 1),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'the RPC stamps the caller org');
select is((select person_id from shared.client_errors limit 1),
  '00000000-0000-0000-0000-0000000000d1'::uuid, 'the RPC stamps the caller person');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select is((select count(*)::integer from shared.client_errors), 1,
  'an admin can read reports from their own org');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}');
select is((select count(*)::integer from shared.client_errors), 0,
  'an admin in another org cannot read the reports');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select lives_ok($$ do $rate$
begin
  for i in 1..30 loop
    perform shared.report_client_error('rate limited', '', '/tasks', 'sha', 'agent');
  end loop;
end
$rate$ $$, 'submissions beyond the hourly cap are silently dropped');

reset role;
select is((select count(*)::integer from shared.client_errors), 30,
  'no more than 30 reports per person are stored in an hour');

set local role anon;
select throws_ok($$ select shared.report_client_error('anon', '', '/', '', '') $$,
  '42501', null, 'anonymous callers are refused by the RPC grant');
select throws_ok($$ select * from shared.client_errors $$,
  '42501', null, 'anonymous callers cannot read the table');

select * from finish();
rollback;
