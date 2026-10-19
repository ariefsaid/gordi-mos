-- #1368 — the floor recounts and explains only Counts that differ; a complete non-zero Count confirms held.
-- Posting stays off: a confirmed non-zero line is held and no outbox row is written (the outbox path is #1373).
--
-- DOWN (manual; drops recount and reason facts, so check none are relied on first):
--   1. Restore ops._guard_cafe_count_line(), ops.record_cafe_count_expected_balance(uuid, numeric) and
--      ops.confirm_cafe_count_line(uuid, integer) from 20261006002200_ops_cafe_count_tracer.sql.
--   2. drop function ops.record_cafe_count_recount(uuid, numeric);
--      drop function ops.record_cafe_count_reason(uuid, text);
--   3. alter table ops.cafe_count_lines alter column variance set expression as
--        (case when expected_status = 'ready' then counted_quantity - expected_balance end);
--   4. alter table ops.cafe_count_lines drop constraint cafe_count_lines_recount_facts_ck,
--        drop constraint cafe_count_lines_reason_facts_ck,
--        drop column recounted_quantity, drop column recounted_by, drop column recounted_at,
--        drop column reason, drop column reason_entered_by, drop column reason_entered_at;

alter table ops.cafe_count_lines
  add column recounted_quantity numeric(14,4),
  add column recounted_by uuid references shared.people(id),
  add column recounted_at timestamptz,
  add column reason text,
  add column reason_entered_by uuid references shared.people(id),
  add column reason_entered_at timestamptz,
  add constraint cafe_count_lines_recount_facts_ck check (
    (recounted_quantity is null and recounted_by is null and recounted_at is null)
    or (recounted_quantity is not null and recounted_quantity >= 0
        and recounted_by is not null and recounted_at is not null)
  ),
  add constraint cafe_count_lines_reason_facts_ck check (
    (reason is null and reason_entered_by is null and reason_entered_at is null)
    or (reason is not null and btrim(reason) <> '' and char_length(reason) <= 500
        and reason_entered_by is not null and reason_entered_at is not null)
  );
comment on column ops.cafe_count_lines.recounted_quantity is
  'One floor Recount kept beside the unchanged first count; the final counted quantity is the Recount when present.';
comment on column ops.cafe_count_lines.reason is
  'Floor explanation required when the final counted quantity still differs from the same Expected snapshot; trimmed, non-blank, at most 500 characters.';

alter table ops.cafe_count_lines
  alter column variance set expression as (
    case when expected_status = 'ready'
         then coalesce(recounted_quantity, counted_quantity) - expected_balance end
  );
comment on column ops.cafe_count_lines.variance is
  'Generated exact stored-precision Variance = final counted (Recount when present, else first count) - Expected balance.';

create or replace function ops._guard_cafe_count_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action text := coalesce(current_setting('app.cafe_count_action', true), '');
begin
  if tg_op = 'INSERT' then
    new.org_id := shared.current_org_id();
    new.submitted_by := shared.current_person_id();
    new.submitted_at := clock_timestamp();
    new.count_date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
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
    new.row_version := 1;
    new.updated_at := clock_timestamp();
    if new.org_id is null or new.submitted_by is null then
      raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
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
     or new.client_key is distinct from old.client_key
     or new.source is distinct from old.source
     or new.submitted_by is distinct from old.submitted_by
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'CAFE_COUNT_FACTS_IMMUTABLE' using errcode = '42501';
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

  if v_action = 'confirm'
     and old.status = 'Submitted'
     and new.status = 'Confirmed'
     and (new.expected_balance, new.expected_status, new.expected_recorded_at)
         is not distinct from (old.expected_balance, old.expected_status, old.expected_recorded_at)
     and (new.recounted_quantity, new.recounted_by, new.recounted_at)
         is not distinct from (old.recounted_quantity, old.recounted_by, old.recounted_at)
     and (new.reason, new.reason_entered_by, new.reason_entered_at)
         is not distinct from (old.reason, old.reason_entered_by, old.reason_entered_at)
     and new.reviewed_by = shared.current_person_id()
     and new.reviewed_at is not null
     and new.posting_status = (case when old.variance = 0 then 'not_needed' else 'held' end)
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  raise exception 'CAFE_COUNT_UPDATE_REQUIRES_SERVER_ACTION' using errcode = '42501';
end;
$$;
comment on function ops._guard_cafe_count_line() is
  'Stamps browser-owned fields on insert, keeps the first count and Expected snapshot, admits only the worker, recount, reason and confirm actions each changing its own columns, and freezes decided lines. SECURITY INVOKER.';
revoke all on function ops._guard_cafe_count_line() from public, anon, authenticated;

create or replace function ops.record_cafe_count_expected_balance(p_line_id uuid, p_expected_balance numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line ops.cafe_count_lines%rowtype;
begin
  if p_expected_balance is null or p_expected_balance > 9999999999.9999
     or p_expected_balance < -9999999999.9999
     or p_expected_balance <> trunc(p_expected_balance, 4) then
    raise exception 'CAFE_COUNT_EXPECTED_BALANCE_INVALID' using errcode = '22023';
  end if;
  select * into v_line from ops.cafe_count_lines where id = p_line_id for update;
  if not found or v_line.status <> 'Submitted' then
    raise exception 'CAFE_COUNT_LINE_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if v_line.recounted_quantity is not null then
    raise exception 'CAFE_COUNT_EXPECTED_SNAPSHOT_FROZEN' using errcode = 'P0018';
  end if;
  perform set_config('app.cafe_count_action', 'expected', true);
  update ops.cafe_count_lines line
     set expected_balance = p_expected_balance,
         expected_status = 'ready',
         expected_recorded_at = clock_timestamp(),
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'expected_status', v_line.expected_status,
                            'row_version', v_line.row_version);
end;
$$;
comment on function ops.record_cafe_count_expected_balance(uuid, numeric) is
  'Worker-only Expected balance writer. Stamps its own observation time and increments the version; once a Recount exists the snapshot is frozen so the final Variance uses the same snapshot.';
revoke execute on function ops.record_cafe_count_expected_balance(uuid, numeric) from public, anon, authenticated;
grant execute on function ops.record_cafe_count_expected_balance(uuid, numeric) to service_role;

create or replace function ops.record_cafe_count_recount(p_line_id uuid, p_recounted_quantity numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line ops.cafe_count_lines%rowtype;
begin
  if p_recounted_quantity is null or p_recounted_quantity < 0
     or p_recounted_quantity > 9999999999.9999
     or p_recounted_quantity <> trunc(p_recounted_quantity, 4) then
    raise exception 'CAFE_COUNT_RECOUNT_INVALID' using errcode = '22023';
  end if;
  if shared.current_org_id() is null or shared.current_person_id() is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_line
    from ops.cafe_count_lines line
   where line.id = p_line_id and line.org_id = shared.current_org_id()
   for update;
  if not found or v_line.status <> 'Submitted' then
    raise exception 'CAFE_COUNT_LINE_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if v_line.expected_status <> 'ready' then
    raise exception 'CAFE_COUNT_EXPECTED_BALANCE_NOT_READY' using errcode = 'P0018';
  end if;
  if v_line.recounted_quantity is not null then
    raise exception 'CAFE_COUNT_RECOUNT_ALREADY_RECORDED' using errcode = 'P0018';
  end if;
  if v_line.counted_quantity = v_line.expected_balance then
    raise exception 'CAFE_COUNT_RECOUNT_NOT_REQUIRED' using errcode = 'P0018';
  end if;

  perform set_config('app.cafe_count_action', 'recount', true);
  update ops.cafe_count_lines line
     set recounted_quantity = p_recounted_quantity,
         recounted_by = shared.current_person_id(),
         recounted_at = clock_timestamp(),
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'row_version', v_line.row_version,
                            'reason_required', v_line.variance <> 0);
end;
$$;
comment on function ops.record_cafe_count_recount(uuid, numeric) is
  'Floor Recount for a Submitted line whose first count differs from its ready Expected snapshot. Once per line; keeps the first count and snapshot; returns only whether a reason is needed, never the Expected figure or the direction.';
revoke execute on function ops.record_cafe_count_recount(uuid, numeric) from public, anon;
grant execute on function ops.record_cafe_count_recount(uuid, numeric) to authenticated;

create or replace function ops.record_cafe_count_reason(p_line_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line ops.cafe_count_lines%rowtype;
  v_reason text := regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g');
begin
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception 'CAFE_COUNT_REASON_INVALID' using errcode = '22023';
  end if;
  if shared.current_org_id() is null or shared.current_person_id() is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_line
    from ops.cafe_count_lines line
   where line.id = p_line_id and line.org_id = shared.current_org_id()
   for update;
  if not found or v_line.status <> 'Submitted' then
    raise exception 'CAFE_COUNT_LINE_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if v_line.recounted_quantity is null then
    raise exception 'CAFE_COUNT_RECOUNT_REQUIRED' using errcode = 'P0018';
  end if;
  if v_line.variance = 0 then
    raise exception 'CAFE_COUNT_REASON_NOT_REQUIRED' using errcode = 'P0018';
  end if;

  perform set_config('app.cafe_count_action', 'reason', true);
  update ops.cafe_count_lines line
     set reason = v_reason,
         reason_entered_by = shared.current_person_id(),
         reason_entered_at = clock_timestamp(),
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'row_version', v_line.row_version, 'reason_recorded', true);
end;
$$;
comment on function ops.record_cafe_count_reason(uuid, text) is
  'Floor reason for a recounted line whose final Variance is still non-zero. Whitespace-trimmed, 1-500 characters; stamps who and when; separate from recount and review.';
revoke execute on function ops.record_cafe_count_reason(uuid, text) from public, anon;
grant execute on function ops.record_cafe_count_reason(uuid, text) to authenticated;

create or replace function ops.confirm_cafe_count_line(p_line_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line ops.cafe_count_lines%rowtype;
begin
  if shared.current_org_id() is null or shared.current_person_id() is null
     or not (shared.is_org_member() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_line
    from ops.cafe_count_lines line
   where line.id = p_line_id and line.org_id = shared.current_org_id()
   for update;
  if not found then
    raise exception 'CAFE_COUNT_LINE_NOT_FOUND' using errcode = 'P0018';
  end if;
  if not ops.can_review_stream(v_line.branch_id, v_line.activity) then
    raise exception 'CAFE_COUNT_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if v_line.status <> 'Submitted' then
    raise exception 'CAFE_COUNT_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if p_expected_version is distinct from v_line.row_version then
    raise exception 'CAFE_COUNT_VERSION_STALE' using errcode = 'P0019';
  end if;
  if v_line.expected_status <> 'ready' or v_line.expected_balance is null or v_line.variance is null then
    raise exception 'CAFE_COUNT_EXPECTED_BALANCE_NOT_READY' using errcode = 'P0018';
  end if;
  -- No tolerance: any non-zero first-count difference needs a Recount, any non-zero final Variance a reason.
  if v_line.counted_quantity <> v_line.expected_balance and v_line.recounted_quantity is null then
    raise exception 'CAFE_COUNT_RECOUNT_REQUIRED' using errcode = 'P0020';
  end if;
  if v_line.variance <> 0 and v_line.reason is null then
    raise exception 'CAFE_COUNT_REASON_REQUIRED' using errcode = 'P0020';
  end if;

  perform set_config('app.cafe_count_action', 'confirm', true);
  update ops.cafe_count_lines line
     set status = 'Confirmed',
         reviewed_by = shared.current_person_id(),
         reviewed_at = clock_timestamp(),
         posting_status = case when line.variance = 0 then 'not_needed' else 'held' end,
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'status', v_line.status,
                            'posting_status', v_line.posting_status, 'row_version', v_line.row_version,
                            'variance', v_line.variance);
end;
$$;
comment on function ops.confirm_cafe_count_line(uuid, integer) is
  'The sole confirm transition. Reuses ops.can_review_stream; requires Submitted, a ready Expected balance, the current version, a Recount where the first count differs and a reason where the final Variance is non-zero. Zero closes not_needed; non-zero confirms held with no outbox row.';
revoke execute on function ops.confirm_cafe_count_line(uuid, integer) from public, anon, authenticated;
grant execute on function ops.confirm_cafe_count_line(uuid, integer) to authenticated;
