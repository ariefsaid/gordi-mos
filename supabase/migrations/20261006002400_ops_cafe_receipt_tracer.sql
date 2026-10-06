-- #1422 — blind Café goods receipt: Count submit locks the lines, a stream reviewer other than the
-- receiver approves or rejects, and an approved receipt stays "approved, not posted". This
-- migration writes nothing to the ESB outbox and never touches calculated Stock or the daily Count.
--
-- DOWN (manual, reversible):
--   drop function ops.review_cafe_receipt(uuid, text, integer, text);
--   drop function ops.send_cafe_receipt_for_review(uuid, integer, text);
--   drop function ops.submit_cafe_receipt(uuid, text, date, uuid, jsonb);
--   drop function ops.set_cafe_receiving_location(uuid, text);
--   drop table ops.cafe_receipt_lines;
--   drop table ops.cafe_receipts;
--   drop table ops.cafe_receiving_locations;
--   drop function ops._guard_cafe_receipt_line();
--   drop function ops._guard_cafe_receipt();
--   drop function ops.cafe_receivable_items(uuid, text);

-- ── Receiving location: per-branch admin configuration ──────────────────────────────────────
create table ops.cafe_receiving_locations (
  org_id        uuid not null references shared.orgs(id) on delete cascade,
  branch_id     uuid not null,
  location_key  text not null check (location_key ~ '^[a-z0-9_]{1,64}$'),
  updated_by    uuid references shared.people(id),
  updated_at    timestamptz not null default now(),
  primary key (org_id, branch_id),
  constraint cafe_receiving_locations_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade
);
comment on table ops.cafe_receiving_locations is
  'The branch''s receiving location as a MOS key that the worker''s target-environment id map resolves; never an ESB identifier. Written only by the admin RPC.';

alter table ops.cafe_receiving_locations enable row level security;
alter table ops.cafe_receiving_locations force row level security;
revoke all on ops.cafe_receiving_locations from public, anon, authenticated, service_role;
grant select on ops.cafe_receiving_locations to authenticated, service_role;
create policy cafe_receiving_locations_select_org on ops.cafe_receiving_locations
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (select shared.is_org_member())
  );
comment on policy cafe_receiving_locations_select_org on ops.cafe_receiving_locations is
  'Org members may read which branches have a receiving location; writes are only through the admin RPC.';

create or replace function ops.set_cafe_receiving_location(p_branch_id uuid, p_location_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_person_id uuid := shared.current_person_id();
  v_key text := nullif(btrim(coalesce(p_location_key, '')), '');
begin
  if v_org_id is null or v_person_id is null or not shared.has_access_role('admin') then
    raise exception 'CAFE_RECEIVING_LOCATION_ADMIN_ONLY' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.branches b where b.org_id = v_org_id and b.id = p_branch_id) then
    raise exception 'CAFE_RECEIVING_BRANCH_NOT_FOUND' using errcode = '22023';
  end if;
  if v_key is null then
    delete from ops.cafe_receiving_locations
     where org_id = v_org_id and branch_id = p_branch_id;
  elsif v_key !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'CAFE_RECEIVING_LOCATION_INVALID' using errcode = '22023';
  else
    insert into ops.cafe_receiving_locations (org_id, branch_id, location_key, updated_by, updated_at)
    values (v_org_id, p_branch_id, v_key, v_person_id, clock_timestamp())
    on conflict (org_id, branch_id) do update
      set location_key = excluded.location_key,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
  end if;
  return jsonb_build_object('branch_id', p_branch_id, 'location_key', v_key);
end;
$$;
comment on function ops.set_cafe_receiving_location(uuid, text) is
  'Admin-only writer for a branch''s receiving location key; a blank key removes it, which holds posting of new receipts.';
revoke execute on function ops.set_cafe_receiving_location(uuid, text) from public, anon, authenticated;
grant execute on function ops.set_cafe_receiving_location(uuid, text) to authenticated;

-- ── Receivable items: active, confirmed ESB stock product details of the stream ─────────────
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

-- ── Receipts ────────────────────────────────────────────────────────────────────────────────
create table ops.cafe_receipts (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references shared.orgs(id) on delete cascade,
  branch_id              uuid not null,
  activity               text not null,
  arrival_date           date not null,
  receiving_location_key text,
  delivery_note_number   text check (delivery_note_number is null
                                     or (btrim(delivery_note_number) <> '' and char_length(delivery_note_number) <= 64)),
  client_key             uuid not null,
  source                 text not null default 'mos' check (source = 'mos'),
  status                 text not null default 'Counted'
                           check (status in ('Counted', 'Submitted', 'Approved', 'Rejected')),
  posting_status         text not null default 'not_posted' check (posting_status in ('not_posted', 'held')),
  posting_hold_reason    text check (posting_hold_reason in ('receiving_location_missing')),
  received_by            uuid not null references shared.people(id),
  received_at            timestamptz not null default now(),
  submitted_at           timestamptz,
  reviewed_by            uuid references shared.people(id),
  reviewed_at            timestamptz,
  review_note            text check (review_note is null or char_length(review_note) <= 500),
  row_version            integer not null default 1 check (row_version > 0),
  updated_at             timestamptz not null default now(),
  constraint cafe_receipts_org_id_id_uk unique (org_id, id),
  constraint cafe_receipts_org_client_key_uk unique (org_id, client_key),
  constraint cafe_receipts_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade,
  constraint cafe_receipts_posting_hold_check check ((posting_status = 'held') = (posting_hold_reason is not null)),
  constraint cafe_receipts_submitted_check check ((status = 'Counted') = (submitted_at is null)),
  constraint cafe_receipts_decision_check check (
    (status in ('Approved', 'Rejected')) = (reviewed_by is not null and reviewed_at is not null)
    and (status <> 'Rejected' or btrim(coalesce(review_note, '')) <> '')
    and (status <> 'Approved' or reviewed_by <> received_by)
  )
);
comment on table ops.cafe_receipts is
  'One blind Café goods receipt: Counted at Count submit, Submitted by its receiver, then Approved or Rejected by a stream reviewer who is not the receiver. Approved and Rejected receipts are frozen; posting_status not_posted means approved, not posted.';
comment on column ops.cafe_receipts.client_key is
  'Client-generated UUID idempotency key, unique per org; a repeated Count submit with the same key returns this receipt.';
comment on column ops.cafe_receipts.receiving_location_key is
  'Copied from the branch receiving location at Count submit; the receiver never chooses it. Null holds posting with posting_hold_reason.';

create index cafe_receipts_review_queue_idx
  on ops.cafe_receipts (org_id, branch_id, activity, status, arrival_date, received_at);
create index cafe_receipts_receiver_idx on ops.cafe_receipts (org_id, received_by, received_at desc);

create table ops.cafe_receipt_lines (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references shared.orgs(id) on delete cascade,
  receipt_id        uuid not null,
  wip_item_id       uuid not null references ops.wip_items(id) on delete restrict,
  item_name         text not null,
  item_category     text,
  item_unit_id      uuid not null references ops.item_units(id) on delete restrict,
  unit_name         text not null,
  received_quantity numeric(14,4) not null check (received_quantity > 0),
  created_at        timestamptz not null default now(),
  constraint cafe_receipt_lines_receipt_fk foreign key (org_id, receipt_id)
    references ops.cafe_receipts (org_id, id) on delete cascade,
  constraint cafe_receipt_lines_receipt_unit_uk unique (receipt_id, item_unit_id)
);
comment on table ops.cafe_receipt_lines is
  'Accepted quantity per ESB product detail, exactly as typed at Count submit and never converted. Lines are inserted only by Count submit and are immutable afterwards.';

alter table ops.cafe_receipts enable row level security;
alter table ops.cafe_receipts force row level security;
revoke all on ops.cafe_receipts from public, anon, authenticated, service_role;
grant select on ops.cafe_receipts to authenticated, service_role;
create policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (received_by = (select shared.current_person_id())
         or ops.can_review_stream(branch_id, activity))
  );
comment on policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts is
  'A receiver reads their own receipts; a stream reviewer reads that stream''s, and ops lead and admin read every stream (ops.can_review_stream).';

alter table ops.cafe_receipt_lines enable row level security;
alter table ops.cafe_receipt_lines force row level security;
revoke all on ops.cafe_receipt_lines from public, anon, authenticated, service_role;
grant select on ops.cafe_receipt_lines to authenticated, service_role;
create policy cafe_receipt_lines_select_with_receipt on ops.cafe_receipt_lines
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r where r.org_id = cafe_receipt_lines.org_id and r.id = cafe_receipt_lines.receipt_id)
  );
comment on policy cafe_receipt_lines_select_with_receipt on ops.cafe_receipt_lines is
  'A line is readable exactly when its receipt is readable under that receipt''s own policy.';

-- ── Guards: server stamps, the Count submit lock, transitions and the freeze ────────────────
create or replace function ops._guard_cafe_receipt()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action text := coalesce(current_setting('app.cafe_receipt_action', true), '');
  v_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
begin
  if tg_op = 'INSERT' then
    new.org_id := shared.current_org_id();
    new.received_by := shared.current_person_id();
    new.received_at := clock_timestamp();
    new.arrival_date := coalesce(new.arrival_date, v_today);
    new.source := 'mos';
    new.status := 'Counted';
    new.submitted_at := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    new.delivery_note_number := null;
    new.row_version := 1;
    new.updated_at := clock_timestamp();
    if new.org_id is null or new.received_by is null then
      raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode = '42501';
    end if;
    if new.arrival_date > v_today then
      raise exception 'CAFE_RECEIPT_ARRIVAL_DATE_FUTURE' using errcode = '23514';
    end if;
    if new.arrival_date < v_today - 1
       and not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
      raise exception 'CAFE_RECEIPT_ARRIVAL_DATE_TOO_OLD' using errcode = '23514';
    end if;
    select l.location_key into new.receiving_location_key
      from ops.cafe_receiving_locations l
     where l.org_id = new.org_id and l.branch_id = new.branch_id;
    if new.receiving_location_key is null then
      new.posting_status := 'held';
      new.posting_hold_reason := 'receiving_location_missing';
    else
      new.posting_status := 'not_posted';
      new.posting_hold_reason := null;
    end if;
    return new;
  end if;

  if old.status in ('Approved', 'Rejected') then
    raise exception 'CAFE_RECEIPT_FROZEN' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.org_id is distinct from old.org_id
     or new.branch_id is distinct from old.branch_id
     or new.activity is distinct from old.activity
     or new.arrival_date is distinct from old.arrival_date
     or new.receiving_location_key is distinct from old.receiving_location_key
     or new.client_key is distinct from old.client_key
     or new.source is distinct from old.source
     or new.posting_status is distinct from old.posting_status
     or new.posting_hold_reason is distinct from old.posting_hold_reason
     or new.received_by is distinct from old.received_by
     or new.received_at is distinct from old.received_at then
    raise exception 'CAFE_RECEIPT_FACTS_IMMUTABLE' using errcode = '42501';
  end if;

  if v_action = 'send'
     and old.status = 'Counted' and new.status = 'Submitted'
     and old.received_by = shared.current_person_id()
     and new.submitted_at is not null
     and new.reviewed_by is null and new.reviewed_at is null and new.review_note is null
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  if v_action = 'decide'
     and old.status = 'Submitted' and new.status in ('Approved', 'Rejected')
     and new.delivery_note_number is not distinct from old.delivery_note_number
     and new.submitted_at is not distinct from old.submitted_at
     and new.reviewed_by = shared.current_person_id()
     and (new.status = 'Rejected' or new.reviewed_by <> old.received_by)
     and new.reviewed_at is not null
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  raise exception 'CAFE_RECEIPT_UPDATE_REQUIRES_SERVER_ACTION' using errcode = '42501';
end;
$$;
comment on function ops._guard_cafe_receipt() is
  'Stamps every server-owned receipt field and the branch receiving location at insert, enforces the arrival-date window, permits only the send and decide transitions (never a self-approval), keeps facts immutable and freezes decided receipts. SECURITY INVOKER.';
revoke all on function ops._guard_cafe_receipt() from public, anon, authenticated;
create trigger cafe_receipts_guard
  before insert or update on ops.cafe_receipts
  for each row execute function ops._guard_cafe_receipt();

create or replace function ops._guard_cafe_receipt_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_item record;
begin
  if tg_op = 'UPDATE' then
    raise exception 'CAFE_RECEIPT_LINE_LOCKED' using errcode = '42501';
  end if;
  if coalesce(current_setting('app.cafe_receipt_action', true), '') <> 'count_submit' then
    raise exception 'CAFE_RECEIPT_LINE_LOCKED' using errcode = '42501';
  end if;
  select * into v_receipt
    from ops.cafe_receipts r
   where r.id = new.receipt_id and r.org_id = shared.current_org_id();
  if not found or v_receipt.status <> 'Counted' or v_receipt.received_by <> shared.current_person_id() then
    raise exception 'CAFE_RECEIPT_LINE_LOCKED' using errcode = '42501';
  end if;
  select * into v_item
    from ops.cafe_receivable_items(v_receipt.branch_id, v_receipt.activity) item
   where item.item_unit_id = new.item_unit_id;
  if not found then
    raise exception 'CAFE_RECEIPT_ITEM_NOT_RECEIVABLE' using errcode = '23514';
  end if;
  new.org_id := v_receipt.org_id;
  new.wip_item_id := v_item.item_id;
  new.item_name := v_item.item_name;
  new.item_category := v_item.item_category;
  new.unit_name := v_item.unit_name;
  new.created_at := clock_timestamp();
  return new;
end;
$$;
comment on function ops._guard_cafe_receipt_line() is
  'Lines are inserted only inside Count submit on the receiver''s own Counted receipt, for a receivable product detail whose names the server stamps; any later update is refused (the Count submit lock). SECURITY INVOKER.';
revoke all on function ops._guard_cafe_receipt_line() from public, anon, authenticated;
create trigger cafe_receipt_lines_guard
  before insert or update on ops.cafe_receipt_lines
  for each row execute function ops._guard_cafe_receipt_line();

-- ── Count submit ────────────────────────────────────────────────────────────────────────────
create or replace function ops.submit_cafe_receipt(
  p_branch_id uuid,
  p_activity text,
  p_arrival_date date,
  p_client_key uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_person_id uuid := shared.current_person_id();
  v_line jsonb;
  v_requested jsonb;
  v_existing ops.cafe_receipts%rowtype;
  v_existing_lines jsonb;
  v_receipt ops.cafe_receipts%rowtype;
begin
  if v_org_id is null or v_person_id is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_client_key is null then
    raise exception 'CAFE_RECEIPT_CLIENT_KEY_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = v_org_id and t.branch_id = p_branch_id and t.activity = p_activity
      and t.archived_at is null and b.archived_at is null
  ) then
    raise exception 'CAFE_RECEIPT_STREAM_NOT_FOUND' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) not between 1 and 150 then
    raise exception 'CAFE_RECEIPT_LINE_LIMIT: submit between 1 and 150 lines' using errcode = '22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(v_line ->> 'item_unit_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_line ->> 'quantity', '') !~ '^[0-9]{1,10}([.,][0-9]{1,4})?$'
       or replace(v_line ->> 'quantity', ',', '.')::numeric <= 0 then
      raise exception 'CAFE_RECEIPT_LINE_INVALID' using errcode = '22023';
    end if;
  end loop;
  -- Only the product detail and the typed quantity cross the boundary; every other key is ignored.
  select jsonb_agg(jsonb_build_array(l.item_unit_id, l.quantity) order by l.item_unit_id, l.quantity)
    into v_requested
    from (select (value ->> 'item_unit_id')::uuid as item_unit_id,
                 replace(value ->> 'quantity', ',', '.')::numeric as quantity
            from jsonb_array_elements(p_lines)) l;
  if (select count(distinct value ->> 'item_unit_id') from jsonb_array_elements(p_lines))
     <> jsonb_array_length(p_lines) then
    raise exception 'CAFE_RECEIPT_LINE_DUPLICATE' using errcode = '22023';
  end if;

  select * into v_existing from ops.cafe_receipts r
   where r.org_id = v_org_id and r.client_key = p_client_key;
  if found then
    select jsonb_agg(jsonb_build_array(l.item_unit_id, l.received_quantity) order by l.item_unit_id, l.received_quantity)
      into v_existing_lines
      from ops.cafe_receipt_lines l
     where l.org_id = v_org_id and l.receipt_id = v_existing.id;
    if v_existing.received_by = v_person_id
       and v_existing.branch_id = p_branch_id
       and v_existing.activity = p_activity
       and (p_arrival_date is null or v_existing.arrival_date = p_arrival_date)
       and v_existing_lines = v_requested then
      return jsonb_build_object('receipt_id', v_existing.id, 'outcome', 'existing',
                                'status', v_existing.status, 'row_version', v_existing.row_version);
    end if;
    raise exception 'CAFE_RECEIPT_CLIENT_KEY_CONFLICT' using errcode = '23505';
  end if;

  insert into ops.cafe_receipts (org_id, branch_id, activity, arrival_date, client_key, received_by)
  values (v_org_id, p_branch_id, p_activity, p_arrival_date, p_client_key, v_person_id)
  returning * into v_receipt;

  perform set_config('app.cafe_receipt_action', 'count_submit', true);
  insert into ops.cafe_receipt_lines (org_id, receipt_id, wip_item_id, item_name, item_unit_id, unit_name, received_quantity)
  select v_org_id, v_receipt.id, '00000000-0000-0000-0000-000000000000'::uuid, '', (r.value ->> 0)::uuid, '',
         (r.value ->> 1)::numeric
    from jsonb_array_elements(v_requested) r;
  perform set_config('app.cafe_receipt_action', '', true);

  return jsonb_build_object('receipt_id', v_receipt.id, 'outcome', 'created',
                            'status', v_receipt.status, 'row_version', v_receipt.row_version,
                            'posting_status', v_receipt.posting_status);
end;
$$;
comment on function ops.submit_cafe_receipt(uuid, text, date, uuid, jsonb) is
  'Count submit: atomically creates one Counted receipt with 1 to 150 lines from the receiver''s product details and positive decimal quantities. Stamps org, receiver, source, status, time and location server-side; a repeat with the same client key and lines returns the existing receipt, a different payload is a conflict.';
revoke execute on function ops.submit_cafe_receipt(uuid, text, date, uuid, jsonb) from public, anon, authenticated;
grant execute on function ops.submit_cafe_receipt(uuid, text, date, uuid, jsonb) to authenticated;

-- ── Send for review ─────────────────────────────────────────────────────────────────────────
create or replace function ops.send_cafe_receipt_for_review(
  p_receipt_id uuid,
  p_expected_version integer,
  p_delivery_note_number text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_note text := nullif(btrim(coalesce(p_delivery_note_number, '')), '');
begin
  if shared.current_org_id() is null or shared.current_person_id() is null then
    raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_receipt from ops.cafe_receipts r
   where r.id = p_receipt_id and r.org_id = shared.current_org_id()
   for update;
  if not found then
    raise exception 'CAFE_RECEIPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_receipt.received_by <> shared.current_person_id() then
    raise exception 'CAFE_RECEIPT_SEND_RECEIVER_ONLY' using errcode = '42501';
  end if;
  if v_receipt.status <> 'Counted' then
    raise exception 'CAFE_RECEIPT_NOT_COUNTED' using errcode = 'P0018';
  end if;
  if p_expected_version is distinct from v_receipt.row_version then
    raise exception 'CAFE_RECEIPT_VERSION_STALE' using errcode = 'P0019';
  end if;
  if v_note is not null and char_length(v_note) > 64 then
    raise exception 'CAFE_RECEIPT_DELIVERY_NOTE_INVALID' using errcode = '22023';
  end if;

  perform set_config('app.cafe_receipt_action', 'send', true);
  update ops.cafe_receipts r
     set status = 'Submitted',
         delivery_note_number = v_note,
         submitted_at = clock_timestamp(),
         row_version = r.row_version + 1
   where r.id = p_receipt_id
  returning * into v_receipt;
  perform set_config('app.cafe_receipt_action', '', true);
  return jsonb_build_object('receipt_id', v_receipt.id, 'status', v_receipt.status,
                            'row_version', v_receipt.row_version);
end;
$$;
comment on function ops.send_cafe_receipt_for_review(uuid, integer, text) is
  'The receiver moves their own Counted receipt to Submitted at its current version, optionally adding the supplier delivery-note number as free text. Quantities stay locked.';
revoke execute on function ops.send_cafe_receipt_for_review(uuid, integer, text) from public, anon, authenticated;
grant execute on function ops.send_cafe_receipt_for_review(uuid, integer, text) to authenticated;

-- ── Review ──────────────────────────────────────────────────────────────────────────────────
-- Stricter than café production review: the receiver never approves, ops lead and admin included.
create or replace function ops.review_cafe_receipt(
  p_receipt_id uuid,
  p_decision text,
  p_expected_version integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_person_id uuid := shared.current_person_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if shared.current_org_id() is null or v_person_id is null then
    raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'CAFE_RECEIPT_DECISION_INVALID' using errcode = '22023';
  end if;
  select * into v_receipt from ops.cafe_receipts r
   where r.id = p_receipt_id and r.org_id = shared.current_org_id()
   for update;
  if not found then
    raise exception 'CAFE_RECEIPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not ops.can_review_stream(v_receipt.branch_id, v_receipt.activity) then
    raise exception 'CAFE_RECEIPT_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if v_receipt.status <> 'Submitted' then
    raise exception 'CAFE_RECEIPT_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if p_expected_version is distinct from v_receipt.row_version then
    raise exception 'CAFE_RECEIPT_VERSION_STALE' using errcode = 'P0019';
  end if;
  if p_decision = 'approve' and v_receipt.received_by = v_person_id then
    raise exception 'CAFE_RECEIPT_SELF_APPROVAL' using errcode = '42501';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'CAFE_RECEIPT_REJECT_NOTE_REQUIRED' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'CAFE_RECEIPT_NOTE_TOO_LONG' using errcode = '22023';
  end if;

  perform set_config('app.cafe_receipt_action', 'decide', true);
  update ops.cafe_receipts r
     set status = case p_decision when 'approve' then 'Approved' else 'Rejected' end,
         reviewed_by = v_person_id,
         reviewed_at = clock_timestamp(),
         review_note = v_note,
         row_version = r.row_version + 1
   where r.id = p_receipt_id
  returning * into v_receipt;
  perform set_config('app.cafe_receipt_action', '', true);
  return jsonb_build_object('receipt_id', v_receipt.id, 'status', v_receipt.status,
                            'posting_status', v_receipt.posting_status,
                            'row_version', v_receipt.row_version);
end;
$$;
comment on function ops.review_cafe_receipt(uuid, text, integer, text) is
  'The only receipt decision. Requires ops.can_review_stream on the receipt''s stream, Submitted status and the current version; refuses approval by the receiver with no ops-lead or admin exemption; a reject needs a note. Takes no receipt facts and enqueues nothing.';
revoke execute on function ops.review_cafe_receipt(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function ops.review_cafe_receipt(uuid, text, integer, text) to authenticated;
