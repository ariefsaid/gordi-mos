-- #1425 — per-line receipt conditions, bounded explanations and private photo evidence.
-- The accepted quantity remains immutable; this migration only adds condition evidence to a
-- Counted receipt. Sending for review rechecks the evidence in the database. No ESB write/outbox.
--
-- DOWN: see supabase/rollbacks/20261007006000_ops_cafe_receipt_explanations.sql. It refuses to
-- remove non-empty evidence or photos, and restores the prior receipt RPC/guard implementations.

-- ── Condition facts remain separate from the immutable accepted quantity ────────────────────
alter table ops.cafe_receipt_lines
  add column conditions text[] not null default '{}',
  add column condition_reason text,
  add column condition_updated_by uuid references shared.people(id),
  add column condition_updated_at timestamptz,
  add constraint cafe_receipt_lines_conditions_check
    check (conditions <@ array['damaged_wrong']::text[]),
  add constraint cafe_receipt_lines_reason_check
    check (condition_reason is null or (btrim(condition_reason) <> '' and char_length(condition_reason) <= 500)),
  add constraint cafe_receipt_lines_reason_needs_condition_check
    check (cardinality(conditions) > 0 or condition_reason is null),
  add constraint cafe_receipt_lines_condition_audit_check
    check ((condition_updated_by is null) = (condition_updated_at is null));
comment on column ops.cafe_receipt_lines.conditions is
  'Receiver-observed line conditions. #1425 supports damaged_wrong; later condition types are added by their own migration.';
comment on column ops.cafe_receipt_lines.condition_reason is
  'Receiver explanation for this line condition, trimmed and limited to 500 characters. Required before Send for review.';

-- ── Only the receiver may update condition evidence; every counted fact stays frozen ─────────
create or replace function ops._guard_cafe_receipt_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_item record;
  v_action text := coalesce(current_setting('app.cafe_receipt_action', true), '');
begin
  if tg_op = 'UPDATE' then
    select * into v_receipt
      from ops.cafe_receipts r
     where r.id = old.receipt_id and r.org_id = old.org_id;
    if v_action = 'line_explanation'
       and found
       and v_receipt.status = 'Counted'
       and v_receipt.received_by = shared.current_person_id()
       and old.org_id = new.org_id
       and old.receipt_id = new.receipt_id
       and old.wip_item_id = new.wip_item_id
       and old.item_name = new.item_name
       and old.item_category is not distinct from new.item_category
       and old.item_unit_id = new.item_unit_id
       and old.unit_name = new.unit_name
       and old.received_quantity = new.received_quantity
       and old.created_at = new.created_at
       and new.conditions <@ array['damaged_wrong']::text[]
       and (new.condition_reason is null or
            (btrim(new.condition_reason) <> '' and char_length(new.condition_reason) <= 500))
       and (cardinality(new.conditions) > 0 or new.condition_reason is null) then
      new.condition_updated_by := shared.current_person_id();
      new.condition_updated_at := clock_timestamp();
      return new;
    end if;
    raise exception 'CAFE_RECEIPT_LINE_LOCKED' using errcode = '42501';
  end if;
  if v_action <> 'count_submit' then
    raise exception 'CAFE_RECEIPT_LINE_LOCKED' using errcode = '42501';
  end if;
  select * into v_receipt
    from ops.cafe_receipts r
   where r.id = new.receipt_id and r.org_id = shared.current_org_id();
  if not found or v_receipt.status <> 'Counted' or v_receipt.received_by <> shared.current_person_id() then
    raise exception 'CAFE_RECEIPT_LINE_LOCKED' using errcode = '42501';
  end if;
  if new.conditions is null or not (new.conditions <@ array['damaged_wrong']::text[])
     or (new.condition_reason is not null and
         (btrim(new.condition_reason) = '' or char_length(new.condition_reason) > 500))
     or (cardinality(new.conditions) = 0 and new.condition_reason is not null) then
    raise exception 'CAFE_RECEIPT_CONDITION_INVALID' using errcode = '22023';
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
  if cardinality(new.conditions) > 0 then
    new.condition_updated_by := shared.current_person_id();
    new.condition_updated_at := clock_timestamp();
  else
    new.condition_updated_by := null;
    new.condition_updated_at := null;
  end if;
  return new;
end;
$$;
comment on function ops._guard_cafe_receipt_line() is
  'Stamps Count submit lines and permits only receiver-owned condition/explanation updates on their Counted receipt. Accepted quantity, names and product detail remain immutable. SECURITY INVOKER.';

-- ── Count submit carries one receiver-observed fact and still stamps every identity server-side
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
       or replace(v_line ->> 'quantity', ',', '.')::numeric <= 0
       or (v_line ? 'damaged_wrong' and jsonb_typeof(v_line -> 'damaged_wrong') <> 'boolean') then
      raise exception 'CAFE_RECEIPT_LINE_INVALID' using errcode = '22023';
    end if;
  end loop;
  -- Only product detail, typed quantity and the receiver's damaged/wrong observation cross over.
  select jsonb_agg(jsonb_build_array(l.item_unit_id, l.quantity, l.damaged_wrong)
                   order by l.item_unit_id, l.quantity)
    into v_requested
    from (select (value ->> 'item_unit_id')::uuid as item_unit_id,
                 replace(value ->> 'quantity', ',', '.')::numeric as quantity,
                 coalesce((value ->> 'damaged_wrong')::boolean, false) as damaged_wrong
            from jsonb_array_elements(p_lines)) l;
  if (select count(distinct value ->> 'item_unit_id') from jsonb_array_elements(p_lines))
     <> jsonb_array_length(p_lines) then
    raise exception 'CAFE_RECEIPT_LINE_DUPLICATE' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':' || p_client_key::text, 0));
  select * into v_existing from ops.cafe_receipts r
   where r.org_id = v_org_id and r.client_key = p_client_key;
  if found then
    select jsonb_agg(jsonb_build_array(l.item_unit_id, l.received_quantity, ('damaged_wrong' = any(l.conditions)))
                     order by l.item_unit_id, l.received_quantity)
      into v_existing_lines
      from ops.cafe_receipt_lines l
     where l.org_id = v_org_id and l.receipt_id = v_existing.id;
    if v_existing.received_by = v_person_id
       and v_existing.branch_id = p_branch_id
       and v_existing.activity = p_activity
       and (p_arrival_date is null or v_existing.arrival_date = p_arrival_date)
       and v_existing_lines = v_requested then
      return jsonb_build_object(
        'receipt_id', v_existing.id, 'outcome', 'existing', 'status', v_existing.status,
        'row_version', v_existing.row_version,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'item_unit_id', l.item_unit_id, 'item_name', l.item_name, 'item_category', l.item_category,
          'unit_name', l.unit_name, 'received_quantity', trim_scale(l.received_quantity)::text,
          'conditions', l.conditions, 'condition_reason', l.condition_reason, 'photos', '[]'::jsonb
        ) order by l.item_name, l.id), '[]'::jsonb)
          from ops.cafe_receipt_lines l where l.org_id = v_org_id and l.receipt_id = v_existing.id)
      );
    end if;
    raise exception 'CAFE_RECEIPT_CLIENT_KEY_CONFLICT' using errcode = '23505';
  end if;

  insert into ops.cafe_receipts (org_id, branch_id, activity, arrival_date, client_key, received_by)
  values (v_org_id, p_branch_id, p_activity, p_arrival_date, p_client_key, v_person_id)
  returning * into v_receipt;

  perform set_config('app.cafe_receipt_action', 'count_submit', true);
  insert into ops.cafe_receipt_lines (
    org_id, receipt_id, wip_item_id, item_name, item_category, item_unit_id, unit_name,
    received_quantity, conditions
  )
  select v_org_id, v_receipt.id, '00000000-0000-0000-0000-000000000000'::uuid, '', null,
         (item.value ->> 'item_unit_id')::uuid, '',
         replace(item.value ->> 'quantity', ',', '.')::numeric,
         case when coalesce((item.value ->> 'damaged_wrong')::boolean, false)
              then array['damaged_wrong']::text[] else '{}'::text[] end
    from jsonb_array_elements(p_lines) item(value);
  perform set_config('app.cafe_receipt_action', '', true);

  return jsonb_build_object(
    'receipt_id', v_receipt.id, 'outcome', 'created', 'status', v_receipt.status,
    'row_version', v_receipt.row_version, 'posting_status', v_receipt.posting_status,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'item_unit_id', l.item_unit_id, 'item_name', l.item_name, 'item_category', l.item_category,
      'unit_name', l.unit_name, 'received_quantity', trim_scale(l.received_quantity)::text,
      'conditions', l.conditions, 'condition_reason', l.condition_reason, 'photos', '[]'::jsonb
    ) order by l.item_name, l.id), '[]'::jsonb)
      from ops.cafe_receipt_lines l where l.org_id = v_org_id and l.receipt_id = v_receipt.id)
  );
end;
$$;
comment on function ops.submit_cafe_receipt(uuid, text, date, uuid, jsonb) is
  'Atomically Count-locks accepted product detail and quantity, plus the receiver-set damaged/wrong observation. Stamps identity/server facts, returns line identities for explanation capture, and idempotently compares the same captured facts. Never accepts matching or posting state.';

-- ── A narrow owner-only writer; the quantity is never accepted as an argument ─────────────────
create or replace function ops.set_cafe_receipt_line_explanation(
  p_line_id uuid,
  p_damaged_wrong boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_line ops.cafe_receipt_lines%rowtype;
  v_conditions text[];
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if shared.current_org_id() is null or shared.current_person_id() is null then
    raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode = '42501';
  end if;
  select r.* into v_receipt
    from ops.cafe_receipts r
    join ops.cafe_receipt_lines l on l.receipt_id = r.id and l.org_id = r.org_id
   where l.id = p_line_id and r.org_id = shared.current_org_id()
   for update of r;
  if not found then raise exception 'CAFE_RECEIPT_LINE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_receipt.received_by <> shared.current_person_id() then
    raise exception 'CAFE_RECEIPT_EXPLANATION_RECEIVER_ONLY' using errcode = '42501';
  end if;
  if v_receipt.status <> 'Counted' then
    raise exception 'CAFE_RECEIPT_EXPLANATION_COUNTED_ONLY' using errcode = 'P0018';
  end if;
  if p_damaged_wrong is null then
    raise exception 'CAFE_RECEIPT_CONDITION_INVALID' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'CAFE_RECEIPT_REASON_TOO_LONG' using errcode = '22023';
  end if;
  select * into v_line from ops.cafe_receipt_lines l
   where l.id = p_line_id and l.org_id = shared.current_org_id()
   for update;
  v_conditions := array_remove(v_line.conditions, 'damaged_wrong');
  if p_damaged_wrong then v_conditions := array_append(v_conditions, 'damaged_wrong'); end if;
  if cardinality(v_conditions) = 0 then v_reason := null; end if;

  perform set_config('app.cafe_receipt_action', 'line_explanation', true);
  update ops.cafe_receipt_lines l
     set conditions = v_conditions, condition_reason = v_reason
   where l.id = p_line_id and l.org_id = shared.current_org_id()
  returning * into v_line;
  perform set_config('app.cafe_receipt_action', '', true);
  return jsonb_build_object(
    'line_id', v_line.id, 'conditions', v_line.conditions, 'condition_reason', v_line.condition_reason,
    'condition_updated_at', v_line.condition_updated_at
  );
end;
$$;
comment on function ops.set_cafe_receipt_line_explanation(uuid, boolean, text) is
  'The receiver may add/remove only their damaged_wrong condition and bounded reason while their receipt is Counted. Does not accept or change quantity, match, status or posting state.';
revoke execute on function ops.set_cafe_receipt_line_explanation(uuid, boolean, text) from public, anon, authenticated;
grant execute on function ops.set_cafe_receipt_line_explanation(uuid, boolean, text) to authenticated;

-- ── Send is the authoritative evidence gate, under the existing receipt row lock ─────────────
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
  v_line ops.cafe_receipt_lines%rowtype;
  v_reason_missing boolean;
  v_photo_missing boolean;
  v_note text := nullif(btrim(coalesce(p_delivery_note_number, '')), '');
begin
  if shared.current_org_id() is null or shared.current_person_id() is null then
    raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_receipt from ops.cafe_receipts r
   where r.id = p_receipt_id and r.org_id = shared.current_org_id()
   for update;
  if not found then raise exception 'CAFE_RECEIPT_NOT_FOUND' using errcode = 'P0002'; end if;
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
  for v_line in
    select l.* from ops.cafe_receipt_lines l
     where l.org_id = v_receipt.org_id and l.receipt_id = v_receipt.id
       and cardinality(l.conditions) > 0
     order by l.item_name, l.id
  loop
    v_reason_missing := nullif(btrim(coalesce(v_line.condition_reason, '')), '') is null;
    v_photo_missing := not exists (
      select 1 from storage.objects photo
       where photo.bucket_id = 'cafe-receipt-photos'
         and ops.cafe_receipt_photo_line_id(photo.name) = v_line.id
    );
    if v_reason_missing and v_photo_missing then
      raise exception 'CAFE_RECEIPT_REASON_AND_PHOTO_REQUIRED: %', v_line.item_name using errcode = '23514';
    elsif v_reason_missing then
      raise exception 'CAFE_RECEIPT_REASON_REQUIRED: %', v_line.item_name using errcode = '23514';
    elsif v_photo_missing then
      raise exception 'CAFE_RECEIPT_PHOTO_REQUIRED: %', v_line.item_name using errcode = '23514';
    end if;
  end loop;

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
  'The receiver moves their own Counted receipt to Submitted at its current version. Each conditioned line must have a bounded nonblank reason and at least one private photo; quantities stay locked. No outbox write.';

-- ── Private immutable photo evidence: <org>/<receipt>/<line>/<random-id>.<image-ext> ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cafe-receipt-photos', 'cafe-receipt-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function ops.cafe_receipt_photo_line_id(p_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' then
    return null;
  end if;
  return split_part(p_name, '/', 3)::uuid;
end;
$$;
comment on function ops.cafe_receipt_photo_line_id(text) is
  'Parses only canonical org/receipt/line/random-UUID image paths; malformed and traversal names return NULL.';

create or replace function ops.can_read_cafe_receipt_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_line_id uuid := ops.cafe_receipt_photo_line_id(p_name);
begin
  if v_line_id is null or split_part(p_name, '/', 1) <> shared.current_org_id()::text then return false; end if;
  return exists (
    select 1 from ops.cafe_receipt_lines l
    join ops.cafe_receipts r on r.id = l.receipt_id and r.org_id = l.org_id
    where l.id = v_line_id and l.org_id = shared.current_org_id()
      and split_part(p_name, '/', 2) = r.id::text
      and (r.received_by = shared.current_person_id()
           or (r.status in ('Submitted', 'Approved', 'Rejected') and ops.can_review_stream(r.branch_id, r.activity)))
  );
end;
$$;
comment on function ops.can_read_cafe_receipt_photo(text) is
  'Private photo read follows same-org receipt RLS: its receiver may read their own receipt; stream reviewers may read evidence once submitted. SECURITY DEFINER.';
revoke execute on function ops.can_read_cafe_receipt_photo(text) from public, anon, authenticated;
grant execute on function ops.can_read_cafe_receipt_photo(text) to authenticated, service_role;

create or replace function ops.can_add_cafe_receipt_photo(p_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_line_id uuid := ops.cafe_receipt_photo_line_id(p_name);
  v_org_id uuid := shared.current_org_id();
begin
  if v_line_id is null or split_part(p_name, '/', 1) <> v_org_id::text then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-photo:' || v_line_id::text, 0));
  return exists (
    select 1 from ops.cafe_receipt_lines l
    join ops.cafe_receipts r on r.id = l.receipt_id and r.org_id = l.org_id
    where l.id = v_line_id and l.org_id = v_org_id
      and split_part(p_name, '/', 2) = r.id::text
      and r.status = 'Counted' and r.source = 'mos'
      and r.received_by = shared.current_person_id()
      and (select count(*) from storage.objects photo
           where photo.bucket_id = 'cafe-receipt-photos'
             and ops.cafe_receipt_photo_line_id(photo.name) = v_line_id) < 4
  );
end;
$$;
comment on function ops.can_add_cafe_receipt_photo(text) is
  'Only the same-org receiver may add up to four immutable photos to a line on their Counted receipt; an advisory lock makes the cap race-safe. SECURITY DEFINER.';
revoke execute on function ops.can_add_cafe_receipt_photo(text) from public, anon, authenticated;
grant execute on function ops.can_add_cafe_receipt_photo(text) to authenticated, service_role;

create policy cafe_receipt_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'cafe-receipt-photos' and ops.can_read_cafe_receipt_photo(name));
create policy cafe_receipt_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cafe-receipt-photos' and ops.can_add_cafe_receipt_photo(name));
-- No update or delete policy: with none, storage RLS refuses both, as for waste and Signal photos.
create or replace view ops.cafe_receipt_line_photos as
select l.id as line_id, r.id as receipt_id, l.org_id, photo.name as path, photo.created_at
from storage.objects photo
join ops.cafe_receipt_lines l on l.id = ops.cafe_receipt_photo_line_id(photo.name)
join ops.cafe_receipts r on r.id = l.receipt_id and r.org_id = l.org_id
where photo.bucket_id = 'cafe-receipt-photos'
  and split_part(photo.name, '/', 1) = l.org_id::text
  and split_part(photo.name, '/', 2) = r.id::text;
alter view ops.cafe_receipt_line_photos set (security_invoker = true);
comment on view ops.cafe_receipt_line_photos is
  'Per-line photo rows projected from private Storage objects; bucket RLS applies the receipt receiver/reviewer boundary. Objects have no update/delete path.';
grant select on ops.cafe_receipt_line_photos to authenticated, service_role;
