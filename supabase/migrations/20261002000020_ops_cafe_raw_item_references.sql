-- #1240 — ERP-sourced café item references share the existing item, unit, stream and org seams.
-- The private-side snapshot is passed to ops.refresh_cafe_item_references(jsonb); no ERP catalog
-- values are stored in this migration or the public seed.
--
-- Classification is one named rule: an active BOM output in active Café Inventory KITCHEN/BAR
-- is WIP; another active stock product detail is RAW.
--
-- DOWN (manual; only after checking that ERP-sourced rows have no dependent logs/plans/stock):
-- restore ops._guard_cafe_stream_item, ops.capture_form_items and ops.kitchen_stock_for_date from
-- their preceding migrations; drop ops.cafe_item_references; delete ops.stream_items for imported
-- rows and imported ops.wip_items/item_units; drop the new functions, indexes and constraints;
-- restore item_units_unit_per_item_uk only after checking distinct ERP details do not share a unit label; drop item_units.source_active/erp_is_stock and the added wip_items columns.

alter table ops.wip_items
  add column if not exists kind text not null default 'WIP',
  add column if not exists reference_source text not null default 'manual',
  add column if not exists erp_category_type_name text,
  add column if not exists has_active_bom_output boolean,
  drop constraint if exists wip_items_kind_check,
  add constraint wip_items_kind_check check (kind in ('RAW', 'WIP')),
  drop constraint if exists wip_items_reference_source_check,
  add constraint wip_items_reference_source_check check (reference_source in ('manual', 'erp_catalog')),
  drop constraint if exists wip_items_raw_evidence_check,
  add constraint wip_items_raw_evidence_check check (
    kind <> 'RAW'
    or (reference_source = 'erp_catalog'
        and lower(btrim(coalesce(erp_category_type_name, ''))) = 'inventory'
        and has_active_bom_output is false)
  );

comment on table ops.wip_items is
  'Org-scoped café item catalog (legacy table name retained). kind distinguishes RAW from WIP; ops.item_units carries ERP product-detail units and ops.stream_items carries stream availability. Existing WIP records retain their kind by default.';
comment on column ops.wip_items.kind is
  'RAW/WIP classification from ops.classify_cafe_item_kind: active BOM output is WIP; another active Inventory stock product detail in KITCHEN/BAR is RAW.';
comment on column ops.wip_items.reference_source is
  'manual for existing/master-maintained items; erp_catalog for rows loaded from the private ERP item reference snapshot.';
comment on column ops.wip_items.erp_category_type_name is
  'ERP category type retained as classification evidence; Inventory scopes the rule but does not distinguish RAW from WIP.';
comment on column ops.wip_items.has_active_bom_output is
  'Whether an active ERP BOM outputs this item at the last reference refresh; combined with the source detail stock flag it drives the documented WIP/RAW rule.';

drop index if exists ops.wip_items_org_erp_raw_product_uidx;
create index if not exists wip_items_org_kind_active_idx
  on ops.wip_items (org_id, kind, name) where flag_active;
create unique index if not exists wip_items_org_erp_product_uidx
  on ops.wip_items (org_id, esb_product_id)
  where reference_source = 'erp_catalog' and esb_product_id is not null;

-- ERP product-detail id, not a MOS conversion or free-standing unit label, is the unit identity.
-- Keep legacy unlinked rows unique by name while allowing distinct ERP details to share a label.
alter table ops.item_units
  drop constraint if exists item_units_unit_per_item_uk,
  add column if not exists source_active boolean not null default true,
  add column if not exists erp_is_stock boolean;
create unique index if not exists item_units_unlinked_name_per_item_uidx
  on ops.item_units (wip_item_id, unit_name)
  where esb_product_detail_id is null;
create unique index if not exists item_units_erp_detail_per_item_uidx
  on ops.item_units (wip_item_id, esb_product_detail_id)
  where esb_product_detail_id is not null;

-- Imported ERP product details carry no MOS-selected default; normalize any earlier inferred defaults.
update ops.item_units unit
   set is_default = false
  from ops.wip_items item
 where item.id = unit.wip_item_id
   and item.org_id = unit.org_id
   and item.reference_source = 'erp_catalog'
   and unit.is_default;
comment on column ops.item_units.source_active is
  'ERP reference refresh state. Inactive source details remain for log history but are omitted from current reference and capture reads.';
comment on column ops.item_units.erp_is_stock is
  'ERP product-detail stock flag retained as source evidence; one selectable unit remains exactly one ERP product detail.';

drop function if exists ops.refresh_cafe_item_references();
drop function if exists ops.cafe_item_reference_source();
drop function if exists ops.classify_cafe_item_kind(text, boolean);

create or replace function ops.classify_cafe_item_kind(
  p_category text,
  p_category_type_name text,
  p_has_active_bom_output boolean,
  p_is_stock boolean,
  p_is_active boolean
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_is_active is distinct from true
      or upper(btrim(coalesce(p_category, ''))) not in ('KITCHEN', 'BAR')
      or lower(btrim(coalesce(p_category_type_name, ''))) <> 'inventory'
      or p_has_active_bom_output is null then null
    when p_has_active_bom_output then 'WIP'
    when p_is_stock then 'RAW'
    else null
  end
$$;
comment on function ops.classify_cafe_item_kind(text, text, boolean, boolean, boolean) is
  'Single café classification rule: an active BOM output is WIP; another active Inventory stock product detail in KITCHEN/BAR is RAW. Returns NULL outside that scope, for non-stock non-outputs, or when BOM evidence is absent.';
revoke execute on function ops.classify_cafe_item_kind(text, text, boolean, boolean, boolean)
  from public, anon, authenticated, service_role;

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
    ops.classify_cafe_item_kind(
      source.category,
      source.erp_category_type_name,
      source.has_active_bom_output,
      source.is_stock,
      source.is_active
    )
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
  'Parses caller-supplied private ERP rows into item-detail references. One source row is one ERP product detail; category supplies stream activity, optional branch_code narrows membership, and no units or conversions are synthesized.';
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
    where upper(btrim(coalesce(source.category, ''))) in ('KITCHEN', 'BAR')
      and lower(btrim(coalesce(source.erp_category_type_name, ''))) = 'inventory'
      and (source.is_active is null
        or (source.is_active is true and (
          source.has_active_bom_output is null
          or source.is_stock is null
          or ((source.has_active_bom_output is true or source.is_stock is true)
            and (source.kind is null
              or source.esb_product_id is null
              or source.esb_product_detail_id is null
              or source.name is null
              or source.unit_name is null))
        )))
  ) then
    raise exception 'active café Inventory reference rows need ERP product/detail ids, name, unit, stock and BOM evidence'
      using errcode = '23514';
  end if;

  if exists (
    select source.esb_product_detail_id
    from ops.cafe_item_reference_source(p_source_rows) source
    where source.kind is not null
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
    where source.kind is not null
    group by source.esb_product_id
    having count(distinct source.name) > 1
      or count(distinct source.kind) > 1
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
      from ops.cafe_item_reference_source(p_source_rows)
      where kind is not null
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
       select 1 from ops.cafe_item_reference_source(p_source_rows) source
       where source.kind is not null and source.esb_product_id = item.esb_product_id
     );

  with source_products as (
    select distinct on (source.esb_product_id)
      source.esb_product_id,
      source.name,
      source.category,
      source.kind,
      source.erp_category_type_name,
      source.has_active_bom_output
    from ops.cafe_item_reference_source(p_source_rows) source
    where source.kind is not null
    order by source.esb_product_id, source.esb_product_detail_id
  )
  update ops.wip_items item
     set name = source.name,
         category = source.category,
         flag_active = true,
         kind = source.kind,
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
    v_org_id, source.name, source.category, true, source.esb_product_id, source.kind, 'erp_catalog',
    source.erp_category_type_name, source.has_active_bom_output
  from ops.cafe_item_reference_source(p_source_rows) source
  where source.kind is not null
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
    kind = excluded.kind,
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
       select 1 from ops.cafe_item_reference_source(p_source_rows) source
       where source.kind is not null
         and source.esb_product_id = item.esb_product_id
         and source.esb_product_detail_id = unit.esb_product_detail_id
     );

  insert into ops.item_units (
    org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id, is_default, source_active, erp_is_stock
  )
  select distinct on (item.id, source.esb_product_detail_id)
    v_org_id, item.id, source.unit_name, source.esb_product_detail_id, source.esb_product_id, false, true, source.is_stock
  from ops.cafe_item_reference_source(p_source_rows) source
  join ops.wip_items item
    on item.org_id = v_org_id
   and item.esb_product_id = source.esb_product_id
   and item.reference_source = 'erp_catalog'
   and item.flag_active
  where source.kind is not null
  order by item.id, source.esb_product_detail_id, source.activity
  on conflict (wip_item_id, esb_product_detail_id)
    where esb_product_detail_id is not null
  do update set
    unit_name = excluded.unit_name,
    esb_product_id = excluded.esb_product_id,
    source_active = true,
    is_default = false,
    erp_is_stock = excluded.erp_is_stock;

  delete from ops.stream_items stream_item
  using ops.wip_items item
  where stream_item.wip_item_id = item.id
    and stream_item.org_id = v_org_id
    and item.org_id = v_org_id
    and item.reference_source = 'erp_catalog'
    and stream_item.source = 'esb';

  insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
  select distinct v_org_id, team.branch_id, source.activity, item.id, 'esb'
  from ops.wip_items item
  join ops.cafe_item_reference_source(p_source_rows) source
    on source.esb_product_id = item.esb_product_id
   and source.kind = item.kind
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
  on conflict (org_id, branch_id, activity, wip_item_id) do nothing;
end;
$$;
comment on function ops.refresh_cafe_item_references(jsonb) is
  'Private-side, full-snapshot refresh for the Gordi café org. Takes one row per ERP product detail, classifies through ops.classify_cafe_item_kind, preserves detail ids as unit identity, and rebuilds category/branch stream membership. A test-org override is accepted only with app.allow_test_seeds=on. It writes no MOS units, conversions, logs, plans or ERP transactions.';
revoke execute on function ops.refresh_cafe_item_references(jsonb)
  from public, anon, authenticated, service_role;

comment on table ops.stream_items is
  'The items available to a live (branch, activity) café stream. WIP membership governs production capture/planning; RAW membership is reference-only for later café inventory workflows. One item may be on many streams.';
comment on column ops.stream_items.source is
  'Provenance: esb = supplied by the private ERP item/production reference source; manual = set by an ops lead or admin. App roles may only write manual.';

create or replace function ops._guard_cafe_stream_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.source <> 'mos' or new.branch_id is null or new.activity is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (old.wip_item_id, old.branch_id, old.activity)
       is not distinct from (new.wip_item_id, new.branch_id, new.activity) then
    return new;
  end if;
  if not exists (
    select 1 from ops.wip_items item
    where item.id = new.wip_item_id and item.org_id = new.org_id and item.kind = 'WIP'
  ) then
    raise exception 'CAFE_WIP_ITEM_REQUIRED: production logs and plans require a WIP item'
      using errcode = 'P0013';
  end if;
  if not exists (
    select 1 from ops.stream_items stream_item
    where stream_item.org_id = new.org_id and stream_item.branch_id = new.branch_id
      and stream_item.activity = new.activity and stream_item.wip_item_id = new.wip_item_id
  ) then
    raise exception 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list'
      using errcode = 'P0012';
  end if;
  return new;
end;
$$;
comment on function ops._guard_cafe_stream_item() is
  'On MOS-sourced production log/plan insert or item/stream re-point, requires a WIP item (P0013) listed on that stream (P0012). RAW stream rows are reference-only; other updates and imported history pass. SECURITY INVOKER.';
revoke execute on function ops._guard_cafe_stream_item() from public, anon, authenticated;

create or replace view ops.capture_form_items as
select
  w.id       as wip_item_id,
  w.name,
  w.category,
  u.id       as item_unit_id,
  u.unit_name,
  u.is_default,
  u.esb_product_detail_id,
  u.esb_product_id,
  u.is_transferable,
  u.source_active
from ops.wip_items w
join ops.item_units u on u.wip_item_id = w.id and u.org_id = w.org_id
where w.flag_active
  and w.kind = 'WIP'
  and u.source_active
  and u.confirmed_at is not null;
alter view ops.capture_form_items set (security_invoker = true);
comment on view ops.capture_form_items is
  'The production capture form source: active, confirmed ERP product-detail units on active WIP items only. RAW items and inactive ERP details never enter production capture. SECURITY INVOKER preserves base-table RLS.';
grant select on ops.capture_form_items to authenticated;

create or replace function ops.kitchen_stock_for_date(
  p_as_of date, p_branch_id uuid, p_activity text)
returns table(wip_item_id uuid, usable_qty numeric(12,2), available_qty numeric(12,2))
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    coalesce(s.usable_qty, 0)::numeric(12,2),
    av.available_qty
  from ops.wip_items w
  left join ops.kitchen_stock s
    on s.wip_item_id = w.id
   and s.log_date = p_as_of
   and s.branch_id = p_branch_id
   and s.activity = p_activity
  cross join lateral (
    select ops.stock_available_for_date(w.id, p_as_of, p_branch_id, p_activity) as available_qty
  ) av
  where w.flag_active
    and w.kind = 'WIP'
$$;
comment on function ops.kitchen_stock_for_date(date, uuid, text) is
  'Per-date stock for every active WIP item in one production stream. RAW reference rows are excluded; stream/org scope and SECURITY INVOKER RLS are preserved.';
grant execute on function ops.kitchen_stock_for_date(date, uuid, text) to authenticated;

create or replace view ops.cafe_item_references with (security_invoker = true) as
select
  item.id as item_id,
  item.name,
  item.category,
  item.kind,
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
  unit.erp_is_stock
from ops.wip_items item
join ops.item_units unit
  on unit.wip_item_id = item.id and unit.org_id = item.org_id
join ops.stream_items stream_item
  on stream_item.wip_item_id = item.id and stream_item.org_id = item.org_id
where item.flag_active
  and unit.source_active
  and unit.esb_product_id is not null
  and unit.esb_product_detail_id is not null;
comment on view ops.cafe_item_references is
  'Read-only café item-detail references for a stream: WIP and RAW kind, ERP display unit, product/detail ids and confirmation state. SECURITY INVOKER so org RLS on all three base tables is enforced.';
grant select on ops.cafe_item_references to authenticated, service_role;
