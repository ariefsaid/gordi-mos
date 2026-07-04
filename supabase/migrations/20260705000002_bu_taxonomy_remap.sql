-- BU taxonomy re-mapping (ADR-0019 D1 / OD-IA-1). Business Unit = a TEAM in the org chart
-- (Marketing, HR, Finance, Retail Ops, B2B Ops, B2B Sales) — NOT an operating area. The original
-- P1-2 seed rows ("Cafe Ops – General", "Kitchen and Bar", "Roastery", "Sales – CRM",
-- "Finance and People") predate this taxonomy and are Activities/Revenue-streams misfiled as BUs.
--
-- This migration (Gordi org '10000000-0000-0000-0000-000000000001' only — dev-fixture BUs seeded
-- under test orgs by mos._test_seed_role_tree() / mos._test_seed_kitchen() are untouched, they carry
-- their own throwaway rows scoped to their own rolled-back transactions):
--   1. Adds a stable `code` column to shared.business_units (the fix for the exact-name-match
--      fragility flagged in kitchen-logs.ts's own comment — the remap is the moment to do it).
--   2. Adds `archived_at` (soft-retire column, matching the standing archive discipline used by
--      shared.people / mos.tasks / ops.log_entries / mos.user_views — ADR-0001/0004).
--   3. Inserts the 6 team BUs, each with a stable code.
--   4. Re-points every FK currently on a legacy operating-area BU to its correct team BU.
--   5. Retires (archives + renames) the 5 legacy rows — kept, not deleted, because historical FK
--      references to their ids may exist elsewhere (audit trails, ESB provenance) and a hard DELETE
--      would either violate remaining FKs or silently sever that history. Renaming is now SAFE only
--      because step 1 moved every runtime by-name lookup (kitchen-logs.ts, seed.dev-tasks.sql) onto
--      the `code` column — nothing in the app resolves a BU by display name anymore after this slice.
--
-- Ambiguity flagged for the owner: "Finance and People" is mapped to the new Finance BU only.
-- The People half (HR) has no historical FK data to re-point (no seeded role/task ever pointed at
-- Finance-and-People *as* an HR concern — Fitri Finance / Finance Lead is the only occupant, and she
-- stays Finance). The new HR BU is seeded empty; the owner may re-assign specific people/roles to HR
-- later via the admin UI once real HR staffing exists.

----------------------------------------------------------------------
-- 1/2. Schema: stable code + soft-retire column.
----------------------------------------------------------------------
alter table shared.business_units add column code text;
alter table shared.business_units add column archived_at timestamptz;
-- Nullable + partial-unique (not a blanket `unique`): legacy/retired rows keep code NULL forever
-- (no code was ever assigned to them — they are not being renamed into the new taxonomy's code
-- space), while every live team BU must have a unique code. A plain `unique` column would force
-- every legacy row to also carry a placeholder code for no purpose.
create unique index business_units_code_unique on shared.business_units (org_id, code)
  where code is not null;
comment on column shared.business_units.code is
  'Stable, name-independent identifier for FK-free runtime lookups (ADR-0019 D1 remap). NULL on legacy/retired rows — they predate the code space and are never resolved by it.';
comment on column shared.business_units.archived_at is
  'Soft-retire timestamp (ADR-0001/0004 archive discipline). Set on the 5 legacy operating-area BUs by this migration; NULL = live.';

----------------------------------------------------------------------
-- 3–5. Seed the 6 team BUs, re-point every legacy FK, retire the legacy rows. Wrapped in an
-- org-existence guard: migrations run BEFORE supabase/seed.sql (which is what actually inserts the
-- Gordi org row and the 5 legacy BU rows this migration targets), so on a bare `supabase db reset`
-- these statements would hit an empty shared.orgs/business_units. Guarding on the org's existence
-- makes the migration a no-op there (seed.sql's own BU insert below already seeds the legacy rows
-- fresh — nothing to remap yet) while remaining fully effective on any environment where the Gordi
-- org + legacy BUs already exist (a real staging/prod database re-run of this migration).
----------------------------------------------------------------------
do $$
begin
  if exists (select 1 from shared.orgs where id = '10000000-0000-0000-0000-000000000001') then

    -- 3. Insert the 6 team BUs (idempotent — org-scoped, keyed by the new stable code).
    insert into shared.business_units (id, org_id, name, code) values
      ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Marketing',   'marketing'),
      ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'HR',          'hr'),
      ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Finance',     'finance'),
      ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'Retail Ops',  'retail_ops'),
      ('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'B2B Ops',     'b2b_ops'),
      ('20000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', 'B2B Sales',   'b2b_sales')
    on conflict (id) do nothing;

    -- 4. Re-point FKs from the 5 legacy operating-area BUs to the correct team BU.
    --    Mapping (old name -> new team BU):
    --      Cafe Ops – General  -> Retail Ops   (retail_ops)
    --      Kitchen and Bar     -> Retail Ops   (retail_ops)
    --      Roastery            -> B2B Ops      (b2b_ops)
    --      Sales – CRM         -> B2B Sales    (b2b_sales)
    --      Finance and People  -> Finance      (finance)  -- HR ambiguity, see header note above
    update shared.roles
       set business_unit_id = '20000000-0000-0000-0000-000000000014' -- Retail Ops
     where business_unit_id in (
       '20000000-0000-0000-0000-000000000001', -- Cafe Ops – General
       '20000000-0000-0000-0000-000000000002'  -- Kitchen and Bar
     );
    update shared.roles
       set business_unit_id = '20000000-0000-0000-0000-000000000015' -- B2B Ops
     where business_unit_id = '20000000-0000-0000-0000-000000000003'; -- Roastery
    update shared.roles
       set business_unit_id = '20000000-0000-0000-0000-000000000016' -- B2B Sales
     where business_unit_id = '20000000-0000-0000-0000-000000000004'; -- Sales – CRM
    update shared.roles
       set business_unit_id = '20000000-0000-0000-0000-000000000013' -- Finance
     where business_unit_id = '20000000-0000-0000-0000-000000000005'; -- Finance and People

    update mos.tasks
       set business_unit_id = '20000000-0000-0000-0000-000000000014' -- Retail Ops
     where business_unit_id in (
       '20000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000002'
     );
    update mos.tasks
       set business_unit_id = '20000000-0000-0000-0000-000000000015' -- B2B Ops
     where business_unit_id = '20000000-0000-0000-0000-000000000003';
    update mos.tasks
       set business_unit_id = '20000000-0000-0000-0000-000000000016' -- B2B Sales
     where business_unit_id = '20000000-0000-0000-0000-000000000004';
    update mos.tasks
       set business_unit_id = '20000000-0000-0000-0000-000000000013' -- Finance
     where business_unit_id = '20000000-0000-0000-0000-000000000005';

    update ops.log_entries
       set business_unit_id = '20000000-0000-0000-0000-000000000014' -- Retail Ops
     where business_unit_id in (
       '20000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000002'
     );
    update ops.log_entries
       set business_unit_id = '20000000-0000-0000-0000-000000000015' -- B2B Ops
     where business_unit_id = '20000000-0000-0000-0000-000000000003';
    update ops.log_entries
       set business_unit_id = '20000000-0000-0000-0000-000000000016' -- B2B Sales
     where business_unit_id = '20000000-0000-0000-0000-000000000004';
    update ops.log_entries
       set business_unit_id = '20000000-0000-0000-0000-000000000013' -- Finance
     where business_unit_id = '20000000-0000-0000-0000-000000000005';

    -- ops.kitchen_logs: every row belongs to the kitchen Activity (Retail Ops team BU) — the
    -- highest-traffic FK, and the one resolveKitchenBuId() writes going forward via code = 'retail_ops'.
    update ops.kitchen_logs
       set business_unit_id = '20000000-0000-0000-0000-000000000014' -- Retail Ops
     where business_unit_id in (
       '20000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000002'
     );

    -- 5. Retire the 5 legacy operating-area BUs. Verified zero remaining app-table FK references
    --    (the updates above cover every table with a business_unit_id column: shared.roles,
    --    mos.tasks, ops.log_entries, ops.kitchen_logs). Kept (not DELETEd) + renamed with the
    --    standing ' (legacy)' suffix — safe now that step 1's `code` column means nothing resolves
    --    these rows by display name anymore.
    update shared.business_units
       set name = name || ' (legacy)',
           archived_at = now()
     where id in (
       '20000000-0000-0000-0000-000000000001', -- Cafe Ops – General
       '20000000-0000-0000-0000-000000000002', -- Kitchen and Bar
       '20000000-0000-0000-0000-000000000003', -- Roastery
       '20000000-0000-0000-0000-000000000004', -- Sales – CRM
       '20000000-0000-0000-0000-000000000005'  -- Finance and People
     )
     and archived_at is null;

  end if;
end $$;

-- DOWN (full reverse mapping):
--   alter table shared.business_units drop column code;
--   alter table shared.business_units drop column archived_at;
--   drop index if exists shared.business_units_code_unique;
--   update shared.roles set business_unit_id = '20000000-0000-0000-0000-000000000002' -- Kitchen and Bar
--     where business_unit_id = '20000000-0000-0000-0000-000000000014'; -- (best-effort: Retail Ops rows
--     -- that originated from Cafe Ops – General cannot be distinguished from Kitchen-and-Bar-origin
--     -- rows post-merge; reversing re-targets all of them at Kitchen and Bar as the representative.)
--   update shared.roles set business_unit_id = '20000000-0000-0000-0000-000000000003' -- Roastery
--     where business_unit_id = '20000000-0000-0000-0000-000000000015'; -- B2B Ops
--   update shared.roles set business_unit_id = '20000000-0000-0000-0000-000000000004' -- Sales – CRM
--     where business_unit_id = '20000000-0000-0000-0000-000000000016'; -- B2B Sales
--   update shared.roles set business_unit_id = '20000000-0000-0000-0000-000000000005' -- Finance and People
--     where business_unit_id = '20000000-0000-0000-0000-000000000013'; -- Finance
--   -- (repeat the 4 updates above for mos.tasks, ops.log_entries, ops.kitchen_logs)
--   update shared.business_units set name = trim(trailing ' (legacy)' from name), archived_at = null
--     where id in (
--       '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
--       '20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004',
--       '20000000-0000-0000-0000-000000000005'
--     );
--   delete from shared.business_units where id in (
--     '20000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000012',
--     '20000000-0000-0000-0000-000000000013','20000000-0000-0000-0000-000000000014',
--     '20000000-0000-0000-0000-000000000015','20000000-0000-0000-0000-000000000016'
--   );
