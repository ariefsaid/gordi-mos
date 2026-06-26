-- ESB-outbox worker enablement — grant `service_role` the table privileges it needs.
--
-- WHY: migration 20260620000006 (integrations.esb_push) states in-comment that "the
-- worker's status flips run as service_role/postgres, bypassing RLS (AC-007)", but it
-- only granted SELECT to `authenticated` and NOTHING to `service_role`. service_role
-- BYPASSES RLS, but it still needs table-level GRANTs on the custom integrations/ops
-- schemas — without them the worker's PostgREST calls fail with 42501 permission denied.
-- This migration closes that gap so the ris-dev kitchen worker (which holds service_role)
-- can drain integrations.esb_push and write the kitchen_logs posting mirror (ADR-0012).
--
-- NOTE (not a DB change): PostgREST must also EXPOSE the `integrations` schema. It is
-- already present in supabase/config.toml [api].schemas; a running stack that predates
-- that edit must be restarted (`supabase stop && supabase start`) to pick it up.
--
-- Privileges are the minimum the worker uses:
--   integrations.esb_push : SELECT (read pending) + UPDATE (status/retry/doc/posted_at).
--                           NO INSERT (the approve RPC enqueues via SECURITY DEFINER),
--                           NO DELETE (soft-only posture — mirrors the app-tier grant).
--   ops.kitchen_logs      : SELECT + UPDATE (stamp posted_to_esb/esb_doc_num/posted_at by batch_id).
--   ops.wip_items         : SELECT (resolve the WIP item name for assembly `notes`, FR-071).

grant usage on schema integrations to service_role;
grant usage on schema ops to service_role;

grant select, update on integrations.esb_push to service_role;
grant select, update on ops.kitchen_logs   to service_role;
grant select          on ops.wip_items     to service_role;

-- DOWN
-- revoke select, update on integrations.esb_push from service_role;
-- revoke select, update on ops.kitchen_logs   from service_role;
-- revoke select          on ops.wip_items     from service_role;
-- revoke usage on schema integrations from service_role;
-- (ops schema USAGE intentionally left — other grants depend on it.)
