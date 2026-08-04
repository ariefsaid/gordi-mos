-- shared, squashed baseline — schema presence and the RLS posture of the whole schema.
--
-- AC-005: RLS is enabled on every table in `shared`. Asserted as a CATCH-ALL over the catalog rather
-- than a list of table names, so a table added later without RLS fails this file instead of quietly
-- being outside its plan. The same holds for FORCE: without it the table owner is exempt from its
-- own policies, and several functions here run as the owner — enabled-but-not-forced is a silent
-- hole, not a lesser control.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_schema('shared',       'shared schema exists');
select has_schema('mos',          'mos schema exists');
select has_schema('ops',          'ops schema exists');
select has_schema('integrations', 'integrations schema exists');
select has_schema('reporting',    'reporting schema exists');

-- AC-005 — no table in `shared` may lack RLS. Zero, not "all the ones we remembered".
select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'shared' and c.relkind = 'r' and not c.relrowsecurity),
  '{}'::name[],
  'AC-005: every table in shared has row-level security ENABLED (empty = none missing)');

select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'shared' and c.relkind = 'r' and not c.relforcerowsecurity),
  '{}'::name[],
  'AC-005: every table in shared has row-level security FORCED — the owner is not exempt');

select * from finish();
rollback;
