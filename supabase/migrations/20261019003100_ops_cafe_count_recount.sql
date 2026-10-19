-- #1368 — the floor recounts and explains only Counts that differ; a complete non-zero Count confirms held.
-- Posting stays off: a confirmed non-zero line is held and no outbox row is written (the outbox path is #1373).
--
-- Count figures become readable only by reviewers: the floor reads its line states through
-- ops.cafe_count_floor_lines and never the Expected balance or Variance; reviewers read those through
-- ops.cafe_count_review_figures; record history keeps only that they changed.
--
-- DOWN (manual; drops recount and reason facts, so check none are relied on first):
--   0. drop function ops.cafe_count_floor_lines(uuid, text, date);
--      drop function ops.cafe_count_review_figures(uuid[]);
--      drop function ops._is_count_stream_member(uuid, text);
--      revoke select on ops.cafe_count_lines from authenticated; grant select on ops.cafe_count_lines to authenticated;
--      recreate trigger record_history_cafe_count_lines with ('-updated_at') only (the redacted history
--      values stay redacted; they are not recoverable).
--   1. Restore ops._guard_cafe_count_line(), ops.record_cafe_count_expected_balance(uuid, numeric) and
--      ops.confirm_cafe_count_line(uuid, integer) from 20261006002200_ops_cafe_count_tracer.sql.
--   2. drop function ops.record_cafe_count_recount(uuid, numeric);
--      drop function ops.record_cafe_count_reason(uuid, text);
--   3. alter table ops.cafe_count_lines alter column variance set expression as
--        (case when expected_status = 'ready' then counted_quantity - expected_balance end);
--   4. Restore ops._stock_comparison_rows(uuid, uuid, text, uuid) from 20261016000300_reporting_esb_stock_on_hand.sql.
--   5. alter table ops.cafe_count_lines drop constraint cafe_count_lines_recount_facts_ck,
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

-- The line's own stream: a current member of its (branch, activity) Team.
create or replace function ops._is_count_stream_member(p_branch_id uuid, p_activity text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from shared.team_memberships m
      join shared.teams t on t.id = m.team_id and t.org_id = m.org_id
     where m.org_id = shared.current_org_id()
       and m.person_id = shared.current_person_id()
       and t.branch_id = p_branch_id
       and t.activity = p_activity
       and t.archived_at is null
       and m.effective_from <= current_date
       and (m.effective_to is null or m.effective_to >= current_date)
  )
$$;
comment on function ops._is_count_stream_member(uuid, text) is
  'True when the caller is a current member of the stream Team for this branch and activity. Gates the floor''s recount and reason on a Count line.';
revoke execute on function ops._is_count_stream_member(uuid, text) from public, anon;
grant execute on function ops._is_count_stream_member(uuid, text) to authenticated;

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
  if not (ops._is_count_stream_member(v_line.branch_id, v_line.activity)
          or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_STREAM_FORBIDDEN' using errcode = '42501';
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
  'Floor Recount, by a member of the line''s stream (or ops lead/admin), for a Submitted line whose first count differs from its ready Expected snapshot. Once per line; keeps the first count and snapshot; returns only whether a reason is needed, never the Expected figure or the direction.';
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
  if not (ops._is_count_stream_member(v_line.branch_id, v_line.activity)
          or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_STREAM_FORBIDDEN' using errcode = '42501';
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
  'Floor reason, by a member of the line''s stream (or ops lead/admin), for a recounted line whose final Variance is still non-zero. Whitespace-trimmed, 1-500 characters; stamps who and when; separate from recount and review.';
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

-- The stock comparison reads the final counted quantity: the Recount when there is one, else the first count.
create or replace function ops._stock_comparison_rows(
  p_org_id uuid,
  p_branch_id uuid,
  p_activity text,
  p_snapshot_id uuid
)
returns table (
  item_id uuid,
  item_name text,
  item_kind text,
  item_category text,
  item_unit_id uuid,
  item_unit_name text,
  count_id uuid,
  counted_quantity numeric,
  count_date date,
  submitted_at timestamptz,
  count_status text,
  expected_quantity numeric,
  expected_unit_code text,
  expected_as_of timestamptz,
  expected_business_date date,
  expected_basis text,
  expected_snapshot_id uuid,
  expected_row_complete boolean,
  difference numeric,
  difference_pct numeric,
  missing text,
  flags text[],
  indicative boolean,
  zero_expected boolean,
  bucket text,
  row_data jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with countable as (
    select item.item_id, item.item_name, item.item_kind, item.item_category,
           item.item_unit_id, item.unit_name as item_unit_name, true as is_current
      from ops.cafe_countable_items(p_branch_id, p_activity) item
      join ops.item_units unit
        on unit.org_id = p_org_id and unit.id = item.item_unit_id
      join ops.wip_items catalog
        on catalog.org_id = p_org_id and catalog.id = item.item_id
  ), latest_counts as (
    select distinct on (line.wip_item_id, line.item_unit_id)
           line.wip_item_id as item_id, line.item_name, line.item_kind,
           line.item_category, line.item_unit_id, line.unit_name as item_unit_name,
           line.id as count_id, coalesce(line.recounted_quantity, line.counted_quantity) as counted_quantity, line.count_date,
           line.submitted_at, line.status as count_status
      from ops.cafe_count_lines line
     where line.org_id = p_org_id
       and line.branch_id = p_branch_id
       and line.activity = p_activity
       and line.status in ('Submitted', 'Confirmed')
     order by line.wip_item_id, line.item_unit_id,
              line.count_date desc, line.submitted_at desc, line.id desc
  ), candidates as (
    select distinct on (candidate.item_id, candidate.item_unit_id)
           candidate.item_id, candidate.item_name, candidate.item_kind,
           candidate.item_category, candidate.item_unit_id, candidate.item_unit_name
      from (
        select current_item.item_id, current_item.item_name, current_item.item_kind,
               current_item.item_category, current_item.item_unit_id,
               current_item.item_unit_name, true as is_current
          from countable current_item
        union all
        select history.item_id, history.item_name, history.item_kind,
               history.item_category, history.item_unit_id,
               history.item_unit_name, false as is_current
          from latest_counts history
      ) candidate
     order by candidate.item_id, candidate.item_unit_id, candidate.is_current desc,
              candidate.item_name
  ), countable_with_history as (
    select candidate.*, history.count_id, history.counted_quantity,
           history.count_date, history.submitted_at, history.count_status
      from candidates candidate
      left join latest_counts history
        on history.item_id = candidate.item_id
       and history.item_unit_id = candidate.item_unit_id
  ), scope_pool as (
    select exists (
      select 1
        from shared.teams other_team
       where other_team.org_id = p_org_id
         and other_team.branch_id = p_branch_id
         and other_team.activity in ('kitchen', 'bar')
         and other_team.activity <> p_activity
         and other_team.archived_at is null
    ) as ambiguous_pool
  ), coverage as (
    select snap.id as snapshot_id, snap.as_of, snap.business_date, snap.basis,
           coalesce(snap.source_complete and snap.ingestion_complete
             and cover.status = 'complete' and cover.exhausted
             and cover.source_evidence is not null, false) as source_complete
      from reporting.esb_stock_snapshots snap
      left join reporting.esb_stock_coverage cover
        on cover.org_id = snap.org_id
       and cover.snapshot_id = snap.id
       and cover.branch_code = (select branch.code from shared.branches branch
                                 where branch.org_id = p_org_id and branch.id = p_branch_id)
       and cover.partition_key = 'branch'
     where snap.org_id = p_org_id and snap.id = p_snapshot_id
       and snap.state = 'published'
  ), source_rows as (
    select stock.product_detail_code, sum(stock.quantity) as quantity,
           max(stock.unit_code) as unit_code,
           bool_and(stock.row_complete) as row_complete,
           count(distinct stock.unit_code) > 1 as unit_code_ambiguous
      from reporting.esb_stock_on_hand stock
     where stock.org_id = p_org_id
       and stock.snapshot_id = p_snapshot_id
       and stock.branch_code = (select branch.code from shared.branches branch
                                 where branch.org_id = p_org_id and branch.id = p_branch_id)
     group by stock.product_detail_code
  ), enriched as (
    select item.*,
           source.quantity as expected_quantity,
           source.unit_code as expected_unit_code,
           source.row_complete as source_row_complete,
           source.unit_code_ambiguous,
           coverage.as_of as expected_as_of,
           coverage.business_date as expected_business_date,
           coverage.basis as expected_basis,
           coverage.snapshot_id as expected_snapshot_id,
           coverage.source_complete,
           coalesce(unit_mapping.mappings, 0) as unit_mapping_count,
           scope_pool.ambiguous_pool
      from countable_with_history item
      cross join scope_pool
      left join coverage on true
      left join source_rows source
        on source.product_detail_code = (
          select unit.esb_product_detail_id
            from ops.item_units unit
           where unit.org_id = p_org_id and unit.id = item.item_unit_id
        )
      left join lateral (
        select count(*)::integer as mappings
          from ops.item_units unit
         where unit.org_id = p_org_id
           and unit.esb_product_detail_id = (
             select item_unit.esb_product_detail_id
               from ops.item_units item_unit
              where item_unit.org_id = p_org_id and item_unit.id = item.item_unit_id
           )
      ) unit_mapping on true
  ), compared as (
    select enriched.*,
           case
             when expected_snapshot_id is null then 'not_connected'
             when ambiguous_pool then 'ambiguous_pool'
             when not source_complete then 'partial'
             when expected_quantity is null then 'mapping_needed'
             when unit_mapping_count <> 1 or unit_code_ambiguous then 'unit_mismatch'
             when count_id is null then 'not_counted'
             else null
           end as missing,
           case
             when expected_snapshot_id is not null and source_complete
              and expected_quantity is not null and source_row_complete
              and unit_mapping_count = 1 and not unit_code_ambiguous
              and count_id is not null and not ambiguous_pool
               then counted_quantity - expected_quantity
             else null
           end as difference,
           (expected_quantity is not null and count_id is not null
             and expected_business_date is distinct from count_date)
             or (expected_quantity is not null and expected_basis = 'intraday') as indicative,
           expected_snapshot_id is not null and expected_quantity = 0
             and source_complete and source_row_complete and unit_mapping_count = 1
             and not unit_code_ambiguous and count_id is not null
             and not ambiguous_pool and counted_quantity <> 0 as zero_expected
      from enriched
  ), finalized as (
    select compared.*,
           case when difference is null then null
                when expected_quantity = 0 then null
                else case
                  when trunc((difference / abs(expected_quantity)) * 100, 9) = 0 and difference <> 0
                    then sign(difference) / 1000000000::numeric
                  else trunc((difference / abs(expected_quantity)) * 100, 9)
                end
           end as difference_pct
      from compared
  ), reasoned as (
    select finalized.*,
           array_remove(array[
             missing,
             case when difference < 0 then 'shortage'
                  when difference > 0 then 'surplus'
                  when difference = 0 then 'no_difference' end,
             case when count_status = 'Submitted' then 'pending_confirmation' end,
             case when indicative then 'different_times' end,
             case when expected_as_of is not null
                    and statement_timestamp() - expected_as_of > interval '24 hours'
                  then 'stale_esb' end,
             case when count_date is not null
                    and statement_timestamp() >
                      ((count_date + 1)::timestamp at time zone 'Asia/Jakarta') + interval '24 hours'
                  then 'old_count' end,
             case when zero_expected then 'zero_expected' end
           ]::text[], null) as flags,
           case when difference is null then 'unknown'
                when difference = 0 then 'zero' else 'gap' end as bucket
      from finalized
  )
  select reasoned.item_id, reasoned.item_name, reasoned.item_kind, reasoned.item_category,
         reasoned.item_unit_id, reasoned.item_unit_name, reasoned.count_id,
         reasoned.counted_quantity, reasoned.count_date, reasoned.submitted_at,
         reasoned.count_status, reasoned.expected_quantity, reasoned.expected_unit_code,
         reasoned.expected_as_of, reasoned.expected_business_date, reasoned.expected_basis,
         reasoned.expected_snapshot_id,
         coalesce(reasoned.source_complete and reasoned.source_row_complete, false),
         reasoned.difference, reasoned.difference_pct, reasoned.missing, reasoned.flags,
         reasoned.indicative, reasoned.zero_expected, reasoned.bucket,
         jsonb_build_object(
           'key', reasoned.item_id::text || ':' || reasoned.item_unit_id::text,
           'item_id', reasoned.item_id,
           'item_name', reasoned.item_name,
           'kind', reasoned.item_kind,
           'category', reasoned.item_category,
           'unit_id', reasoned.item_unit_id,
           'unit_name', reasoned.item_unit_name,
           'expected', case when reasoned.expected_quantity is null then null else jsonb_build_object(
             'quantity', reasoned.expected_quantity::text,
             'unit_code', reasoned.expected_unit_code,
             'as_of', reasoned.expected_as_of,
             'business_date', reasoned.expected_business_date,
             'basis', reasoned.expected_basis,
             'provenance', 'source_row',
             'snapshot_id', reasoned.expected_snapshot_id,
             'row_complete', coalesce(reasoned.source_complete and reasoned.source_row_complete, false)
           ) end,
           'count', case when reasoned.count_id is null then null else jsonb_build_object(
             'id', reasoned.count_id,
             'quantity', reasoned.counted_quantity::text,
             'unit_id', reasoned.item_unit_id,
             'unit_name', reasoned.item_unit_name,
             'count_date', reasoned.count_date,
             'submitted_at', reasoned.submitted_at,
             'status', reasoned.count_status
           ) end,
           'difference', case when reasoned.difference is null then null else reasoned.difference::text end,
           'difference_pct', case when reasoned.difference_pct is null then null else reasoned.difference_pct::text end,
           'missing', reasoned.missing,
           'flags', to_jsonb(reasoned.flags),
           'indicative', reasoned.indicative
         ) as row_data
    from reasoned
$$;
revoke execute on function ops._stock_comparison_rows(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;

-- ── Count figures are readable only by reviewers ────────────────────────────────────────────
-- The browser role reads every column except the Expected balance and Variance. Columns added later
-- are not readable until granted here explicitly.
revoke select on ops.cafe_count_lines from authenticated;
grant select (
  id, org_id, branch_id, activity, count_date, wip_item_id, item_name, item_category, item_kind,
  item_unit_id, unit_name, storage_location_id, counted_quantity, recounted_quantity, recounted_by,
  recounted_at, reason, reason_entered_by, reason_entered_at, expected_status, expected_recorded_at,
  client_key, source, status, posting_status, submitted_by, submitted_at, reviewed_by, reviewed_at,
  row_version, updated_at
) on ops.cafe_count_lines to authenticated;
comment on policy cafe_count_lines_select_org on ops.cafe_count_lines is
  'Current-org members read Count lines like Café logs; the Expected balance and Variance columns are not granted to the browser role and are read only through ops.cafe_count_review_figures.';

create or replace function ops.cafe_count_review_figures(p_line_ids uuid[])
returns table (id uuid, expected_balance numeric, variance numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select line.id, line.expected_balance, line.variance
    from ops.cafe_count_lines line
   where shared.current_org_id() is not null
     and shared.current_person_id() is not null
     and coalesce(cardinality(p_line_ids), 0) <= 500
     and line.org_id = shared.current_org_id()
     and line.id = any (p_line_ids)
     and ops.can_review_stream(line.branch_id, line.activity)
$$;
comment on function ops.cafe_count_review_figures(uuid[]) is
  'Reviewer-only read of the Expected balance and Variance for up to 500 Count lines: returns a line only to its stream reviewer, ops lead or admin.';
revoke execute on function ops.cafe_count_review_figures(uuid[]) from public, anon, service_role;
grant execute on function ops.cafe_count_review_figures(uuid[]) to authenticated;

create or replace function ops.cafe_count_floor_lines(p_branch_id uuid, p_activity text, p_count_date date)
returns table (id uuid, wip_item_id uuid, state text, row_version integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if shared.current_org_id() is null or shared.current_person_id() is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select line.id, line.wip_item_id,
         case
           when line.status = 'Confirmed' then case when line.posting_status = 'held' then 'held' else 'confirmed' end
           when line.expected_status <> 'ready' or line.variance is null then 'waiting'
           when line.counted_quantity <> line.expected_balance and line.recounted_quantity is null then 'needs_recount'
           when line.variance <> 0 and line.reason is null then 'needs_reason'
           else 'with_reviewer'
         end,
         line.row_version
    from ops.cafe_count_lines line
   where line.org_id = shared.current_org_id()
     and line.branch_id = p_branch_id
     and line.activity = p_activity
     and line.count_date = p_count_date
     and line.status in ('Submitted', 'Confirmed');
end;
$$;
comment on function ops.cafe_count_floor_lines(uuid, text, date) is
  'The floor''s view of a stream''s Count lines for a date: a state word per line (waiting, needs_recount, needs_reason, with_reviewer, confirmed, held), never the Expected balance, Variance or direction.';
revoke execute on function ops.cafe_count_floor_lines(uuid, text, date) from public, anon, service_role;
grant execute on function ops.cafe_count_floor_lines(uuid, text, date) to authenticated;

-- Record history keeps that the figures changed, never their values; earlier values are cleared.
drop trigger record_history_cafe_count_lines on ops.cafe_count_lines;
create trigger record_history_cafe_count_lines
  after insert or update or delete on ops.cafe_count_lines
  for each row execute function shared._record_history_write('-updated_at', '~expected_balance', '~variance');
update shared.record_history
   set old_value = null, new_value = null
 where schema_name = 'ops' and table_name = 'cafe_count_lines'
   and field_name in ('expected_balance', 'variance');
update shared.record_history
   set old_row_snapshot = old_row_snapshot - 'expected_balance' - 'variance'
 where schema_name = 'ops' and table_name = 'cafe_count_lines'
   and old_row_snapshot is not null;
