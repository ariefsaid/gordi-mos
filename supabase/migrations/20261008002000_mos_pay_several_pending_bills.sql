-- mos: settle several present pending bills in one Finance payment (#1466).
-- MOS remains the settlement record; this migration does not call or write to the ERP.
-- The batch writer locks and validates every selected bill before writing, then delegates each
-- full-balance entry to record_pending_bill_payment() so its proof, date, cents and ledger rules stay shared.
-- Rollback: supabase/rollbacks/20261008002000_mos_pay_several_pending_bills.sql (guarded).
--
-- DOWN: run the guarded rollback above; it refuses while batch request records exist.

begin;

create table mos.pending_bill_payment_batches (
  org_id          uuid not null references shared.orgs(id),
  idempotency_key uuid not null,
  payload_hash    text not null check (payload_hash ~ '^[0-9a-f]{32}$'),
  created_by      uuid not null references shared.people(id),
  created_at      timestamptz not null default pg_catalog.now(),
  primary key (org_id, idempotency_key)
);
comment on table mos.pending_bill_payment_batches is
  'Idempotency fence for atomic multi-bill payment requests. Each committed batch has one immutable request fingerprint and its corresponding per-bill ledger entries.';

revoke all on mos.pending_bill_payment_batches from public, anon, authenticated;
alter table mos.pending_bill_payment_batches enable row level security;
alter table mos.pending_bill_payment_batches force row level security;

create function mos.pay_several_pending_bills(
  p_bill_ids text[],
  p_cash_in_date date,
  p_proof_path text,
  p_idempotency_key uuid
)
returns table(payment_id uuid, esb_code text, branch_code text, bill_no text, amount numeric(14,2), replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_actor_id uuid := shared.current_person_id();
  v_today date := (pg_catalog.now() at time zone 'Asia/Jakarta')::date;
  v_bill_id text;
  v_canonical_ids text[] := array[]::text[];
  v_canonical_id text;
  v_identity jsonb;
  v_esb_code text;
  v_branch_code text;
  v_bill_no text;
  v_bill reporting.pending_bills%rowtype;
  v_balance numeric(14,2);
  v_paid numeric(14,2);
  v_payload_hash text;
  v_existing_hash text;
  v_payment_id uuid;
  v_replayed boolean;
begin
  if v_org_id is null or v_actor_id is null or not shared.has_access_role('finance') then
    raise exception using errcode = '42501', message = 'Finance access is required.';
  end if;
  if not exists (
    select 1 from shared.people p where p.id = v_actor_id and p.org_id = v_org_id
  ) then
    raise exception using errcode = '42501', message = 'Finance identity is not in the current org.';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'Idempotency key is required.';
  end if;
  if p_bill_ids is null or pg_catalog.cardinality(p_bill_ids) = 0 then
    raise exception using errcode = '22023', message = 'Select at least one pending bill.';
  end if;

  foreach v_bill_id in array p_bill_ids loop
    if v_bill_id is null or pg_catalog.btrim(v_bill_id) = '' then
      raise exception using errcode = '22023', message = 'A pending bill id is required.';
    end if;
    v_identity := v_bill_id::jsonb;
    if pg_catalog.jsonb_typeof(v_identity) <> 'array' then
      raise exception using errcode = '22023', message = 'A pending bill id is invalid.';
    end if;
    if pg_catalog.jsonb_array_length(v_identity) <> 3
       or pg_catalog.jsonb_typeof(v_identity -> 0) <> 'string'
       or pg_catalog.jsonb_typeof(v_identity -> 1) <> 'string'
       or pg_catalog.jsonb_typeof(v_identity -> 2) <> 'string' then
      raise exception using errcode = '22023', message = 'A pending bill id is invalid.';
    end if;
    v_esb_code := v_identity ->> 0;
    v_branch_code := v_identity ->> 1;
    v_bill_no := v_identity ->> 2;
    if pg_catalog.btrim(v_esb_code) = '' or pg_catalog.btrim(v_branch_code) = '' or pg_catalog.btrim(v_bill_no) = '' then
      raise exception using errcode = '22023', message = 'A pending bill id is invalid.';
    end if;

    v_canonical_id := pg_catalog.jsonb_build_array(v_esb_code, v_branch_code, v_bill_no)::text;
    if v_canonical_id = any(v_canonical_ids) then
      raise exception using errcode = '22023', message = 'Duplicate pending bill ids are not allowed.';
    end if;
    v_canonical_ids := pg_catalog.array_append(v_canonical_ids, v_canonical_id);
  end loop;

  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'bill_ids', (select pg_catalog.jsonb_agg(ids.id order by ids.id) from pg_catalog.unnest(v_canonical_ids) as ids(id)),
    'cash_in_date', p_cash_in_date,
    'proof_path', p_proof_path
  )::text) into v_payload_hash;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org_id::text || ':' || p_idempotency_key::text, 0));

  select batch.payload_hash into v_existing_hash
    from mos.pending_bill_payment_batches batch
   where batch.org_id = v_org_id and batch.idempotency_key = p_idempotency_key;
  if found then
    if v_existing_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'Idempotency key was used for a different multi-bill request.';
    end if;

    foreach v_canonical_id in array v_canonical_ids loop
      v_identity := v_canonical_id::jsonb;
      v_esb_code := v_identity ->> 0;
      v_branch_code := v_identity ->> 1;
      v_bill_no := v_identity ->> 2;
      select p.id, p.amount into v_payment_id, v_balance
        from mos.pending_bill_payments p
       where p.org_id = v_org_id
         and p.esb_code = v_esb_code
         and p.branch_code = v_branch_code
         and p.bill_no = v_bill_no
         and p.entry_kind = 'payment'
         and p.idempotency_key = pg_catalog.md5(p_idempotency_key::text || ':' || v_canonical_id)::uuid;
      if not found then
        raise exception using errcode = '23514', message = 'The recorded multi-bill payment is incomplete.';
      end if;
      return query select v_payment_id, v_esb_code, v_branch_code, v_bill_no, v_balance, true;
    end loop;
    return;
  end if;

  -- Lock in canonical identity order so overlapping batches acquire bill locks consistently.
  for v_canonical_id in
    select ids.id from pg_catalog.unnest(v_canonical_ids) as ids(id) order by ids.id
  loop
    v_identity := v_canonical_id::jsonb;
    v_esb_code := v_identity ->> 0;
    v_branch_code := v_identity ->> 1;
    v_bill_no := v_identity ->> 2;

    select b.* into v_bill
      from reporting.pending_bills b
     where b.org_id = v_org_id
       and b.esb_code = v_esb_code
       and b.branch_code = v_branch_code
       and b.bill_no = v_bill_no
       for update;
    if not found then
      raise exception using errcode = 'P0002', message = pg_catalog.format('Pending bill %s was not found in this org.', v_bill_no);
    end if;
    if v_bill.source_state <> 'present' then
      raise exception using errcode = '23514', message = pg_catalog.format('Pending bill %s is not present in the source copy.', v_bill_no);
    end if;

    select coalesce(pg_catalog.sum(p.amount), 0)::numeric(14,2) into v_paid
      from mos.pending_bill_payments p
     where p.org_id = v_org_id
       and p.esb_code = v_esb_code
       and p.branch_code = v_branch_code
       and p.bill_no = v_bill_no;
    v_balance := v_bill.amount - v_paid;
    if v_balance <= 0 then
      raise exception using errcode = '23514', message = pg_catalog.format('Pending bill %s is already settled.', v_bill_no);
    end if;
  end loop;

  insert into mos.pending_bill_payment_batches (org_id, idempotency_key, payload_hash, created_by)
  values (v_org_id, p_idempotency_key, v_payload_hash, v_actor_id);

  foreach v_canonical_id in array v_canonical_ids loop
    v_identity := v_canonical_id::jsonb;
    v_esb_code := v_identity ->> 0;
    v_branch_code := v_identity ->> 1;
    v_bill_no := v_identity ->> 2;

    select b.* into v_bill
      from reporting.pending_bills b
     where b.org_id = v_org_id
       and b.esb_code = v_esb_code
       and b.branch_code = v_branch_code
       and b.bill_no = v_bill_no;
    select coalesce(pg_catalog.sum(p.amount), 0)::numeric(14,2) into v_paid
      from mos.pending_bill_payments p
     where p.org_id = v_org_id
       and p.esb_code = v_esb_code
       and p.branch_code = v_branch_code
       and p.bill_no = v_bill_no;
    v_balance := v_bill.amount - v_paid;

    select recorded.payment_id, recorded.replayed
      into v_payment_id, v_replayed
      from mos.record_pending_bill_payment(
        v_esb_code,
        v_branch_code,
        v_bill_no,
        v_balance,
        p_cash_in_date,
        p_proof_path,
        null,
        pg_catalog.md5(p_idempotency_key::text || ':' || v_canonical_id)::uuid,
        null,
        null
      ) as recorded;

    return query select v_payment_id, v_esb_code, v_branch_code, v_bill_no, v_balance, v_replayed;
  end loop;
end;
$$;
comment on function mos.pay_several_pending_bills(text[], date, text, uuid) is
  'Finance-only atomic full-balance settlement for several present pending bills. Locks and validates the entire selection before delegating each immutable ledger write to record_pending_bill_payment(). A request key replays the exact batch; changed payloads and duplicate bill ids are refused. No ERP call or write.';
revoke execute on function mos.pay_several_pending_bills(text[], date, text, uuid) from public, anon, authenticated;
grant execute on function mos.pay_several_pending_bills(text[], date, text, uuid) to authenticated;

commit;
