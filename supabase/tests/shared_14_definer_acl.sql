-- shared — every SECURITY DEFINER function in an exposed application schema is closed to PUBLIC and anon.
begin;
create extension if not exists pgtap with schema extensions;
create temporary table definer_acl_anon_allowlist (
  schema_name name not null,
  function_name name not null,
  identity_arguments text not null,
  reason text not null
) on commit drop;
-- The unauthenticated API role has no deliberate SECURITY DEFINER entry points today: empty.
-- An exposed function must be inserted here with its exact identity arguments and one-line reason.
-- 31 current functions plus the non-empty-enumeration guard below.
select plan(32);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('mos', 'ops', 'shared', 'integrations', 'reporting')
      and not exists (
        select 1
        from definer_acl_anon_allowlist a
        where a.schema_name = n.nspname
          and a.function_name = p.proname
          and a.identity_arguments = pg_get_function_identity_arguments(p.oid))
  ),
  'SECURITY DEFINER function enumeration is non-empty'
);

select ok(
  not has_function_privilege('public', p.oid, 'EXECUTE')
    and (
      exists (
        select 1
        from definer_acl_anon_allowlist a
        where a.schema_name = n.nspname
          and a.function_name = p.proname
          and a.identity_arguments = pg_get_function_identity_arguments(p.oid))
      or not has_function_privilege('anon', p.oid, 'EXECUTE')),
  format('%I.%I(%s) does not grant EXECUTE to public or anon',
    n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and n.nspname in ('mos', 'ops', 'shared', 'integrations', 'reporting')
order by n.nspname, p.proname, p.oid;

select * from finish();
rollback;
