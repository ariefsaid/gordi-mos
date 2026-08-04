-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — `reporting`, 1 of 2: the read-models and the ERP branch join (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The curated financial surfaces MOS reads and never computes: revenue, interim margin, the two
-- Plan COGS reference tables, and the supervisor revenue-scope substrate. Source of truth stays the
-- ESB warehouse; these are snapshots with an as-of on every row (ADR-0010's OLTP/OLAP split).
--
-- ⚠ READ THIS BEFORE ADDING ANYTHING — reporting.esb_ar_reduction IS NOT HERE, ON PURPOSE.
-- It was authored in the `mos` pass (...0005 / ...0006) because mos.follow_up_recon_drift is a VIEW
-- over it and Postgres validates a view's references at creation time. Splitting the AR bridge to
-- satisfy file ordering would be the reshape DD-WAY-16 forbids. This pass VERIFIED it — table,
-- grants, RLS posture and its one policy — and re-creating it here would drop the view. The
-- verification is an assertion, not a claim: supabase/tests/reporting_06_carry_and_writer.sql.
-- Same class as integrations.esb_push landing in the `ops` pass.
--
-- ── The ERP branch join: propose-not-reject (OD-WAY-39) ──────────────────────────────────────
-- Every fact row that carries a branch keeps the ERP's own `branch_code` TEXT EXACTLY AS SENT, and
-- carries a SEPARATE NULLABLE LINK to shared.branches beside it. An ERP branch MOS has never heard
-- of ingests with `branch_id` null and nothing fails; the mapping is then proposed for a human to
-- confirm. The admin mapping screen is deferred out of cohort 1 (owner: "yes defer the screen, map
-- by hand for now"), so the link is written by hand today.
--
--   * The link is BESIDE the raw value, never instead of it. Replacing branch_code would throw away
--     the only record of what the ERP actually sent, and re-derive it from a mapping that a human
--     may not have made yet.
--   * There is NO constraint on branch_code itself. A hard reference on the ERP text is the thing
--     OD-WAY-39 rules out by name: it turns a new ERP branch into a failed nightly job, moving the
--     breakage from ingest-time to constraint-time rather than removing it.
--   * What the link DOES carry is a composite foreign key on (org_id, branch_id) into
--     shared.branches (org_id, id) — see the unique index below. This is deliberate and it is not a
--     hard FK on the fact row's ERP identity: under MATCH SIMPLE a composite FK is NOT ENFORCED AT
--     ALL when any of its columns is null, so an unlinked row is unconstrained, which is exactly
--     propose-not-reject's resting state. The moment a link IS set, it must point at a branch in the
--     SAME ORG — the org seam, enforced declaratively rather than by a trigger that would have to
--     read shared.branches under the snapshot writer's own privileges.
--
-- The prize this unlocks, and the reason it is worth the column: production cost and revenue become
-- JOINABLE PER BRANCH FROM MOS'S OWN DATA. ops.kitchen_logs.branch_id and these fact rows now resolve
-- to the same shared.branches row, so the COGS-and-margin picture July's blow-up needed (OD-WAY-27)
-- can be assembled without a hand-kept spelling map. Asserted in reporting_04_branch_join.sql.
--
-- ── What is carried, and from where ──────────────────────────────────────────────────────────
--   sales_daily_revenue      CARRIED from 20260701000001 (+ the branch-catalog covering index from
--                            20260731000002). Grain org/date/channel/esb/branch, unchanged.
--   sales_margin_daily       CARRIED from 20260704000002. POS-only, no channel column — COGS has no
--                            channel dimension upstream. Both COGS bases, never a bare "COGS".
--   ingredient_cost_lines    CARRIED from 20260710000001. mos.capture_budget joins this table to
--   bom_lines                recompute a budget total server-side, so its happy path was untestable
--                            until this file landed; #186 owns the end-to-end.
--   supervisor_revenue_scope CARRIED from 20260729000004, with the org-null-safe guard body from
--                            20260729000005 folded in. #181 correctly left these out: they are
--                            `reporting` objects even though the tier they serve is an access role.
--   list_revenue_branches()  CARRIED from 20260729000004.
--
-- ── Two inherited rationales that no longer hold, corrected rather than carried ──────────────
--   1. 20260729000004 commented supervisor_revenue_scope.branch_code as "not FK-validated — NO
--      BRANCH TABLE EXISTS". A branch table exists now (shared.branches, #181), so the stated reason
--      is false even though the behaviour it justified is still right. The behaviour is kept for the
--      reason that actually holds — the ERP namespace is not MOS's to validate — and the nullable
--      link is added beside it.
--   2. The schema comment on `reporting` reads "finance/admin RLS only". That was true when the
--      schema was created and stopped being true on 2026-07-29, when ADR-0050 and ADR-0051 added the
--      manager and supervisor tiers. Re-stated below rather than left to mislead the next reader.
--
-- DOWN: drop function reporting.list_revenue_branches();
--       drop trigger supervisor_revenue_scope_guard on reporting.supervisor_revenue_scope;
--       drop function reporting._guard_supervisor_revenue_scope();
--       drop table reporting.supervisor_revenue_scope cascade;
--       drop table reporting.bom_lines cascade;
--       drop table reporting.ingredient_cost_lines cascade;
--       drop table reporting.sales_margin_daily cascade;
--       drop table reporting.sales_daily_revenue cascade;
--       drop index shared.branches_org_id_key;
--       (reporting.esb_ar_reduction and the schema itself are dropped by ...0005's DOWN, which owns
--        them; `create schema reporting` lives in ...0001 with the other four.)

-- The schema's audience, restated. Six access roles reach `reporting` today, not two: finance and
-- admin read everything; manager reads revenue and margin company-wide (ADR-0050); supervisor reads
-- revenue only, and only within an explicitly granted (channel, branch) scope (ADR-0051). ops_lead
-- and member reach nothing here.
comment on schema reporting is
  'Curated financial read-models snapshotted from the ESB warehouse. Read by finance and admin '
  '(everything), manager (revenue + margin, company-wide) and supervisor (revenue, within a granted '
  'channel/branch scope). No end-user write path exists on any table in it.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 0. The composite-FK target on the branch catalog
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- One index on a `shared` table, authored from the `reporting` pass for a dependency reason — the
-- same class as reporting.esb_ar_reduction in the `mos` pass and integrations.esb_push in the `ops`
-- pass. A composite FK needs a unique index over exactly its referenced columns, and (org_id, id) is
-- meaningful only to the surfaces that link to the catalog while carrying their own org_id. It is
-- redundant with the primary key by content (id alone is already unique) and exists solely so the
-- org seam on the link can be declared rather than triggered.
create unique index branches_org_id_key on shared.branches (org_id, id);
comment on index shared.branches_org_id_key is
  'Composite-FK target for branch links that must stay inside one org (reporting fact rows). '
  'Redundant with the primary key by content; it exists so the org seam is declarative.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. reporting.sales_daily_revenue — the revenue fact
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Snapshot of the warehouse's unified daily revenue view. Grain: org / date / channel / ESB company
-- code / ERP branch code. `channel` is the POS-vs-B2B source field, NOT a Revenue stream — a Revenue
-- stream is a reporting lens (Cafe Ops, Ecommerce, B2B) and does not live on this row.
create table reporting.sales_daily_revenue (
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  revenue_date            date not null,
  channel                 text not null check (btrim(channel) <> ''),
  esb_code                text not null check (btrim(esb_code) <> ''),
  branch_code             text not null check (btrim(branch_code) <> ''),
  branch_name             text,
  -- The propose-not-reject link. Nullable by design and by default; see the header.
  branch_id               uuid,
  transactions            bigint not null default 0 check (transactions >= 0),
  clean_revenue           numeric(14,2) not null default 0,
  snapshot_as_of          timestamptz not null,
  source_contract_version text not null default 'v_daily_revenue_unified.v1',
  loaded_at               timestamptz not null default now(),
  primary key (org_id, revenue_date, channel, esb_code, branch_code),
  constraint sales_daily_revenue_branch_same_org
    foreign key (org_id, branch_id) references shared.branches (org_id, id)
);

comment on table reporting.sales_daily_revenue is
  'Daily sales revenue snapshot from the warehouse''s unified daily-revenue view. Grain: '
  'org/date/channel/ESB code/ERP branch code. Read by finance, admin, manager and scope-granted '
  'supervisors; no end-user write path.';
comment on column reporting.sales_daily_revenue.branch_code is
  'The ERP''s own branch code, stored EXACTLY AS SENT and never validated against MOS''s catalog — '
  'validating it would turn a branch the ERP adds into a failed nightly job (OD-WAY-39).';
comment on column reporting.sales_daily_revenue.branch_id is
  'Propose-not-reject link to shared.branches, NULL until a human confirms the mapping. An unknown '
  'branch_code ingests with this null and no error. When set it must name a branch in the same org, '
  'enforced by the composite FK — which, being MATCH SIMPLE, does not constrain the row at all while '
  'the link is null. This column is what makes production cost and revenue joinable per branch.';
comment on column reporting.sales_daily_revenue.snapshot_as_of is
  'Freshness timestamp shared by every row written in one snapshot run — the as-of a non-live figure must carry.';
comment on column reporting.sales_daily_revenue.source_contract_version is
  'Warehouse-to-reporting contract identifier, so a source-view reshape is visible in the data rather than inferred.';

create index sales_daily_revenue_org_date_idx
  on reporting.sales_daily_revenue (org_id, revenue_date desc);
create index sales_daily_revenue_org_channel_idx
  on reporting.sales_daily_revenue (org_id, channel, revenue_date desc);
-- CARRIED from 20260731000002: without this, list_revenue_branches()'s DISTINCT degenerates to a
-- sequential scan over the org's entire (never-pruned) revenue history on every admin People-page
-- load. The column order is the DISTINCT set AND the ORDER BY, so the planner serves it as a Unique
-- node over an index-only scan.
create index sales_daily_revenue_branch_catalog_idx
  on reporting.sales_daily_revenue (org_id, channel, branch_name, branch_code);
create index sales_daily_revenue_branch_link_idx
  on reporting.sales_daily_revenue (org_id, branch_id);
-- The propose queue: the rows a human still has to map. Partial, so it costs nothing once mapping
-- catches up and stays cheap when a new ERP branch appears.
create index sales_daily_revenue_unlinked_idx
  on reporting.sales_daily_revenue (org_id, branch_code)
  where branch_id is null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. reporting.sales_margin_daily — the interim gross-margin fact
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CARRIED from 20260704000002 with its corrected contract intact. Two things about it are load-
-- bearing and neither is obvious:
--   * NO CHANNEL COLUMN. COGS has no channel dimension upstream, so this table is POS-only. Adding a
--     channel here would invent a figure the warehouse cannot supply.
--   * TWO COGS BASES, NEVER A BARE "COGS". Per the finance doctrine the one actual COGS is the
--     monthly GL reconciliation; `cogs_interim_sm` is the mid-month stock-movement ledger and
--     `cogs_budget_bom` is a recipe budget. The margin computed here is INTERIM and is never
--     presented as certified. The dashboard labels the basis; the schema makes the basis nameable.
create table reporting.sales_margin_daily (
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  margin_date             date not null,
  esb_code                text not null check (btrim(esb_code) <> ''),
  branch_code             text not null check (btrim(branch_code) <> ''),
  branch_name             text,
  branch_id               uuid,
  revenue                 numeric(14,2) not null default 0,
  cogs_interim_sm         numeric(14,2),
  cogs_budget_bom         numeric(14,2),
  margin_interim          numeric(14,2),
  margin_interim_pct      numeric(8,4),
  bom_coverage_pct        numeric(8,4),
  snapshot_as_of          timestamptz not null,
  source_contract_version text not null default 'pos_margin_interim.v1',
  loaded_at               timestamptz not null default now(),
  primary key (org_id, margin_date, esb_code, branch_code),
  constraint sales_margin_daily_branch_same_org
    foreign key (org_id, branch_id) references shared.branches (org_id, id)
);

comment on table reporting.sales_margin_daily is
  'Daily POS gross-margin snapshot. Grain: org/date/ESB code/ERP branch code — no channel, because '
  'COGS has no channel dimension upstream. Interim basis throughout; never a certified actual.';
comment on column reporting.sales_margin_daily.branch_code is
  'The ERP''s own branch code, stored exactly as sent and never validated against MOS''s catalog (OD-WAY-39).';
comment on column reporting.sales_margin_daily.branch_id is
  'Propose-not-reject link to shared.branches, null until mapped. This is the COST side of the '
  'per-branch join: with it set on both facts, cost and revenue resolve through one branch identity.';
comment on column reporting.sales_margin_daily.cogs_interim_sm is
  'Stock-movement POS consumption COGS — INTERIM basis, not GL-certified. Only the monthly GL reconciliation is an actual.';
comment on column reporting.sales_margin_daily.cogs_budget_bom is
  'BOM/recipe-cost COGS — a budget figure, never presented as an actual.';
comment on column reporting.sales_margin_daily.margin_interim is
  'revenue - cogs_interim_sm; NULL when cogs_interim_sm is NULL. A sync gap reads as absent, never as a fake margin.';
comment on column reporting.sales_margin_daily.margin_interim_pct is
  'margin_interim/revenue; NULL when revenue <= 0 or margin_interim is NULL — not 0, not NaN.';
comment on column reporting.sales_margin_daily.bom_coverage_pct is
  'Carried from the source view — the data-quality badge for low BOM-recipe-coverage days. A ratio: summing it is meaningless.';

create index sales_margin_daily_org_date_idx
  on reporting.sales_margin_daily (org_id, margin_date desc);
create index sales_margin_daily_org_esb_idx
  on reporting.sales_margin_daily (org_id, esb_code, margin_date desc);
create index sales_margin_daily_branch_link_idx
  on reporting.sales_margin_daily (org_id, branch_id);
create index sales_margin_daily_unlinked_idx
  on reporting.sales_margin_daily (org_id, branch_code)
  where branch_id is null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The Plan COGS reference tables
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CARRIED from 20260710000001. Reference data in the CONTEXT.md sense: one owning source, many
-- consumers, and consumers LINK by the ERP's ingredient code rather than copying the number into
-- their own artifact. mos.budget_lines stores the code and no cost; mos.capture_budget resolves the
-- cost by joining here and FAILS LOUD on a missing line, which is why this table has to be real
-- rather than optional.
--
-- Neither table carries a branch: an ingredient cost and a recipe are the same at every branch.
-- Nothing to link, so nothing is linked — an empty branch_id here would be structure for a case that
-- does not exist.
create table reporting.ingredient_cost_lines (
  org_id              uuid not null references shared.orgs(id) on delete cascade,
  ingredient_esb_code text not null check (btrim(ingredient_esb_code) <> ''),
  name                text not null check (btrim(name) <> ''),
  unit_cost           numeric(14,4) not null check (unit_cost >= 0),
  unit                text not null check (btrim(unit) <> ''),
  as_of               timestamptz not null,
  loaded_at           timestamptz not null default now(),
  primary key (org_id, ingredient_esb_code)
);
comment on table reporting.ingredient_cost_lines is
  'Ingredient cost line — the budgetary unit cost of one ingredient, snapshotted from the ERP''s '
  'last-known cost. Consumers link by ingredient_esb_code and never copy the number. '
  'mos.capture_budget recomputes every budget total from this table.';
comment on column reporting.ingredient_cost_lines.as_of is
  'When the underlying cost was taken — the visible freshness the Plan surface renders as a stale/fresh badge.';
comment on column reporting.ingredient_cost_lines.loaded_at is
  'When this snapshot row was loaded into MOS. Distinct from as_of: a fresh load of a stale figure is still a stale figure.';

create index ingredient_cost_lines_org_idx on reporting.ingredient_cost_lines (org_id);

create table reporting.bom_lines (
  org_id              uuid not null references shared.orgs(id) on delete cascade,
  menu_item_esb_code  text not null check (btrim(menu_item_esb_code) <> ''),
  ingredient_esb_code text not null check (btrim(ingredient_esb_code) <> ''),
  recipe_qty          numeric(14,4) not null check (recipe_qty > 0),
  qty_unit            text not null check (btrim(qty_unit) <> ''),
  as_of               timestamptz not null,
  loaded_at           timestamptz not null default now(),
  primary key (org_id, menu_item_esb_code, ingredient_esb_code)
);
comment on table reporting.bom_lines is
  'BOM / recipe line (material x qty) per menu item — ERP-owned and READ-ONLY in MOS. MOS reads and '
  'budgets over recipes; it does not edit them, because editing without write-back forks the recipe.';

create index bom_lines_org_menu_idx       on reporting.bom_lines (org_id, menu_item_esb_code);
create index bom_lines_org_ingredient_idx on reporting.bom_lines (org_id, ingredient_esb_code);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. reporting.supervisor_revenue_scope — the per-person revenue grant
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CARRIED from 20260729000004. The substrate behind the supervisor tier: one row per
-- (person, channel, branch_code), with branch_code NULL meaning the whole channel.
--
-- ⚠ PORTED, NOT REDESIGNED. OD-WAY-18 put the shipped model back to the owner and it stands: an
-- EXPLICIT per-person (channel, branch) grant, deliberately not derived from the person's business
-- unit. BU-derivation over-grants for anyone whose remit is narrower than their whole BU, and needs
-- a BU-to-branch map that does not exist — this table's grain is channel plus branch code, with no
-- business-unit dimension at all. Nobody inherits revenue visibility from their org position.
--
-- The nullable branch link is added here for the same reason as on the fact rows: it names the grant
-- in MOS's own vocabulary for the deferred admin screen. It does NOT change who sees what — the
-- revenue policy still matches on branch_code text, deliberately, because matching on branch_id
-- would silently narrow every existing grant whose ERP code has not been mapped yet. Changing who
-- sees what is not this ticket's to do.
create table reporting.supervisor_revenue_scope (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default shared.current_org_id() references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  channel     text not null check (channel in ('POS','B2B')),
  branch_code text,
  branch_id   uuid,
  granted_by  uuid default shared.current_person_id() references shared.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint supervisor_revenue_scope_branch_same_org
    foreign key (org_id, branch_id) references shared.branches (org_id, id)
);
comment on table reporting.supervisor_revenue_scope is
  'Per-person revenue-visibility grants for the supervisor tier. One row per (person, channel, '
  'branch_code); branch_code NULL = the whole channel. Admin writes only. Its SELECT policy is '
  'load-bearing for sales_daily_revenue''s supervisor arm, which resolves a correlated EXISTS over '
  'this table under the querying supervisor''s own RLS.';
comment on column reporting.supervisor_revenue_scope.branch_code is
  'NULL = the whole channel (every branch). Non-null = one ERP branch code, stored as the warehouse '
  'spells it. Not validated against shared.branches: the ERP namespace is not MOS''s to police, and '
  'a grant for a branch the ERP adds tomorrow must not be un-writable. (The earlier note here said '
  'the reason was that no branch table existed. One exists now; the behaviour is unchanged and the '
  'reason above is the one that actually holds.)';
comment on column reporting.supervisor_revenue_scope.branch_id is
  'Propose-not-reject link to shared.branches, null until mapped. Present so the deferred admin '
  'screen can render a grant in MOS''s vocabulary. The revenue policy matches branch_code, not this '
  'column — linking is a labelling step and must not narrow anyone''s existing visibility.';

-- Uniqueness in two halves rather than one constraint: a NULL branch_code means "the whole channel",
-- and NULLs are not equal to each other, so a plain unique(person, channel, branch_code) would let a
-- person collect any number of identical whole-channel grants.
create unique index supervisor_revenue_scope_branch_uniq
  on reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  where branch_code is not null;
create unique index supervisor_revenue_scope_channel_uniq
  on reporting.supervisor_revenue_scope (person_id, channel)
  where branch_code is null;
create index supervisor_revenue_scope_lookup_idx
  on reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code);

-- The guard, with 20260729000005's org-null-safe body folded in. Two jobs: stamp granted_by from the
-- session rather than from what the client sent, and keep a grant inside the caller's org.
--
-- The org check is skipped when current_org_id() is NULL, and the reason is not "be lenient": a NULL
-- org means there is no authenticated session, i.e. the service or seed connection, and there is no
-- "your org" for such a connection to cross. Enforcing it there broke `supabase db reset` and every
-- fresh deploy without closing anything — an authenticated admin session always carries a non-null
-- org claim, so the path this guard exists for is unaffected. SECURITY INVOKER.
create or replace function reporting._guard_supervisor_revenue_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.granted_by := shared.current_person_id();
    if shared.current_org_id() is not null
       and not exists (select 1 from shared.people p
                        where p.id = new.person_id and p.org_id = shared.current_org_id()) then
      raise exception 'person is not in your org' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function reporting._guard_supervisor_revenue_scope() is
  'Guard: a supervisor scope row must target a person in the caller''s org (42501) — enforced only '
  'when current_org_id() is not null, so the service/seed connection is exempt; granted_by is forced '
  'server-side. The row''s own org_id is held by the RLS WITH CHECK, not by this trigger and not by '
  'the column default, which a client can override. SECURITY INVOKER.';

create trigger supervisor_revenue_scope_guard
  before insert on reporting.supervisor_revenue_scope
  for each row execute function reporting._guard_supervisor_revenue_scope();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. reporting.list_revenue_branches() — the admin scope picker's option list
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CARRIED from 20260729000004, signature unchanged. SECURITY INVOKER, so the caller's RLS on the
-- fact table decides what they can enumerate — an admin sees every branch the warehouse has sent,
-- and nobody sees another org's. Never a hardcoded list: a branch the ERP adds shows up here the
-- night it first bills.
--
-- Deliberately NOT widened to return branch_id. Rows for one branch_code can differ in whether they
-- have been mapped yet, so adding the link to this DISTINCT would emit the same branch twice while a
-- mapping is half-applied — a picker that lists "Bungur" twice is worse than one that does not show
-- mapping state. The mapping surface is the deferred admin screen's, and it wants a different query.
create or replace function reporting.list_revenue_branches()
returns table (channel text, branch_code text, branch_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct r.channel, r.branch_code, r.branch_name
  from reporting.sales_daily_revenue r
  where r.org_id = shared.current_org_id()
  order by r.channel, r.branch_name
$$;
comment on function reporting.list_revenue_branches() is
  'Distinct (channel, branch_code, branch_name) for the admin revenue-scope picker. SECURITY '
  'INVOKER — the caller''s RLS on reporting.sales_daily_revenue governs what is enumerable. Never a '
  'hardcoded list. Returns the ERP''s spelling, because that is what a scope grant matches on.';
grant execute on function reporting.list_revenue_branches() to authenticated;
