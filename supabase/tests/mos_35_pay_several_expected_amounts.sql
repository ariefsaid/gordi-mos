-- Finance multi-bill payments use the cents confirmed for each selected bill.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select shared._test_seed_directory();

\set org_a '00000000-0000-0000-0000-0000000000a1'
\set org_b '00000000-0000-0000-0000-0000000000b1'
\set finance_a '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}'
\set member_a  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}'
\set finance_b '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","finance"]}'
\set proof_1 '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg'
\set proof_2 '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001702.pdf'
\set batch_1 '00000000-0000-4000-8000-000000001701'
\set batch_2 '00000000-0000-4000-8000-000000001702'
\set batch_3 '00000000-0000-4000-8000-000000001703'
\set batch_4 '00000000-0000-4000-8000-000000001704'
\set single_1 '00000000-0000-4000-8000-000000001705'

select has_function('mos', 'pay_several_pending_bills', ARRAY['text[]','bigint[]','date','text','uuid'],
  'the amount-bound atomic multi-bill writer exists');
select hasnt_function('mos', 'pay_several_pending_bills', ARRAY['text[]','date','text','uuid'],
  'the unchecked writer signature is absent');
select is((select prosecdef from pg_proc where oid = 'mos.pay_several_pending_bills(text[],bigint[],date,text,uuid)'::regprocedure),
  true, 'the batch writer is SECURITY DEFINER');
select ok(coalesce((
  select bool_or(config.setting in ('search_path=', 'search_path=""'))
    from pg_catalog.pg_proc proc
    cross join lateral pg_catalog.unnest(proc.proconfig) as config(setting)
   where proc.oid = 'mos.pay_several_pending_bills(text[],bigint[],date,text,uuid)'::regprocedure
), false), 'the batch writer pins an empty search_path');
select ok(has_function_privilege('authenticated', 'mos.pay_several_pending_bills(text[],bigint[],date,text,uuid)', 'EXECUTE'),
  'authenticated can invoke the writer, subject to its Finance check');
select ok(not has_function_privilege('anon', 'mos.pay_several_pending_bills(text[],bigint[],date,text,uuid)', 'EXECUTE'),
  'anonymous sessions cannot invoke the writer');
select ok(not has_function_privilege('public', 'mos.pay_several_pending_bills(text[],bigint[],date,text,uuid)', 'EXECUTE'),
  'PUBLIC cannot invoke the writer');
select is((select relrowsecurity from pg_class where oid = 'mos.pending_bill_payment_batches'::regclass),
  true, 'the batch idempotency table has row-level security enabled');
select is((select relforcerowsecurity from pg_class where oid = 'mos.pending_bill_payment_batches'::regclass),
  true, 'the batch idempotency table forces row-level security');
select ok(not has_table_privilege('authenticated', 'mos.pending_bill_payment_batches', 'SELECT'),
  'authenticated cannot read batch request records directly');
select ok(not has_table_privilege('authenticated', 'mos.pending_bill_payment_batches', 'INSERT'),
  'authenticated cannot insert batch request records directly');
select ok(not has_table_privilege('authenticated', 'mos.pending_bill_payment_batches', 'UPDATE'),
  'authenticated cannot edit batch request records directly');
select ok(not has_table_privilege('authenticated', 'mos.pending_bill_payment_batches', 'DELETE'),
  'authenticated cannot delete batch request records directly');

insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, source_state, snapshot_as_of)
values
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1470-A', current_date - 2, 1000.01, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1470-B', current_date - 3, 500, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1470-CHANGED', current_date - 4, 800, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1470-COMPANION', current_date - 5, 300, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1470-PARTIAL', current_date - 6, 1000, 'present', now()),
  (:'org_b', 'ESB-TEST', 'BR-TEST', 'PB-1470-OTHER-ORG', current_date - 7, 300, 'present', now());
insert into storage.objects (bucket_id, name) values
  ('pending-bill-proofs', :'proof_1'),
  ('pending-bill-proofs', :'proof_2');

set local role authenticated;
select shared._test_set_access_roles(:'finance_a');

select is((select count(*)::int from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-A"]','["ESB-TEST","BR-TEST","PB-1470-B"]'],
  ARRAY[100001,50000]::bigint[], (now() at time zone 'Asia/Jakarta')::date, :'proof_1', :'batch_1'::uuid
) as result where not result.replayed), 2, 'matching confirmed cents pay each selected bill in full');
select is((select sum(amount) from mos.pending_bill_payments where bill_no in ('PB-1470-A','PB-1470-B')),
  1500.01::numeric, 'the batch records the exact cents confirmed for both bills');
select is((select count(*)::int from mos.pending_bill_payments where bill_no in ('PB-1470-A','PB-1470-B')),
  2, 'the successful batch appends one payment per bill');
select is((select count(*)::int from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-A"]','["ESB-TEST","BR-TEST","PB-1470-B"]'],
  ARRAY[100001,50000]::bigint[], (now() at time zone 'Asia/Jakarta')::date, :'proof_1', :'batch_1'::uuid
) as result where result.replayed), 2, 'the same key and confirmed cents replay every payment');
select is((select count(*)::int from mos.pending_bill_payments where bill_no in ('PB-1470-A','PB-1470-B')),
  2, 'replaying the same request adds no ledger rows');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-A"]','["ESB-TEST","BR-TEST","PB-1470-B"]'],
  ARRAY[100002,50000]::bigint[], (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001701')$$,
  '23505', 'Idempotency key was used for a different multi-bill request.',
  'a replay key cannot be reused with a changed confirmed amount');

-- The confirmed balance was 800.00; the copied source total changes by one cent before submit.
reset role;
update reporting.pending_bills set amount = 800.01
 where org_id = :'org_a' and bill_no = 'PB-1470-CHANGED';
set local role authenticated;
select shared._test_set_access_roles(:'finance_a');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-CHANGED"]','["ESB-TEST","BR-TEST","PB-1470-COMPANION"]'],
  ARRAY[80000,30000]::bigint[], (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001702')$$,
  'P0001', 'Pending bill balances changed since confirmation. Review and try again.',
  'a one-cent source-total change refuses the full batch');
select is((select count(*)::int from mos.pending_bill_payments where bill_no in ('PB-1470-CHANGED','PB-1470-COMPANION')),
  0, 'a changed total leaves no ledger rows for either bill');

select lives_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1470-PARTIAL',100,(now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001702.pdf',null,
  '00000000-0000-4000-8000-000000001705',null,null)$$, 'the other Finance payment updates the remaining balance');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-PARTIAL"]','["ESB-TEST","BR-TEST","PB-1470-COMPANION"]'],
  ARRAY[100000,30000]::bigint[], (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001703')$$,
  'P0001', 'Pending bill balances changed since confirmation. Review and try again.',
  'a partial payment after confirmation refuses the full batch');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1470-COMPANION'),
  0, 'a concurrent partial payment leaves no batch payment for the companion bill');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1470-PARTIAL'),
  1, 'the only ledger entry is the independently recorded partial payment');

select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-A"]','["ESB-TEST","BR-TEST","PB-1470-B"]'],
  ARRAY[100001]::bigint[], (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001704')$$,
  '22023', 'Expected amounts must match the selected pending bills.', 'an amount-count mismatch is rejected');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-A"]','["ESB-TEST","BR-TEST","PB-1470-B"]'],
  ARRAY[100001,NULL]::bigint[], (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001704')$$,
  '22023', 'Every confirmed amount must be positive cents.', 'a null expected amount is rejected');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-A"]'], ARRAY[0]::bigint[],
  (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001704')$$,
  '22023', 'Every confirmed amount must be positive cents.', 'a non-positive expected amount is rejected');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-A"]','["ESB-TEST","BR-TEST","PB-1470-A"]'],
  ARRAY[100001,100001]::bigint[], (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001704')$$,
  '22023', 'Duplicate pending bill ids are not allowed.', 'duplicate bill ids are rejected');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-OTHER-ORG"]'], ARRAY[30000]::bigint[],
  (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001704')$$,
  'P0002', 'Pending bill PB-1470-OTHER-ORG was not found in this org.', 'Finance cannot pay a bill from another org');

select shared._test_set_access_roles(:'member_a');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-COMPANION"]'], ARRAY[30000]::bigint[],
  (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001704')$$,
  '42501', 'Finance access is required.', 'same-org non-Finance cannot invoke the writer');
reset role;
set local role anon;
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-COMPANION"]'], ARRAY[30000]::bigint[],
  (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001704')$$,
  '42501', null, 'anonymous sessions cannot invoke the writer');
reset role;
set local role authenticated;
select shared._test_set_access_roles(:'finance_b');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1470-A"]'], ARRAY[100001]::bigint[],
  (now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001701.jpg',
  '00000000-0000-4000-8000-000000001704')$$,
  'P0002', 'Pending bill PB-1470-A was not found in this org.', 'Finance in another org cannot pay the first org''s bill');

select * from finish();
rollback;
