-- ops: wip_items + kitchen_plans + item_units
-- Policies renamed so the name states the full admitted SET (ops_lead + admin), not one member
-- of it (#214). Behavior unchanged — renames only. Convention: suffix = the admitted set,
-- `_or_`-joined, in the comments' existing ops_lead/admin order. Split per domain so the
-- migration-set guard's one-domain-per-file rule holds (baseline-migration-set.test.ts).
--
-- DOWN (reverse renames):
--   alter policy wip_items_insert_ops_lead_or_admin     on ops.wip_items     rename to wip_items_insert_ops;
--   alter policy wip_items_update_ops_lead_or_admin     on ops.wip_items     rename to wip_items_update_ops;
--   alter policy kitchen_plans_insert_ops_lead_or_admin on ops.kitchen_plans rename to kitchen_plans_insert_ops;
--   alter policy kitchen_plans_update_ops_lead_or_admin on ops.kitchen_plans rename to kitchen_plans_update_ops;
--   alter policy item_units_insert_ops_lead_or_admin    on ops.item_units    rename to item_units_insert_ops;
--   alter policy item_units_update_ops_lead_or_admin    on ops.item_units    rename to item_units_update_ops;

alter policy wip_items_insert_ops     on ops.wip_items     rename to wip_items_insert_ops_lead_or_admin;
alter policy wip_items_update_ops     on ops.wip_items     rename to wip_items_update_ops_lead_or_admin;
alter policy kitchen_plans_insert_ops on ops.kitchen_plans rename to kitchen_plans_insert_ops_lead_or_admin;
alter policy kitchen_plans_update_ops on ops.kitchen_plans rename to kitchen_plans_update_ops_lead_or_admin;
alter policy item_units_insert_ops    on ops.item_units    rename to item_units_insert_ops_lead_or_admin;
alter policy item_units_update_ops    on ops.item_units    rename to item_units_update_ops_lead_or_admin;
