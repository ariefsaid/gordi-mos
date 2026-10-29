begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
select shared._test_seed_directory();
set local role service_role;
select ok(shared.reserve_assistant_usage('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 100) is not null, 'first call reserves a slot');
select ok(shared.reserve_assistant_usage('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 100) is not null, 'second call reserves a slot');
select is(shared.reserve_assistant_usage('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 100), null::uuid, 'person concurrency ceiling denies the third');
reset role;
update shared.assistant_usage set created_at = clock_timestamp() - interval '3 minutes';
set local role service_role;
select ok(shared.reserve_assistant_usage('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 100) is not null, 'expired active slots recover');
select is(shared.reserve_assistant_usage('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2', 100000000), null::uuid, 'oversized budget reservation is denied');
select is(shared.reserve_assistant_usage(null, '00000000-0000-0000-0000-0000000000d2', 100), null::uuid, 'missing identity is denied');
reset role;
update shared.assistant_usage set finished_at = clock_timestamp();
insert into shared.assistant_usage (org_id, person_id, units, finished_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 999700, clock_timestamp());
set local role service_role;
select is(shared.reserve_assistant_usage('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 1), null::uuid, 'person daily budget remains spent');
reset role;
insert into shared.assistant_usage (org_id, person_id, units, finished_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 19000000, clock_timestamp());
set local role service_role;
select is(shared.reserve_assistant_usage('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2', 1), null::uuid, 'organization daily budget applies across people');
reset role;
insert into shared.assistant_usage (org_id, person_id, units, created_at, finished_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 1, clock_timestamp() - interval '3 days', clock_timestamp());
set local role service_role;
select shared.reserve_assistant_usage('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2', 1);
reset role;
select is((select count(*) from shared.assistant_usage where created_at < clock_timestamp() - interval '2 days'), 0::bigint, 'old usage is removed');
select ok(not has_function_privilege('authenticated', 'shared.reserve_assistant_usage(uuid,uuid,integer)', 'execute'), 'authenticated clients cannot reserve on behalf of others');
select ok(not has_table_privilege('authenticated', 'shared.assistant_usage', 'select'), 'usage ledger is private');
select * from finish();
rollback;
