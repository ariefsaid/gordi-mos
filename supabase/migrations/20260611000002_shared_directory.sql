-- P1-2 — shared directory (OD-P1-1/2/5/7). All ids uuid; all timestamps timestamptz UTC.

-- Orgs: the tenant container (OD-P1-1). orgs has no parent org (ADR-0001 D8).
create table shared.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table shared.orgs is 'Tenant container. One row (Gordi) today; multi-org later = add rows.';

-- Business units (OD-P1-5): the five real operating areas. org-scoped.
create table shared.business_units (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, name)
);
comment on table shared.business_units is 'Gordi operating areas (OD-P1-5). Every task/person belongs to one.';

-- Roles (OD-P0-9a): named positions; reporting line is role->role self-FK.
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
comment on column shared.roles.reports_to_role_id is 'Self-FK: this role reports to that role. Manager chain derives from this (OD-P0-9a).';

-- People (OD-P1-2): exist independent of login; optional unique auth link; soft-archive.
create table shared.people (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  full_name   text not null,
  email       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table shared.people is 'Directory person; may exist before/without a login (OD-P1-2). RACI-referenceable pre-auth.';
-- At most one person per auth user; many person rows may have NULL user_id without colliding.
create unique index people_user_id_unique on shared.people (user_id) where user_id is not null;
create index people_org_idx on shared.people (org_id);

-- person_roles (OD-P1-7): a person may hold several roles. Manager relation unions over these.
create table shared.person_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  role_id     uuid not null references shared.roles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (person_id, role_id)
);
comment on table shared.person_roles is 'Junction: people<->roles, many-to-many (OD-P1-7, dual-hat).';
create index person_roles_role_idx on shared.person_roles (role_id);
create index person_roles_person_idx on shared.person_roles (person_id);
