-- Café item settings (#1242): one MOS name and one selected ERP-detail set per stream item.
-- ERP rows remain the product/unit source. This migration adds no product details or conversions.
--
-- DOWN (manual): first restore ops.approve_kitchen_log(uuid,text) verbatim from
-- 20260811000001_ops_review_scoping.sql and ops._bind_kitchen_log_item_unit() verbatim from
-- 20260810000001_ops_capture_unit_binding.sql; drop the settings view, history triggers and
-- registry rows/readers, then the settings functions/triggers/tables. The per-stream settings and
-- their history are discarded by that rollback.

-- Managers are relevant to Café through a Retail Ops Business Unit role; ops leads and admins
-- retain their existing cross-stream authority. A supervisor alone is not an item-master editor.
create or replace function ops.can_manage_cafe_item_settings()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.current_org_id() is not null
     and (
       shared.has_access_role('ops_lead')
       or shared.has_access_role('admin')
       or (
         shared.has_access_role('manager')
         and exists (
           select 1
             from shared.person_roles pr
             join shared.roles r on r.id = pr.role_id
             join shared.business_units bu on bu.id = r.business_unit_id
            where pr.person_id = shared.current_person_id()
              and pr.org_id = shared.current_org_id()
              and r.org_id = pr.org_id
              and bu.org_id = r.org_id
              and bu.code = 'retail_ops'
         )
       )
     )
$$;
comment on function ops.can_manage_cafe_item_settings() is
  'Café item-settings writer: Retail Ops managers, ops leads and admins, independent of capture stream. The app affordance is not the authority; RLS calls this role predicate.';
revoke execute on function ops.can_manage_cafe_item_settings() from public, anon;
grant execute on function ops.can_manage_cafe_item_settings() to authenticated;

create table ops.cafe_item_settings (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null default shared.current_org_id()
                           references shared.orgs(id) on delete cascade,
  branch_id              uuid not null,
  activity               text not null,
  wip_item_id            uuid not null,
  -- NULL means the current ERP name is also the MOS name. This follows later ERP renames until
  -- a manager actually chooses a different label.
  mos_name               text,
  -- Nullable until a manager configures the row. A configured default must also be shown.
  default_item_unit_id   uuid references ops.item_units(id) on delete restrict,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint cafe_item_settings_name_check
    check (mos_name is null or (btrim(mos_name) <> '' and length(mos_name) <= 160)),
  constraint cafe_item_settings_stream_item_uk
    unique (org_id, branch_id, activity, wip_item_id),
  constraint cafe_item_settings_org_id_uk unique (org_id, id),
  constraint cafe_item_settings_stream_item_fk
    foreign key (org_id, branch_id, activity, wip_item_id)
    references ops.stream_items (org_id, branch_id, activity, wip_item_id)
    on delete cascade
);
comment on table ops.cafe_item_settings is
  'Per-stream MOS presentation and ERP-detail selection for one ERP café item. It never owns product or unit definitions.';
comment on column ops.cafe_item_settings.mos_name is
  'NULL inherits the current read-only ERP name; a non-NULL value is the manager-selected MOS display name.';
comment on column ops.cafe_item_settings.default_item_unit_id is
  'The per-stream default ERP product detail. A non-NULL value must also have a cafe_item_setting_units row.';

create index cafe_item_settings_item_idx
  on ops.cafe_item_settings (org_id, wip_item_id);

create table ops.cafe_item_setting_units (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null default shared.current_org_id()
                       references shared.orgs(id) on delete cascade,
  cafe_item_setting_id uuid not null,
  item_unit_id       uuid not null references ops.item_units(id) on delete restrict,
  created_at         timestamptz not null default now(),
  constraint cafe_item_setting_units_once_uk
    unique (cafe_item_setting_id, item_unit_id),
  constraint cafe_item_setting_units_org_setting_fk
    foreign key (org_id, cafe_item_setting_id)
    references ops.cafe_item_settings (org_id, id) on delete cascade
);
comment on table ops.cafe_item_setting_units is
  'The ERP product details a stream has chosen to show when logging its item. Each row references an existing ops.item_units record; MOS creates no units.';

create index cafe_item_setting_units_item_unit_idx
  on ops.cafe_item_setting_units (item_unit_id);

create trigger cafe_item_settings_set_updated_at
  before update on ops.cafe_item_settings
  for each row execute function shared.set_updated_at();

alter table ops.cafe_item_settings enable row level security;
alter table ops.cafe_item_settings force row level security;
alter table ops.cafe_item_setting_units enable row level security;
alter table ops.cafe_item_setting_units force row level security;

grant select, insert, update on ops.cafe_item_settings to authenticated;
grant select, insert on ops.cafe_item_setting_units to authenticated;
grant select on ops.cafe_item_settings, ops.cafe_item_setting_units to service_role;

create policy cafe_item_settings_select_org on ops.cafe_item_settings
  for select to authenticated
  using (org_id = shared.current_org_id() and shared.is_org_member());
create policy cafe_item_settings_insert_manager on ops.cafe_item_settings
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and ops.can_manage_cafe_item_settings());
create policy cafe_item_settings_update_manager on ops.cafe_item_settings
  for update to authenticated
  using (org_id = shared.current_org_id()
         and ops.can_manage_cafe_item_settings())
  with check (org_id = shared.current_org_id()
              and ops.can_manage_cafe_item_settings());

create policy cafe_item_setting_units_select_org on ops.cafe_item_setting_units
  for select to authenticated
  using (org_id = shared.current_org_id() and shared.is_org_member());
create policy cafe_item_setting_units_insert_manager on ops.cafe_item_setting_units
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and ops.can_manage_cafe_item_settings());

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
create trigger cafe_item_settings_guard
  before insert or update on ops.cafe_item_settings
  for each row execute function ops._guard_cafe_item_setting();

create or replace function ops._guard_cafe_item_setting_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_setting_org uuid;
  v_setting_item uuid;
  v_setting_default uuid;
  v_unit_org uuid;
  v_unit_item uuid;
  v_unit_active boolean;
  v_unit_detail text;
begin
  if tg_op = 'UPDATE' and (
       new.org_id is distinct from old.org_id
    or new.cafe_item_setting_id is distinct from old.cafe_item_setting_id
    or new.item_unit_id is distinct from old.item_unit_id
  ) then
    raise exception 'selected ERP detail identity is immutable' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    select setting.org_id, setting.wip_item_id, setting.default_item_unit_id
      into v_setting_org, v_setting_item, v_setting_default
      from ops.cafe_item_settings setting
     where setting.id = old.cafe_item_setting_id;
    if v_setting_default = old.item_unit_id then
      raise exception 'CAFE_DEFAULT_UNIT_MUST_BE_SHOWN: choose another default before hiding this detail'
        using errcode = 'P0016';
    end if;
    return old;
  end if;

  select setting.org_id, setting.wip_item_id
    into v_setting_org, v_setting_item
    from ops.cafe_item_settings setting
   where setting.id = new.cafe_item_setting_id;
  select unit.org_id, unit.wip_item_id, unit.source_active, unit.esb_product_detail_id
    into v_unit_org, v_unit_item, v_unit_active, v_unit_detail
    from ops.item_units unit
   where unit.id = new.item_unit_id;
  if v_setting_org is distinct from new.org_id
     or v_unit_org is distinct from new.org_id
     or v_unit_item is distinct from v_setting_item
     or v_unit_active is distinct from true
     or v_unit_detail is null then
    raise exception 'shown ERP detail must be active and belong to this stream item'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function ops._guard_cafe_item_setting_unit() is
  'A shown-unit row can only reference an active ERP product detail belonging to its same-org stream item; the current default cannot be hidden. SECURITY INVOKER.';
revoke execute on function ops._guard_cafe_item_setting_unit() from public, anon, authenticated;
create trigger cafe_item_setting_units_guard
  before insert or update or delete on ops.cafe_item_setting_units
  for each row execute function ops._guard_cafe_item_setting_unit();

-- One atomic save keeps a row's name, default and shown details coherent. New selections are
-- inserted before the default changes; the default changes before obsolete shown rows are removed.
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
    (org_id, branch_id, activity, wip_item_id, mos_name)
  values
    (v_org_id, p_branch_id, p_activity, p_wip_item_id, v_mos_name)
  on conflict (org_id, branch_id, activity, wip_item_id)
  do update set mos_name = excluded.mos_name
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
comment on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[]) is
  'SECURITY DEFINER: atomically saves a stream item MOS name, its default ERP detail and the shown ERP details after a same-org role check. Uses its owner privilege for internal shown-detail deletion; authenticated has no DELETE grant. Validates all details against existing active ERP rows; creates no item, unit or conversion.';
revoke execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[])
  from public, anon;
grant execute on function ops.save_cafe_item_settings(uuid,text,uuid,text,uuid,uuid[])
  to authenticated;

-- One row per active ERP item/detail, including items with zero source details. ERP ids never
-- cross this view; its UUIDs are internal MOS item/unit keys for settings and future log binding.
create or replace view ops.cafe_item_settings_read with (security_invoker = true) as
select
  item.id as item_id,
  item.name as erp_name,
  coalesce(setting.mos_name, item.name) as mos_name,
  item.category,
  item.kind,
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
  ) as unit_is_shown
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
  'Per-stream ERP item settings read: one row per active source product detail, MOS name falling back to the live ERP name, and manager-selected shown/default flags. It exposes no ERP product or product-detail ids.';
grant select on ops.cafe_item_settings_read to authenticated;

-- Read-only users can call the same typed source the settings page uses. A log reader can retain
-- only shown units and requires the shown default; the insert trigger below independently checks it.
create or replace function shared._history_reader_ops_cafe_item_settings(
  p_record_key text,
  p_action text,
  p_snapshot jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.cafe_item_settings setting
       where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and setting.id = p_record_key::uuid
         and setting.org_id = shared.current_org_id()
    );
  elsif p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
       and shared.is_org_member();
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_cafe_item_settings(text,text,jsonb) is
  'History reader for per-stream Café item settings: same-org live row for insert/update and the captured org snapshot for cascade deletes.';
revoke execute on function shared._history_reader_ops_cafe_item_settings(text,text,jsonb)
  from public, anon;
grant execute on function shared._history_reader_ops_cafe_item_settings(text,text,jsonb)
  to authenticated;

create or replace function shared._history_reader_ops_cafe_item_setting_units(
  p_record_key text,
  p_action text,
  p_snapshot jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from ops.cafe_item_setting_units shown
       where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and shown.id = p_record_key::uuid
         and shown.org_id = shared.current_org_id()
    );
  elsif p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
       and shared.is_org_member();
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_cafe_item_setting_units(text,text,jsonb) is
  'History reader for shown ERP detail selections: same-org live row for insert/update and the captured org snapshot for cascade deletes.';
revoke execute on function shared._history_reader_ops_cafe_item_setting_units(text,text,jsonb)
  from public, anon;
grant execute on function shared._history_reader_ops_cafe_item_setting_units(text,text,jsonb)
  to authenticated;

insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('ops', 'cafe_item_settings', 'shared._history_reader_ops_cafe_item_settings(text,text,jsonb)'),
  ('ops', 'cafe_item_setting_units', 'shared._history_reader_ops_cafe_item_setting_units(text,text,jsonb)');

create trigger record_history_cafe_item_settings
  after insert or update or delete on ops.cafe_item_settings
  for each row execute function shared._record_history_write();
create trigger record_history_cafe_item_setting_units
  after insert or update or delete on ops.cafe_item_setting_units
  for each row execute function shared._record_history_write();

-- Per-stream settings now supply the default and allowed details for new ERP-catalog WIP logs.
-- Manual legacy items keep their existing item_units.is_default fallback. RAW rows still reach the
-- existing WIP-only guard first, and items outside the stream still reach its stream-list guard.
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
  v_kind text;
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
    into v_source, v_kind
    from ops.wip_items item
   where item.id = new.wip_item_id
     and item.org_id = new.org_id;

  -- Preserve the WIP-only and stream-list refusals owned by the next trigger.
  if new.source = 'mos' and v_source = 'erp_catalog' and v_kind = 'RAW' then
    return new;
  end if;
  if new.source = 'mos' and v_source = 'erp_catalog' and not exists (
    select 1 from ops.stream_items stream_item
     where stream_item.org_id = new.org_id
       and stream_item.branch_id = new.branch_id
       and stream_item.activity = new.activity
       and stream_item.wip_item_id = new.wip_item_id
  ) then
    return new;
  end if;

  if new.source = 'mos' and v_source = 'erp_catalog' and v_kind = 'WIP' then
    select setting.default_item_unit_id into v_default_unit_id
      from ops.cafe_item_settings setting
     where setting.org_id = new.org_id
       and setting.branch_id = new.branch_id
       and setting.activity = new.activity
       and setting.wip_item_id = new.wip_item_id;
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
              and setting.default_item_unit_id is not null
         )
    ) then
      raise exception 'CAFE_ITEM_UNIT_NOT_SHOWN: the selected ERP detail is not shown for this stream item'
        using errcode = 'P0015';
    end if;
  elsif tg_op = 'INSERT' and new.item_unit_id is null then
    select unit.id into new.item_unit_id
      from ops.item_units unit
     where unit.wip_item_id = new.wip_item_id
       and unit.is_default;
  end if;

  -- item_unit_id is an existence-only FK and FK lookups bypass RLS. The row's own unit must still
  -- be visible in this org and belong to its item; this is the same-org seam for explicit binds.
  if new.item_unit_id is not null and v_bound_at_write then
    select unit.wip_item_id, unit.org_id into v_item, v_org
      from ops.item_units unit
     where unit.id = new.item_unit_id;
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
  'Binds new ERP-catalog WIP logs to the selected stream default and requires the detail to be shown for that stream; manual legacy items retain the item_units default. Same-org/item checks and immutable log bindings remain. SECURITY INVOKER.';
revoke execute on function ops._bind_kitchen_log_item_unit() from public, anon, authenticated;

-- Approval posts the actual product detail bound to the log. The old JSON key is retained as the
-- worker contract; its value now comes from item_unit_id whenever a log has one.
create or replace function ops.approve_kitchen_log(p_log_id uuid, p_review_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log ops.kitchen_logs;
  v_wip ops.wip_items;
  v_item_unit ops.item_units;
  v_prefix text;
  v_next_n integer;
  v_batch_id text;
  v_endpoint text;
  v_payload jsonb;
  v_target text;
  v_dedup text;
  v_stock_qty numeric(12,2);
  v_branch_code text;
  v_dest_code text;
begin
  select * into v_log from ops.kitchen_logs where id = p_log_id for update;
  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if v_log.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot approve a log outside your org' using errcode = '42501';
  end if;
  if v_log.status <> 'Submitted' then
    raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003';
  end if;
  if not ops.can_review_stream(v_log.branch_id, v_log.activity) then
    raise exception 'only the stream''s supervisor or ops_lead/admin may approve' using errcode = '42501';
  end if;
  if v_log.action = 'transfer' and exists (
    select 1 from ops.kitchen_logs l
     where l.org_id = v_log.org_id
       and l.branch_id = v_log.branch_id
       and l.activity = v_log.activity
       and l.log_date = v_log.log_date
       and l.action = 'produce'
       and l.status = 'Submitted'
  ) then
    raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
      using errcode = 'P0004';
  end if;

  v_prefix := ops.kitchen_batch_prefix(v_log.action, v_log.branch_id, v_log.destination_branch_id);
  insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
  values (v_log.org_id, v_prefix, v_log.log_date, 1)
  on conflict (org_id, prefix, log_date) do update
    set last_n = ops.kitchen_batch_seq.last_n + 1
  returning last_n into v_next_n;
  v_batch_id := v_prefix || '-' || to_char(v_log.log_date, 'YYYYMMDD') || '-'
                || lpad(v_next_n::text, 3, '0');

  update ops.kitchen_logs
     set status = 'Approved',
         reviewed_by = shared.current_person_id(),
         reviewed_at = now(),
         review_note = p_review_note,
         batch_id = v_batch_id
   where id = p_log_id;

  select coalesce(sum(case when l.action = 'produce' then l.qty_porsi else -l.qty_porsi end), 0)::numeric(12,2)
    into v_stock_qty
    from ops.kitchen_logs l
   where l.org_id = v_log.org_id
     and l.wip_item_id = v_log.wip_item_id
     and l.branch_id = v_log.branch_id
     and l.activity = v_log.activity
     and l.log_date = v_log.log_date
     and l.status = 'Approved';
  insert into ops.kitchen_stock (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
  values (v_log.org_id, v_log.log_date, v_log.wip_item_id, v_log.branch_id, v_log.activity, v_stock_qty)
  on conflict (org_id, log_date, wip_item_id, branch_id, activity) do update
    set usable_qty = excluded.usable_qty, updated_at = now();

  select * into v_wip from ops.wip_items where id = v_log.wip_item_id;
  if v_log.item_unit_id is not null then
    select * into v_item_unit from ops.item_units
     where id = v_log.item_unit_id
       and org_id = v_log.org_id
       and wip_item_id = v_log.wip_item_id;
  end if;
  select branch.code into v_branch_code from shared.branches branch where branch.id = v_log.branch_id;
  select branch.code into v_dest_code from shared.branches branch where branch.id = v_log.destination_branch_id;
  v_endpoint := ops.esb_endpoint_for(v_log.action, v_log.branch_id, v_log.destination_branch_id);

  v_payload := jsonb_build_object(
    'batch_id', v_batch_id,
    'log_date', v_log.log_date,
    'wip_item_id', v_log.wip_item_id,
    'esb_bom_id', v_wip.esb_bom_id,
    'esb_product_detail_id_porsi', coalesce(
      v_item_unit.esb_product_detail_id,
      v_wip.esb_product_detail_id_porsi
    ),
    'qty_porsi', v_log.qty_porsi,
    'action', v_log.action,
    'activity', v_log.activity,
    'branch_id', v_log.branch_id,
    'branch_code', v_branch_code,
    'destination_branch_id', v_log.destination_branch_id,
    'destination_branch_code', v_dest_code);
  v_target := integrations.current_esb_target_env();
  v_dedup := 'kitchen|' || v_batch_id || '|' || v_target;
  insert into integrations.esb_push
    (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key)
  values (v_log.org_id, 'kitchen', v_batch_id, v_endpoint, v_payload, v_target, v_dedup)
  on conflict (dedup_key) do nothing;
  return v_batch_id;
end;
$$;
comment on function ops.approve_kitchen_log(uuid,text) is
  'Atomic Café approval and outbox enqueue. The captured item_unit_id supplies the ERP product detail in the existing worker payload; logs without a binding keep the legacy item coordinate. The row stream reviewer or ops_lead/admin remains the approval authority. SECURITY DEFINER.';
revoke execute on function ops.approve_kitchen_log(uuid,text) from public, anon, authenticated;
grant execute on function ops.approve_kitchen_log(uuid,text) to authenticated;
