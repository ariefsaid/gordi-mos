-- Rollback for 20261007005500_ops_cafe_receipt_explanations.sql (#1425).
-- Refuses to erase persisted conditions or private photo evidence. Review the guard before use.
begin;
do $$
begin
  if exists (select 1 from ops.cafe_receipt_lines where cardinality(conditions) > 0 or condition_reason is not null) then
    raise exception 'manual rollback blocked: receipt condition evidence exists; export or retain it first';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'cafe-receipt-photos') then
    raise exception 'manual rollback blocked: private receipt photos exist; export or retain them first';
  end if;
end;
$$;

drop policy if exists cafe_receipt_photos_no_update on storage.objects;
drop policy if exists cafe_receipt_photos_no_delete on storage.objects;
drop policy if exists cafe_receipt_photos_select on storage.objects;
drop policy if exists cafe_receipt_photos_insert on storage.objects;
drop view if exists ops.cafe_receipt_line_photos;
drop function if exists ops.can_add_cafe_receipt_photo(text);
drop function if exists ops.can_read_cafe_receipt_photo(text);
drop function if exists ops.cafe_receipt_photo_line_id(text);
drop function if exists ops.set_cafe_receipt_line_explanation(uuid, boolean, text);
-- Supabase protects storage.buckets from SQL DELETE. Leave its empty, private row in place;
-- an operator can remove it with the Storage API after this rollback if required.

alter table ops.cafe_receipt_lines
  drop constraint if exists cafe_receipt_lines_conditions_check,
  drop constraint if exists cafe_receipt_lines_reason_check,
  drop constraint if exists cafe_receipt_lines_reason_needs_condition_check,
  drop constraint if exists cafe_receipt_lines_condition_audit_check,
  drop column if exists condition_updated_at,
  drop column if exists condition_updated_by,
  drop column if exists condition_reason,
  drop column if exists conditions;

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
  select jsonb_agg(jsonb_build_array(l.item_unit_id, l.quantity) order by l.item_unit_id, l.quantity)
    into v_requested
    from (select (value ->> 'item_unit_id')::uuid as item_unit_id,
                 replace(value ->> 'quantity', ',', '.')::numeric as quantity
            from jsonb_array_elements(p_lines)) l;
  if (select count(distinct value ->> 'item_unit_id') from jsonb_array_elements(p_lines))
     <> jsonb_array_length(p_lines) then
    raise exception 'CAFE_RECEIPT_LINE_DUPLICATE' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':' || p_client_key::text, 0));
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
  insert into ops.cafe_receipt_lines (org_id, receipt_id, wip_item_id, item_name, item_category, item_unit_id, unit_name, received_quantity)
  select v_org_id, v_receipt.id, '00000000-0000-0000-0000-000000000000'::uuid, '', null,
         (r.value ->> 0)::uuid, '', (r.value ->> 1)::numeric
    from jsonb_array_elements(v_requested) r;
  perform set_config('app.cafe_receipt_action', '', true);
  return jsonb_build_object('receipt_id', v_receipt.id, 'outcome', 'created', 'status', v_receipt.status,
                            'row_version', v_receipt.row_version, 'posting_status', v_receipt.posting_status);
end;
$$;
comment on function ops.submit_cafe_receipt(uuid, text, date, uuid, jsonb) is
  'Count submit: atomically creates one Counted receipt with 1 to 150 lines from the receiver''s product details and positive decimal quantities. Stamps org, receiver, source, status, time and location server-side; a repeat with the same client key and lines returns the existing receipt, a different payload is a conflict.';

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
     set status = 'Submitted', delivery_note_number = v_note,
         submitted_at = clock_timestamp(), row_version = r.row_version + 1
   where r.id = p_receipt_id
  returning * into v_receipt;
  perform set_config('app.cafe_receipt_action', '', true);
  return jsonb_build_object('receipt_id', v_receipt.id, 'status', v_receipt.status,
                            'row_version', v_receipt.row_version);
end;
$$;
comment on function ops.send_cafe_receipt_for_review(uuid, integer, text) is
  'The receiver moves their own Counted receipt to Submitted at its current version, optionally adding the supplier delivery-note number as free text. Quantities stay locked.';

commit;
