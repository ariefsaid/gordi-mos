-- supabase/seed.sample-org-item-settings.sql — prefill Café settings from confirmed ERP stock details (#1561).
--
-- This runs after the sample-org ESB catalog load. It writes only ops.cafe_item_settings and its
-- shown-detail relation ops.cafe_item_setting_units; it creates no items, units, conversions,
-- people, transactions, receipts, plans, photos, prices or outbox rows.
--
-- Kind is per stream in cafe_item_settings; the legacy ops.wip_items.kind for ERP rows remains NULL.
-- OD-CAFE-MVP-12 says the team sets each item's kind, so this load never writes a kind for the real
-- organisation. For the fixed-id Gordi Sample org ONLY, which is a test bench and not a team, kind is
-- derived as SAMPLE TEST DATA from ERP BOM evidence (DD-2026-10-07-SAMPLE-KINDS): an item that is an
-- active BOM output is WIP, an item with known no BOM output is RAW, unknown evidence stays unset.
-- A kind a manager already set is never changed (only untouched settings are writable, below).
-- The one confirmed mapping below is for units only: a unique confirmed active ESB stock detail.

-- For default unit, exactly one active item_units row must carry the item's ERP product id,
-- erp_is_stock=true, a product-detail coordinate and confirmed_at. That is the ERP-confirmed stock
-- unit; no unit name, MOS is_default flag, or other item detail is used to guess. If zero or more
-- than one such unit exists, no default is assigned. Active is filled true only when at least one
-- such confirmed stock unit exists. A row with no confirmed stock unit stays inactive and without
-- a default, so the Items page continues counting it as needing a unit.
--
-- Existing setting rows are writable only when updated_at=created_at, default is NULL, kind is
-- NULL, active is false, MOS name is inherited, multiples are empty, and there are no selected
-- shown units. The schema has no editor identity column; the timestamp plus untouched-field and
-- no-shown-unit checks are the available fail-closed signal. Any row with a manager value or a
-- later update timestamp is skipped. The default detail is inserted into the shown-unit relation
-- before assigning it, as the existing setting guard requires.
--
-- Target: the fixed-id Gordi Sample org only. It requires the fixed sample id, exact sample name,
-- sample flag and sample-address shape used by the ESB catalog load; anything else is refused and
-- nothing is written. There is deliberately no mode for the real organisation: that load needs the
-- owner's OK and its own review (a named expected org, rows created by the call only).
-- Hosted usage: psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/seed.sample-org-item-settings.sql
-- The SELECT invokes one function call: the settings writes succeed together or roll back together.

create or replace function pg_temp.prefill_cafe_item_settings()
returns void
language plpgsql
set search_path = ''
as $$
declare
  sample_org constant uuid := '5a000000-0000-0000-0000-000000000001';
  target_org uuid;
  target_name text;
begin
  -- Freeze the target shape, catalog and settings before resolving the guarded target.
  lock table shared.orgs, shared.people, ops.wip_items, ops.item_units,
             ops.stream_items, ops.cafe_item_settings, ops.cafe_item_setting_units
    in share row exclusive mode;

  select org.name into target_name
    from shared.orgs org
   where org.id = sample_org;
  if not found
     or target_name is distinct from 'Gordi Sample'
     or not shared.is_sample_org(sample_org)
     or not shared.is_sample_org_shape(sample_org, target_name) then
    raise exception 'seed.sample-org-item-settings: refused, target is not the sample organisation'
      using errcode = '42501';
  end if;
  target_org := sample_org;

  create temporary table if not exists _cafe_item_settings_prefill_candidates (
    org_id uuid not null,
    branch_id uuid not null,
    activity text not null,
    wip_item_id uuid not null,
    candidate_kind text,
    has_confirmed_stock_unit boolean not null,
    confirmed_stock_unit_id uuid,
    primary key (org_id, branch_id, activity, wip_item_id)
  ) on commit drop;
  create temporary table if not exists _cafe_item_settings_prefill_targets (
    setting_id uuid primary key,
    candidate_kind text,
    has_confirmed_stock_unit boolean not null,
    confirmed_stock_unit_id uuid
  ) on commit drop;
  truncate pg_temp._cafe_item_settings_prefill_candidates,
           pg_temp._cafe_item_settings_prefill_targets;

  insert into pg_temp._cafe_item_settings_prefill_candidates
    (org_id, branch_id, activity, wip_item_id, candidate_kind,
     has_confirmed_stock_unit, confirmed_stock_unit_id)
  with item_units as (
    select item.id as wip_item_id,
           count(unit.id) filter (
             where unit.source_active
               and unit.esb_product_id = item.esb_product_id
               and unit.esb_product_detail_id is not null
               and unit.erp_is_stock is true
               and unit.confirmed_at is not null
           )::integer as confirmed_stock_unit_count,
           (array_agg(unit.id order by unit.id) filter (
             where unit.source_active
               and unit.esb_product_id = item.esb_product_id
               and unit.esb_product_detail_id is not null
               and unit.erp_is_stock is true
               and unit.confirmed_at is not null
           ))[1] as sole_confirmed_stock_unit_id
      from ops.wip_items item
      left join ops.item_units unit
        on unit.org_id = item.org_id
       and unit.wip_item_id = item.id
     where item.org_id = target_org
     group by item.id, item.esb_product_id
  )
  select stream_item.org_id, stream_item.branch_id, stream_item.activity,
         item.id,
         -- Sample test data: a BOM output is WIP, an item with no BOM output is RAW, unknown stays unset.
         -- The real org never gets a kind from a load (the team sets it, OD-CAFE-MVP-12).
         case when item.has_active_bom_output is true then 'WIP'
              when item.has_active_bom_output is false then 'RAW' end,
         units.confirmed_stock_unit_count > 0,
         case when units.confirmed_stock_unit_count = 1
              then units.sole_confirmed_stock_unit_id end
    from ops.stream_items stream_item
    join ops.wip_items item
      on item.id = stream_item.wip_item_id
     and item.org_id = stream_item.org_id
    join item_units units on units.wip_item_id = item.id
   where stream_item.org_id = target_org
     and stream_item.activity in ('kitchen', 'bar')
     and stream_item.source = 'esb'
     and item.reference_source = 'erp_catalog'
     and item.flag_active
     and units.confirmed_stock_unit_count > 0;

  -- New rows begin at the schema's untouched baseline. Their active/default values are filled only
  -- after they have passed the same eligibility fence as an existing untouched setting.
  insert into ops.cafe_item_settings
    (org_id, branch_id, activity, wip_item_id, kind, is_active)
  select candidate.org_id, candidate.branch_id, candidate.activity,
         candidate.wip_item_id, null, false
    from pg_temp._cafe_item_settings_prefill_candidates candidate
  on conflict (org_id, branch_id, activity, wip_item_id) do nothing;

  -- Record eligible setting ids before any update changes updated_at. Existing shown selections,
  -- non-default values, or editor timestamps exclude a row from this load permanently.
  insert into pg_temp._cafe_item_settings_prefill_targets
    (setting_id, candidate_kind, has_confirmed_stock_unit, confirmed_stock_unit_id)
  select setting.id, candidate.candidate_kind, candidate.has_confirmed_stock_unit,
         candidate.confirmed_stock_unit_id
    from pg_temp._cafe_item_settings_prefill_candidates candidate
    join ops.cafe_item_settings setting
      on setting.org_id = candidate.org_id
     and setting.branch_id = candidate.branch_id
     and setting.activity = candidate.activity
     and setting.wip_item_id = candidate.wip_item_id
   where setting.updated_at = setting.created_at
     and setting.default_item_unit_id is null
     and setting.kind is null
     and not setting.is_active
     and setting.mos_name is null
     and setting.unit_multiples = array[]::numeric[]
     and not exists (
       select 1 from ops.cafe_item_setting_units shown
        where shown.org_id = setting.org_id
          and shown.cafe_item_setting_id = setting.id
     );

  -- The default must already be a shown unit for the table guard to accept it.
  insert into ops.cafe_item_setting_units
    (org_id, cafe_item_setting_id, item_unit_id)
  select setting.org_id, setting.id, target.confirmed_stock_unit_id
    from pg_temp._cafe_item_settings_prefill_targets target
    join ops.cafe_item_settings setting on setting.id = target.setting_id
   where target.confirmed_stock_unit_id is not null
  on conflict (cafe_item_setting_id, item_unit_id) do nothing;

  update ops.cafe_item_settings setting
     set kind = coalesce(setting.kind, target.candidate_kind),
         is_active = setting.is_active or target.has_confirmed_stock_unit,
         default_item_unit_id = coalesce(setting.default_item_unit_id, target.confirmed_stock_unit_id)
    from pg_temp._cafe_item_settings_prefill_targets target
   where setting.id = target.setting_id
     and (setting.kind is distinct from coalesce(setting.kind, target.candidate_kind)
       or setting.is_active is distinct from (setting.is_active or target.has_confirmed_stock_unit)
       or setting.default_item_unit_id is distinct from coalesce(setting.default_item_unit_id, target.confirmed_stock_unit_id));
end;
$$;

select pg_temp.prefill_cafe_item_settings();
