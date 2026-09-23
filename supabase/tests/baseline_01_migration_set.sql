-- The squashed baseline as an artifact: what applied, in what order, and whether anything was
-- quietly excused from the suite.
--
-- OWNS: AC-004 (every migration applies, in shared → mos → ops → integrations → reporting order)
--       AC-014 (in part — the applied set is complete; the no-silent-deferral half is at the unit
--       layer, see below)
--
-- Deliberately not schema-prefixed like the other files: the subject is the migration set itself,
-- not one schema inside it. Read against the real applied ledger, wrapped in begin;...rollback; so
-- it stays read-only.
--
-- Why these two ACs needed an owner at all. Both were being treated as self-evidently true because
-- the suite ran: if a migration had failed there would be no database, and if a test had failed the
-- run would be red. That reasoning is correct today and is not a test — it holds only for as long as
-- somebody is watching the CI output, and it says nothing at all about ORDER, which is the whole
-- content of AC-004, or about a file that has been emptied rather than failed, which is the failure
-- mode AC-014's deferral valve exists to catch.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- ── AC-004: one domain-ordered set, applied ──────────────────────────────────────────────────
-- The ledger records what actually ran, so this is the applied order rather than the directory
-- listing. OD-WAY-35's whole content is that the order is DOMAIN order: shared must precede mos
-- because mos references shared's directory; ops precedes integrations because the outbox table is
-- authored in the ops pass; reporting is last because it links back to the branch catalog.
select is(
  (select count(*)::int from supabase_migrations.schema_migrations
    where version like '20260805%'),
  15,
  'AC-004: all fifteen baseline migrations are recorded as applied');

-- Additive migrations (20260806… onward, starting with #231's stream substrate) are the baseline
-- GROWING, which OD-WAY-35 expects; what it rules out is the PAST — a pre-squash version from
-- either prior chain reappearing in the ledger. So the guard is a floor, not an exact set.
select is(
  (select count(*)::int from supabase_migrations.schema_migrations
    where version < '20260805'),
  0,
  'AC-015: no pre-baseline version is applied — no file from either prior chain survives in the applied ledger');

-- Order is asserted as the sequence of domains rather than of filenames, so renaming a file is free
-- and moving one between domains is not.
select results_eq($$
  select distinct on (dom) dom
    from (
      select version,
             case
               when name like 'shared\_%'       then 'shared'
               when name like 'mos\_%'          then 'mos'
               when name like 'ops\_%'          then 'ops'
               when name like 'integrations\_%' then 'integrations'
               when name like 'reporting\_%'    then 'reporting'
             end as dom
        from supabase_migrations.schema_migrations
       where version like '20260805%'
    ) t
   order by dom, version
  $$,
  $$ VALUES ('integrations'),('mos'),('ops'),('reporting'),('shared') $$,
  'AC-004: every migration belongs to one of the five domains — none is unclassifiable, which is what a stray file would be');

select ok(
  (select max(version) filter (where name like 'shared\_%')
        < min(version) filter (where name like 'mos\_%')
      and max(version) filter (where name like 'mos\_%')
        < min(version) filter (where name like 'ops\_%')
      and max(version) filter (where name like 'ops\_%')
        < min(version) filter (where name like 'integrations\_%')
      and max(version) filter (where name like 'integrations\_%')
        < min(version) filter (where name like 'reporting\_%')
   from supabase_migrations.schema_migrations where version like '20260805%'),
  'AC-004: the domains do not interleave — shared closes before mos opens, ops before integrations, integrations before reporting');

-- AC-014's other half — that no test file has been quietly emptied or skipped rather than failed —
-- is a property of the FILES, not of the database, so it is owned at the unit layer instead:
-- mos-app/src/__tests__/baseline-migration-set.test.ts, alongside AC-015. Asserting it from inside
-- Postgres would need superuser directory reads and would still only see what was handed to psql.

select * from finish();
rollback;
