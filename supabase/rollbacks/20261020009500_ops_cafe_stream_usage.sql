-- DOWN: refuses to discard visibility decisions; preserve those before rollback.
begin;
lock table ops.stream_items in share row exclusive mode;
do $$ begin
  if exists(select 1 from ops.stream_items where hidden_at is not null or not is_listed) then
    raise exception 'rollback refused: preserve stream visibility decisions first';
  end if;
end $$;
create or replace function ops.refresh_cafe_item_references(p_source_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  if p_source_rows is null or jsonb_typeof(p_source_rows) <> 'array' or jsonb_array_length(p_source_rows) = 0 then
    raise exception 'café item reference source must be a non-empty JSON array'
      using errcode = '22023';
  end if;

  if coalesce(current_setting('app.allow_test_seeds', true), '') = 'on'
     and nullif(current_setting('app.cafe_reference_test_org_id', true), '') is not null then
    v_org_id := current_setting('app.cafe_reference_test_org_id', true)::uuid;
    if not exists (select 1 from shared.orgs o where o.id = v_org_id) then
      raise exception 'test café item reference organization is missing' using errcode = '23503';
    end if;
  else
    select o.id into v_org_id from shared.orgs o where o.slug = 'gordi';
    if v_org_id is null then
      raise exception 'café item reference organization is missing' using errcode = '23503';
    end if;
  end if;

  if exists (
    select 1 from ops.cafe_item_reference_source(p_source_rows) source
    where source.activity in ('kitchen', 'bar')
      and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
      and (source.is_active is null or (source.is_active is true and (
        source.has_active_bom_output is null or source.is_stock is null
        or source.esb_product_id is null or source.esb_product_detail_id is null
        or source.name is null or source.unit_name is null
      )))
  ) then
    raise exception 'active café Inventory reference rows need ERP product/detail ids, name, unit, stock and BOM evidence'
      using errcode = '23514';
  end if;

  if exists (
    select source.esb_product_detail_id
      from ops.cafe_item_reference_source(p_source_rows) source
     where source.activity in ('kitchen', 'bar')
       and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
       and source.is_active is true
       and source.has_active_bom_output is not null
       and source.is_stock is not null
     group by source.esb_product_detail_id
    having count(distinct source.esb_product_id) > 1
        or count(distinct source.name) > 1
        or count(distinct source.unit_name) > 1
        or count(distinct source.is_stock) > 1
  ) then
    raise exception 'an ERP product detail has conflicting source identity or unit labels'
      using errcode = '23514';
  end if;

  if exists (
    select source.esb_product_id
      from ops.cafe_item_reference_source(p_source_rows) source
     where source.activity in ('kitchen', 'bar')
       and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
       and source.is_active is true
       and source.has_active_bom_output is not null
       and source.is_stock is not null
       and (source.has_active_bom_output or source.is_stock)
     group by source.esb_product_id
    having count(distinct source.name) > 1
        or count(distinct source.category) > 1
        or count(distinct source.erp_category_type_name) > 1
        or count(distinct source.has_active_bom_output) > 1
  ) then
    raise exception 'an ERP product has conflicting source classification'
      using errcode = '23514';
  end if;

  if exists (
    select source.esb_product_id
      from (
        select distinct esb_product_id
          from ops.cafe_item_reference_source(p_source_rows) parsed
         where parsed.activity in ('kitchen', 'bar')
           and lower(btrim(coalesce(parsed.erp_category_type_name, ''))) = 'inventory'
           and parsed.is_active is true
           and parsed.has_active_bom_output is not null
           and parsed.is_stock is not null
           and (parsed.has_active_bom_output or parsed.is_stock)
      ) source
      join ops.wip_items item
        on item.org_id = v_org_id and item.esb_product_id = source.esb_product_id
     where item.reference_source <> 'erp_catalog'
     group by source.esb_product_id
    having count(*) > 1
  ) then
    raise exception 'an ERP product id maps to multiple existing café items'
      using errcode = '23514';
  end if;

  update ops.wip_items item
     set flag_active = false
   where item.org_id = v_org_id
     and item.reference_source = 'erp_catalog'
     and not exists (
       select 1
         from ops.cafe_item_reference_source(p_source_rows) source
        where source.activity in ('kitchen', 'bar')
          and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
          and source.is_active is true
          and source.has_active_bom_output is not null
          and source.is_stock is not null
          and (source.has_active_bom_output or source.is_stock)
          and source.esb_product_id = item.esb_product_id
     );

  with source_products as (
    select distinct on (source.esb_product_id)
      source.esb_product_id, source.name, source.category,
      source.erp_category_type_name, source.has_active_bom_output
      from ops.cafe_item_reference_source(p_source_rows) source
     where source.activity in ('kitchen', 'bar')
       and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
       and source.is_active is true
       and source.has_active_bom_output is not null
       and source.is_stock is not null
       and (source.has_active_bom_output or source.is_stock)
     order by source.esb_product_id, source.esb_product_detail_id
  )
  update ops.wip_items item
     set name = source.name,
         category = source.category,
         flag_active = true,
         kind = null,
         reference_source = 'erp_catalog',
         erp_category_type_name = source.erp_category_type_name,
         has_active_bom_output = source.has_active_bom_output
    from source_products source
   where item.org_id = v_org_id
     and item.esb_product_id = source.esb_product_id;

  insert into ops.wip_items (
    org_id, name, category, flag_active, esb_product_id, kind, reference_source,
    erp_category_type_name, has_active_bom_output
  )
  select distinct on (source.esb_product_id)
    v_org_id, source.name, source.category, true, source.esb_product_id, null, 'erp_catalog',
    source.erp_category_type_name, source.has_active_bom_output
    from ops.cafe_item_reference_source(p_source_rows) source
   where source.activity in ('kitchen', 'bar')
     and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
     and source.is_active is true
     and source.has_active_bom_output is not null
     and source.is_stock is not null
     and (source.has_active_bom_output or source.is_stock)
     and not exists (
       select 1 from ops.wip_items item
        where item.org_id = v_org_id and item.esb_product_id = source.esb_product_id
     )
   order by source.esb_product_id, source.esb_product_detail_id
  on conflict (org_id, esb_product_id)
    where reference_source = 'erp_catalog' and esb_product_id is not null
  do update set
    name = excluded.name,
    category = excluded.category,
    flag_active = true,
    kind = null,
    erp_category_type_name = excluded.erp_category_type_name,
    has_active_bom_output = excluded.has_active_bom_output;

  update ops.item_units unit
     set source_active = false,
         is_default = false
    from ops.wip_items item
   where unit.wip_item_id = item.id
     and unit.org_id = v_org_id
     and item.org_id = v_org_id
     and item.reference_source = 'erp_catalog'
     and unit.source_active
     and not exists (
       select 1
         from ops.cafe_item_reference_source(p_source_rows) source
        where source.activity in ('kitchen', 'bar')
          and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
          and source.is_active is true
          and source.has_active_bom_output is not null
          and source.is_stock is not null
          and (source.has_active_bom_output or source.is_stock)
          and source.esb_product_id = item.esb_product_id
          and source.esb_product_detail_id = unit.esb_product_detail_id
     );

  insert into ops.item_units (
    org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
    is_default, source_active, erp_is_stock
  )
  select distinct on (item.id, source.esb_product_detail_id)
    v_org_id, item.id, source.unit_name, source.esb_product_detail_id,
    source.esb_product_id, false, true, source.is_stock
    from ops.cafe_item_reference_source(p_source_rows) source
    join ops.wip_items item
      on item.org_id = v_org_id
     and item.esb_product_id = source.esb_product_id
     and item.reference_source = 'erp_catalog'
     and item.flag_active
   where source.activity in ('kitchen', 'bar')
     and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
     and source.is_active is true
     and source.has_active_bom_output is not null
     and source.is_stock is not null
   -- The item join scopes the product; each active product detail remains its own unit.
   order by item.id, source.esb_product_detail_id, source.activity
  on conflict (wip_item_id, esb_product_detail_id)
    where esb_product_detail_id is not null
  do update set
    unit_name = excluded.unit_name,
    esb_product_id = excluded.esb_product_id,
    source_active = true,
    is_default = false,
    erp_is_stock = excluded.erp_is_stock;

  -- Keep unchanged memberships in place: cafe_item_settings references stream_items with ON DELETE
  -- CASCADE, so deleting/re-inserting the full snapshot would erase every team's saved choices.
  delete from ops.stream_items stream_item
  using ops.wip_items item
   where stream_item.wip_item_id = item.id
     and stream_item.org_id = v_org_id
     and item.org_id = v_org_id
     and item.reference_source = 'erp_catalog'
     and stream_item.source = 'esb'
     and not exists (
       select 1
         from ops.cafe_item_reference_source(p_source_rows) source
         join shared.teams team
           on team.org_id = v_org_id
          and team.activity = source.activity
          and team.branch_id = stream_item.branch_id
          and team.branch_id is not null
          and team.archived_at is null
         join shared.branches branch
           on branch.id = team.branch_id
          and branch.org_id = team.org_id
          and branch.archived_at is null
          and (source.branch_code is null or branch.code = source.branch_code)
        where source.esb_product_id = item.esb_product_id
          and source.activity = stream_item.activity
          and source.activity in ('kitchen', 'bar')
          and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
          and source.is_active is true
          and source.has_active_bom_output is not null
          and source.is_stock is not null
          and (source.has_active_bom_output or source.is_stock)
     );

  insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
  select distinct v_org_id, team.branch_id, source.activity, item.id, 'esb'
    from ops.wip_items item
    join ops.cafe_item_reference_source(p_source_rows) source
      on source.esb_product_id = item.esb_product_id
    join shared.teams team
      on team.org_id = v_org_id
     and team.activity = source.activity
     and team.branch_id is not null
     and team.archived_at is null
    join shared.branches branch
      on branch.id = team.branch_id
     and branch.org_id = team.org_id
     and branch.archived_at is null
     and (source.branch_code is null or branch.code = source.branch_code)
   where item.org_id = v_org_id
     and item.reference_source = 'erp_catalog'
     and item.flag_active
     and source.activity in ('kitchen', 'bar')
     and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
     and source.is_active is true
     and source.has_active_bom_output is not null
     and source.is_stock is not null
     and (source.has_active_bom_output or source.is_stock)
  on conflict (org_id, branch_id, activity, wip_item_id) do nothing;
end;
$$;
comment on function ops.refresh_cafe_item_references(jsonb) is
  'Private-side full-snapshot import of active Café Inventory ERP items/details and their category stream memberships. It writes no kind or activation preference; those remain team-owned in per-stream ops.cafe_item_settings. It does not call the disabled classifier.';
revoke execute on function ops.refresh_cafe_item_references(jsonb)
  from public, anon, authenticated, service_role;

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

create or replace view ops.cafe_item_references with (security_invoker = true) as
select
  item.id as item_id,
  item.name,
  item.category,
  setting.kind,
  item.erp_category_type_name,
  item.has_active_bom_output,
  stream_item.branch_id,
  stream_item.activity,
  unit.id as item_unit_id,
  unit.unit_name,
  unit.is_default,
  unit.confirmed_at,
  unit.esb_product_id,
  unit.esb_product_detail_id,
  unit.erp_is_stock,
  coalesce(setting.is_active, false) as is_active
from ops.wip_items item
join ops.item_units unit
  on unit.wip_item_id = item.id and unit.org_id = item.org_id
join ops.stream_items stream_item
  on stream_item.wip_item_id = item.id and stream_item.org_id = item.org_id
left join ops.cafe_item_settings setting
  on setting.org_id = item.org_id
 and setting.branch_id = stream_item.branch_id
 and setting.activity = stream_item.activity
 and setting.wip_item_id = item.id
where item.reference_source = 'erp_catalog'
  and item.flag_active
  and unit.source_active
  and unit.esb_product_id is not null
  and unit.esb_product_detail_id is not null;

create or replace function ops._guard_cafe_stream_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_item_kind text;
  v_stream_kind text;
  v_stream_active boolean;
  v_requires_wip boolean;
begin
  if new.source <> 'mos' then
    return new;
  end if;
  if new.branch_id is null or new.activity is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (old.wip_item_id, old.branch_id, old.activity)
       is not distinct from (new.wip_item_id, new.branch_id, new.activity) then
    return new;
  end if;

  select item.reference_source, item.kind, item.flag_active
    into v_source, v_item_kind, v_stream_active
    from ops.wip_items item
   where item.id = new.wip_item_id and item.org_id = new.org_id;
  if v_source is null or v_stream_active is distinct from true then
    raise exception 'CAFE_ITEM_NOT_ACTIVE: the item is not active in this café catalog'
      using errcode = 'P0014';
  end if;

  if not exists (
    select 1 from ops.stream_items stream_item
     where stream_item.org_id = new.org_id
       and stream_item.branch_id = new.branch_id
       and stream_item.activity = new.activity
       and stream_item.wip_item_id = new.wip_item_id
  ) then
    raise exception 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list'
      using errcode = 'P0012';
  end if;

  v_requires_wip := tg_table_name = 'kitchen_plans' or new.action = 'produce';
  if v_source = 'erp_catalog' then
    select setting.kind, setting.is_active
      into v_stream_kind, v_stream_active
      from ops.cafe_item_settings setting
     where setting.org_id = new.org_id
       and setting.branch_id = new.branch_id
       and setting.activity = new.activity
       and setting.wip_item_id = new.wip_item_id;
    if v_stream_active is distinct from true or v_stream_kind is null then
      raise exception 'CAFE_ITEM_NOT_ACTIVE: classify and activate this item for the stream before capture'
        using errcode = 'P0014';
    end if;
  else
    v_stream_kind := v_item_kind;
  end if;

  if v_requires_wip and v_stream_kind <> 'WIP' then
    raise exception 'CAFE_WIP_ITEM_REQUIRED: production logs and plans require a WIP item'
      using errcode = 'P0013';
  end if;
  if not v_requires_wip and v_stream_kind not in ('RAW', 'WIP') then
    raise exception 'CAFE_ITEM_REQUIRED: transfer and waste logs require a RAW or WIP item'
      using errcode = 'P0014';
  end if;

  return new;
end;
$$;

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

drop function ops.set_cafe_stream_item(uuid,text,uuid,boolean);
drop function ops.refresh_cafe_stream_items(jsonb);
alter table ops.stream_items drop column hidden_at, drop column is_listed;
commit;
