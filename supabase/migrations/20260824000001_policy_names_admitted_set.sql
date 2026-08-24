-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Policy names that state the set they admit (#214).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES. Eleven policies were suffixed `_ops` while their predicate admits ops_lead OR
-- admin. The name read as the whole gate; it was half of it. A name that lies is worse than a
-- comment that lies, because the name is what people grep for when they ask who can do a thing —
-- the squash already caught one policy whose name had survived two widenings while admitting a set
-- two roles larger than it claimed.
--
-- THE CONVENTION. Suffix = the full admitted set, members joined with `_or_`, in the order the
-- comments already use (`ops_lead/admin`): `_ops_lead_or_admin`. One convention across every
-- instance of the class — the ticket names the five baseline surfaces (process cadences, process
-- task definitions, WIP items, kitchen plans, the outbox); ops.item_units (20260807000001) copied
-- the same defect from wip_items and is renamed with them rather than left as a case-by-case
-- exception. If the admitted set ever widens, the name must widen in the same migration — the
-- pgTAP suites pin the set in both directions, so a silent widening is loud there first.
--
-- RENAMES ONLY. No predicate, grant, or comment changes: behavior is proven unchanged by the
-- role/contract suites passing before and after with no assertion edits beyond the names.
-- `comment on policy` text attaches to the policy object, so existing comments survive the rename.
--
-- DOWN (fully reversible, symmetric):
--   alter policy process_cadences_insert_ops_lead_or_admin  on mos.process_cadences      rename to process_cadences_insert_ops;
--   alter policy process_cadences_update_ops_lead_or_admin  on mos.process_cadences      rename to process_cadences_update_ops;
--   alter policy process_task_defs_insert_ops_lead_or_admin on mos.process_task_defs     rename to process_task_defs_insert_ops;
--   alter policy process_task_defs_update_ops_lead_or_admin on mos.process_task_defs     rename to process_task_defs_update_ops;
--   alter policy wip_items_insert_ops_lead_or_admin         on ops.wip_items             rename to wip_items_insert_ops;
--   alter policy wip_items_update_ops_lead_or_admin         on ops.wip_items             rename to wip_items_update_ops;
--   alter policy kitchen_plans_insert_ops_lead_or_admin     on ops.kitchen_plans         rename to kitchen_plans_insert_ops;
--   alter policy kitchen_plans_update_ops_lead_or_admin     on ops.kitchen_plans         rename to kitchen_plans_update_ops;
--   alter policy item_units_insert_ops_lead_or_admin        on ops.item_units            rename to item_units_insert_ops;
--   alter policy item_units_update_ops_lead_or_admin        on ops.item_units            rename to item_units_update_ops;
--   alter policy esb_push_select_ops_lead_or_admin          on integrations.esb_push     rename to esb_push_select_ops;

-- mos: process definitions (admin/ops_lead authoring, mirrors the catalogs)
alter policy process_cadences_insert_ops  on mos.process_cadences  rename to process_cadences_insert_ops_lead_or_admin;
alter policy process_cadences_update_ops  on mos.process_cadences  rename to process_cadences_update_ops_lead_or_admin;
alter policy process_task_defs_insert_ops on mos.process_task_defs rename to process_task_defs_insert_ops_lead_or_admin;
alter policy process_task_defs_update_ops on mos.process_task_defs rename to process_task_defs_update_ops_lead_or_admin;

-- ops: master data + the plan (ops_lead/admin write)
alter policy wip_items_insert_ops     on ops.wip_items     rename to wip_items_insert_ops_lead_or_admin;
alter policy wip_items_update_ops     on ops.wip_items     rename to wip_items_update_ops_lead_or_admin;
alter policy kitchen_plans_insert_ops on ops.kitchen_plans rename to kitchen_plans_insert_ops_lead_or_admin;
alter policy kitchen_plans_update_ops on ops.kitchen_plans rename to kitchen_plans_update_ops_lead_or_admin;
alter policy item_units_insert_ops    on ops.item_units    rename to item_units_insert_ops_lead_or_admin;
alter policy item_units_update_ops    on ops.item_units    rename to item_units_update_ops_lead_or_admin;

-- integrations: the outbox read (ops_lead/admin read their org's rows; nobody else)
alter policy esb_push_select_ops on integrations.esb_push rename to esb_push_select_ops_lead_or_admin;
