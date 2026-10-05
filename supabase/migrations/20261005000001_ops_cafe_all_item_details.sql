-- #1333 — include every active ERP detail for an in-scope Café product.
--
-- DOWN (manual): restore ops.refresh_cafe_item_references(jsonb), its comment and revoke from
-- 20261004000010_ops_cafe_team_item_kind.sql. That definition filters each detail by its own
-- stock/BOM flags.

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
        or ((source.has_active_bom_output or source.is_stock)
          and (source.esb_product_id is null or source.esb_product_detail_id is null
            or source.name is null or source.unit_name is null))
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
       and (source.has_active_bom_output or source.is_stock)
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
