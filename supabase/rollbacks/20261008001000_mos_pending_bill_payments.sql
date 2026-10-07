-- Rollback for 20261008001000_mos_pending_bill_payments.sql (#1465).
-- The ledger is settlement history: this refuses while any payment entry or proof object exists.
-- Archive them first. The empty private bucket row stays (storage refuses direct deletes of buckets).
begin;
do $$
begin
  if exists (select 1 from mos.pending_bill_payments) then
    raise exception 'pending bill payments exist: archive the ledger before rolling back';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'pending-bill-proofs') then
    raise exception 'pending bill proofs exist: archive them before rolling back';
  end if;
end;
$$;
drop policy if exists pending_bill_proofs_insert on storage.objects;
drop policy if exists pending_bill_proofs_select on storage.objects;
drop function if exists mos.record_pending_bill_payment(text, text, text, numeric, date, text, text, uuid, uuid, text);
drop table if exists mos.pending_bill_payments;
drop function if exists mos._pending_bill_payment_immutable();
commit;
