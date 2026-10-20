-- #1373–#1375 — one item-journal outbox group per confirmation action, worker state and current-only release.
-- The existing per-branch switch remains fail-closed. The deployment target must be non-dry-run;
-- the worker has its own independent default-off ESB_COUNT_JOURNAL_ENABLED gate.
-- DOWN: supabase/rollbacks/20261020001100_ops_cafe_count_item_journal_posting.sql.

begin;

-- ── Admit the count-journal family to the existing guarded outbox ──────────────────────────
alter table integrations.esb_push drop constraint esb_push_source_module_check;
alter table integrations.esb_push add constraint esb_push_source_module_check
  check (source_module in ('kitchen', 'roastery', 'cafe_receipt', 'cafe_purchase_request', 'cafe_count'));
alter table integrations.esb_push drop constraint esb_push_endpoint_check;
alter table integrations.esb_push add constraint esb_push_endpoint_check
  check (endpoint in ('assembly-actual', 'simple-transfer', 'noop', 'goods-receipt', 'purchase-request', 'count-journal'));
alter table integrations.esb_push_groups drop constraint esb_push_groups_source_module_check;
alter table integrations.esb_push_groups add constraint esb_push_groups_source_module_check
  check (source_module in ('kitchen', 'cafe_receipt', 'cafe_purchase_request', 'cafe_count'));
comment on column integrations.esb_push_groups.posting_stage is
  'Goods-receipt, purchase-request and count-journal groups. create_sent: a create may have reached ESB with its answer lost, so the worker looks the MOS key up before any create. awaiting_authorization: the worker created a number and ESB has not authorized it. operator_confirmed: procurement found and recorded the ESB number; the worker adopts it without another ERP call. Null: no ESB action is pending; with status posted, esb_doc_num is authorized.';

alter table ops.cafe_count_lines drop constraint cafe_count_lines_posting_status_check;
alter table ops.cafe_count_lines add constraint cafe_count_lines_posting_status_check
  check (posting_status in ('not_posted', 'not_needed', 'held', 'queued', 'awaiting_authorization', 'posted', 'failed'));

-- ── A worker-only transition on an otherwise frozen Count line ────────────────────────────
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

  -- Only a database-owned group transition may change posting state on a decided line.
  if v_action = 'posting'
     and old.status = 'Confirmed'
     and old.posting_status in ('held', 'queued', 'awaiting_authorization', 'failed')
     and new.posting_status in ('held', 'queued', 'awaiting_authorization', 'posted', 'failed')
     and new.posting_status is distinct from old.posting_status
     and new.row_version = old.row_version
     -- PostgreSQL computes the generated variance after BEFORE triggers.
     and (to_jsonb(new) - 'posting_status' - 'updated_at' - 'variance')
         is not distinct from (to_jsonb(old) - 'posting_status' - 'updated_at' - 'variance') then
    new.updated_at := clock_timestamp();
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
     and new.posting_status = (case when v_action = 'reject' then old.posting_status
                                    when old.variance = 0 then 'not_needed' else 'held' end)
     and (v_action = 'reject') = (new.review_note is not null)
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  raise exception 'CAFE_COUNT_UPDATE_REQUIRES_SERVER_ACTION' using errcode = '42501';
end;
$$;
comment on function ops._guard_cafe_count_line() is
  'Stamps browser-owned fields on insert, keeps the Expected snapshot and review decision immutable, and admits a separate database-only posting-state transition on confirmed lines. SECURITY INVOKER.';
revoke all on function ops._guard_cafe_count_line() from public, anon, authenticated;

-- ── One reusable enqueue path for confirmation and explicit held-line release ───────────────
create or replace function ops._enqueue_cafe_count_line(p_line_id uuid, p_action_id uuid, p_action text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line ops.cafe_count_lines%rowtype;
  v_env text := integrations.current_esb_target_env();
  v_branch_code text;
  v_group_id uuid;
  v_group_key text;
  v_member_key text;
  v_previous_action text := coalesce(current_setting('app.cafe_count_action', true), '');
  v_inserted integer;
begin
  if p_action not in ('confirm', 'release') then
    raise exception 'CAFE_COUNT_POSTING_ACTION_INVALID' using errcode = '22023';
  end if;
  select * into v_line from ops.cafe_count_lines line where line.id = p_line_id for update;
  if not found or v_line.status <> 'Confirmed' or v_line.posting_status <> 'held' or v_line.variance = 0 then
    return null;
  end if;
  if v_env = 'dry_run' or shared.is_sample_org(v_line.org_id)
     or not ops._cafe_count_expected_is_current(v_line.org_id, v_line.branch_id,
       v_line.activity, v_line.count_date, v_line.expected_recorded_at)
     or not coalesce((select s.posting_enabled from ops.cafe_count_posting_switches s
                       where s.org_id = v_line.org_id and s.branch_id = v_line.branch_id), false) then
    return null;
  end if;
  select b.code into v_branch_code
    from shared.branches b where b.org_id = v_line.org_id and b.id = v_line.branch_id;
  if v_branch_code is null then
    raise exception 'CAFE_COUNT_BRANCH_NOT_FOUND' using errcode = '22023';
  end if;
  v_group_key := 'cafe-count-' || p_action || '|' || p_action_id::text || '|'
    || v_line.branch_id::text || '|' || v_line.activity || '|' || v_line.count_date::text || '|' || v_env;
  insert into integrations.esb_push_groups (org_id, source_module, target_env, dedup_key)
  values (v_line.org_id, 'cafe_count', v_env, v_group_key)
  on conflict (dedup_key) do nothing;
  select g.id into v_group_id from integrations.esb_push_groups g
   where g.org_id = v_line.org_id and g.source_module = 'cafe_count' and g.dedup_key = v_group_key;
  if v_group_id is null then
    raise exception 'CAFE_COUNT_POSTING_GROUP_NOT_FOUND' using errcode = '23514';
  end if;
  v_member_key := 'cafe-count-line|' || v_line.id::text || '|' || v_env;
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key, push_group_id)
  values (v_line.org_id, 'cafe_count', v_line.id::text, 'count-journal',
          jsonb_build_object('line_id', v_line.id, 'branch_code', v_branch_code,
            'activity', v_line.activity, 'count_date', v_line.count_date::text,
            'item_unit_id', v_line.item_unit_id, 'variance', v_line.variance,
            'mos_key', 'MOS-CC-' || upper(replace(v_group_id::text, '-', ''))),
          v_env, v_member_key, v_group_id)
  on conflict (org_id, dedup_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 and not exists (
    select 1 from integrations.esb_push e
     where e.org_id = v_line.org_id and e.dedup_key = v_member_key and e.push_group_id = v_group_id
  ) then
    raise exception 'CAFE_COUNT_POSTING_MEMBER_CONFLICT' using errcode = '23505';
  end if;
  perform set_config('app.cafe_count_action', 'posting', true);
  update ops.cafe_count_lines line set posting_status = 'queued' where line.id = v_line.id;
  perform set_config('app.cafe_count_action', v_previous_action, true);
  return v_group_id;
end;
$$;
comment on function ops._enqueue_cafe_count_line(uuid, uuid, text) is
  'Internal fail-closed count enqueue. The per-branch switch, non-dry-run deployment gate and sample-org boundary must all pass; one action id groups lines by branch, stream and date, while member keys deduplicate each line per environment.';
revoke all on function ops._enqueue_cafe_count_line(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function ops._enqueue_cafe_count_line(uuid, uuid, text) from public, anon, authenticated;

create or replace function ops._enqueue_confirmed_cafe_count_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action_id uuid;
  v_raw text := nullif(current_setting('app.cafe_count_confirmation_id', true), '');
begin
  if old.status = 'Submitted' and new.status = 'Confirmed' and new.variance <> 0 then
    if v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_action_id := v_raw::uuid;
    else
      v_action_id := new.id;
    end if;
    perform ops._enqueue_cafe_count_line(new.id, v_action_id, 'confirm');
  end if;
  return new;
end;
$$;
revoke all on function ops._enqueue_confirmed_cafe_count_line() from public, anon, authenticated, service_role;
revoke execute on function ops._enqueue_confirmed_cafe_count_line() from public, anon, authenticated;
create trigger cafe_count_enqueue_on_confirmation
  after update of status on ops.cafe_count_lines
  for each row when (old.status = 'Submitted' and new.status = 'Confirmed')
  execute function ops._enqueue_confirmed_cafe_count_line();

-- Bulk confirmation gets one stable action id; the per-line RPC still owns each decision and version check.
create or replace function ops.confirm_cafe_count_line(p_line_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line ops.cafe_count_lines%rowtype;
  v_person_id uuid := shared.current_person_id();
  v_confirmation_id uuid;
  v_owns_confirmation_id boolean;
begin
  v_confirmation_id := nullif(current_setting('app.cafe_count_confirmation_id', true), '')::uuid;
  v_owns_confirmation_id := v_confirmation_id is null;
  if v_owns_confirmation_id then
    v_confirmation_id := gen_random_uuid();
    perform set_config('app.cafe_count_confirmation_id', v_confirmation_id::text, true);
  end if;
  if shared.current_org_id() is null or v_person_id is null
     or not (shared.is_org_member() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_line from ops.cafe_count_lines line
   where line.id = p_line_id and line.org_id = shared.current_org_id() for update;
  if not found then raise exception 'CAFE_COUNT_LINE_NOT_FOUND' using errcode = 'P0018'; end if;
  if not ops.can_review_stream(v_line.branch_id, v_line.activity) then
    raise exception 'CAFE_COUNT_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if v_line.submitted_by = v_person_id or v_line.recounted_by = v_person_id then
    raise exception 'CAFE_COUNT_SELF_APPROVAL' using errcode = '42501';
  end if;
  if v_line.status <> 'Submitted' then raise exception 'CAFE_COUNT_NOT_SUBMITTED' using errcode = 'P0018'; end if;
  if p_expected_version is distinct from v_line.row_version then
    raise exception 'CAFE_COUNT_VERSION_STALE' using errcode = 'P0019';
  end if;
  if v_line.expected_status <> 'ready' or v_line.expected_balance is null or v_line.variance is null then
    raise exception 'CAFE_COUNT_EXPECTED_BALANCE_NOT_READY' using errcode = 'P0018';
  end if;
  if v_line.counted_quantity <> v_line.expected_balance and v_line.recounted_quantity is null then
    raise exception 'CAFE_COUNT_RECOUNT_REQUIRED' using errcode = 'P0020';
  end if;
  if v_line.variance <> 0 and v_line.reason is null then
    raise exception 'CAFE_COUNT_REASON_REQUIRED' using errcode = 'P0020';
  end if;
  perform set_config('app.cafe_count_action', 'confirm', true);
  update ops.cafe_count_lines line
     set status = 'Confirmed', reviewed_by = v_person_id, reviewed_at = clock_timestamp(),
         posting_status = case when line.variance = 0 then 'not_needed' else 'held' end,
         row_version = line.row_version + 1
   where line.id = p_line_id returning * into v_line;
  select * into v_line from ops.cafe_count_lines line where line.id = p_line_id;
  if v_owns_confirmation_id then perform set_config('app.cafe_count_confirmation_id', '', true); end if;
  return jsonb_build_object('line_id', v_line.id, 'status', v_line.status,
    'posting_status', v_line.posting_status, 'row_version', v_line.row_version, 'variance', v_line.variance);
end;
$$;
comment on function ops.confirm_cafe_count_line(uuid, integer) is
  'The sole confirm transition. Reuses ops.can_review_stream and the submitter/recounter exclusion, requires Submitted, ready Expected, current version, any required recount and reason. A zero line closes not_needed; a non-zero line is held or queued in one confirmation group only when its branch switch and deployment gate allow it.';
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
  v_previous_confirmation_id text := coalesce(current_setting('app.cafe_count_confirmation_id', true), '');
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 200 then
    raise exception 'CAFE_COUNT_CONFIRM_LIMIT: confirm between 0 and 200 lines' using errcode = '22023';
  end if;
  perform set_config('app.cafe_count_confirmation_id', gen_random_uuid()::text, true);
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
      if v_state not in ('42501', 'P0018', 'P0019', 'P0020') then raise; end if;
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'line_id', v_line ->> 'line_id', 'outcome', 'refused', 'reason', split_part(v_message, ':', 1)));
    end;
  end loop;
  perform set_config('app.cafe_count_confirmation_id', v_previous_confirmation_id, true);
  return v_result;
end;
$$;
comment on function ops.confirm_cafe_count_lines(jsonb) is
  'Confirms up to 200 chosen lines with their own versions through the single-line decision. One action id groups eligible non-zero lines by stream and count date; each outcome is reported.';
revoke execute on function ops.confirm_cafe_count_lines(jsonb) from public, anon, authenticated;
grant execute on function ops.confirm_cafe_count_lines(jsonb) to authenticated;

-- ── Count posting state follows the outbox group; the group remains the posting authority ──
create or replace function ops._sync_cafe_count_group_posting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posting_status text;
  v_previous_action text := coalesce(current_setting('app.cafe_count_action', true), '');
begin
  if new.source_module <> 'cafe_count' then return new; end if;
  v_posting_status := case
    when new.status = 'posted' and nullif(new.esb_doc_num, '') is not null then 'posted'
    when new.status = 'dead_letter' then 'failed'
    when new.posting_stage = 'awaiting_authorization' then 'awaiting_authorization'
    when new.status = 'failed' then 'failed'
    else 'queued' end;
  perform set_config('app.cafe_count_action', 'posting', true);
  update ops.cafe_count_lines line
     set posting_status = v_posting_status
    from integrations.esb_push push
   where push.push_group_id = new.id and push.source_module = 'cafe_count'
     and push.org_id = new.org_id and line.org_id = new.org_id and line.id::text = push.source_ref
     and line.status = 'Confirmed' and line.posting_status in ('held', 'queued', 'awaiting_authorization', 'failed')
     and line.posting_status is distinct from v_posting_status;
  perform set_config('app.cafe_count_action', v_previous_action, true);
  return new;
end;
$$;
comment on function ops._sync_cafe_count_group_posting() is
  'Mirrors the count group''s queue, created-awaiting-authorization, failure or authorized-posted state to its frozen count lines. The group is the source of truth.';
revoke all on function ops._sync_cafe_count_group_posting() from public, anon, authenticated, service_role;
revoke execute on function ops._sync_cafe_count_group_posting() from public, anon, authenticated;
create trigger esb_push_groups_sync_cafe_count_posting
  after update of status, posting_stage, esb_doc_num on integrations.esb_push_groups
  for each row when (new.source_module = 'cafe_count')
  execute function ops._sync_cafe_count_group_posting();

-- ── Currentness check: no later ERP document, and no Approved kitchen log missing one ─────────
create or replace function ops._cafe_count_expected_is_current(
  p_org_id uuid, p_branch_id uuid, p_activity text, p_count_date date, p_expected_at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch_code text;
begin
  if p_expected_at is null then return false; end if;
  select b.code into v_branch_code from shared.branches b
   where b.org_id = p_org_id and b.id = p_branch_id;
  if v_branch_code is null then return false; end if;

  if exists (
    select 1 from ops.kitchen_logs l
     where l.org_id = p_org_id and (l.branch_id = p_branch_id or l.destination_branch_id = p_branch_id)
       and l.log_date = p_count_date and l.status = 'Approved' and l.posted_at >= p_expected_at
  ) then return false; end if;
  if exists (
    select 1 from ops.kitchen_logs l
     where l.org_id = p_org_id and (l.branch_id = p_branch_id or l.destination_branch_id = p_branch_id)
       and l.log_date = p_count_date
       and (l.status = 'Submitted' or (l.status = 'Approved'
         and (not l.posted_to_esb or nullif(l.esb_doc_num, '') is null or l.posted_at is null)))
  ) then return false; end if;
  if exists (
    select 1
      from ops.cafe_receipts r
      join ops.cafe_receipt_portions q on q.org_id = r.org_id and q.receipt_id = r.id
      join integrations.esb_push e on e.id = q.push_id and e.source_module = 'cafe_receipt'
      join integrations.esb_push_groups g on g.id = e.push_group_id
     where r.org_id = p_org_id and r.branch_id = p_branch_id and r.arrival_date = p_count_date
       and r.status = 'Approved' and g.status = 'posted' and g.posted_at > p_expected_at
  ) then return false; end if;
  if exists (
    select 1
      from integrations.esb_push e
      join integrations.esb_push_groups g on g.id = e.push_group_id
     where g.org_id = p_org_id and g.source_module = 'cafe_count' and g.status = 'posted'
       and g.posted_at > p_expected_at and e.source_module = 'cafe_count'
       and e.payload ->> 'branch_code' = v_branch_code
       and e.payload ->> 'count_date' = p_count_date::text
  ) then return false; end if;
  return true;
end;
$$;
comment on function ops._cafe_count_expected_is_current(uuid, uuid, text, date, timestamptz) is
  'A Count snapshot is current only when no ERP kitchen, receipt or count journal for its branch/date posted later and every Approved kitchen log for that branch/date has its ERP document (including waste). Internal reviewer/release predicate.';
revoke all on function ops._cafe_count_expected_is_current(uuid, uuid, text, date, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function ops._cafe_count_expected_is_current(uuid, uuid, text, date, timestamptz) from public, anon, authenticated;

create or replace function ops.release_cafe_count_posting(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_person_id uuid := shared.current_person_id();
  v_env text := integrations.current_esb_target_env();
  v_action_id uuid := gen_random_uuid();
  v_line ops.cafe_count_lines%rowtype;
  v_group_id uuid;
  v_released integer := 0;
  v_out_of_date integer := 0;
  v_held integer := 0;
begin
  if v_org_id is null or v_person_id is null
     or not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_POSTING_RELEASE_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.branches b where b.org_id = v_org_id and b.id = p_branch_id) then
    raise exception 'CAFE_COUNT_POSTING_BRANCH_INVALID' using errcode = '22023';
  end if;
  if not coalesce((select s.posting_enabled from ops.cafe_count_posting_switches s
                    where s.org_id = v_org_id and s.branch_id = p_branch_id), false) then
    raise exception 'CAFE_COUNT_POSTING_OFF' using errcode = '42501';
  end if;
  if v_env = 'dry_run' or shared.is_sample_org(v_org_id) then
    raise exception 'CAFE_COUNT_POSTING_GATE_CLOSED' using errcode = '55000';
  end if;

  for v_line in
    select line.* from ops.cafe_count_lines line
     where line.org_id = v_org_id and line.branch_id = p_branch_id and line.status = 'Confirmed'
       and line.posting_status = 'held' and line.variance <> 0
     order by line.count_date, line.activity, line.submitted_at, line.id
     for update
  loop
    if ops._cafe_count_expected_is_current(v_line.org_id, v_line.branch_id, v_line.activity,
                                          v_line.count_date, v_line.expected_recorded_at) then
      v_group_id := ops._enqueue_cafe_count_line(v_line.id, v_action_id, 'release');
      if v_group_id is not null then v_released := v_released + 1; end if;
    else
      v_out_of_date := v_out_of_date + 1;
    end if;
  end loop;
  select count(*)::integer into v_held from ops.cafe_count_lines line
   where line.org_id = v_org_id and line.branch_id = p_branch_id
     and line.status = 'Confirmed' and line.posting_status = 'held' and line.variance <> 0;
  return jsonb_build_object('released_lines', v_released,
    'expected_out_of_date_lines', v_out_of_date, 'held_lines', v_held);
end;
$$;
comment on function ops.release_cafe_count_posting(uuid) is
  'Ops lead/admin release for one enabled branch. Enqueues each current held non-zero Count once, leaves stale lines held for correction, and reports the out-of-date count without storing a stale state.';
revoke execute on function ops.release_cafe_count_posting(uuid) from public, anon;
grant execute on function ops.release_cafe_count_posting(uuid) to authenticated;

-- ── Reviewer-only reads: posting details never cross the floor boundary ─────────────────────
create or replace function ops.list_cafe_count_posting_switches()
returns table (branch_id uuid, branch_name text, posting_enabled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if shared.current_org_id() is null or shared.current_person_id() is null
     or not shared.has_access_role('admin') then
    raise exception 'CAFE_COUNT_POSTING_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select b.id, b.name, coalesce(s.posting_enabled, false)
    from shared.branches b
    left join ops.cafe_count_posting_switches s on s.org_id = b.org_id and s.branch_id = b.id
   where b.org_id = shared.current_org_id() and b.archived_at is null
   order by b.name, b.id;
end;
$$;
comment on function ops.list_cafe_count_posting_switches() is
  'Admin-only current-organization branch list for the fail-closed Count posting controls.';
revoke execute on function ops.list_cafe_count_posting_switches() from public, anon, service_role;
grant execute on function ops.list_cafe_count_posting_switches() to authenticated;

create or replace function ops.cafe_count_posting_queue()
returns table (
  line_id uuid, branch_id uuid, branch_name text, activity text, count_date date,
  item_name text, unit_name text, posting_status text, esb_doc_num text,
  posting_error text, expected_out_of_date boolean, posting_enabled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select line.id, line.branch_id, b.name, line.activity, line.count_date,
         line.item_name, line.unit_name, line.posting_status, posting.esb_doc_num,
         posting.posting_error,
         line.posting_status = 'held' and not ops._cafe_count_expected_is_current(
           line.org_id, line.branch_id, line.activity, line.count_date, line.expected_recorded_at),
         coalesce(s.posting_enabled, false)
    from ops.cafe_count_lines line
    join shared.branches b on b.org_id = line.org_id and b.id = line.branch_id
    left join ops.cafe_count_posting_switches s on s.org_id = line.org_id and s.branch_id = line.branch_id
    left join lateral (
      select g.esb_doc_num, coalesce(g.last_error, e.last_error) as posting_error
        from integrations.esb_push e
        left join integrations.esb_push_groups g on g.id = e.push_group_id
       where e.org_id = line.org_id and e.source_module = 'cafe_count' and e.source_ref = line.id::text
       order by e.created_at desc, e.id desc limit 1
    ) posting on true
   where shared.current_org_id() is not null and shared.current_person_id() is not null
     and line.org_id = shared.current_org_id() and line.status = 'Confirmed'
     and line.posting_status in ('held', 'queued', 'awaiting_authorization', 'failed', 'posted')
     and (line.posting_status <> 'posted'
          or line.count_date >= (statement_timestamp() at time zone 'Asia/Jakarta')::date - 7)
     and ops.can_review_stream(line.branch_id, line.activity)
   order by (line.posting_status = 'posted'), line.count_date desc, b.name, line.activity, line.item_name, line.id
   limit 2000
$$;
comment on function ops.cafe_count_posting_queue() is
  'Reviewer-only Count posting state and safe release queue. Includes held, queued, awaiting-authorization and failed lines plus the last seven days of posted lines; computes expected-out-of-date without storing it and returns no Expected figure or Variance.';
revoke execute on function ops.cafe_count_posting_queue() from public, anon, service_role;
grant execute on function ops.cafe_count_posting_queue() to authenticated;

commit;
