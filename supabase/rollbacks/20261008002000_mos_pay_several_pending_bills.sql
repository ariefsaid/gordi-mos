-- Guarded rollback for 20261008002000_mos_pay_several_pending_bills.sql (#1466).
begin;
do $$
begin
  if exists (select 1 from mos.pending_bill_payment_batches) then
    raise exception 'multi-bill payment batches exist: archive the batch request records before rolling back';
  end if;
end;
$$;
drop function if exists mos.pay_several_pending_bills(text[], date, text, uuid);
drop table if exists mos.pending_bill_payment_batches;
commit;
