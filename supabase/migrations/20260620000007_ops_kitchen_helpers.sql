-- Start-of-day available stock for (wip_item_id, as_of_date): the net of Approved logs strictly
-- before as_of_date (FR-023 availability basis; FR-061 start-of-day cut). SECURITY INVOKER STABLE.
create or replace function ops.stock_available_for_date(p_wip_item_id uuid, p_as_of date)
returns numeric(12,2)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(
    case
      when action_type = 'Production'                 then qty_porsi
      when action_type in ('Transfer to Bungur','Transfer to Radiant') then -qty_porsi
    end
  ), 0)::numeric(12,2)
  from ops.kitchen_logs
  where wip_item_id = p_wip_item_id
    and status = 'Approved'
    and log_date < p_as_of
$$;
comment on function ops.stock_available_for_date(uuid, date) is
  'Start-of-day available stock (FR-023/061). Net of Approved logs strictly before the date. SECURITY INVOKER.';

-- The ESB target_env the RPC stamps at enqueue (KQ-6, FR-080/081). Default 'dry_run'; a pre-flip
-- deployment sets the 'goo' GUC (set [local] app.esb_target_env = 'goo'); 'gkid' is reached ONLY at
-- the owner-gated flip (FR-082). MECHANISM IS A GUC, not a JWT claim (M1) — current_setting reads the
-- GUC, never a key inside request.jwt.claims.
create or replace function integrations.current_esb_target_env()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.esb_target_env', true), ''),
    'dry_run'
  )
$$;
comment on function integrations.current_esb_target_env() is
  'ESB target env stamped at enqueue (FR-080/081). Reads GUC app.esb_target_env (NOT a JWT claim). Default dry_run; deployment sets goo; gkid only at the flip. SECURITY INVOKER.';

-- DOWN: drop function integrations.current_esb_target_env();
--       drop function ops.stock_available_for_date(uuid, date);
