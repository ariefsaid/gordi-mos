-- OD-WAY-76: grouped approval session contracts. The worker owns the ERP call; pgTAP owns
-- the database grain, dedup identity, RLS seam, and posting fan-out columns.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select ops._test_seed_cafe();
select ok((select relrowsecurity from pg_class where oid='integrations.esb_push_groups'::regclass),
  'approval groups have RLS enabled');
select ok((select relforcerowsecurity from pg_class where oid='integrations.esb_push_groups'::regclass),
  'approval groups force RLS');
select ok(exists(select 1 from pg_policies where schemaname='integrations' and tablename='esb_push_groups'
  and policyname='esb_push_groups_select_ops_lead_or_admin'), 'approval group reads are policy-scoped');
select ok(exists(select 1 from information_schema.columns where table_schema='integrations'
  and table_name='esb_push_groups' and column_name='org_id'), 'approval groups carry org_id');
select ok(exists(select 1 from information_schema.columns where table_schema='ops'
  and table_name='kitchen_logs' and column_name='push_group_id'), 'logs point at their approval group');
select ok(exists(select 1 from information_schema.columns where table_schema='integrations'
  and table_name='esb_push' and column_name='push_group_id'), 'outbox rows point at their approval group');
select ok(exists(select 1 from pg_constraint where conrelid='integrations.esb_push_groups'::regclass
  and contype='u' and conname='esb_push_groups_dedup_key_key'),
  'a group has its own unique dedup identity');

select lives_ok($$insert into integrations.esb_push_groups(org_id,target_env,dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','dry_run','kitchen-group|test-group|dry_run')$$,
  'an unposted group can be enqueued');
select throws_ok($$insert into integrations.esb_push_groups(org_id,target_env,dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','dry_run','kitchen-group|test-group|dry_run')$$,
  '23505', null, 'the group dedup identity rejects a duplicate session in one environment');
select ok(exists(select 1 from pg_proc where proname='approve_kitchen_logs'
  and pg_get_function_identity_arguments(oid)='p_log_ids uuid[], p_review_note text'),
  'bulk approval RPC mints the grouping seam');
select ok((select d.description like '%whole-document failure%'
  from pg_proc p join pg_description d on d.objoid=p.oid
  where p.proname='approve_kitchen_logs' limit 1),
  'the RPC documents whole-document partial failure policy');

-- Behavioural seam: this one call must execute the RPC, not merely inspect its catalog shape.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id, wip_item_id, qty_porsi)
values
 ('00000000-0000-0000-0000-00000000e701','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',2),
 ('00000000-0000-0000-0000-00000000e702','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',3),
 ('00000000-0000-0000-0000-00000000e703','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',1),
 ('00000000-0000-0000-0000-00000000e704','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',1);
update ops.kitchen_logs set destination_branch_id='00000000-0000-0000-0000-00000000bf03' where id='00000000-0000-0000-0000-00000000e703';
-- Round-4 review: lives_ok discards the return, so the batch_ids half of the contract had no
-- assertion that could fail. Capture the call's actual row instead and pin BOTH halves.
create temporary table _bulk_result on commit drop as
  select * from ops.approve_kitchen_logs(array['00000000-0000-0000-0000-00000000e701'::uuid,'00000000-0000-0000-0000-00000000e702'::uuid], null);
select is((select count(*)::int from _bulk_result), 1,
  'the bulk RPC executes successfully and returns exactly one row');
select is((select array_length(batch_ids, 1) from _bulk_result), 2,
  'the returned batch_ids carry one minted reference per approved log');
select is((select count(*)::int from _bulk_result, unnest(batch_ids) b where b is null or b = ''), 0,
  'no returned batch reference is null or empty');
select is((select count(*)::int from ops.kitchen_logs where push_group_id is not null and id in ('00000000-0000-0000-0000-00000000e701','00000000-0000-0000-0000-00000000e702')), 2,
  'the group id is the inserted row id and is fanned to every member');
select throws_ok($$select ops.approve_kitchen_logs(array['00000000-0000-0000-0000-00000000e701'::uuid,'00000000-0000-0000-0000-00000000e702'::uuid], null)$$, 'P0003', null,
  'Submitted eligibility rejects a second approval');
select throws_ok($$select ops.approve_kitchen_logs(array['00000000-0000-0000-0000-00000000e703'::uuid,'00000000-0000-0000-0000-00000000e704'::uuid], null)$$, '22023', null,
  'endpoint/date homogeneity refuses a mixed document');
insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id, wip_item_id, qty_porsi)
values
 ('00000000-0000-0000-0000-00000000e708','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',1),
 ('00000000-0000-0000-0000-00000000e709','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-00000000ab01',1);
select throws_ok($$select ops.approve_kitchen_logs(array['00000000-0000-0000-0000-00000000e708'::uuid,'00000000-0000-0000-0000-00000000e709'::uuid], null)$$, '22023', null,
  'two cross-branch transfers refuse mixed destinations');
insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id, wip_item_id, qty_porsi)
values ('00000000-0000-0000-0000-00000000e705','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab01',1);
select throws_ok($$select ops.approve_kitchen_logs(array['00000000-0000-0000-0000-00000000e705'::uuid], null)$$, '22023', null,
  'noop-only approval does not leave a pending group');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$select ops.approve_kitchen_logs(array['00000000-0000-0000-0000-00000000e703'::uuid], null)$$, '42501', null,
  'bulk approval refuses a viewer without the approval role');
reset role;
select * from finish();
rollback;
