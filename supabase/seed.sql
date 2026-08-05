-- Dev seed — COMMITTED, PUBLIC repo. Structure (OD-P1-5) + fictional dev people (OD-P1-6).
-- Real names/emails ONLY via the gitignored deploy seed. NEVER add real PII here.
-- Fixed UUIDs so tests and fixtures can reference them deterministically.
--
-- The squash (OD-WAY-35, #181–#186) is COMPLETE and every section is present again. The ops and
-- reporting sections — WIP items, the plan for today, the COGS read-models — were held back while
-- their schemas were being authored and were restored in #186, the ops ones reshaped onto the
-- (branch, activity) production stream that replaced `action_type`. If a section is ever removed
-- again, say which surface renders empty without it: this file is what makes Café and Plan show
-- anything at all on a fresh reset, and an empty surface reads as a broken app rather than a
-- missing seed. That mistake has now been made twice on this file (docs/gotchas.md).
--
-- `supabase/config.toml`'s db.seed.sql_paths is RESTORED as of #182: seed.dev-tasks.sql and
-- seed.dev-auth.sql are applied again, so `supabase db reset` leaves a database with working demo
-- logins. Both only need `shared` and `mos`, which now exist. Do not narrow that list again — the
-- frontend chain shares this local stack and a missing dev login reads as a broken app rather than
-- a missing seed (docs/gotchas.md).

-- The single org (OD-P1-1).
insert into shared.orgs (id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', 'Gordi', 'gordi')
on conflict (id) do nothing;

-- ── Business units — the six teams in the org chart (CONTEXT.md, ADR-0019 D1) ────────────────
-- `code` is the stable, name-independent identifier app code resolves by. The five legacy
-- operating-area rows ("Cafe Ops – General", "Kitchen and Bar", "Roastery", "Sales – CRM",
-- "Finance and People") are NOT re-seeded: they existed only to keep pre-remap ids resolvable, and
-- a squashed baseline has no pre-remap history to preserve.
insert into shared.business_units (id, org_id, name, code) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Marketing',  'marketing'),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'HR',         'hr'),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Finance',    'finance'),
  ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'Retail Ops', 'retail_ops'),
  ('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'B2B Ops',    'b2b_ops'),
  ('20000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', 'B2B Sales',  'b2b_sales')
on conflict (id) do nothing;

-- ── The canonical branch catalog (OD-WAY-39) ─────────────────────────────────────────────────
-- Repeated here because the migration seeds the orgs that exist AT MIGRATION TIME, and on a fresh
-- `supabase db reset` the Gordi org is created by this file, after migrations have run. Same
-- dual-seed pattern as sites/teams below. Provenance for each row is in the migration header
-- (20260805000001_shared_directory.sql) — read it before adding or removing one, especially before
-- adding "Bungur", which is the incumbent kitchen app's label for Rumah Rames and not a branch.
insert into shared.branches (id, org_id, code, name) values
  ('25000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'gordi_hq',    'Gordi HQ'),
  ('25000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'rumah_rames', 'Rumah Rames'),
  ('25000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'radiant',     'Radiant'),
  ('25000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'roastery',    'Gordi Roastery')
on conflict (org_id, code) do nothing;

-- ── Sites and Teams — org structure, a different plane from branches (DD-WAY-17) ─────────────
-- A Site is where people are; a Branch is whose books a movement lands in. This seed is NOT the
-- branch list and must not be read as one.
insert into shared.sites (id, org_id, name, code) values
  ('26000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Gordi HQ', 'gordi_hq'),
  ('26000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Radiant',  'radiant'),
  ('26000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Roastery', 'roastery')
on conflict (org_id, code) do nothing;

insert into shared.teams (org_id, business_unit_id, site_id, name, code)
select '10000000-0000-0000-0000-000000000001', bu.id,
       (select s.id from shared.sites s
         where s.org_id = '10000000-0000-0000-0000-000000000001' and s.code = t.site_code),
       t.name, t.code
from (values
  ('retail_ops','HQ Operations',      'hq_operations',      'gordi_hq'),
  ('retail_ops','Radiant Operations', 'radiant_operations', 'radiant'),
  ('retail_ops','Ecommerce Team',     'ecommerce_team',     null),
  ('b2b_ops',   'Roastery Team',      'roastery_team',      'roastery'),
  ('b2b_sales', 'B2B Sales Team',     'b2b_sales_team',     null),
  ('marketing', 'Marketing Team',     'marketing_team',     null),
  ('hr',        'HR Team',            'hr_team',            null),
  ('finance',   'Finance Team',       'finance_team',       null)
) as t(bu_code, name, code, site_code)
join shared.business_units bu
  on bu.org_id = '10000000-0000-0000-0000-000000000001'
 and bu.code = t.bu_code
 and bu.archived_at is null
on conflict (org_id, code) do nothing;

-- ── The six stream Teams — {GHQ, RRS, Radiant} x {kitchen, bar} (FR-005, OD-WAY-42, #231) ────
-- A Team with branch_id + activity set IS a production stream: the enumerable stream catalog, the
-- default-stream resolution (shared.default_stream) and — later — reviewer scoping all ride these
-- rows. Called here for the same reason the branch catalog is repeated above: the migration
-- (20260806000001_shared_stream_teams.sql) seeds orgs that exist AT MIGRATION TIME, and on a fresh
-- reset the Gordi org is created by this file, after migrations have run. The pair list itself
-- lives in ONE place — shared.seed_stream_teams(), defined by that migration — which also
-- VALIDATES the result: if an ordinary team already holds a reserved code, this call RAISES and
-- the reset fails loudly instead of shipping a five-stream catalog (FR-005/AC-012a). ROASTERY IS
-- DELIBERATELY ABSENT from the list: it is a branch, never a stream (OD-WAY-42) — do not
-- "complete" the grid with it.
select shared.seed_stream_teams();

-- ── Role tree (Jabatan) ──────────────────────────────────────────────────────────────────────
-- One org-lead role with no reports_to, plus one lead role per unit reporting to it.
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('30000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', null,                                   'Managing Director', null),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014', 'Cafe Ops Lead',     '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014', 'Kitchen Lead',      '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000015', 'Roastery Lead',     '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000016', 'Sales Lead',        '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000013', 'Finance Lead',      '30000000-0000-0000-0000-000000000000')
on conflict (id) do nothing;

-- Fictional canon dev people (OD-P1-6). No auth link — provisioned separately.
insert into shared.people (id, org_id, full_name, email) values
  ('40000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'Dewi Director',  'dewi.dev@example.test'),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cahya Cafe',     'cahya.dev@example.test'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Krishna Kitchen','krishna.dev@example.test'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Rama Roastery',  'rama.dev@example.test'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Sari Sales',     'sari.dev@example.test'),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Fitri Finance',  'fitri.dev@example.test')
on conflict (id) do nothing;

-- Jabatan assignments. Cahya is dual-hatted (Cafe Ops + Sales) so dev exercises the union manager
-- chain. granted_by lands NULL here: the seed connection has no acting person, which is honest.
insert into shared.person_roles (org_id, person_id, role_id) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000000'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005')
on conflict (person_id, role_id) do nothing;

-- Access-role assignments. Owner stand-in -> admin; the finance demo persona -> finance; everyone
-- else -> member (the default). The real roster lands via the gitignored deploy seed.
insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 'member'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 'finance')
on conflict (person_id, access_role) do nothing;

-- ── mos: the certified-metric registry (ADR-0022 D6) ─────────────────────────────────────────
-- Repeated here for the same reason as the branch catalog above: the migration seeds every org that
-- exists AT MIGRATION TIME, and on a fresh `supabase db reset` the Gordi org is created by this
-- file, after migrations have run. The definitions themselves are authored in
-- 20260805000007_mos_functions.sql — change them there and mirror the change here, never only here.
insert into mos.certified_metrics (key, org_id, name, meaning, unit, grain, certified, certified_at) values
  (
    'cogs.budgeted', '10000000-0000-0000-0000-000000000001',
    'Budgeted COGS',
    'A menu item''s BOM (recipe qty x materials) costed at the linked ingredient cost lines — the certified budgeted COGS that pricing and budgeting both consume (ADR-0022 D1).',
    'IDR', 'menu item', true, now()
  ),
  (
    'margin.gross_pct', '10000000-0000-0000-0000-000000000001',
    'Gross margin %',
    'Projected gross margin at a candidate price against the linked certified budgeted COGS — (price - cogs) / price. Read-only pre-flight; MOS never sets a price (ADR-0022 D5).',
    'percent', 'menu item x price', true, now()
  )
on conflict (org_id, key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ops — the item catalog and a plan for today
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ── Kitchen WIP items — the real roster (32: 16 CREATE + 16 REUSE) ───────────────────────────
-- Names are parity with the incumbent's own item list. ESB identifiers are populated by the push
-- flow later (the Teable source carries none), so they are left null here; `flag_active` defaults
-- true, which is what puts every row in front of a capture surface.
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

-- ── Their CONFIRMED default unit — what puts them on a capture form (#238) ───────────────────
-- Since #232 the capture form reads ops.capture_form_items, which returns only item-units whose
-- ERP coordinates are CONFIRMED: an unconfirmed item is ABSENT, not disabled (DD-WAY-29). The
-- migration's backfill keys on wip_items.esb_product_detail_id_porsi, and the rows above carry
-- none (see the note there — the Teable source has no ESB identifiers), so a fresh `db reset`
-- produced ZERO confirmed item-units and an EMPTY capture form for every persona on every
-- stream. The app was correct; there was simply nothing to offer. It cost #238 an e2e fixture
-- and would have cost the owner a render pass.
--
-- Same shape as the migration backfill — one confirmed default 'porsi' unit per item — with a
-- DEV-only synthetic coordinate. `DEV-PD-` prefixed and derived from the row id: deterministic
-- across resets, and unmistakable for a real ERP coordinate at a glance, in a payload, or in a
-- log. Nothing here reaches an ERP: this file is applied by `supabase db reset` (local) only,
-- staging and prod take migrations, and the dispatch target is gated pre-flip regardless.
--
-- confirmed_at is set to a non-null marker and RE-STAMPED by ops._stamp_item_unit_confirmation
-- to now(); confirmed_by lands NULL under the seed's claimless session — the system-recorded
-- shape, exactly as the backfilled rows carry.
insert into ops.item_units
  (org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id, is_default, confirmed_at)
select w.org_id, w.id, 'porsi',
       'DEV-PD-' || replace(w.id::text, '-', ''),
       'DEV-P-'  || replace(w.id::text, '-', ''),
       true, now()
from ops.wip_items w
where w.org_id = '10000000-0000-0000-0000-000000000001'
on conflict (wip_item_id, unit_name) do nothing;

-- ── A plan for "today" ───────────────────────────────────────────────────────────────────────
-- So the Plan editor's horizon and the Log variance gate have something to work against in local
-- dev. Stock is not seeded: it is recomputed from approved logs, and seeding a balance would put a
-- number on screen that no movement produced.
--
-- RESHAPED from the prior chain's row, and the reshape is the point rather than a port detail. The
-- old rows carried `action_type = 'Production'` and keyed their upsert on
-- (org, date, item, action_type). That column no longer exists: OD-WAY-28 replaced it with the
-- (branch, activity) production stream plus a movement, so a plan now has to say WHOSE BOOKS it is
-- for. These three are the Rumah Rames kitchen stream, which is the one the incumbent captures.
insert into ops.kitchen_plans
  (org_id, log_date, wip_item_id, branch_id, activity, action, qty_porsi, plan_by) values
  ('10000000-0000-0000-0000-000000000001', current_date, 'a1100000-0000-0000-0000-000000000001',
   '25000000-0000-0000-0000-000000000002', 'kitchen', 'produce', 50, '40000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', current_date, 'a1100000-0000-0000-0000-000000000002',
   '25000000-0000-0000-0000-000000000002', 'kitchen', 'produce', 30, '40000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', current_date, 'a1100000-0000-0000-0000-000000000006',
   '25000000-0000-0000-0000-000000000002', 'kitchen', 'produce', 25, '40000000-0000-0000-0000-000000000002')
on conflict (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- reporting — the Plan-destination COGS read-models (ADR-0022 D2/D6, ADR-0010)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Representative dev rows so Budget and Pricing are real and testable in the running app. The
-- warehouse snapshot job upserts these tables in production; finance and procurement own the
-- numbers, and consumers LINK by ESB code rather than copying a cost (anchor A5).
--
-- Three menu items, chosen to cover the three states the surfaces have to render, not just the
-- happy one: MENU-CAPPUC is fresh and complete; MENU-CROISS is complete but priced off a 90-day-old
-- butter line, which is what exercises the fail-loud freshness path; MENU-MUFFIN references an
-- ingredient with NO cost line at all, which is what makes mos.capture_budget raise instead of
-- quietly costing it at zero.
insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of, loaded_at) values
  ('10000000-0000-0000-0000-000000000001', 'ING-MILK-FRESH',   'Fresh Milk',      18000.00, 'L',  now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'ING-ESPRESSO-BEAN','Espresso Beans', 320000.00, 'kg', now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'ING-BUTTER-GK',    'Butter',          95000.00, 'kg', now() - interval '90 days', now() - interval '90 days'),
  ('10000000-0000-0000-0000-000000000001', 'ING-FLOUR-AP',     'Flour AP',        14000.00, 'kg', now() - interval '5 days',  now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'ING-SUGAR-WHITE',  'White Sugar',     16000.00, 'kg', now() - interval '5 days',  now() - interval '5 days')
on conflict (org_id, ingredient_esb_code) do update
  set name = excluded.name, unit_cost = excluded.unit_cost, unit = excluded.unit,
      as_of = excluded.as_of, loaded_at = excluded.loaded_at;

insert into reporting.bom_lines (org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty, qty_unit, as_of, loaded_at) values
  ('10000000-0000-0000-0000-000000000001', 'MENU-CAPPUC', 'ING-MILK-FRESH',    0.18, 'L',  now() - interval '5 days', now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-CAPPUC', 'ING-ESPRESSO-BEAN', 0.018,'kg', now() - interval '5 days', now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-CROISS', 'ING-BUTTER-GK',     0.04, 'kg', now() - interval '5 days', now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-CROISS', 'ING-FLOUR-AP',      0.06, 'kg', now() - interval '5 days', now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-CROISS', 'ING-SUGAR-WHITE',   0.01, 'kg', now() - interval '5 days', now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-MUFFIN', 'ING-FLOUR-AP',      0.08, 'kg', now() - interval '5 days', now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-MUFFIN', 'ING-SUGAR-WHITE',   0.03, 'kg', now() - interval '5 days', now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'MENU-MUFFIN', 'ING-MILK-FRESH-UNS',0.05, 'L',  now() - interval '5 days', now() - interval '5 days')
on conflict (org_id, menu_item_esb_code, ingredient_esb_code) do update
  set recipe_qty = excluded.recipe_qty, qty_unit = excluded.qty_unit, as_of = excluded.as_of,
      loaded_at = excluded.loaded_at;
