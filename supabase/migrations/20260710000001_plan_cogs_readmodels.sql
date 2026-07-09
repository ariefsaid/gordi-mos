-- Plan destination COGS read-models (ADR-0022 D2/D6, ADR-0010 OLTP/OLAP split). The ingredient cost
-- line + BOM are MOS-owned REFERENCE DATA whose VALUE basis is ESB `last_hpp` / the ESB BOM — they
-- cross into MOS only as CURATED SNAPSHOTS in reporting read-models (never a live warehouse join).
-- The future warehouse→Supabase snapshot job upserts these tables; in dev they are seeded
-- (supabase/seed.sql) so the Plan surface is real + testable. Wiring the real feed is a drop-in
-- (the DAL + components read these tables unchanged). MOS does NOT write BOMs/cost-lines to ESB.
--
-- Grain (mirrors reporting.sales_*): one current row per (org, key). Snapshot-upserted by composite PK.
-- RLS: finance/admin SELECT (org-scoped) — the Plan surfaces are finance/admin-gated (the consumer
-- broadening to cogs.read is a future slice); reporting_writer FOR-ALL bypass for the snapshot job.

-- ── reporting.ingredient_cost_lines ────────────────────────────────────────────
-- The budgetary unit cost of one ingredient (basis = ESB last_hpp). Finance+Procurement own the
-- numbers; consumers LINK by ingredient_esb_code, never copy (ADR-0022 D6 / anchor A5).
create table reporting.ingredient_cost_lines (
  org_id            uuid not null references shared.orgs(id) on delete cascade,
  ingredient_esb_code text not null check (btrim(ingredient_esb_code) <> ''),
  name              text not null check (btrim(name) <> ''),
  unit_cost         numeric(14,4) not null check (unit_cost >= 0),
  unit              text not null check (btrim(unit) <> ''),
  as_of             timestamptz not null,
  loaded_at         timestamptz not null default now(),
  primary key (org_id, ingredient_esb_code)
);

comment on table reporting.ingredient_cost_lines is
  'Ingredient cost line — budgetary unit cost (basis ESB last_hpp) as a curated snapshot (ADR-0022 D2/D6, ADR-0010). '
  'Finance+Procurement own; consumers link by ingredient_esb_code, never copy (anchor A5). Snapshot-fed; dev-seeded.';
comment on column reporting.ingredient_cost_lines.as_of is
  'When the underlying last_hpp was taken (visible freshness — ADR-0022 D6). Drives the stale/fresh badge.';
comment on column reporting.ingredient_cost_lines.loaded_at is
  'When this snapshot row was loaded into MOS (the snapshot job run time).';

create index ingredient_cost_lines_org_idx on reporting.ingredient_cost_lines (org_id);

-- ── reporting.bom_lines ────────────────────────────────────────────────────────
-- The BOM (recipe: material × qty) for a menu item — ESB-owned, READ-ONLY in MOS (ADR-0022 D3:
-- read-and-budget MVP; no recipe edit). A Budget is MOS's capture costed over this BOM × the linked
-- cost lines. Snapshot-fed like the cost lines.
create table reporting.bom_lines (
  org_id               uuid not null references shared.orgs(id) on delete cascade,
  menu_item_esb_code   text not null check (btrim(menu_item_esb_code) <> ''),
  ingredient_esb_code  text not null check (btrim(ingredient_esb_code) <> ''),
  recipe_qty           numeric(14,4) not null check (recipe_qty > 0),
  qty_unit             text not null check (btrim(qty_unit) <> ''),
  as_of                timestamptz not null,
  loaded_at            timestamptz not null default now(),
  primary key (org_id, menu_item_esb_code, ingredient_esb_code)
);

comment on table reporting.bom_lines is
  'BOM / recipe line (material × qty) per menu item — ESB-owned, READ-ONLY in MOS (ADR-0022 D3 read-and-budget). '
  'Snapshot-fed; dev-seeded. A Budget is costed over this BOM × the linked ingredient cost lines.';

create index bom_lines_org_menu_idx on reporting.bom_lines (org_id, menu_item_esb_code);
create index bom_lines_org_ingredient_idx on reporting.bom_lines (org_id, ingredient_esb_code);

-- ── Grants + RLS (clone of reporting.sales_margin_daily) ───────────────────────
grant select on reporting.ingredient_cost_lines to authenticated;
grant select on reporting.bom_lines to authenticated;
grant select, insert, update, delete on reporting.ingredient_cost_lines to service_role;
grant select, insert, update, delete on reporting.bom_lines to service_role;

alter table reporting.ingredient_cost_lines enable row level security;
alter table reporting.ingredient_cost_lines force  row level security;
alter table reporting.bom_lines enable row level security;
alter table reporting.bom_lines force  row level security;

create policy ingredient_cost_lines_select_finance_admin
  on reporting.ingredient_cost_lines
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );

create policy bom_lines_select_finance_admin
  on reporting.bom_lines
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );

-- Scoped snapshot-writer bypass for FORCE RLS (the future warehouse→Supabase job; no end-user exposure).
grant usage on schema reporting to reporting_writer;
grant select, insert, update on reporting.ingredient_cost_lines to reporting_writer;
grant select, insert, update on reporting.bom_lines to reporting_writer;

create policy ingredient_cost_lines_write_reporting_writer
  on reporting.ingredient_cost_lines
  for all to reporting_writer
  using (true)
  with check (true);

create policy bom_lines_write_reporting_writer
  on reporting.bom_lines
  for all to reporting_writer
  using (true)
  with check (true);

comment on policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines is
  'Scoped snapshot-writer role bypass for FORCE RLS (warehouse→Supabase job). No SELECT-policy exposure to end users.';
comment on policy bom_lines_write_reporting_writer on reporting.bom_lines is
  'Scoped snapshot-writer role bypass for FORCE RLS (warehouse→Supabase job). No SELECT-policy exposure to end users.';

-- DOWN:
-- drop policy if exists bom_lines_write_reporting_writer on reporting.bom_lines;
-- drop policy if exists ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines;
-- revoke select, insert, update on reporting.bom_lines from reporting_writer;
-- revoke select, insert, update on reporting.ingredient_cost_lines from reporting_writer;
-- revoke usage on schema reporting from reporting_writer;  -- shared with other reporting tables; drop only if the last reporting table goes
-- drop policy if exists bom_lines_select_finance_admin on reporting.bom_lines;
-- drop policy if exists ingredient_cost_lines_select_finance_admin on reporting.ingredient_cost_lines;
-- alter table reporting.bom_lines no force row level security;
-- alter table reporting.bom_lines disable row level security;
-- alter table reporting.ingredient_cost_lines no force row level security;
-- alter table reporting.ingredient_cost_lines disable row level security;
-- revoke select, insert, update, delete on reporting.bom_lines from service_role;
-- revoke select, insert, update, delete on reporting.ingredient_cost_lines from service_role;
-- revoke select on reporting.bom_lines from authenticated;
-- revoke select on reporting.ingredient_cost_lines from authenticated;
-- drop table reporting.bom_lines cascade;
-- drop table reporting.ingredient_cost_lines cascade;
