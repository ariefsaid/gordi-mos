-- #1466: atomic multi-bill payment writer, Finance access and idempotent replay.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select shared._test_seed_directory();

\set org_a '00000000-0000-0000-0000-0000000000a1'
\set org_b '00000000-0000-0000-0000-0000000000b1'
\set finance_a '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}'
\set member_a  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}'
\set finance_b '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","finance"]}'
\set proof_1 '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg'
\set proof_2 '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001602.pdf'
\set batch_1 '00000000-0000-4000-8000-000000001501'
\set batch_2 '00000000-0000-4000-8000-000000001502'
\set batch_3 '00000000-0000-4000-8000-000000001503'
\set batch_4 '00000000-0000-4000-8000-000000001504'
\set single_1 '00000000-0000-4000-8000-000000001505'

select has_function('mos', 'pay_several_pending_bills', ARRAY['text[]','date','text','uuid'],
  'the atomic multi-bill writer exists');
select is((select prosecdef from pg_proc where oid = 'mos.pay_several_pending_bills(text[],date,text,uuid)'::regprocedure),
  true, 'the batch writer is SECURITY DEFINER');
select ok(has_function_privilege('authenticated', 'mos.pay_several_pending_bills(text[],date,text,uuid)', 'EXECUTE'),
  'authenticated can invoke the writer, subject to its Finance check');
select ok(not has_function_privilege('anon', 'mos.pay_several_pending_bills(text[],date,text,uuid)', 'EXECUTE'),
  'anonymous sessions cannot invoke the writer');
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
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1466-A', current_date - 2, 1000, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1466-B', current_date - 3, 2500.50, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1466-C-GOOD', current_date - 4, 700, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1466-Z-SETTLED', current_date - 5, 50, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1466-VOID', current_date - 6, 600, 'void', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1466-MISSING', current_date - 7, 500, 'missing', now()),
  (:'org_b', 'ESB-TEST', 'BR-TEST', 'PB-1466-OTHER-ORG', current_date - 8, 300, 'present', now());
insert into storage.objects (bucket_id, name) values
  ('pending-bill-proofs', :'proof_1'),
  ('pending-bill-proofs', :'proof_2');

set local role authenticated;
select shared._test_set_access_roles(:'finance_a');

select is((select count(*)::int from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-A"]','["ESB-TEST","BR-TEST","PB-1466-B"]'],
  (now() at time zone 'Asia/Jakarta')::date, :'proof_1', :'batch_1'::uuid
) as result where not result.replayed), 2, 'Finance pays each selected bill in full in one batch');
select is((select count(*)::int from mos.pending_bill_payments where bill_no in ('PB-1466-A','PB-1466-B')),
  2, 'the successful batch appends one payment per selected bill');
select is((select sum(amount) from mos.pending_bill_payments where bill_no in ('PB-1466-A','PB-1466-B')),
  3500.50::numeric, 'the batch settles each exact balance including cents');
select is((select count(*)::int from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-A"]','["ESB-TEST","BR-TEST","PB-1466-B"]'],
  (now() at time zone 'Asia/Jakarta')::date, :'proof_1', :'batch_1'::uuid
) as result where result.replayed), 2, 'the same request key and payload replays every payment');
select is((select count(*)::int from mos.pending_bill_payments where bill_no in ('PB-1466-A','PB-1466-B')),
  2, 'idempotent replay does not append duplicate ledger entries');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-A"]','["ESB-TEST","BR-TEST","PB-1466-B"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001602.pdf',
  '00000000-0000-4000-8000-000000001501')$$,
  '23505', 'Idempotency key was used for a different multi-bill request.', 'a batch key cannot be reused with a changed proof');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-C-GOOD"]','["ESB-TEST","BR-TEST","PB-1466-C-GOOD"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg',
  '00000000-0000-4000-8000-000000001502')$$,
  '22023', 'Duplicate pending bill ids are not allowed.', 'duplicate bill ids are rejected');

select lives_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1466-Z-SETTLED',50,(now() at time zone 'Asia/Jakarta')::date,
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001602.pdf',null,
  '00000000-0000-4000-8000-000000001505',null,null)$$, 'the settled-bill atomicity fixture is paid');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-C-GOOD"]','["ESB-TEST","BR-TEST","PB-1466-Z-SETTLED"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg',
  '00000000-0000-4000-8000-000000001503')$$,
  '23514', 'Pending bill PB-1466-Z-SETTLED is already settled.', 'AC-1131: one already-settled bill rejects the whole batch');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1466-C-GOOD'),
  0, 'AC-1131: the valid companion bill receives no partial payment');
select is((select count(*)::int from mos.pending_bill_payments), 3,
  'AC-1131: failure leaves only the two successful batch rows and the fixture payment');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-VOID"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg',
  '00000000-0000-4000-8000-000000001504')$$,
  '23514', 'Pending bill PB-1466-VOID is not present in the source copy.', 'a voided source bill cannot be paid');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1466-VOID'),
  0, 'a refused void bill leaves no payment row');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-MISSING"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg',
  '00000000-0000-4000-8000-000000001506')$$,
  '23514', 'Pending bill PB-1466-MISSING is not present in the source copy.', 'a missing-source bill cannot be paid');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1466-MISSING'),
  0, 'a refused missing-source bill leaves no payment row');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-OTHER-ORG"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg',
  '00000000-0000-4000-8000-000000001507')$$,
  'P0002', 'Pending bill PB-1466-OTHER-ORG was not found in this org.', 'a Finance caller cannot pay a bill from another org');
select shared._test_set_access_roles(:'member_a');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-C-GOOD"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg',
  '00000000-0000-4000-8000-000000001508')$$,
  '42501', 'Finance access is required.', 'same-org non-Finance cannot write through the batch RPC');
reset role;
set local role anon;
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-C-GOOD"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg',
  '00000000-0000-4000-8000-000000001509')$$,
  '42501', null, 'anonymous sessions cannot invoke the batch writer');
reset role;
set local role authenticated;
select shared._test_set_access_roles(:'finance_b');
select throws_ok($$select * from mos.pay_several_pending_bills(
  ARRAY['["ESB-TEST","BR-TEST","PB-1466-A"]'],
  (now() at time zone 'Asia/Jakarta')::date, '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001601.jpg',
  '00000000-0000-4000-8000-000000001510')$$,
  'P0002', 'Pending bill PB-1466-A was not found in this org.', 'Finance in another org cannot pay the first org''s bill');

select * from finish();
rollback;
