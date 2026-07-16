-- Step 4 (ADR-0050 D1/D2): the minimal Team substrate under BU. Seeded, not admin-CRUD (OD-52).
-- shared.sites (physical branch) · shared.teams (concrete group under one BU) · shared.team_memberships
-- (effective-dated Person↔Team). Plus shared.business_units.signal_visibility_rank (D2, fail-closed 0).
-- Reversible: manual DOWN at foot; pre-prod `supabase db reset`.

create table shared.sites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  name        text not null check (btrim(name) <> ''),
  code        text not null check (btrim(code) <> ''),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, code)
);
create index sites_org_idx on shared.sites (org_id);

create table shared.teams (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  business_unit_id uuid not null references shared.business_units(id),
  site_id          uuid references shared.sites(id),
  name             text not null check (btrim(name) <> ''),
  code             text not null check (btrim(code) <> ''),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, code)
);
create index teams_org_idx on shared.teams (org_id);
create index teams_business_unit_idx on shared.teams (business_unit_id);
create index teams_active_org_idx on shared.teams (org_id) where archived_at is null;

create table shared.team_memberships (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  person_id      uuid not null references shared.people(id) on delete cascade,
  team_id        uuid not null references shared.teams(id) on delete cascade,
  is_primary     boolean not null default false,
  effective_from date not null default current_date,
  effective_to   date,
  created_at     timestamptz not null default now()
);
create unique index team_memberships_one_primary
  on shared.team_memberships (person_id) where is_primary and effective_to is null;
create index team_memberships_team_idx   on shared.team_memberships (team_id);
create index team_memberships_person_idx on shared.team_memberships (person_id);

alter table shared.business_units add column if not exists signal_visibility_rank int;
comment on column shared.business_units.signal_visibility_rank is
  'ADR-0050 D2: upward-reach layer for Signals. NULL ⇒ 0 (lowest). Higher = broader default reach. Fail-closed: all NULL ships no cross-BU reach until admin config (OD-52).';

create trigger sites_set_updated_at before update on shared.sites
  for each row execute function shared.set_updated_at();
create trigger teams_set_updated_at before update on shared.teams
  for each row execute function shared.set_updated_at();

-- Structure seed (idempotent; resolves BU by stable `code`). Repeated in seed.sql for fresh-reset parity
-- (same dual-seed pattern as certified_metrics — migration seeds existing orgs; seed.sql re-seeds Gordi).
do $$
declare o record;
begin
  for o in select id as org_id from shared.orgs loop
    insert into shared.sites (id, org_id, name, code) values
      (gen_random_uuid(), o.org_id, 'Gordi HQ', 'gordi_hq'),
      (gen_random_uuid(), o.org_id, 'Radiant',  'radiant'),
      (gen_random_uuid(), o.org_id, 'Roastery', 'roastery')
    on conflict (org_id, code) do nothing;
    -- one Team per live BU; Retail Ops splits HQ Operations / Radiant Operations / Ecommerce; B2B Ops = Roastery.
    insert into shared.teams (id, org_id, business_unit_id, site_id, name, code)
    select gen_random_uuid(), o.org_id, bu.id,
           (select s.id from shared.sites s where s.org_id = o.org_id and s.code = t.site_code),
           t.name, t.code
    from (values
      ('retail_ops','HQ Operations','hq_operations','gordi_hq'),
      ('retail_ops','Radiant Operations','radiant_operations','radiant'),
      ('retail_ops','Ecommerce Team','ecommerce_team',null),
      ('b2b_ops','Roastery Team','roastery_team','roastery'),
      ('b2b_sales','B2B Sales Team','b2b_sales_team',null),
      ('marketing','Marketing Team','marketing_team',null),
      ('hr','HR Team','hr_team',null),
      ('finance','Finance Team','finance_team',null)
    ) as t(bu_code,name,code,site_code)
    join shared.business_units bu on bu.org_id = o.org_id and bu.code = t.bu_code and bu.archived_at is null
    on conflict (org_id, code) do nothing;
  end loop;
end $$;

-- RLS: org-readable reference data (teams/sites/memberships are directory-grade, like business_units/people).
grant select on shared.sites, shared.teams, shared.team_memberships to authenticated;
alter table shared.sites enable row level security;             alter table shared.sites force row level security;
alter table shared.teams enable row level security;             alter table shared.teams force row level security;
alter table shared.team_memberships enable row level security;  alter table shared.team_memberships force row level security;
create policy sites_select_org on shared.sites for select to authenticated using (org_id = shared.current_org_id());
create policy teams_select_org on shared.teams for select to authenticated using (org_id = shared.current_org_id());
create policy team_memberships_select_org on shared.team_memberships for select to authenticated using (org_id = shared.current_org_id());
-- no insert/update/delete policy or grant → only service_role writes (seed/Admin-later).

-- DOWN (manual, pre-production):
-- drop policy if exists team_memberships_select_org on shared.team_memberships;
-- drop policy if exists teams_select_org on shared.teams;
-- drop policy if exists sites_select_org on shared.sites;
-- alter table shared.business_units drop column if exists signal_visibility_rank;
-- drop table if exists shared.team_memberships cascade;
-- drop table if exists shared.teams cascade;
-- drop table if exists shared.sites cascade;
