-- OD-V4-1 (owner-ratified 2026-07-27, docs/v4-inheritance.md INC-1): Objectives are visible to
-- everyone and writeable at lead level, not admin-only.
--
-- READ: no change needed. `objectives_select_org` (…0624000001_mos_cascade_lookups.sql) already
-- grants SELECT to every authenticated org member with only the org_id = current_org_id() tenancy
-- check — no capability/role gate exists on read today. The defect was client-side only:
-- mos-app/src/lib/capabilities.ts gated the rail entry + route on `objective.manage`, which only
-- `admin` held, so the ops_lead-holding Function-owner/BU-head persona (docs/jtbd.md) could not
-- reach a screen the RLS layer already let them read.
--
-- WRITE: mos.objectives INSERT/UPDATE already run through shared.can('objective.manage')
-- (…0708000002_cascade_write_to_can.sql). Extending write to "lead level" is therefore a
-- capability-grant row, not an RLS policy change — grant ops_lead the same capability admin holds.
-- Mirrors the …0719000001_od71_member_process_start.sql pattern (registration-only, no RLS diff).
--
-- TENANCY: unaffected. Every mos.objectives policy still requires org_id = shared.current_org_id();
-- this migration adds a capability grant only and touches no policy.
--
-- AUDIT TRAIL: OD-V4-1 also requires objectives to carry a history of changes over time. No such
-- mechanism exists yet (no history/audit table, no trigger, nothing in mos.objectives beyond
-- created_at/updated_at). That is intentionally OUT OF SCOPE here — it needs its own spec + slice
-- (e.g. a mos.objective_history table + AFTER UPDATE trigger, or a generic audit-log primitive if
-- other entities will need the same shape). Do not infer it from this migration.

insert into shared.role_capabilities (role, capability, scope) values
  ('ops_lead', 'objective.manage', 'org')
on conflict (role, capability) do nothing;

-- DOWN (reversible):
-- delete from shared.role_capabilities where role = 'ops_lead' and capability = 'objective.manage';
