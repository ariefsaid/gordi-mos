-- Rollback for 20261020001200. Keeps confirmed counts and their posting groups intact.
-- Refuses to discard correction history, unavailable reasons or an active Expected read.
begin;
lock table ops.cafe_count_lines, integrations.esb_push, integrations.esb_push_groups in access exclusive mode;
do $$
begin
  if exists (select 1 from ops.cafe_count_lines where correction_of is not null)
     or exists (select 1 from integrations.esb_push_groups
                 where correction_of_line_id is not null or correction_of_group_id is not null) then
    raise exception 'resolve correction history before rollback' using errcode = '55000';
  end if;
  if exists (select 1 from ops.cafe_count_lines where expected_status = 'unavailable') then
    raise exception 'resolve unavailable Expected snapshots before rollback' using errcode = '55000';
  end if;
  if exists (select 1 from integrations.esb_push
              where source_module = 'cafe_count_expected' and status = 'in_flight') then
    raise exception 'finish active Expected reads before rollback' using errcode = '55000';
  end if;
end;
$$;

drop function ops.cafe_count_review_figures(uuid[]);
drop function ops.cafe_count_review_metadata(uuid[]);
drop function ops.cafe_count_posting_queue();
drop function ops.cafe_count_floor_lines(uuid,text,date);
drop function ops.start_cafe_count_correction(uuid,numeric,uuid);
drop function ops.refresh_cafe_count_expected(uuid);
drop function ops.complete_cafe_count_expected(uuid,integer,numeric,timestamptz,text);
drop function ops.claim_cafe_count_expected(uuid);
drop function ops.cafe_count_expected_queue(text,integer);
drop function ops._cafe_count_expected_can_read(uuid);
drop function ops._cafe_count_correction_allowed(uuid);
drop function ops._cafe_count_movements_settled(uuid,uuid,date);
drop function ops._enqueue_cafe_count_line(uuid,uuid,text);
alter function ops._enqueue_cafe_count_line_base(uuid,uuid,text) rename to _enqueue_cafe_count_line;

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
revoke all on function ops._guard_cafe_count_line() from public,anon,authenticated,service_role;

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
revoke all on function ops.release_cafe_count_posting(uuid) from public,anon,authenticated,service_role;
grant execute on function ops.release_cafe_count_posting(uuid) to authenticated;

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
revoke all on function ops.cafe_count_posting_queue() from public,anon,authenticated,service_role;
grant execute on function ops.cafe_count_posting_queue() to authenticated;

create function ops.cafe_count_review_figures(p_line_ids uuid[])
returns table (id uuid, expected_balance numeric, variance numeric, review_note text)
language sql
stable
security definer
set search_path = ''
as $$
  select line.id, line.expected_balance, line.variance, line.review_note
    from ops.cafe_count_lines line
   where shared.current_org_id() is not null
     and shared.current_person_id() is not null
     and coalesce(cardinality(p_line_ids), 0) <= 500
     and line.org_id = shared.current_org_id()
     and line.id = any (p_line_ids)
     and ops.can_review_stream(line.branch_id, line.activity)
$$;
revoke all on function ops.cafe_count_review_figures(uuid[]) from public,anon,authenticated,service_role;
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
revoke all on function ops.cafe_count_floor_lines(uuid,text,date) from public,anon,authenticated,service_role;
grant execute on function ops.cafe_count_floor_lines(uuid,text,date) to authenticated;

delete from integrations.esb_push where source_module = 'cafe_count_expected';
alter table integrations.esb_push drop constraint esb_push_source_module_check;
alter table integrations.esb_push add constraint esb_push_source_module_check
  check (source_module in ('kitchen','roastery','cafe_receipt','cafe_purchase_request','cafe_count'));
alter table integrations.esb_push drop constraint esb_push_endpoint_check;
alter table integrations.esb_push add constraint esb_push_endpoint_check
  check (endpoint in ('assembly-actual','simple-transfer','noop','goods-receipt','purchase-request','count-journal'));
alter table integrations.esb_push_groups
  drop constraint cafe_count_correction_group_fk,
  drop constraint cafe_count_correction_group_line_fk,
  drop column correction_of_line_id,
  drop column correction_of_group_id,
  drop constraint esb_push_groups_org_id_id_unique;

revoke select (correction_of) on ops.cafe_count_lines from authenticated;
drop index ops.cafe_count_one_open_correction;
drop index ops.cafe_count_lines_live_branch_item_day_location_uidx;
alter table ops.cafe_count_lines
  drop constraint cafe_count_correction_original_fk,
  drop constraint cafe_count_correction_not_self,
  drop constraint cafe_count_lines_expected_snapshot_check,
  drop constraint cafe_count_lines_expected_status_check,
  drop column correction_of,
  drop column expected_as_of,
  drop column expected_unit_id,
  drop column expected_unavailable_reason;
create unique index cafe_count_lines_live_branch_item_day_location_uidx
  on ops.cafe_count_lines(org_id,branch_id,count_date,wip_item_id,storage_location_id)
  nulls not distinct where status in ('Submitted','Confirmed');
alter table ops.cafe_count_lines add constraint cafe_count_lines_expected_status_check
  check (expected_status in ('waiting','ready'));
alter table ops.cafe_count_lines add constraint cafe_count_lines_expected_snapshot_check check (
  (expected_status = 'waiting' and expected_balance is null and expected_recorded_at is null)
  or (expected_status = 'ready' and expected_balance is not null and expected_recorded_at is not null)
);
commit;
