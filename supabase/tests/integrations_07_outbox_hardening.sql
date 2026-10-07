-- Outbox dispatch lifecycle and tenant-scoped enqueue behaviour.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

insert into integrations.esb_push (id, org_id, source_ref, endpoint, target_env, dedup_key)
values
  ('00000000-0000-0000-0000-00000000e801','00000000-0000-0000-0000-0000000000a1','DEDUP-SHARED','assembly-actual','dry_run','same-key'),
  ('00000000-0000-0000-0000-00000000e802','00000000-0000-0000-0000-0000000000b1','DEDUP-SHARED','assembly-actual','dry_run','same-key')
on conflict (org_id, dedup_key) do nothing;
insert into integrations.esb_push (org_id, source_ref, endpoint, target_env, dedup_key)
values ('00000000-0000-0000-0000-0000000000a1','DEDUP-SHARED','assembly-actual','dry_run','same-key')
on conflict (org_id, dedup_key) do nothing;
select is((select count(*)::int from integrations.esb_push where dedup_key = 'same-key'), 2,
  'one dedup identity may be enqueued once in each org');
select is((select count(*)::int from integrations.esb_push where org_id = '00000000-0000-0000-0000-0000000000a1' and dedup_key = 'same-key'), 1,
  'repeating a dedup identity within an org leaves one row');
select ok((select bool_and(is_nullable = 'YES') from information_schema.columns
            where table_schema = 'integrations' and table_name = 'esb_push'
              and column_name in ('next_attempt_at','locked_at')),
  'retry time and lease time are nullable outbox fields');
select ok(to_regprocedure('integrations.claim_esb_pushes(uuid[])') is not null,
  'the row-claim entry point is installed');
select ok(to_regprocedure('integrations.reap_esb_pushes()') is not null,
  'the lease and retry reaper is installed');
select ok(to_regprocedure('integrations.prune_esb_pushes()') is not null,
  'the sent-row retention entry point is installed');
select ok(not has_function_privilege('authenticated','integrations.claim_esb_pushes(uuid[])','EXECUTE')
      and not has_function_privilege('authenticated','integrations.reap_esb_pushes()','EXECUTE')
      and not has_function_privilege('authenticated','integrations.prune_esb_pushes()','EXECUTE')
      and has_function_privilege('service_role','integrations.claim_esb_pushes(uuid[])','EXECUTE')
      and has_function_privilege('service_role','integrations.reap_esb_pushes()','EXECUTE')
      and has_function_privilege('service_role','integrations.prune_esb_pushes()','EXECUTE'),
  'queue maintenance entry points are executable by the worker role only');

insert into integrations.esb_push (id, org_id, source_ref, endpoint, target_env, dedup_key)
values
  ('00000000-0000-0000-0000-00000000e811','00000000-0000-0000-0000-0000000000a1','LIFECYCLE-A','assembly-actual','dry_run','lifecycle-a'),
  ('00000000-0000-0000-0000-00000000e812','00000000-0000-0000-0000-0000000000a1','LIFECYCLE-B','assembly-actual','dry_run','lifecycle-b'),
  ('00000000-0000-0000-0000-00000000e813','00000000-0000-0000-0000-0000000000a1','LIFECYCLE-C','assembly-actual','dry_run','lifecycle-c'),
  ('00000000-0000-0000-0000-00000000e814','00000000-0000-0000-0000-0000000000a1','RETENTION-A','assembly-actual','dry_run','retention-a');

set local role service_role;
select throws_ok($$update integrations.esb_push set status = 'in_flight'
  where id = '00000000-0000-0000-0000-00000000e811'$$,
  '42501', null, 'a direct status patch cannot claim a pending row');
select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000e811'::uuid])), 1,
  'the claim entry point returns the row it claimed');
select ok((select status = 'in_flight' and locked_at is not null and next_attempt_at is null
             from integrations.esb_push where id = '00000000-0000-0000-0000-00000000e811'),
  'a claim records its lease and clears retry scheduling');
select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000e811'::uuid])), 0,
  'a second claim does not return an in-flight row');
select is((select count(*)::int from integrations.claim_esb_pushes(array[
    '00000000-0000-0000-0000-00000000e811'::uuid,'00000000-0000-0000-0000-00000000e812'::uuid])), 0,
  'a multi-row claim is all-or-none when one requested row is unavailable');
select is((select status from integrations.esb_push where id = '00000000-0000-0000-0000-00000000e812'), 'pending',
  'an incomplete multi-row claim leaves the available row pending');
select lives_ok($$update integrations.esb_push
  set status = 'failed', retry_count = 1, last_error = 'temporary failure'
  where id = '00000000-0000-0000-0000-00000000e811'$$,
  'an in-flight row can record a retryable failure');
select ok((select next_attempt_at > clock_timestamp() and locked_at is null
             from integrations.esb_push where id = '00000000-0000-0000-0000-00000000e811'),
  'a failed attempt records a future retry time and clears its lease');
select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000e811'::uuid])), 0,
  'a failed row is not claimable before retry promotion');
select is(integrations.reap_esb_pushes(), 0,
  'the reaper leaves a failure whose retry time has not arrived');
select throws_ok($$update integrations.esb_push set status = 'pending'
  where id = '00000000-0000-0000-0000-00000000e811'$$,
  '42501', null, 'a direct update cannot promote a failed row');
select lives_ok($$update integrations.esb_push
  set next_attempt_at = clock_timestamp() - interval '1 second'
  where id = '00000000-0000-0000-0000-00000000e811'$$,
  'the retry time can become due');
select is(integrations.reap_esb_pushes(), 1,
  'the reaper promotes one due failure');
select ok((select status = 'pending' and next_attempt_at is null and locked_at is null
             from integrations.esb_push where id = '00000000-0000-0000-0000-00000000e811'),
  'retry promotion returns the row to the pending queue');
select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000e811'::uuid])), 1,
  'a promoted retry can be claimed');
select lives_ok($$update integrations.esb_push
  set status = 'posted', esb_doc_num = 'DOC-1', posted_at = clock_timestamp()
  where id = '00000000-0000-0000-0000-00000000e811'$$,
  'an in-flight row can record a completed post');
select ok((select status = 'posted' and locked_at is null and next_attempt_at is null
             from integrations.esb_push where id = '00000000-0000-0000-0000-00000000e811'),
  'a completed post clears retry and lease metadata');
select throws_ok($$update integrations.esb_push set status = 'failed'
  where id = '00000000-0000-0000-0000-00000000e811'$$,
  '42501', null, 'a posted row is terminal');

select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000e812'::uuid])), 1,
  'a separate pending row can be claimed');
select throws_ok($$update integrations.esb_push set status = 'pending'
  where id = '00000000-0000-0000-0000-00000000e812'$$,
  '42501', null, 'a direct update cannot release an active lease');
select lives_ok($$update integrations.esb_push
  set locked_at = clock_timestamp() - interval '11 minutes'
  where id = '00000000-0000-0000-0000-00000000e812'$$,
  'the lease age can be advanced for the reaper check');
select is(integrations.reap_esb_pushes(), 1,
  'the reaper releases one expired lease');
select ok((select status = 'pending' and retry_count = 1 and locked_at is null
                  and next_attempt_at > clock_timestamp()
             from integrations.esb_push where id = '00000000-0000-0000-0000-00000000e812'),
  'lease recovery records an additional attempt and a retry delay');
select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000e812'::uuid])), 0,
  'a recovered lease observes its retry delay');

select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000e813'::uuid])), 1,
  'a third pending row can be claimed');
select lives_ok($$update integrations.esb_push set status = 'dead_letter', last_error = 'permanent failure'
  where id = '00000000-0000-0000-0000-00000000e813'$$,
  'an in-flight row can be closed as dead-lettered');
select throws_ok($$update integrations.esb_push set status = 'pending'
  where id = '00000000-0000-0000-0000-00000000e813'$$,
  '42501', null, 'a dead-lettered row is terminal');

select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000e814'::uuid])), 1,
  'the retention fixture can be claimed');
select lives_ok($$update integrations.esb_push
  set status = 'posted', esb_doc_num = 'DOC-OLD', posted_at = clock_timestamp() - interval '31 days'
  where id = '00000000-0000-0000-0000-00000000e814'$$,
  'the retention fixture can be closed with an old sent time');
select is(integrations.prune_esb_pushes(), 1,
  'retention removes a sent row beyond its age limit');
select is((select count(*)::int from integrations.esb_push where id = '00000000-0000-0000-0000-00000000e814'), 0,
  'the pruned row is absent');
select is((select count(*)::int from integrations.esb_push where id = '00000000-0000-0000-0000-00000000e812'), 1,
  'retention leaves a pending row in place');

reset role;
select * from finish();
rollback;
