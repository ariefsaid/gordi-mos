-- Rollback for 20261008004400_mos_pending_bill_finance_label.sql (#1467).
-- Finance labels are authored reconciliation data. Export/remove them before rolling back.
begin;
do $$
begin
  if exists (select 1 from mos.pending_bill_finance_labels) then
    raise exception 'pending bill Finance labels exist: export them before rolling back';
  end if;
end;
$$;
drop function if exists mos.set_pending_bill_finance_label(text, text, text, text);
drop table if exists mos.pending_bill_finance_labels;
commit;
