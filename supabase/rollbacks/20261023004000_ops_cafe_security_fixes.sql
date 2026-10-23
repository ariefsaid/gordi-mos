-- DOWN for 20261023004000_ops_cafe_security_fixes.sql. Restores settlement from the live switch, the
-- three-argument route helper, the capability-only audit read, and re-key that carries the switch.
begin;
create or replace function ops._cafe_count_movements_settled(p_org_id uuid, p_branch_id uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_day < (statement_timestamp() at time zone 'Asia/Jakarta')::date
    and not exists (
      select 1 from ops.kitchen_logs log
       where log.org_id = p_org_id and log.log_date = p_day
         and (log.branch_id = p_branch_id or log.destination_branch_id = p_branch_id)
         and (log.status = 'Submitted' or (log.status = 'Approved'
           and coalesce(ops.esb_endpoint_for_movement(log.action, log.branch_id, log.activity, log.destination_branch_id),'unmapped') <> 'noop'
           and (not log.posted_to_esb or nullif(log.esb_doc_num, '') is null or log.posted_at is null
             or exists (select 1 from integrations.esb_push push where push.org_id = log.org_id
               and push.source_module = 'kitchen' and push.source_ref = log.batch_id
               and push.status in ('pending','in_flight','failed','dead_letter')))))
    )
$$;
revoke all on function ops._cafe_count_movements_settled(uuid,uuid,date) from public,anon,authenticated,service_role;
drop function ops.esb_endpoint_for_movement(text, uuid, text, uuid);
drop function ops.cafe_route_records_in_esb(uuid, uuid, text, uuid);
create function ops.cafe_route_records_in_esb(p_branch_id uuid, p_activity text, p_destination_branch_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select d.record_in_esb from ops.cafe_destinations d
                    where d.origin_branch_id = p_branch_id and d.origin_activity = p_activity
                      and d.destination_branch_id = p_destination_branch_id), false)
$$;
revoke execute on function ops.cafe_route_records_in_esb(uuid, text, uuid) from public, anon, authenticated, service_role;

-- esb_endpoint_for keeps its two-Branch rule; this adds the route switch on top of it.
create function ops.esb_endpoint_for_movement(p_action text, p_branch_id uuid, p_activity text, p_destination_branch_id uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select case when x.endpoint = 'simple-transfer'
                and not ops.cafe_route_records_in_esb(p_branch_id, p_activity, p_destination_branch_id)
              then 'noop' else x.endpoint end
    from (select ops.esb_endpoint_for(p_action, p_branch_id, p_destination_branch_id) as endpoint) x
$$;
comment on function ops.esb_endpoint_for_movement(text, uuid, text, uuid) is
  'The ERP operation for a movement on a route: esb_endpoint_for, except a cross-branch transfer on a route whose Record in ESB switch is off is noop and never queued.';
revoke execute on function ops.esb_endpoint_for_movement(text, uuid, text, uuid) from public, anon, authenticated, service_role;
comment on function ops.set_cafe_route_record_in_esb(jsonb, boolean) is
  'Admin-only writer for a route''s Record in ESB switch; audited like any other route change.';
drop policy cafe_transfer_route_audit_select_admin on ops.cafe_transfer_route_audit;
create policy cafe_transfer_route_audit_select_admin on ops.cafe_transfer_route_audit
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (select shared.is_org_member())
    and (select shared.can('cafe.transfer_routes.manage'))
  );
create or replace function ops.update_cafe_transfer_route(p_key jsonb, p_expected_version bigint, p_input jsonb, p_client_request_id uuid)
returns table(
  origin_branch_id uuid,
  origin_activity text,
  destination_branch_id uuid,
  row_version bigint,
  updated_at timestamptz,
  updated_by uuid,
  eligibility text,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := (select shared.current_org_id());
  v_actor_id uuid := (select shared.current_person_id());
  v_key record;
  v_input record;
  v_payload jsonb;
  v_replay ops.cafe_transfer_route_audit%rowtype;
  v_before ops.cafe_destinations%rowtype;
  v_after ops.cafe_destinations%rowtype;
  v_version bigint;
begin
  if v_org_id is null or v_actor_id is null or not shared.is_org_member()
     or not shared.can('cafe.transfer_routes.manage') then
    raise exception 'transfer route management is admin-only' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'client_request_id and a positive expected_version are required' using errcode = '22023';
  end if;
  select * into v_key from ops._parse_cafe_transfer_route(p_key);
  select * into v_input from ops._parse_cafe_transfer_route(p_input);
  v_payload := jsonb_build_object('operation', 'update', 'key', p_key,
    'expected_version', p_expected_version, 'input', p_input);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_org_id::text || ':' || v_actor_id::text || ':' || p_client_request_id::text, 0));
  select * into v_replay from ops.cafe_transfer_route_audit a
   where a.org_id = v_org_id and a.actor_person_id = v_actor_id and a.request_id = p_client_request_id;
  if found then
    if v_replay.request_payload is distinct from v_payload or v_replay.operation <> 'update' then
      raise exception 'client_request_id was already used for a different route operation' using errcode = '22023';
    end if;
    return query select
      (v_replay.after_route ->> 'origin_branch_id')::uuid,
      v_replay.after_route ->> 'origin_activity',
      (v_replay.after_route ->> 'destination_branch_id')::uuid,
      (v_replay.after_route ->> 'row_version')::bigint,
      (v_replay.after_route ->> 'updated_at')::timestamptz,
      (v_replay.after_route ->> 'updated_by')::uuid,
      v_replay.after_route ->> 'eligibility', v_replay.after_route ->> 'reason';
    return;
  end if;
  select * into v_before from ops.cafe_destinations d
   where d.org_id = v_org_id and d.origin_branch_id = v_key.origin_branch_id
     and d.origin_activity = v_key.origin_activity and d.destination_branch_id = v_key.destination_branch_id
   for update;
  if not found then
    raise exception 'transfer route not found' using errcode = 'P0002';
  end if;
  if v_before.row_version <> p_expected_version then
    raise exception 'transfer route changed since it was loaded' using errcode = '40001';
  end if;
  perform ops._validate_cafe_transfer_route(v_org_id, v_input.origin_branch_id,
    v_input.origin_activity, v_input.destination_branch_id);
  if (v_input.origin_branch_id, v_input.origin_activity, v_input.destination_branch_id)
     is distinct from (v_before.origin_branch_id, v_before.origin_activity, v_before.destination_branch_id)
     and exists (
       select 1 from ops.cafe_destinations d
       where d.org_id = v_org_id and d.origin_branch_id = v_input.origin_branch_id
         and d.origin_activity = v_input.origin_activity and d.destination_branch_id = v_input.destination_branch_id
     ) then
    raise exception 'transfer route already exists' using errcode = '22023';
  end if;
  v_version := p_expected_version + 1;
  if (v_input.origin_branch_id, v_input.origin_activity, v_input.destination_branch_id)
     is distinct from (v_before.origin_branch_id, v_before.origin_activity, v_before.destination_branch_id) then
    delete from ops.cafe_destinations d where d.org_id = v_org_id
      and d.origin_branch_id = v_key.origin_branch_id and d.origin_activity = v_key.origin_activity
      and d.destination_branch_id = v_key.destination_branch_id;
    insert into ops.cafe_destinations
      (org_id, origin_branch_id, origin_activity, destination_branch_id, row_version, updated_at, updated_by, record_in_esb)
    values (v_org_id, v_input.origin_branch_id, v_input.origin_activity, v_input.destination_branch_id,
      v_version, clock_timestamp(), v_actor_id, v_before.record_in_esb)
    returning * into v_after;
  else
    update ops.cafe_destinations d set row_version = v_version, updated_at = clock_timestamp(), updated_by = v_actor_id
     where d.org_id = v_org_id and d.origin_branch_id = v_key.origin_branch_id
       and d.origin_activity = v_key.origin_activity and d.destination_branch_id = v_key.destination_branch_id
    returning * into v_after;
  end if;
  insert into ops.cafe_transfer_route_audit
    (org_id, before_route, after_route, operation, actor_person_id, request_id, request_payload, resulting_version)
  values (v_org_id,
    jsonb_build_object('org_id', v_before.org_id, 'origin_branch_id', v_before.origin_branch_id,
      'origin_activity', v_before.origin_activity, 'destination_branch_id', v_before.destination_branch_id,
      'row_version', v_before.row_version, 'updated_at', v_before.updated_at, 'updated_by', v_before.updated_by),
    jsonb_build_object('org_id', v_after.org_id, 'origin_branch_id', v_after.origin_branch_id,
      'origin_activity', v_after.origin_activity, 'destination_branch_id', v_after.destination_branch_id,
      'row_version', v_after.row_version, 'updated_at', v_after.updated_at, 'updated_by', v_after.updated_by,
      'eligibility', 'eligible', 'reason', null),
    'update', v_actor_id, p_client_request_id, v_payload, v_after.row_version);
  return query select v_after.origin_branch_id, v_after.origin_activity, v_after.destination_branch_id,
    v_after.row_version, v_after.updated_at, v_after.updated_by, 'eligible'::text, null::text;
exception when unique_violation then
  raise exception 'transfer route already exists' using errcode = '22023';
end;
$$;
commit;
