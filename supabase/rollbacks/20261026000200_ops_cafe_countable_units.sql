-- #1863 rollback: restore timestamp confirmation and stream-default-only Count.
create or replace function ops.cafe_countable_items(p_branch_id uuid, p_activity text)
returns table (
  item_id uuid,
  item_name text,
  item_category text,
  item_kind text,
  item_unit_id uuid,
  unit_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select shared.current_org_id()) is null
     or not ((select shared.is_cafe_affiliated())
          or (select shared.has_access_role('ops_lead'))
          or (select shared.has_access_role('admin'))) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from shared.teams t
      join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
     where t.org_id = (select shared.current_org_id())
       and t.branch_id = p_branch_id
       and t.activity = p_activity
       and t.archived_at is null
       and b.archived_at is null
  ) then
    return;
  end if;
  return query
  select r.item_id, r.name, r.category, r.kind, r.item_unit_id, r.unit_name
    from ops.cafe_item_references r
   where r.branch_id = p_branch_id
     and r.activity = p_activity
     and r.is_active
     and r.kind in ('RAW', 'WIP')
     and r.item_unit_id is not null
     and r.confirmed_at is not null
     and r.erp_is_stock is true
     and (
       exists (
         select 1 from ops.cafe_item_settings setting
          where setting.org_id = (select shared.current_org_id())
            and setting.branch_id = p_branch_id
            and setting.activity = p_activity
            and setting.wip_item_id = r.item_id
            and setting.default_item_unit_id = r.item_unit_id
       )
       or (
         r.is_default
         and not exists (
           select 1 from ops.cafe_item_settings setting
            where setting.org_id = (select shared.current_org_id())
              and setting.branch_id = p_branch_id
              and setting.activity = p_activity
              and setting.wip_item_id = r.item_id
         )
       )
     )
   order by r.name, r.item_id;
end;
$$;
comment on function ops.cafe_countable_items(uuid, text) is
  'Countable list = active stream items of kind RAW/WIP with that stream''s default, active, confirmed ERP stock unit. Never returns MOS conversions or ERP coordinates.';
revoke all on function ops.cafe_countable_items(uuid, text) from public, anon;
grant execute on function ops.cafe_countable_items(uuid, text) to authenticated;

create or replace function ops.cafe_receivable_items(p_branch_id uuid, p_activity text)
returns table (
  item_id uuid,
  item_name text,
  item_category text,
  item_kind text,
  item_unit_id uuid,
  unit_name text,
  is_default_unit boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select shared.current_org_id()) is null
     or not ((select shared.is_cafe_affiliated())
          or (select shared.has_access_role('ops_lead'))
          or (select shared.has_access_role('admin'))) then
    raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select r.item_id, r.name, r.category, r.kind, r.item_unit_id, r.unit_name,
         coalesce(setting.default_item_unit_id = r.item_unit_id,
                  setting.default_item_unit_id is null and r.is_default, false)
    from ops.cafe_item_references r
    left join ops.cafe_item_settings setting
      on setting.org_id = (select shared.current_org_id())
     and setting.branch_id = r.branch_id
     and setting.activity = r.activity
     and setting.wip_item_id = r.item_id
   where r.branch_id = p_branch_id
     and r.activity = p_activity
     and r.is_active
     and r.confirmed_at is not null
     and r.erp_is_stock is true
     and exists (
       select 1
         from shared.teams t
         join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
        where t.org_id = (select shared.current_org_id())
          and t.branch_id = p_branch_id
          and t.activity = p_activity
          and t.archived_at is null
          and b.archived_at is null
     )
   order by r.name, r.item_id, r.unit_name;
end;
$$;
comment on function ops.cafe_receivable_items(uuid, text) is
  'Receivable list = every active, confirmed ESB stock product detail of an active stream item, one row per unit, with the stream default unit marked. Never returns MOS conversions or ESB coordinates.';
revoke all on function ops.cafe_receivable_items(uuid, text) from public, anon;
grant execute on function ops.cafe_receivable_items(uuid, text) to authenticated;

drop function ops._cafe_unit_is_confirmed(text, text, timestamptz);
comment on function ops.cafe_count_excluded_items(uuid, text) is
  'FR-005: active RAW and WIP items on the stream list that Count does not offer because their default unit is not a confirmed, active ERP stock unit. Stream reviewers, ops lead and admin only.';
