-- Certified-metric registry (ADR-0022 D6 / CONTEXT "Certified metric" / anchor A7 / decisions.md
-- "Certified metrics" grill). A table of blessed metric DEFINITIONS (name / meaning / unit / grain)
-- that every composer reads the same way — the guard against "my COGS ≠ your COGS." Finance certifies;
-- MIGRATION-SEEDED (NO runtime CRUD UI — same discipline as shared.role_capabilities: a figure's
-- certified definition is code-owned reference data). A figure whose definition is uncertified OR whose
-- cost basis is stale renders a fail-loud badge and the pricing pre-flight warns against it.
--
-- Lives in mos (MOS-owned reference data), not reporting (it is not a financial figure fed from ESB —
-- it is the blessed DEFINITION of a figure). Read by finance/admin in this slice; the fail-loud badge
-- is rendered on the finance/admin-gated Plan surfaces.

create table mos.certified_metrics (
  key           text not null check (btrim(key) <> ''),
  org_id        uuid not null references shared.orgs(id) on delete cascade
                  default shared.current_org_id(),
  name          text not null check (btrim(name) <> ''),
  meaning       text not null check (btrim(meaning) <> ''),
  unit          text not null check (btrim(unit) <> ''),
  grain         text not null check (btrim(grain) <> ''),
  certified     boolean not null default true,
  certified_at  timestamptz,
  certified_by  uuid references shared.people(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (org_id, key)
);

comment on table mos.certified_metrics is
  'Certified-metric registry — blessed figure definitions (name/meaning/unit/grain), Finance-certified, '
  'migration-seeded (ADR-0022 D6 / anchor A7). No runtime CRUD UI. An uncertified definition or a stale '
  'cost basis renders a fail-loud badge. org_id seam (registry is org-scoped; key is stable within org).';
comment on column mos.certified_metrics.certified is
  'True when Finance has blessed this definition. False/absent renders the fail-loud uncertified badge.';
comment on column mos.certified_metrics.key is
  'The blessed metric key a Budget/cost surface references (e.g. cogs.budgeted). Single source of truth for the definition.';

create index certified_metrics_org_idx on mos.certified_metrics (org_id);

create trigger certified_metrics_set_updated_at
  before update on mos.certified_metrics
  for each row execute function shared.set_updated_at();

-- ── Seed: the two metrics this slice's surfaces reference (Finance-certified) ──
-- Migrations run before supabase/seed.sql on a fresh local reset, so the real Gordi org may not exist yet.
-- Seed every org that exists at migration time (notably the committed test orgs), and seed.sql repeats the
-- same rows for the Gordi dev org after it creates that org. The registry remains migration/seed-owned —
-- there is no runtime CRUD policy.
insert into mos.certified_metrics (key, org_id, name, meaning, unit, grain, certified, certified_at)
select v.key, o.id, v.name, v.meaning, v.unit, v.grain, true, now()
from shared.orgs o
cross join (values
  (
    'cogs.budgeted',
    'Budgeted COGS', 'A menu item''s BOM (recipe qty x materials) costed at the linked ingredient cost lines (last_hpp) — the certified budgeted COGS pricing/budgeting consume (ADR-0022 D1).',
    'IDR', 'menu item'
  ),
  (
    'margin.gross_pct',
    'Gross margin %', 'Projected gross margin at a candidate price vs the linked certified budgeted COGS — (price - cogs) / price. Read-only pre-flight; MOS never sets the price (ADR-0022 D5).',
    'percent', 'menu item x price'
  )
) as v(key, name, meaning, unit, grain)
on conflict (org_id, key) do nothing;

-- ── Grants + RLS ───────────────────────────────────────────────────────────────
-- Reference data the client reads to render the fail-loud badge. SELECT finance/admin (org-scoped);
-- NO insert/update/delete grant + NO such policy -> only service_role (RLS-bypass / migration) mutates.
grant select on mos.certified_metrics to authenticated;

alter table mos.certified_metrics enable row level security;
alter table mos.certified_metrics force  row level security;

create policy certified_metrics_select_finance_admin
  on mos.certified_metrics
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );

-- DOWN:
-- drop policy if exists certified_metrics_select_finance_admin on mos.certified_metrics;
-- alter table mos.certified_metrics no force row level security;
-- alter table mos.certified_metrics disable row level security;
-- revoke select on mos.certified_metrics from authenticated;
-- drop trigger if exists certified_metrics_set_updated_at on mos.certified_metrics;
-- drop table mos.certified_metrics cascade;
