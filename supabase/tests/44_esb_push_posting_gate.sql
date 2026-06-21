begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

-- enqueue one row as service_role (the RPC's path) before switching to authenticated.
insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, target_env, dedup_key)
values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260620-001','assembly-actual','goo','kitchen|PR-20260620-001|goo');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select is((select count(*)::int from integrations.esb_push where org_id='00000000-0000-0000-0000-0000000000a1'), 1,
  'AC-007: ops_lead reads the org push row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from integrations.esb_push), 0, 'AC-007: member reads 0 push rows');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select throws_ok($$
  update integrations.esb_push set status='posted', esb_doc_num='X1' where dedup_key='kitchen|PR-20260620-001|goo'
$$, '42501', null, 'AC-007: app tier cannot write posting state (worker/service only)');

reset role;
select * from finish();
rollback;
