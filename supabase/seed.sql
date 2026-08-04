-- Dev seed — COMMITTED, PUBLIC repo. Structure (OD-P1-5) + fictional dev people (OD-P1-6).
-- Real names/emails ONLY via the gitignored deploy seed. NEVER add real PII here.
-- Fixed UUIDs so tests and fixtures can reference them deterministically.
--
-- ⚠ SQUASH IN PROGRESS (OD-WAY-35, #181–#186). `shared` (#181) and `mos` (#182) are authored; the
-- ops / integrations / reporting baselines land in #183–#185, so their seed sections — WIP items,
-- kitchen plans, the COGS read-models — are still absent and come back with the schema they belong
-- to. The prior content is recoverable from `origin/dev`.
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
