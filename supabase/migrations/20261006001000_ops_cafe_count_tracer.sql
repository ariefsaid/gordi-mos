-- #1366 — blind, daily Café Counts, review of zero Variance, and the closed posting switch.
-- ERP expected-balance reads are deliberately worker-stubbed here; this migration does not touch
-- calculated Stock, production records, or the outbox.

create table ops.cafe_count_lines (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references shared.orgs(id) on delete cascade,
  branch_id          uuid not null,
  activity           text not null,
  count_date         date not null,
  wip_item_id        uuid not null,
  item_name          text not null,
  item_category      text,
  item_kind          text not null check (item_kind in ('RAW', 'WIP')),
  item_unit_id       uuid not null,
  unit_name          text not null,
  counted_quantity   numeric(14,4) not null check (counted_quantity >= 0),
  variance           numeric(14,4) generated always as (
                       case when expected_status = 'ready'
                            then counted_quantity - expected_balance end
                     ) stored,
  expected_balance   numeric(14,4),
  expected_status    text not null default 'waiting'
                       check (expected_status in ('waiting', 'ready')),
  expected_recorded_at timestamptz,
  client_key         uuid not null,
  source             text not null default 'mos' check (source = 'mos'),
  status             text not null default 'Submitted'
                       check (status in ('Submitted', 'Confirmed', 'Rejected')),
  posting_status     text not null default 'not_posted'
                       check (posting_status in ('not_posted', 'not_needed', 'held', 'posted', 'failed')),
  submitted_by       uuid not null references shared.people(id),
  submitted_at       timestamptz not null default now(),
  reviewed_by        uuid references shared.people(id),
  reviewed_at        timestamptz,
  row_version        integer not null default 1 check (row_version > 0),
  updated_at         timestamptz not null default now(),
  constraint cafe_count_lines_org_id_id_uk unique (org_id, id),
  constraint cafe_count_lines_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade,
  constraint cafe_count_lines_stream_item_fk foreign key (org_id, branch_id, activity, wip_item_id)
    references ops.stream_items (org_id, branch_id, activity, wip_item_id) on delete restrict,
  constraint cafe_count_lines_expected_snapshot_check check (
    (expected_status = 'waiting' and expected_balance is null and expected_recorded_at is null)
    or (expected_status = 'ready' and expected_balance is not null and expected_recorded_at is not null)
  )
);
comment on table ops.cafe_count_lines is
  'One blind, physical Cafe Count for an active ERP item/unit on a stream. The worker writes Expected balance; Variance is generated exactly at stored precision. Confirmed rows are immutable; zero Variance closes as not_needed and never creates an ERP document.';
comment on column ops.cafe_count_lines.variance is
  'Generated exact stored-precision Variance = counted_quantity - expected_balance when the expected snapshot is ready.';
comment on column ops.cafe_count_lines.client_key is
  'Client-generated idempotency key, unique per org and submitter; it is the only submit metadata accepted from the browser.';

create unique index cafe_count_lines_live_branch_item_day_uidx
  on ops.cafe_count_lines (org_id, branch_id, count_date, wip_item_id)
  where status in ('Submitted', 'Confirmed');
create unique index cafe_count_lines_submitter_client_key_uidx
  on ops.cafe_count_lines (org_id, submitted_by, client_key);
create index cafe_count_lines_review_queue_idx
  on ops.cafe_count_lines (org_id, branch_id, activity, status, count_date, submitted_at);

alter table ops.cafe_count_lines enable row level security;
alter table ops.cafe_count_lines force row level security;
revoke all on ops.cafe_count_lines from public, anon, authenticated, service_role;
grant select on ops.cafe_count_lines to authenticated, service_role;
create policy cafe_count_lines_select_org on ops.cafe_count_lines
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (select shared.is_org_member())
  );
comment on policy cafe_count_lines_select_org on ops.cafe_count_lines is
  'Like Café logs, all current-org members can read Count lines (blindness is an entry UX default, not an access boundary).';

create table ops.cafe_count_posting_switches (
  org_id          uuid not null references shared.orgs(id) on delete cascade,
  branch_id       uuid not null,
  posting_enabled boolean not null default false,
  updated_by      uuid references shared.people(id),
  updated_at      timestamptz not null default now(),
  primary key (org_id, branch_id),
  constraint cafe_count_posting_switches_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade
);
comment on table ops.cafe_count_posting_switches is
  'One fail-closed Count-posting switch per branch. Newly created branches and all backfilled rows start off; only the admin RPC can change it.';

alter table ops.cafe_count_posting_switches enable row level security;
alter table ops.cafe_count_posting_switches force row level security;
revoke all on ops.cafe_count_posting_switches from public, anon, authenticated, service_role;
grant select on ops.cafe_count_posting_switches to authenticated, service_role;
create policy cafe_count_posting_switches_select_org on ops.cafe_count_posting_switches
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (select shared.is_org_member())
  );
comment on policy cafe_count_posting_switches_select_org on ops.cafe_count_posting_switches is
  'Org members may read the fail-closed branch switch; writes are only through the admin-checked RPC.';

insert into ops.cafe_count_posting_switches (org_id, branch_id, posting_enabled)
select b.org_id, b.id, false
  from shared.branches b
 where b.archived_at is null
on conflict (org_id, branch_id) do nothing;

create or replace function ops._ensure_cafe_count_posting_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ops.cafe_count_posting_switches (org_id, branch_id, posting_enabled)
  values (new.org_id, new.id, false)
  on conflict (org_id, branch_id) do nothing;
  return new;
end;
$$;
revoke execute on function ops._ensure_cafe_count_posting_switch() from public, anon, authenticated, service_role;
create trigger cafe_count_posting_switch_for_branch
  after insert on shared.branches
  for each row execute function ops._ensure_cafe_count_posting_switch();

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
     and new.status = old.status
     and new.posting_status = old.posting_status
     and new.reviewed_by is not distinct from old.reviewed_by
     and new.reviewed_at is not distinct from old.reviewed_at
     and new.expected_status = 'ready'
     and new.expected_balance is not null
     and new.expected_recorded_at is not null
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
     and new.reviewed_by = shared.current_person_id()
     and new.reviewed_at is not null
     and new.posting_status = 'not_needed'
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  raise exception 'CAFE_COUNT_UPDATE_REQUIRES_SERVER_ACTION' using errcode = '42501';
end;
$$;
comment on function ops._guard_cafe_count_line() is
  'Stamps all browser-owned server fields, rechecks the countable item/unit, permits only the worker expected-snapshot write and current-version zero-Variance review transition, and freezes decisions. SECURITY INVOKER.';
revoke all on function ops._guard_cafe_count_line() from public, anon, authenticated;
create trigger cafe_count_lines_guard
  before insert or update on ops.cafe_count_lines
  for each row execute function ops._guard_cafe_count_line();
create trigger cafe_count_lines_updated_at
  before update on ops.cafe_count_lines
  for each row execute function shared.set_updated_at();

create or replace function ops.submit_cafe_counts(p_branch_id uuid, p_activity text, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_key uuid;
  v_item_id uuid;
  v_qty numeric;
  v_existing ops.cafe_count_lines%rowtype;
  v_item record;
  v_result jsonb := '[]'::jsonb;
  v_outcome jsonb;
  v_org_id uuid := shared.current_org_id();
  v_submitter_id uuid := shared.current_person_id();
  v_today date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
begin
  if v_org_id is null or v_submitter_id is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = v_org_id and t.branch_id = p_branch_id and t.activity = p_activity
      and t.archived_at is null and b.archived_at is null
  ) then
    raise exception 'CAFE_COUNT_STREAM_NOT_FOUND' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'CAFE_COUNT_SUBMIT_LIMIT: submit between 0 and 150 lines' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 150 then
    raise exception 'CAFE_COUNT_SUBMIT_LIMIT: submit between 0 and 150 lines' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    v_key := null;
    v_item_id := null;
    v_qty := null;
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(v_line ->> 'client_key', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'client_key', v_line ->> 'client_key', 'outcome', 'refused', 'reason', 'invalid_line'));
      continue;
    end if;
    v_key := (v_line ->> 'client_key')::uuid;
    if coalesce(v_line ->> 'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_line ->> 'quantity', '') !~ '^([0-9]+)([.,][0-9]{1,4})?$' then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'client_key', v_key, 'outcome', 'refused', 'reason', 'invalid_quantity_or_item'));
      continue;
    end if;
    v_item_id := (v_line ->> 'item_id')::uuid;
    v_qty := replace(v_line ->> 'quantity', ',', '.')::numeric;
    if v_qty > 9999999999.9999 then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'client_key', v_key, 'outcome', 'refused', 'reason', 'invalid_quantity'));
      continue;
    end if;

    select * into v_existing
      from ops.cafe_count_lines line
     where line.org_id = v_org_id and line.submitted_by = v_submitter_id and line.client_key = v_key;
    if found then
      if v_existing.branch_id = p_branch_id
         and v_existing.activity = p_activity
         and v_existing.wip_item_id = v_item_id
         and v_existing.counted_quantity = v_qty then
        v_outcome := jsonb_build_object('client_key', v_key, 'outcome', 'existing', 'line_id', v_existing.id);
      else
        v_outcome := jsonb_build_object('client_key', v_key, 'outcome', 'refused', 'reason', 'client_key_conflict');
      end if;
      v_result := v_result || jsonb_build_array(v_outcome);
      continue;
    end if;

    select * into v_item
      from ops.cafe_countable_items(p_branch_id, p_activity) item
     where item.item_id = v_item_id;
    if not found then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'client_key', v_key, 'outcome', 'refused', 'reason', 'item_not_countable'));
      continue;
    end if;

    begin
      insert into ops.cafe_count_lines (
        org_id, branch_id, activity, count_date, wip_item_id,
        item_name, item_category, item_kind, item_unit_id, unit_name,
        counted_quantity, client_key, source, status, posting_status, submitted_by
      ) values (
        v_org_id, p_branch_id, p_activity, v_today, v_item.item_id,
        v_item.item_name, v_item.item_category, v_item.item_kind, v_item.item_unit_id, v_item.unit_name,
        v_qty, v_key, 'mos', 'Submitted', 'not_posted', v_submitter_id
      ) returning * into v_existing;
      v_outcome := jsonb_build_object('client_key', v_key, 'outcome', 'submitted', 'line_id', v_existing.id);
    exception when unique_violation then
      select * into v_existing
        from ops.cafe_count_lines line
       where line.org_id = v_org_id and line.submitted_by = v_submitter_id and line.client_key = v_key;
      if found and v_existing.branch_id = p_branch_id and v_existing.activity = p_activity
         and v_existing.wip_item_id = v_item_id and v_existing.counted_quantity = v_qty then
        v_outcome := jsonb_build_object('client_key', v_key, 'outcome', 'existing', 'line_id', v_existing.id);
      else
        v_outcome := jsonb_build_object('client_key', v_key, 'outcome', 'refused', 'reason', 'already_counted');
      end if;
    end;
    v_result := v_result || jsonb_build_array(v_outcome);
  end loop;
  return v_result;
end;
$$;
comment on function ops.submit_cafe_counts(uuid, text, jsonb) is
  'Atomically processes at most 150 Count lines independently. Accepts only client key, item id and decimal quantity; stamps org, submitter, WIB date, source, status, expected snapshot and posting state; idempotent per line.';
revoke execute on function ops.submit_cafe_counts(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function ops.submit_cafe_counts(uuid, text, jsonb) to authenticated;

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
  'Worker-only expected-balance seam for the future ERP reader. Stamps its own observation time and exact line unit, increments the version, and never accepts a browser call.';
revoke execute on function ops.record_cafe_count_expected_balance(uuid, numeric) from public, anon, authenticated;
grant execute on function ops.record_cafe_count_expected_balance(uuid, numeric) to service_role;

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
  if v_line.variance <> 0 then
    raise exception 'CAFE_COUNT_VARIANCE_NOT_ZERO' using errcode = 'P0020';
  end if;

  perform set_config('app.cafe_count_action', 'confirm', true);
  update ops.cafe_count_lines line
     set status = 'Confirmed',
         reviewed_by = shared.current_person_id(),
         reviewed_at = clock_timestamp(),
         posting_status = 'not_needed',
         row_version = line.row_version + 1
   where line.id = p_line_id
  returning * into v_line;
  return jsonb_build_object('line_id', v_line.id, 'status', v_line.status,
                            'posting_status', v_line.posting_status, 'row_version', v_line.row_version,
                            'variance', v_line.variance);
end;
$$;
comment on function ops.confirm_cafe_count_line(uuid, integer) is
  'The sole review transition. Reuses ops.can_review_stream, requires Submitted + ready Expected balance + current version + exactly zero Variance, stamps reviewer/time and closes not_needed without an ERP document.';
revoke execute on function ops.confirm_cafe_count_line(uuid, integer) from public, anon, authenticated;
grant execute on function ops.confirm_cafe_count_line(uuid, integer) to authenticated;

create or replace function ops.set_cafe_count_posting_enabled(p_branch_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_person_id uuid := shared.current_person_id();
begin
  if v_org_id is null or v_person_id is null or not shared.has_access_role('admin') then
    raise exception 'CAFE_COUNT_POSTING_ADMIN_ONLY' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.branches b where b.org_id = v_org_id and b.id = p_branch_id) then
    raise exception 'CAFE_COUNT_BRANCH_NOT_FOUND' using errcode = '22023';
  end if;
  insert into ops.cafe_count_posting_switches (org_id, branch_id, posting_enabled, updated_by, updated_at)
  values (v_org_id, p_branch_id, p_enabled, v_person_id, clock_timestamp())
  on conflict (org_id, branch_id) do update
    set posting_enabled = excluded.posting_enabled,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  return jsonb_build_object('branch_id', p_branch_id, 'posting_enabled', p_enabled);
end;
$$;
comment on function ops.set_cafe_count_posting_enabled(uuid, boolean) is
  'Admin-only writer for the per-branch switch. Rows are seeded off, new branches default off, and the switch never dispatches to the ERP outbox in this tracer ticket.';
revoke execute on function ops.set_cafe_count_posting_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function ops.set_cafe_count_posting_enabled(uuid, boolean) to authenticated;

create or replace function shared._history_reader_ops_cafe_count_lines(
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
      select 1 from ops.cafe_count_lines line
       where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and line.id = p_record_key::uuid
         and line.org_id = (select shared.current_org_id())
    );
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_ops_cafe_count_lines(text, text, jsonb) is
  'History read predicate for ops.cafe_count_lines (#1366): the source table''s same-org live-row predicate for inserts and updates; no hard deletes are allowed.';
revoke all on function shared._history_reader_ops_cafe_count_lines(text, text, jsonb) from public, anon;
grant execute on function shared._history_reader_ops_cafe_count_lines(text, text, jsonb) to authenticated;
insert into shared.record_history_readers (schema_name, table_name, reader)
values ('ops', 'cafe_count_lines', 'shared._history_reader_ops_cafe_count_lines(text, text, jsonb)');
create trigger record_history_cafe_count_lines
  after insert or update or delete on ops.cafe_count_lines
  for each row execute function shared._record_history_write('-updated_at');
