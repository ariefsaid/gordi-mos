-- Application-catalog security contract: definer routines, views and tenant-owned tables stay fenced.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Include the internal API support schema along with the exposed application schemas.
select ok(exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prokind in ('f','p') and p.prosecdef
    and n.nspname in ('shared','mos','ops','integrations','reporting','api_v1','api_private')
), 'the application SECURITY DEFINER routine inventory is non-empty');
select is((
  select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prokind in ('f','p') and p.prosecdef
    and n.nspname in ('shared','mos','ops','integrations','reporting','api_v1','api_private')
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting where setting like 'search_path=%')
), 0, 'every application SECURITY DEFINER routine pins search_path');
select is((
  select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prokind in ('f','p') and p.prosecdef
    and n.nspname in ('shared','mos','ops','integrations','reporting','api_v1','api_private')
    and (has_function_privilege('public', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
), 0, 'no application SECURITY DEFINER routine is executable by PUBLIC or anon');

select ok(exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'v' and n.nspname in ('shared','mos','ops','integrations','reporting','api_v1','api_private')
), 'the application view inventory is non-empty');
select is((
  select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'v' and n.nspname in ('shared','mos','ops','integrations','reporting','api_v1','api_private')
    and not coalesce(c.reloptions @> array['security_invoker=true'], false)
), 0, 'every application view runs with security_invoker');

select ok(exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('shared','mos','ops','integrations','reporting','api_v1','api_private')
), 'the application table inventory is non-empty');
select is((
  select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('shared','mos','ops','integrations','reporting','api_v1','api_private')
    and (not c.relrowsecurity or not c.relforcerowsecurity)
), 0, 'every application table has enabled and forced RLS');

-- Tenant roots, migration-owned vocabularies/registries and deployment metadata are intentionally
-- global; each other application table is tenant-owned and must carry org_id.
select is((
  select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r','p')
     and n.nspname in ('shared','mos','ops','integrations','reporting','api_v1','api_private')
     and not (n.nspname, c.relname) in (
       ('shared','orgs'),
       ('shared','activities'),
       ('shared','role_capabilities'),
       ('shared','record_history_readers'),
       ('shared','agent_access_settings'),
       ('shared','deployment_stamp'),
       ('mos','module_catalog')
     )
     and not exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'org_id' and a.attnum > 0 and not a.attisdropped
     )
), 0, 'every tenant-owned business table carries the org_id seam');

select * from finish();
rollback;
