-- Rollback for 20261007008000_ops_esb_item_fields_readonly.sql (OD-2026-10-06-ESB-ITEMS). Gives app
-- sessions back UPDATE of the catalog-refresh columns of ops.wip_items, restoring the column grants
-- from 20261007005600_ops_esb_only_items.sql.
begin;
grant update (name, category, flag_active, kind, erp_category_type_name, has_active_bom_output)
  on ops.wip_items to authenticated;
commit;
