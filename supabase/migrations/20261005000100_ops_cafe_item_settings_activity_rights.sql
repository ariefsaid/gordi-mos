-- Café settings authority follows the manager position's activity, across every branch.
-- No live role names or assignments are inferred. Existing positions start read-only until their
-- scope is configured by privileged directory provisioning; ops_lead/admin remain cross-activity.
-- DOWN: run supabase/rollbacks/20261005000100_ops_cafe_item_settings_activity_rights.sql.
alter table shared.roles add column cafe_item_settings_scope text
  check (cafe_item_settings_scope in ('kitchen','bar','all'));
comment on column shared.roles.cafe_item_settings_scope is
  'Explicit Café item-settings authority for a manager position: kitchen, bar, or all (Ops Manager). NULL grants none. Assigned through existing person_roles; configured by privileged directory provisioning, never inferred from position names or branch membership.';

create function ops.can_manage_cafe_item_settings(p_activity text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(shared.current_org_id() is not null
    and p_activity in ('kitchen','bar')
    and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')
      or exists (
        select 1 from shared.person_roles pr join shared.roles r on r.id = pr.role_id
        where pr.person_id = shared.current_person_id()
          and pr.org_id = shared.current_org_id() and r.org_id = pr.org_id
          and (r.cafe_item_settings_scope = 'all' or r.cafe_item_settings_scope = p_activity)
      )), false)
$$;
comment on function ops.can_manage_cafe_item_settings(text) is
  'Activity-scoped Café settings writer: Kitchen/Bar manager positions cover that activity across branches; Ops Manager positions, ops leads and admins cover both. NULL or invalid activity denies. SECURITY INVOKER; RLS owns enforcement.';
revoke execute on function ops.can_manage_cafe_item_settings(text) from public, anon;
grant execute on function ops.can_manage_cafe_item_settings(text) to authenticated;

-- Preserve policy commands, roles and org predicates. Child tables obtain activity from their
-- existing FK to settings; this also covers unit multiples when that migration has landed.
do $$
declare
  p record;
  v_check text;
  v_using text;
  v_predicate text;
  v_fk_column text;
begin
  perform pg_catalog.set_config('search_path', '', true);
  for p in select policy.oid, policy.polname, policy.polrelid, ns.nspname, tbl.relname,
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expr,
      pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expr
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class tbl on tbl.oid = policy.polrelid
    join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
    where ns.nspname = 'ops' and (
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) like '%ops.can_manage_cafe_item_settings()%'
      or pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) like '%ops.can_manage_cafe_item_settings()%')
  loop
    if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid=p.polrelid and a.attname='activity' and not a.attisdropped) then
      v_predicate := 'ops.can_manage_cafe_item_settings(activity)';
    else
      select child.attname into v_fk_column
      from pg_catalog.pg_constraint fk
      join pg_catalog.pg_attribute child on child.attrelid=fk.conrelid and child.attnum=any(fk.conkey)
      where fk.conrelid=p.polrelid and fk.confrelid='ops.cafe_item_settings'::regclass
        and child.attname <> 'org_id';
      if v_fk_column is null then
        raise exception 'Café writer policy % requires an activity or settings FK', p.polname;
      end if;
      v_predicate := format('exists (select 1 from ops.cafe_item_settings permission_setting where permission_setting.id = %I.%I and permission_setting.org_id = shared.current_org_id() and ops.can_manage_cafe_item_settings(permission_setting.activity))', p.relname, v_fk_column);
    end if;
    v_using := replace(p.using_expr, 'ops.can_manage_cafe_item_settings()', v_predicate);
    v_check := replace(p.check_expr, 'ops.can_manage_cafe_item_settings()', v_predicate);
    execute format('alter policy %I on %I.%I%s%s', p.polname, p.nspname, p.relname,
      case when v_using is null then '' else ' using (' || v_using || ')' end,
      case when v_check is null then '' else ' with check (' || v_check || ')' end);
  end loop;
end;
$$;

-- Keep the writer RPC's exact name, parameters and current implementation (including multiples).
-- Only its authorization call changes, so independent additions to its body are preserved.
do $$
declare f record;
begin
  perform pg_catalog.set_config('search_path', '', true);
  for f in select proc.oid from pg_catalog.pg_proc proc join pg_catalog.pg_namespace ns on ns.oid=proc.pronamespace
    where ns.nspname='ops' and proc.proname='save_cafe_item_settings'
  loop
    execute replace(pg_catalog.pg_get_functiondef(f.oid),
      'ops.can_manage_cafe_item_settings()', 'ops.can_manage_cafe_item_settings(p_activity)');
  end loop;
end;
$$;
drop function ops.can_manage_cafe_item_settings();
