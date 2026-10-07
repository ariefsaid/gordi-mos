-- supabase/seed.sample-org-esb-catalog.sql — copy the ESB Café catalog into the SAMPLE org (#1529).
--
-- Café capture reads the item's catalog row, its per-stream item list, active ERP units and the
-- stream's saved kind/availability/default/shown-unit settings. This load copies only those rows;
-- it does not copy people, transactions, history, outbox rows, receipts, plans, photos, costs,
-- purchase-order caches or manager-defined unit multiples. Source defaults are copied as stored;
-- this load never infers a default.
--
-- Target, resolved before destination rows are written: the fixed Gordi Sample org, flagged as a
-- sample org, named Gordi Sample, and with only @sample.gordi.test people. The source must be the
-- sole non-sample org with ESB-catalog products. A missing/invalid target or zero/multiple sources
-- refuses the whole call.
--
-- Re-keying and clashes: new item, unit, stream-list, settings and shown-unit ids are deterministic
-- MD5-derived UUIDs of their source row ids. An existing sample ERP item with the same ESB product
-- id is reused without edits; manual items are never treated as catalog matches. A manual item and
-- an ERP item with the same name/product code remain separate rows, with the catalog source and
-- stable row ids distinguishing them. Existing units, stream memberships, settings and shown-unit
-- rows at their natural keys are kept unchanged; missing rows are added. A pre-existing settings
-- row is extended only when its id is this load's deterministic copy id. The org's is_sample flag
-- is the row-level sample boundary; the schema has no separate per-row sample-copy marker.
--
-- Hosted usage: psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/seed.sample-org-esb-catalog.sql

create or replace function pg_temp.seed_sample_org_esb_catalog()
returns void
language plpgsql
set search_path = ''
as $$
declare
  sample_org constant uuid := '5a000000-0000-0000-0000-000000000001';
  sample_name text;
  source_org uuid;
  source_org_count integer;
begin
  select o.name into sample_name from shared.orgs o where o.id = sample_org;
  if not found
     or sample_name is distinct from 'Gordi Sample'
     or not shared.is_sample_org(sample_org)
     or not shared.is_sample_org_shape(sample_org, sample_name) then
    raise exception 'seed.sample-org-esb-catalog: refused, target is not the sample organisation'
      using errcode = '42501';
  end if;

  select count(distinct item.org_id)::integer into source_org_count
    from ops.wip_items item
   where item.reference_source = 'erp_catalog'
     and item.esb_product_id is not null
     and not shared.is_sample_org(item.org_id);
  if source_org_count <> 1 then
    raise exception 'seed.sample-org-esb-catalog: refused, expected exactly one non-sample ESB catalog source'
      using errcode = '42501';
  end if;
  select distinct item.org_id into source_org
    from ops.wip_items item
   where item.reference_source = 'erp_catalog'
     and item.esb_product_id is not null
     and not shared.is_sample_org(item.org_id);

  -- Keep target mapping stable while deriving and inserting the related rows.
  lock table shared.branches, shared.teams, ops.wip_items, ops.item_units,
             ops.stream_items, ops.cafe_item_settings, ops.cafe_item_setting_units
    in share row exclusive mode;

  create temporary table if not exists _sample_esb_item_map (
    source_item_id uuid primary key,
    target_item_id uuid not null unique,
    source_product_id text not null unique
  ) on commit drop;
  create temporary table if not exists _sample_esb_unit_map (
    source_unit_id uuid primary key,
    target_unit_id uuid not null unique,
    target_item_id uuid not null,
    source_detail_id text,
    source_unit_name text not null
  ) on commit drop;
  create temporary table if not exists _sample_esb_branch_map (
    source_branch_id uuid primary key,
    target_branch_id uuid not null unique,
    branch_code text not null
  ) on commit drop;
  create temporary table if not exists _sample_esb_setting_map (
    source_setting_id uuid primary key,
    target_setting_id uuid not null unique,
    target_item_id uuid not null,
    target_branch_id uuid not null,
    activity text not null,
    source_default_unit_id uuid,
    copy_managed boolean not null
  ) on commit drop;
  create temporary table if not exists _sample_esb_new_settings (
    setting_id uuid primary key
  ) on commit drop;
  create temporary table if not exists _sample_esb_setting_unit_map (
    source_setting_unit_id uuid primary key,
    target_setting_id uuid not null,
    target_unit_id uuid not null,
    target_id uuid not null unique
  ) on commit drop;
  create temporary table if not exists _sample_esb_stream_map (
    source_stream_id uuid primary key,
    target_item_id uuid not null,
    target_branch_id uuid not null,
    activity text not null,
    source text not null,
    target_id uuid not null unique
  ) on commit drop;

  truncate pg_temp._sample_esb_item_map, pg_temp._sample_esb_unit_map,
           pg_temp._sample_esb_branch_map, pg_temp._sample_esb_setting_map,
           pg_temp._sample_esb_new_settings, pg_temp._sample_esb_setting_unit_map,
           pg_temp._sample_esb_stream_map;

  insert into pg_temp._sample_esb_item_map (source_item_id, target_item_id, source_product_id)
  select source.id,
         coalesce(target.id, md5('sample-esb-catalog:item:' || source.id::text)::uuid),
         source.esb_product_id
    from ops.wip_items source
    left join ops.wip_items target
      on target.org_id = sample_org
     and target.reference_source = 'erp_catalog'
     and target.esb_product_id = source.esb_product_id
   where source.org_id = source_org
     and source.reference_source = 'erp_catalog'
     and source.esb_product_id is not null;

  if exists (
    select 1
      from pg_temp._sample_esb_item_map mapping
      join ops.wip_items occupied on occupied.id = mapping.target_item_id
     where occupied.org_id <> sample_org
        or occupied.reference_source <> 'erp_catalog'
        or occupied.esb_product_id is distinct from mapping.source_product_id
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, deterministic item identity is already in use'
      using errcode = '23505';
  end if;

  insert into pg_temp._sample_esb_unit_map
    (source_unit_id, target_unit_id, target_item_id, source_detail_id, source_unit_name)
  select source.id,
         coalesce(target.id, md5('sample-esb-catalog:unit:' || source.id::text)::uuid),
         item_map.target_item_id, source.esb_product_detail_id, source.unit_name
    from ops.item_units source
    join pg_temp._sample_esb_item_map item_map on item_map.source_item_id = source.wip_item_id
    left join lateral (
      select existing.id
        from ops.item_units existing
       where existing.org_id = sample_org
         and existing.wip_item_id = item_map.target_item_id
         and ((source.esb_product_detail_id is not null
               and existing.esb_product_detail_id = source.esb_product_detail_id)
           or (source.esb_product_detail_id is null
               and existing.esb_product_detail_id is null
               and existing.unit_name = source.unit_name))
       limit 1
    ) target on true
   where source.org_id = source_org;

  if exists (
    select 1
      from pg_temp._sample_esb_unit_map mapping
      join ops.item_units occupied on occupied.id = mapping.target_unit_id
     where occupied.org_id <> sample_org
        or occupied.wip_item_id <> mapping.target_item_id
        or occupied.esb_product_detail_id is distinct from mapping.source_detail_id
        or (mapping.source_detail_id is null
            and occupied.unit_name is distinct from mapping.source_unit_name)
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, deterministic unit identity is already in use'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from ops.stream_items source_stream
      join pg_temp._sample_esb_item_map item_map on item_map.source_item_id = source_stream.wip_item_id
      join shared.branches source_branch
        on source_branch.id = source_stream.branch_id and source_branch.org_id = source_stream.org_id
      where source_stream.org_id = source_org
        and not exists (
          select 1
            from shared.branches target_branch
            join shared.teams target_team
              on target_team.org_id = target_branch.org_id
             and target_team.branch_id = target_branch.id
             and target_team.activity = source_stream.activity
             and target_team.archived_at is null
           where target_branch.org_id = sample_org
             and target_branch.code = source_branch.code
             and target_branch.archived_at is null
        )
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, a source stream has no live sample-org branch and team'
      using errcode = '23514';
  end if;

  insert into pg_temp._sample_esb_branch_map (source_branch_id, target_branch_id, branch_code)
  select distinct source_branch.id, target_branch.id, source_branch.code
    from ops.stream_items source_stream
    join pg_temp._sample_esb_item_map item_map on item_map.source_item_id = source_stream.wip_item_id
    join shared.branches source_branch
      on source_branch.id = source_stream.branch_id and source_branch.org_id = source_stream.org_id
    join shared.branches target_branch
      on target_branch.org_id = sample_org
     and target_branch.code = source_branch.code
     and target_branch.archived_at is null
   where source_stream.org_id = source_org;

  insert into pg_temp._sample_esb_stream_map
    (source_stream_id, target_item_id, target_branch_id, activity, source, target_id)
  select source_stream.id, item_map.target_item_id, branch_map.target_branch_id,
         source_stream.activity, source_stream.source,
         coalesce(existing.id, md5('sample-esb-catalog:stream:' || source_stream.id::text)::uuid)
    from ops.stream_items source_stream
    join pg_temp._sample_esb_item_map item_map on item_map.source_item_id = source_stream.wip_item_id
    join pg_temp._sample_esb_branch_map branch_map on branch_map.source_branch_id = source_stream.branch_id
    left join ops.stream_items existing
      on existing.org_id = sample_org
     and existing.branch_id = branch_map.target_branch_id
     and existing.activity = source_stream.activity
     and existing.wip_item_id = item_map.target_item_id
   where source_stream.org_id = source_org;

  if exists (
    select 1
      from pg_temp._sample_esb_stream_map mapping
      join ops.stream_items occupied on occupied.id = mapping.target_id
     where occupied.org_id <> sample_org
        or occupied.branch_id <> mapping.target_branch_id
        or occupied.activity <> mapping.activity
        or occupied.wip_item_id <> mapping.target_item_id
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, deterministic stream identity is already in use'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from ops.cafe_item_settings source_setting
      join pg_temp._sample_esb_item_map item_map on item_map.source_item_id = source_setting.wip_item_id
      left join pg_temp._sample_esb_branch_map branch_map on branch_map.source_branch_id = source_setting.branch_id
     where source_setting.org_id = source_org
       and (branch_map.target_branch_id is null
         or (source_setting.default_item_unit_id is not null and not exists (
               select 1 from pg_temp._sample_esb_unit_map unit_map
                where unit_map.source_unit_id = source_setting.default_item_unit_id)))
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, a source default has no mapped stream or unit'
      using errcode = '23514';
  end if;

  insert into pg_temp._sample_esb_setting_map
    (source_setting_id, target_setting_id, target_item_id, target_branch_id,
     activity, source_default_unit_id, copy_managed)
  select source_setting.id,
         coalesce(existing.id, md5('sample-esb-catalog:setting:' || source_setting.id::text)::uuid),
         item_map.target_item_id, branch_map.target_branch_id, source_setting.activity,
         default_unit_map.target_unit_id,
         existing.id is null
           or existing.id = md5('sample-esb-catalog:setting:' || source_setting.id::text)::uuid
    from ops.cafe_item_settings source_setting
    join pg_temp._sample_esb_item_map item_map on item_map.source_item_id = source_setting.wip_item_id
    join pg_temp._sample_esb_branch_map branch_map on branch_map.source_branch_id = source_setting.branch_id
    left join pg_temp._sample_esb_unit_map default_unit_map
      on default_unit_map.source_unit_id = source_setting.default_item_unit_id
    left join ops.cafe_item_settings existing
      on existing.org_id = sample_org
     and existing.branch_id = branch_map.target_branch_id
     and existing.activity = source_setting.activity
     and existing.wip_item_id = item_map.target_item_id
   where source_setting.org_id = source_org;

  if exists (
    select 1
      from pg_temp._sample_esb_setting_map mapping
      join ops.cafe_item_settings occupied on occupied.id = mapping.target_setting_id
     where occupied.org_id <> sample_org
        or occupied.branch_id <> mapping.target_branch_id
        or occupied.activity <> mapping.activity
        or occupied.wip_item_id <> mapping.target_item_id
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, deterministic setting identity is already in use'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from ops.cafe_item_setting_units source_shown
      join ops.cafe_item_settings source_setting
        on source_setting.id = source_shown.cafe_item_setting_id
       and source_setting.org_id = source_shown.org_id
      join pg_temp._sample_esb_setting_map setting_map
        on setting_map.source_setting_id = source_setting.id
      left join pg_temp._sample_esb_unit_map unit_map
        on unit_map.source_unit_id = source_shown.item_unit_id
     where source_shown.org_id = source_org
       and unit_map.target_unit_id is null
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, a shown source unit has no mapped unit'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from ops.cafe_item_setting_units source_shown
      join ops.cafe_item_settings source_setting
        on source_setting.id = source_shown.cafe_item_setting_id
       and source_setting.org_id = source_shown.org_id
      join pg_temp._sample_esb_setting_map setting_map
        on setting_map.source_setting_id = source_setting.id
      join pg_temp._sample_esb_unit_map unit_map
        on unit_map.source_unit_id = source_shown.item_unit_id
      where source_shown.org_id = source_org
        and setting_map.target_item_id <> unit_map.target_item_id
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, a shown source unit belongs to another item'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from ops.cafe_item_settings source_setting
      join pg_temp._sample_esb_setting_map setting_map
        on setting_map.source_setting_id = source_setting.id
      join ops.cafe_item_setting_units source_shown
        on source_shown.org_id = source_setting.org_id
       and source_shown.cafe_item_setting_id = source_setting.id
      join pg_temp._sample_esb_unit_map default_map
        on default_map.source_unit_id = source_setting.default_item_unit_id
      where source_setting.org_id = source_org
        and not exists (
          select 1 from ops.cafe_item_setting_units shown_default
           where shown_default.org_id = source_shown.org_id
             and shown_default.cafe_item_setting_id = source_shown.cafe_item_setting_id
             and shown_default.item_unit_id = source_setting.default_item_unit_id
        )
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, a source default is not a shown source unit'
      using errcode = '23514';
  end if;

  insert into pg_temp._sample_esb_setting_unit_map
    (source_setting_unit_id, target_setting_id, target_unit_id, target_id)
  select source_shown.id, setting_map.target_setting_id, unit_map.target_unit_id,
         coalesce(existing.id, md5('sample-esb-catalog:setting-unit:' || source_shown.id::text)::uuid)
    from ops.cafe_item_setting_units source_shown
    join ops.cafe_item_settings source_setting
      on source_setting.id = source_shown.cafe_item_setting_id
     and source_setting.org_id = source_shown.org_id
    join pg_temp._sample_esb_setting_map setting_map
      on setting_map.source_setting_id = source_setting.id
    join pg_temp._sample_esb_unit_map unit_map
      on unit_map.source_unit_id = source_shown.item_unit_id
    left join ops.cafe_item_setting_units existing
      on existing.org_id = sample_org
     and existing.cafe_item_setting_id = setting_map.target_setting_id
     and existing.item_unit_id = unit_map.target_unit_id
   where source_shown.org_id = source_org;

  if exists (
    select 1
      from pg_temp._sample_esb_setting_unit_map mapping
      join ops.cafe_item_setting_units occupied on occupied.id = mapping.target_id
     where occupied.org_id <> sample_org
        or occupied.cafe_item_setting_id <> mapping.target_setting_id
        or occupied.item_unit_id <> mapping.target_unit_id
  ) then
    raise exception 'seed.sample-org-esb-catalog: refused, deterministic shown-unit identity is already in use'
      using errcode = '23505';
  end if;

  -- All target/source/identity checks above precede destination inserts. Every INSERT is
  -- insert-only; any later guard/FK failure rolls this function call back as one statement.
  insert into ops.wip_items
    (id, org_id, name, category, flag_active, esb_product_id, kind, reference_source,
     erp_category_type_name, has_active_bom_output)
  select item_map.target_item_id, sample_org, source.name, source.category, source.flag_active,
         source.esb_product_id, source.kind, 'erp_catalog',
         source.erp_category_type_name, source.has_active_bom_output
    from ops.wip_items source
    join pg_temp._sample_esb_item_map item_map on item_map.source_item_id = source.id
   where source.org_id = source_org
  on conflict do nothing;

  insert into ops.item_units
    (id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
     is_default, is_transferable, source_active, erp_is_stock, confirmed_at)
  select unit_map.target_unit_id, sample_org, unit_map.target_item_id, source.unit_name,
         source.esb_product_detail_id, source.esb_product_id,
         source.is_default, source.is_transferable, source.source_active,
         source.erp_is_stock, source.confirmed_at
    from ops.item_units source
    join pg_temp._sample_esb_unit_map unit_map on unit_map.source_unit_id = source.id
   where source.org_id = source_org
  on conflict do nothing;

  insert into ops.stream_items
    (id, org_id, branch_id, activity, wip_item_id, source)
  select mapping.target_id, sample_org, mapping.target_branch_id, mapping.activity,
         mapping.target_item_id, mapping.source
    from pg_temp._sample_esb_stream_map mapping
  on conflict do nothing;

  with inserted as (
    insert into ops.cafe_item_settings
      (id, org_id, branch_id, activity, wip_item_id, mos_name,
       default_item_unit_id, kind, is_active)
    select mapping.target_setting_id, sample_org, mapping.target_branch_id, mapping.activity,
           mapping.target_item_id, source.mos_name, null, source.kind, source.is_active
      from ops.cafe_item_settings source
      join pg_temp._sample_esb_setting_map mapping
        on mapping.source_setting_id = source.id
     where source.org_id = source_org
       and not exists (
         select 1 from ops.cafe_item_settings existing
          where existing.org_id = sample_org
            and existing.branch_id = mapping.target_branch_id
            and existing.activity = mapping.activity
            and existing.wip_item_id = mapping.target_item_id
       )
    on conflict do nothing
    returning id
  )
  insert into pg_temp._sample_esb_new_settings (setting_id)
  select inserted.id from inserted
  on conflict do nothing;

  insert into ops.cafe_item_setting_units
    (id, org_id, cafe_item_setting_id, item_unit_id)
  select mapping.target_id, sample_org, mapping.target_setting_id, mapping.target_unit_id
    from pg_temp._sample_esb_setting_unit_map mapping
    join pg_temp._sample_esb_setting_map setting_map
      on setting_map.target_setting_id = mapping.target_setting_id
     and setting_map.copy_managed
  on conflict do nothing;

  update ops.cafe_item_settings target
     set default_item_unit_id = mapping.source_default_unit_id
    from pg_temp._sample_esb_setting_map mapping
   where target.id = mapping.target_setting_id
     and mapping.copy_managed
     and mapping.source_default_unit_id is not null
     and (target.id in (select setting_id from pg_temp._sample_esb_new_settings)
       or (target.id = md5('sample-esb-catalog:setting:' || mapping.source_setting_id::text)::uuid
           and target.default_item_unit_id is null));
end;
$$;

select pg_temp.seed_sample_org_esb_catalog();
