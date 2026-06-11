begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- RLS enabled on every shared business table (directory). 5 tables.
select ok(c.relrowsecurity, format('RLS enabled on shared.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='shared' and c.relname in ('orgs','business_units','roles','people','person_roles')
order by c.relname;

-- RLS FORCED on every shared business table (owner not exempt). 5 tables.
select ok(c.relforcerowsecurity, format('RLS forced on shared.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='shared' and c.relname in ('orgs','business_units','roles','people','person_roles')
order by c.relname;

select * from finish();
rollback;
