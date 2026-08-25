-- integrations: esb_push select
-- Policies renamed so the name states the full admitted SET (ops_lead + admin), not one member
-- of it (#214). Behavior unchanged — renames only. Convention: suffix = the admitted set,
-- `_or_`-joined, in the comments' existing ops_lead/admin order. Split per domain so the
-- migration-set guard's one-domain-per-file rule holds (baseline-migration-set.test.ts).
--
-- DOWN (reverse renames):
--   alter policy esb_push_select_ops_lead_or_admin on integrations.esb_push rename to esb_push_select_ops;

alter policy esb_push_select_ops on integrations.esb_push rename to esb_push_select_ops_lead_or_admin;
