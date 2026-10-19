-- Procurement resolves a halted purchase request by recording a verified ESB number or absence.
-- DOWN: supabase/rollbacks/20261020000100_ops_cafe_purchase_request_halted_group.sql.

create table ops.cafe_purchase_request_posting_resolutions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  request_id uuid not null,
  push_group_id uuid not null references integrations.esb_push_groups(id) on delete cascade,
  resolution text not null check (resolution in ('recorded_number', 'confirmed_absent')),
  esb_doc_num text,
  resolved_by uuid not null references shared.people(id),
  resolved_at timestamptz not null default clock_timestamp(),
  constraint cafe_purchase_request_posting_resolutions_request_fk foreign key (org_id, request_id)
    references ops.cafe_purchase_requests(org_id, id) on delete cascade,
  constraint cafe_purchase_request_posting_resolutions_number_ck check (
    (resolution = 'recorded_number' and esb_doc_num is not null and btrim(esb_doc_num) <> '')
    or (resolution = 'confirmed_absent' and esb_doc_num is null)
  )
);
comment on table ops.cafe_purchase_request_posting_resolutions is
  'Append-only procurement decisions for halted purchase-request posting; record history supplies the actor and time.';
alter table ops.cafe_purchase_request_posting_resolutions enable row level security;
alter table ops.cafe_purchase_request_posting_resolutions force row level security;
revoke all on ops.cafe_purchase_request_posting_resolutions from public, anon, authenticated, service_role;
grant select on ops.cafe_purchase_request_posting_resolutions to authenticated;
create policy cafe_purchase_request_posting_resolutions_select
  on ops.cafe_purchase_request_posting_resolutions for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and ((select ops.can_manage_cafe_receipt_issues()) or exists (
      select 1 from ops.cafe_purchase_requests r
       where r.org_id = cafe_purchase_request_posting_resolutions.org_id
         and r.id = cafe_purchase_request_posting_resolutions.request_id
    ))
  );

create or replace function shared._history_reader_ops_cafe_purchase_request_posting_resolutions(
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
     and exists (select 1 from ops.cafe_purchase_request_posting_resolutions x
                  where x.id = p_record_key::uuid and x.org_id = shared.current_org_id())
$$;
revoke execute on function shared._history_reader_ops_cafe_purchase_request_posting_resolutions(text, text, jsonb) from public, anon;
grant execute on function shared._history_reader_ops_cafe_purchase_request_posting_resolutions(text, text, jsonb) to authenticated;
insert into shared.record_history_readers (schema_name, table_name, reader)
values ('ops', 'cafe_purchase_request_posting_resolutions',
        'shared._history_reader_ops_cafe_purchase_request_posting_resolutions(text, text, jsonb)');
create trigger record_history_cafe_purchase_request_posting_resolutions
  after insert or update or delete on ops.cafe_purchase_request_posting_resolutions
  for each row execute function shared._record_history_write();

create or replace function ops.list_cafe_purchase_request_halted_groups()
returns table (group_id uuid, request_id uuid, mos_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct g.id, l.request_id, e.payload ->> 'mos_key'
    from integrations.esb_push_groups g
    join integrations.esb_push e on e.push_group_id = g.id and e.org_id = g.org_id
    join ops.cafe_purchase_request_lines l on l.id::text = e.source_ref and l.org_id = g.org_id
   where g.org_id = shared.current_org_id()
     and shared.current_person_id() is not null
     and ops.can_manage_cafe_receipt_issues()
     and g.source_module = 'cafe_purchase_request'
     and g.status = 'dead_letter'
     and g.posting_stage = 'create_sent'
     and g.esb_doc_num is null
     and e.status = 'dead_letter'
     and e.last_error like 'HALTED for a person:%'
   order by l.request_id, g.id
$$;
comment on function ops.list_cafe_purchase_request_halted_groups() is
  'Lists halted purchase-request groups for the same procurement grant used by receipt resolution.';
revoke execute on function ops.list_cafe_purchase_request_halted_groups() from public, anon;
grant execute on function ops.list_cafe_purchase_request_halted_groups() to authenticated;

create or replace function ops.resolve_cafe_purchase_request_halted_group(
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
    raise exception 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_FORBIDDEN' using errcode = '42501';
  end if;
  if p_group_id is null or p_resolution is null or p_resolution not in ('record_number', 'confirm_absent')
     or (p_resolution = 'record_number' and (v_number is null or char_length(v_number) > 128 or v_number ~ '[[:cntrl:]]'))
     or (p_resolution = 'confirm_absent' and p_esb_doc_num is not null) then
    raise exception 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cafe-purchase-request-halted:' || v_org_id || ':' || p_group_id, 0));
  select g.* into v_group from integrations.esb_push_groups g
   where g.id = p_group_id and g.org_id = v_org_id and g.source_module = 'cafe_purchase_request'
   for update;
  if not found or v_group.status <> 'dead_letter' or v_group.posting_stage is distinct from 'create_sent'
     or v_group.esb_doc_num is not null
     or not exists (select 1 from integrations.esb_push e
                     where e.push_group_id = p_group_id and e.org_id = v_org_id
                       and e.status = 'dead_letter' and e.last_error like 'HALTED for a person:%') then
    raise exception 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE' using errcode = '55000';
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

  -- The existing transition guard admits the resolver owner and the worker's human-halt marker.
  update integrations.esb_push e
     set status = 'pending', last_error = null, next_attempt_at = null, locked_at = null
   where e.push_group_id = p_group_id and e.org_id = v_org_id
     and e.status = 'dead_letter' and e.last_error like 'HALTED for a person:%';
  get diagnostics v_requeued = row_count;
  if v_requeued = 0 then
    raise exception 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE' using errcode = '55000';
  end if;

  insert into ops.cafe_purchase_request_posting_resolutions
    (org_id, request_id, push_group_id, resolution, esb_doc_num, resolved_by)
  select v_org_id, l.request_id, p_group_id,
         case when p_resolution = 'record_number' then 'recorded_number' else 'confirmed_absent' end,
         case when p_resolution = 'record_number' then v_number end, v_actor
    from ops.cafe_purchase_request_lines l
    join integrations.esb_push e on e.source_ref = l.id::text and e.push_group_id = p_group_id and e.org_id = l.org_id
   where l.org_id = v_org_id
   order by l.id
   limit 1
  returning id into v_resolution_id;
  if v_resolution_id is null then
    raise exception 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE' using errcode = '55000';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'group_id', p_group_id, 'resolution_id', v_resolution_id,
    'resolution', p_resolution, 'esb_doc_num', v_number));
end;
$$;
comment on function ops.resolve_cafe_purchase_request_halted_group(uuid, text, text) is
  'Procurement records a verified ESB request number for worker adoption without another create, or confirms absence and requeues only human-halted members; every decision is audited.';
revoke execute on function ops.resolve_cafe_purchase_request_halted_group(uuid, text, text) from public, anon;
grant execute on function ops.resolve_cafe_purchase_request_halted_group(uuid, text, text) to authenticated;
