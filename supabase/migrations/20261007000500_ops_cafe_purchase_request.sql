-- #1428 — Café purchase request: a stream member raises a blank request (ESB product detail and
-- typed quantity per line, a required-by date and a note); the stream's reviewer who is not the
-- requester approves it, ops lead and admin included; Approved and Rejected requests are frozen.
-- The floor never chooses purchase or transfer, so no such column exists; this migration writes
-- nothing to the ESB outbox. Rollback: supabase/rollbacks/20261007000500_ops_cafe_purchase_request.sql.

create table ops.cafe_purchase_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references shared.orgs(id) on delete cascade,
  branch_id     uuid not null,
  activity      text not null,
  required_by   date not null,
  note          text check (note is null or (btrim(note) <> '' and char_length(note) <= 500)),
  client_key    uuid not null,
  source        text not null default 'mos' check (source = 'mos'),
  status        text not null default 'Submitted' check (status in ('Submitted', 'Approved', 'Rejected')),
  requested_by  uuid not null references shared.people(id),
  requested_at  timestamptz not null default now(),
  reviewed_by   uuid references shared.people(id),
  reviewed_at   timestamptz,
  review_note   text check (review_note is null or char_length(review_note) <= 500),
  row_version   integer not null default 1 check (row_version > 0),
  updated_at    timestamptz not null default now(),
  constraint cafe_purchase_requests_org_id_id_uk unique (org_id, id),
  constraint cafe_purchase_requests_org_client_key_uk unique (org_id, client_key),
  constraint cafe_purchase_requests_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade,
  constraint cafe_purchase_requests_decision_check check (
    (status in ('Approved', 'Rejected')) = (reviewed_by is not null and reviewed_at is not null)
    and (status <> 'Rejected' or btrim(coalesce(review_note, '')) <> '')
    and (status <> 'Approved' or reviewed_by <> requested_by)
  )
);
comment on table ops.cafe_purchase_requests is
  'One Café purchase request raised on a stream: Submitted at send, then Approved or Rejected by a stream reviewer; nobody approves their own. Approved and Rejected requests are frozen and an Approved request is approved, not posted.';
comment on column ops.cafe_purchase_requests.client_key is
  'Client-generated UUID idempotency key, unique per org; a repeated send with the same key returns this request.';

create index cafe_purchase_requests_review_queue_idx
  on ops.cafe_purchase_requests (org_id, branch_id, activity, status, requested_at);
create index cafe_purchase_requests_requester_idx
  on ops.cafe_purchase_requests (org_id, requested_by, requested_at desc);

create table ops.cafe_purchase_request_lines (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references shared.orgs(id) on delete cascade,
  request_id    uuid not null,
  wip_item_id   uuid not null references ops.wip_items(id) on delete restrict,
  item_name     text not null,
  item_category text,
  item_unit_id  uuid not null references ops.item_units(id) on delete restrict,
  unit_name     text not null,
  quantity      numeric(14,4) not null check (quantity > 0),
  created_at    timestamptz not null default now(),
  constraint cafe_purchase_request_lines_request_fk foreign key (org_id, request_id)
    references ops.cafe_purchase_requests (org_id, id) on delete cascade,
  constraint cafe_purchase_request_lines_request_unit_uk unique (request_id, item_unit_id)
);
comment on table ops.cafe_purchase_request_lines is
  'Requested quantity per ESB product detail, exactly as typed and never converted. Lines are inserted only by the send function and are immutable afterwards.';

alter table ops.cafe_purchase_requests enable row level security;
alter table ops.cafe_purchase_requests force row level security;
revoke all on ops.cafe_purchase_requests from public, anon, authenticated, service_role;
grant select on ops.cafe_purchase_requests to authenticated, service_role;
create policy cafe_purchase_requests_select_requester_or_reviewer on ops.cafe_purchase_requests
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (requested_by = (select shared.current_person_id())
         or ops.can_review_stream(branch_id, activity))
  );
comment on policy cafe_purchase_requests_select_requester_or_reviewer on ops.cafe_purchase_requests is
  'A requester reads their own requests; a stream reviewer reads that stream''s, and ops lead and admin read every stream (ops.can_review_stream).';

alter table ops.cafe_purchase_request_lines enable row level security;
alter table ops.cafe_purchase_request_lines force row level security;
revoke all on ops.cafe_purchase_request_lines from public, anon, authenticated, service_role;
grant select on ops.cafe_purchase_request_lines to authenticated, service_role;
create policy cafe_purchase_request_lines_select_with_request on ops.cafe_purchase_request_lines
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_purchase_requests r
                 where r.org_id = cafe_purchase_request_lines.org_id and r.id = cafe_purchase_request_lines.request_id)
  );
comment on policy cafe_purchase_request_lines_select_with_request on ops.cafe_purchase_request_lines is
  'A line is readable exactly when its request is readable under that request''s own policy.';

-- ── Guards: server stamps, the decision transition and the freeze ───────────────────────────
create or replace function ops._guard_cafe_purchase_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action text := coalesce(current_setting('app.cafe_purchase_request_action', true), '');
  v_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
begin
  if tg_op = 'INSERT' then
    if v_action <> 'send' then
      raise exception 'CAFE_PURCHASE_REQUEST_REQUIRES_SERVER_ACTION' using errcode = '42501';
    end if;
    new.org_id := shared.current_org_id();
    new.requested_by := shared.current_person_id();
    new.requested_at := clock_timestamp();
    new.source := 'mos';
    new.status := 'Submitted';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    new.row_version := 1;
    new.updated_at := clock_timestamp();
    if new.org_id is null or new.requested_by is null then
      raise exception 'CAFE_PURCHASE_REQUEST_FORBIDDEN' using errcode = '42501';
    end if;
    if new.required_by < v_today or new.required_by > v_today + 90 then
      raise exception 'CAFE_PURCHASE_REQUEST_REQUIRED_BY_INVALID' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status in ('Approved', 'Rejected') then
    raise exception 'CAFE_PURCHASE_REQUEST_FROZEN' using errcode = '42501';
  end if;
  if v_action = 'decide'
     and old.status = 'Submitted' and new.status in ('Approved', 'Rejected')
     and new.id = old.id and new.org_id = old.org_id
     and new.branch_id = old.branch_id and new.activity = old.activity
     and new.required_by = old.required_by and new.note is not distinct from old.note
     and new.client_key = old.client_key and new.source = old.source
     and new.requested_by = old.requested_by and new.requested_at = old.requested_at
     and new.reviewed_by = shared.current_person_id()
     and (new.status = 'Rejected' or new.reviewed_by <> old.requested_by)
     and new.reviewed_at is not null
     and new.row_version = old.row_version + 1 then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  raise exception 'CAFE_PURCHASE_REQUEST_UPDATE_REQUIRES_SERVER_ACTION' using errcode = '42501';
end;
$$;
comment on function ops._guard_cafe_purchase_request() is
  'Stamps every server-owned request field at insert, bounds the required-by date to today through 90 days ahead (WIB), permits only the decide transition (never a self-approval) with every fact unchanged, and freezes decided requests. SECURITY INVOKER.';
revoke all on function ops._guard_cafe_purchase_request() from public, anon, authenticated;
create trigger cafe_purchase_requests_guard
  before insert or update on ops.cafe_purchase_requests
  for each row execute function ops._guard_cafe_purchase_request();

create or replace function ops._guard_cafe_purchase_request_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request ops.cafe_purchase_requests%rowtype;
  v_item record;
begin
  if tg_op = 'UPDATE'
     or coalesce(current_setting('app.cafe_purchase_request_action', true), '') <> 'send' then
    raise exception 'CAFE_PURCHASE_REQUEST_LINE_LOCKED' using errcode = '42501';
  end if;
  select * into v_request
    from ops.cafe_purchase_requests r
   where r.id = new.request_id and r.org_id = shared.current_org_id();
  if not found or v_request.status <> 'Submitted' or v_request.requested_by <> shared.current_person_id() then
    raise exception 'CAFE_PURCHASE_REQUEST_LINE_LOCKED' using errcode = '42501';
  end if;
  -- The same list Receive offers: active, confirmed ESB stock product details of the stream.
  select * into v_item
    from ops.cafe_receivable_items(v_request.branch_id, v_request.activity) item
   where item.item_unit_id = new.item_unit_id;
  if not found then
    raise exception 'CAFE_PURCHASE_REQUEST_ITEM_NOT_AVAILABLE' using errcode = '23514';
  end if;
  new.org_id := v_request.org_id;
  new.wip_item_id := v_item.item_id;
  new.item_name := v_item.item_name;
  new.item_category := v_item.item_category;
  new.unit_name := v_item.unit_name;
  new.created_at := clock_timestamp();
  return new;
end;
$$;
comment on function ops._guard_cafe_purchase_request_line() is
  'Lines are inserted only inside the send function on the requester''s own new request, for an available product detail whose names the server stamps; any update is refused. SECURITY INVOKER.';
revoke all on function ops._guard_cafe_purchase_request_line() from public, anon, authenticated;
create trigger cafe_purchase_request_lines_guard
  before insert or update on ops.cafe_purchase_request_lines
  for each row execute function ops._guard_cafe_purchase_request_line();

-- ── Send ────────────────────────────────────────────────────────────────────────────────────
create or replace function ops.submit_cafe_purchase_request(
  p_branch_id uuid,
  p_activity text,
  p_required_by date,
  p_note text,
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
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_line jsonb;
  v_requested jsonb;
  v_existing ops.cafe_purchase_requests%rowtype;
  v_existing_lines jsonb;
  v_request ops.cafe_purchase_requests%rowtype;
begin
  if v_org_id is null or v_person_id is null
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_PURCHASE_REQUEST_FORBIDDEN' using errcode = '42501';
  end if;
  if p_client_key is null then
    raise exception 'CAFE_PURCHASE_REQUEST_CLIENT_KEY_REQUIRED' using errcode = '22023';
  end if;
  if p_required_by is null then
    raise exception 'CAFE_PURCHASE_REQUEST_REQUIRED_BY_REQUIRED' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'CAFE_PURCHASE_REQUEST_NOTE_TOO_LONG' using errcode = '22023';
  end if;
  if not exists (
    select 1 from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = v_org_id and t.branch_id = p_branch_id and t.activity = p_activity
      and t.archived_at is null and b.archived_at is null
  ) then
    raise exception 'CAFE_PURCHASE_REQUEST_STREAM_NOT_FOUND' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) not between 1 and 150 then
    raise exception 'CAFE_PURCHASE_REQUEST_LINE_LIMIT: send between 1 and 150 lines' using errcode = '22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(v_line ->> 'item_unit_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_line ->> 'quantity', '') !~ '^[0-9]{1,10}([.,][0-9]{1,4})?$'
       or replace(v_line ->> 'quantity', ',', '.')::numeric <= 0 then
      raise exception 'CAFE_PURCHASE_REQUEST_LINE_INVALID' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct value ->> 'item_unit_id') from jsonb_array_elements(p_lines))
     <> jsonb_array_length(p_lines) then
    raise exception 'CAFE_PURCHASE_REQUEST_LINE_DUPLICATE' using errcode = '22023';
  end if;
  -- Only the product detail and the typed quantity cross the boundary; every other key is ignored.
  select jsonb_agg(jsonb_build_array(l.item_unit_id, l.quantity) order by l.item_unit_id, l.quantity)
    into v_requested
    from (select (value ->> 'item_unit_id')::uuid as item_unit_id,
                 replace(value ->> 'quantity', ',', '.')::numeric as quantity
            from jsonb_array_elements(p_lines)) l;

  -- A concurrent send with the same key waits here, then finds the committed request below.
  perform pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':purchase-request:' || p_client_key::text, 0));
  select * into v_existing from ops.cafe_purchase_requests r
   where r.org_id = v_org_id and r.client_key = p_client_key;
  if found then
    select jsonb_agg(jsonb_build_array(l.item_unit_id, l.quantity) order by l.item_unit_id, l.quantity)
      into v_existing_lines
      from ops.cafe_purchase_request_lines l
     where l.org_id = v_org_id and l.request_id = v_existing.id;
    if v_existing.requested_by = v_person_id
       and v_existing.branch_id = p_branch_id
       and v_existing.activity = p_activity
       and v_existing.required_by = p_required_by
       and v_existing.note is not distinct from v_note
       and v_existing_lines = v_requested then
      return jsonb_build_object('request_id', v_existing.id, 'outcome', 'existing',
                                'status', v_existing.status, 'row_version', v_existing.row_version);
    end if;
    raise exception 'CAFE_PURCHASE_REQUEST_CLIENT_KEY_CONFLICT' using errcode = '23505';
  end if;

  perform set_config('app.cafe_purchase_request_action', 'send', true);
  insert into ops.cafe_purchase_requests (org_id, branch_id, activity, required_by, note, client_key, requested_by)
  values (v_org_id, p_branch_id, p_activity, p_required_by, v_note, p_client_key, v_person_id)
  returning * into v_request;
  insert into ops.cafe_purchase_request_lines (org_id, request_id, wip_item_id, item_name, item_unit_id, unit_name, quantity)
  select v_org_id, v_request.id, '00000000-0000-0000-0000-000000000000'::uuid, '', (r.value ->> 0)::uuid, '',
         (r.value ->> 1)::numeric
    from jsonb_array_elements(v_requested) r;
  perform set_config('app.cafe_purchase_request_action', '', true);

  return jsonb_build_object('request_id', v_request.id, 'outcome', 'created',
                            'status', v_request.status, 'row_version', v_request.row_version);
end;
$$;
comment on function ops.submit_cafe_purchase_request(uuid, text, date, text, uuid, jsonb) is
  'Send: atomically creates one Submitted purchase request with 1 to 150 lines from the stream''s available product details and positive decimal quantities, a required-by date and an optional note. Stamps org, requester, source, status and time server-side; a repeat with the same client key and payload returns the existing request, a different payload is a conflict.';
revoke execute on function ops.submit_cafe_purchase_request(uuid, text, date, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function ops.submit_cafe_purchase_request(uuid, text, date, text, uuid, jsonb) to authenticated;

-- ── Review ──────────────────────────────────────────────────────────────────────────────────
-- As for receipts: the requester never approves, ops lead and admin included.
create or replace function ops.review_cafe_purchase_request(
  p_request_id uuid,
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
  v_request ops.cafe_purchase_requests%rowtype;
  v_person_id uuid := shared.current_person_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if shared.current_org_id() is null or v_person_id is null then
    raise exception 'CAFE_PURCHASE_REQUEST_FORBIDDEN' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'CAFE_PURCHASE_REQUEST_DECISION_INVALID' using errcode = '22023';
  end if;
  select * into v_request from ops.cafe_purchase_requests r
   where r.id = p_request_id and r.org_id = shared.current_org_id()
     and (r.requested_by = v_person_id or ops.can_review_stream(r.branch_id, r.activity))
   for update;
  if not found then
    raise exception 'CAFE_PURCHASE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not ops.can_review_stream(v_request.branch_id, v_request.activity) then
    raise exception 'CAFE_PURCHASE_REQUEST_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if v_request.status <> 'Submitted' then
    raise exception 'CAFE_PURCHASE_REQUEST_NOT_SUBMITTED' using errcode = 'P0018';
  end if;
  if p_expected_version is distinct from v_request.row_version then
    raise exception 'CAFE_PURCHASE_REQUEST_VERSION_STALE' using errcode = 'P0019';
  end if;
  if p_decision = 'approve' and v_request.requested_by = v_person_id then
    raise exception 'CAFE_PURCHASE_REQUEST_SELF_APPROVAL' using errcode = '42501';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'CAFE_PURCHASE_REQUEST_REJECT_NOTE_REQUIRED' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'CAFE_PURCHASE_REQUEST_NOTE_TOO_LONG' using errcode = '22023';
  end if;

  perform set_config('app.cafe_purchase_request_action', 'decide', true);
  update ops.cafe_purchase_requests r
     set status = case p_decision when 'approve' then 'Approved' else 'Rejected' end,
         reviewed_by = v_person_id,
         reviewed_at = clock_timestamp(),
         review_note = v_note,
         row_version = r.row_version + 1
   where r.id = p_request_id
  returning * into v_request;
  perform set_config('app.cafe_purchase_request_action', '', true);
  return jsonb_build_object('request_id', v_request.id, 'status', v_request.status,
                            'row_version', v_request.row_version);
end;
$$;
comment on function ops.review_cafe_purchase_request(uuid, text, integer, text) is
  'The only purchase-request decision. Requires ops.can_review_stream on the request''s stream, Submitted status and the current version; refuses approval by the requester with no ops-lead or admin exemption; a reject needs a note. Takes no request facts and enqueues nothing.';
revoke execute on function ops.review_cafe_purchase_request(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function ops.review_cafe_purchase_request(uuid, text, integer, text) to authenticated;
