-- Read-only recipe/stock evidence and its last capture receipt.
-- DOWN: drop table reporting.recipe_deduction_findings;
--       drop table reporting.recipe_finding_snapshots;

create table reporting.recipe_deduction_findings (
  org_id uuid not null references shared.orgs(id) on delete restrict,
  finding_id text not null check (btrim(finding_id) <> ''),
  day date not null,
  esb_code text not null check (btrim(esb_code) <> ''),
  branch_code text not null check (btrim(branch_code) <> ''),
  branch_name text,
  branch_id uuid,
  menu_id integer,
  menu_name text,
  bom_id integer,
  recipe_line_id integer,
  expected_detail_id integer,
  expected_name text,
  expected_unit text,
  expected_qty numeric,
  actual_detail_id integer,
  actual_name text,
  actual_unit text,
  actual_qty_day numeric,
  actual_cost_day numeric,
  expected_qty_day_comparable numeric,
  actual_qty_day_comparable numeric,
  comparison_unit text,
  conversion_evidence jsonb not null default '{}' check (jsonb_typeof(conversion_evidence) = 'object'),
  classification text not null check (classification in ('warehouse_artefact','team_input','esb_system')),
  rule text not null,
  confidence text not null,
  impact_idr numeric,
  impact_basis text not null,
  needs_human boolean not null,
  recommended_check text not null,
  recipe_version integer,
  recipe_version_hash text,
  recipe_edited_at timestamptz,
  recipe_observed_at timestamptz,
  prior_recipe_version_hash text,
  prior_recipe_observed_at timestamptz,
  first_sale_at timestamptz,
  sale_time_precision text,
  eligibility_population text,
  eligibility_reason text,
  source_checked_at timestamptz not null,
  refreshed_at timestamptz not null,
  replica_stale boolean not null,
  algorithm_version text not null,
  snapshot_as_of timestamptz not null,
  source_contract_version text not null,
  loaded_at timestamptz not null default now(),
  primary key (org_id, esb_code, finding_id),
  foreign key (org_id, branch_id) references shared.branches(org_id, id),
  foreign key (org_id, esb_code, menu_id, recipe_version)
    references reporting.recipe_versions(org_id, esb_code, menu_id, version)
);
comment on table reporting.recipe_deduction_findings is
  'Warehouse rule evidence. Expected and actual comparable quantities are whole ingredient-day context, repeated per menu and non-additive. Classes are leads, not confirmed fault.';
comment on column reporting.recipe_deduction_findings.recipe_version is
  'Latest MOS-observed recipe version on or before the finding day. NULL before retained history; not proof of the recipe effective at sale time. The compared warehouse hash is kept separately.';
create index recipe_findings_branch_day_idx
  on reporting.recipe_deduction_findings(org_id, branch_code, day desc, impact_idr desc nulls last, finding_id);

create table reporting.recipe_finding_snapshots (
  org_id uuid not null references shared.orgs(id) on delete restrict,
  esb_code text not null check (btrim(esb_code) <> ''),
  window_start date not null,
  window_end date not null check (window_end >= window_start),
  snapshot_as_of timestamptz not null,
  source_completed_at timestamptz,
  complete boolean not null,
  primary key (org_id, esb_code),
  check (not complete or source_completed_at is not null)
);
comment on table reporting.recipe_finding_snapshots is
  'Last attempted bounded register copy per company. A completed source pass permits replacing its window, including an empty result. An incomplete pass preserves last-good findings. Receipt is not a historical source freshness certificate.';

revoke all on reporting.recipe_deduction_findings, reporting.recipe_finding_snapshots
  from public, anon, authenticated, service_role, reporting_writer;
grant select on reporting.recipe_deduction_findings, reporting.recipe_finding_snapshots to authenticated;
grant select, insert, update, delete on reporting.recipe_deduction_findings, reporting.recipe_finding_snapshots to reporting_writer;
alter table reporting.recipe_deduction_findings enable row level security;
alter table reporting.recipe_deduction_findings force row level security;
alter table reporting.recipe_finding_snapshots enable row level security;
alter table reporting.recipe_finding_snapshots force row level security;

create policy recipe_findings_read on reporting.recipe_deduction_findings for select to authenticated
using (org_id = (SELECT shared.current_org_id()) and (
  (SELECT shared.has_access_role('finance')) or (SELECT shared.has_access_role('manager'))
  or (SELECT shared.has_access_role('ops_lead'))));
create policy recipe_findings_writer on reporting.recipe_deduction_findings for all to reporting_writer
using (org_id = (SELECT reporting.current_writer_org()))
with check (org_id = (SELECT reporting.current_writer_org()));
create policy recipe_finding_snapshots_read on reporting.recipe_finding_snapshots for select to authenticated
using (org_id = (SELECT shared.current_org_id()) and (
  (SELECT shared.has_access_role('finance')) or (SELECT shared.has_access_role('manager'))
  or (SELECT shared.has_access_role('ops_lead'))));
create policy recipe_finding_snapshots_writer on reporting.recipe_finding_snapshots for all to reporting_writer
using (org_id = (SELECT reporting.current_writer_org()))
with check (org_id = (SELECT reporting.current_writer_org()));
