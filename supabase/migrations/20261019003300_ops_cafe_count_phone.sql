-- #1370 — Count on a phone: a chosen count date, a manager-defined multiple of the default unit,
-- and the reviewer's list of stream items that cannot be counted. Posting stays off.
--
-- DOWN (manual; drops the typed multiple snapshots, so check none are relied on first):
--   1. drop function ops.cafe_count_excluded_items(uuid, text);
--      drop function ops.submit_cafe_counts(uuid, text, jsonb, date);
--   2. Restore ops.submit_cafe_counts(uuid, text, jsonb) from 20261016000400_ops_cafe_locations.sql
--      and ops._guard_cafe_count_line() from 20261019003200_ops_cafe_count_review_decisions.sql.
--   3. revoke select (entry_quantity, entry_unit_factor) on ops.cafe_count_lines from authenticated;
--      alter table ops.cafe_count_lines drop constraint cafe_count_lines_entry_unit_ck,
--        drop column entry_quantity, drop column entry_unit_factor;

alter table ops.cafe_count_lines
  add column entry_quantity numeric(14,4),
  add column entry_unit_factor numeric,
  add constraint cafe_count_lines_entry_unit_ck check (
    (entry_quantity is null and entry_unit_factor is null)
    or (entry_quantity >= 0 and entry_unit_factor > 0)
  );
comment on column ops.cafe_count_lines.entry_quantity is
  'Quantity typed in a manager-defined multiple of the default unit; counted_quantity stays the default-unit quantity. Null when typed in the default unit.';
comment on column ops.cafe_count_lines.entry_unit_factor is
  'Snapshot of the picked multiple: how many default units one typed unit is.';
-- The browser role reads Count lines column by column (20261019003100); the typed multiple is readable.
grant select (entry_quantity, entry_unit_factor) on ops.cafe_count_lines to authenticated;

create or replace function ops._guard_cafe_count_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action text := coalesce(current_setting('app.cafe_count_action', true), '');
  v_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
begin
  if tg_op = 'INSERT' then
    new.org_id := shared.current_org_id();
    new.submitted_by := shared.current_person_id();
    new.submitted_at := clock_timestamp();
    new.count_date := coalesce(new.count_date, v_today);
    new.source := 'mos';
    new.status := 'Submitted';
    new.posting_status := 'not_posted';
    new.expected_balance := null;
    new.expected_status := 'waiting';
    new.expected_recorded_at := null;
    new.recounted_quantity := null;
    new.recounted_by := null;
    new.recounted_at := null;
    new.reason := null;
    new.reason_entered_by := null;
    new.reason_entered_at := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    new.row_version := 1;
    new.updated_at := clock_timestamp();
    if new.org_id is null or new.submitted_by is null then
      raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
    end if;
    -- FR-002: today or yesterday (WIB); only an ops lead or admin counts an earlier date, at most 7 days back;
    -- never a future one.
    if new.count_date > v_today then
      raise exception 'CAFE_COUNT_DATE_FUTURE' using errcode = '23514';
    end if;
    if new.count_date < v_today - 7 or (new.count_date < v_today - 1
       and not (shared.has_access_role('ops_lead') or shared.has_access_role('admin'))) then
      raise exception 'CAFE_COUNT_DATE_TOO_OLD' using errcode = '23514';
    end if;
    if not exists (
      select 1 from ops.cafe_countable_items(new.branch_id, new.activity) item
       where item.item_id = new.wip_item_id
         and item.item_unit_id = new.item_unit_id
         and item.item_name = new.item_name
         and item.item_kind = new.item_kind
    ) then
      raise exception 'CAFE_COUNT_ITEM_NOT_COUNTABLE' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status in ('Confirmed', 'Rejected') then
    raise exception 'CAFE_COUNT_FROZEN' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.org_id is distinct from old.org_id
     or new.branch_id is distinct from old.branch_id
     or new.activity is distinct from old.activity
     or new.count_date is distinct from old.count_date
     or new.wip_item_id is distinct from old.wip_item_id
     or new.item_name is distinct from old.item_name
     or new.item_category is distinct from old.item_category
     or new.item_kind is distinct from old.item_kind
     or new.item_unit_id is distinct from old.item_unit_id
     or new.unit_name is distinct from old.unit_name
     or new.counted_quantity is distinct from old.counted_quantity
     or new.entry_quantity is distinct from old.entry_quantity
     or new.entry_unit_factor is distinct from old.entry_unit_factor
     or new.client_key is distinct from old.client_key
     or new.source is distinct from old.source
     or new.submitted_by is distinct from old.submitted_by
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'CAFE_COUNT_FACTS_IMMUTABLE' using errcode = '42501';
  end if;
  if new.review_note is not null and v_action <> 'reject' then
    raise exception 'CAFE_COUNT_UPDATE_REQUIRES_SERVER_ACTION' using errcode = '42501';
  end if;

  -- Every server action below changes only its own columns; the rest must equal the old row.
  if v_action = 'expected'
     and old.recounted_quantity is null
     and new.status = old.status
     and new.posting_status = old.posting_status
     and (new.recounted_quantity, new.recounted_by, new.recounted_at)
         is not distinct from (old.recounted_quantity, old.recounted_by, old.recounted_at)
     and (new.reason, new.reason_entered_by, new.reason_entered_at)
         is not distinct from (old.reason, old.reason_entered_by, old.reason_entered_at)
     and (new.reviewed_by, new.reviewed_at) is not distinct from (old.reviewed_by, old.reviewed_at)
     and new.expected_status = 'ready'
     and new.expected_balance is not null
     and new.expected_recorded_at is not null
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;

  if v_action = 'recount'
     and new.status = old.status
     and new.posting_status = old.posting_status
     and (new.expected_balance, new.expected_status, new.expected_recorded_at)
         is not distinct from (old.expected_balance, old.expected_status, old.expected_recorded_at)
     and old.recounted_quantity is null
     and new.recounted_quantity is not null
     and new.recounted_by = shared.current_person_id()
     and new.recounted_at is not null
     and (new.reason, new.reason_entered_by, new.reason_entered_at)
         is not distinct from (old.reason, old.reason_entered_by, old.reason_entered_at)
     and (new.reviewed_by, new.reviewed_at) is not distinct from (old.reviewed_by, old.reviewed_at)
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;

  if v_action = 'reason'
     and new.status = old.status
     and new.posting_status = old.posting_status
     and (new.expected_balance, new.expected_status, new.expected_recorded_at)
         is not distinct from (old.expected_balance, old.expected_status, old.expected_recorded_at)
     and (new.recounted_quantity, new.recounted_by, new.recounted_at)
         is not distinct from (old.recounted_quantity, old.recounted_by, old.recounted_at)
     and new.reason is not null
     and new.reason_entered_by = shared.current_person_id()
     and new.reason_entered_at is not null
     and (new.reviewed_by, new.reviewed_at) is not distinct from (old.reviewed_by, old.reviewed_at)
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;

  if v_action in ('confirm', 'reject')
     and old.status = 'Submitted'
     and new.status = (case v_action when 'confirm' then 'Confirmed' else 'Rejected' end)
     and (new.expected_balance, new.expected_status, new.expected_recorded_at)
         is not distinct from (old.expected_balance, old.expected_status, old.expected_recorded_at)
     and (new.recounted_quantity, new.recounted_by, new.recounted_at)
         is not distinct from (old.recounted_quantity, old.recounted_by, old.recounted_at)
     and (new.reason, new.reason_entered_by, new.reason_entered_at)
         is not distinct from (old.reason, old.reason_entered_by, old.reason_entered_at)
     and new.reviewed_by = shared.current_person_id()
     and new.reviewed_by is distinct from old.submitted_by
     and new.reviewed_by is distinct from old.recounted_by
     and new.reviewed_at is not null
     and new.posting_status = (case
           when v_action = 'reject' then old.posting_status
           when old.variance = 0 then 'not_needed'
           else 'held' end)
     and (v_action = 'reject') = (new.review_note is not null)
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  raise exception 'CAFE_COUNT_UPDATE_REQUIRES_SERVER_ACTION' using errcode = '42501';
end;
$$;
comment on function ops._guard_cafe_count_line() is
  'Stamps browser-owned fields on insert, holds the count date to today or yesterday (up to 7 days back for ops lead and admin), keeps the first count and Expected snapshot, admits only the worker, recount, reason, confirm and reject actions each changing its own columns, never lets the submitter or recounter decide the line, and freezes decided lines. SECURITY INVOKER.';
revoke all on function ops._guard_cafe_count_line() from public, anon, authenticated;

create or replace function ops.cafe_count_excluded_items(p_branch_id uuid, p_activity text)
returns table (item_id uuid, item_name text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if shared.current_org_id() is null or not ops.can_review_stream(p_branch_id, p_activity) then
    raise exception 'CAFE_COUNT_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select distinct r.item_id, r.name
    from ops.cafe_item_references r
   where r.branch_id = p_branch_id
     and r.activity = p_activity
     and r.is_active
     and r.kind in ('RAW', 'WIP')
     and not exists (select 1 from ops.cafe_countable_items(p_branch_id, p_activity) c where c.item_id = r.item_id)
   order by r.name, r.item_id;
end;
$$;
comment on function ops.cafe_count_excluded_items(uuid, text) is
  'FR-005: active RAW and WIP items on the stream list that Count does not offer because their default unit is not a confirmed, active ERP stock unit. Stream reviewers, ops lead and admin only.';
revoke execute on function ops.cafe_count_excluded_items(uuid, text) from public, anon;
grant execute on function ops.cafe_count_excluded_items(uuid, text) to authenticated;

drop function ops.submit_cafe_counts(uuid, text, jsonb);
create function ops.submit_cafe_counts(p_branch_id uuid, p_activity text, p_lines jsonb, p_count_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb; v_key uuid; v_item_id uuid; v_qty numeric; v_entry numeric; v_factor numeric; v_location_id uuid;
  v_existing ops.cafe_count_lines%rowtype; v_item record; v_result jsonb := '[]'::jsonb; v_outcome jsonb;
  v_org_id uuid := shared.current_org_id(); v_submitter_id uuid := shared.current_person_id();
  v_today date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  v_date date := coalesce(p_count_date, (statement_timestamp() at time zone 'Asia/Jakarta')::date);
begin
  if v_org_id is null or v_submitter_id is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.teams t join shared.branches b on b.id=t.branch_id and b.org_id=t.org_id
    where t.org_id=v_org_id and t.branch_id=p_branch_id and t.activity=p_activity and t.archived_at is null and b.archived_at is null) then
    raise exception 'CAFE_COUNT_STREAM_NOT_FOUND' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>150 then
    raise exception 'CAFE_COUNT_SUBMIT_LIMIT: submit between 0 and 150 lines' using errcode = '22023';
  end if;
  -- FR-002, checked once for the batch; the line guard holds the same rule for any other insert path.
  if v_date > v_today then
    raise exception 'CAFE_COUNT_DATE_FUTURE' using errcode = '23514';
  end if;
  if v_date < v_today - 7 or (v_date < v_today - 1 and not (shared.has_access_role('ops_lead') or shared.has_access_role('admin'))) then
    raise exception 'CAFE_COUNT_DATE_TOO_OLD' using errcode = '23514';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    v_key:=null; v_item_id:=null; v_qty:=null; v_entry:=null; v_factor:=null; v_location_id:=null;
    if jsonb_typeof(v_line)<>'object' or v_line ? 'production_location_id' or v_line ? 'from_storage_location_id' or v_line ? 'to_storage_location_id'
       or coalesce(v_line->>'client_key','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_line->>'client_key','outcome','refused','reason','invalid_line'));
      continue;
    end if;
    v_key:=(v_line->>'client_key')::uuid;
    if coalesce(v_line->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_line->>'quantity','') !~ '^([0-9]+)([.,][0-9]{1,4})?$'
       or (nullif(v_line->>'unit_factor','') is not null and coalesce(v_line->>'unit_factor','') !~ '^[0-9]+(\.[0-9]{1,6})?$')
       or (v_line ? 'storage_location_id' and nullif(v_line->>'storage_location_id','') is not null
           and coalesce(v_line->>'storage_location_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','invalid_quantity_or_item'));
      continue;
    end if;
    v_item_id:=(v_line->>'item_id')::uuid; v_qty:=replace(v_line->>'quantity',',','.')::numeric;
    if nullif(v_line->>'storage_location_id','') is not null then v_location_id:=(v_line->>'storage_location_id')::uuid; end if;
    -- FR-008: a typed multiple must be one of the manager's factors for this stream item; the stored count is in the default unit.
    if nullif(v_line->>'unit_factor','') is not null then
      v_factor:=(v_line->>'unit_factor')::numeric;
      if not exists (select 1 from ops.cafe_item_settings s
                      where s.org_id=v_org_id and s.branch_id=p_branch_id and s.activity=p_activity
                        and s.wip_item_id=v_item_id and v_factor = any(s.unit_multiples)) then
        v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','invalid_unit'));
        continue;
      end if;
      v_entry:=v_qty; v_qty:=v_entry*v_factor;
      if v_qty <> trunc(v_qty, 4) then
        v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','invalid_quantity'));
        continue;
      end if;
    end if;
    if v_qty>9999999999.9999 then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','invalid_quantity'));
      continue;
    end if;
    if v_location_id is not null and not exists (
      select 1 from ops.locations l join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id
       where l.org_id=v_org_id and l.id=v_location_id and l.archived_at is null and l.use in ('storage','both') and b.branch_id=p_branch_id
    ) then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','invalid_location'));
      continue;
    end if;
    select * into v_existing from ops.cafe_count_lines line where line.org_id=v_org_id and line.client_key=v_key;
    if found then
      if v_existing.submitted_by=v_submitter_id and v_existing.branch_id=p_branch_id and v_existing.activity=p_activity
         and v_existing.wip_item_id=v_item_id and v_existing.counted_quantity=v_qty and v_existing.count_date=v_date
         and v_existing.entry_unit_factor is not distinct from v_factor
         and v_existing.storage_location_id is not distinct from v_location_id then
        v_outcome:=jsonb_build_object('client_key',v_key,'outcome','existing','line_id',v_existing.id);
      else
        v_outcome:=jsonb_build_object('client_key',v_key,'outcome','refused','reason','client_key_conflict');
      end if;
      v_result:=v_result||jsonb_build_array(v_outcome); continue;
    end if;
    select * into v_item from ops.cafe_countable_items(p_branch_id,p_activity) item where item.item_id=v_item_id;
    if not found then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('client_key',v_key,'outcome','refused','reason','item_not_countable'));
      continue;
    end if;
    begin
      insert into ops.cafe_count_lines (
        org_id,branch_id,activity,count_date,wip_item_id,item_name,item_category,item_kind,item_unit_id,unit_name,
        counted_quantity,entry_quantity,entry_unit_factor,storage_location_id,client_key,source,status,posting_status,submitted_by
      ) values (
        v_org_id,p_branch_id,p_activity,v_date,v_item.item_id,v_item.item_name,v_item.item_category,v_item.item_kind,
        v_item.item_unit_id,v_item.unit_name,v_qty,v_entry,v_factor,v_location_id,v_key,'mos','Submitted','not_posted',v_submitter_id
      ) on conflict (org_id,client_key) do nothing returning * into v_existing;
      if found then
        v_outcome:=jsonb_build_object('client_key',v_key,'outcome','submitted','line_id',v_existing.id);
      else
        v_outcome:=jsonb_build_object('client_key',v_key,'outcome','refused','reason','client_key_conflict');
      end if;
    exception when unique_violation then
      v_outcome:=jsonb_build_object('client_key',v_key,'outcome','refused','reason','already_counted');
    end;
    v_result:=v_result||jsonb_build_array(v_outcome);
  end loop;
  return v_result;
end;
$$;
comment on function ops.submit_cafe_counts(uuid, text, jsonb, date) is
  'Processes at most 150 Count lines independently for one count date (today or yesterday WIB; up to 7 days back for ops lead and admin; never future). Accepts only client key, item, typed quantity, optional manager multiple and storage location; stamps everything else; idempotent per organisation.';
revoke execute on function ops.submit_cafe_counts(uuid, text, jsonb, date) from public, anon;
grant execute on function ops.submit_cafe_counts(uuid, text, jsonb, date) to authenticated;
