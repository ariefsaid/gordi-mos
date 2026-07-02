-- Reporting sales read-model (OD-P4-2 / ADR-0010 D5 / ADR-0017 D3).
-- Curated, snapshot-fed financial aggregate. Source of truth remains the ESB warehouse.
create schema if not exists reporting;

comment on schema reporting is
  'Curated financial read-models copied from the ESB warehouse; finance/admin RLS only.';

grant usage on schema reporting to authenticated, service_role;

create table reporting.sales_daily_revenue (
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  revenue_date            date not null,
  channel                 text not null check (btrim(channel) <> ''),
  esb_code                text not null check (btrim(esb_code) <> ''),
  branch_code             text not null check (btrim(branch_code) <> ''),
  branch_name             text,
  transactions            bigint not null default 0 check (transactions >= 0),
  clean_revenue           numeric(14,2) not null default 0,
  snapshot_as_of          timestamptz not null,
  source_contract_version text not null default 'v_daily_revenue_unified.v1',
  loaded_at               timestamptz not null default now(),
  primary key (org_id, revenue_date, channel, esb_code, branch_code)
);

comment on table reporting.sales_daily_revenue is
  'Daily sales revenue snapshot from warehouse view public.v_daily_revenue_unified. Grain: org/date/channel/ESB/branch.';
comment on column reporting.sales_daily_revenue.snapshot_as_of is
  'Freshness timestamp shared by every row written in one snapshot run.';
comment on column reporting.sales_daily_revenue.source_contract_version is
  'Warehouse-to-reporting contract identifier. Initial contract: v_daily_revenue_unified.v1.';

create index sales_daily_revenue_org_date_idx
  on reporting.sales_daily_revenue (org_id, revenue_date desc);
create index sales_daily_revenue_org_channel_idx
  on reporting.sales_daily_revenue (org_id, channel, revenue_date desc);

grant select on reporting.sales_daily_revenue to authenticated;
grant select, insert, update, delete on reporting.sales_daily_revenue to service_role;

alter table reporting.sales_daily_revenue enable row level security;
alter table reporting.sales_daily_revenue force row level security;

create policy sales_daily_revenue_select_finance_admin
  on reporting.sales_daily_revenue
  for select
  to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
    )
  );

-- DOWN: drop policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue;
--       drop table reporting.sales_daily_revenue cascade;
--       revoke usage on schema reporting from authenticated, service_role;
--       drop schema reporting;
