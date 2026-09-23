-- reporting, squashed baseline — the posture every table in the schema has to hold (AC-005).
--
-- Written as SET assertions over the catalog rather than one line per table, on purpose: a per-table
-- list proves the tables that were remembered, and the failure this guards against is a SEVENTH
-- table arriving later with no RLS. The table list is pinned separately, so adding one is a
-- deliberate act that shows up here rather than a silent gap.
--
-- reporting.esb_ar_reduction is in this schema and was NOT authored by this ticket — the `mos` pass
-- created it, deliberately, because a mos view reads it and Postgres validates view references at
-- creation time. It is held to the same posture here anyway: the bar is "every table in reporting",
-- not "every table this ticket wrote".
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- ── The set of tables, pinned ────────────────────────────────────────────────────────────────
select tables_are('reporting', array[
  'sales_daily_revenue',
  'sales_margin_daily',
  'ingredient_cost_lines',
  'bom_lines',
  'supervisor_revenue_scope',
  'esb_ar_reduction'
], 'reporting holds exactly these six tables — a seventh has to be added here before it can hide from the assertions below');

-- ── AC-005: RLS enabled AND forced on every one of them ──────────────────────────────────────
select is(
  (select count(*)::int
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and c.relkind = 'r'
      and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 'AC-005: every table in reporting has row-level security ENABLED and FORCED — no exceptions, counted from the catalog');

-- A table with RLS enabled and no policy is fail-closed, which is safe but is never what was meant:
-- it means a policy was forgotten, and the surface reads empty for everyone including finance.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  0, 'every table in reporting carries at least one policy — RLS with no policy is a forgotten gate, not a closed one');

-- ── The privilege floor: no end-user write path exists anywhere in the schema ────────────────
-- This is the gate that denies BEFORE any policy is consulted, which is why it is asserted
-- separately from the policies. If it holds, no policy has to be trusted to refuse a write.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['INSERT','UPDATE','DELETE']) as priv
    where n.nspname = 'reporting' and c.relkind = 'r'
      and c.relname <> 'supervisor_revenue_scope'
      and has_table_privilege('authenticated', c.oid, priv)),
  0, 'no INSERT, UPDATE or DELETE privilege on any snapshot table for authenticated — the read-models are read-only to every app session');

-- The scope table is the one exception and its shape is exact: add and remove a grant, never edit
-- one. An UPDATE privilege here would let a grant be re-pointed with nothing to show for it.
select ok(
  has_table_privilege('authenticated','reporting.supervisor_revenue_scope','INSERT')
  and has_table_privilege('authenticated','reporting.supervisor_revenue_scope','DELETE')
  and not has_table_privilege('authenticated','reporting.supervisor_revenue_scope','UPDATE'),
  'the scope table takes INSERT and DELETE but never UPDATE — a grant is added or removed, never quietly re-pointed');

select is(
  (select count(*)::int from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and p.polcmd = 'w'),
  0, 'not one UPDATE policy exists in the whole schema — belt and braces with the missing privilege above');

-- ── Snapshot grain: the upsert key IS the primary key ────────────────────────────────────────
-- The snapshot job upserts on conflict. If the PK were wider or narrower than the grain the
-- warehouse emits, a nightly run would either duplicate a day or overwrite one branch with another.
select col_is_pk('reporting','sales_daily_revenue',
  array['org_id','revenue_date','channel','esb_code','branch_code'],
  'revenue upserts on org/date/channel/ESB code/branch code — the warehouse''s own grain');
select col_is_pk('reporting','sales_margin_daily',
  array['org_id','margin_date','esb_code','branch_code'],
  'margin upserts on org/date/ESB code/branch code — no channel, because COGS has no channel dimension upstream');
select col_is_pk('reporting','ingredient_cost_lines',
  array['org_id','ingredient_esb_code'],
  'one current cost line per ingredient per org');
select col_is_pk('reporting','bom_lines',
  array['org_id','menu_item_esb_code','ingredient_esb_code'],
  'one recipe line per (menu item, ingredient) per org');

-- The link column must never join the key. Were branch_id part of the primary key, mapping a row by
-- hand would change its identity and the next snapshot would insert a duplicate beside it.
select ok(
  not exists (
    select 1 from pg_index i
     where i.indrelid = 'reporting.sales_daily_revenue'::regclass and i.indisprimary
       and (select attnum from pg_attribute
             where attrelid = i.indrelid and attname = 'branch_id') = any(i.indkey::smallint[])),
  'branch_id is NOT part of the revenue primary key — mapping a row by hand must not change its identity and split it from the next snapshot');

select * from finish();
rollback;
