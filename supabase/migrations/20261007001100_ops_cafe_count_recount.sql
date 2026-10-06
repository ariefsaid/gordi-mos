-- #1368 — variance recounts, recorded reasons, and the owner-mandated independent review gate.
-- Posting remains closed here: a complete non-zero confirmation is held and creates no outbox row.
--
-- DOWN (manual, reversible before recount/reason data is relied on):
--   1. Verify no count line has recounted_quantity or reason set; this rollback intentionally drops those facts.
--   2. Restore ops.confirm_cafe_count_line(uuid, integer), ops.record_cafe_count_expected_balance(uuid, numeric),
--      and ops._guard_cafe_count_line() from 20261006002200_ops_cafe_count_tracer.sql.
--   3. Drop ops.record_cafe_count_recount(uuid, numeric), ops.record_cafe_count_reason(uuid, text),
--      ops.cafe_count_floor_lines(date), and ops.cafe_count_review_lines(date); drop the function-read
--      policy, revoke column SELECT grants, and restore table SELECT for authenticated.
--   4. Drop cafe_count_lines_recount_facts_ck and cafe_count_lines_reason_facts_ck; drop the six
--      recount/reason columns; restore variance as GENERATED ALWAYS AS (counted_quantity - expected_balance
--      when expected_status = 'ready') STORED, as defined in 20261006002200.

begin;

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
    or (reason is not null and btrim(reason) <> '' and length(btrim(reason)) <= 500
        and reason_entered_by is not null and reason_entered_at is not null)
  );
comment on column ops.cafe_count_lines.recounted_quantity is
  'One floor recount, kept beside the immutable first count; the effective count is the recount when present.';
comment on column ops.cafe_count_lines.reason is
  'Required when the final (recount-or-first) quantity still differs from the same worker snapshot; trimmed, non-blank, at most 500 characters.';

-- Authenticated floor clients must use the safe floor reader, never select reviewer facts directly.
-- SECURITY DEFINER readers below are owned by postgres and scoped here by the live session org.
revoke select on ops.cafe_count_lines from authenticated;
grant select (
  id, org_id, branch_id, activity, count_date, wip_item_id, item_name, item_category, item_kind,
  item_unit_id, unit_name, counted_quantity, submitted_by, submitted_at, recounted_quantity,
  recounted_by, recounted_at, reason, reason_entered_by, reason_entered_at, expected_status,
  expected_recorded_at, client_key, source, status, posting_status, reviewed_by, reviewed_at,
  row_version, updated_at
) on ops.cafe_count_lines to authenticated;
create policy cafe_count_lines_function_select on ops.cafe_count_lines
  for select to postgres
  using (org_id = (select shared.current_org_id()));

alter table ops.cafe_count_lines drop column variance;
alter table ops.cafe_count_lines
  add column variance numeric(14,4) generated always as (
    case when expected_status = 'ready'
         then coalesce(recounted_quantity, counted_quantity) - expected_balance end
  ) stored;
comment on column ops.cafe_count_lines.variance is
  'Generated exact stored-precision Variance = final Count (recount when present) - the unchanged Expected snapshot.';

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
    new.org_id := (select shared.current_org_id());
    new.submitted_by := (select shared.current_person_id());
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

  if v_action = 'expected'
     and old.recounted_quantity is null
     and new.status = old.status
     and new.posting_status = old.posting_status
     and new.recounted_quantity is not distinct from old.recounted_quantity
     and new.recounted_by is not distinct from old.recounted_by
     and new.recounted_at is not distinct from old.recounted_at
     and new.reason is not distinct from old.reason
     and new.reason_entered_by is not distinct from old.reason_entered_by
     and new.reason_entered_at is not distinct from old.reason_entered_at
     and new.reviewed_by is not distinct from old.reviewed_by
     and new.reviewed_at is not distinct from old.reviewed_at
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
     and new.expected_balance is not distinct from old.expected_balance
     and new.expected_status is not distinct from old.expected_status
     and new.expected_recorded_at is not distinct from old.expected_recorded_at
     and old.recounted_quantity is null
     and new.recounted_quantity is not null
     and new.recounted_by = (select shared.current_person_id())
     and new.recounted_at is not null
     and new.reason is null
     and new.reason_entered_by is null
     and new.reason_entered_at is null
     and new.reviewed_by is not distinct from old.reviewed_by
     and new.reviewed_at is not distinct from old.reviewed_at
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;

  if v_action = 'reason'
     and new.status = old.status
     and new.posting_status = old.posting_status
     and new.expected_balance is not distinct from old.expected_balance
     and new.expected_status is not distinct from old.expected_status
     and new.expected_recorded_at is not distinct from old.expected_recorded_at
     and new.recounted_quantity is not distinct from old.recounted_quantity
     and new.recounted_by is not distinct from old.recounted_by
     and new.recounted_at is not distinct from old.recounted_at
     and new.reason is not null
     and new.reason_entered_by = (select shared.current_person_id())
     and new.reason_entered_at is not null
     and new.reviewed_by is not distinct from old.reviewed_by
     and new.reviewed_at is not distinct from old.reviewed_at
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;

  if v_action = 'confirm'
     and old.status = 'Submitted'
     and new.status = 'Confirmed'
     and new.expected_balance is not distinct from old.expected_balance
     and new.expected_status is not distinct from old.expected_status
     and new.expected_recorded_at is not distinct from old.expected_recorded_at
     and new.recounted_quantity is not distinct from old.recounted_quantity
     and new.recounted_by is not distinct from old.recounted_by
     and new.recounted_at is not distinct from old.recounted_at
     and new.reason is not distinct from old.reason
     and new.reason_entered_by is not distinct from old.reason_entered_by
     and new.reason_entered_at is not distinct from old.reason_entered_at
     and new.reviewed_by = (select shared.current_person_id())
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
  'Stamps Count fields, preserves the first count and Expected snapshot, admits only worker/recount/reason/confirm actions, and freezes decisions. SECURITY INVOKER.';

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
  select * into v_line
    from ops.cafe_count_lines line
   where line.id = p_line_id
   for update;
  if not found or v_line.status <> 'Submitted' then
    raise exception 'CAFE_COUNT_LINE_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if v_line.recounted_quantity is not null then
    raise exception 'CAFE_COUNT_EXPECTED_SNAPSHOT_FROZEN' using errcode = '42501';
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
  'Worker-only Expected snapshot writer. Once a floor recount is recorded, that line''s original Expected snapshot cannot be refreshed.';
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
  v_needs_reason boolean;
begin
  if p_recounted_quantity is null or p_recounted_quantity < 0
     or p_recounted_quantity > 9999999999.9999
     or p_recounted_quantity <> trunc(p_recounted_quantity, 4) then
    raise exception 'CAFE_COUNT_RECOUNT_INVALID' using errcode = '22023';
  end if;
  if (select shared.current_org_id()) is null or (select shared.current_person_id()) is null
     or not ((select shared.is_cafe_affiliated())
          or (select shared.has_access_role('ops_lead'))
          or (select shared.has_access_role('admin'))) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_line
    from ops.cafe_count_lines line
   where line.id = p_line_id and line.org_id = (select shared.current_org_id())
   for update;
  if not found or v_line.status <> 'Submitted' then
    raise exception 'CAFE_COUNT_LINE_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if v_line.expected_status <> 'ready' or v_line.expected_balance is null then
    raise exception 'CAFE_COUNT_EXPECTED_BALANCE_NOT_READY' using errcode = 'P0018';
  end if;
  if v_line.recounted_quantity is not null then
    raise exception 'CAFE_COUNT_RECOUNT_ALREADY_RECORDED' using errcode = 'P0018';
  end if;
  if v_line.counted_quantity - v_line.expected_balance = 0 then
    raise exception 'CAFE_COUNT_RECOUNT_NOT_REQUIRED' using errcode = 'P0018';
  end if;

  v_needs_reason := p_recounted_quantity - v_line.expected_balance <> 0;
  perform set_config('app.cafe_count_action', 'recount', true);
  update ops.cafe_count_lines line
     set recounted_quantity = p_recounted_quantity,
         recounted_by = (select shared.current_person_id()),
         recounted_at = clock_timestamp(),
         reason = null,
         reason_entered_by = null,
         reason_entered_at = null,
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'row_version', v_line.row_version,
                            'reason_required', v_needs_reason);
end;
$$;
comment on function ops.record_cafe_count_recount(uuid, numeric) is
  'Floor-owned recount for a Submitted line whose first Count differs from its ready Expected snapshot. Preserves both the first Count and snapshot; returns only whether a reason is needed, never the Expected value or variance direction.';
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
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_reason = '' or length(v_reason) > 500 then
    raise exception 'CAFE_COUNT_REASON_INVALID' using errcode = '22023';
  end if;
  if (select shared.current_org_id()) is null or (select shared.current_person_id()) is null
     or not ((select shared.is_cafe_affiliated())
          or (select shared.has_access_role('ops_lead'))
          or (select shared.has_access_role('admin'))) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_line
    from ops.cafe_count_lines line
   where line.id = p_line_id and line.org_id = (select shared.current_org_id())
   for update;
  if not found or v_line.status <> 'Submitted' then
    raise exception 'CAFE_COUNT_LINE_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if v_line.expected_status <> 'ready' or v_line.recounted_quantity is null then
    raise exception 'CAFE_COUNT_RECOUNT_REQUIRED' using errcode = 'P0018';
  end if;
  if v_line.variance = 0 then
    raise exception 'CAFE_COUNT_REASON_NOT_REQUIRED' using errcode = 'P0018';
  end if;

  perform set_config('app.cafe_count_action', 'reason', true);
  update ops.cafe_count_lines line
     set reason = v_reason,
         reason_entered_by = (select shared.current_person_id()),
         reason_entered_at = clock_timestamp(),
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'row_version', v_line.row_version,
                            'reason_recorded', true);
end;
$$;
comment on function ops.record_cafe_count_reason(uuid, text) is
  'Floor-owned, trimmed and bounded explanation for a non-zero final Count. Stamps author/time and is separate from recount and review actions.';
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
  v_posting_status text;
begin
  if (select shared.current_org_id()) is null or (select shared.current_person_id()) is null
     or not ((select shared.is_org_member())
          or (select shared.has_access_role('ops_lead'))
          or (select shared.has_access_role('admin'))) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_line
    from ops.cafe_count_lines line
   where line.id = p_line_id and line.org_id = (select shared.current_org_id())
   for update;
  if not found then
    raise exception 'CAFE_COUNT_LINE_NOT_FOUND' using errcode = 'P0018';
  end if;
  -- OD-2026-10-06-ERP-MIN: independent review is ops_lead/admin only; neither submitter nor recounter.
  if not ((select shared.has_access_role('ops_lead')) or (select shared.has_access_role('admin'))) then
    raise exception 'CAFE_COUNT_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if v_line.submitted_by = (select shared.current_person_id())
     or v_line.recounted_by = (select shared.current_person_id()) then
    raise exception 'CAFE_COUNT_SELF_REVIEW_FORBIDDEN' using errcode = '42501';
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
  if v_line.counted_quantity - v_line.expected_balance <> 0 and v_line.recounted_quantity is null then
    raise exception 'CAFE_COUNT_RECOUNT_REQUIRED' using errcode = 'P0018';
  end if;
  if v_line.variance <> 0 and (v_line.reason is null or btrim(v_line.reason) = '') then
    raise exception 'CAFE_COUNT_REASON_REQUIRED' using errcode = 'P0018';
  end if;

  v_posting_status := case when v_line.variance = 0 then 'not_needed' else 'held' end;
  perform set_config('app.cafe_count_action', 'confirm', true);
  update ops.cafe_count_lines line
     set status = 'Confirmed',
         reviewed_by = (select shared.current_person_id()),
         reviewed_at = clock_timestamp(),
         posting_status = v_posting_status,
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'status', v_line.status,
                            'posting_status', v_line.posting_status, 'row_version', v_line.row_version,
                            'variance', v_line.variance);
end;
$$;
comment on function ops.confirm_cafe_count_line(uuid, integer) is
  'Independent ops_lead/admin review only (OD-2026-10-06-ERP-MIN). Requires Submitted, ready snapshot, required recount/reason and current version; exact zero closes not_needed, any fully explained non-zero line confirms held with no ERP outbox.';
revoke execute on function ops.confirm_cafe_count_line(uuid, integer) from public, anon, authenticated;
grant execute on function ops.confirm_cafe_count_line(uuid, integer) to authenticated;

create or replace function ops.cafe_count_floor_lines(p_count_date date)
returns table (
  id uuid,
  branch_id uuid,
  activity text,
  count_date date,
  wip_item_id uuid,
  item_name text,
  item_category text,
  item_kind text,
  item_unit_id uuid,
  unit_name text,
  counted_quantity numeric,
  recounted_quantity numeric,
  reason text,
  expected_ready boolean,
  recount_required boolean,
  reason_required boolean,
  status text,
  posting_status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  row_version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select shared.current_org_id()) is null
     or not ((select shared.is_cafe_affiliated())
          or (select shared.has_access_role('ops_lead'))
          or (select shared.has_access_role('admin'))) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select line.id, line.branch_id, line.activity, line.count_date, line.wip_item_id,
         line.item_name, line.item_category, line.item_kind, line.item_unit_id, line.unit_name,
         line.counted_quantity, line.recounted_quantity, line.reason,
         line.expected_status = 'ready',
         line.expected_status = 'ready' and line.recounted_quantity is null
           and line.counted_quantity is distinct from line.expected_balance,
         line.expected_status = 'ready' and line.recounted_quantity is not null
           and line.variance is distinct from 0 and line.reason is null,
         line.status, line.posting_status, line.submitted_at, line.reviewed_at, line.row_version
    from ops.cafe_count_lines line
   where line.org_id = (select shared.current_org_id())
     and line.count_date = p_count_date
     and line.status in ('Submitted', 'Confirmed')
   order by line.submitted_at desc;
end;
$$;
comment on function ops.cafe_count_floor_lines(date) is
  'Floor-safe Count reader. Returns only a boolean mismatch/reason prompt and count facts; Expected quantity and Variance are never returned to the browser.';
revoke execute on function ops.cafe_count_floor_lines(date) from public, anon;
grant execute on function ops.cafe_count_floor_lines(date) to authenticated;

create or replace function ops.cafe_count_review_lines(p_count_date date)
returns table (
  id uuid,
  branch_id uuid,
  activity text,
  count_date date,
  wip_item_id uuid,
  item_name text,
  item_category text,
  item_kind text,
  item_unit_id uuid,
  unit_name text,
  counted_quantity numeric,
  submitted_by uuid,
  recounted_quantity numeric,
  recounted_by uuid,
  recounted_at timestamptz,
  reason text,
  reason_entered_by uuid,
  reason_entered_at timestamptz,
  variance numeric,
  expected_balance numeric,
  expected_status text,
  expected_recorded_at timestamptz,
  status text,
  posting_status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  row_version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select shared.current_org_id()) is null
     or not ((select shared.has_access_role('ops_lead'))
          or (select shared.has_access_role('admin'))
          or (select shared.has_access_role('supervisor'))) then
    raise exception 'CAFE_COUNT_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select line.id, line.branch_id, line.activity, line.count_date, line.wip_item_id,
         line.item_name, line.item_category, line.item_kind, line.item_unit_id, line.unit_name,
         line.counted_quantity, line.submitted_by, line.recounted_quantity, line.recounted_by,
         line.recounted_at, line.reason, line.reason_entered_by, line.reason_entered_at,
         line.variance, line.expected_balance, line.expected_status, line.expected_recorded_at,
         line.status, line.posting_status, line.submitted_at, line.reviewed_at, line.row_version
    from ops.cafe_count_lines line
   where line.org_id = (select shared.current_org_id())
     and line.count_date = p_count_date
     and line.status in ('Submitted', 'Confirmed')
     and ((select shared.has_access_role('ops_lead'))
       or (select shared.has_access_role('admin'))
       or (select ops.is_stream_reviewer(line.branch_id, line.activity)))
   order by line.submitted_at desc;
end;
$$;
comment on function ops.cafe_count_review_lines(date) is
  'Reviewer-only Count reader. Exposes Expected/Variance to ops leads/admins and to supervisors only for their reviewable streams; floor roles receive the safe floor reader instead.';
revoke execute on function ops.cafe_count_review_lines(date) from public, anon;
grant execute on function ops.cafe_count_review_lines(date) to authenticated;

commit;
