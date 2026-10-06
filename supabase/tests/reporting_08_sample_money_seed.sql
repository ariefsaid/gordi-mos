-- reporting — the sample-org Money rows that seed.sample-org-money.sql writes on a reset (#1435).
--
-- Read as the seed owner against the rows the reset wrote, like shared_10_dev_seed.sql. On a local
-- stack the sample personas live in the fixture org, so that org is the target. The window is
-- anchored on the load (the rows' loaded_at), not on today, so a stack reset days ago still reads
-- the window it was given.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create temp table t_org on commit drop as
  select distinct org_id as id from shared.people where email like '%.dev@example.test';

create temp table t_load on commit drop as
  select (max(r.loaded_at) at time zone 'Asia/Jakarta')::date as day
    from reporting.sales_daily_revenue r where r.org_id = (select id from t_org);

-- The 120 days the 60-day period reads (60 days plus the previous 60), ending the day before the load.
create temp table t_days on commit drop as
  select d::date as day
    from generate_series((select day from t_load) - 120, (select day from t_load) - 1, interval '1 day') d;

create temp table t_pos on commit drop as
  select b.id, b.code from shared.branches b
   where b.org_id = (select id from t_org) and b.archived_at is null and b.code <> 'roastery';

select is((select count(*)::int from t_org), 1, 'the local sample personas belong to one org');

select ok((select day from t_load) is not null, 'the reset wrote revenue rows for that org');

select is(
  (select (max(snapshot_as_of) at time zone 'Asia/Jakarta')::date
     from reporting.sales_daily_revenue where org_id = (select id from t_org)),
  (select day from t_load),
  'the snapshot is dated on the load day, so the freshness line reads as last night''s sync');

select is((select count(*)::int from t_pos), 4, 'the catalog has four POS branches besides the roastery');

select is(
  (select count(*)::int
     from t_pos p cross join t_days d
    where p.code <> 'cikal'
      and not exists (select 1 from reporting.sales_daily_revenue r
                       where r.org_id = (select id from t_org) and r.channel = 'POS'
                         and r.branch_id = p.id and r.revenue_date = d.day)),
  0,
  'every POS branch but the partial one has a revenue row on each of the 120 days');

select ok(
  not exists (select 1 from reporting.sales_daily_revenue r join t_pos p on p.id = r.branch_id
               where p.code = 'cikal' and r.revenue_date = (select day from t_load) - 1),
  'the partial branch is missing the latest day');

select ok(
  exists (select 1 from reporting.sales_daily_revenue r join t_pos p on p.id = r.branch_id
           where p.code = 'cikal' and r.revenue_date = (select day from t_load) - 2),
  'it reported the day before');

select ok(
  (select count(*) from t_days d
    where d.day < (select day from t_load) - 2
      and not exists (select 1 from reporting.sales_daily_revenue r join t_pos p on p.id = r.branch_id
                       where p.code = 'cikal' and r.revenue_date = d.day)) between 1 and 10,
  'and it has a gap earlier in the window, without being mostly empty');

-- B2B invoices are issued on working days only.
select is(
  (select count(*)::int from t_days d
    where extract(isodow from d.day) <= 5
      and not exists (select 1 from reporting.sales_daily_revenue r
                       where r.org_id = (select id from t_org) and r.channel = 'B2B'
                         and r.revenue_date = d.day)),
  0,
  'the roastery has a B2B row on every weekday of the window');

select is(
  (select count(*)::int
     from reporting.sales_daily_revenue r
     join reporting.sales_margin_daily m
       on m.org_id = r.org_id and m.margin_date = r.revenue_date and m.branch_code = r.branch_code
    where r.org_id = (select id from t_org) and r.channel = 'POS'
      and r.revenue_date >= (select min(day) from t_days)
      and m.revenue = r.clean_revenue and m.cogs_budget_bom is not null
      and m.bom_coverage_pct between 0 and 1),
  (select count(*)::int from reporting.sales_daily_revenue
    where org_id = (select id from t_org) and channel = 'POS'
      and revenue_date >= (select min(day) from t_days)),
  'every POS revenue row has a margin row with the same revenue, a budget COGS and a coverage share');

select ok(
  exists (select 1 from reporting.sales_margin_daily
           where org_id = (select id from t_org) and cogs_interim_sm is null
             and margin_interim is null and margin_interim_pct is null),
  'one branch-day has a COGS sync gap, with no margin rather than a made-up one');

select is(
  (select count(*)::int from reporting.sales_margin_daily
    where org_id = (select id from t_org) and cogs_interim_sm is not null
      and (margin_interim <> revenue - cogs_interim_sm
           or margin_interim_pct <> round(margin_interim / revenue, 4)
           or margin_interim_pct not between 0.45 and 0.75)),
  0,
  'margin is revenue minus interim COGS, its share rounded as the snapshot writer does, and plausible');

-- PostgREST returns at most max_rows (1000, supabase/config.toml) per request, and Money reads
-- the 120 days in one request: past that it would silently show part of the window.
select cmp_ok(
  (select count(*)::int from reporting.sales_daily_revenue
    where org_id = (select id from t_org) and revenue_date >= (select min(day) from t_days)),
  '<=', 1000,
  'the 120-day revenue read fits in one PostgREST response');

select is(
  (select count(*)::int from reporting.sales_daily_revenue where org_id <> (select id from t_org))
  + (select count(*)::int from reporting.sales_margin_daily where org_id <> (select id from t_org)),
  0,
  'no other org holds reporting rows after a reset');

select * from finish();
rollback;
