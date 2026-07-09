-- AC-500..506, 515..519 (FR-500/503/504/513/514): follow-up RLS — lane isolation, finance-sees-all,
-- member-sees-none, cross-org isolation, no direct writes, recon surfaces + reporting RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_follow_ups();

-- AC-500: RLS enabled+forced on both tables + reporting.esb_ar_reduction.
select has_table('mos','follow_ups','AC-500: mos.follow_ups exists');
select is((select coalesce(relrowsecurity, false) from pg_class where oid='mos.follow_ups'::regclass),
          true, 'AC-500: RLS enabled on mos.follow_ups');
select is((select coalesce(relforcerowsecurity, false) from pg_class where oid='mos.follow_ups'::regclass),
          true, 'AC-500: RLS forced on mos.follow_ups');

-- AC-501: b2b_sales chaser sees ONLY b2b_sales-lane rows (retail_ops hidden).
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d10","access_roles":[]}';
select is((select count(*)::int from mos.follow_ups where lane='b2b_sales'),
          1, 'AC-501: b2b_sales chaser sees the 1 b2b_ar row');
select is((select count(*)::int from mos.follow_ups where lane='retail_ops'),
          0, 'AC-501: b2b_sales chaser sees ZERO retail_ops rows (lane isolation)');

-- AC-502: retail_ops chaser sees ONLY retail_ops-lane rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d11","access_roles":[]}';
select is((select count(*)::int from mos.follow_ups where lane='retail_ops'),
          1, 'AC-502: retail_ops chaser sees the 1 retail_pending row');
select is((select count(*)::int from mos.follow_ups where lane='b2b_sales'),
          0, 'AC-502: retail_ops chaser sees ZERO b2b_sales rows (lane isolation)');

-- AC-503: finance user (Author ...0d01, seeded member+finance, NO chase-lane role) sees ALL same-org rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from mos.follow_ups),
          2, 'AC-503: finance user sees both same-org rows (recon authority)');

-- AC-505: an org-A admin (GrandMgr ...0d03) sees ZERO org-B (foreign) rows (cross-org isolation).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from mos.follow_ups where counterparty='Foreign Co'),
          0, 'AC-505: org-A admin sees ZERO org-B follow-ups (cross-org isolation)');

-- AC-504: a plain member with no finance + no chase lane sees ZERO rows.
--   (Peer ...0d04 holds Staff R in Unit-1 — no coded BU, no finance/admin → no lane, no finance.)
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.follow_ups),
          0, 'AC-504: plain member sees ZERO follow-ups');

-- AC-516: a direct INSERT by an authenticated non-admin is denied (no write policy).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d10","access_roles":[]}';
select throws_ok($$
  insert into mos.follow_ups (org_id, counterparty, kind, lane, original_amount, running_balance)
  values ('00000000-0000-0000-0000-0000000000a1','Sneak','b2b_ar','b2b_sales', 100, 100)
$$, '42501', null, 'AC-516: direct INSERT denied (RPC is the only write path)');

-- AC-519: a non-finance member reads ZERO reporting.esb_ar_reduction rows (finance/admin RLS).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d10","access_roles":[]}';
select is((select count(*)::int from reporting.esb_ar_reduction),
          0, 'AC-519: non-finance member sees ZERO reporting.esb_ar_reduction rows');

reset role;
select * from finish();
rollback;
