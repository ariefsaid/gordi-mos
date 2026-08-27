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

-- ── Dev-only, enforced rather than assumed ──────────────────────────────────────────────────
-- This file is FIXTURE data and it is consequential: it grants `admin`, `ops_lead`, `supervisor`,
-- `manager` and `finance`, and writes 46 team memberships — and membership is an authorization
-- input for the Signal read gate, the team post/start gates and kitchen-log review authority.
-- Counted, because two rounds of review got this wrong in both directions: of the 20 inserts,
-- 17 are `on conflict (target) do nothing`, 1 is a BARE `on conflict do nothing`, and 2 are
-- `on conflict (target) do UPDATE`. So most of it lands quietly on the wrong database — but not
-- all of it:
--   * the two `do update` inserts (reporting.ingredient_cost_lines, reporting.bom_lines) OVERWRITE
--     existing rows with fixture values, and those rows are what mos.capture_budget prices a budget
--     from and what the certified COGS metric reads. That is the worst case here, not duplication.
--   * the bare one is team_memberships. An untargeted `do nothing` only suppresses an ACTUAL
--     constraint violation, and no constraint covers a duplicate non-primary row — the only index
--     is the partial one-live-primary — so a hand re-run duplicates them. THIS FILE writes 46
--     memberships (the count named at the top of this block); a full RESET lands 48, because
--     seed.dev-cafe-opening and seed.dev-signals each add one the guards do not suppress; and a
--     second hand run of this file takes that to 64 by duplicating the 16 unconstrained rows.
--     Dev fixture, no authorization consequence: every gate asks `exists`, and a duplicate of a
--     row that already exists widens nothing.
--
-- The guard asks the one question that separates dev from anything real: does this database
-- already hold a person whose email is not `@example.test` (RFC 6761, unroutable)? `coalesce` so a
-- real person with a NULL email trips it too.
--
-- TWO things make it actually stop the run, and it needs both — plus one compatibility note:
--   * it is FIRST — ahead of the org insert, not in the middle. A guard below the rows it guards
--     protects nothing above it, which is what the first cut did;
--   * the file is bracketed `begin; … commit;`. A bare `raise exception` inside `do $$ … $$` does
--     NOT stop `psql -f`: ON_ERROR_STOP is off by default, every statement is its own transaction,
--     and psql prints the error and runs the next one. Measured, not assumed — a probe insert
--     after the raise still landed. Inside a transaction the raise poisons it, every later
--     statement fails "current transaction is aborted", and `commit` degrades to rollback;
--   * and `supabase db reset` still applies the file cleanly with the bracket in place — measured,
--     no transaction warning in its output, so the CLI does NOT appear to wrap seed files itself
--     and this `begin`/`commit` is the only transaction rather than a redundant inner one.
begin;

do $$
begin
  if exists (
    select 1 from shared.people
     where coalesce(email, '') not like '%@example.test'
  ) then
    raise exception
      'supabase/seed.sql: refusing to seed dev FIXTURES into a database that holds real people. '
      'This file grants access roles and team memberships, which are authorization inputs. '
      'Deployed databases take the gitignored deploy seed, never this one.'
      using errcode = '42501';
  end if;
end
$$;

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
  ('25000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'roastery',    'Gordi Roastery'),
  ('25000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'cikal',       'Cikal')
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

-- ── The seven stream Teams — {GHQ, RRS, Radiant} x {kitchen, bar} + Cikal x bar (OD-WAY-79) ──
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

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ── The wider dev roster — a floor, a bar, a kitchen and a back office ───────────────────────
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-26: "update the seed users to reflect more reality." A six-person org made every
-- people-shaped surface read as a toy — one name per team, assignee pickers with six entries, RACI
-- with nobody to be Consulted, and `shared.team_memberships` EMPTY, so "who is on this team" had
-- no answer at all on a fresh reset.
--
-- What "more reality" means here is the SHAPE, not the roster: a tiered org (leads → supervisors →
-- floor), several people per team, and everyone actually attached to a team. The names below are
-- fixtures and stay fixtures — see the header. They are NOT the Gordi roster, they do not encode
-- Gordi's real headcount per team, and nothing here should be read as an enumeration of who works
-- where. Real names, real emails and the real distribution land only via the gitignored deploy
-- seed. This is a PUBLIC repo; that rule has no exceptions.

-- ── The tiers under each lead ────────────────────────────────────────────────────────────────
-- The role tree stopped at "one lead per unit", so there was no Jabatan for the people who
-- actually run a shift and no manager chain below a lead to walk.
--
-- Called, not restated: the list lives in shared.seed_role_tiers() (20260826000002) and nowhere
-- else. Same dual-seed reason as the branch catalog and the stream teams above — the migration
-- seeds the orgs that exist AT MIGRATION TIME, and on a fresh `supabase db reset` the Gordi org is
-- created by THIS file, after migrations have run. Copying the list back here is the drift that
-- shape exists to prevent, and the applied-path check (#393) is what would catch it.
select shared.seed_role_tiers();

-- ── The rest of the fixture roster ───────────────────────────────────────────────────────────
-- The original six (…0000–…0005) keep their ids and their alliterative fixture names — they are the
-- demo logins (seed.dev-auth.sql) and a pile of unit fixtures reference them by name. These are
-- their colleagues. Ids continue the same block so a fixture can still pin one deterministically.
insert into shared.people (id, org_id, full_name, email) values
  ('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Bagas Barista',    'bagas.dev@example.test'),
  ('40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Bulan Barista',    'bulan.dev@example.test'),
  ('40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'Bayu Barista',     'bayu.dev@example.test'),
  ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'Bintang Barista',  'bintang.dev@example.test'),
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Sinta Supervisor', 'sinta.dev@example.test'),
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'Satria Supervisor','satria.dev@example.test'),
  ('40000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'Kirana Kitchen',   'kirana.dev@example.test'),
  ('40000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', 'Kemal Kitchen',    'kemal.dev@example.test'),
  ('40000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000001', 'Kartika Kitchen',  'kartika.dev@example.test'),
  ('40000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000001', 'Kanaya Kitchen',   'kanaya.dev@example.test'),
  ('40000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'Rio Radiant',      'rio.dev@example.test'),
  ('40000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Ratna Radiant',    'ratna.dev@example.test'),
  ('40000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'Reza Radiant',     'reza.dev@example.test'),
  ('40000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Rani Radiant',     'rani.dev@example.test'),
  ('40000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'Eka Ecommerce',    'eka.dev@example.test'),
  ('40000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'Endah Ecommerce',  'endah.dev@example.test'),
  ('40000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', 'Rangga Roaster',   'rangga.dev@example.test'),
  ('40000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000001', 'Rosa Roaster',     'rosa.dev@example.test'),
  ('40000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', 'Surya Sales',      'surya.dev@example.test'),
  ('40000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000001', 'Sekar Sales',      'sekar.dev@example.test'),
  ('40000000-0000-0000-0000-00000000001a', '10000000-0000-0000-0000-000000000001', 'Maya Marketing',   'maya.dev@example.test'),
  ('40000000-0000-0000-0000-00000000001b', '10000000-0000-0000-0000-000000000001', 'Miko Marketing',   'miko.dev@example.test'),
  ('40000000-0000-0000-0000-00000000001c', '10000000-0000-0000-0000-000000000001', 'Putri People',     'putri.dev@example.test'),
  ('40000000-0000-0000-0000-00000000001d', '10000000-0000-0000-0000-000000000001', 'Farid Finance',    'farid.dev@example.test')
on conflict (id) do nothing;

-- Jabatan for the new roster. Resolved by role NAME, not id: the tier roles are created by
-- shared.seed_role_tiers() with generated ids, so there is no literal to pin. `granted_by` stays
-- NULL for the same honest reason as the six above (a seed connection has no acting person).
insert into shared.person_roles (org_id, person_id, role_id)
select '10000000-0000-0000-0000-000000000001', p.person_id::uuid, r.id
from (values
  ('40000000-0000-0000-0000-000000000006', 'Head Barista'),
  ('40000000-0000-0000-0000-000000000007', 'Barista'),
  ('40000000-0000-0000-0000-000000000008', 'Barista'),
  ('40000000-0000-0000-0000-000000000009', 'Barista'),
  ('40000000-0000-0000-0000-00000000000a', 'Bar Supervisor'),
  ('40000000-0000-0000-0000-00000000000b', 'Kitchen Supervisor'),
  ('40000000-0000-0000-0000-00000000000c', 'Kitchen Staff'),
  ('40000000-0000-0000-0000-00000000000d', 'Kitchen Staff'),
  ('40000000-0000-0000-0000-00000000000e', 'Kitchen Staff'),
  ('40000000-0000-0000-0000-00000000000f', 'Kitchen Staff'),
  ('40000000-0000-0000-0000-000000000010', 'Bar Supervisor'),
  ('40000000-0000-0000-0000-000000000011', 'Barista'),
  ('40000000-0000-0000-0000-000000000012', 'Kitchen Staff'),
  ('40000000-0000-0000-0000-000000000013', 'Kitchen Staff'),
  ('40000000-0000-0000-0000-000000000014', 'Ecommerce Lead'),
  ('40000000-0000-0000-0000-000000000015', 'Ecommerce Associate'),
  ('40000000-0000-0000-0000-000000000016', 'Roaster'),
  ('40000000-0000-0000-0000-000000000017', 'Roaster'),
  ('40000000-0000-0000-0000-000000000018', 'Account Executive'),
  ('40000000-0000-0000-0000-000000000019', 'Account Executive'),
  ('40000000-0000-0000-0000-00000000001a', 'Marketing Lead'),
  ('40000000-0000-0000-0000-00000000001b', 'Marketing Lead'),
  ('40000000-0000-0000-0000-00000000001c', 'People Lead'),
  ('40000000-0000-0000-0000-00000000001d', 'Finance Associate')
) as p(person_id, role_name)
join shared.roles r
  on r.org_id = '10000000-0000-0000-0000-000000000001' and r.name = p.role_name
on conflict (person_id, role_id) do nothing;

-- Access roles for the new roster. Deliberately NOT all `member`: the supervisor and ops_lead
-- tiers exist in the access model and every surface gated on them (Café Review, Café Pushes, the
-- revenue VIEW tiers) had exactly ONE dev account that could open it, which is how a role gate
-- ships broken and nobody notices.
insert into shared.person_access_roles (org_id, person_id, access_role)
select '10000000-0000-0000-0000-000000000001', p.person_id::uuid, p.access_role::shared.access_role
from (values
  ('40000000-0000-0000-0000-000000000006', 'member'),
  ('40000000-0000-0000-0000-000000000007', 'member'),
  ('40000000-0000-0000-0000-000000000008', 'member'),
  ('40000000-0000-0000-0000-000000000009', 'member'),
  ('40000000-0000-0000-0000-00000000000a', 'supervisor'),   -- Sinta  runs the HQ bar
  ('40000000-0000-0000-0000-00000000000b', 'supervisor'),   -- Satria runs the HQ kitchen
  ('40000000-0000-0000-0000-00000000000c', 'member'),
  ('40000000-0000-0000-0000-00000000000d', 'member'),
  ('40000000-0000-0000-0000-00000000000e', 'member'),
  ('40000000-0000-0000-0000-00000000000f', 'member'),
  ('40000000-0000-0000-0000-000000000010', 'supervisor'),   -- Rio    runs the Radiant floor
  ('40000000-0000-0000-0000-000000000011', 'member'),
  ('40000000-0000-0000-0000-000000000012', 'member'),
  ('40000000-0000-0000-0000-000000000013', 'member'),
  ('40000000-0000-0000-0000-000000000014', 'manager'),      -- Eka    owns Ecommerce
  ('40000000-0000-0000-0000-000000000015', 'member'),
  ('40000000-0000-0000-0000-000000000016', 'member'),
  ('40000000-0000-0000-0000-000000000017', 'member'),
  ('40000000-0000-0000-0000-000000000018', 'member'),
  ('40000000-0000-0000-0000-000000000019', 'member'),
  ('40000000-0000-0000-0000-00000000001a', 'manager'),      -- Maya   owns Marketing
  ('40000000-0000-0000-0000-00000000001b', 'member'),
  ('40000000-0000-0000-0000-00000000001c', 'manager'),      -- Putri  owns People
  ('40000000-0000-0000-0000-00000000001d', 'finance')       -- Farid  the second finance seat
) as p(person_id, access_role)
on conflict (person_id, access_role) do nothing;

-- Cahya keeps the Café ops_lead tier the demo login depends on; it was never granted, so the one
-- persona the Café Review and Pushes gates were designed around could not open either surface.
insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'ops_lead')
on conflict (person_id, access_role) do nothing;

-- ── Team memberships — who is actually ON a team ─────────────────────────────────────────────
-- `shared.team_memberships` was seeded by NOTHING before this. The table has existed since the
-- squashed baseline (ADR-0050 D1) with RLS, a same-org guard and a one-live-primary index, and on
-- a fresh `supabase db reset` it held zero rows — so every team read the same way an unseeded
-- section does: empty, and indistinguishable from broken.
--
-- Teams are resolved by CODE, never by id: org teams get their ids from `shared.teams`' default
-- and the six stream teams are created by `shared.seed_stream_teams()`, so there is no literal to
-- hardcode. `is_primary` is the person's home team — at most one live per person, which the
-- partial unique index enforces. For LINE STAFF that home is their STREAM team, per OD-WAY-49 and
-- DD-WAY-41; their org-team row is the secondary one. Unit leads and back office are the other way
-- round. The detail is on the stream block below, and shared_10's assertions enforce both halves.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
select '10000000-0000-0000-0000-000000000001', m.person_id::uuid, t.id, m.is_primary
from (values
  -- Leadership + back office, on their unit's team.
  ('40000000-0000-0000-0000-000000000000', 'hq_operations',      true),   -- Dewi    Managing Director
  ('40000000-0000-0000-0000-000000000001', 'hq_operations',      true),   -- Cahya   Cafe Ops Lead
  ('40000000-0000-0000-0000-000000000002', 'hq_operations',      true),   -- Krishna Kitchen Lead
  ('40000000-0000-0000-0000-000000000003', 'roastery_team',      true),   -- Rama    Roastery Lead
  ('40000000-0000-0000-0000-000000000004', 'b2b_sales_team',     true),   -- Sari    Sales Lead
  ('40000000-0000-0000-0000-000000000005', 'finance_team',       true),   -- Fitri   Finance Lead
  -- HQ floor.
  ('40000000-0000-0000-0000-000000000006', 'hq_operations',      false),
  ('40000000-0000-0000-0000-000000000007', 'hq_operations',      false),
  ('40000000-0000-0000-0000-000000000008', 'hq_operations',      false),
  ('40000000-0000-0000-0000-000000000009', 'hq_operations',      false),
  ('40000000-0000-0000-0000-00000000000a', 'hq_operations',      false),
  ('40000000-0000-0000-0000-00000000000b', 'hq_operations',      false),
  ('40000000-0000-0000-0000-00000000000c', 'hq_operations',      false),
  ('40000000-0000-0000-0000-00000000000d', 'hq_operations',      false),
  ('40000000-0000-0000-0000-00000000000e', 'hq_operations',      false),
  ('40000000-0000-0000-0000-00000000000f', 'hq_operations',      false),
  -- Radiant floor.
  ('40000000-0000-0000-0000-000000000010', 'radiant_operations', false),
  ('40000000-0000-0000-0000-000000000011', 'radiant_operations', false),
  ('40000000-0000-0000-0000-000000000012', 'radiant_operations', false),
  ('40000000-0000-0000-0000-000000000013', 'radiant_operations', false),
  -- Everyone else.
  ('40000000-0000-0000-0000-000000000014', 'ecommerce_team',     true),
  ('40000000-0000-0000-0000-000000000015', 'ecommerce_team',     true),
  ('40000000-0000-0000-0000-000000000016', 'roastery_team',      true),
  ('40000000-0000-0000-0000-000000000017', 'roastery_team',      true),
  ('40000000-0000-0000-0000-000000000018', 'b2b_sales_team',     true),
  ('40000000-0000-0000-0000-000000000019', 'b2b_sales_team',     true),
  ('40000000-0000-0000-0000-00000000001a', 'marketing_team',     true),
  ('40000000-0000-0000-0000-00000000001b', 'marketing_team',     true),
  ('40000000-0000-0000-0000-00000000001c', 'hr_team',            true),
  ('40000000-0000-0000-0000-00000000001d', 'finance_team',       true),
  -- Stream teams — {branch} x {kitchen, bar}, the production lines. These are the PRIMARY rows for
  -- everyone who works a line, and their org-team row above is the non-primary one.
  --
  -- That direction is OD-WAY-49's, not a preference: "the person's PRIMARY team defaults their
  -- capture stream", and `shared.default_stream()` reads the live primary and nothing else. The
  -- first cut of this seed had it backwards — primary = reporting line, stream = secondary — which
  -- left all 30 seeded people resolving to NO stream, the exact state the seed exists to fix, while
  -- the admin screen told the world "the home team sets this person's default capture stream".
  -- Back-office people keep an org team as primary and correctly resolve to no stream.
  --
  -- So do the two unit LEADS (Cahya, Krishna): a lead who runs several lines is not line staff, and
  -- seed.dev-cafe-opening.sql already says why in as many words — "a primary would re-point Cahya's
  -- default context app-wide". Their stream rows stay secondary, which is all the gates need.
  ('40000000-0000-0000-0000-000000000006', 'gordi_hq_bar',        true),
  ('40000000-0000-0000-0000-000000000007', 'gordi_hq_bar',        true),
  ('40000000-0000-0000-0000-000000000008', 'gordi_hq_bar',        true),
  ('40000000-0000-0000-0000-00000000000a', 'gordi_hq_bar',        true),
  ('40000000-0000-0000-0000-000000000001', 'gordi_hq_bar',        false),   -- Cahya: LEAD, not line staff
  ('40000000-0000-0000-0000-00000000000b', 'gordi_hq_kitchen',    true),
  ('40000000-0000-0000-0000-00000000000c', 'gordi_hq_kitchen',    true),
  ('40000000-0000-0000-0000-00000000000d', 'gordi_hq_kitchen',    true),
  ('40000000-0000-0000-0000-000000000002', 'gordi_hq_kitchen',    false),   -- Krishna: LEAD, not line staff
  ('40000000-0000-0000-0000-00000000000e', 'rumah_rames_kitchen', true),
  ('40000000-0000-0000-0000-00000000000f', 'rumah_rames_kitchen', true),
  ('40000000-0000-0000-0000-000000000009', 'rumah_rames_bar',     true),
  ('40000000-0000-0000-0000-000000000010', 'radiant_bar',         true),
  ('40000000-0000-0000-0000-000000000011', 'radiant_bar',         true),
  ('40000000-0000-0000-0000-000000000012', 'radiant_kitchen',     true),
  ('40000000-0000-0000-0000-000000000013', 'radiant_kitchen',     true)
) as m(person_id, team_code, is_primary)
join shared.teams t
  on t.org_id = '10000000-0000-0000-0000-000000000001'
 and t.code = m.team_code
 and t.archived_at is null
on conflict do nothing;


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
-- ⚠ WIB, not UTC (#459). The app asks for "today" in Asia/Jakarta (kitchen-plan-page's wibToday,
-- NFR-007); Postgres `current_date` in these containers is UTC. Between 17:00 and 24:00 UTC —
-- 00:00-07:00 WIB, seven hours of every day — those are DIFFERENT DATES, so a seed written at
-- `current_date` puts the plans on yesterday and every Café Plan surface renders empty for no
-- visible reason. That is what reddened the geometry lane on passing code (CI ran at 23:58 UTC)
-- and it would equally hit a developer seeding before breakfast.
insert into ops.kitchen_plans
  (org_id, log_date, wip_item_id, branch_id, activity, action, qty_porsi, plan_by) values
  ('10000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Jakarta')::date, 'a1100000-0000-0000-0000-000000000001',
   '25000000-0000-0000-0000-000000000002', 'kitchen', 'produce', 50, '40000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Jakarta')::date, 'a1100000-0000-0000-0000-000000000002',
   '25000000-0000-0000-0000-000000000002', 'kitchen', 'produce', 30, '40000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Jakarta')::date, 'a1100000-0000-0000-0000-000000000006',
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

commit;
