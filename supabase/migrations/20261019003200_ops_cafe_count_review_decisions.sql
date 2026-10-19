-- #1369 — reviewer decisions on the day's Count: reject with a note, confirm several lines at once,
-- and the self-approval rule. Posting stays off; nothing here writes the outbox.
--
-- DOWN (manual; drops reject notes, so check none are relied on first):
--   1. drop function ops.confirm_cafe_count_lines(jsonb);
--      drop function ops.reject_cafe_count_line(uuid, integer, text);
--   2. Restore ops.confirm_cafe_count_line(uuid, integer) and ops._guard_cafe_count_line() from
--      20261019003100_ops_cafe_count_recount.sql.
--   3. alter table ops.cafe_count_lines drop constraint cafe_count_lines_review_note_ck, drop column review_note;

alter table ops.cafe_count_lines
  add column review_note text,
  add constraint cafe_count_lines_review_note_ck check (
    (status = 'Rejected' and review_note is not null and btrim(review_note) <> '' and char_length(review_note) <= 500)
    or (status <> 'Rejected' and review_note is null)
  );
comment on column ops.cafe_count_lines.review_note is
  'The reviewer''s required note on a Rejected line; the counter re-enters the item as a new line. Null on every other line.';

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
    new.review_note := null;
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
  'Stamps browser-owned fields on insert, keeps the first count and Expected snapshot, admits only the worker, recount, reason, confirm and reject actions each changing its own columns, and freezes decided lines. SECURITY INVOKER.';
revoke all on function ops._guard_cafe_count_line() from public, anon, authenticated;

create or replace function ops.confirm_cafe_count_line(p_line_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line ops.cafe_count_lines%rowtype;
  v_person_id uuid := shared.current_person_id();
begin
  if shared.current_org_id() is null or v_person_id is null
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
  -- OD-2026-10-06-ERP-MIN: a second person approves; the submitter and the recounter never approve their own line.
  if v_line.submitted_by = v_person_id or v_line.recounted_by = v_person_id then
    raise exception 'CAFE_COUNT_SELF_APPROVAL' using errcode = '42501';
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
         reviewed_by = v_person_id,
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
  'The sole confirm transition. Reuses ops.can_review_stream and refuses the line''s submitter or recounter; requires Submitted, a ready Expected balance, the current version, a Recount where the first count differs and a reason where the final Variance is non-zero. Zero closes not_needed; non-zero confirms held with no outbox row.';
revoke execute on function ops.confirm_cafe_count_line(uuid, integer) from public, anon, authenticated;
grant execute on function ops.confirm_cafe_count_line(uuid, integer) to authenticated;

create or replace function ops.confirm_cafe_count_lines(p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_result jsonb := '[]'::jsonb;
  v_state text;
  v_message text;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 200 then
    raise exception 'CAFE_COUNT_CONFIRM_LIMIT: confirm between 0 and 200 lines' using errcode = '22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(v_line ->> 'line_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_line ->> 'row_version', '') !~ '^[0-9]{1,9}$' then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'line_id', v_line ->> 'line_id', 'outcome', 'refused', 'reason', 'CAFE_COUNT_LINE_INVALID'));
      continue;
    end if;
    begin
      v_result := v_result || jsonb_build_array(ops.confirm_cafe_count_line(
        (v_line ->> 'line_id')::uuid, (v_line ->> 'row_version')::integer) || jsonb_build_object('outcome', 'confirmed'));
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      if v_state not in ('42501', 'P0018', 'P0019', 'P0020') then
        raise;
      end if;
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'line_id', v_line ->> 'line_id', 'outcome', 'refused', 'reason', split_part(v_message, ':', 1)));
    end;
  end loop;
  return v_result;
end;
$$;
comment on function ops.confirm_cafe_count_lines(jsonb) is
  'Confirms up to 200 chosen lines, each with its own version token, through ops.confirm_cafe_count_line. One refused line never blocks the others; each outcome is reported.';
revoke execute on function ops.confirm_cafe_count_lines(jsonb) from public, anon, authenticated;
grant execute on function ops.confirm_cafe_count_lines(jsonb) to authenticated;

create or replace function ops.reject_cafe_count_line(p_line_id uuid, p_expected_version integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line ops.cafe_count_lines%rowtype;
  v_note text := regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g');
begin
  if shared.current_org_id() is null or shared.current_person_id() is null then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  if v_note = '' or char_length(v_note) > 500 then
    raise exception 'CAFE_COUNT_REJECT_NOTE_REQUIRED' using errcode = '22023';
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

  perform set_config('app.cafe_count_action', 'reject', true);
  update ops.cafe_count_lines line
     set status = 'Rejected',
         review_note = v_note,
         reviewed_by = shared.current_person_id(),
         reviewed_at = clock_timestamp(),
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'status', v_line.status, 'row_version', v_line.row_version);
end;
$$;
comment on function ops.reject_cafe_count_line(uuid, integer, text) is
  'Reviewer rejects a wrong figure with a required note (1-500 characters) and the current version. The line freezes and frees its branch, item and date, so the counter enters the item again as a new line; no figure is edited.';
revoke execute on function ops.reject_cafe_count_line(uuid, integer, text) from public, anon, authenticated;
grant execute on function ops.reject_cafe_count_line(uuid, integer, text) to authenticated;
