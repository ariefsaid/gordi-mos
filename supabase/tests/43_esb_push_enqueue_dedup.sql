begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

-- As service_role (the enqueue path the RPC uses), insert two rows with the same
-- (source_module, source_ref, target_env) → second throws (unique dedup_key). AC-008.
select lives_ok($$
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, target_env, dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260620-001','assembly-actual','goo','kitchen|PR-20260620-001|goo')
$$, 'AC-008: first enqueue ok');
select throws_ok($$
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, target_env, dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260620-001','assembly-actual','goo','kitchen|PR-20260620-001|goo')
$$, '23505', null, 'AC-008: duplicate (same module/ref/env) rejected by dedup_key');

select * from finish();
rollback;
