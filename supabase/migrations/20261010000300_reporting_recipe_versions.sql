-- Recipe history extends the reporting recipe references with retained warehouse envelopes.
-- DOWN (remove the history feature; the existing recipe references are unchanged):
--   drop function reporting.recipe_version_on_date(uuid, text, integer, date);
--   drop table reporting.recipe_versions;
--   drop function reporting._reject_recipe_version_mutation();

create table reporting.recipe_versions (
  org_id uuid not null references shared.orgs(id) on delete restrict,
  esb_code text not null check (btrim(esb_code) <> ''),
  menu_id integer not null,
  bom_id integer,
  version integer not null check (version > 0),
  warehouse_version_hash text not null check (btrim(warehouse_version_hash) <> ''),
  recipe jsonb not null check (
    (jsonb_typeof(recipe) = 'object' and jsonb_typeof(recipe -> 'lines') = 'array') is true
  ),
  first_seen date not null,
  source_observed_at timestamptz not null,
  loaded_at timestamptz not null default now(),
  primary key (org_id, esb_code, menu_id, version)
);
comment on table reporting.recipe_versions is
  'Append-only history of the reporting recipe references, copied from warehouse observations. '
  'Company/menu identifies a chronology; each version retains its BOM mapping, lines and warehouse hash.';
comment on column reporting.recipe_versions.first_seen is
  'MOS observation date in Asia/Jakarta, not a backdated ERP effective date. No history is claimed before the first version.';
comment on column reporting.recipe_versions.recipe is
  'Unaltered warehouse recipe envelope, including ingredient quantities, recorded units and active flags. No costs or inferred conversions.';

create index recipe_versions_on_date_idx
  on reporting.recipe_versions (org_id, esb_code, menu_id, first_seen desc, version desc);

revoke all on reporting.recipe_versions from public, anon, authenticated, service_role, reporting_writer;
grant select on reporting.recipe_versions to authenticated;
grant select, insert on reporting.recipe_versions to reporting_writer;
alter table reporting.recipe_versions enable row level security;
alter table reporting.recipe_versions force row level security;

create policy recipe_versions_select_org on reporting.recipe_versions
  for select to authenticated
  using (org_id = (SELECT shared.current_org_id()));
comment on policy recipe_versions_select_org on reporting.recipe_versions is
  'Same org-readable contract as Cafe items (ops.wip_items); recipe history contains no ingredient costs.';
create policy recipe_versions_select_writer on reporting.recipe_versions
  for select to reporting_writer
  using (org_id = (SELECT reporting.current_writer_org()));
create policy recipe_versions_insert_writer on reporting.recipe_versions
  for insert to reporting_writer
  with check (org_id = (SELECT reporting.current_writer_org()));

create function reporting._reject_recipe_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Recipe versions are append-only' using errcode = '55000';
end;
$$;
revoke execute on function reporting._reject_recipe_version_mutation() from public, anon, authenticated, service_role, reporting_writer;
create trigger recipe_versions_immutable
  before update or delete or truncate on reporting.recipe_versions
  for each statement execute function reporting._reject_recipe_version_mutation();

create function reporting.recipe_version_on_date(
  p_org_id uuid, p_esb_code text, p_menu_id integer, p_date date
)
returns setof reporting.recipe_versions
language sql
stable
security invoker
set search_path = ''
as $$
  select v.* from reporting.recipe_versions v
  where v.org_id = p_org_id and v.esb_code = p_esb_code and v.menu_id = p_menu_id
    and v.first_seen <= p_date
  order by v.first_seen desc, v.version desc
  limit 1;
$$;
revoke execute on function reporting.recipe_version_on_date(uuid, text, integer, date) from public, anon, service_role, reporting_writer;
grant execute on function reporting.recipe_version_on_date(uuid, text, integer, date) to authenticated;
comment on function reporting.recipe_version_on_date(uuid, text, integer, date) is
  'Recipe observed in MOS on or before the requested day, under caller RLS. Same-day versions resolve to the last version; dates before history return no row.';
