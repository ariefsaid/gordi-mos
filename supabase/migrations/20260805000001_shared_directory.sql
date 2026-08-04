-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 1 of 4: `shared` structure (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Both prior migration chains are discarded as history; this is one domain-ordered set authored
-- from the adopted model, across shared -> mos -> ops -> integrations -> reporting. This file is
-- the `shared` half's STRUCTURE: schemas, the tenancy/directory tables, the team/site substrate,
-- and the canonical branch catalog. Behaviour (helpers, guards, RLS, policies) lands in
-- ...0002_shared_access_control.sql; privileged provisioning in ...0003; test fixtures in ...0004.
--
-- Ordering is deliberate: RLS policies reference helper functions and CREATE POLICY resolves them
-- at creation time, so every function must exist before any policy that calls it. Splitting
-- structure from policy is what makes that ordering readable instead of accidental.
--
-- `shared` holds: org, people, access roles and their grant provenance, role hierarchy, jabatan,
-- sites, teams — plus ONE canonical branch catalog (OD-WAY-39), which is new.
--
-- DOWN (whole file, pre-production): drop schema shared cascade; drop schema mos cascade;
--   drop schema ops cascade; drop schema integrations cascade; drop schema reporting cascade.

-- ── Schemas (OD-DIR-3) ───────────────────────────────────────────────────────────────────────
-- Never dump MOS objects into public. One self-hosted Supabase serves MOS and future Gordi ops
-- apps: schema separation, not project separation.
create schema if not exists shared;
create schema if not exists mos;
create schema if not exists ops;
create schema if not exists integrations;
create schema if not exists reporting;

comment on schema shared is 'Cross-app directory and tenancy: orgs, people, roles, business units, teams, sites, branches.';
comment on schema mos is 'Management OS domain (tasks, weekly updates, signals, cascade).';
comment on schema ops is 'Operational capture: the Daily Log and the per-Activity production surfaces.';
comment on schema integrations is 'Outbound/inbound seams with external systems (the ERP outbox, …).';
comment on schema reporting is 'Curated financial read-models copied from the ESB warehouse; finance/admin RLS only.';

grant usage on schema shared to authenticated, anon, service_role;
grant usage on schema mos, ops, integrations, reporting to authenticated, service_role;

-- ── updated_at ───────────────────────────────────────────────────────────────────────────────
-- One function, schema-qualified, attached per table. Tables that are insert/delete-only carry no
-- updated_at column and therefore no trigger.
create or replace function shared.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
comment on function shared.set_updated_at() is 'Touches updated_at on every UPDATE. Attached per table.';

-- ── Orgs — the tenant container (OD-P1-1, ADR-0001 D8) ───────────────────────────────────────
-- No parent org: `orgs` is the root of the tenancy tree and therefore has no org_id of its own.
create table shared.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table shared.orgs is 'Tenant container. One row (Gordi) today; multi-org later = add rows.';

create trigger orgs_set_updated_at
  before update on shared.orgs
  for each row execute function shared.set_updated_at();

-- ── Business units — a TEAM in the org chart (CONTEXT.md, ADR-0019 D1) ───────────────────────
-- Marketing / HR / Finance / Retail Ops / B2B Ops / B2B Sales. NOT an operating area — those are
-- Activities or Revenue streams. `code` is the stable, name-independent identifier app code
-- resolves by (the earlier exact-name-match lookup was fragile); `archived_at` is the standing
-- soft-retire discipline (ADR-0001/0004) — no business row is ever hard-deleted.
create table shared.business_units (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  name                    text not null,
  code                    text,
  signal_visibility_rank  int,
  archived_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, name)
);
comment on table shared.business_units is
  'Gordi business units = teams in the org chart (CONTEXT.md). Every task/person belongs to one.';
comment on column shared.business_units.code is
  'Stable, name-independent identifier for FK-free runtime lookups. NULL on retired rows that predate the code space.';
comment on column shared.business_units.archived_at is
  'Soft-retire timestamp (ADR-0001/0004 archive discipline). NULL = live.';
comment on column shared.business_units.signal_visibility_rank is
  'ADR-0050 D2: upward-reach layer for Signals. NULL means 0 (lowest). Higher = broader default reach. Fail-closed: all NULL ships no cross-BU reach until an admin configures it.';

-- Nullable + partial-unique, not a blanket UNIQUE: retired rows keep code NULL forever, while every
-- live BU must have a unique code. A blanket unique would force placeholder codes for no purpose.
create unique index business_units_code_unique on shared.business_units (org_id, code)
  where code is not null;

create trigger business_units_set_updated_at
  before update on shared.business_units
  for each row execute function shared.set_updated_at();

-- ── Roles — the org position, a.k.a. Jabatan (CONTEXT.md, OD-P0-9a) ──────────────────────────
-- The reporting line is a role->role self-FK; the manager relation is DERIVED from it and is never
-- a flag on a person. Distinct from an Access role (what a person may DO) and from a RACI role.
create table shared.roles (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references shared.orgs(id) on delete cascade,
  business_unit_id   uuid references shared.business_units(id) on delete set null,
  name               text not null,
  reports_to_role_id uuid references shared.roles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, name)
);
comment on table shared.roles is 'Named org positions (UI: Jabatan/Position). The reporting line is the reports_to_role_id self-FK.';
comment on column shared.roles.reports_to_role_id is
  'Self-FK: this role reports to that role. The manager chain derives from this (OD-P0-9a). Cycle- and cross-org-guarded by shared._guard_role_hierarchy (…0002).';

-- is_manager_of walks reports_to_role_id upward recursively on every manager-scoped RLS check, so
-- this lookup is hot.
create index roles_reports_to_role_idx on shared.roles (reports_to_role_id);

create trigger roles_set_updated_at
  before update on shared.roles
  for each row execute function shared.set_updated_at();

-- ── People (OD-P1-2) ─────────────────────────────────────────────────────────────────────────
-- A person exists independent of a login, so they are RACI-referenceable before provisioning.
-- Soft-archive only.
create table shared.people (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references shared.orgs(id) on delete cascade,
  user_id              uuid references auth.users(id) on delete set null,
  full_name            text not null,
  email                text,
  must_change_password boolean not null default false,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table shared.people is 'Directory person; may exist before/without a login (OD-P1-2). RACI-referenceable pre-auth.';
comment on column shared.people.must_change_password is
  'The current password was set by an admin and is known to them. Cleared ONLY by the '
  'clear_must_change_password_on_pw_change trigger on auth.users (…0003), i.e. only by the password '
  'actually changing. Raising it from an app session is allowed — that is an admin forcing a rotation. '
  'While true, shared.current_org_id() returns NULL, so the flag gates AUTHORIZATION, not merely the UI.';

-- At most one person per auth user; many rows may carry NULL user_id without colliding.
-- NB there is deliberately NO unique constraint on email — seed BY EMAIL, not by insert-if-absent.
create unique index people_user_id_unique on shared.people (user_id) where user_id is not null;
create index people_org_idx on shared.people (org_id);

create trigger people_set_updated_at
  before update on shared.people
  for each row execute function shared.set_updated_at();

-- ── person_roles — the Jabatan assignment (OD-P1-7) ──────────────────────────────────────────
-- A person may hold several positions at once (dual-hat); the manager relation unions over them.
-- Immutable by design: insert/delete only, no UPDATE path, hence no updated_at and no trigger —
-- which is also why granted_by needs no separate immutability guard.
create table shared.person_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  role_id     uuid not null references shared.roles(id) on delete cascade,
  granted_by  uuid references shared.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (person_id, role_id)
);
comment on table shared.person_roles is 'Junction: people<->roles, many-to-many (OD-P1-7, dual-hat). The Jabatan assignment.';
comment on column shared.person_roles.granted_by is
  'Who performed this assignment. Column default AND the BEFORE INSERT guard both stamp '
  'shared.current_person_id(); the guard also OVERWRITES any client-supplied value, so attribution '
  'cannot be forged. NULL for service/seed inserts, which have no acting person. Both layers are kept '
  'on purpose: the default is correct if the trigger is ever detached, the guard is what makes the '
  'value unspoofable. A column-level REVOKE would NOT work here — it does not subtract from an '
  'existing table-level GRANT.';
create index person_roles_role_idx on shared.person_roles (role_id);
create index person_roles_person_idx on shared.person_roles (person_id);

-- ── Sites — a physical place, used only as org structure (CONTEXT.md, DD-WAY-17) ─────────────
-- A Team sits at a Site. A Site is NOT a branch and its seed is NOT the branch list: a Site is
-- where people are, a Branch is whose books a movement lands in. Load-bearing for Signals and
-- team-context; do not delete it and do not conflate it with shared.branches below.
create table shared.sites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  code        text not null check (btrim(code) <> ''),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, code)
);
comment on table shared.sites is
  'Physical place, used only as org structure — a Team sits at one (CONTEXT.md "Site", DD-WAY-17). NOT the branch catalog; see shared.branches.';
create index sites_org_idx on shared.sites (org_id);
create trigger sites_set_updated_at
  before update on shared.sites
  for each row execute function shared.set_updated_at();

-- ── Teams — a concrete group under one BU (ADR-0050 D1) ──────────────────────────────────────
create table shared.teams (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade,
  business_unit_id uuid not null references shared.business_units(id),
  site_id          uuid references shared.sites(id),
  name             text not null check (btrim(name) <> ''),
  code             text not null check (btrim(code) <> ''),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, code)
);
comment on table shared.teams is 'A concrete group under exactly one business unit; optionally sited (ADR-0050 D1).';
create index teams_org_idx on shared.teams (org_id);
create index teams_business_unit_idx on shared.teams (business_unit_id);
create index teams_active_org_idx on shared.teams (org_id) where archived_at is null;
create trigger teams_set_updated_at
  before update on shared.teams
  for each row execute function shared.set_updated_at();

-- ── Team memberships — effective-dated Person<->Team ─────────────────────────────────────────
create table shared.team_memberships (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade,
  person_id      uuid not null references shared.people(id) on delete cascade,
  team_id        uuid not null references shared.teams(id) on delete cascade,
  is_primary     boolean not null default false,
  effective_from date not null default current_date,
  effective_to   date,
  created_at     timestamptz not null default now()
);
comment on table shared.team_memberships is 'Effective-dated Person<->Team membership (ADR-0050 D1). At most one live primary per person.';
create unique index team_memberships_one_primary
  on shared.team_memberships (person_id) where is_primary and effective_to is null;
create index team_memberships_team_idx   on shared.team_memberships (team_id);
create index team_memberships_person_idx on shared.team_memberships (person_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ── Branches — THE canonical branch catalog (OD-WAY-39). NEW in this baseline. ────────────────
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A Branch is an inventory-and-accounting context in the ERP — whose books a movement lands in.
-- It is NOT a physical place: Gordi has ONE physical kitchen and it produces for several branches.
-- Before this table, "branch" was spelled three ways and none of them was a list:
--   * shared.sites            — org structure for Teams, seeded HQ/Radiant/Roastery.
--   * the (branch, activity)  — the real operational axis, with no table at all.
--     production streams
--   * reporting.branch_code   — free text pass-through from the ERP, ~80 distinct values.
-- This is the one list, and every branch-bearing surface links to it: ops production streams and
-- reporting alike.
--
-- AUTHORED FRESH, NOT HARVESTED FROM shared.sites (DD-WAY-17 says so explicitly): sites carries
-- `Roastery` — a business unit wearing a site's clothes — and misses the branches the kitchen
-- actually produces for. The two are different planes and are kept apart deliberately.
--
-- NO ERP CODE COLUMN, on purpose. OD-WAY-39's join is PROPOSE-NOT-REJECT: a reporting fact row
-- keeps the ERP's `branch_code` text exactly as sent AND carries a separate nullable link to this
-- catalog, empty by default. Unknown codes ingest fine and queue as unlinked, then are mapped by
-- hand (the admin mapping screen is deferred out of cohort 1). Putting an ERP code here instead
-- would (a) create a second home for a value the fact row already owns and (b) not fit: the ERP
-- grain is a two-part (esb_code, branch_code) key, not one code per branch. A hard FK on the fact
-- table is the thing to avoid — it turns a new ERP branch into a failed nightly job.
create table shared.branches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  code        text not null check (btrim(code) <> ''),
  name        text not null check (btrim(name) <> ''),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, code)
);
comment on table shared.branches is
  'THE canonical branch catalog (OD-WAY-39). A branch is an inventory-and-accounting context in the '
  'ERP — whose books a movement lands in — never a physical place. Every branch-bearing surface '
  '(ops production streams, reporting) links here. Reporting keeps the ERP''s own branch_code text '
  'beside a nullable link to this table, so an unknown ERP code ingests unlinked rather than failing '
  '(propose-not-reject). Distinct from shared.sites, which is org structure.';
comment on column shared.branches.code is
  'MOS''s own stable identifier, snake_case, matching the code convention on business_units/sites/teams. '
  'Deliberately NOT an ERP branch code: the ERP namespace stays on the reporting fact rows.';
comment on column shared.branches.archived_at is 'Soft-retire timestamp. NULL = live. Branches are never hard-deleted — historical movements reference them.';

create index branches_org_idx on shared.branches (org_id);
create index branches_active_org_idx on shared.branches (org_id) where archived_at is null;

-- The composite-FK target. A composite foreign key needs a unique index over exactly its referenced
-- columns, and (org_id, id) is meaningful only to the surfaces that link to this catalog while
-- carrying their own org_id — reporting's fact rows do exactly that (...0014). It is redundant with
-- the primary key by content (id alone is already unique) and exists solely so the org seam on those
-- links can be declared rather than triggered.
create unique index branches_org_id_key on shared.branches (org_id, id);
comment on index shared.branches_org_id_key is
  'Composite-FK target for branch links that must stay inside one org (reporting fact rows). '
  'Redundant with the primary key by content; it exists so the org seam is declarative.';

create trigger branches_set_updated_at
  before update on shared.branches
  for each row execute function shared.set_updated_at();

-- ── Branch seed: every branch actually in use ────────────────────────────────────────────────
-- Idempotent, per existing org, mirroring the sites seed pattern (migration seeds orgs that exist
-- at migration time; supabase/seed.sql re-seeds Gordi on a fresh reset).
--
-- Each row and where it was found:
--
--   gordi_hq      Gordi HQ        The production-stream table in OD-WAY-26 lists "Kitchen -> GHQ"
--                                 and "Bar @ GHQ"; CONTEXT.md's Production stream entry uses
--                                 `GHQ · kitchen` / `GHQ · bar` as its examples. GHQ keeps its own
--                                 raw/WIP/FG inventory. Also present in the v4 sites seed as the
--                                 site 'Gordi HQ'.
--   rumah_rames   Rumah Rames     OD-WAY-26: "Kitchen -> RRS" and "Bar @ RRS". This is the branch
--                                 the incumbent kitchen app calls **Bungur** — its action_type
--                                 literal 'Transfer to Bungur' is in BOTH chains' ops.kitchen_logs
--                                 / ops.kitchen_plans CHECK constraints, and its ERP-poller aliases
--                                 'Transfer to RRS' to it. MISSING from the sites seed entirely,
--                                 which is one half of why that seed is not the branch list.
--   radiant       Radiant         OD-WAY-26: "Kitchen -> Radiant" and "Bar @ Radiant"; the
--                                 'Transfer to Radiant' action_type literal in both chains. Also a
--                                 site in the v4 seed.
--   roastery      Gordi Roastery  The only branch with a LIVE reporting observation rather than a
--                                 fixture: the 2026-07-02 staging snapshot landed B2B rows as
--                                 channel=B2B / esb_code=GRI / branch_name='Gordi Roastery'
--                                 (docs/warehouse-online.md), and ADR-0024 records the same code.
--                                 It books to its own company in the ERP, so by the definition —
--                                 whose books a movement lands in — it is a branch, even though it
--                                 is ALSO wrongly present as a site.
--
-- Deliberately NOT seeded, and why, so the next reader does not "fix" it:
--   * 'Bungur' is NOT a fifth branch. It is the incumbent app's UI label for Rumah Rames — its own
--     poller records branchCode RRS / "Outlet Rumah Rames" under that name. Seeding it would
--     re-create the collision this catalog exists to end. Its only appearances as a `branch_name`
--     ('Bungur', code 'BGR') are pgTAP FIXTURES on both chains, never a real seed or a live row.
--   * Ecommerce is a stock location and a revenue lens, not a set of books. No branch_code for it
--     exists anywhere in either chain.
--
-- Beware the label trap while extending this: the incumbent's stock tab reads "Stok HQ", where HQ
-- means the CENTRAL KITCHEN — which books to Rumah Rames, not to the branch whose ERP code is GHQ.
do $$
declare o record;
begin
  for o in select id as org_id from shared.orgs loop
    insert into shared.branches (org_id, code, name) values
      (o.org_id, 'gordi_hq',    'Gordi HQ'),
      (o.org_id, 'rumah_rames', 'Rumah Rames'),
      (o.org_id, 'radiant',     'Radiant'),
      (o.org_id, 'roastery',    'Gordi Roastery')
    on conflict (org_id, code) do nothing;
  end loop;
end $$;
