-- Restore membership writers before removing the prefill helper and its created settings.
create or replace function ops.set_cafe_stream_item(p_branch_id uuid, p_activity text, p_wip_item_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := shared.current_org_id();
begin
  if v_org is null or not shared.is_org_member()
     or not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'not authorized to manage stream items' using errcode = '42501';
  end if;
  if p_hidden is null or not exists (
    select 1 from ops.wip_items item
    join shared.teams team on team.org_id = item.org_id and team.branch_id = p_branch_id
      and team.activity = p_activity and team.archived_at is null
    join shared.branches branch on branch.id = team.branch_id and branch.org_id = team.org_id and branch.archived_at is null
    where item.org_id = v_org and item.id = p_wip_item_id and item.flag_active
      and item.reference_source = 'erp_catalog' and lower(btrim(item.category)) = p_activity
  ) then
    raise exception 'active same-org catalog item and matching live stream required' using errcode = '23514';
  end if;
  if p_hidden then
    update ops.stream_items set hidden_at = coalesce(hidden_at, now())
     where org_id = v_org and branch_id = p_branch_id and activity = p_activity and wip_item_id = p_wip_item_id;
    if not found then raise exception 'stream item not found' using errcode = 'P0002'; end if;
  else
    insert into ops.stream_items(org_id, branch_id, activity, wip_item_id, source)
    values(v_org, p_branch_id, p_activity, p_wip_item_id, 'manual')
    on conflict (org_id, branch_id, activity, wip_item_id)
    do update set hidden_at = null, is_listed = true, source = 'manual';
  end if;
end;
$$;
revoke execute on function ops.set_cafe_stream_item(uuid,text,uuid,boolean) from public, anon, service_role;
grant execute on function ops.set_cafe_stream_item(uuid,text,uuid,boolean) to authenticated;

create or replace function ops.refresh_cafe_stream_items(p_usage jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_skipped integer;
  v_added integer;
  v_unlisted integer;
  v_kept jsonb;
begin
  if p_usage is null or jsonb_typeof(p_usage) <> 'array' then
    raise exception 'usage must be a JSON array' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_usage) entry where jsonb_typeof(entry) <> 'object'
    or nullif(btrim(entry->>'esb_product_id'),'') is null or nullif(btrim(entry->>'branch_code'),'') is null) then
    raise exception 'usage rows require product and branch codes' using errcode = '22023';
  end if;
  if coalesce(current_setting('app.allow_test_seeds', true), '') = 'on'
     and nullif(current_setting('app.cafe_reference_test_org_id', true), '') is not null then
    v_org := current_setting('app.cafe_reference_test_org_id', true)::uuid;
  else
    select id into v_org from shared.orgs where slug = 'gordi';
  end if;
  if v_org is null or not exists(select 1 from shared.orgs where id = v_org) then
    raise exception 'café item reference organization is missing' using errcode = '23503';
  end if;
  -- Serialize membership edits and reconciliation without changing any reference or FK.
  lock table ops.stream_items in share row exclusive mode;
  select count(*)::int into v_skipped from jsonb_to_recordset(p_usage) as usage(esb_product_id text, branch_code text)
   where not exists(select 1 from shared.branches branch where branch.org_id = v_org and branch.code = usage.branch_code and branch.archived_at is null);

  insert into ops.stream_items(org_id, branch_id, activity, wip_item_id, source)
  select distinct v_org, branch.id, team.activity, item.id, 'esb'
    from jsonb_to_recordset(p_usage) as usage(esb_product_id text, branch_code text)
    join shared.branches branch on branch.org_id = v_org and branch.code = usage.branch_code and branch.archived_at is null
    join ops.wip_items item on item.org_id = v_org and item.esb_product_id = usage.esb_product_id
      and item.reference_source = 'erp_catalog' and item.flag_active
    join shared.teams team on team.org_id = v_org and team.branch_id = branch.id
      and team.activity = lower(btrim(item.category)) and team.activity in ('kitchen','bar') and team.archived_at is null
  on conflict (org_id, branch_id, activity, wip_item_id) do nothing;
  get diagnostics v_added = row_count;

  select coalesce(jsonb_agg(jsonb_build_object('branch_id', si.branch_id, 'activity', si.activity, 'item_id', si.wip_item_id)), '[]') into v_kept
    from ops.stream_items si
    join ops.wip_items item on item.id = si.wip_item_id and item.org_id = si.org_id
    join shared.branches branch on branch.id = si.branch_id and branch.org_id = si.org_id
   where si.org_id = v_org and si.source = 'esb'
     and not exists(select 1 from jsonb_to_recordset(p_usage) as usage(esb_product_id text, branch_code text)
       where usage.esb_product_id = item.esb_product_id and usage.branch_code = branch.code)
     and (exists(select 1 from ops.cafe_item_settings setting where (setting.org_id,setting.branch_id,setting.activity,setting.wip_item_id) = (si.org_id,si.branch_id,si.activity,si.wip_item_id))
       or exists(select 1 from ops.cafe_count_lines count_line where (count_line.org_id,count_line.branch_id,count_line.activity,count_line.wip_item_id) = (si.org_id,si.branch_id,si.activity,si.wip_item_id)));

  update ops.stream_items si set is_listed = (
      exists(select 1 from jsonb_to_recordset(p_usage) as usage(esb_product_id text, branch_code text)
        join ops.wip_items item on item.org_id = v_org and item.esb_product_id = usage.esb_product_id and item.flag_active
          and lower(btrim(item.category)) = si.activity
        join shared.branches branch on branch.org_id = v_org and branch.code = usage.branch_code and branch.archived_at is null
        join shared.teams team on team.org_id = v_org and team.branch_id = branch.id and team.activity = si.activity and team.archived_at is null
        where item.id = si.wip_item_id and branch.id = si.branch_id)
      or exists(select 1 from ops.cafe_item_settings setting where (setting.org_id,setting.branch_id,setting.activity,setting.wip_item_id) = (si.org_id,si.branch_id,si.activity,si.wip_item_id))
      or exists(select 1 from ops.cafe_count_lines count_line where (count_line.org_id,count_line.branch_id,count_line.activity,count_line.wip_item_id) = (si.org_id,si.branch_id,si.activity,si.wip_item_id))
    ) where si.org_id = v_org and si.source = 'esb';
  select count(*)::int into v_unlisted from ops.stream_items where org_id = v_org and source = 'esb' and not is_listed;
  return jsonb_build_object('added',v_added,'unlisted',v_unlisted,'skipped_unmapped',v_skipped,'kept_referenced',v_kept);
end;
$$;
revoke execute on function ops.refresh_cafe_stream_items(jsonb) from public, anon, authenticated, service_role;


select ops._rollback_cafe_item_settings_prefills();
drop function ops._rollback_cafe_item_settings_prefills();
drop function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean,numeric[]);
alter function ops._save_cafe_item_settings_before_prefill_ownership(uuid,text,uuid,text,uuid,uuid[],text,boolean,numeric[])
  rename to save_cafe_item_settings;
revoke execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean,numeric[])
  from public, anon, service_role;
grant execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean,numeric[])
  to authenticated;
drop table ops.cafe_item_settings_prefills;
drop function ops.prefill_cafe_item_settings(uuid);
drop function ops._cafe_kind_from_esb(boolean);
