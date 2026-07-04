-- reporting.sales_margin_daily read-model (ADR-0018 D6 prereq / ADR-0010 D5 / ADR-0019 D3).
-- Clone of reporting.sales_daily_revenue shape; finance/admin RLS; reporting_writer FOR-ALL bypass.
--
-- §7a AMENDMENT (2026-07-04, Director) — CORRECTED CONTRACT (supersedes the plan's original §3.2):
-- v_daily_cogs_comparison is a diagnostic view with NO revenue/channel/branch_name and covers POS only
-- (COGS has no channel dimension upstream). Per the finance doctrine (gordi-esb-bak
-- COGS-REPORT-WORKFLOW.md): the ONE actual COGS is the monthly GL-account-5 reconciliation; BOM is a
-- budget figure, never an actual; mid-month stock-movement COGS is INTERIM/not-yet-reconciled and must
-- be labeled so. This table therefore has no `channel` column (POS-only), carries both COGS bases
-- (`cogs_interim_sm` stock-movement, `cogs_budget_bom` recipe/BOM budget) plus a `bom_coverage_pct`
-- data-quality badge, and computes only the interim margin (never presented as a certified actual).
create table reporting.sales_margin_daily (
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  margin_date             date not null,
  esb_code                text not null check (btrim(esb_code) <> ''),
  branch_code             text not null check (btrim(branch_code) <> ''),
  branch_name             text,
  revenue                 numeric(14,2) not null default 0,
  cogs_interim_sm         numeric(14,2),
  cogs_budget_bom         numeric(14,2),
  margin_interim          numeric(14,2),
  margin_interim_pct      numeric(8,4),
  bom_coverage_pct        numeric(8,4),
  snapshot_as_of          timestamptz not null,
  source_contract_version text not null default 'pos_margin_interim.v1',
  loaded_at               timestamptz not null default now(),
  primary key (org_id, margin_date, esb_code, branch_code)
);

comment on table reporting.sales_margin_daily is
  'Daily POS gross-margin snapshot joining warehouse views public.v_daily_revenue_unified (channel=POS) '
  'and public.v_daily_cogs_comparison. Grain: org/date/ESB/branch (no channel — COGS is POS-only today).';
comment on column reporting.sales_margin_daily.cogs_interim_sm is
  'Stock-movement POS consumption COGS — INTERIM basis, not GL-certified (finance doctrine: only the '
  'monthly GL reconciliation is an actual).';
comment on column reporting.sales_margin_daily.cogs_budget_bom is
  'BOM/recipe-cost COGS — a budget figure, never presented as an actual.';
comment on column reporting.sales_margin_daily.margin_interim is
  'revenue - cogs_interim_sm; NULL when cogs_interim_sm is NULL (sync gap, never a fake margin).';
comment on column reporting.sales_margin_daily.margin_interim_pct is
  'margin_interim/revenue; NULL when revenue <= 0 or margin_interim is NULL (not 0/NaN).';
comment on column reporting.sales_margin_daily.bom_coverage_pct is
  'Carried from the source view — the data-quality badge for low BOM-recipe-coverage days.';

create index sales_margin_daily_org_date_idx
  on reporting.sales_margin_daily (org_id, margin_date desc);
create index sales_margin_daily_org_esb_idx
  on reporting.sales_margin_daily (org_id, esb_code, margin_date desc);

grant select on reporting.sales_margin_daily to authenticated;
grant select, insert, update, delete on reporting.sales_margin_daily to service_role;

alter table reporting.sales_margin_daily enable row level security;
alter table reporting.sales_margin_daily force row level security;

create policy sales_margin_daily_select_finance_admin
  on reporting.sales_margin_daily
  for select
  to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
    )
  );

-- Sec-M1 mirror: scoped writer bypass for FORCE RLS (single-org snapshot job; no end-user exposure).
grant usage on schema reporting to reporting_writer;
grant select, insert, update on reporting.sales_margin_daily to reporting_writer;

-- PG17: role membership no longer implies SET privilege by default (per-membership `SET` option,
-- separate from `INHERIT`). `postgres` already held admin_option on `reporting_writer` (granted at
-- CREATE ROLE time by 20260704000001) but not the SET option, so local pgTAP's `set local role
-- reporting_writer` (proving AC-M07) was denied. Grant SET explicitly — idempotent, local/CI-only
-- concern (the snapshot job on the VPS connects directly as reporting_writer, never via SET ROLE).
grant reporting_writer to postgres with set true;

-- pgTAP's assertion functions (lives_ok etc.) live in schema `extensions`; reporting_writer needs
-- USAGE there to prove AC-M07 under `set local role reporting_writer` in local/CI test runs.
grant usage on schema extensions to reporting_writer;

create policy sales_margin_daily_write_reporting_writer
  on reporting.sales_margin_daily
  for all
  to reporting_writer
  using (true)
  with check (true);

comment on policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily is
  'Scoped snapshot-writer role bypass for FORCE RLS. Grain-narrowing happens at the app/query layer '
  '(single-org snapshot job); this role has no SELECT-policy exposure to end users.';

-- DOWN: drop policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily;
--       drop policy sales_margin_daily_select_finance_admin on reporting.sales_margin_daily;
--       revoke select, insert, update on reporting.sales_margin_daily from reporting_writer;
--       revoke usage on schema reporting from reporting_writer;
--       drop table reporting.sales_margin_daily cascade;
