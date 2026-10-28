-- #1873: inactive stream setup from the ESB stock detail and BOM evidence.
-- DOWN: supabase/rollbacks/20261027000200_ops_cafe_items_esb_prefill.sql.

create function ops._cafe_kind_from_esb(p_has_active_bom_output boolean)
returns text language sql immutable security invoker set search_path = '' as $$
  select case when p_has_active_bom_output is true then 'WIP'
              when p_has_active_bom_output is false then 'RAW' end;
$$;
revoke all on function ops._cafe_kind_from_esb(boolean) from public, anon, authenticated, service_role;

create table ops.cafe_item_settings_prefills (
  org_id uuid not null references shared.orgs(id) on delete cascade,
  setting_id uuid primary key,
  foreign key (org_id, setting_id) references ops.cafe_item_settings(org_id,id) on delete cascade
);
alter table ops.cafe_item_settings_prefills enable row level security;
alter table ops.cafe_item_settings_prefills force row level security;
revoke all on ops.cafe_item_settings_prefills from public, anon, authenticated, service_role;
comment on table ops.cafe_item_settings_prefills is
  'Private rollback provenance: only settings created by the ESB stream prefill.';

create function ops._rollback_cafe_item_settings_prefills()
returns void language sql security invoker set search_path = '' as $$
  delete from ops.cafe_item_settings setting using ops.cafe_item_settings_prefills prefill
   where setting.org_id=prefill.org_id and setting.id=prefill.setting_id and not setting.is_active;
$$;
revoke all on function ops._rollback_cafe_item_settings_prefills() from public, anon, authenticated, service_role;

-- Settings and shown-unit writes transfer ownership regardless of the caller's API.
create function ops._adopt_cafe_item_settings_prefill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_setting_id uuid;
begin
  if tg_table_name = 'cafe_item_settings' then
    v_org_id := new.org_id;
    v_setting_id := new.id;
  elsif tg_op = 'DELETE' then
    v_org_id := old.org_id;
    v_setting_id := old.cafe_item_setting_id;
  else
    v_org_id := new.org_id;
    v_setting_id := new.cafe_item_setting_id;
  end if;
  delete from ops.cafe_item_settings_prefills
   where org_id = v_org_id and setting_id = v_setting_id;
  return null;
end;
$$;
comment on function ops._adopt_cafe_item_settings_prefill() is
  'SECURITY DEFINER: a settings or shown-unit trigger removes private rollback provenance after a configuration change; table grants, RLS and guards authorize the originating write.';
revoke execute on function ops._adopt_cafe_item_settings_prefill()
  from public, anon, authenticated, service_role;

create trigger cafe_item_settings_adopt_prefill
  after update on ops.cafe_item_settings
  for each row when (
    (old.mos_name,old.default_item_unit_id,old.kind,old.is_active,old.unit_multiples)
    is distinct from
    (new.mos_name,new.default_item_unit_id,new.kind,new.is_active,new.unit_multiples)
  ) execute function ops._adopt_cafe_item_settings_prefill();
create trigger cafe_item_setting_units_adopt_prefill
  after insert or delete on ops.cafe_item_setting_units
  for each row execute function ops._adopt_cafe_item_settings_prefill();

create function ops.prefill_cafe_item_settings(p_org_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  candidate record;
  setting_id uuid;
  added integer := 0;
begin
  for candidate in
    select si.org_id, si.branch_id, si.activity, item.id as item_id,
           ops._cafe_kind_from_esb(item.has_active_bom_output) as kind,
           (array_agg(unit.id order by unit.id))[1] as stock_unit_id
      from ops.stream_items si
      join ops.wip_items item on item.org_id=si.org_id and item.id=si.wip_item_id
      join shared.branches branch on branch.org_id=si.org_id and branch.id=si.branch_id and branch.archived_at is null
      join ops.item_units unit on unit.org_id=item.org_id and unit.wip_item_id=item.id
        and unit.source_active and unit.erp_is_stock is true and unit.esb_product_id=item.esb_product_id
        and ops._cafe_unit_is_confirmed(item.reference_source,unit.esb_product_detail_id,unit.confirmed_at)
     where si.org_id=p_org_id and si.is_listed and si.hidden_at is null
       and si.activity in ('kitchen','bar') and item.reference_source='erp_catalog' and item.flag_active
       and exists(select 1 from shared.teams team where team.org_id=si.org_id and team.branch_id=si.branch_id
         and team.activity=si.activity and team.archived_at is null)
       and not exists(select 1 from ops.cafe_item_settings s
         where (s.org_id,s.branch_id,s.activity,s.wip_item_id)=(si.org_id,si.branch_id,si.activity,si.wip_item_id))
     group by si.org_id,si.branch_id,si.activity,item.id
    having count(unit.id)=1
  loop
    setting_id := null;
    insert into ops.cafe_item_settings(org_id,branch_id,activity,wip_item_id,kind,is_active)
    values(candidate.org_id,candidate.branch_id,candidate.activity,candidate.item_id,candidate.kind,false)
    on conflict (org_id,branch_id,activity,wip_item_id) do nothing
    returning id into setting_id;
    if setting_id is null then continue; end if;
    insert into ops.cafe_item_setting_units(org_id,cafe_item_setting_id,item_unit_id)
    values(candidate.org_id,setting_id,candidate.stock_unit_id);
    update ops.cafe_item_settings set default_item_unit_id=candidate.stock_unit_id where id=setting_id;
    -- Record provenance only after initialization so its own writes cannot adopt the row.
    insert into ops.cafe_item_settings_prefills(org_id,setting_id) values(candidate.org_id,setting_id);
    added := added+1;
  end loop;
  return added;
end;
$$;
revoke all on function ops.prefill_cafe_item_settings(uuid) from public, anon, authenticated, service_role;

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
    perform ops.prefill_cafe_item_settings(v_org);
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
  perform ops.prefill_cafe_item_settings(v_org);
  return jsonb_build_object('added',v_added,'unlisted',v_unlisted,'skipped_unmapped',v_skipped,'kept_referenced',v_kept);
end;
$$;
revoke execute on function ops.refresh_cafe_stream_items(jsonb) from public, anon, authenticated, service_role;


select ops.prefill_cafe_item_settings(id) from shared.orgs;
