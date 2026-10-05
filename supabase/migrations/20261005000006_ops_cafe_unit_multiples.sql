-- #1345 — manager-defined multiples of the per-stream default ERP unit.
-- Café settings keep the same per-stream scope, writer predicate and RLS. ERP still owns every
-- unit coordinate; MOS stores only positive quantity factors. A capture starts on the default.
-- DOWN (manual): supabase/rollback/20261005000006_ops_cafe_unit_multiples.sql. It refuses to run
-- while manager factors or entry snapshots exist, so configured settings/history are never lost.
begin;

-- One bounded, duplicate-free factor list per stream item. A factor describes how many default
-- units one captured multiple represents (e.g. 0.5 crate = half a default crate).
create or replace function ops.cafe_unit_multiples_valid(p_factors numeric[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_factors is not null
     and coalesce(array_ndims(p_factors), 1) = 1
     and cardinality(p_factors) <= 12
     and cardinality(p_factors) = (
       select count(*)
         from unnest(p_factors) as factors(value)
        where value is not null
          and value > 0
          and value <= 10000
          and value <> 1
          and scale(value) <= 6
     )
     and cardinality(p_factors) = (
       select count(distinct value) from unnest(p_factors) as factors(value)
     )
$$;
comment on function ops.cafe_unit_multiples_valid(numeric[]) is
  'Validates the manager-owned Café factor list: at most 12 unique positive factors, excluding 1, with at most six decimal places.';
revoke execute on function ops.cafe_unit_multiples_valid(numeric[]) from public, anon;
grant execute on function ops.cafe_unit_multiples_valid(numeric[]) to authenticated, service_role;

alter table ops.cafe_item_settings
  add column unit_multiples numeric[] not null default array[]::numeric[],
  add constraint cafe_item_settings_unit_multiples_check
    check (ops.cafe_unit_multiples_valid(unit_multiples));
comment on column ops.cafe_item_settings.unit_multiples is
  'Manager-defined capture factors relative to this stream item''s default ERP detail. This does not create ERP units or conversion records.';

-- Nullable add-only history snapshots. Existing rows are deliberately left NULL and keep their
-- prior item_unit_id/qty_porsi interpretation. New rows retain typed quantity, factor and unit name.
alter table ops.kitchen_logs
  add column entry_quantity numeric(12,3),
  add column entry_unit_factor numeric,
  add column entry_unit_name text;
comment on column ops.kitchen_logs.entry_quantity is
  'Quantity typed by the capturer in the selected unit; NULL on logs written before #1345.';
comment on column ops.kitchen_logs.entry_unit_factor is
  'Snapshot factor relative to the ERP default unit. qty_porsi remains the converted default-unit quantity.';
comment on column ops.kitchen_logs.entry_unit_name is
  'Snapshot of the selected default ERP unit name; the factor identifies a manager-defined multiple.';

-- Same existing editor predicate/RLS as cafe_item_settings. A direct default change through the
-- legacy eight-argument save path cannot leave a stale factor list attached to a new unit basis.
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

  if tg_op = 'UPDATE'
     and new.default_item_unit_id is distinct from old.default_item_unit_id
     and new.unit_multiples is not distinct from old.unit_multiples then
    new.unit_multiples := array[]::numeric[];
  end if;
  if not ops.cafe_unit_multiples_valid(new.unit_multiples) then
    raise exception 'unit multiples must be unique positive factors with at most six decimal places'
      using errcode = '22023';
  end if;
  if cardinality(new.unit_multiples) > 0 and new.default_item_unit_id is null then
    raise exception 'CAFE_DEFAULT_UNIT_REQUIRED_FOR_MULTIPLES: choose a default ERP unit before adding multiples'
      using errcode = 'P0018';
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
  'Keeps stream/item identity fixed, limits settings to active ERP items, validates bounded unit multiples and clears factors when a default changes without a replacement list. SECURITY INVOKER.';

-- New RPC extends the existing eight-argument save without changing its authority or grants. The
-- compatibility function remains callable; the shared row guard clears factors if that old path
-- changes the default. New MOS clients use this overload so name/default/factors save atomically.
create or replace function ops.save_cafe_item_settings(
  p_branch_id uuid,
  p_activity text,
  p_wip_item_id uuid,
  p_mos_name text,
  p_default_item_unit_id uuid,
  p_shown_item_unit_ids uuid[],
  p_kind text,
  p_is_active boolean,
  p_unit_multiples numeric[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_erp_name text;
  v_mos_name text;
  v_setting_id uuid;
  v_unit_count integer;
begin
  if v_org_id is null or not ops.can_manage_cafe_item_settings() then
    raise exception 'not authorized to edit this Café item stream' using errcode = '42501';
  end if;
  if p_mos_name is null or btrim(p_mos_name) = '' or length(btrim(p_mos_name)) > 160 then
    raise exception 'MOS item name must contain 1 to 160 characters' using errcode = '22023';
  end if;
  if p_kind is not null and p_kind not in ('RAW', 'WIP') then
    raise exception 'kind must be RAW, WIP or NULL' using errcode = '22023';
  end if;
  p_is_active := coalesce(p_is_active, false);
  p_shown_item_unit_ids := coalesce(p_shown_item_unit_ids, array[]::uuid[]);
  p_unit_multiples := coalesce(p_unit_multiples, array[]::numeric[]);
  if not ops.cafe_unit_multiples_valid(p_unit_multiples) then
    raise exception 'unit multiples must be unique positive factors with at most six decimal places'
      using errcode = '22023';
  end if;
  if cardinality(p_unit_multiples) > 0 and p_default_item_unit_id is null then
    raise exception 'CAFE_DEFAULT_UNIT_REQUIRED_FOR_MULTIPLES: choose a default ERP unit before adding multiples'
      using errcode = '22023';
  end if;
  if exists (
    select choice.item_unit_id
      from unnest(p_shown_item_unit_ids) as choice(item_unit_id)
     group by choice.item_unit_id
    having count(*) > 1
  ) then
    raise exception 'shown ERP details must be unique' using errcode = '22023';
  end if;
  if p_default_item_unit_id is not null
     and not (p_default_item_unit_id = any(p_shown_item_unit_ids)) then
    raise exception 'CAFE_DEFAULT_UNIT_MUST_BE_SHOWN: the default ERP detail must be shown'
      using errcode = 'P0016';
  end if;

  select item.name into v_erp_name
    from ops.wip_items item
    join ops.stream_items stream_item
      on stream_item.org_id = item.org_id and stream_item.wip_item_id = item.id
   where item.org_id = v_org_id
     and item.id = p_wip_item_id
     and item.reference_source = 'erp_catalog'
     and item.flag_active
     and stream_item.branch_id = p_branch_id
     and stream_item.activity = p_activity;
  if not found then
    raise exception 'active ERP item is not on this Café stream' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_unit_count
    from ops.item_units unit
   where unit.org_id = v_org_id
     and unit.wip_item_id = p_wip_item_id
     and unit.id = any(p_shown_item_unit_ids)
     and unit.source_active
     and unit.esb_product_detail_id is not null;
  if v_unit_count <> cardinality(p_shown_item_unit_ids) then
    raise exception 'shown details must be active ERP details of this item' using errcode = '23514';
  end if;

  v_mos_name := nullif(btrim(p_mos_name), v_erp_name);
  insert into ops.cafe_item_settings
    (org_id, branch_id, activity, wip_item_id, mos_name, kind, is_active)
  values
    (v_org_id, p_branch_id, p_activity, p_wip_item_id, v_mos_name, p_kind, p_is_active)
  on conflict (org_id, branch_id, activity, wip_item_id)
  do update set
    mos_name = excluded.mos_name,
    kind = excluded.kind,
    is_active = excluded.is_active
  returning id into v_setting_id;

  insert into ops.cafe_item_setting_units (org_id, cafe_item_setting_id, item_unit_id)
  select v_org_id, v_setting_id, choice.item_unit_id
    from unnest(p_shown_item_unit_ids) as choice(item_unit_id)
   where not exists (
     select 1 from ops.cafe_item_setting_units shown
      where shown.cafe_item_setting_id = v_setting_id
        and shown.item_unit_id = choice.item_unit_id
   );

  update ops.cafe_item_settings setting
     set default_item_unit_id = p_default_item_unit_id
   where setting.id = v_setting_id
     and setting.default_item_unit_id is distinct from p_default_item_unit_id;

  update ops.cafe_item_settings setting
     set unit_multiples = p_unit_multiples
   where setting.id = v_setting_id
     and setting.unit_multiples is distinct from p_unit_multiples;

  delete from ops.cafe_item_setting_units shown
   where shown.cafe_item_setting_id = v_setting_id
     and not (shown.item_unit_id = any(p_shown_item_unit_ids));
end;
$$;
comment on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean,numeric[]) is
  'SECURITY DEFINER: atomically saves per-stream Café item settings and manager-defined factors relative to the chosen default ERP detail, after the existing same-org role check. It creates no ERP units or conversion records.';
revoke execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean,numeric[])
  from public, anon;
grant execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean,numeric[])
  to authenticated;

-- Append one view column to preserve the existing PostgREST column order.
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
  coalesce(setting.is_active, false) as is_active,
  coalesce(setting.unit_multiples, array[]::numeric[]) as unit_multiples
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
alter view ops.cafe_item_settings_read set (security_invoker = true);
comment on view ops.cafe_item_settings_read is
  'Per-stream ERP item settings read: one row per active source product detail, manager-selected default and unit multiples, MOS name falling back to the live ERP name. It exposes no ERP product or product-detail ids.';
grant select on ops.cafe_item_settings_read to authenticated;

-- Snapshot the typed count and manager factor, while item_unit_id and qty_porsi remain the ERP
-- default detail and canonical default-unit quantity. Existing logs are not backfilled or changed.
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
  v_unit_multiples numeric[] := array[]::numeric[];
  v_default_unit_name text;
  v_factor numeric;
  v_bound_at_write boolean;
  v_restart_copy boolean;
begin
  v_restart_copy := new.action = 'waste'
    and new.source = 'mos'
    and current_user = (
      select pg_catalog.pg_get_userbyid(proc.proowner)
        from pg_catalog.pg_proc proc
       where proc.oid = pg_catalog.to_regprocedure('ops.restart_cafe_waste_draft(uuid,date)')
    );

  if tg_op = 'UPDATE' and old.item_unit_id is not null
     and new.item_unit_id is distinct from old.item_unit_id then
    raise exception 'item_unit_id is immutable on a kitchen log' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
       new.entry_quantity is distinct from old.entry_quantity
    or new.entry_unit_factor is distinct from old.entry_unit_factor
    or new.entry_unit_name is distinct from old.entry_unit_name
  ) then
    raise exception 'captured entry quantity and unit metadata are immutable on a kitchen log'
      using errcode = '42501';
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
    select setting.kind, setting.is_active, setting.default_item_unit_id, setting.unit_multiples
      into v_team_kind, v_team_active, v_default_unit_id, v_unit_multiples
      from ops.cafe_item_settings setting
     where setting.org_id = new.org_id
       and setting.branch_id = new.branch_id
       and setting.activity = new.activity
       and setting.wip_item_id = new.wip_item_id;

    -- The stream guard owns kind/activation refusals and their stable contract tokens.
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
    if new.item_unit_id is distinct from v_default_unit_id then
      raise exception 'CAFE_ITEM_UNIT_NOT_SHOWN: Café capture must use the default ERP detail; select a configured multiple for another quantity'
        using errcode = 'P0015';
    end if;
    if not exists (
      select 1
        from ops.cafe_item_setting_units shown
        join ops.item_units unit
          on unit.id = shown.item_unit_id and unit.org_id = shown.org_id
       where shown.org_id = new.org_id
         and shown.item_unit_id = v_default_unit_id
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
              and setting.default_item_unit_id = v_default_unit_id
         )
    ) then
      raise exception 'CAFE_ITEM_UNIT_NOT_CONFIGURED: the default ERP detail is not available for this stream item'
        using errcode = 'P0014';
    end if;

    select unit.unit_name into v_default_unit_name
      from ops.item_units unit
     where unit.id = v_default_unit_id
       and unit.org_id = new.org_id
       and unit.wip_item_id = new.wip_item_id;

    if tg_op = 'INSERT' then
      if new.entry_quantity is null and new.entry_unit_factor is null then
        -- Older clients still mean the default unit when they send only qty_porsi.
        new.entry_quantity := new.qty_porsi;
        v_factor := 1;
      elsif new.entry_quantity is null or new.entry_unit_factor is null then
        raise exception 'entry quantity and unit factor must be supplied together' using errcode = '22023';
      else
        v_factor := new.entry_unit_factor;
      end if;
      if new.entry_quantity <= 0 or v_factor <= 0 then
        raise exception 'entry quantity and unit factor must be positive' using errcode = '22023';
      end if;
      if v_factor = 1 then
        new.entry_unit_factor := 1;
      elsif not v_restart_copy
         and not (v_factor = any(coalesce(v_unit_multiples, array[]::numeric[]))) then
        raise exception 'CAFE_UNIT_MULTIPLE_NOT_CONFIGURED: choose a multiple configured for this stream item'
          using errcode = 'P0017';
      end if;
      if not v_restart_copy or new.entry_unit_name is null then
        new.entry_unit_name := v_default_unit_name;
      end if;
      new.qty_porsi := round(new.entry_quantity * new.entry_unit_factor, 2)::numeric(12,2);
    end if;
  elsif new.source = 'mos' and v_source = 'manual' then
    -- Manual legacy items keep their explicit ERP item-unit binding, but new rows also retain a
    -- unit-name snapshot. Manager-defined factors are only available on stream-managed ERP rows.
    if new.item_unit_id is null then
      select unit.id into new.item_unit_id
        from ops.item_units unit
       where unit.org_id = new.org_id
         and unit.wip_item_id = new.wip_item_id
         and unit.is_default;
    end if;
    if tg_op = 'INSERT' then
      if new.entry_quantity is null and new.entry_unit_factor is null then
        new.entry_quantity := new.qty_porsi;
        v_factor := 1;
      elsif new.entry_quantity is null or new.entry_unit_factor is null then
        raise exception 'entry quantity and unit factor must be supplied together' using errcode = '22023';
      else
        v_factor := new.entry_unit_factor;
      end if;
      if new.entry_quantity <= 0 or v_factor <> 1 then
        raise exception 'manager-defined multiples are available only for Café ERP items' using errcode = 'P0017';
      end if;
      new.entry_unit_factor := 1;
      select unit.unit_name into new.entry_unit_name
        from ops.item_units unit
       where unit.org_id = new.org_id
         and unit.wip_item_id = new.wip_item_id
         and unit.id = new.item_unit_id;
      new.qty_porsi := round(new.entry_quantity, 2)::numeric(12,2);
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
  'Binds Café ERP logs to the stream default only; validates the selected manager-defined factor and snapshots typed quantity/factor/unit name. qty_porsi stays in the ERP default unit. Manual legacy items retain their explicit item-unit choice. SECURITY INVOKER.';
revoke execute on function ops._bind_kitchen_log_item_unit() from public, anon, authenticated;

-- Restart through the atomic RPC, carrying the immutable entry snapshot as well as canonical qty.
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
     destination_branch_id, wip_item_id, item_unit_id, qty_porsi, notes, status, source,
     entry_quantity, entry_unit_factor, entry_unit_name)
  values
    (v_log.org_id, v_log.submitted_by, v_log.business_unit_id, p_log_date, v_log.branch_id,
     v_log.activity, 'waste', null, v_log.wip_item_id, v_log.item_unit_id, v_log.qty_porsi,
     v_log.notes, 'Draft', 'mos', v_log.entry_quantity, v_log.entry_unit_factor, v_log.entry_unit_name)
  returning kitchen_logs.id into v_replacement;
  update ops.kitchen_logs set superseded_by = v_replacement where kitchen_logs.id = v_log.id;
  return query select log.id, log.log_date from ops.kitchen_logs log where log.id = v_replacement;
end;
$$;
comment on function ops.restart_cafe_waste_draft(uuid,date) is
  'Atomically replaces the current submitter''s expired photo-less waste draft, copying its exact captured entry snapshot and canonical quantity. Original facts remain; retries return the same replacement. SECURITY DEFINER.';
revoke execute on function ops.restart_cafe_waste_draft(uuid,date) from public, anon, authenticated;
grant execute on function ops.restart_cafe_waste_draft(uuid,date) to authenticated;

commit;
