-- #1465 T2: single-bill payment ledger, atomic writer, Finance-only proof and append-only reversals.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

select shared._test_seed_directory();

\set org_a '00000000-0000-0000-0000-0000000000a1'
\set org_b '00000000-0000-0000-0000-0000000000b1'
\set finance_a '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}'
\set member_a  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}'
\set admin_a   '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}'
\set finance_b '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","finance"]}'
\set proof_1 '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg'
\set proof_2 '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001002.pdf'
\set idem_1 '00000000-0000-4000-8000-000000001101'
\set idem_2 '00000000-0000-4000-8000-000000001102'
\set idem_3 '00000000-0000-4000-8000-000000001103'
\set idem_4 '00000000-0000-4000-8000-000000001104'
\set idem_5 '00000000-0000-4000-8000-000000001105'
\set idem_6 '00000000-0000-4000-8000-000000001106'
\set idem_7 '00000000-0000-4000-8000-000000001107'
\set idem_8 '00000000-0000-4000-8000-000000001108'

-- The ledger grants one read path and no direct end-user writes; there is exactly one RPC.
select has_table('mos', 'pending_bill_payments', 'the append-only pending bill ledger exists');
select has_function('mos', 'record_pending_bill_payment', ARRAY['text','text','text','numeric','date','text','text','uuid','uuid','text'],
  'the one payment and reversal writer exists');
select is((select prosecdef from pg_proc where oid = 'mos.record_pending_bill_payment(text,text,text,numeric,date,text,text,uuid,uuid,text)'::regprocedure),
  true, 'the writer is SECURITY DEFINER');
select ok(has_table_privilege('authenticated','mos.pending_bill_payments','SELECT'), 'authenticated can request a ledger read, subject to Finance RLS');
select ok(not has_table_privilege('authenticated','mos.pending_bill_payments','INSERT'), 'no authenticated direct INSERT privilege');
select ok(not has_table_privilege('authenticated','mos.pending_bill_payments','UPDATE'), 'no authenticated direct UPDATE privilege');
select ok(not has_table_privilege('authenticated','mos.pending_bill_payments','DELETE'), 'no authenticated direct DELETE privilege');
select ok(not has_table_privilege('anon','mos.pending_bill_payments','SELECT'), 'anonymous sessions cannot read the ledger');
select is((select public from storage.buckets where id = 'pending-bill-proofs'), false, 'proof bucket is private');
select is((select file_size_limit from storage.buckets where id = 'pending-bill-proofs'), 307200::bigint, 'proof bucket caps each file at 300 KiB');
select is((select allowed_mime_types from storage.buckets where id = 'pending-bill-proofs'),
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[], 'proof bucket accepts images and PDF only');
select ok(has_table_privilege('authenticated','storage.objects','SELECT'), 'storage reads are policy-gated, not public');

-- Invented bills and private-object metadata; the test transaction rolls every fixture back.
insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, amount, source_state, snapshot_as_of)
values
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1465-A', current_date - 2, 1000, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1465-VOID', current_date - 3, 500, 'present', now()),
  (:'org_a', 'ESB-TEST', 'BR-TEST', 'PB-1465-CENTS', current_date - 4, 12345.50, 'present', now());
insert into storage.objects (bucket_id, name) values
  ('pending-bill-proofs', :'proof_1'),
  ('pending-bill-proofs', :'proof_2');

set local role authenticated;
select shared._test_set_access_roles(:'finance_a');

select is((select replayed from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',500,(now() at time zone 'Asia/Jakarta')::date,:'proof_1','first half',:'idem_1'::uuid,null,null)),
  false, 'Finance records a payment through the atomic RPC');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1465-A'),
  1, 'a successful call appends one ledger entry');
select is((select replayed from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',500,(now() at time zone 'Asia/Jakarta')::date,:'proof_1','first half',:'idem_1'::uuid,null,null)),
  true, 'AC-1132: the same idempotency key and payload replays the existing payment');
select is((select payment_id from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',500,(now() at time zone 'Asia/Jakarta')::date,:'proof_1','first half',:'idem_1'::uuid,null,null)),
  (select id from mos.pending_bill_payments where idempotency_key = :'idem_1'::uuid), 'a retry returns the original payment id');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',400,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg','changed',
  '00000000-0000-4000-8000-000000001101',null,null)$$,
  '23505', 'Idempotency key was used for a different request.', 'reusing a key with a changed payload is refused');

-- AC-1130: all malformed/over-balance inputs are refused before any new row is committed.
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',501,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg',null,
  '00000000-0000-4000-8000-000000001102',null,null)$$,
  '23514', 'Amount exceeds the remaining bill balance.', 'AC-1130: amount above remaining balance is refused');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',0,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg',null,
  '00000000-0000-4000-8000-000000001103',null,null)$$,
  '23514', 'Amount must be above zero.', 'AC-1130: non-positive amount is refused');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',1,null,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg',null,
  '00000000-0000-4000-8000-000000001104',null,null)$$,
  '23514', 'Cash-in date is required.', 'AC-1130: missing cash-in date is refused');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',1.5,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg',null,
  '00000000-0000-4000-8000-000000001109',null,null)$$,
  '23514', 'Amount must use whole rupiah unless it settles the bill.', 'fractional rupiah is refused rather than rounded');

-- A bill whose total carries cents can still be settled: whole rupiah first, then the exact remainder.
select lives_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-CENTS',12345,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001002.pdf',null,
  '00000000-0000-4000-8000-000000001201',null,null)$$,
  'a whole-rupiah part payment on a bill with cents is accepted');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-CENTS',0.25,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001002.pdf',null,
  '00000000-0000-4000-8000-000000001202',null,null)$$,
  '23514', 'Amount must use whole rupiah unless it settles the bill.', 'a fraction that does not settle the bill is refused');
select lives_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-CENTS',0.50,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001002.pdf',null,
  '00000000-0000-4000-8000-000000001203',null,null)$$,
  'the exact remaining cents settle the bill');
select is((select sum(amount) from mos.pending_bill_payments where bill_no = 'PB-1465-CENTS'), 12345.50::numeric,
  'the ledger holds the full bill including cents');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',1,(now() at time zone 'Asia/Jakarta')::date + 1,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg',null,
  '00000000-0000-4000-8000-000000001105',null,null)$$,
  '23514', 'Cash-in date cannot be in the future.', 'AC-1130: future cash-in date is refused');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',1,(now() at time zone 'Asia/Jakarta')::date,null,null,
  '00000000-0000-4000-8000-000000001106',null,null)$$,
  '23514', 'Payment proof is required.', 'AC-1130: missing proof path is refused');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',1,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001099.jpg',null,
  '00000000-0000-4000-8000-000000001107',null,null)$$,
  '23514', 'Payment proof file was not uploaded.', 'an absent storage object cannot be recorded as proof');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1465-A'),
  1, 'all refused payment inputs leave the original single ledger row unchanged');
select shared._test_set_access_roles(:'member_a');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',1,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg',null,
  '00000000-0000-4000-8000-000000001108',null,null)$$,
  '42501', 'Finance access is required.', 'a same-org non-Finance member cannot write through the RPC');

-- Strict Finance-only ledger AND proof access (admin is not implicitly Finance).
select is((select count(*)::int from mos.pending_bill_payments), 0, 'a same-org member reads no payment entries');
select is((select count(*)::int from storage.objects where bucket_id = 'pending-bill-proofs'), 0, 'AC-1112: a same-org member reads no proof objects');
select throws_ok($$insert into storage.objects (bucket_id,name) values
  ('pending-bill-proofs','00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001003.jpg')$$,
  '42501', null, 'a non-Finance member cannot upload a proof object');
select shared._test_set_access_roles(:'admin_a');
select is((select count(*)::int from mos.pending_bill_payments), 0, 'a same-org admin reads no payment entries without Finance');
select is((select count(*)::int from storage.objects where bucket_id = 'pending-bill-proofs'), 0, 'AC-1112: an admin without Finance reads no proof objects');
select shared._test_set_access_roles(:'finance_a');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1465-A'), 1, 'Finance in the bill org reads its ledger entry');
select is((select count(*)::int from storage.objects where bucket_id = 'pending-bill-proofs'), 2, 'Finance in the bill org reads private proof objects');
select throws_ok($$insert into mos.pending_bill_payments
  (org_id,esb_code,branch_code,bill_no,entry_kind,amount,cash_in_date,proof_path,idempotency_key,created_by)
  values ('00000000-0000-0000-0000-0000000000a1','ESB-TEST','BR-TEST','PB-1465-A','payment',1,current_date,
    '00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001001.jpg',
    '00000000-0000-4000-8000-000000001199','00000000-0000-0000-0000-0000000000d1')$$,
  '42501', null, 'AC-1111: even Finance has no direct ledger INSERT path');

-- AC-1133: SQL updates/deletes also hit the immutable trigger; corrections append a negative row.
reset role;
select throws_ok($$update mos.pending_bill_payments set note = 'edited' where idempotency_key = '00000000-0000-4000-8000-000000001101'$$,
  '42501', 'Pending bill payment entries are append-only.', 'AC-1133: an existing ledger entry cannot be updated');
select throws_ok($$delete from mos.pending_bill_payments where idempotency_key = '00000000-0000-4000-8000-000000001101'$$,
  '42501', 'Pending bill payment entries are append-only.', 'AC-1133: an existing ledger entry cannot be deleted');
set local role authenticated;
select shared._test_set_access_roles(:'finance_a');
select is((select replayed from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',null,null,null,null,'00000000-0000-4000-8000-000000001120',
  (select id from mos.pending_bill_payments where idempotency_key = :'idem_1'::uuid),'duplicate cash receipt')), false,
  'Finance reverses by appending a reasoned entry');
select is((select sum(amount) from mos.pending_bill_payments where bill_no = 'PB-1465-A'), 0::numeric,
  'AC-1133: the reversal restores the full remaining balance');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1465-A'), 2,
  'the record history retains both the original payment and its reversal');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-A',null,null,null,null,'00000000-0000-4000-8000-000000001121',
  (select id from mos.pending_bill_payments where idempotency_key = '00000000-0000-4000-8000-000000001101'),'second reversal')$$,
  '23505', 'This payment has already been reversed.', 'a payment cannot be reversed twice');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1465-A'), 2,
  'a refused second reversal leaves history unchanged');

-- A bill may later be voided by the reporting copy; recorded MOS money and its history stay put.
select is((select replayed from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-VOID',200,(now() at time zone 'Asia/Jakarta')::date,:'proof_2',null,:'idem_2'::uuid,null,null)),
  false, 'Finance records payment while the copied bill is present');
reset role;
update reporting.pending_bills set source_state = 'void', source_state_at = now()
 where org_id = :'org_a'::uuid and bill_no = 'PB-1465-VOID';
set local role authenticated;
select shared._test_set_access_roles(:'finance_a');
select is((select count(*)::int from mos.pending_bill_payments where bill_no = 'PB-1465-VOID'), 1,
  'AC-1136: a later ESB void mark does not delete MOS payment history');
select is((select source_state from reporting.pending_bills where bill_no = 'PB-1465-VOID'), 'void',
  'AC-1136: the record retains the bill''s void mark');
select throws_ok($$select * from mos.record_pending_bill_payment(
  'ESB-TEST','BR-TEST','PB-1465-VOID',1,(now() at time zone 'Asia/Jakarta')::date,'00000000-0000-0000-0000-0000000000a1/00000000-0000-4000-8000-000000001002.pdf',null,
  '00000000-0000-4000-8000-000000001130',null,null)$$,
  '23514', 'Only a present pending bill can receive a payment.', 'a voided bill cannot receive a new payment');
select shared._test_set_access_roles(:'finance_b');
select is((select count(*)::int from mos.pending_bill_payments), 0, 'Finance in another org reads no ledger entries');
select is((select count(*)::int from storage.objects where bucket_id = 'pending-bill-proofs'), 0, 'Finance in another org reads no proof objects');

select * from finish();
rollback;
