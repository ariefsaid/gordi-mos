-- #1287 — team-owned per-stream kind and availability for ERP café items.
-- ERP item rows retain their legacy item-level kind only as a constrained placeholder; every
-- ERP refresh clears it. Capture and settings reads obtain kind only from cafe_item_settings.
--
-- DOWN (manual, data-preserving): export ops.cafe_item_settings.kind/is_active, then restore the
-- readers and trigger functions from 20261002000021_ops_cafe_item_settings.sql and the source,
-- refresh and stream guard from 20261002000020_ops_cafe_raw_item_references.sql, restore ERP
-- wip_items.kind from the pre-change backup (or the disabled suggestion function if the owner
-- explicitly wants its former result), then drop the two settings columns and restore the
-- wip_items.kind NOT NULL constraint. Reapply exported team settings after rollback if needed.

alter table ops.wip_items alter column kind drop not null;
alter table ops.wip_items
  drop constraint wip_items_kind_check,
  add constraint wip_items_kind_check check (
    kind in ('RAW', 'WIP') or (kind is null and reference_source = 'erp_catalog')
  );
update ops.wip_items
   set kind = null
 where reference_source = 'erp_catalog';
comment on column ops.wip_items.kind is
  'Legacy item-level kind retained for manually maintained WIP rows. ERP-catalog rows keep NULL; their kind is team-owned per stream in ops.cafe_item_settings.';

alter table ops.cafe_item_settings
  add column kind text,
  add column is_active boolean not null default false,
  add constraint cafe_item_settings_kind_check check (kind is null or kind in ('RAW', 'WIP'));
comment on column ops.cafe_item_settings.kind is
  'Team-set RAW/WIP kind for this stream item. NULL means not classified; ERP suggestions are not applied.';
comment on column ops.cafe_item_settings.is_active is
  'Whether this team offers the classified item in its applicable capture lists. New and migrated settings default inactive.';

-- Keep the prior classifier available only as a future suggestion source. Refresh and reader
-- functions below neither call it nor consume its former result.
comment on function ops.classify_cafe_item_kind(text, text, boolean, boolean, boolean) is
  'Disabled suggestion source for a possible future team-facing hint. ERP refresh and café readers do not invoke it or use its result; only an explicit future product decision may re-enable it.';

create or replace function ops.cafe_item_reference_source(p_source_rows jsonb)
returns table (
  esb_product_id text,
  esb_product_detail_id text,
  name text,
  category text,
  activity text,
  unit_name text,
  erp_category_type_name text,
  is_stock boolean,
  has_active_bom_output boolean,
  is_active boolean,
  branch_code text,
  kind text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    nullif(btrim(source.esb_product_id), ''),
    nullif(btrim(source.esb_product_detail_id), ''),
    nullif(btrim(source.name), ''),
    case upper(btrim(coalesce(source.category, '')))
      when 'KITCHEN' then 'Kitchen'
      when 'BAR' then 'Bar'
      else nullif(btrim(source.category), '')
    end,
    lower(btrim(coalesce(source.category, ''))),
    nullif(btrim(source.unit_name), ''),
    nullif(btrim(source.erp_category_type_name), ''),
    source.is_stock,
    source.has_active_bom_output,
    source.is_active,
    nullif(btrim(source.branch_code), ''),
    null::text
  from jsonb_to_recordset(p_source_rows) as source (
    esb_product_id text,
    esb_product_detail_id text,
    name text,
    category text,
    unit_name text,
    erp_category_type_name text,
    is_stock boolean,
    has_active_bom_output boolean,
    is_active boolean,
    branch_code text
  )
$$;
comment on function ops.cafe_item_reference_source(jsonb) is
  'Parses private ERP item-detail rows without classifying them. The legacy kind result is always NULL; team settings own classification.';
revoke execute on function ops.cafe_item_reference_source(jsonb)
  from public, anon, authenticated, service_role;

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
     and (source.has_active_bom_output or source.is_stock)
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

create or replace function ops.save_cafe_item_settings(
  p_branch_id uuid,
  p_activity text,
  p_wip_item_id uuid,
  p_mos_name text,
  p_default_item_unit_id uuid,
  p_shown_item_unit_ids uuid[],
  p_kind text,
  p_is_active boolean
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

  delete from ops.cafe_item_setting_units shown
   where shown.cafe_item_setting_id = v_setting_id
     and not (shown.item_unit_id = any(p_shown_item_unit_ids));
end;
$$;
comment on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean) is
  'SECURITY DEFINER: atomically saves a stream item MOS name, team-set kind and activation, default ERP detail and shown details after the existing same-org role check. History records kind/active changes on the settings row.';
revoke execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean)
  from public, anon;
grant execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[],text,boolean)
  to authenticated;

-- Preserve existing clients that only save name/unit columns while routing them through the same
-- authority and atomic mutation. They cannot write classification or activation values.
create or replace function ops.save_cafe_item_settings(
  p_branch_id uuid,
  p_activity text,
  p_wip_item_id uuid,
  p_mos_name text,
  p_default_item_unit_id uuid,
  p_shown_item_unit_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_is_active boolean;
begin
  select setting.kind, setting.is_active
    into v_kind, v_is_active
    from ops.cafe_item_settings setting
   where setting.org_id = shared.current_org_id()
     and setting.branch_id = p_branch_id
     and setting.activity = p_activity
     and setting.wip_item_id = p_wip_item_id;
  perform ops.save_cafe_item_settings(
    p_branch_id, p_activity, p_wip_item_id, p_mos_name,
    p_default_item_unit_id, p_shown_item_unit_ids, v_kind, coalesce(v_is_active, false)
  );
end;
$$;
comment on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[]) is
  'Compatibility overload for name/unit-only clients. Preserves the current team kind and active flag and delegates through the same role-checked atomic save.';
revoke execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[])
  from public, anon;
grant execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[])
  to authenticated;

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
comment on view ops.cafe_item_references is
  'ERP item-detail reader exposes the per-stream team kind and active flag; item-level ERP kind is never read. SECURITY INVOKER preserves org RLS.';
grant select on ops.cafe_item_references to authenticated, service_role;

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
  return new;
end;
$$;
comment on function ops._guard_cafe_stream_item() is
  'MOS production and plans require an active WIP item; transfers and waste accept an active team-classified RAW or WIP item. Manual legacy WIP remains active through its existing item row.';
revoke execute on function ops._guard_cafe_stream_item() from public, anon, authenticated;

create or replace view ops.capture_form_items with (security_invoker = true) as
select
  item.id as wip_item_id,
  item.name,
  item.category,
  unit.id as item_unit_id,
  unit.unit_name,
  unit.is_default,
  unit.esb_product_detail_id,
  unit.esb_product_id,
  unit.is_transferable,
  unit.source_active
from ops.wip_items item
join ops.item_units unit on unit.wip_item_id = item.id and unit.org_id = item.org_id
where item.flag_active
  and item.reference_source = 'manual'
  and item.kind = 'WIP'
  and unit.source_active
  and unit.confirmed_at is not null;
comment on view ops.capture_form_items is
  'Pre-stream read-only production list for active manually maintained WIP items only. ERP items require per-stream team kind and active settings.';
grant select on ops.capture_form_items to authenticated;

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

create or replace function ops.kitchen_stock_for_date(
  p_as_of date, p_branch_id uuid, p_activity text
)
returns table(wip_item_id uuid, usable_qty numeric(12,2), available_qty numeric(12,2))
language sql
stable
security invoker
set search_path = ''
as $$
  select
    item.id,
    coalesce(stock.usable_qty, 0)::numeric(12,2),
    available.available_qty
    from ops.wip_items item
    left join ops.kitchen_stock stock
      on stock.wip_item_id = item.id
     and stock.log_date = p_as_of
     and stock.branch_id = p_branch_id
     and stock.activity = p_activity
    cross join lateral (
      select ops.stock_available_for_date(item.id, p_as_of, p_branch_id, p_activity) as available_qty
    ) available
   where item.flag_active
     and exists (
       select 1 from ops.stream_items stream_item
        where stream_item.org_id = item.org_id
          and stream_item.wip_item_id = item.id
          and stream_item.branch_id = p_branch_id
          and stream_item.activity = p_activity
     )
     and (
       (item.reference_source = 'manual' and item.kind = 'WIP')
       or (item.reference_source = 'erp_catalog' and exists (
         select 1 from ops.cafe_item_settings setting
          where setting.org_id = item.org_id
            and setting.wip_item_id = item.id
            and setting.branch_id = p_branch_id
            and setting.activity = p_activity
            and setting.kind in ('RAW', 'WIP')
            and (setting.is_active or coalesce(stock.usable_qty, 0) <> 0 or available.available_qty <> 0)
       ))
     )
$$;
comment on function ops.kitchen_stock_for_date(date, uuid, text) is
  'Per-stream stock for active manual WIP items and active, team-classified ERP items. ERP item-level kind is never consulted.';
grant execute on function ops.kitchen_stock_for_date(date, uuid, text) to authenticated;
