-- P1-2 dev seed (committed, PUBLIC repo). Structure (OD-P1-5) + fictional dev people (OD-P1-6).
-- Real names/emails ONLY via the gitignored deploy seed (supabase/README.md). NEVER add real PII here.
-- Fixed UUIDs so tests/fixtures can reference them deterministically.

-- The single org (OD-P1-1).
insert into shared.orgs (id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', 'Gordi', 'gordi')
on conflict (id) do nothing;

-- Plan certified-metric registry rows for the dev Gordi org. The migration seeds any orgs that exist
-- at migration-time; seed.sql creates Gordi after migrations on a fresh reset, so repeat the registry
-- seed here (still seed/migration-owned, no runtime CRUD UI).
insert into mos.certified_metrics (key, org_id, name, meaning, unit, grain, certified, certified_at) values
  (
    'cogs.budgeted', '10000000-0000-0000-0000-000000000001',
    'Budgeted COGS', 'A menu item''s BOM (recipe qty x materials) costed at the linked ingredient cost lines (last_hpp) — the certified budgeted COGS pricing/budgeting consume (ADR-0022 D1).',
    'IDR', 'menu item', true, now()
  ),
  (
    'margin.gross_pct', '10000000-0000-0000-0000-000000000001',
    'Gross margin %', 'Projected gross margin at a candidate price vs the linked certified budgeted COGS — (price - cogs) / price. Read-only pre-flight; MOS never sets the price (ADR-0022 D5).',
    'percent', 'menu item x price', true, now()
  )
on conflict (org_id, key) do nothing;

-- The 6 team business units (ADR-0019 D1 / OD-IA-1 — BU = team in the org chart). Superseded the
-- earlier 5 operating-area rows (Cafe Ops – General / Kitchen and Bar / Roastery / Sales – CRM /
-- Finance and People) — those are re-seeded below already retired (renamed + archived_at set) so a
-- fresh `supabase db reset` lands in the same post-remap state the 20260705000002 migration produces
-- on a pre-existing database. `code` is the stable, name-independent identifier app code resolves by
-- (e.g. kitchen-logs.ts resolveKitchenBuId -> code = 'retail_ops').
insert into shared.business_units (id, org_id, name, code) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Marketing',   'marketing'),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'HR',          'hr'),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Finance',     'finance'),
  ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'Retail Ops',  'retail_ops'),
  ('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'B2B Ops',     'b2b_ops'),
  ('20000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', 'B2B Sales',   'b2b_sales')
on conflict (id) do nothing;

-- Legacy operating-area BUs, seeded already-retired (archived_at set, ' (legacy)' suffix, code
-- NULL) — kept for historical id stability, not for any live lookup. See the 20260705000002
-- migration header for the full old->new mapping + retirement rationale.
insert into shared.business_units (id, org_id, name, code, archived_at) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cafe Ops – General (legacy)', null, now()),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Kitchen and Bar (legacy)',    null, now()),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Roastery (legacy)',          null, now()),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Sales – CRM (legacy)',       null, now()),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Finance and People (legacy)', null, now())
on conflict (id) do nothing;

-- Placeholder role tree: one org-lead role (no reports_to) + one lead role per unit reporting to it.
-- business_unit_id points at the TEAM BU each lead now belongs to post-remap (Cafe Ops Lead + Kitchen
-- Lead -> Retail Ops; Roastery Lead -> B2B Ops; Sales Lead -> B2B Sales; Finance Lead -> Finance).
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('30000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', null,                                   'Managing Director', null),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014', 'Cafe Ops Lead',     '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014', 'Kitchen Lead',      '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000015', 'Roastery Lead',     '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000016', 'Sales Lead',        '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000013', 'Finance Lead',      '30000000-0000-0000-0000-000000000000')
on conflict (id) do nothing;

-- Fictional canon dev people (OD-P1-6). No auth link (user_id NULL) — provisioned in Phase 1.3.
insert into shared.people (id, org_id, full_name, email) values
  ('40000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'Dewi Director',  'dewi.dev@example.test'),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cahya Cafe',     'cahya.dev@example.test'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Krishna Kitchen','krishna.dev@example.test'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Rama Roastery',  'rama.dev@example.test'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Sari Sales',     'sari.dev@example.test'),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Fitri Finance',  'fitri.dev@example.test')
on conflict (id) do nothing;

-- Role assignments: director holds the MD role; each lead holds their unit lead role.
-- Cahya is dual-hatted (Cafe Ops + Sales) to exercise the union manager chain in dev.
insert into shared.person_roles (org_id, person_id, role_id) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000000'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005')
on conflict (person_id, role_id) do nothing;

-- Access-role assignments (ADR-0011 D5 / OD-P4-4). Owner stand-in (Dewi) -> admin; Fitri Finance ->
-- finance (her demo persona label, reporting.* RLS); everyone else -> member (the default). Real
-- roster admin/ops_lead/finance lands via the gitignored deploy seed (OD-P1-6) at the provisioning
-- slice. granted_by is NULL for these seed rows (no granting person: under the seed/service-role
-- connection current_person_id() is NULL). All seven rows use the Gordi org.
insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 'finance')
on conflict (person_id, access_role) do nothing;

-- Kitchen WIP items — the REAL Gordi roster (the 32 dishes from the old kitchen app's
-- scripts/seed_wip_items.py: 16 CREATE + 16 REUSE). Names are parity; category/ESB IDs are
-- populated by the ESB push flow later (none in the Teable source), so left null here. Gordi org.
insert into ops.wip_items (id, org_id, name, category) values
  ('a1100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Nasi Putih', 'Rice/Staple'),
  ('a1100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Risoles Beef Mayo', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Bakwan Sayur', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Oseng Bakso', 'Meat'),
  ('a1100000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Lontong Sayur', 'Rice/Staple'),
  ('a1100000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Ayam Gulai', 'Chicken'),
  ('a1100000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Pisang Goreng', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'Singkong Goreng', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'Tongkol Sambal Matah', 'Seafood'),
  ('a1100000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Kaya Toast', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'Cumi Cabe Ijo', 'Seafood'),
  ('a1100000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'Ayam Garang Asem', 'Chicken'),
  ('a1100000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', 'Bakwan Jagung', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000001', 'Sosis Solo', 'Meat'),
  ('a1100000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000001', 'Tape Goreng', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'Arem Arem', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Tumis Buncis', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'Orek Tempe', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Tumis Daun Singkong', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'Semur Telur', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'Ayam Suwir', 'Chicken'),
  ('a1100000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', 'Ayam Woku', 'Chicken'),
  ('a1100000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000001', 'Kentang Balado', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', 'Sayur Lodeh', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000001', 'Sambal Merah', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-00000000001a', '10000000-0000-0000-0000-000000000001', 'Teri Kacang', 'Seafood'),
  ('a1100000-0000-0000-0000-00000000001b', '10000000-0000-0000-0000-000000000001', 'Semur Tahu', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-00000000001c', '10000000-0000-0000-0000-000000000001', 'Kentang Mustofa', 'Snack/Sweet'),
  ('a1100000-0000-0000-0000-00000000001d', '10000000-0000-0000-0000-000000000001', 'Sayur Asem', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-00000000001e', '10000000-0000-0000-0000-000000000001', 'Terong Balado', 'Veg/Tempe/Tofu'),
  ('a1100000-0000-0000-0000-00000000001f', '10000000-0000-0000-0000-000000000001', 'Ayam Goreng Lengkuas', 'Chicken'),
  ('a1100000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001', 'Balado Cumi Asin', 'Seafood')
on conflict (id) do nothing;

-- A sample plan for "today" so the Plan editor / pesanan horizon + the Log variance gate have
-- context in local dev (plan_by = Krishna, the Kitchen Lead). Stock auto-computes from approved logs.
insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi, plan_by) values
  ('10000000-0000-0000-0000-000000000001', current_date, 'a1100000-0000-0000-0000-000000000001', 'Production', 50, '40000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', current_date, 'a1100000-0000-0000-0000-000000000002', 'Production', 30, '40000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', current_date, 'a1100000-0000-0000-0000-000000000006', 'Production', 25, '40000000-0000-0000-0000-000000000002')
on conflict (org_id, log_date, wip_item_id, action_type) do nothing;

-- Plan destination COGS read-models (ADR-0022 D2/D6, ADR-0010) — representative dev rows so the
-- Budget + Pricing surfaces are real + testable in the running app. The future warehouse->Supabase
-- snapshot job UPSERTS these tables (drop-in: the DAL + components are unchanged). Finance/Procurement
-- own the numbers; consumers LINK by esb code, never copy (anchor A5). One cost line (BUTTER-GK) is
-- seeded STALE (as_of 90 days ago) to exercise the fail-loud freshness path in dev.

-- Ingredient cost lines (basis = ESB last_hpp).
insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of, loaded_at) values
  ('10000000-0000-0000-0000-000000000001', 'ING-MILK-FRESH',   'Fresh Milk',      18000.00, 'L',     now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'ING-ESPRESSO-BEAN','Espresso Beans', 320000.00, 'kg',    now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'ING-BUTTER-GK',    'Butter',         95000.00, 'kg',    now() - interval '90 days', now() - interval '90 days'),
  ('10000000-0000-0000-0000-000000000001', 'ING-FLOUR-AP',     'Flour AP',        14000.00, 'kg',    now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'ING-SUGAR-WHITE',  'White Sugar',     16000.00, 'kg',    now() - interval '5 days',  now() - interval '5 days')
on conflict (org_id, ingredient_esb_code) do update
  set name = excluded.name, unit_cost = excluded.unit_cost, unit = excluded.unit,
      as_of = excluded.as_of, loaded_at = excluded.loaded_at;

-- BOM / recipe lines (ESB-owned, read-only in MOS — ADR-0022 D3). Two menu items:
--   MENU-CAPPUC (Cappuccino): milk + espresso  — fresh basis, complete.
--   MENU-CROISS (Butter Croissant): butter + flour + sugar — STALE basis (butter), complete-but-stale.
--   MENU-MUFFIN (Blueberry Muffin): flour + sugar + (no milk line yet) — INCOMPLETE (missing cost line).
insert into reporting.bom_lines (org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty, qty_unit, as_of, loaded_at) values
  ('10000000-0000-0000-0000-000000000001', 'MENU-CAPPUC', 'ING-MILK-FRESH',    0.18, 'L',  now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-CAPPUC', 'ING-ESPRESSO-BEAN', 0.018,'kg', now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-CROISS', 'ING-BUTTER-GK',     0.04, 'kg', now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-CROISS', 'ING-FLOUR-AP',      0.06, 'kg', now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-CROISS', 'ING-SUGAR-WHITE',   0.01, 'kg', now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-MUFFIN', 'ING-FLOUR-AP',      0.08, 'kg', now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-MUFFIN', 'ING-SUGAR-WHITE',   0.03, 'kg', now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-MUFFIN', 'ING-MILK-FRESH-UNS',0.05, 'L',  now() - interval '5 days',  now() - interval '5 days')
on conflict (org_id, menu_item_esb_code, ingredient_esb_code) do update
  set recipe_qty = excluded.recipe_qty, qty_unit = excluded.qty_unit, as_of = excluded.as_of,
      loaded_at = excluded.loaded_at;

-- ─── Signal Team substrate (Step 4, ADR-0050 D1) ─────────────────────────────────────────────
-- Fresh-reset parity for the sites/teams the 20260716000001 migration seeds on a pre-existing DB.
-- Migrations run BEFORE this seed, so on a bare `supabase db reset` the migration's own do-block is a
-- no-op (shared.orgs empty at migration-time); this block seeds the substrate for the Gordi org that
-- seed.sql creates above. Idempotent (resolves BU by stable `code`; on conflict do nothing).
do $$
declare o record;
begin
  for o in select id as org_id from shared.orgs loop
    insert into shared.sites (id, org_id, name, code) values
      (gen_random_uuid(), o.org_id, 'Gordi HQ', 'gordi_hq'),
      (gen_random_uuid(), o.org_id, 'Radiant',  'radiant'),
      (gen_random_uuid(), o.org_id, 'Roastery', 'roastery')
    on conflict (org_id, code) do nothing;
    insert into shared.teams (id, org_id, business_unit_id, site_id, name, code)
    select gen_random_uuid(), o.org_id, bu.id,
           (select s.id from shared.sites s where s.org_id = o.org_id and s.code = t.site_code),
           t.name, t.code
    from (values
      ('retail_ops','HQ Operations','hq_operations','gordi_hq'),
      ('retail_ops','Radiant Operations','radiant_operations','radiant'),
      ('retail_ops','Ecommerce Team','ecommerce_team',null),
      ('b2b_ops','Roastery Team','roastery_team','roastery'),
      ('b2b_sales','B2B Sales Team','b2b_sales_team',null),
      ('marketing','Marketing Team','marketing_team',null),
      ('hr','HR Team','hr_team',null),
      ('finance','Finance Team','finance_team',null)
    ) as t(bu_code,name,code,site_code)
    join shared.business_units bu on bu.org_id = o.org_id and bu.code = t.bu_code and bu.archived_at is null
    on conflict (org_id, code) do nothing;
  end loop;
end $$;
