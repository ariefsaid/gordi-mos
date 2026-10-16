-- #1533 — resolve an inconclusive goods-receipt lookup from Receipt issues. Procurement either
-- records the ESB number it found by hand (the worker adopts it without another ERP call), or
-- confirms it is absent and returns the halted outbox members to the worker. Every decision has
-- an audited row attached to its receipt.
--
-- DOWN: see supabase/rollbacks/20261009000100_ops_cafe_receipt_halted_group.sql.

-- A recorded number is an operator's verified proof, not a worker-created draft to authorize.
alter table integrations.esb_push_groups
  drop constraint esb_push_groups_posting_stage_check,
  add constraint esb_push_groups_posting_stage_check check (
    posting_stage is null
    or (posting_stage = 'create_sent' and esb_doc_num is null)
    or (posting_stage in ('awaiting_authorization', 'operator_confirmed') and esb_doc_num is not null)
  );
comment on column integrations.esb_push_groups.posting_stage is
  'Goods-receipt groups only. create_sent: a create may have reached ESB with its answer lost, so the worker looks the MOS key up before any create. awaiting_authorization: the worker created a number and ESB has not authorized it. operator_confirmed: procurement found and recorded the ESB number; the worker adopts it without another ERP call. Null: no ESB action is pending; with status posted, esb_doc_num is authorized.';

-- One append-only business record per person decision; its history entry supplies actor and time.
create table ops.cafe_receipt_posting_resolutions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade,
  receipt_id     uuid not null,
  push_group_id  uuid not null references integrations.esb_push_groups(id) on delete cascade,
  resolution     text not null check (resolution in ('recorded_number', 'confirmed_absent')),
  esb_doc_num    text,
  resolved_by    uuid not null references shared.people(id),
  resolved_at    timestamptz not null default clock_timestamp(),
  constraint cafe_receipt_posting_resolutions_receipt_fk foreign key (org_id, receipt_id)
    references ops.cafe_receipts(org_id, id) on delete cascade,
  constraint cafe_receipt_posting_resolutions_number_ck check (
    (resolution = 'recorded_number' and esb_doc_num is not null and btrim(esb_doc_num) <> '')
    or (resolution = 'confirmed_absent' and esb_doc_num is null)
  )
);
comment on table ops.cafe_receipt_posting_resolutions is
  'Append-only procurement decisions for a goods-receipt group halted by an inconclusive ESB lookup. The row records whether a number was found or absence was confirmed, and who made the decision and when; it is part of the receipt record history.';

alter table ops.cafe_receipt_posting_resolutions enable row level security;
alter table ops.cafe_receipt_posting_resolutions force row level security;
revoke all on ops.cafe_receipt_posting_resolutions from public, anon, authenticated, service_role;
grant select on ops.cafe_receipt_posting_resolutions to authenticated;
create policy cafe_receipt_posting_resolutions_select_receipt_readers
  on ops.cafe_receipt_posting_resolutions for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r
                 where r.org_id = cafe_receipt_posting_resolutions.org_id
                   and r.id = cafe_receipt_posting_resolutions.receipt_id)
  );
comment on policy cafe_receipt_posting_resolutions_select_receipt_readers
  on ops.cafe_receipt_posting_resolutions is
  'Resolution visibility follows the receipt row''s read policy; writes are only through the procurement RPC.';

-- Record-history wiring follows the same visibility as the audited source row.
create or replace function shared._history_reader_ops_cafe_receipt_posting_resolutions(
  p_record_key text, p_action text, p_snapshot jsonb
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_action in ('insert', 'update')
     and p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from ops.cafe_receipt_posting_resolutions x
                  where x.id = p_record_key::uuid and x.org_id = shared.current_org_id())
$$;
comment on function shared._history_reader_ops_cafe_receipt_posting_resolutions(text, text, jsonb) is
  'History read predicate for ops.cafe_receipt_posting_resolutions (#1533): the resolution row''s own read policy.';
revoke execute on function shared._history_reader_ops_cafe_receipt_posting_resolutions(text, text, jsonb) from public, anon;
grant execute on function shared._history_reader_ops_cafe_receipt_posting_resolutions(text, text, jsonb) to authenticated;
insert into shared.record_history_readers (schema_name, table_name, reader)
values ('ops', 'cafe_receipt_posting_resolutions',
        'shared._history_reader_ops_cafe_receipt_posting_resolutions(text, text, jsonb)');
create trigger record_history_cafe_receipt_posting_resolutions
  after insert or update or delete on ops.cafe_receipt_posting_resolutions
  for each row execute function shared._record_history_write();

-- Reuse the issue surface's procurement capability. The caller never supplies an org or actor.
create or replace function ops.list_cafe_receipt_halted_groups()
returns table (group_id uuid, receipt_id uuid, po_number text, mos_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct g.id, q.receipt_id, e.payload ->> 'po_number', e.payload ->> 'mos_key'
    from integrations.esb_push_groups g
    join integrations.esb_push e on e.push_group_id = g.id and e.org_id = g.org_id
    join ops.cafe_receipt_portions q on q.push_id = e.id and q.org_id = g.org_id
    join ops.cafe_receipts r on r.org_id = q.org_id and r.id = q.receipt_id
   where g.org_id = shared.current_org_id()
     and shared.current_person_id() is not null
     and ops.can_manage_cafe_receipt_issues()
     and g.source_module = 'cafe_receipt'
     and g.status = 'dead_letter'
     and g.posting_stage = 'create_sent'
     and g.esb_doc_num is null
     and e.status = 'dead_letter'
     and e.last_error like 'HALTED for a person:%'
   order by q.receipt_id, g.id
$$;
comment on function ops.list_cafe_receipt_halted_groups() is
  'Lists goods-receipt groups halted by an inconclusive ESB lookup for a procurement-capability holder; returns only group and receipt context needed to resolve them.';
revoke execute on function ops.list_cafe_receipt_halted_groups() from public, anon;
grant execute on function ops.list_cafe_receipt_halted_groups() to authenticated;

create or replace function ops.resolve_cafe_receipt_halted_group(
  p_group_id uuid, p_resolution text, p_esb_doc_num text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_group integrations.esb_push_groups%rowtype;
  v_number text := nullif(btrim(p_esb_doc_num), '');
  v_requeued integer;
  v_resolution_id uuid;
begin
  if v_org_id is null or v_actor is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_HALTED_GROUP_FORBIDDEN' using errcode = '42501';
  end if;
  if p_group_id is null or p_resolution is null or p_resolution not in ('record_number', 'confirm_absent')
     or (p_resolution = 'record_number' and (v_number is null or char_length(v_number) > 128 or v_number ~ '[[:cntrl:]]'))
     or (p_resolution = 'confirm_absent' and p_esb_doc_num is not null) then
    raise exception 'CAFE_RECEIPT_HALTED_GROUP_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-halted:' || v_org_id || ':' || p_group_id, 0));
  select g.* into v_group from integrations.esb_push_groups g
   where g.id = p_group_id and g.org_id = v_org_id and g.source_module = 'cafe_receipt'
   for update;
  if not found or v_group.status <> 'dead_letter' or v_group.posting_stage <> 'create_sent'
     or v_group.esb_doc_num is not null
     or not exists (select 1 from integrations.esb_push e
                     where e.push_group_id = p_group_id and e.org_id = v_org_id
                       and e.status = 'dead_letter' and e.last_error like 'HALTED for a person:%') then
    raise exception 'CAFE_RECEIPT_HALTED_GROUP_NOT_RESOLVABLE' using errcode = '55000';
  end if;

  if p_resolution = 'record_number' then
    update integrations.esb_push_groups
       set status = 'pending', esb_doc_num = v_number, posting_stage = 'operator_confirmed', last_error = null
     where id = p_group_id and org_id = v_org_id;
  else
    update integrations.esb_push_groups
       set status = 'pending', esb_doc_num = null, posting_stage = null, last_error = null
     where id = p_group_id and org_id = v_org_id;
  end if;

  update integrations.esb_push e
     set status = 'pending', last_error = null, next_attempt_at = null, locked_at = null
   where e.push_group_id = p_group_id and e.org_id = v_org_id
     and e.status = 'dead_letter' and e.last_error like 'HALTED for a person:%';
  get diagnostics v_requeued = row_count;
  if v_requeued = 0 then
    raise exception 'CAFE_RECEIPT_HALTED_GROUP_NOT_RESOLVABLE' using errcode = '55000';
  end if;

  insert into ops.cafe_receipt_posting_resolutions
    (org_id, receipt_id, push_group_id, resolution, esb_doc_num, resolved_by)
  select v_org_id, q.receipt_id, p_group_id,
         case when p_resolution = 'record_number' then 'recorded_number' else 'confirmed_absent' end,
         case when p_resolution = 'record_number' then v_number end, v_actor
    from ops.cafe_receipt_portions q
    join integrations.esb_push e on e.id = q.push_id and e.push_group_id = p_group_id
   where q.org_id = v_org_id
   order by q.id
   limit 1
  returning id into v_resolution_id;
  if v_resolution_id is null then
    raise exception 'CAFE_RECEIPT_HALTED_GROUP_NOT_RESOLVABLE' using errcode = '55000';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'group_id', p_group_id, 'resolution_id', v_resolution_id,
    'resolution', p_resolution, 'esb_doc_num', v_number));
end;
$$;
comment on function ops.resolve_cafe_receipt_halted_group(uuid, text, text) is
  'Procurement-only resolution for a goods-receipt group halted by an inconclusive lookup. Records a hand-found ESB number for worker adoption, or confirms absence and requeues only halted members; each decision is recorded on the receipt history.';
revoke execute on function ops.resolve_cafe_receipt_halted_group(uuid, text, text) from public, anon;
grant execute on function ops.resolve_cafe_receipt_halted_group(uuid, text, text) to authenticated;

-- A dead letter returns to pending only through the procurement resolution above, and only when
-- the row records the worker's human-halt marker. All other terminal transitions remain closed.
create or replace function integrations._guard_esb_push_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claim_owner name;
  v_reaper_owner name;
  v_delay_seconds integer;
begin
  if old.status = 'pending' and new.status = 'in_flight' then
    select pg_catalog.pg_get_userbyid(p.proowner) into v_claim_owner
      from pg_catalog.pg_proc p
     where p.oid = pg_catalog.to_regprocedure('integrations.claim_esb_pushes(uuid[])');
    if current_user is distinct from v_claim_owner then
      raise exception 'pending rows enter flight through the claim routine' using errcode = '42501';
    end if;
    new.locked_at := clock_timestamp();
    new.next_attempt_at := null;
    return new;
  end if;

  if old.status = 'in_flight' and new.status in ('posted','failed','dead_letter') then
    new.locked_at := null;
    if new.status = 'failed' then
      v_delay_seconds := least(3600, 60 * power(2, least(greatest(new.retry_count - 1, 0), 6))::integer);
      new.next_attempt_at := clock_timestamp() + make_interval(secs => v_delay_seconds);
    else
      new.next_attempt_at := null;
    end if;
    return new;
  end if;

  if old.status = 'in_flight' and new.status = 'pending' then
    select pg_catalog.pg_get_userbyid(p.proowner) into v_reaper_owner
      from pg_catalog.pg_proc p
     where p.oid = pg_catalog.to_regprocedure('integrations.reap_esb_pushes()');
    if current_user is distinct from v_reaper_owner
       or old.locked_at is null
       or old.locked_at >= clock_timestamp() - interval '10 minutes' then
      raise exception 'an active lease cannot return to pending' using errcode = '42501';
    end if;
    new.retry_count := old.retry_count + 1;
    new.locked_at := null;
    v_delay_seconds := least(3600, 60 * power(2, least(greatest(new.retry_count - 1, 0), 6))::integer);
    new.next_attempt_at := clock_timestamp() + make_interval(secs => v_delay_seconds);
    return new;
  end if;

  if old.status = 'failed' and new.status = 'pending' then
    select pg_catalog.pg_get_userbyid(p.proowner) into v_reaper_owner
      from pg_catalog.pg_proc p
     where p.oid = pg_catalog.to_regprocedure('integrations.reap_esb_pushes()');
    if current_user is distinct from v_reaper_owner
       or old.next_attempt_at is null
       or old.next_attempt_at > clock_timestamp() then
      raise exception 'retry promotion is due through the reaper' using errcode = '42501';
    end if;
    new.locked_at := null;
    new.next_attempt_at := null;
    return new;
  end if;

  if old.status = 'dead_letter' and new.status = 'pending' then
    select pg_catalog.pg_get_userbyid(p.proowner) into v_reaper_owner
      from pg_catalog.pg_proc p
     where p.oid = pg_catalog.to_regprocedure('ops.resolve_cafe_receipt_halted_group(uuid,text,text)');
    if current_user is distinct from v_reaper_owner
       or old.last_error not like 'HALTED for a person:%' then
      raise exception 'only a halted goods-receipt group may be requeued' using errcode = '42501';
    end if;
    new.locked_at := null;
    new.next_attempt_at := null;
    return new;
  end if;

  if old.status in ('pending','failed') and new.status = 'dead_letter'
     and exists (select 1 from shared.orgs o where o.id = old.org_id and o.is_sample) then
    new.locked_at := null;
    new.next_attempt_at := null;
    return new;
  end if;

  raise exception 'illegal outbox status transition: % -> %', old.status, new.status
    using errcode = '42501';
end;
$$;
revoke execute on function integrations._guard_esb_push_transition() from public, anon, authenticated;
