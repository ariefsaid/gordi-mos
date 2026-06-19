-- Widen the ops.log_entries.origin CHECK to admit 'kitchen' (ADR-0012 token, FR-095). Reversible:
-- the legacy 'kitchen_app' is retained for back-compat. A partial unique index makes the summary
-- mirror idempotent per batch (FR-092): at most one kitchen-origin row per batch_id.
alter table ops.log_entries drop constraint if exists log_entries_origin_check;
alter table ops.log_entries add constraint log_entries_origin_check
  check (origin in ('manual','kitchen_app','roastery_app','kitchen'));

-- NOTE: ops.log_entries.detail is TEXT (not jsonb), and the RPC writes it as jsonb_build_object()::text.
-- The idempotency-per-batch index therefore casts detail::jsonb before extracting batch_id; the RPC's
-- ON CONFLICT target must use the IDENTICAL expression (detail::jsonb ->> 'batch_id') to match it.
create unique index if not exists log_entries_kitchen_batch_uidx
  on ops.log_entries (org_id, ((detail::jsonb)->>'batch_id'))
  where origin = 'kitchen';

-- DOWN: drop index if exists ops.log_entries_kitchen_batch_uidx;
--       alter table ops.log_entries drop constraint if exists log_entries_origin_check;
--       alter table ops.log_entries add constraint log_entries_origin_check
--         check (origin in ('manual','kitchen_app','roastery_app'));
