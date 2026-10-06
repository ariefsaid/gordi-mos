-- shared — function EXECUTE in the shared and API schemas is held only by the roles that need it,
-- and every function there pins its search_path.
begin;
create extension if not exists pgtap with schema extensions;

-- Run by every request role as the data API's pre-request function, anonymous requests included.
create temporary table request_role_functions (sig regprocedure primary key) on commit drop;
insert into request_role_functions values
  ('api_private.check_request()'), ('api_private.claims_carry_client_id()');

-- SECURITY DEFINER functions a signed-in caller reaches: api_v1 operations call begin_write and
-- log_write; check_request and the storage agent policy call _agent_fence.
create temporary table definers_for_authenticated (sig regprocedure primary key) on commit drop;
insert into definers_for_authenticated values
  ('api_private.begin_write(text, text)'),
  ('api_private.log_write(text, text, uuid, text)'),
  ('api_private._agent_fence(text)');

create temporary view scoped_functions as
select p.oid, n.nspname, p.oid::regprocedure as sig, p.prosecdef, p.prorettype = 'trigger'::regtype as is_trigger,
       p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('shared', 'api_private', 'api_v1')
   and p.prokind = 'f'
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

select plan(1 + (select count(*)::int * 3 from scoped_functions) + 4);

select ok((select count(*) from scoped_functions where nspname = 'shared') > 0
          and (select count(*) from scoped_functions where nspname = 'api_private') > 0,
          'shared and api_private function enumerations are non-empty');

select ok(not has_schema_privilege('anon', 'shared', 'USAGE'), 'anon has no USAGE on schema shared');

select ok(
  (select bool_and(has_function_privilege('authenticated', sig, 'EXECUTE'))
     from definers_for_authenticated),
  'signed-in callers keep EXECUTE on the definers their operations and policies call');

select ok(
  (select bool_and(has_function_privilege(r, f.sig, 'EXECUTE'))
     from request_role_functions f, unnest(array['anon', 'authenticated', 'service_role']) r),
  'every request role can run the pre-request function');

-- check_request reads the request schema from the caller's search_path, so it cannot pin its own;
-- every name in its body is schema-qualified instead.
select ok(
  pg_get_functiondef('api_private.check_request()'::regprocedure) !~ '[^.a-z_](_agent_fence|current_setting|jsonb_exists|btrim|split_part)\(',
  'api_private.check_request qualifies every function it calls');

-- No PUBLIC or anon EXECUTE outside the pre-request functions.
select ok(
  not has_function_privilege('public', f.oid, 'EXECUTE')
    and (f.sig in (select sig from request_role_functions) or not has_function_privilege('anon', f.oid, 'EXECUTE')),
  format('%s grants EXECUTE to neither public nor anon', f.sig))
from scoped_functions f
order by f.sig::text;

-- API definers: authenticated only where listed above (shared definers are the app's own RPCs,
-- each granted in its migration). API invoker helpers, and every shared invoker function a row
-- policy calls: authenticated, which operations and policies run as. Other shared invoker functions
-- are internal (called by definers and triggers) and need no grant.
select ok(
  case
    when f.prosecdef and f.nspname = 'shared' then true
    when f.prosecdef then
      has_function_privilege('authenticated', f.oid, 'EXECUTE') = (f.sig in (select sig from definers_for_authenticated))
    when f.nspname <> 'shared' then has_function_privilege('authenticated', f.oid, 'EXECUTE')
    when exists (
      select 1 from pg_policies pol
       where coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~ ('shared\.' || p.proname || '\(')
    ) then has_function_privilege('authenticated', f.oid, 'EXECUTE')
    else true
  end,
  format('%s: authenticated holds EXECUTE exactly when a signed-in path needs it', f.sig))
from scoped_functions f
join pg_proc p on p.oid = f.oid
order by f.sig::text;

select ok(
  f.sig = 'api_private.check_request()'::regprocedure
    or exists (select 1 from unnest(f.proconfig) c where c like 'search_path=%'),
  format('%s pins its search_path', f.sig))
from scoped_functions f
order by f.sig::text;

select * from finish();
rollback;
