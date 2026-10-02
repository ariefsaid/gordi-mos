-- #1241 Phase 1: waste is a first-class café-log action; evidence uses a private, immutable bucket.
-- Waste quantity stays in the selected ERP product-detail unit (item_unit_id); no MOS conversion
-- or waste-to-production ERP mapping is inferred here. ERP posting remains held until mapping is
-- verified.
--
-- DOWN (manual): restore ops.approve_kitchen_log, ops.approve_kitchen_logs,
-- ops._guard_kitchen_log, ops._guard_cafe_stream_item, ops.kitchen_action_label and the
-- kitchen_logs_insert_member policy from their previous migrations; drop
-- ops.submit_cafe_waste_log, ops.can_add_cafe_waste_photo, ops.can_read_cafe_waste_photo,
-- ops.cafe_waste_photo_log_id, ops.kitchen_log_waste_photos and their grants; drop the two
-- waste_photos_* storage policies and the waste-photos bucket only after confirming no evidence
-- remains; drop the waste index and restore the action/status/destination checks. Never delete
-- storage.objects with SQL.

-- ── Waste row shape and RAW/WIP item eligibility ─────────────────────────────────────────────
alter table ops.kitchen_logs
  drop constraint if exists kitchen_logs_action_check,
  drop constraint if exists kitchen_logs_status_check,
  drop constraint if exists kitchen_logs_destination_matches_action,
  add constraint kitchen_logs_action_check check (action in ('produce','transfer','waste')),
  add constraint kitchen_logs_status_check check (status in ('Draft','Submitted','Approved','Rejected')),
  add constraint kitchen_logs_destination_matches_action check (
    (action = 'produce' and destination_branch_id is null)
    or (action = 'transfer' and destination_branch_id is not null)
    or (action = 'waste' and destination_branch_id is null)
  );

comment on column ops.kitchen_logs.action is
  'produce, transfer, or waste. Waste is a café-log movement whose quantity remains bound to item_unit_id; it is reviewed and reduces recorded stock, but is never mapped to an ERP push in Phase 1.';
comment on column ops.kitchen_logs.item_unit_id is
  'The selected ERP product-detail unit for this recorded quantity. Waste retains the exact unit id and quantity as captured; MOS conversions are not applied.';
comment on column ops.kitchen_logs.status is
  'Draft is reserved for a waste row awaiting its required private photo evidence; only ops.submit_cafe_waste_log may transition it to Submitted.';

create index kitchen_logs_waste_draft_idx on ops.kitchen_logs (org_id, submitted_by, created_at)
  where action = 'waste' and status = 'Draft';

create or replace function ops.kitchen_action_label(p_action text, p_destination_branch_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_action = 'produce' then 'Production'
    when p_action = 'waste' then 'Waste'
    when p_action = 'transfer' then
      'Transfer to ' || coalesce(
        (select case when b.code = 'rumah_rames' then 'Bungur' else b.name end
           from shared.branches b where b.id = p_destination_branch_id),
        'another branch')
  end
$$;
comment on function ops.kitchen_action_label(text, uuid) is
  'Derives the action label from action + destination. Waste is labelled explicitly and has no ERP endpoint or batch prefix; produce/transfer labels retain their existing derivation.';

create or replace function ops._guard_cafe_stream_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.source <> 'mos' or new.branch_id is null or new.activity is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (old.wip_item_id, old.branch_id, old.activity)
       is not distinct from (new.wip_item_id, new.branch_id, new.activity) then
    return new;
  end if;
  if new.action = 'waste' then
    if not exists (
      select 1 from ops.wip_items item
      where item.id = new.wip_item_id and item.org_id = new.org_id and item.kind in ('RAW','WIP')
    ) then
      raise exception 'CAFE_ITEM_REQUIRED: waste logs require a RAW or WIP item'
        using errcode = 'P0014';
    end if;
  elsif not exists (
    select 1 from ops.wip_items item
    where item.id = new.wip_item_id and item.org_id = new.org_id and item.kind = 'WIP'
  ) then
    raise exception 'CAFE_WIP_ITEM_REQUIRED: production logs and plans require a WIP item'
      using errcode = 'P0013';
  end if;
  if not exists (
    select 1 from ops.stream_items stream_item
    where stream_item.org_id = new.org_id and stream_item.branch_id = new.branch_id
      and stream_item.activity = new.activity and stream_item.wip_item_id = new.wip_item_id
  ) then
    raise exception 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list'
      using errcode = 'P0012';
  end if;
  return new;
end;
$$;
comment on function ops._guard_cafe_stream_item() is
  'MOS production logs/plans require a listed WIP item; MOS waste logs require a listed RAW or WIP item. Imported rows and unrelated updates pass. SECURITY INVOKER.';
revoke execute on function ops._guard_cafe_stream_item() from public, anon, authenticated;

create or replace function ops._guard_kitchen_waste_erp_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.action = 'waste' and not exists (
    select 1 from ops.item_units unit
    where unit.id = new.item_unit_id and unit.org_id = new.org_id
      and unit.wip_item_id = new.wip_item_id
      and unit.source_active and unit.confirmed_at is not null
      and unit.esb_product_detail_id is not null
  ) then
    raise exception 'CAFE_ERP_ITEM_UNIT_REQUIRED: waste quantity must retain an active, confirmed ERP product-detail unit'
      using errcode = 'P0015';
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_waste_erp_unit() is
  'A waste row retains exactly one active, confirmed ERP product-detail unit. MOS unit labels/conversions cannot replace or transform the captured ERP detail. SECURITY INVOKER.';
revoke execute on function ops._guard_kitchen_waste_erp_unit() from public, anon, authenticated;
create trigger kitchen_logs_zz_waste_unit_guard
  before insert or update of action, wip_item_id, item_unit_id on ops.kitchen_logs
  for each row execute function ops._guard_kitchen_waste_erp_unit();

-- ── Draft → Submitted is the only submit path for a waste row ─────────────────────────────────
drop policy kitchen_logs_insert_member on ops.kitchen_logs;
create policy kitchen_logs_insert_member on ops.kitchen_logs
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and submitted_by = shared.current_person_id()
    and source = 'mos'
    and ((status = 'Submitted' and action in ('produce','transfer'))
      or (action = 'waste' and status = 'Draft'))
    and (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin'))
  );
comment on policy kitchen_logs_insert_member on ops.kitchen_logs is
  'Café-affiliated member or ops_lead/admin writes a server-attributed Submitted production/transfer row, or their own Draft waste row. Waste cannot be inserted directly as Submitted; it reaches the review queue only through the evidence-gated submit RPC.';

create or replace function ops._guard_kitchen_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_wip_org  uuid;
  v_br_org   uuid;
  v_dest_org uuid;
  v_sub_org  uuid;
  v_rev_org  uuid;
  v_waste_submit boolean := false;
begin
  if tg_op = 'UPDATE' and new.submitted_by is distinct from old.submitted_by then
    raise exception 'submitted_by is immutable' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on a kitchen log' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'source is immutable on a kitchen log' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status = 'Draft' and new.status = 'Draft'
     and (new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date
       or new.qty_porsi is distinct from old.qty_porsi
       or new.notes is distinct from old.notes
       or new.item_unit_id is distinct from old.item_unit_id) then
    raise exception 'waste draft facts are immutable; record a corrected draft instead'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status is distinct from old.status
     and new.status not in ('Approved','Rejected') then
    raise exception 'a Submitted kitchen log may only be approved or rejected'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_waste_submit := old.status = 'Draft' and new.status = 'Submitted' and old.action = 'waste';
    if v_waste_submit then
      if current_user is distinct from (
        select pg_catalog.pg_get_userbyid(proc.proowner)
        from pg_catalog.pg_proc proc
        where proc.oid = pg_catalog.to_regprocedure('ops.submit_cafe_waste_log(uuid)')
      ) then
        raise exception 'waste Drafts may be submitted only through ops.submit_cafe_waste_log'
          using errcode = '42501';
      end if;
      if old.org_id is distinct from shared.current_org_id()
         or old.submitted_by is distinct from shared.current_person_id()
         or old.source <> 'mos' then
        raise exception 'only the waste-log submitter may submit their own draft'
          using errcode = '42501';
      end if;
      if not exists (
        select 1 from storage.objects photo
        where photo.bucket_id = 'waste-photos'
          and ops.cafe_waste_photo_log_id(photo.name) = old.id
      ) then
        raise exception 'a waste log needs at least one uploaded photo before submission'
          using errcode = '23514';
      end if;
      if new.action is distinct from old.action
         or new.destination_branch_id is distinct from old.destination_branch_id
         or new.branch_id is distinct from old.branch_id
         or new.activity is distinct from old.activity
         or new.wip_item_id is distinct from old.wip_item_id
         or new.log_date is distinct from old.log_date
         or new.qty_porsi is distinct from old.qty_porsi
         or new.notes is distinct from old.notes then
        raise exception 'waste submission changes only status and review fields; the log facts are frozen'
          using errcode = '42501';
      end if;
    else
      if not ops.can_review_stream(old.branch_id, old.activity) then
        raise exception 'only the stream''s supervisor or ops_lead/admin may approve or reject a kitchen log'
          using errcode = '42501';
      end if;
      if old.status <> 'Submitted' then
        raise exception 'a reviewed kitchen log keeps its status; record a correction as a new log'
          using errcode = '42501';
      end if;
      if new.action is distinct from old.action
         or new.destination_branch_id is distinct from old.destination_branch_id
         or new.branch_id is distinct from old.branch_id
         or new.activity is distinct from old.activity
         or new.wip_item_id is distinct from old.wip_item_id
         or new.log_date is distinct from old.log_date
         or new.qty_porsi is distinct from old.qty_porsi
         or new.notes is distinct from old.notes then
        raise exception 'a decision changes only the status and the review fields; the log''s facts are frozen'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Approved'
     and new.action = 'transfer' then
    if exists (
      select 1 from ops.kitchen_logs l
       where l.org_id = new.org_id
         and l.branch_id = new.branch_id
         and l.activity = new.activity
         and l.log_date = new.log_date
         and l.action = 'produce'
         and l.status = 'Submitted'
    ) then
      raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
        using errcode = 'P0004';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Rejected' then
    new.reviewed_by := shared.current_person_id();
    new.reviewed_at := now();
  end if;

  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Submitted' then
    if new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date then
      raise exception 'the production stream, movement, wip item and date are immutable on a Submitted log'
        using errcode = '42501';
    end if;
  end if;

  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.wip_item_id is not null then
    select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
    if v_wip_org is distinct from new.org_id then
      raise exception 'wip_item_id must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.branch_id is not null then
    select b.org_id into v_br_org from shared.branches b where b.id = new.branch_id;
    if v_br_org is distinct from new.org_id then
      raise exception 'branch_id must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.destination_branch_id is not null then
    select b.org_id into v_dest_org from shared.branches b where b.id = new.destination_branch_id;
    if v_dest_org is distinct from new.org_id then
      raise exception 'destination_branch_id must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.submitted_by is not null then
    select p.org_id into v_sub_org from shared.people p where p.id = new.submitted_by;
    if v_sub_org is distinct from new.org_id then
      raise exception 'submitted_by must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.reviewed_by is not null then
    select p.org_id into v_rev_org from shared.people p where p.id = new.reviewed_by;
    if v_rev_org is distinct from new.org_id then
      raise exception 'reviewed_by must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_log() is
  'Carries the #236 stream reviewer, decide-freeze, production-first transfer gate, rejection provenance and same-org seams. Adds exactly one non-review transition: a waste submitter may move their own photo-backed Draft to Submitted without changing its facts; all waste state changes remain guarded. SECURITY INVOKER.';
revoke execute on function ops._guard_kitchen_log() from public, anon, authenticated;

create or replace function ops.submit_cafe_waste_log(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log ops.kitchen_logs;
begin
  select * into v_log from ops.kitchen_logs where id = p_log_id for update;
  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if v_log.org_id is distinct from shared.current_org_id()
     or v_log.submitted_by is distinct from shared.current_person_id() then
    raise exception 'only the waste-log submitter may submit their own draft' using errcode = '42501';
  end if;
  if v_log.action <> 'waste' or v_log.source <> 'mos' or v_log.status <> 'Draft' then
    raise exception 'waste log is not an eligible Draft' using errcode = 'P0003';
  end if;
  if not exists (
    select 1 from storage.objects photo
    where photo.bucket_id = 'waste-photos'
      and ops.cafe_waste_photo_log_id(photo.name) = v_log.id
  ) then
    raise exception 'a waste log needs at least one uploaded photo before submission'
      using errcode = '23514';
  end if;
  update ops.kitchen_logs set status = 'Submitted' where id = v_log.id;
end;
$$;
comment on function ops.submit_cafe_waste_log(uuid) is
  'The only Draft→Submitted path for a waste row. Locks the submitter-owned log, requires at least one private photo, and leaves every captured fact unchanged. SECURITY DEFINER.';
revoke execute on function ops.submit_cafe_waste_log(uuid) from public, anon, authenticated;
grant execute on function ops.submit_cafe_waste_log(uuid) to authenticated;

-- ── Private immutable photo storage: <org>/<waste-log>/<random-id>.<image-ext> ───────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('waste-photos', 'waste-photos', false, 5242880, array['image/jpeg','image/png','image/webp']);

create or replace function ops.cafe_waste_photo_log_id(p_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    return null;
  end if;
  return split_part(p_name, '/', 2)::uuid;
end;
$$;
comment on function ops.cafe_waste_photo_log_id(text) is
  'Parses only canonical org/log/random-UUID image paths for private café waste evidence; malformed/traversal names return NULL.';

create or replace function ops.can_read_cafe_waste_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_log_id uuid := ops.cafe_waste_photo_log_id(p_name);
begin
  if v_log_id is null or split_part(p_name, '/', 1) <> shared.current_org_id()::text then
    return false;
  end if;
  return exists (
    select 1 from ops.kitchen_logs log
    where log.id = v_log_id
      and log.org_id = shared.current_org_id()
      and log.action = 'waste'
      and (log.status <> 'Draft' or log.submitted_by = shared.current_person_id())
  );
end;
$$;
comment on function ops.can_read_cafe_waste_photo(text) is
  'Storage read predicate for café waste evidence: path org and parent row must both match the viewer org; draft evidence is visible only to its submitter, submitted/reviewed evidence follows org-readable log access. SECURITY DEFINER.';
revoke execute on function ops.can_read_cafe_waste_photo(text) from public, anon, authenticated;
grant execute on function ops.can_read_cafe_waste_photo(text) to authenticated, service_role;

create or replace function ops.can_add_cafe_waste_photo(p_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_log_id uuid := ops.cafe_waste_photo_log_id(p_name);
  v_org_id uuid := shared.current_org_id();
begin
  if v_log_id is null or split_part(p_name, '/', 1) <> v_org_id::text then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cafe-waste-photo:' || v_log_id::text, 0));
  return exists (
    select 1 from ops.kitchen_logs log
    where log.id = v_log_id
      and log.org_id = v_org_id
      and log.action = 'waste'
      and log.status = 'Draft'
      and log.source = 'mos'
      and log.submitted_by = shared.current_person_id()
      and log.created_at > now() - interval '15 minutes'
      and (select count(*) from storage.objects photo
           where photo.bucket_id = 'waste-photos'
             and ops.cafe_waste_photo_log_id(photo.name) = v_log_id) < 4
  );
end;
$$;
comment on function ops.can_add_cafe_waste_photo(text) is
  'Storage insert predicate: only the same-org submitter can add a photo to their own waste Draft in its 15-minute capture window; a transaction advisory lock makes the four-photo cap race-safe. SECURITY DEFINER.';
revoke execute on function ops.can_add_cafe_waste_photo(text) from public, anon, authenticated;
grant execute on function ops.can_add_cafe_waste_photo(text) to authenticated, service_role;

create policy waste_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'waste-photos' and ops.can_read_cafe_waste_photo(name));
create policy waste_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'waste-photos' and ops.can_add_cafe_waste_photo(name));

create or replace view ops.kitchen_log_waste_photos as
select log.id as log_id, log.org_id, photo.name as path, photo.created_at
from storage.objects photo
join ops.kitchen_logs log on log.id = ops.cafe_waste_photo_log_id(photo.name)
where photo.bucket_id = 'waste-photos'
  and log.action = 'waste';
alter view ops.kitchen_log_waste_photos set (security_invoker = true);
comment on view ops.kitchen_log_waste_photos is
  'Per-waste-item photo records projected from the private Storage objects table; storage RLS supplies uploader/reviewer and org boundaries. Images are immutable evidence; there is no update/delete policy.';
grant select on ops.kitchen_log_waste_photos to authenticated, service_role;

-- ── Approval is reviewed but deliberately has no batch or ERP outbox row ─────────────────────
create or replace function ops.approve_kitchen_log(p_log_id uuid, p_review_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log ops.kitchen_logs;
  v_wip ops.wip_items;
  v_prefix text;
  v_next_n integer;
  v_batch_id text;
  v_endpoint text;
  v_payload jsonb;
  v_target text;
  v_dedup text;
  v_stock_qty numeric(12,2);
  v_branch_code text;
  v_dest_code text;
begin
  select * into v_log from ops.kitchen_logs where id = p_log_id for update;
  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if v_log.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot approve a log outside your org' using errcode = '42501';
  end if;
  if v_log.status <> 'Submitted' then
    raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003';
  end if;
  if not ops.can_review_stream(v_log.branch_id, v_log.activity) then
    raise exception 'only the stream''s supervisor or ops_lead/admin may approve' using errcode = '42501';
  end if;
  if v_log.action = 'transfer' and exists (
    select 1 from ops.kitchen_logs l
     where l.org_id = v_log.org_id and l.branch_id = v_log.branch_id
       and l.activity = v_log.activity and l.log_date = v_log.log_date
       and l.action = 'produce' and l.status = 'Submitted'
  ) then
    raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
      using errcode = 'P0004';
  end if;
  if v_log.action = 'waste' and not exists (
    select 1 from storage.objects photo
    where photo.bucket_id = 'waste-photos'
      and ops.cafe_waste_photo_log_id(photo.name) = v_log.id
  ) then
    raise exception 'a waste log needs at least one uploaded photo before approval' using errcode = '23514';
  end if;

  if v_log.action <> 'waste' then
    v_prefix := ops.kitchen_batch_prefix(v_log.action, v_log.branch_id, v_log.destination_branch_id);
    insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
    values (v_log.org_id, v_prefix, v_log.log_date, 1)
    on conflict (org_id, prefix, log_date) do update
      set last_n = ops.kitchen_batch_seq.last_n + 1
    returning last_n into v_next_n;
    v_batch_id := v_prefix || '-' || to_char(v_log.log_date, 'YYYYMMDD') || '-'
                  || lpad(v_next_n::text, 3, '0');
  end if;

  update ops.kitchen_logs
     set status = 'Approved', reviewed_by = shared.current_person_id(), reviewed_at = now(),
         review_note = p_review_note, batch_id = v_batch_id
   where id = p_log_id;

  -- Quantities are summed as recorded in their bound item_unit_id; no unit conversion is applied.
  -- Waste consumes the recorded stock just like a transfer, while production adds it.
  select coalesce(sum(case when l.action = 'produce' then l.qty_porsi else -l.qty_porsi end), 0)::numeric(12,2)
    into v_stock_qty
    from ops.kitchen_logs l
   where l.org_id = v_log.org_id and l.wip_item_id = v_log.wip_item_id
     and l.branch_id = v_log.branch_id and l.activity = v_log.activity
     and l.log_date = v_log.log_date and l.status = 'Approved';
  insert into ops.kitchen_stock (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
  values (v_log.org_id, v_log.log_date, v_log.wip_item_id, v_log.branch_id, v_log.activity, v_stock_qty)
  on conflict (org_id, log_date, wip_item_id, branch_id, activity) do update
    set usable_qty = excluded.usable_qty, updated_at = now();

  -- Waste remains a reviewed MOS record, but its verified ERP mapping is intentionally absent.
  -- Return NULL and exit before the sole outbox insert; no batch sequence is consumed.
  if v_log.action = 'waste' then
    return null;
  end if;

  select * into v_wip from ops.wip_items where id = v_log.wip_item_id;
  select b.code into v_branch_code from shared.branches b where b.id = v_log.branch_id;
  select b.code into v_dest_code from shared.branches b where b.id = v_log.destination_branch_id;
  v_endpoint := ops.esb_endpoint_for(v_log.action, v_log.branch_id, v_log.destination_branch_id);
  v_payload := jsonb_build_object(
    'batch_id', v_batch_id, 'log_date', v_log.log_date, 'wip_item_id', v_log.wip_item_id,
    'esb_bom_id', v_wip.esb_bom_id, 'esb_product_detail_id_porsi', v_wip.esb_product_detail_id_porsi,
    'qty_porsi', v_log.qty_porsi, 'action', v_log.action, 'activity', v_log.activity,
    'branch_id', v_log.branch_id, 'branch_code', v_branch_code,
    'destination_branch_id', v_log.destination_branch_id, 'destination_branch_code', v_dest_code);
  v_target := integrations.current_esb_target_env();
  v_dedup := 'kitchen|' || v_batch_id || '|' || v_target;
  insert into integrations.esb_push
    (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key)
  values (v_log.org_id, 'kitchen', v_batch_id, v_endpoint, v_payload, v_target, v_dedup)
  on conflict (dedup_key) do nothing;
  return v_batch_id;
end;
$$;
comment on function ops.approve_kitchen_log(uuid, text) is
  'Atomic review approval. Production/transfers retain the existing batch, stock and outbox behavior. Waste preserves its ERP product-detail unit and recorded quantity, recomputes stock, returns NULL, and exits before any batch mint or integrations.esb_push insert pending verified waste mapping. SECURITY DEFINER.';
revoke execute on function ops.approve_kitchen_log(uuid, text) from public, anon, authenticated;
grant execute on function ops.approve_kitchen_log(uuid, text) to authenticated;

create or replace function ops.approve_kitchen_logs(p_log_ids uuid[], p_review_note text)
returns table(group_id uuid, batch_ids text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := gen_random_uuid();
  v_env text := integrations.current_esb_target_env();
  v_endpoint text;
  v_org uuid;
  v_log_id uuid;
  v_ids uuid[];
  v_batch_id text;
  v_batch_ids text[] := '{}';
  v_dedup text := 'kitchen-group|' || v_group::text || '|' || v_env;
begin
  if p_log_ids is null or cardinality(p_log_ids) = 0 then
    raise exception 'bulk approval requires at least one log' using errcode = '22023';
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_log_ids) x;
  select l.org_id, ops.esb_endpoint_for(l.action, l.branch_id, l.destination_branch_id)
    into v_org, v_endpoint from ops.kitchen_logs l where l.id = v_ids[1];
  if v_org is null then raise exception 'kitchen log not found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from ops.kitchen_logs l where l.id = any(v_ids)
      and (l.org_id is distinct from shared.current_org_id() or l.status <> 'Submitted')
  ) then
    raise exception 'bulk approval contains a log that is not eligible' using errcode = 'P0003';
  end if;
  if (select count(*) from ops.kitchen_logs where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'bulk approval contains a log that is not eligible' using errcode = 'P0003';
  end if;
  if exists (select 1 from ops.kitchen_logs l where l.id = any(v_ids) and l.action = 'waste') then
    raise exception 'waste logs must be approved individually; ERP posting is held' using errcode = '22023';
  end if;
  if exists (
    select 1 from ops.kitchen_logs l where l.id = any(v_ids)
      and (ops.esb_endpoint_for(l.action, l.branch_id, l.destination_branch_id) <> v_endpoint
        or l.destination_branch_id is distinct from (select destination_branch_id from ops.kitchen_logs where id = v_ids[1])
        or l.branch_id is distinct from (select branch_id from ops.kitchen_logs where id = v_ids[1])
        or l.activity is distinct from (select activity from ops.kitchen_logs where id = v_ids[1])
        or l.log_date is distinct from (select log_date from ops.kitchen_logs where id = v_ids[1]))
  ) then
    raise exception 'bulk approval requires one ERP endpoint, stream, and date per document' using errcode = '22023';
  end if;
  if v_endpoint = 'noop' then
    raise exception 'bulk approval cannot mint a document for noop-only movements' using errcode = '22023';
  end if;
  if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'only ops_lead/admin may approve' using errcode = '42501';
  end if;

  insert into integrations.esb_push_groups (id, org_id, target_env, dedup_key)
    values (v_group, v_org, v_env, v_dedup);
  foreach v_log_id in array v_ids loop
    select ops.approve_kitchen_log(v_log_id, p_review_note) into v_batch_id;
    v_batch_ids := array_append(v_batch_ids, v_batch_id);
    update ops.kitchen_logs set push_group_id = v_group where id = v_log_id;
    update integrations.esb_push set push_group_id = v_group
      where org_id = v_org and source_module = 'kitchen'
        and source_ref = (select batch_id from ops.kitchen_logs where id = v_log_id);
  end loop;
  return query select v_group, v_batch_ids;
end;
$$;
comment on function ops.approve_kitchen_logs(uuid[], text) is
  'Atomic bulk approval session: one endpoint-homogeneous group document. Partial failure is whole-document failure; ERP document number is fanned out to all member logs by the worker. Off-plan individual approvals remain ungrouped. Waste rows are refused before a group is created; waste approval must use the single-row path, which has no ERP batch or push.';
revoke execute on function ops.approve_kitchen_logs(uuid[], text) from public, anon, authenticated;
grant execute on function ops.approve_kitchen_logs(uuid[], text) to authenticated;
