-- mos: Finance-owned label overlay for copied pending bills (#1467, AC-1122).
-- The ESB counterparty note remains untouched; this is Finance's short MOS label per bill.
-- Rollback: supabase/rollbacks/20261008004400_mos_pending_bill_finance_label.sql (guarded).
--
-- DOWN: run the guarded rollback above; it refuses while any Finance labels exist.

begin;

create table mos.pending_bill_finance_labels (
  org_id         uuid not null references shared.orgs(id),
  esb_code       text not null check (pg_catalog.btrim(esb_code) <> ''),
  branch_code    text not null check (pg_catalog.btrim(branch_code) <> ''),
  bill_no        text not null check (pg_catalog.btrim(bill_no) <> ''),
  finance_label  text,
  updated_at     timestamptz not null default pg_catalog.now(),
  primary key (org_id, esb_code, branch_code, bill_no),
  foreign key (org_id, esb_code, branch_code, bill_no)
    references reporting.pending_bills (org_id, esb_code, branch_code, bill_no),
  check (
    finance_label is null
    or (
      finance_label = pg_catalog.regexp_replace(finance_label, '^[[:space:]]+|[[:space:]]+$', '', 'g')
      and pg_catalog.char_length(
        pg_catalog.regexp_replace(finance_label, '^[[:space:]]+|[[:space:]]+$', '', 'g')
      ) between 1 and 60
    )
  )
);

comment on table mos.pending_bill_finance_labels is
  'Sparse MOS-owned Finance label overlay for reporting.pending_bills. The ESB counterparty note is '
  'kept as copied; bill identity is org/ESB code/branch code/bill no. Finance-only reads and the '
  'set_pending_bill_finance_label() SECURITY DEFINER function is the end-user write path.';
comment on column mos.pending_bill_finance_labels.finance_label is
  'Finance''s whitespace-normalized short label for this pending bill; null is permitted by the schema and labels '
  'are set or cleared through the Finance-only RPC.';

revoke all on mos.pending_bill_finance_labels from public, anon, authenticated;
grant select on mos.pending_bill_finance_labels to authenticated;
alter table mos.pending_bill_finance_labels enable row level security;
alter table mos.pending_bill_finance_labels force row level security;

create policy pending_bill_finance_labels_select_finance on mos.pending_bill_finance_labels
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.has_access_role('finance')));
comment on policy pending_bill_finance_labels_select_finance on mos.pending_bill_finance_labels is
  'Same-org SELECT for Finance only. Other access roles do not inherit access.';

create function mos.set_pending_bill_finance_label(
  p_esb_code text,
  p_branch_code text,
  p_bill_no text,
  p_finance_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_actor_id uuid := shared.current_person_id();
  v_label text := nullif(
    pg_catalog.regexp_replace(p_finance_label, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
begin
  if v_org_id is null or v_actor_id is null or not shared.has_access_role('finance') then
    raise exception using errcode = '42501', message = 'Finance access is required.';
  end if;
  if not exists (
    select 1 from shared.people p where p.id = v_actor_id and p.org_id = v_org_id
  ) then
    raise exception using errcode = '42501', message = 'Finance identity is not in the current org.';
  end if;
  if p_esb_code is null or pg_catalog.btrim(p_esb_code) = ''
     or p_branch_code is null or pg_catalog.btrim(p_branch_code) = ''
     or p_bill_no is null or pg_catalog.btrim(p_bill_no) = '' then
    raise exception using errcode = '22023', message = 'Pending bill identity is required.';
  end if;
  if v_label is not null and pg_catalog.char_length(v_label) > 60 then
    raise exception using errcode = '23514', message = 'Finance label must be 60 characters or fewer.';
  end if;

  perform 1 from reporting.pending_bills b
   where b.org_id = v_org_id
     and b.esb_code = p_esb_code
     and b.branch_code = p_branch_code
     and b.bill_no = p_bill_no
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pending bill was not found.';
  end if;

  if v_label is null then
    delete from mos.pending_bill_finance_labels l
     where l.org_id = v_org_id
       and l.esb_code = p_esb_code
       and l.branch_code = p_branch_code
       and l.bill_no = p_bill_no;
    return;
  end if;

  insert into mos.pending_bill_finance_labels (
    org_id, esb_code, branch_code, bill_no, finance_label, updated_at
  ) values (
    v_org_id, p_esb_code, p_branch_code, p_bill_no, v_label, pg_catalog.now()
  )
  on conflict (org_id, esb_code, branch_code, bill_no) do update
    set finance_label = excluded.finance_label,
        updated_at = excluded.updated_at;
end;
$$;
comment on function mos.set_pending_bill_finance_label(text,text,text,text) is
  'Finance-only same-org writer for a pending bill''s MOS label. Normalizes edge whitespace and length-checks the value, '
  'verifies the bill identity in the current org, and sets/replaces or clears the sparse overlay. '
  'The ESB copy is never changed.';
revoke execute on function mos.set_pending_bill_finance_label(text,text,text,text) from public, anon, authenticated;
grant execute on function mos.set_pending_bill_finance_label(text,text,text,text) to authenticated;

commit;
