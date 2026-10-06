-- reporting.ingredient_usage_daily — the nightly ingredient-usage copy behind the yield measures
-- (drinks per kg of coffee, per litre of milk). The snapshot job (scripts/reporting_snapshot.py)
-- fills it; nothing reads it yet: yield is not shown until actual consumption from the daily stock
-- count exists (owner ruling, Month 2 grill).
--
-- Access is the branch-cost tier: finance and manager of the row's own org read it, exactly as
-- reporting.sales_margin_daily. No app session has a write privilege; the snapshot writer upserts
-- only the org its run declared (reporting.current_writer_org()). Proof:
-- supabase/tests/reporting_09_ingredient_usage.sql.
--
-- DOWN:
--   drop table if exists reporting.ingredient_usage_daily;

create table reporting.ingredient_usage_daily (
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  usage_date              date not null,
  esb_code                text not null check (btrim(esb_code) <> ''),
  branch_code             text not null check (btrim(branch_code) <> ''),
  branch_id               uuid,
  ingredient_detail_id    text not null check (btrim(ingredient_detail_id) <> ''),
  ingredient_name         text,
  source_unit             text not null check (btrim(source_unit) <> ''),
  unit_basis              text not null check (unit_basis in ('kg', 'l', 'each')),
  source_qty              numeric(18,6) not null check (source_qty >= 0),
  qty_used                numeric(18,6) not null check (qty_used >= 0),
  menu_units              numeric(14,4) not null check (menu_units >= 0),
  recipe_coverage         numeric(6,4) check (recipe_coverage between 0 and 1),
  snapshot_as_of          timestamptz not null,
  source_contract_version text not null default 'ingredient_usage_daily.v1',
  loaded_at               timestamptz not null default now(),
  primary key (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit),
  constraint ingredient_usage_daily_branch_same_org
    foreign key (org_id, branch_id) references shared.branches (org_id, id)
);

comment on table reporting.ingredient_usage_daily is
  'Recipe-based ingredient usage per branch and day: units sold times each recipe line, grouped by '
  'the ERP product detail id. A recipe figure, not measured consumption.';
comment on column reporting.ingredient_usage_daily.branch_id is
  'Propose-not-reject link to shared.branches, null until mapped (as on sales_margin_daily).';
comment on column reporting.ingredient_usage_daily.ingredient_detail_id is
  'The ERP product detail id of the ingredient: its identity. The name is display only.';
comment on column reporting.ingredient_usage_daily.source_unit is
  'The recipe line''s unit exactly as the ERP sends it.';
comment on column reporting.ingredient_usage_daily.unit_basis is
  'What qty_used is counted in: kg, l, or each for count units that have no weight.';
comment on column reporting.ingredient_usage_daily.source_qty is
  'Recipe quantity used, in source_unit.';
comment on column reporting.ingredient_usage_daily.qty_used is
  'Recipe quantity used, converted to unit_basis.';
comment on column reporting.ingredient_usage_daily.menu_units is
  'Menu units sold that day whose recipe uses this ingredient — the drinks or dishes it went into.';
comment on column reporting.ingredient_usage_daily.recipe_coverage is
  'Branch-day share of units sold that have a recipe, repeated on each of that day''s rows. A ratio: '
  'summing it is meaningless. Null when nothing was sold.';

create index ingredient_usage_daily_branch_window_idx
  on reporting.ingredient_usage_daily (org_id, esb_code, branch_code, usage_date desc);
create index ingredient_usage_daily_branch_link_idx
  on reporting.ingredient_usage_daily (org_id, branch_id);

grant select on reporting.ingredient_usage_daily to authenticated;
grant select, insert, update, delete on reporting.ingredient_usage_daily to service_role;
grant select, insert, update on reporting.ingredient_usage_daily to reporting_writer;

alter table reporting.ingredient_usage_daily enable row level security;
alter table reporting.ingredient_usage_daily force  row level security;

create policy ingredient_usage_daily_select on reporting.ingredient_usage_daily
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (
      (select shared.has_access_role('finance'))
      or (select shared.has_access_role('manager'))
    )
  );
comment on policy ingredient_usage_daily_select on reporting.ingredient_usage_daily is
  'Same-org SELECT for finance and manager, the tiers that read branch cost. Supervisor and admin '
  'are absent, as on sales_margin_daily.';

create policy ingredient_usage_daily_write_reporting_writer on reporting.ingredient_usage_daily
  for all to reporting_writer
  using      (org_id = reporting.current_writer_org())
  with check (org_id = reporting.current_writer_org());
comment on policy ingredient_usage_daily_write_reporting_writer on reporting.ingredient_usage_daily is
  'The snapshot job''s upsert path, scoped to the org the run declared in app.reporting_org; see '
  'sales_daily_revenue_write_reporting_writer for why FOR ALL and why USING is scoped too.';
