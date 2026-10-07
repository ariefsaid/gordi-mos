-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- mos: record a payment against one pending bill (#1465, T2).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MOS is the settlement record. This migration does not call or write to the ERP.
-- One append-only ledger entry per payment, plus one negative reversal entry when corrected. The
-- sole end-user write path is record_pending_bill_payment(): its row lock, remaining-balance check,
-- idempotency fence, and INSERT all share one transaction. Bill balances and states are derived by
-- the application from this ledger; the nightly reporting copy remains read-only to end users.
--
-- Proofs are private objects in pending-bill-proofs. The bucket and SELECT/INSERT policies are
-- Finance-only and scoped to the current org; there is intentionally no public URL or delete path.
--
-- A payment is whole rupiah and at least 1, except that a payment equal to the exact remaining balance
-- (which may carry cents) is accepted, so a bill with cents can be settled. A bill whose recorded
-- payments exceed a later, lower ESB total is shown as overpaid by the application.
--
-- Rollback: supabase/rollbacks/20261007009600_mos_pending_bill_payments.sql (guarded).
--
-- DOWN (after taking any required private evidence archive):
--   drop policy pending_bill_proofs_insert on storage.objects;
--   drop policy pending_bill_proofs_select on storage.objects;
--   delete from storage.objects where bucket_id = 'pending-bill-proofs';
--   delete from storage.buckets where id = 'pending-bill-proofs';
--   drop function mos.record_pending_bill_payment(text,text,text,numeric,date,text,text,uuid,uuid,text);
--   drop table mos.pending_bill_payments; -- drops its append-only trigger
--   drop function mos._pending_bill_payment_immutable();
--
-- NOTE: deleting proof objects is destructive; the bucket rows above are a manual DOWN guide and
-- must only be run after an explicit archive/retention decision.

begin;

create table mos.pending_bill_payments (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id),
  esb_code         text not null check (pg_catalog.btrim(esb_code) <> ''),
  branch_code      text not null check (pg_catalog.btrim(branch_code) <> ''),
  bill_no          text not null check (pg_catalog.btrim(bill_no) <> ''),
  entry_kind       text not null check (entry_kind in ('payment', 'reversal')),
  amount           numeric(14,2) not null,
  cash_in_date     date not null,
  proof_path       text,
  note             text,
  reversal_of      uuid,
  reversal_reason  text,
  idempotency_key  uuid not null,
  created_by       uuid not null references shared.people(id),
  created_at       timestamptz not null default pg_catalog.now(),
  unique (org_id, id),
  unique (org_id, idempotency_key),
  foreign key (org_id, esb_code, branch_code, bill_no)
    references reporting.pending_bills (org_id, esb_code, branch_code, bill_no),
  foreign key (org_id, reversal_of)
    references mos.pending_bill_payments (org_id, id),
  check (
    (entry_kind = 'payment' and amount > 0 and proof_path is not null
      and reversal_of is null and reversal_reason is null)
    or
    (entry_kind = 'reversal' and amount < 0 and proof_path is null
      and reversal_of is not null and pg_catalog.btrim(coalesce(reversal_reason, '')) <> '')
  ),
  check (note is null or pg_catalog.char_length(note) <= 500),
  check (reversal_reason is null or pg_catalog.char_length(reversal_reason) <= 500)
);

comment on table mos.pending_bill_payments is
  'Append-only MOS settlement ledger for reporting.pending_bills (#1465). A positive payment records '
  'cash received and its private proof; a negative reversal points to exactly one original payment. '
  'Balance/state are derived from signed entries. Finance-only reads; the SECURITY DEFINER '
  'record_pending_bill_payment() function is the sole end-user write path. Nothing is sent to the ERP.';
comment on column mos.pending_bill_payments.amount is
  'Positive on payment, negative on reversal; sum per bill is the amount recorded as received.';
comment on column mos.pending_bill_payments.cash_in_date is
  'Date the cash landed (payment) or the reversal was recorded (reversal), in the Finance workflow.';
comment on column mos.pending_bill_payments.proof_path is
  'Private pending-bill-proofs object path. Required on payment, absent on reversal.';
comment on column mos.pending_bill_payments.idempotency_key is
  'Client-generated request identity, unique per org; a retry with the same payload returns the original row.';

create index pending_bill_payments_bill_history_idx
  on mos.pending_bill_payments (org_id, esb_code, branch_code, bill_no, created_at, id);
create unique index pending_bill_payments_one_reversal_idx
  on mos.pending_bill_payments (org_id, reversal_of) where reversal_of is not null;

create function mos._pending_bill_payment_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Pending bill payment entries are append-only.';
end;
$$;
comment on function mos._pending_bill_payment_immutable() is
  'Rejects UPDATE and DELETE on the payment ledger, including privileged SQL paths; corrections are new reversal entries.';
revoke execute on function mos._pending_bill_payment_immutable() from public, anon, authenticated;

create trigger pending_bill_payments_append_only
  before update or delete on mos.pending_bill_payments
  for each row execute function mos._pending_bill_payment_immutable();

revoke all on mos.pending_bill_payments from public, anon, authenticated;
grant select on mos.pending_bill_payments to authenticated;
alter table mos.pending_bill_payments enable row level security;
alter table mos.pending_bill_payments force row level security;

create policy pending_bill_payments_select_finance on mos.pending_bill_payments
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.has_access_role('finance')));
comment on policy pending_bill_payments_select_finance on mos.pending_bill_payments is
  'Strict Finance-only read, same org. Admin, manager, supervisor and member do not inherit access.';

create or replace function mos.record_pending_bill_payment(
  p_esb_code text,
  p_branch_code text,
  p_bill_no text,
  p_amount numeric,
  p_cash_in_date date,
  p_proof_path text,
  p_note text,
  p_idempotency_key uuid,
  p_reverse_payment_id uuid default null,
  p_reversal_reason text default null
)
returns table(payment_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_actor_id uuid := shared.current_person_id();
  v_bill reporting.pending_bills%rowtype;
  v_original mos.pending_bill_payments%rowtype;
  v_existing mos.pending_bill_payments%rowtype;
  v_payment_id uuid;
  v_paid numeric(14,2);
  v_balance numeric(14,2);
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_reason text := nullif(pg_catalog.btrim(p_reversal_reason), '');
  v_today date := (pg_catalog.now() at time zone 'Asia/Jakarta')::date;
begin
  if v_org_id is null or v_actor_id is null or not shared.has_access_role('finance') then
    raise exception using errcode = '42501', message = 'Finance access is required.';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'Idempotency key is required.';
  end if;
  if not exists (select 1 from shared.people p where p.id = v_actor_id and p.org_id = v_org_id) then
    raise exception using errcode = '42501', message = 'Finance identity is not in the current org.';
  end if;

  -- Serialize retries even if the first transaction has not committed its unique-key row yet.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org_id::text || ':' || p_idempotency_key::text, 0));

  select p.* into v_existing
    from mos.pending_bill_payments p
   where p.org_id = v_org_id and p.idempotency_key = p_idempotency_key;
  if found then
    if p_reverse_payment_id is null
       and v_existing.entry_kind = 'payment'
       and v_existing.esb_code = p_esb_code
       and v_existing.branch_code = p_branch_code
       and v_existing.bill_no = p_bill_no
       and v_existing.amount = p_amount
       and v_existing.cash_in_date = p_cash_in_date
       and v_existing.proof_path = p_proof_path
       and v_existing.note is not distinct from v_note then
      return query select v_existing.id, true;
      return;
    elsif p_reverse_payment_id is not null
       and v_existing.entry_kind = 'reversal'
       and v_existing.reversal_of = p_reverse_payment_id
       and v_existing.reversal_reason is not distinct from v_reason then
      return query select v_existing.id, true;
      return;
    end if;
    raise exception using errcode = '23505', message = 'Idempotency key was used for a different request.';
  end if;

  if p_reverse_payment_id is null then
    if p_esb_code is null or pg_catalog.btrim(p_esb_code) = ''
       or p_branch_code is null or pg_catalog.btrim(p_branch_code) = ''
       or p_bill_no is null or pg_catalog.btrim(p_bill_no) = '' then
      raise exception using errcode = '22023', message = 'Bill identity is required.';
    end if;
    if p_amount is null or p_amount <= 0 then
      raise exception using errcode = '23514', message = 'Amount must be at least 1.';
    end if;
    if p_amount <> pg_catalog.round(p_amount, 2) then
      raise exception using errcode = '23514', message = 'Amount cannot carry more than two decimals.';
    end if;
    if p_cash_in_date is null then
      raise exception using errcode = '23514', message = 'Cash-in date is required.';
    end if;
    if p_cash_in_date > v_today then
      raise exception using errcode = '23514', message = 'Cash-in date cannot be in the future.';
    end if;
    if pg_catalog.char_length(coalesce(v_note, '')) > 500 then
      raise exception using errcode = '23514', message = 'Note must be 500 characters or fewer.';
    end if;
    if p_proof_path is null or pg_catalog.btrim(p_proof_path) = '' then
      raise exception using errcode = '23514', message = 'Payment proof is required.';
    end if;
    if p_proof_path !~ ('^' || v_org_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp|pdf)$') then
      raise exception using errcode = '23514', message = 'Payment proof path is invalid.';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'pending-bill-proofs' and o.name = p_proof_path
    ) then
      raise exception using errcode = '23514', message = 'Payment proof file was not uploaded.';
    end if;

    select b.* into v_bill
      from reporting.pending_bills b
     where b.org_id = v_org_id
       and b.esb_code = p_esb_code
       and b.branch_code = p_branch_code
       and b.bill_no = p_bill_no
       for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Pending bill was not found.';
    end if;
    if v_bill.source_state <> 'present' then
      raise exception using errcode = '23514', message = 'Only a present pending bill can receive a payment.';
    end if;

    select coalesce(pg_catalog.sum(p.amount), 0)::numeric(14,2) into v_paid
      from mos.pending_bill_payments p
     where p.org_id = v_org_id
       and p.esb_code = p_esb_code
       and p.branch_code = p_branch_code
       and p.bill_no = p_bill_no;
    v_balance := v_bill.amount - v_paid;
    if v_balance <= 0 or p_amount > v_balance then
      raise exception using errcode = '23514', message = 'Amount exceeds the remaining bill balance.';
    end if;
    -- The copy keeps ESB totals to the cent: a payment is whole rupiah unless it settles the bill exactly.
    if (p_amount < 1 or p_amount <> pg_catalog.trunc(p_amount)) and p_amount <> v_balance then
      raise exception using errcode = '23514', message = 'Amount must use whole rupiah unless it settles the bill.';
    end if;

    insert into mos.pending_bill_payments (
      org_id, esb_code, branch_code, bill_no, entry_kind, amount,
      cash_in_date, proof_path, note, idempotency_key, created_by
    ) values (
      v_org_id, p_esb_code, p_branch_code, p_bill_no, 'payment', p_amount,
      p_cash_in_date, p_proof_path, v_note, p_idempotency_key, v_actor_id
    ) returning id into v_payment_id;
  else
    if v_reason is null then
      raise exception using errcode = '23514', message = 'A reversal reason is required.';
    end if;
    if pg_catalog.char_length(v_reason) > 500 then
      raise exception using errcode = '23514', message = 'Reversal reason must be 500 characters or fewer.';
    end if;

    select p.* into v_original
      from mos.pending_bill_payments p
     where p.org_id = v_org_id and p.id = p_reverse_payment_id
       and p.entry_kind = 'payment'
       for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Original payment was not found.';
    end if;
    select b.* into v_bill
      from reporting.pending_bills b
     where b.org_id = v_org_id
       and b.esb_code = v_original.esb_code
       and b.branch_code = v_original.branch_code
       and b.bill_no = v_original.bill_no
       for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Pending bill was not found.';
    end if;
    if exists (
      select 1 from mos.pending_bill_payments p
       where p.org_id = v_org_id and p.reversal_of = v_original.id
    ) then
      raise exception using errcode = '23505', message = 'This payment has already been reversed.';
    end if;

    insert into mos.pending_bill_payments (
      org_id, esb_code, branch_code, bill_no, entry_kind, amount,
      cash_in_date, proof_path, note, reversal_of, reversal_reason, idempotency_key, created_by
    ) values (
      v_org_id, v_original.esb_code, v_original.branch_code, v_original.bill_no,
      'reversal', -v_original.amount, v_today, null, null, v_original.id, v_reason,
      p_idempotency_key, v_actor_id
    ) returning id into v_payment_id;
  end if;

  return query select v_payment_id, false;
end;
$$;
comment on function mos.record_pending_bill_payment(text,text,text,numeric,date,text,text,uuid,uuid,text) is
  'Atomic Finance-only write path for MOS pending-bill payments and reversals. Locks the bill, '
  'checks current source state and balance, verifies private proof storage, and inserts one '
  'immutable ledger entry. Retries with the same org/idempotency key and payload return the original. '
  'No ERP call or write.';
revoke execute on function mos.record_pending_bill_payment(text,text,text,numeric,date,text,text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function mos.record_pending_bill_payment(text,text,text,numeric,date,text,text,uuid,uuid,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pending-bill-proofs', 'pending-bill-proofs', false, 307200,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy pending_bill_proofs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pending-bill-proofs'
    and name like (shared.current_org_id()::text || '/%')
    and (select shared.has_access_role('finance'))
  );
create policy pending_bill_proofs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pending-bill-proofs'
    and name like (shared.current_org_id()::text || '/%')
    and name ~ ('^[0-9a-f-]{36}/[0-9a-f-]{8}-[0-9a-f-]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp|pdf)$')
    and (select shared.has_access_role('finance'))
  );

commit;
