-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- reporting: the pending-bill copy (#1464).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A nightly bill-grain copy of the till's deferred-payment bills (the "PENDING BILL" tender), and
-- one log row per copy run. The source has no open/closed signal: MOS is where settlement will be
-- recorded, so this copy only adds, refreshes and flags. A bill the source voids or stops sending
-- keeps its row with source_state 'void' or 'missing' — Finance never loses a bill silently.
--
-- Read by Finance only. Not admin, not manager, not supervisor: who owes what is Finance's
-- reconciliation work, and the till note on each bill can name a customer.
--
-- Branch link: same propose-not-reject rule as the revenue fact (OD-WAY-39) — branch_code is kept
-- as sent and never validated; branch_id is a nullable link beside it. Here the link is filled by a
-- trigger from shared.branches (same org, same code), because the writer has no read on the catalog
-- and an unknown code must still ingest.
--
-- Writer: reporting_writer, scoped to the org its run declares (reporting.current_writer_org()).
-- SELECT, INSERT, UPDATE — no DELETE, so the copy cannot drop a bill even by mistake.
--
-- DOWN: drop table reporting.pending_bill_snapshots;
--       drop table reporting.pending_bills;       -- drops its trigger and policies with it
--       drop function reporting._link_pending_bill_branch();
--       -- restore reporting.current_writer_org()'s comment from
--       -- 20260821000001_reporting_writer_org_scope.sql

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. reporting.pending_bills
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table reporting.pending_bills (
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  esb_code                text not null check (btrim(esb_code) <> ''),
  branch_code             text not null check (btrim(branch_code) <> ''),
  bill_no                 text not null check (btrim(bill_no) <> ''),
  sales_no                text,
  bill_date               date not null,
  branch_name             text,
  branch_id               uuid,
  counterparty_note       text,
  amount                  numeric(14,2) not null check (amount > 0),
  source_state            text not null default 'present'
                            check (source_state in ('present','void','missing')),
  source_state_at         timestamptz,
  first_seen_at           timestamptz not null default now(),
  snapshot_as_of          timestamptz not null,
  source_contract_version text not null default 'pos_pending_bills.v1',
  loaded_at               timestamptz not null default now(),
  primary key (org_id, esb_code, branch_code, bill_no),
  constraint pending_bills_branch_same_org
    foreign key (org_id, branch_id) references shared.branches (org_id, id)
);

comment on table reporting.pending_bills is
  'Nightly copy of the till''s deferred-payment bills, one row per bill. Grain: org/ESB code/ERP '
  'branch code/bill no. Rows are added, refreshed and flagged (source_state), never deleted by the '
  'copy. Finance-only read; no end-user write path.';
comment on column reporting.pending_bills.branch_code is
  'The ERP''s own branch code, stored exactly as sent and never validated against MOS''s catalog (OD-WAY-39).';
comment on column reporting.pending_bills.branch_id is
  'Link to shared.branches filled by trigger from (org_id, branch_code) while empty; null until the '
  'code is catalogued. The composite FK keeps a set link inside the same org.';
comment on column reporting.pending_bills.counterparty_note is
  'Who owes, as written on the bill at the till — kept as given (trimmed only), null when blank.';
comment on column reporting.pending_bills.amount is
  'The bill''s grand total. Must be positive; a non-positive total is refused rather than copied.';
comment on column reporting.pending_bills.source_state is
  'present: in the latest copy. void: the source now reports the bill void. missing: the source no '
  'longer sends it inside the copy window. Flagged rows are kept.';
comment on column reporting.pending_bills.source_state_at is
  'When source_state last changed; null while the bill has only ever been present.';
comment on column reporting.pending_bills.first_seen_at is
  'When a copy run first wrote this bill.';
comment on column reporting.pending_bills.snapshot_as_of is
  'The copy run that last carried this bill — shared by every row that run wrote.';
comment on column reporting.pending_bills.source_contract_version is
  'Warehouse-to-reporting contract identifier, so a source-view reshape is visible in the data.';

create index pending_bills_org_date_idx on reporting.pending_bills (org_id, bill_date);

-- The branch link. SECURITY DEFINER because the writer role has no grant on shared.branches; it
-- reads one row by (org_id, code) and never rejects.
create or replace function reporting._link_pending_bill_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.branch_id is null then
    new.branch_id := (select b.id from shared.branches b
                       where b.org_id = new.org_id and b.code = new.branch_code);
  end if;
  return new;
end;
$$;
comment on function reporting._link_pending_bill_branch() is
  'Trigger: fills an empty pending_bills.branch_id from shared.branches in the same org with code = '
  'branch_code on every insert and update, so the nightly upsert links a bill once its branch is '
  'catalogued; stays null while the code is unknown. Never rejects a bill. SECURITY DEFINER so the '
  'snapshot writer needs no read on the branch catalog.';
revoke execute on function reporting._link_pending_bill_branch() from public;

-- Every UPDATE, not only UPDATE OF branch_code: the nightly upsert never sets branch_code (it is
-- part of the key), and it is that upsert which must pick up a branch catalogued since.
create trigger pending_bills_link_branch
  before insert or update on reporting.pending_bills
  for each row execute function reporting._link_pending_bill_branch();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. reporting.pending_bill_snapshots — one row per copy run
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table reporting.pending_bill_snapshots (
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  snapshot_as_of          timestamptz not null,
  bill_count              int not null check (bill_count >= 0),
  window_start            date not null,
  source_contract_version text not null check (btrim(source_contract_version) <> ''),
  primary key (org_id, snapshot_as_of)
);
comment on table reporting.pending_bill_snapshots is
  'One row per pending-bill copy run. The latest row is the list''s as-of time; no row means no copy '
  'has run yet. Finance-only read; no end-user write path.';
comment on column reporting.pending_bill_snapshots.bill_count is
  'How many deferred-payment bills the run carried (present rows written), not counting flags.';
comment on column reporting.pending_bill_snapshots.window_start is
  'The earliest bill date the run read; bills before it are neither refreshed nor flagged.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Grants and RLS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
grant select on reporting.pending_bills          to authenticated;
grant select on reporting.pending_bill_snapshots to authenticated;
grant select, insert, update, delete on reporting.pending_bills          to service_role;
grant select, insert, update, delete on reporting.pending_bill_snapshots to service_role;
grant select, insert, update on reporting.pending_bills          to reporting_writer;
grant select, insert, update on reporting.pending_bill_snapshots to reporting_writer;

alter table reporting.pending_bills          enable row level security;
alter table reporting.pending_bills          force  row level security;
alter table reporting.pending_bill_snapshots enable row level security;
alter table reporting.pending_bill_snapshots force  row level security;

create policy pending_bills_select on reporting.pending_bills
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.has_access_role('finance')));
comment on policy pending_bills_select on reporting.pending_bills is
  'Same-org SELECT for finance only. Admin, manager, supervisor, ops_lead and member read nothing.';

create policy pending_bills_write_reporting_writer on reporting.pending_bills
  for all to reporting_writer
  using      (org_id = (select reporting.current_writer_org()))
  with check (org_id = (select reporting.current_writer_org()));
comment on policy pending_bills_write_reporting_writer on reporting.pending_bills is
  'The copy run''s upsert-and-flag path, scoped to the org the run declared in app.reporting_org. '
  'FOR ALL because ON CONFLICT DO UPDATE consults the SELECT policies of the conflicting row; the '
  'missing DELETE grant, not this policy, is what keeps the run from removing a bill.';

create policy pending_bill_snapshots_select on reporting.pending_bill_snapshots
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.has_access_role('finance')));
comment on policy pending_bill_snapshots_select on reporting.pending_bill_snapshots is
  'Same-org SELECT for finance only — the run log is read for the list''s as-of time.';

create policy pending_bill_snapshots_write_reporting_writer on reporting.pending_bill_snapshots
  for all to reporting_writer
  using      (org_id = (select reporting.current_writer_org()))
  with check (org_id = (select reporting.current_writer_org()));
comment on policy pending_bill_snapshots_write_reporting_writer on reporting.pending_bill_snapshots is
  'The copy run logs itself, scoped to the org the run declared in app.reporting_org.';

-- The writer-org function's comment named how many policies it backs; this file adds two more.
-- Restated without a count so the next table cannot make it wrong again.
comment on function reporting.current_writer_org() is
  'The org a snapshot run has declared for the transaction it is writing in, via '
  'set_config(''app.reporting_org'', <uuid>, true). Absent, empty or unparseable all return NULL, which no '
  'row''s org_id can equal — so a run that has not declared an org writes nothing. Backs every '
  '*_write_reporting_writer policy in the reporting schema.';
