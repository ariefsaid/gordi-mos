-- mos.aggregate_compiled — DB-side aggregate RPC (T34 / P2.1, AC-P2-RT-006).
-- The P1 in-memory aggregate reduced only the ≤500 capped fetch, so a truncated aggregate was a
-- LOWER BOUND. This RPC computes the real SQL aggregate over the FULL predicate, uncapped by the
-- row limit. These tests prove: (1) sum over >500 rows == the uncapped total; (2) groupBy; (3)
-- the second trust boundary (whitelist rejection); (4) the D7 required-time-range guard; (5) RLS
-- isolation under SECURITY INVOKER (a caller sees only their own org's rows).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select mos._test_seed_role_tree();

-- Test orgs/people from the shared seed harness: org A = ...0a1 (Author ...0d1), org B = ...0b1.
-- Seed as the postgres superuser (reporting.* is writer-locked to the reporting_writer role; the
-- authenticated role has SELECT only). All aggregate reads then run as `authenticated` to exercise
-- the real RLS posture under SECURITY INVOKER.

-- ── AC-P2-RT-006: sum over >500 rows equals the uncapped total ─────────────────────────────
-- Seed 600 reporting rows owned by org A. reporting.sales_daily_revenue has a PK on
-- (org_id, revenue_date, channel, esb_code, branch_code); vary the date to keep 600 distinct keys.
-- 600 > the 500 in-memory cap, so an in-memory reduction would undercount by 100 rows (lower bound).
insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
select '00000000-0000-0000-0000-0000000000a1',
       ('2025-01-01'::date + (n || ' day')::interval)::date,
       case when n % 2 = 0 then 'POS' else 'B2B' end,
       'GRI', 'BGR', 'Bungur',
       1, 100.00, now()
from generate_series(1, 600) as n
-- 600 distinct days → 600 distinct PKs (org/date/channel/esb/branch). 600 > the 500 in-memory cap,
-- so an in-memory reduction would undercount by 100 rows (lower bound) — the proof this test needs.
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';

-- Sanity: confirm at least 501 rows seeded (otherwise the >500 proof is vacuous).
select ok(
  (select count(*)::int >= 501 from reporting.sales_daily_revenue
    where org_id = '00000000-0000-0000-0000-0000000000a1'),
  'fixture: ≥501 reporting rows seeded for the uncapped-aggregate proof');

-- The load-bearing assertion: the RPC sum equals count × 100 over the FULL set. An in-memory
-- reduction capped at 500 would have returned ≤ 50000, not the true total.
select is(
  (select agg_value from mos.aggregate_compiled('{
    "entity":"sales_daily_revenue",
    "resolvedAggregate":{"fn":"sum","column":"clean_revenue","alias":"total"},
    "resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}
  }'::jsonb)),
  (select (count(*) * 100)::numeric from reporting.sales_daily_revenue
    where org_id = '00000000-0000-0000-0000-0000000000a1'),
  'AC-P2-RT-006: sum(clean_revenue) over the FULL predicate == uncapped total (>500 rows)');

-- ── groupBy: per-channel sums ──────────────────────────────────────────────────────────────
-- Each channel (POS/B2B) sums its own rows; the two halves together equal the whole.
select is(
  (select sum(agg_value)::numeric from mos.aggregate_compiled('{
    "entity":"sales_daily_revenue",
    "resolvedGroupBy":"channel",
    "resolvedAggregate":{"fn":"sum","column":"clean_revenue","alias":"total"},
    "resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}
  }'::jsonb)),
  (select (count(*) * 100)::numeric from reporting.sales_daily_revenue
    where org_id = '00000000-0000-0000-0000-0000000000a1'),
  'AC-P2-RT-006: groupBy channel — per-channel sums add up to the uncapped whole');

-- ── count(*) returns the row count ─────────────────────────────────────────────────────────
select is(
  (select agg_value from mos.aggregate_compiled('{
    "entity":"sales_daily_revenue",
    "resolvedAggregate":{"fn":"count","column":"id","alias":"n"},
    "resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}
  }'::jsonb)),
  (select count(*)::numeric from reporting.sales_daily_revenue
    where org_id = '00000000-0000-0000-0000-0000000000a1'),
  'AC-P2-RT-006: count(*) returns the uncapped row count');

-- ── filter narrows the aggregate (WHERE works) ─────────────────────────────────────────────
select is(
  (select agg_value from mos.aggregate_compiled('{
    "entity":"sales_daily_revenue",
    "resolvedAggregate":{"fn":"count","column":"id","alias":"n"},
    "resolvedFilters":[{"column":"channel","op":"eq","value":"POS"}],
    "resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}
  }'::jsonb)),
  (select count(*)::numeric from reporting.sales_daily_revenue
    where org_id = '00000000-0000-0000-0000-0000000000a1' and channel = 'POS'),
  'AC-P2-RT-006: a filter narrows the aggregate to the matching subset (POS only)');

-- ── Second trust boundary: non-whitelisted entity is rejected ──────────────────────────────
select throws_ok(
  $$ select * from mos.aggregate_compiled('{"entity":"evil","resolvedAggregate":{"fn":"count","column":"id","alias":"n"}}'::jsonb) $$,
  '22023', null,
  'AC-P2-RT-006/sec: non-whitelisted entity rejected at the second trust boundary');

-- ── Second trust boundary: non-numeric aggregate column rejected ───────────────────────────
select throws_ok(
  $$ select * from mos.aggregate_compiled('{"entity":"sales_daily_revenue","resolvedAggregate":{"fn":"sum","column":"branch_name","alias":"x"},"resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}}'::jsonb) $$,
  '22023', null,
  'AC-P2-RT-006/sec: non-numeric aggregate column (branch_name) rejected');

-- ── Second trust boundary: filter column outside the allow-set is rejected ─────────────────
select throws_ok(
  $$ select * from mos.aggregate_compiled('{"entity":"sales_daily_revenue","resolvedAggregate":{"fn":"count","column":"id","alias":"n"},"resolvedFilters":[{"column":"org_id","op":"eq","value":"x"}],"resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}}'::jsonb) $$,
  '22023', null,
  'AC-P2-RT-006/sec: filter column outside the allow-set (org_id) rejected');

-- ── D7 ceiling: requiresTimeRange entity without a time range is rejected ──────────────────
select throws_ok(
  $$ select * from mos.aggregate_compiled('{"entity":"sales_daily_revenue","resolvedAggregate":{"fn":"count","column":"id","alias":"n"}}'::jsonb) $$,
  '22023', null,
  'AC-P2-RT-006/D7: sales_daily_revenue (requiresTimeRange) rejected without a resolvedTimeRange');

-- ── RLS under SECURITY INVOKER: a cross-org caller reads 0 of org A's rows ─────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}';
select is(
  (select agg_value from mos.aggregate_compiled('{
    "entity":"sales_daily_revenue",
    "resolvedAggregate":{"fn":"count","column":"id","alias":"n"},
    "resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}
  }'::jsonb)),
  0::numeric,
  'AC-P2-RT-006/RLS: a cross-org caller aggregates 0 of org A rows (SECURITY INVOKER base-table RLS)');

-- Back to org A caller for the injection-attempt suite.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';

-- ── SQL-injection guards (the first dynamic builder in the repo — exercise the value-quoting) ─
-- A crafted aggregate fn with embedded SQL must be rejected by the fn allow-set (never reach %s).
select throws_ok(
  $$ select * from mos.aggregate_compiled('{"entity":"sales_daily_revenue","resolvedAggregate":{"fn":"sum; drop table mos.tasks--","column":"clean_revenue","alias":"x"},"resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}}'::jsonb) $$,
  '22023', null,
  'AC-P2-RT-006/sec: crafted fn ("sum; drop table...") rejected — never reaches the SQL');

-- A crafted filter value with SQL metacharacters must be %L-escaped (no breakout). The value
-- "POS) OR (1=1" would widen the row set under naive string concatenation; under %L-quoting it is
-- treated as a literal channel name that matches 0 rows.
select is(
  (select agg_value from mos.aggregate_compiled('{
    "entity":"sales_daily_revenue",
    "resolvedAggregate":{"fn":"count","column":"id","alias":"n"},
    "resolvedFilters":[{"column":"channel","op":"eq","value":"POS) OR (1=1"}],
    "resolvedTimeRange":{"column":"revenue_date","from":"2025-01-01","to":"2027-01-01"}
  }'::jsonb)),
  0::numeric,
  'AC-P2-RT-006/sec: crafted value with SQL metacharacters is %L-escaped (no injection; 0 rows match the literal)');

select * from finish();
rollback;