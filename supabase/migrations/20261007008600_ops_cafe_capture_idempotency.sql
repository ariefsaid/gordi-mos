-- Café production, transfer and waste all write ops.kitchen_logs. A stable client key makes a
-- retransmitted capture a read of the original fact instead of a second increment (or waste Draft).
-- Legacy/imported rows keep NULL; the MOS capture RPC requires a key for every new app write.
--
-- DOWN (manual): drop function ops.insert_cafe_capture_logs(jsonb); drop constraint
-- kitchen_logs_org_client_request_id_key; drop column ops.kitchen_logs.client_request_id.

alter table ops.kitchen_logs
  add column client_request_id uuid;
comment on column ops.kitchen_logs.client_request_id is
  'Client-generated identity for one MOS café capture attempt. NULL remains valid for legacy and imported rows; the app capture RPC rejects new rows without a key.';

alter table ops.kitchen_logs
  add constraint kitchen_logs_org_client_request_id_key unique (org_id, client_request_id);

create or replace function ops.insert_cafe_capture_logs(p_rows jsonb)
returns setof ops.kitchen_logs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid := (select shared.current_org_id());
  v_client_request_id uuid;
begin
  if v_org_id is null then
    raise exception 'an authenticated organization is required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'capture rows must be a JSON array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as requested(client_request_id uuid)
    where requested.client_request_id is null
  ) then
    raise exception 'client_request_id is required for each café capture row' using errcode = '22023';
  end if;

  -- Serialize same-key attempts (in stable key order for batches) so a loser takes a fresh
  -- statement snapshot after the winner commits. Without the lock, ON CONFLICT DO NOTHING can see
  -- an invisible concurrent winner while the final SELECT still cannot return it at READ COMMITTED.
  for v_client_request_id in
    select distinct requested.client_request_id
    from jsonb_to_recordset(p_rows) as requested(client_request_id uuid)
    order by requested.client_request_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      v_org_id::text || ':' || v_client_request_id::text, 0));
  end loop;

  -- The visible-row check makes committed replays a true no-op before insert triggers run. The
  -- unique conflict target remains the final guard; keys are org-scoped and NULL legacy values never conflict.
  return query
  with input_rows as materialized (
    select capture.*, requested.ordinality
    from jsonb_array_elements(p_rows) with ordinality as requested(value, ordinality)
    cross join lateral jsonb_to_record(requested.value) as capture(
      client_request_id uuid,
      business_unit_id uuid,
      log_date date,
      branch_id uuid,
      activity text,
      action text,
      destination_branch_id uuid,
      wip_item_id uuid,
      item_unit_id uuid,
      qty_porsi numeric,
      entry_quantity numeric,
      entry_unit_factor numeric,
      entry_unit_name text,
      notes text
    )
  ), inserted as (
    insert into ops.kitchen_logs (
      business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
      wip_item_id, item_unit_id, qty_porsi, entry_quantity, entry_unit_factor, entry_unit_name,
      notes, status, client_request_id
    )
    select
      input.business_unit_id, input.log_date, input.branch_id, input.activity, input.action,
      input.destination_branch_id, input.wip_item_id, input.item_unit_id, input.qty_porsi,
      input.entry_quantity, input.entry_unit_factor, input.entry_unit_name, input.notes,
      case when input.action = 'waste' then 'Draft' else 'Submitted' end,
      input.client_request_id
    from input_rows input
    where not exists (
      select 1 from ops.kitchen_logs existing
      where existing.org_id = v_org_id
        and existing.client_request_id = input.client_request_id
    )
    on conflict (org_id, client_request_id) do nothing
  )
  select existing.*
  from input_rows input
  join ops.kitchen_logs existing
    on existing.org_id = v_org_id
   and existing.client_request_id = input.client_request_id
  order by input.ordinality;
end;
$$;
comment on function ops.insert_cafe_capture_logs(jsonb) is
  'Inserts Café production, transfer and waste rows once per (org_id, client_request_id). Per-key transaction locks serialize concurrent first attempts; replays return the original kitchen log. Uses invoker RLS and server-stamped org/person defaults.';
revoke execute on function ops.insert_cafe_capture_logs(jsonb) from public, anon;
grant execute on function ops.insert_cafe_capture_logs(jsonb) to authenticated;
