-- P4 — access-role assignment substrate (ADR-0011 D5, OD-P4-4). Mirrors shared.person_roles
-- (…000002): org-scoped junction, org_id defaulted + WITH-CHECK-bound, soft-revoke (no DELETE),
-- text+CHECK vocabulary (not a PG enum, ADR-0011 Reversibility). `manager` is NOT a valid value
-- (derived from the role chain, never assigned — FR-003).
create table shared.person_access_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  access_role text not null check (access_role in ('admin','ops_lead','finance','member')),
  granted_by  uuid references shared.people(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references shared.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (person_id, access_role)
);
comment on table shared.person_access_roles is
  'Access-role assignments (ADR-0011 D5). One row per (person, access_role); soft-revoke via revoked_at; manager is derived, never stored.';

-- org_id stamped server-side from the session (unspoofable; default + WITH CHECK). granted_by
-- defaults to the granting session's person (NULL only on the service-role seed path).
alter table shared.person_access_roles alter column org_id set default shared.current_org_id();
alter table shared.person_access_roles alter column granted_by set default shared.current_person_id();

-- Indexes mirror person_roles + the hook's per-user lookup + the "who is admin?" admin-screen lookup.
create index person_access_roles_org_idx    on shared.person_access_roles (org_id);
create index person_access_roles_person_idx on shared.person_access_roles (person_id);
create index person_access_roles_role_idx   on shared.person_access_roles (access_role);

create trigger person_access_roles_set_updated_at
  before update on shared.person_access_roles
  for each row execute function shared.set_updated_at();

-- Base privileges. SELECT/INSERT/UPDATE to authenticated; NO DELETE grant (NFR-004) — removal is the
-- soft revoked_at UPDATE. RLS (below) + the guard (below) are the authority over who may write.
grant select, insert, update on shared.person_access_roles to authenticated;

-- Guard: invariants RLS WITH CHECK cannot express (mirrors ops._guard_log_entry / mos._guard_archive).
--  (1) admin/finance are NEVER self-assignable: a grant (live row) targeting the granting person for
--      those roles RAISES 42501 — enforced at the DB, not merely the UI (NFR-001).
--  (2) org_id / person_id / access_role are IMMUTABLE on UPDATE (only revoked_at/revoked_by may flip)
--      — prevents re-targeting a grant to escalate a different person.
-- SECURITY INVOKER: reads only current_person_id() (a claim helper); nothing to revoke (lint clean).
create or replace function shared._guard_person_access_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- (2) immutability on UPDATE.
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on an access-role assignment' using errcode = '42501';
    end if;
    if new.person_id is distinct from old.person_id then
      raise exception 'person_id is immutable on an access-role assignment' using errcode = '42501';
    end if;
    if new.access_role is distinct from old.access_role then
      raise exception 'access_role is immutable on an access-role assignment' using errcode = '42501';
    end if;
  end if;

  -- (1) admin/finance never self-assignable, on a GRANT (a live, non-revoked target state).
  if new.revoked_at is null
     and new.access_role in ('admin','finance')
     and new.person_id = shared.current_person_id() then
    raise exception 'access role % is never self-assignable', new.access_role using errcode = '42501';
  end if;

  return new;
end;
$$;
comment on function shared._guard_person_access_roles() is
  'Guard (ADR-0011 D5): admin/finance never self-assignable on grant (42501, NFR-001); org_id/person_id/access_role immutable on UPDATE (42501). SECURITY INVOKER.';

create trigger person_access_roles_guard
  before insert or update on shared.person_access_roles
  for each row execute function shared._guard_person_access_roles();

-- Read helpers (claim-sourced, fail-closed). Defined HERE (not in the hook migration) because the RLS
-- policies below reference shared.has_access_role and CREATE POLICY resolves the function at creation
-- time — the helper must exist when the policy is created. They depend only on the JWT claim (NOT on the
-- table), so they belong with the substrate's RLS. Both STABLE SECURITY INVOKER set search_path = '' —
-- no DEFINER, so the definer-revoke CI lint has nothing to flag (NFR-007). Mirrors shared._claim_uuid.

-- Defensive text-array claim extraction: malformed JSON / absent / non-array -> '{}' (fail closed),
-- mirroring shared._claim_uuid. PLPGSQL others-handler turns every parse failure into the empty array.
create or replace function shared._claim_text_array(claim_key text)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  raw text := current_setting('request.jwt.claims', true);
begin
  if raw is null or btrim(raw) = '' then
    return '{}'::text[];
  end if;
  return coalesce(
    (select array_agg(value::text)
       from jsonb_array_elements_text((raw::jsonb -> claim_key)) as t(value)),
    '{}'::text[]);
exception
  when others then
    return '{}'::text[];  -- malformed JSON / non-array claim -> fail closed
end;
$$;
comment on function shared._claim_text_array(text) is
  'Defensive text-array claim extraction: malformed/absent/non-array -> {} (fail closed). Backs current_access_roles.';

create or replace function shared.current_access_roles()
returns text[]
language sql
stable
set search_path = ''
as $$ select shared._claim_text_array('access_roles') $$;
comment on function shared.current_access_roles() is
  'Assigned access roles from the JWT access_roles claim (hook-injected, unspoofable). ADR-0011 D5.';

create or replace function shared.has_access_role(p_role text)
returns boolean
language sql
stable
set search_path = ''
as $$ select p_role = any(shared.current_access_roles()) $$;
comment on function shared.has_access_role(text) is
  'True iff the session holds access role p_role (reads current_access_roles). The function per-feature RLS policies call. ADR-0011 D5.';

alter table shared.person_access_roles enable row level security;
alter table shared.person_access_roles force row level security;

-- Org-readable to any org member (the viewer + a future admin screen list a person's roles, FR-035).
create policy person_access_roles_select_org on shared.person_access_roles
  for select to authenticated
  using (org_id = shared.current_org_id());

-- Grant: admin-only, org-scoped (FR-030). org_id forced to the session org (FR-033, unspoofable).
create policy person_access_roles_insert_admin on shared.person_access_roles
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Revoke / re-grant: admin-only, org-scoped (USING gates the visible row; WITH CHECK the new state).
create policy person_access_roles_update_admin on shared.person_access_roles
  for update to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'))
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
-- (no DELETE policy + no DELETE grant -> hard delete denied, NFR-004)

-- DOWN: drop policies person_access_roles_select_org / _insert_admin / _update_admin on
--       shared.person_access_roles; drop trigger person_access_roles_guard;
--       drop function shared._guard_person_access_roles(); revoke grants;
--       drop functions shared.has_access_role(text), shared.current_access_roles(),
--       shared._claim_text_array(text); drop table shared.person_access_roles cascade.
