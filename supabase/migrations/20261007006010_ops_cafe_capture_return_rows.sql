-- Return newly inserted captures as well as idempotent replays from the capture RPC.
--
-- DOWN (manual): restore the prior ops.insert_cafe_capture_logs(jsonb) body from
-- 20261007006000_ops_cafe_capture_idempotency.sql. This changes only the function body;
-- schema grants, table constraints, and RLS policies are unchanged.

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
  -- an invisible concurrent winner while a later SELECT still cannot return it at READ COMMITTED.
  for v_client_request_id in
    select distinct requested.client_request_id
    from jsonb_to_recordset(p_rows) as requested(client_request_id uuid)
    order by requested.client_request_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      v_org_id::text || ':' || v_client_request_id::text, 0));
  end loop;

  -- Keep the INSERT and readback in separate SQL commands. A data-modifying CTE and its sibling
  -- SELECT share one snapshot, so selecting the base table there misses rows inserted by the CTE.
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
  )
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
  on conflict (org_id, client_request_id) do nothing;

  return query
  with input_rows as materialized (
    select capture.client_request_id, requested.ordinality
    from jsonb_array_elements(p_rows) with ordinality as requested(value, ordinality)
    cross join lateral jsonb_to_record(requested.value) as capture(client_request_id uuid)
  )
  select existing.*
  from input_rows input
  join ops.kitchen_logs existing
    on existing.org_id = v_org_id
   and existing.client_request_id = input.client_request_id
  order by input.ordinality;
end;
$$;
