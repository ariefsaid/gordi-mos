-- supabase/seed.sample-org-money.sql — fictional Money rows for the SAMPLE organisation (#1435).
--
-- The nightly reporting snapshot writes only the real organisation, so sample personas would
-- otherwise see an empty Money area. This file writes the rows lib/db/reporting.ts and
-- lib/db/reporting-margin.ts read, for the 120 days before the load day (WIB): the 60-day period
-- plus its previous period. Every value is generated from (branch, date); none is a business
-- figure. One run is one statement, so it applies whole or not at all.
--
-- Target, resolved before anything is written:
--   * hosted project: the Gordi Sample org, only while every person in it has a
--     @sample.gordi.test address;
--   * local stack (listed in supabase/config.toml, so every reset applies it): when there is no
--     Gordi Sample org and no person outside @example.test, the org that holds the
--     *.dev@example.test personas;
--   * anything else: refused, nothing written. The real org can never qualify.
--
-- Idempotent: inserts are ON CONFLICT DO NOTHING on each table's key, so a second run on the same
-- day writes nothing. A run on a later day adds the days since, like a nightly sync.
--
-- Shape: four POS branches every day; the roastery's B2B invoices on weekdays; Cikal is the
-- partial branch (no row for the latest day, and a two-day gap every 41 days); Radiant has a COGS
-- sync gap every 47 days (margin null, never a made-up figure).
--
-- Hosted: psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/seed.sample-org-money.sql
do $$
declare
  sample_org constant uuid := '5a000000-0000-0000-0000-000000000001';
  target uuid;
  load_day date := (now() at time zone 'Asia/Jakarta')::date;
  snapshot timestamptz;
  revenue_rows int;
  margin_rows int;
begin
  if exists (select 1 from shared.orgs where id = sample_org) then
    if (select name from shared.orgs where id = sample_org) is distinct from 'Gordi Sample'
       or exists (select 1 from shared.people where org_id = sample_org
                   and coalesce(email, '') not like '%@sample.gordi.test') then
      raise exception 'seed.sample-org-money: refused, % is not the Gordi Sample org', sample_org;
    end if;
    target := sample_org;
  elsif not exists (select 1 from shared.people where coalesce(email, '') not like '%@example.test') then
    if (select count(distinct org_id) from shared.people where email like '%.dev@example.test') <> 1 then
      raise exception 'seed.sample-org-money: refused, the local personas are not in exactly one org';
    end if;
    select distinct org_id into target from shared.people where email like '%.dev@example.test';
  else
    raise exception 'seed.sample-org-money: refused, no Gordi Sample org and this database holds real people';
  end if;

  -- Last night's 02:05 WIB sync, or now if the load runs before it.
  snapshot := least(now(), (load_day + time '02:05') at time zone 'Asia/Jakarta');

  with branch as (
    select v.code, v.esb_code, v.channel, coalesce(b.name, v.name) as name, b.id as branch_id,
           v.base, v.ticket, v.cogs_share, v.budget_share, v.coverage, v.phase
      from (values
        ('gordi_hq',    'GHQ', 'POS', 'Gordi HQ',       15400000, 61000,   0.355, 0.335, 0.94,  0),
        ('rumah_rames', 'RRS', 'POS', 'Rumah Rames',    10900000, 47000,   0.428, 0.372, 0.88, 11),
        ('radiant',     'RDN', 'POS', 'Radiant',         7300000, 56000,   0.338, 0.352, 0.97, 23),
        ('cikal',       'CKL', 'POS', 'Cikal',           4700000, 52000,   0.402, 0.341, 0.79, 37),
        ('roastery',    'GRI', 'B2B', 'Gordi Roastery',  6800000, 1150000, null,  null,  null,  5)
      ) as v(code, esb_code, channel, name, base, ticket, cogs_share, budget_share, coverage, phase)
      left join shared.branches b on b.org_id = target and b.code = v.code
  ),
  day as (
    select d::date as day, (d::date - date '2026-01-01') as n
      from generate_series(load_day - 120, load_day - 1, interval '1 day') d
  ),
  cell as (
    -- r1..r4: four independent uniform draws in [0, 1), fixed per branch and date.
    select br.*, d.day, d.n,
           (('x' || substr(h.md5, 1, 8))::bit(32)::bigint / 4294967296.0)  as r1,
           (('x' || substr(h.md5, 9, 8))::bit(32)::bigint / 4294967296.0)  as r2,
           (('x' || substr(h.md5, 17, 8))::bit(32)::bigint / 4294967296.0) as r3,
           (('x' || substr(h.md5, 25, 8))::bit(32)::bigint / 4294967296.0) as r4
      from branch br
      cross join day d
      cross join lateral (select md5(br.code || ':' || to_char(d.day, 'YYYY-MM-DD')) as md5) h
     where not (br.channel = 'B2B' and extract(isodow from d.day) > 5)
       and not (br.code = 'cikal' and (d.day = load_day - 1 or d.n % 41 in (0, 1)))
  ),
  sale as (
    select c.*,
           case when c.channel = 'B2B'
             then round(c.base * (0.45 + 1.1 * c.r1), -3)
             else round((c.base
                         * (array[0.86, 0.84, 0.88, 0.93, 1.06, 1.31, 1.24])[extract(isodow from c.day)::int]
                         * (1 + 0.07 * sin(2 * pi() * (c.n + c.phase) / 63.0))
                         * (0.91 + 0.18 * c.r1))::numeric, -3)
           end as revenue
      from cell c
  ),
  revenue_insert as (
    insert into reporting.sales_daily_revenue
      (org_id, revenue_date, channel, esb_code, branch_code, branch_name, branch_id,
       transactions, clean_revenue, snapshot_as_of)
    select target, s.day, s.channel, s.esb_code, s.esb_code, s.name, s.branch_id,
           greatest(1, round(s.revenue / (s.ticket * (0.94 + 0.12 * s.r2)))), s.revenue, snapshot
      from sale s
    on conflict (org_id, revenue_date, channel, esb_code, branch_code) do nothing
    returning 1
  ),
  cost as (
    select s.*,
           case when not (s.code = 'radiant' and s.n % 47 = 5)
             then round(s.revenue * (s.cogs_share + 0.04 * (s.r3 - 0.5)), -2) end as cogs
      from sale s
     where s.channel = 'POS'
  ),
  margin_insert as (
    insert into reporting.sales_margin_daily
      (org_id, margin_date, esb_code, branch_code, branch_name, branch_id, revenue, cogs_interim_sm,
       cogs_budget_bom, margin_interim, margin_interim_pct, bom_coverage_pct, snapshot_as_of)
    select target, c.day, c.esb_code, c.esb_code, c.name, c.branch_id, c.revenue, c.cogs,
           round(c.revenue * (c.budget_share + 0.012 * (c.r4 - 0.5)), -2),
           c.revenue - c.cogs,
           round((c.revenue - c.cogs) / c.revenue, 4),
           least(1, round(c.coverage + 0.06 * (c.r4 - 0.5), 4)),
           snapshot
      from cost c
    on conflict (org_id, margin_date, esb_code, branch_code) do nothing
    returning 1
  )
  select (select count(*) from revenue_insert), (select count(*) from margin_insert)
    into revenue_rows, margin_rows;

  raise notice 'seed.sample-org-money: org %, % revenue and % margin rows added, days % to %',
    target, revenue_rows, margin_rows, load_day - 120, load_day - 1;
end
$$;
