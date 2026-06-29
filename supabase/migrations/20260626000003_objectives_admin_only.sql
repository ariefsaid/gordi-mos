-- OD-C-2 (2026-06-26): tighten mos.objectives write to ADMIN ONLY.
-- The cascade-lookups slice (…0624000001) granted objectives write to admin OR ops_lead.
-- The catalog-management decision makes Objectives an admin-only catalog; Projects/Processes
-- (mos.work_lines) stay admin OR ops_lead (UNCHANGED here). SELECT stays org-readable (pickers).
-- No new DELETE grant — removal remains the soft archived_at toggle (NFR-002).

drop policy if exists objectives_insert_admin_or_ops_lead on mos.objectives;
drop policy if exists objectives_update_admin_or_ops_lead on mos.objectives;

-- INSERT: admin only
create policy objectives_insert_admin on mos.objectives
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.has_access_role('admin')
  );

-- UPDATE: admin only (covers rename + archive/unarchive)
create policy objectives_update_admin on mos.objectives
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (
    org_id = shared.current_org_id()
    and shared.has_access_role('admin')
  );

-- DOWN:
-- drop policy if exists objectives_insert_admin on mos.objectives;
-- drop policy if exists objectives_update_admin on mos.objectives;
-- create policy objectives_insert_admin_or_ops_lead on mos.objectives
--   for insert to authenticated
--   with check (org_id = shared.current_org_id()
--     and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
-- create policy objectives_update_admin_or_ops_lead on mos.objectives
--   for update to authenticated
--   using  (org_id = shared.current_org_id())
--   with check (org_id = shared.current_org_id()
--     and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
