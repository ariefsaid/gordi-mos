-- Restart expired, photo-less waste capture atomically; retain original facts for history.
-- DOWN (manual): drop function ops.restart_cafe_waste_draft(uuid,date); drop trigger
-- kitchen_logs_restart_guard on ops.kitchen_logs; drop function ops._guard_waste_restart();
-- restore ops.can_add_cafe_waste_photo(text) from 20261002000030_ops_cafe_waste_photos.sql;
-- alter table ops.kitchen_logs drop column superseded_by;
alter table ops.kitchen_logs add column superseded_by uuid references ops.kitchen_logs(id);
comment on column ops.kitchen_logs.superseded_by is
  'Replacement waste draft created by the explicit restart RPC. The original remains in history but is no longer resumable.';

create function ops._guard_waste_restart()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.superseded_by is not null then
      raise exception 'a new kitchen log cannot already be superseded' using errcode = '42501';
    end if;
  elsif old.superseded_by is not null and new.status is distinct from old.status then
    raise exception 'a superseded waste draft cannot be submitted' using errcode = '42501';
  elsif new.superseded_by is distinct from old.superseded_by then
    if old.superseded_by is not null or new.superseded_by is null
       or current_user is distinct from (
         select pg_catalog.pg_get_userbyid(proc.proowner) from pg_catalog.pg_proc proc
         where proc.oid = pg_catalog.to_regprocedure('ops.restart_cafe_waste_draft(uuid,date)')
       ) then
      raise exception 'waste drafts are superseded only by the restart RPC' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function ops._guard_waste_restart() from public, anon, authenticated;
create trigger kitchen_logs_restart_guard before insert or update on ops.kitchen_logs
  for each row execute function ops._guard_waste_restart();

create function ops.restart_cafe_waste_draft(p_log_id uuid, p_log_date date)
returns table (id uuid, log_date date)
language plpgsql security definer set search_path = '' as $$
declare
  v_log ops.kitchen_logs;
  v_replacement uuid;
begin
  -- Share the photo predicate's lock so the evidence check and retirement cannot race an upload.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cafe-waste-photo:' || p_log_id::text, 0));
  select * into v_log from ops.kitchen_logs log where log.id = p_log_id for update;
  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if v_log.org_id is distinct from shared.current_org_id()
     or v_log.submitted_by is distinct from shared.current_person_id()
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'only the waste-log submitter may restart their own draft' using errcode = '42501';
  end if;
  if v_log.action <> 'waste' or v_log.source <> 'mos' or v_log.status <> 'Draft' then
    raise exception 'waste log is not an eligible Draft' using errcode = 'P0003';
  end if;
  if v_log.superseded_by is not null then
    -- A lost response or concurrent retry returns the same replacement, never another draft.
    return query select log.id, log.log_date from ops.kitchen_logs log where log.id = v_log.superseded_by;
    return;
  end if;
  if v_log.created_at > now() - interval '15 minutes' or exists (
    select 1 from storage.objects photo where photo.bucket_id = 'waste-photos'
      and ops.cafe_waste_photo_log_id(photo.name) = v_log.id
  ) then
    raise exception 'restart requires an expired waste draft without photos' using errcode = '23514';
  end if;
  if p_log_date is null then
    raise exception 'replacement log date is required' using errcode = '22023';
  end if;
  insert into ops.kitchen_logs
    (org_id, submitted_by, business_unit_id, log_date, branch_id, activity, action,
     destination_branch_id, wip_item_id, item_unit_id, qty_porsi, notes, status, source)
  values
    (v_log.org_id, v_log.submitted_by, v_log.business_unit_id, p_log_date, v_log.branch_id,
     v_log.activity, 'waste', null, v_log.wip_item_id, v_log.item_unit_id, v_log.qty_porsi,
     v_log.notes, 'Draft', 'mos')
  returning kitchen_logs.id into v_replacement;
  update ops.kitchen_logs set superseded_by = v_replacement where kitchen_logs.id = v_log.id;
  return query select log.id, log.log_date from ops.kitchen_logs log where log.id = v_replacement;
end;
$$;
comment on function ops.restart_cafe_waste_draft(uuid,date) is
  'Atomically replaces the current submitter''s expired photo-less waste draft, copying its exact captured unit and quantity. Original facts remain; retries return the same replacement. SECURITY DEFINER.';
revoke execute on function ops.restart_cafe_waste_draft(uuid,date) from public, anon, authenticated;
grant execute on function ops.restart_cafe_waste_draft(uuid,date) to authenticated;

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
      and log.superseded_by is null
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
  'Storage insert predicate: only the same-org submitter can add a photo to their own unsuperseded waste Draft in its 15-minute capture window; a transaction advisory lock makes the four-photo cap race-safe. SECURITY DEFINER.';
revoke execute on function ops.can_add_cafe_waste_photo(text) from public, anon, authenticated;
grant execute on function ops.can_add_cafe_waste_photo(text) to authenticated, service_role;
