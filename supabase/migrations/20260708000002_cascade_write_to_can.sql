-- Work spine v1 (ADR-0020 D4, FR-331): migrate mos.objectives + mos.work_lines WRITE
-- policies from has_access_role(...) to shared.can(...). SELECT stays org-scoped (unchanged).
-- Behavior-preserving for the seed (admin->both, ops_lead->workline.manage). DELETE stays
-- un-granted (FR-334/NFR-305). The org_id = current_org_id() tenancy seam is retained on all.

-- ─── mos.objectives: admin-only write -> can('objective.manage') ────────────────
drop policy if exists objectives_insert_admin on mos.objectives;
drop policy if exists objectives_update_admin on mos.objectives;

create policy objectives_insert_can_manage on mos.objectives
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('objective.manage'));

create policy objectives_update_can_manage on mos.objectives
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id() and shared.can('objective.manage'));

-- ─── mos.work_lines: admin|ops_lead write -> can('workline.manage') ─────────────
drop policy if exists work_lines_insert_admin_or_ops_lead on mos.work_lines;
drop policy if exists work_lines_update_admin_or_ops_lead on mos.work_lines;

create policy work_lines_insert_can_manage on mos.work_lines
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('workline.manage'));

create policy work_lines_update_can_manage on mos.work_lines
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id() and shared.can('workline.manage'));

-- DOWN (restores the pre-can() policies verbatim — …0626000003 for objectives,
--       …0624000001 for work_lines):
-- drop policy if exists objectives_insert_can_manage on mos.objectives;
-- drop policy if exists objectives_update_can_manage on mos.objectives;
-- create policy objectives_insert_admin on mos.objectives
--   for insert to authenticated
--   with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
-- create policy objectives_update_admin on mos.objectives
--   for update to authenticated
--   using  (org_id = shared.current_org_id())
--   with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
-- drop policy if exists work_lines_insert_can_manage on mos.work_lines;
-- drop policy if exists work_lines_update_can_manage on mos.work_lines;
-- create policy work_lines_insert_admin_or_ops_lead on mos.work_lines
--   for insert to authenticated
--   with check (org_id = shared.current_org_id()
--     and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
-- create policy work_lines_update_admin_or_ops_lead on mos.work_lines
--   for update to authenticated
--   using  (org_id = shared.current_org_id())
--   with check (org_id = shared.current_org_id()
--     and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
