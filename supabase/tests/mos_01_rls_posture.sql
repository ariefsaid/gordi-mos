-- mos, squashed baseline — the RLS posture of the whole schema, plus the no-hard-delete posture.
--
-- AC-005: RLS is enabled on every table in `mos`. Asserted as a CATCH-ALL over the catalog rather
-- than against a list of table names, so a table added by a later ticket without RLS fails THIS file
-- instead of quietly sitting outside its plan. FORCE is asserted the same way and for the same
-- reason it is in `shared`: without it the table owner is exempt from its own policies, and several
-- functions in this schema run as the owner, so enabled-but-not-forced is a silent hole.
--
-- The DELETE assertion belongs here rather than in a per-feature file because it is a property of
-- the schema as a whole (NFR-002 / FR-053): removal is an archive or a soft revoke everywhere except
-- two places where a real delete is the correct verb, and those two are named. A DELETE grant that
-- appears anywhere else fails this file.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- AC-005 — no table in `mos` may lack RLS. Zero, not "all the ones we remembered".
select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relkind = 'r' and not c.relrowsecurity),
  '{}'::name[],
  'AC-005: every table in mos has row-level security ENABLED (empty = none missing)');

select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relkind = 'r' and not c.relforcerowsecurity),
  '{}'::name[],
  'AC-005: every table in mos has row-level security FORCED — the owner is not exempt');

-- The AR bridge's landing zone is a `reporting` table authored in this pass (DD-WAY-16), so its
-- posture is asserted here with the rest of the bridge rather than being left to the reporting pass.
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and c.relname = 'esb_ar_reduction'),
  'AC-005: reporting.esb_ar_reduction — the AR bridge landing zone authored in this pass — has RLS enabled AND forced');

-- ── No hard delete anywhere it is not the right verb (NFR-002, FR-053) ───────────────────────
-- mos.weekly_update_items: a line in a draft the author is still composing — deleting one is the
--   feature, and the line submit-lock closes it the moment the update is submitted.
-- mos.push_subscriptions: a browser unsubscribing. Keeping a dead endpoint forever would be a bug,
--   not an audit trail.
select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'DELETE')
      and c.relname not in ('weekly_update_items','push_subscriptions')),
  '{}'::name[],
  'NFR-002: authenticated holds DELETE on NO mos table except the two where deletion is the correct verb');

select ok(has_table_privilege('authenticated','mos.weekly_update_items','DELETE'),
  'NFR-002: ...and weekly_update_items DOES grant DELETE — removing a line from your own draft is the feature');
select ok(has_table_privilege('authenticated','mos.push_subscriptions','DELETE'),
  'NFR-002: ...and push_subscriptions DOES grant DELETE — a browser must be able to unsubscribe');

select * from finish();
rollback;
