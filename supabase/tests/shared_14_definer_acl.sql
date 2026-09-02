-- shared — every SECURITY DEFINER function in an exposed application schema is closed to PUBLIC.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select ok(
  not has_function_privilege('public', p.oid, 'EXECUTE'),
  format('%I.%I(%s) does not grant EXECUTE to public',
    n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and n.nspname in ('mos', 'ops', 'shared', 'integrations', 'reporting')
order by n.nspname, p.proname, p.oid;

select * from finish();
rollback;
