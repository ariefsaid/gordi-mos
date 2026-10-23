-- DOWN for 20261022060000: remove the Staff module switch. Deploy the pre-feature app first.
-- Settings rows reference the catalog, so they go first; audit rows are append-only snapshots and stay.
begin;
delete from mos.person_module_settings where module_id = 'staff';
delete from mos.org_module_settings where module_id = 'staff';
delete from mos.module_catalog where id = 'staff';
commit;
