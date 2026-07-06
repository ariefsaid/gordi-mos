-- Work spine v1 (ADR-0020 D4, FR-332): the minimal capability substrate.
-- shared.role_capabilities (global seed) + shared.can(capability). SECURITY INVOKER STABLE
-- set search_path='' — mirrors has_access_role (no DEFINER -> definer-revoke lint clean).
-- First consumer: mos.objectives / mos.work_lines write policies (next migration).

create table shared.role_capabilities (
  id          uuid primary key default gen_random_uuid(),
  role        text not null check (role in ('admin','ops_lead','finance','member')),
  capability  text not null check (btrim(capability) <> ''),
  scope       text not null check (scope in ('org','own_bu')) default 'org',
  created_at  timestamptz not null default now(),
  unique (role, capability)
);
comment on table shared.role_capabilities is
  'Capability grants per access role (ADR-0020 D3/D4). v1 = global seed (migration-only writes); per-org role management + the renameable registry land with the admin-editable-roles slice. scope recorded for the own_bu upgrade; all v1 grants are org.';

create index role_capabilities_role_idx on shared.role_capabilities (role);

-- FR-332 seed: admin -> both manage caps; ops_lead -> workline.manage; member/finance -> none.
insert into shared.role_capabilities (role, capability, scope) values
  ('admin',    'objective.manage', 'org'),
  ('admin',    'workline.manage',  'org'),
  ('ops_lead', 'workline.manage',  'org');

-- can(capability): true iff the session holds ANY access_role granted that capability.
-- Resolves from current_access_roles() (the SAME unspoofable JWT source has_access_role uses).
-- SECURITY INVOKER: runs as the RLS caller (authenticated); reads only current_access_roles()
-- (a claim helper) + role_capabilities (SELECT granted to authenticated below). search_path=''
-- is safe — every ref is schema-qualified. No DEFINER -> definer-revoke CI lint is clean.
-- (The own_bu scope is handled by a future can_in_bu(capability, bu_id) sibling, not here.)
create or replace function shared.can(p_capability text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from shared.role_capabilities rc
    where rc.capability = p_capability
      and rc.role = any (shared.current_access_roles())
  )
$$;
comment on function shared.can(text) is
  'True iff the session holds an access role granted capability p (ADR-0020 D4). Resolves person->roles->capability from current_access_roles() (JWT, unspoofable). SECURITY INVOKER. First consumer: mos.objectives/work_lines write RLS.';

-- Reference-data read posture: every authenticated member may read the capability vocabulary
-- (the client derives affordances from it; it is not secret). No write grant -> service_role only.
grant select on shared.role_capabilities to authenticated;
alter table shared.role_capabilities enable row level security;
alter table shared.role_capabilities force  row level security;
create policy role_capabilities_select_all on shared.role_capabilities
  for select to authenticated using (true);
-- (no insert/update/delete policy + no such grant -> only service_role bypasses RLS)

-- DOWN:
-- drop policy if exists role_capabilities_select_all on shared.role_capabilities;
-- drop function if exists shared.can(text);
-- drop table if exists shared.role_capabilities cascade;
