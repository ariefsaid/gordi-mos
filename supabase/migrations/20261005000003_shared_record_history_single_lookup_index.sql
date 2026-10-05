-- One index serves the per-record history lookup and its keyset order (#1153).
-- record_history_record_keyset_idx covers the older index's columns and adds id
-- for deterministic pagination, so retaining both adds a redundant history write.
--
-- DOWN (manual):
--   create index record_history_record_idx on shared.record_history
--     (org_id, schema_name, table_name, record_key, occurred_at desc);

drop index shared.record_history_record_idx;
