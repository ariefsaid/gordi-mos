-- supabase/seed.sample-org-pending-bills.sql — fictional pending bills for the SAMPLE organisation (#1464).
--
-- The nightly copy writes only the real organisation, so the sample Finance persona would otherwise
-- meet an empty Pending bills list. This file writes the rows lib/db/reporting-pending-bills.ts
-- reads: thirty fictional deferred-payment bills dated 1 to 420 days before the load day (WIB), and
-- one copy-run row at last night's 02:05 WIB. No value here is a business figure or a real customer.
--
-- Shape: bills across the sample branches, linked to the catalog by branch code; one bill under a
-- code the catalog does not know (its branch link stays empty); one flagged void and one flagged
-- missing; who-owes notes short, blank, and one long enough to wrap.
--
-- Target, resolved before anything is written — the same guard as seed.sample-org-money.sql:
--   * hosted project: the Gordi Sample org, only while every person in it has a
--     @sample.gordi.test address;
--   * local stack (listed in supabase/config.toml): when there is no Gordi Sample org and no person
--     outside @example.test, the org that holds the *.dev@example.test personas;
--   * anything else: refused, nothing written. The real org can never qualify.
--
-- Idempotent: ON CONFLICT DO NOTHING on each table's key. Bill dates move with the load day, so a
-- run on a later day adds that day's set beside the earlier one.
--
-- Hosted: psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/seed.sample-org-pending-bills.sql
do $$
declare
  sample_org constant uuid := '5a000000-0000-0000-0000-000000000001';
  target uuid;
  load_day date := (now() at time zone 'Asia/Jakarta')::date;
  snapshot timestamptz;
  bill_rows int;
  run_rows int;
begin
  if exists (select 1 from shared.orgs where id = sample_org) then
    if (select name from shared.orgs where id = sample_org) is distinct from 'Gordi Sample'
       or exists (select 1 from shared.people where org_id = sample_org
                   and coalesce(email, '') not like '%@sample.gordi.test') then
      raise exception 'seed.sample-org-pending-bills: refused, % is not the Gordi Sample org', sample_org;
    end if;
    target := sample_org;
  elsif not exists (select 1 from shared.people where coalesce(email, '') not like '%@example.test') then
    if (select count(distinct org_id) from shared.people where email like '%.dev@example.test') <> 1 then
      raise exception 'seed.sample-org-pending-bills: refused, the local personas are not in exactly one org';
    end if;
    select distinct org_id into target from shared.people where email like '%.dev@example.test';
  else
    raise exception 'seed.sample-org-pending-bills: refused, no Gordi Sample org and this database holds real people';
  end if;

  -- Last night's 02:05 WIB copy, or now if the load runs before it.
  snapshot := least(now(), (load_day + time '02:05') at time zone 'Asia/Jakarta');

  with bill as (
    select v.n, v.days_ago, v.branch_code, v.esb_code, v.note, v.amount, v.state, b.name as branch_name
      from (values
        ( 1,   1, 'gordi_hq',    'GHQ', 'Meja 4',                                         185000, 'present'),
        ( 2,   2, 'rumah_rames', 'RRS', 'Kantor lantai 3',                                420000, 'present'),
        ( 3,   3, 'radiant',     'RDN', null,                                              96000, 'present'),
        ( 4,   5, 'cikal',       'CKL', 'Arisan Kamis',                                   735000, 'present'),
        ( 5,   6, 'gordi_hq',    'GHQ', 'Rapat pagi',                                     264000, 'present'),
        ( 6,   8, 'rumah_rames', 'RRS', 'Catering kantor sebelah — tagih akhir bulan, pesanan 40 kotak nasi dan 40 es teh, kirim ke lobi utama lantai dua', 2480000, 'present'),
        ( 7,  11, 'radiant',     'RDN', 'Tamu event',                                     158000, 'present'),
        ( 8,  13, 'pop_up_east', 'GHQ', 'Bazar akhir pekan',                              612000, 'present'),
        ( 9,  16, 'cikal',       'CKL', '',                                                74000, 'present'),
        (10,  20, 'gordi_hq',    'GHQ', 'Komunitas lari',                                 903000, 'present'),
        (11,  24, 'rumah_rames', 'RRS', 'Meja 12',                                        211000, 'void'),
        (12,  29, 'radiant',     'RDN', 'Kantor notaris',                                 389000, 'present'),
        (13,  33, 'cikal',       'CKL', 'Ulang tahun',                                   1150000, 'present'),
        (14,  38, 'gordi_hq',    'GHQ', null,                                             132000, 'missing'),
        (15,  45, 'rumah_rames', 'RRS', 'Pengajian RT',                                   845000, 'present'),
        (16,  52, 'radiant',     'RDN', 'Workshop kopi',                                  560000, 'present'),
        (17,  60, 'cikal',       'CKL', 'Sekolah dasar',                                 1975000, 'present'),
        (18,  71, 'gordi_hq',    'GHQ', 'Klien B2B',                                     4250000, 'present'),
        (19,  83, 'rumah_rames', 'RRS', 'Meja 7',                                          98000, 'present'),
        (20,  97, 'radiant',     'RDN', 'Kantor pajak',                                   677000, 'present'),
        (21, 112, 'cikal',       'CKL', null,                                             243000, 'present'),
        (22, 130, 'gordi_hq',    'GHQ', 'Gathering kantor',                              3120000, 'present'),
        (23, 151, 'rumah_rames', 'RRS', 'Tetangga ruko',                                  155000, 'present'),
        (24, 175, 'radiant',     'RDN', 'Kelas yoga',                                     486000, 'present'),
        (25, 203, 'cikal',       'CKL', 'Panitia lomba',                                  932000, 'present'),
        (26, 236, 'gordi_hq',    'GHQ', 'Meja 2',                                          67000, 'present'),
        (27, 274, 'rumah_rames', 'RRS', 'Kantor desa',                                   1340000, 'present'),
        (28, 318, 'radiant',     'RDN', 'Reuni',                                          728000, 'present'),
        (29, 366, 'cikal',       'CKL', 'Toko sebelah',                                   119000, 'present'),
        (30, 420, 'gordi_hq',    'GHQ', 'Pesanan lama',                                   254000, 'present')
      ) as v(n, days_ago, branch_code, esb_code, note, amount, state)
      left join shared.branches b on b.org_id = target and b.code = v.branch_code
  ),
  bill_insert as (
    insert into reporting.pending_bills
      (org_id, esb_code, branch_code, bill_no, sales_no, bill_date, branch_name, counterparty_note,
       amount, source_state, source_state_at, first_seen_at, snapshot_as_of)
    select target, b.esb_code, b.branch_code,
           'PB-' || to_char(load_day - b.days_ago, 'YYMMDD') || '-' || lpad(b.n::text, 3, '0'),
           'SN-' || to_char(load_day - b.days_ago, 'YYMMDD') || '-' || lpad(b.n::text, 3, '0'),
           load_day - b.days_ago, b.branch_name, nullif(b.note, ''), b.amount, b.state,
           case when b.state <> 'present' then snapshot end,
           least(snapshot, ((load_day - b.days_ago + 1) + time '02:05') at time zone 'Asia/Jakarta'),
           snapshot
      from bill b
    on conflict (org_id, esb_code, branch_code, bill_no) do nothing
    returning 1
  ),
  run_insert as (
    insert into reporting.pending_bill_snapshots
      (org_id, snapshot_as_of, bill_count, window_start, source_contract_version)
    values (target, snapshot, (select count(*) from bill where state = 'present'), load_day - 729,
            'pos_pending_bills.v1')
    on conflict (org_id, snapshot_as_of) do nothing
    returning 1
  )
  select (select count(*) from bill_insert), (select count(*) from run_insert)
    into bill_rows, run_rows;

  raise notice 'seed.sample-org-pending-bills: org %, % bills and % copy runs added',
    target, bill_rows, run_rows;
end
$$;
