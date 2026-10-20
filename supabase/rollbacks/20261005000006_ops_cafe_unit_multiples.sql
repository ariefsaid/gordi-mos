-- DOWN for 20261005000006_ops_cafe_unit_multiples.sql.
-- Safe only before the new settings or capture snapshots are in use. Export/clear those values
-- first; this guard prevents rolling back and silently discarding manager settings or entry history.
begin;

do $$
begin
  if exists (
    select 1 from ops.cafe_item_settings
     where cardinality(unit_multiples) > 0
  ) then
    raise exception 'cannot roll back Café unit multiples while configured factors exist; export and clear them first';
  end if;
  if exists (
    select 1 from ops.kitchen_logs
     where entry_quantity is not null
        or entry_unit_factor is not null
        or entry_unit_name is not null
  ) then
    raise exception 'cannot roll back Café unit multiples while captured entry snapshots exist; export and clear them first';
  end if;
end;
$$;

-- Restore the restart RPC from 20261005000005 before removing the snapshot columns.
create or replace function ops.restart_cafe_waste_draft(p_log_id uuid, p_log_date date)
returns table (id uuid, log_date date)
language plpgsql security definer set search_path = '' as $$
declare
  v_log ops.kitchen_logs;
  v_replacement uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cafe-waste-photo:' || p_log_id::text, 0));
  select * into v_log from ops.kitchen_logs log where log.id = p_log_id for update;
  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if v_log.org_id is distinct from shared.current_org_id()
     or v_log.submitted_by is distinct from shared.current_person_id()
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'only the waste-log submitter may restart their own draft' using errcode = '42501';
  end if;
  if v_log.action <> 'waste' or v_log.source <> 'mos' or v_log.status <> 'Draft' then
    raise exception 'waste log is not an eligible Draft' using errcode = 'P0003';
  end if;
  if v_log.superseded_by is not null then
    return query select log.id, log.log_date from ops.kitchen_logs log where log.id = v_log.superseded_by;
    return;
  end if;
  if v_log.created_at > now() - interval '15 minutes' or exists (
    select 1 from storage.objects photo where photo.bucket_id = 'waste-photos'
      and ops.cafe_waste_photo_log_id(photo.name) = v_log.id
  ) then
    raise exception 'restart requires an expired waste draft without photos' using errcode = '23514';
  end if;
  if p_log_date is null then
    raise exception 'replacement log date is required' using errcode = '22023';
  end if;
  insert into ops.kitchen_logs
    (org_id, submitted_by, business_unit_id, log_date, branch_id, activity, action,
     destination_branch_id, wip_item_id, item_unit_id, qty_porsi, notes, status, source)
  values
    (v_log.org_id, v_log.submitted_by, v_log.business_unit_id, p_log_date, v_log.branch_id,
     v_log.activity, 'waste', null, v_log.wip_item_id, v_log.item_unit_id, v_log.qty_porsi,
     v_log.notes, 'Draft', 'mos')
  returning kitchen_logs.id into v_replacement;
  update ops.kitchen_logs set superseded_by = v_replacement where kitchen_logs.id = v_log.id;
  return query select log.id, log.log_date from ops.kitchen_logs log where log.id = v_replacement;
end;
$$;
comment on function ops.restart_cafe_waste_draft(uuid,date) is
  'Atomically replaces the current submitter''s expired photo-less waste draft, copying its exact captured unit and quantity. Original facts remain; retries return the same replacement. SECURITY DEFINER.';
revoke execute on function ops.restart_cafe_waste_draft(uuid,date) from public, anon, authenticated;
grant execute on function ops.restart_cafe_waste_draft(uuid,date) to authenticated;

-- Restore the exact pre-#1345 settings reader shape.
create or replace view ops.cafe_item_settings_read with (security_invoker = true) as
select
  item.id as item_id,
  item.name as erp_name,
  coalesce(setting.mos_name, item.name) as mos_name,
  item.category,
  setting.kind,
  stream_item.branch_id,
  stream_item.activity,
  unit.id as item_unit_id,
  unit.unit_name,
  setting.default_item_unit_id,
  coalesce(setting.default_item_unit_id = unit.id, false) as unit_is_default,
  exists (
    select 1 from ops.cafe_item_setting_units shown
     where shown.org_id = setting.org_id
       and shown.cafe_item_setting_id = setting.id
       and shown.item_unit_id = unit.id
  ) as unit_is_shown,
  coalesce(setting.is_active, false) as is_active
from ops.stream_items stream_item
join ops.wip_items item
  on item.id = stream_item.wip_item_id and item.org_id = stream_item.org_id
left join ops.item_units unit
  on unit.org_id = item.org_id
 and unit.wip_item_id = item.id
 and unit.source_active
 and unit.esb_product_detail_id is not null
left join ops.cafe_item_settings setting
  on setting.org_id = item.org_id
 and setting.branch_id = stream_item.branch_id
 and setting.activity = stream_item.activity
 and setting.wip_item_id = item.id
where item.reference_source = 'erp_catalog'
  and item.flag_active;
comment on view ops.cafe_item_settings_read is
  'Per-stream ERP item settings read. NULL kind and false active are the unconfigured state; ERP item-level kind is not read.';
grant select on ops.cafe_item_settings_read to authenticated;

-- Restore the prior item-unit binder. It keeps the original rule that each shown ERP detail may
-- be selected directly and leaves manual items on their current default-unit behavior.
create or replace function ops._bind_kitchen_log_item_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item uuid;
  v_org uuid;
  v_source text;
  v_item_kind text;
  v_team_kind text;
  v_team_active boolean;
  v_default_unit_id uuid;
  v_bound_at_write boolean;
begin
  if tg_op = 'UPDATE' and old.item_unit_id is not null
     and new.item_unit_id is distinct from old.item_unit_id then
    raise exception 'item_unit_id is immutable on a kitchen log' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    v_bound_at_write := true;
  else
    v_bound_at_write := old.item_unit_id is null;
  end if;
  if not v_bound_at_write then
    return new;
  end if;

  select item.reference_source, item.kind
    into v_source, v_item_kind
    from ops.wip_items item
   where item.id = new.wip_item_id and item.org_id = new.org_id;

  if new.source = 'mos' and v_source = 'erp_catalog' then
    select setting.kind, setting.is_active, setting.default_item_unit_id
      into v_team_kind, v_team_active, v_default_unit_id
      from ops.cafe_item_settings setting
     where setting.org_id = new.org_id
       and setting.branch_id = new.branch_id
       and setting.activity = new.activity
       and setting.wip_item_id = new.wip_item_id;

    if v_team_active is distinct from true or v_team_kind is null
       or (new.action = 'produce' and v_team_kind <> 'WIP') then
      return new;
    end if;
    if v_default_unit_id is null then
      raise exception 'CAFE_ITEM_UNIT_NOT_CONFIGURED: select a shown default ERP detail before logging'
        using errcode = 'P0014';
    end if;
    if new.item_unit_id is null then
      new.item_unit_id := v_default_unit_id;
    end if;
    if not exists (
      select 1
        from ops.cafe_item_setting_units shown
        join ops.item_units unit
          on unit.id = shown.item_unit_id and unit.org_id = shown.org_id
       where shown.org_id = new.org_id
         and shown.item_unit_id = new.item_unit_id
         and unit.wip_item_id = new.wip_item_id
         and unit.source_active
         and unit.esb_product_detail_id is not null
         and exists (
           select 1 from ops.cafe_item_settings setting
            where setting.id = shown.cafe_item_setting_id
              and setting.org_id = new.org_id
              and setting.branch_id = new.branch_id
              and setting.activity = new.activity
              and setting.wip_item_id = new.wip_item_id
              and setting.is_active
              and setting.kind in ('RAW', 'WIP')
              and setting.default_item_unit_id is not null
         )
    ) then
      raise exception 'CAFE_ITEM_UNIT_NOT_SHOWN: the selected ERP detail is not shown for this stream item'
        using errcode = 'P0015';
    end if;
  elsif tg_op = 'INSERT' and new.item_unit_id is null then
    select unit.id into new.item_unit_id
      from ops.item_units unit
     where unit.org_id = new.org_id
       and unit.wip_item_id = new.wip_item_id
       and unit.is_default;
  end if;

  if new.item_unit_id is not null and v_bound_at_write then
    select unit.wip_item_id, unit.org_id into v_item, v_org
      from ops.item_units unit where unit.id = new.item_unit_id;
    if v_org is distinct from new.org_id then
      raise exception 'item_unit_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
    if v_item is distinct from new.wip_item_id then
      raise exception 'item_unit_id must reference a unit of the log''s own wip item'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._bind_kitchen_log_item_unit() is
  'Binds active team-classified ERP logs of any allowed movement to their stream default and shown detail. Manual legacy items retain their item_units default. SECURITY INVOKER.';
revoke execute on function ops._bind_kitchen_log_item_unit() from public, anon, authenticated;

-- Restore the prior settings guard (same stream/item, default-detail and role invariants).
create or replace function ops._guard_cafe_item_setting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unit_org uuid;
  v_unit_item uuid;
  v_unit_active boolean;
  v_unit_detail text;
begin
  if tg_op = 'UPDATE' and (
       new.org_id is distinct from old.org_id
    or new.branch_id is distinct from old.branch_id
    or new.activity is distinct from old.activity
    or new.wip_item_id is distinct from old.wip_item_id
  ) then
    raise exception 'stream and item identity are immutable on café item settings' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from ops.stream_items stream_item
      join ops.wip_items item on item.id = stream_item.wip_item_id and item.org_id = stream_item.org_id
     where stream_item.org_id = new.org_id
       and stream_item.branch_id = new.branch_id
       and stream_item.activity = new.activity
       and stream_item.wip_item_id = new.wip_item_id
       and item.reference_source = 'erp_catalog'
       and item.flag_active
  ) then
    raise exception 'café item settings require an active ERP item on the same stream'
      using errcode = '23514';
  end if;

  if new.mos_name is not null and (btrim(new.mos_name) = '' or length(new.mos_name) > 160) then
    raise exception 'MOS item name must contain 1 to 160 characters' using errcode = '22023';
  end if;

  if new.default_item_unit_id is not null then
    if not exists (
      select 1 from ops.cafe_item_setting_units shown
       where shown.org_id = new.org_id
         and shown.cafe_item_setting_id = new.id
         and shown.item_unit_id = new.default_item_unit_id
    ) then
      raise exception 'CAFE_DEFAULT_UNIT_MUST_BE_SHOWN: the default ERP detail must be shown'
        using errcode = 'P0016';
    end if;

    if tg_op = 'INSERT' or new.default_item_unit_id is distinct from old.default_item_unit_id then
      select unit.org_id, unit.wip_item_id, unit.source_active, unit.esb_product_detail_id
        into v_unit_org, v_unit_item, v_unit_active, v_unit_detail
        from ops.item_units unit
       where unit.id = new.default_item_unit_id;
      if v_unit_org is distinct from new.org_id
         or v_unit_item is distinct from new.wip_item_id
         or v_unit_active is distinct from true
         or v_unit_detail is null then
        raise exception 'default ERP detail must be active and belong to this item'
          using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_cafe_item_setting() is
  'Keeps stream/item identity fixed, limits settings to active ERP items, and requires every selected default to be a shown ERP detail for that item. SECURITY INVOKER.';
revoke execute on function ops._guard_cafe_item_setting() from public, anon, authenticated;

-- Remove the extended save before its helper and drop only the add-on schema.
drop function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean,numeric[]);
alter table ops.kitchen_logs
  drop column entry_unit_name,
  drop column entry_unit_factor,
  drop column entry_quantity;
alter table ops.cafe_item_settings
  drop constraint cafe_item_settings_unit_multiples_check,
  drop column unit_multiples;
drop function ops.cafe_unit_multiples_valid(numeric[]);

commit;
