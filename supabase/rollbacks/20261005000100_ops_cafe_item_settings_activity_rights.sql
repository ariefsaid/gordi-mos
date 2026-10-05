-- Manual rollback of the activity-scoped Café settings authority. Restores the prior writer rule
-- while keeping item settings, units, multiples and history intact. Drops the role scope data.
begin;

create or replace function ops.can_manage_cafe_item_settings()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.current_org_id() is not null
     and (
       shared.has_access_role('ops_lead')
       or shared.has_access_role('admin')
       or (
         shared.has_access_role('manager')
         and exists (
           select 1
             from shared.person_roles pr
             join shared.roles r on r.id = pr.role_id
             join shared.business_units bu on bu.id = r.business_unit_id
            where pr.person_id = shared.current_person_id()
              and pr.org_id = shared.current_org_id()
              and r.org_id = pr.org_id
              and bu.org_id = r.org_id
              and bu.code = 'retail_ops'
         )
       )
     )
$$;
comment on function ops.can_manage_cafe_item_settings() is
  'Café item-settings writer: Retail Ops managers, ops leads and admins, independent of capture stream. The app affordance is not the authority; RLS calls this role predicate.';
revoke execute on function ops.can_manage_cafe_item_settings() from public, anon;
grant execute on function ops.can_manage_cafe_item_settings() to authenticated;

do $$
declare p record; f record;
begin
  perform pg_catalog.set_config('search_path', '', true);
  for p in select policy.polname, ns.nspname, tbl.relname,
      pg_catalog.pg_get_expr(policy.polqual,policy.polrelid) as using_expr,
      pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid) as check_expr
    from pg_catalog.pg_policy policy join pg_catalog.pg_class tbl on tbl.oid=policy.polrelid
    join pg_catalog.pg_namespace ns on ns.oid=tbl.relnamespace
    where ns.nspname='ops' and (pg_catalog.pg_get_expr(policy.polqual,policy.polrelid) like '%ops.can_manage_cafe_item_settings(%'
      or pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid) like '%ops.can_manage_cafe_item_settings(%')
  loop
    execute format('alter policy %I on %I.%I%s%s',p.polname,p.nspname,p.relname,
      case when p.using_expr is null then '' else ' using (' || regexp_replace(p.using_expr,'ops\.can_manage_cafe_item_settings\([^)]*\)','ops.can_manage_cafe_item_settings()','g') || ')' end,
      case when p.check_expr is null then '' else ' with check (' || regexp_replace(p.check_expr,'ops\.can_manage_cafe_item_settings\([^)]*\)','ops.can_manage_cafe_item_settings()','g') || ')' end);
  end loop;
  for f in select proc.oid from pg_catalog.pg_proc proc join pg_catalog.pg_namespace ns on ns.oid=proc.pronamespace
    where ns.nspname='ops' and proc.proname='save_cafe_item_settings'
  loop
    execute replace(pg_catalog.pg_get_functiondef(f.oid),'ops.can_manage_cafe_item_settings(p_activity)','ops.can_manage_cafe_item_settings()');
  end loop;
end;
$$;
drop function ops.can_manage_cafe_item_settings(text);
alter table shared.roles drop column cafe_item_settings_scope;

commit;
