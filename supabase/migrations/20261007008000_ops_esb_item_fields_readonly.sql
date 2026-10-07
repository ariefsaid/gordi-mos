-- OD-2026-10-06-ESB-ITEMS — an ESB item's descriptive columns belong to the catalog refresh
-- (ops.refresh_cafe_item_references), which rewrites name, category, flag_active, kind,
-- erp_category_type_name and has_active_bom_output on every run. App sessions lose UPDATE of those
-- columns, so a MOS edit cannot be silently overwritten by the next refresh. The refresh runs as
-- the database owner and keeps writing them.
--
-- MOS-owned item settings (per-stream name, kind, active status and units) live in
-- ops.cafe_item_settings and are untouched. App sessions keep UPDATE of id, org_id, created_at and
-- updated_at only, which the refresh does not write.
--
-- Rollback: supabase/rollbacks/20261007008000_ops_esb_item_fields_readonly.sql.

revoke update (name, category, flag_active, kind, erp_category_type_name, has_active_bom_output)
  on ops.wip_items from authenticated;
