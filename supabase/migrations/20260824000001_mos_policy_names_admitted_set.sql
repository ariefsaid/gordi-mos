-- mos: process cadences + process task defs
-- Policies renamed so the name states the full admitted SET (ops_lead + admin), not one member
-- of it (#214). Behavior unchanged — renames only. Convention: suffix = the admitted set,
-- `_or_`-joined, in the comments' existing ops_lead/admin order. Split per domain so the
-- migration-set guard's one-domain-per-file rule holds (baseline-migration-set.test.ts).
--
-- DOWN (reverse renames):
--   alter policy process_cadences_insert_ops_lead_or_admin  on mos.process_cadences  rename to process_cadences_insert_ops;
--   alter policy process_cadences_update_ops_lead_or_admin  on mos.process_cadences  rename to process_cadences_update_ops;
--   alter policy process_task_defs_insert_ops_lead_or_admin on mos.process_task_defs rename to process_task_defs_insert_ops;
--   alter policy process_task_defs_update_ops_lead_or_admin on mos.process_task_defs rename to process_task_defs_update_ops;

alter policy process_cadences_insert_ops  on mos.process_cadences  rename to process_cadences_insert_ops_lead_or_admin;
alter policy process_cadences_update_ops  on mos.process_cadences  rename to process_cadences_update_ops_lead_or_admin;
alter policy process_task_defs_insert_ops on mos.process_task_defs rename to process_task_defs_insert_ops_lead_or_admin;
alter policy process_task_defs_update_ops on mos.process_task_defs rename to process_task_defs_update_ops_lead_or_admin;
