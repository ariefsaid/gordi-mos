-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 2 of 4: `shared` access control (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The org seam, the access-role substrate and its grant provenance, the capability layer, every
-- guard, and every RLS policy on `shared`.
--
-- ⚠ A RE-AUTHORED RLS POLICY IS A NEW POLICY. Nothing here inherits a fail-closed proof from the
-- policy it replaces. Every policy created in this file has its own fail-closed pgTAP assertion in
-- supabase/tests/shared_*.sql, written against THIS SQL.
--
-- Two structural rules this file keeps, both of which have cost real time when broken:
--   1. CREATE POLICY resolves its functions at creation time, so every helper is defined above the
--      first policy that calls it.
--   2. There is exactly ONE guard function per table. Extending an invariant means re-pasting the
--      whole body and adding to it — rebuilding a guard from the first definition you grep silently
--      reverts every fix added since.
--
-- DOWN: see ...0001's DOWN (drop schema shared cascade) — this file adds nothing outside `shared`
-- except the grants to supabase_auth_admin, which fall with the objects they name.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Claim extraction — every helper below FAILS CLOSED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A malformed claims setting (empty string, non-JSON garbage) or a non-UUID claim value must return
-- NULL rather than raise: a raised error inside an RLS predicate surfaces as a 500 and can be
-- probed, while a clean NULL denies access. PLPGSQL with an others-handler around the jsonb parse
-- and the uuid cast turns every parse/cast failure into NULL. The empty/unset case is
-- short-circuited so the jsonb cast is never attempted on the common "no claims" path.
create or replace function shared._claim_uuid(claim_key text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  raw text := current_setting('request.jwt.claims', true);
  val text;
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  val := nullif(raw::jsonb ->> claim_key, '');
  return val::uuid;
exception
  when others then
    return null;  -- malformed JSON or non-UUID claim -> fail closed (clean deny)
end;
$$;
comment on function shared._claim_uuid(text) is
  'Defensive single-UUID claim extraction: malformed JSON / non-UUID / empty -> NULL (fail closed). Backs current_org_id / current_person_id.';

-- Same discipline for the array-valued claim: malformed / absent / non-array -> '{}'.
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

-- current_person_id(): identity, deliberately NOT gated by the rotation flag below — it is who you
-- are, not what you may do.
create or replace function shared.current_person_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select shared._claim_uuid('person_id')
$$;
comment on function shared.current_person_id() is 'Person id from the JWT custom claim (hook-injected, client-unspoofable). OD-P1-2.';

-- ── Is the CALLER on an admin-set password? ──────────────────────────────────────────────────
-- SECURITY DEFINER is load-bearing, not habit: shared.people's own SELECT policy calls
-- current_org_id(), which calls this function. Were this INVOKER, reading people here would
-- re-evaluate that policy and Postgres would abort with "infinite recursion detected in policy for
-- relation people".
--
-- READ THIS BEFORE DEPLOYING TO A NEW ENVIRONMENT. Definer alone is NOT what breaks the cycle:
-- shared.people is FORCE ROW LEVEL SECURITY, which subjects even the table owner to its own
-- policies. The cycle is broken only because this function's owner carries the BYPASSRLS role
-- attribute. On any environment where the migration owner lacks it, EVERY policy evaluation
-- recurses and the database is effectively down, not merely degraded. The pgTAP suite asserts the
-- attribute so that fails loudly at test time instead of silently at 3am.
--
-- Fails closed-for-the-user / open-for-the-org on a missing claim: no person_id claim (anon, or an
-- orphan) means no person to be flagged, so coalesce to false and current_org_id() behaves exactly
-- as it would have. Those sessions are already handled by their own policies.
create or replace function shared._current_person_must_change_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.must_change_password
       from shared.people p
      where p.id = shared._claim_uuid('person_id')),
    false)
$$;
comment on function shared._current_person_must_change_password() is
  'True while the caller''s password is the admin-set one. Read by shared.current_org_id() to close '
  'every org-scoped policy. SECURITY DEFINER to break RLS recursion via shared.people.';

-- Revoke from PUBLIC, then grant BACK to authenticated explicitly. Both halves are required and the
-- order matters: EXECUTE defaults to PUBLIC, so the revoke alone also strips `authenticated` — and
-- since current_org_id() is SECURITY INVOKER and every policy calls it, that turns every query into
-- "permission denied for function". The grant is what keeps the seam working; the revoke is what
-- stops anon/PUBLIC reaching a DEFINER function they have no business calling.
revoke execute on function shared._current_person_must_change_password() from public, anon;
grant  execute on function shared._current_person_must_change_password() to authenticated;

-- ── The org seam ─────────────────────────────────────────────────────────────────────────────
-- Every org-scoped policy in every schema resolves through this one function, which is why the
-- rotation gate lives here rather than being re-added to ~90 policies and hoped for.
--
-- Deliberately NOT a JWT claim. A claim would be stale until the token refreshed, so the user who
-- just set their password would stay locked out until then. Reading the table costs a lookup and is
-- always current.
create or replace function shared.current_org_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
           when shared._current_person_must_change_password() then null::uuid
           else shared._claim_uuid('org_id')
         end
$$;
comment on function shared.current_org_id() is
  'Org id from the JWT custom claim (hook-injected, client-unspoofable). OD-P1-1. Returns NULL while '
  'the caller must change their password, which closes every policy scoped by it — the flag gates '
  'authorization, not merely the UI.';

create or replace function shared.is_org_member()
returns boolean
language sql
stable
set search_path = ''
as $$
  select shared.current_org_id() is not null
$$;
comment on function shared.is_org_member() is 'Session is bound to an org. Basis of org-readable RLS.';

-- ── The derived reporting-line manager ───────────────────────────────────────────────────────
-- UNION over ALL roles the target holds, walking reports_to_role_id upward; true iff the current
-- person holds ANY strict ancestor role. Dual-hat means a person is reachable from all their leads.
--
-- INVARIANT: correctness relies on the access-token hook minting org_id and person_id from the SAME
-- people row, so the viewer's person_id is always consistent with current_org_id(); RLS then scopes
-- person_roles/roles to that org and a cross-org person_id claim matches no in-org rows.
create or replace function shared.is_manager_of(target_person_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  with recursive
  target_roles as (
    select pr.role_id
    from shared.person_roles pr
    where pr.person_id = target_person_id
  ),
  ancestor_roles as (
    select r.id, r.reports_to_role_id
    from shared.roles r
    join target_roles tr on tr.role_id = r.id
    -- UNION (not UNION ALL): roles form a FINITE set, and although shared._guard_role_hierarchy now
    -- refuses to WRITE a cycle, already-cyclic data remains possible (a restore from an older
    -- backup, a trigger-bypassing data migration, a superuser fix-up). UNION dedupes the working
    -- set so the recursion terminates on a cycle instead of hanging inside RLS evaluation. The two
    -- protections are independent and both are asserted.
    union
    select parent.id, parent.reports_to_role_id
    from shared.roles parent
    join ancestor_roles a on a.reports_to_role_id = parent.id
  ),
  viewer_roles as (
    select pr.role_id
    from shared.person_roles pr
    where pr.person_id = shared.current_person_id()
  )
  select exists (
    select 1
    from ancestor_roles a
    join viewer_roles vr on vr.role_id = a.id
    where a.id not in (select role_id from target_roles)
  )
$$;
comment on function shared.is_manager_of(uuid) is
  'True iff current person holds a role strictly above any role the target holds (recursive union, OD-P1-7). Cycle-safe: terminates on a cyclic graph.';

-- The REVERSE question: does p_manager manage ME? Both directions are needed because sharing runs
-- the other way from reviewing — a manager shares a user view TO their reports, so the VIEWER asks
-- "does the owner manage me". Same recursion, source and target swapped, same UNION cycle-safety.
-- It lives here, with the directory it walks, rather than inside the migration of whichever schema
-- happens to be its first consumer.
create or replace function shared.is_managed_by(p_manager_person_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive
  current_roles as (
    select pr.role_id from shared.person_roles pr
    where pr.person_id = shared.current_person_id()
  ),
  ancestor_roles as (
    select r.id, r.reports_to_role_id
    from shared.roles r
    join current_roles cr on cr.role_id = r.id
    union
    select parent.id, parent.reports_to_role_id
    from shared.roles parent
    join ancestor_roles a on a.reports_to_role_id = parent.id
  ),
  manager_roles as (
    select pr.role_id from shared.person_roles pr
    where pr.person_id = p_manager_person_id
  )
  select exists (
    select 1
    from ancestor_roles a
    join manager_roles mr on mr.role_id = a.id
    where a.id not in (select role_id from current_roles)
  )
$$;
comment on function shared.is_managed_by(uuid) is
  'True iff p_manager_person_id manages the CURRENT person — the reverse of is_manager_of. Backs manager-to-report sharing. SECURITY INVOKER; cycle-safe.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Access roles — what a person may DO (CONTEXT.md "Access role", ADR-0011 D5)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Six values, a fixed vocabulary that grows by migration (text + CHECK, not a PG enum, so it stays
-- reversible). Two senses of "manager" coexist and must not be conflated: the STORED `manager`
-- access role (company-wide financial view) and the DERIVED reporting-line manager
-- (shared.is_manager_of), which is walked from the role chain and is never assigned.
--
-- Soft-revoke via revoked_at; no DELETE grant and no DELETE policy, so a grant's history survives.
create table shared.person_access_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  access_role text not null
    check (access_role in ('admin','ops_lead','finance','member','manager','supervisor')),
  granted_by  uuid references shared.people(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references shared.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (person_id, access_role)
);
comment on table shared.person_access_roles is
  'Access-role assignments (ADR-0011 D5 + ADR-0050 + ADR-0051). One row per (person, access_role); '
  'soft-revoke via revoked_at. `manager` = company-wide financial view; `supervisor` = revenue only '
  'within an explicitly granted (channel, branch) scope. The reporting-line manager stays derived, '
  'never stored.';
comment on column shared.person_access_roles.granted_by is
  'Who granted this access role — forced server-side from shared.current_person_id() by the guard, never client-supplied. NULL on the service/seed path, which has no acting person.';
comment on column shared.person_access_roles.revoked_by is
  'Who revoked it — forced server-side by the guard on the live->revoked transition, and cleared on re-grant.';

create index person_access_roles_org_idx    on shared.person_access_roles (org_id);
create index person_access_roles_person_idx on shared.person_access_roles (person_id);
create index person_access_roles_role_idx   on shared.person_access_roles (access_role);

create trigger person_access_roles_set_updated_at
  before update on shared.person_access_roles
  for each row execute function shared.set_updated_at();

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
  'True iff the session holds access role p_role. The function per-feature RLS policies call. ADR-0011 D5.';

-- ── Capabilities (ADR-0020 D3/D4) ────────────────────────────────────────────────────────────
-- Capability grants per access role. Deliberately ORG-LESS: this is a global vocabulary seeded by
-- migration, not tenant data — there is no org_id seam to enforce because there is no per-org row.
-- Its fail-closed property is therefore a different one and is asserted as such: `authenticated`
-- has SELECT and nothing else, and there is no write policy at all, so only service_role (which
-- bypasses RLS) can change it. Per-org role management lands with the admin-editable-roles slice.
create table shared.role_capabilities (
  id          uuid primary key default gen_random_uuid(),
  role        text not null
    check (role in ('admin','ops_lead','finance','member','manager','supervisor')),
  capability  text not null check (btrim(capability) <> ''),
  scope       text not null check (scope in ('org','own_bu')) default 'org',
  created_at  timestamptz not null default now(),
  unique (role, capability)
);
comment on table shared.role_capabilities is
  'Capability grants per access role (ADR-0020 D3/D4). Global seed, migration-only writes — NOT '
  'org-scoped, and deliberately so: it is a vocabulary, not tenant data. `scope` is recorded for the '
  'own_bu upgrade; every grant today is org.';
create index role_capabilities_role_idx on shared.role_capabilities (role);

-- Cascade write capabilities (ADR-0020 FR-332). Other schemas add their own rows in their own
-- migrations rather than reaching back into this file.
insert into shared.role_capabilities (role, capability, scope) values
  ('admin',    'objective.manage', 'org'),
  ('admin',    'workline.manage',  'org'),
  ('ops_lead', 'workline.manage',  'org')
on conflict (role, capability) do nothing;

-- can(capability): true iff the session holds ANY access role granted that capability. Resolves
-- from current_access_roles() — the same unspoofable JWT source has_access_role uses — so a session
-- with no access_roles claim can() nothing. SECURITY INVOKER; every reference is schema-qualified,
-- so search_path='' is safe.
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
  'True iff the session holds an access role granted capability p (ADR-0020 D4). Reads the roles straight off the JWT via current_access_roles() and joins them to role_capabilities — the person->role hop already happened in the token hook, so this function makes NO directory lookup and must not grow one. SECURITY INVOKER.';

-- ── No-lockout helper ────────────────────────────────────────────────────────────────────────
-- Active admin = admin role live + person not archived + login exists and is not banned. SECURITY
-- DEFINER because it reads auth.users, which `authenticated` has no SELECT on.
--
-- It takes NO org argument, and that is a security property rather than tidiness: a p_org parameter
-- exposed under EXECUTE-to-authenticated would be an arbitrary-org admin-count oracle. It resolves
-- the org from current_org_id() internally, which is equivalent for every legitimate path.
--
-- EXECUTE MUST be granted to `authenticated`: it is called from the SECURITY INVOKER guard
-- shared._guard_person_access_roles, which runs as the calling role on a normal admin revoke.
-- Without the grant every app revoke fails with "permission denied for function". Safe to expose —
-- it takes nothing and returns only a count over the caller's own org.
create or replace function shared._count_active_admins()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from shared.person_access_roles par
    join shared.people pe on pe.id = par.person_id
    join auth.users u     on u.id = pe.user_id
   where par.org_id = shared.current_org_id()
     and par.access_role = 'admin'
     and par.revoked_at is null
     and pe.archived_at is null
     and (u.banned_until is null or u.banned_until <= now());
$$;
comment on function shared._count_active_admins() is
  'No-lockout helper (FR-041): admins who can actually sign in, scoped to current_org_id() (no arbitrary-org argument -> no cross-org count oracle). SECURITY DEFINER; EXECUTE to authenticated because the INVOKER guard calls it; count-only, no secrets.';
revoke execute on function shared._count_active_admins() from public, anon;
grant  execute on function shared._count_active_admins() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Server-stamped columns — the org seam is a DEFAULT plus a WITH CHECK, never client input
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table shared.business_units   alter column org_id set default shared.current_org_id();
alter table shared.roles            alter column org_id set default shared.current_org_id();
alter table shared.people           alter column org_id set default shared.current_org_id();
alter table shared.person_roles     alter column org_id set default shared.current_org_id();
alter table shared.sites            alter column org_id set default shared.current_org_id();
alter table shared.teams            alter column org_id set default shared.current_org_id();
alter table shared.team_memberships alter column org_id set default shared.current_org_id();
alter table shared.branches         alter column org_id set default shared.current_org_id();
alter table shared.person_access_roles alter column org_id set default shared.current_org_id();

-- Provenance defaults. Both these columns ALSO get stamped by their guard, which overwrites any
-- client-supplied value; the default alone cannot do that, and the guard alone yields NULL
-- attribution if the trigger is ever detached. Keeping both costs nothing and each catches a
-- different failure — a detached guard trigger has been observed on a live database with its
-- function body and migration record both present.
alter table shared.person_roles        alter column granted_by set default shared.current_person_id();
alter table shared.person_access_roles alter column granted_by set default shared.current_person_id();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Guards — invariants RLS WITH CHECK cannot express
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── shared.people ────────────────────────────────────────────────────────────────────────────
-- Scoped to current_user = 'authenticated' where noted, for a reason worth keeping: the definer
-- provisioning RPCs and the dev-auth seed run as a privileged role, and triggers fire regardless of
-- RLS. An unconditional block would 42501 the seed. The intent is "no DIRECT app write", and an app
-- write is exactly the one running as `authenticated`.
create or replace function shared._guard_people()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a person' using errcode = '42501';
    end if;
    if current_user = 'authenticated' and new.user_id is distinct from old.user_id then
      raise exception 'user_id is set only by the provisioning RPCs, not a direct write' using errcode = '42501';
    end if;
    -- Clearing must_change_password is the password change's job. Raising it is not: that is an
    -- admin forcing a rotation, which is the feature. Without this block the gate is bypassable by
    -- exactly the wrong population — people_update_admin grants UPDATE on any person in the org to
    -- any admin, so admin B, whose password admin A chose and knows, could clear their own flag.
    if current_user = 'authenticated'
       and old.must_change_password and not new.must_change_password then
      raise exception 'must_change_password is cleared only by an actual password change'
        using errcode = '42501';
    end if;
    -- No-lockout (FR-041): archiving the LAST active admin's people row is refused. The auth hook
    -- resolves a person `where archived_at is null`, so archiving the sole admin drops admin out of
    -- claim-minting -> permanent org lockout with no in-app recovery. Mirrors the last-admin block
    -- in _guard_person_access_roles (revoke arm) and admin_set_login_enabled (disable arm).
    if new.archived_at is not null and old.archived_at is null
       and exists (
         select 1 from shared.person_access_roles
          where person_id = old.id and access_role = 'admin' and revoked_at is null
       )
       and shared._count_active_admins() <= 1 then
      raise exception 'cannot archive the last active admin' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and current_user = 'authenticated' and new.user_id is not null then
    raise exception 'user_id is set only by the provisioning RPCs, not a direct write' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function shared._guard_people() is
  'Guard (ADR-0016): org_id immutable on UPDATE; user_id is RPC-only (never a direct app write); '
  'must_change_password is cleared only by an actual password change, via the auth.users trigger; '
  'no-lockout — cannot archive the last active admin (42501, FR-041). SECURITY INVOKER.';

create trigger people_guard
  before insert or update on shared.people
  for each row execute function shared._guard_people();

-- ── shared.person_roles (the Jabatan assignment) ─────────────────────────────────────────────
-- Org seam plus attribution. The org check is applied ONLY when current_org_id() is not null: the
-- cross-org threat exists for an AUTHENTICATED admin session, which always carries an org claim,
-- while under a service/seed connection there is no "your org" to cross and such connections are
-- trusted and bypass RLS anyway. Without this the seed path 42501s on every fresh reset — and CI
-- would not catch it, because the fast lane does not seed.
create or replace function shared._guard_person_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Attribution: always the acting person, never what the client sent. NULL under the
    -- service/seed connection, which is correct and honest — there is no human actor to attribute.
    new.granted_by := shared.current_person_id();

    if shared.current_org_id() is not null then
      if not exists (select 1 from shared.people p
                      where p.id = new.person_id and p.org_id = shared.current_org_id()) then
        raise exception 'person is not in your org' using errcode = '42501';
      end if;
      if not exists (select 1 from shared.roles r
                      where r.id = new.role_id and r.org_id = shared.current_org_id()) then
        raise exception 'position is not in your org' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
comment on function shared._guard_person_roles() is
  'Guard: a Jabatan assignment must reference a person AND a role in the caller''s org — enforced '
  'only when current_org_id() is not null (an authenticated session); the service/seed connection '
  '(null org) is exempt. granted_by is forced server-side from current_person_id(). SECURITY INVOKER.';

create trigger person_roles_guard
  before insert on shared.person_roles
  for each row execute function shared._guard_person_roles();

-- Deliberately NOT blocking self-assignment here, though the sibling person_access_roles does.
-- The parity is false: person_access_roles grants APP PRIVILEGE, person_roles records an ORG
-- POSITION. An admin setting their own job title is legitimate, and in a single-admin org it is the
-- only way the position ever gets set — a hard block is a lockout footgun that closes no hole,
-- because an admin can already reset any password. Attribution is the proportionate control.

-- ── shared.person_access_roles ───────────────────────────────────────────────────────────────
-- Four invariants, all of which have to be here rather than in a WITH CHECK:
--   (1) admin/finance/manager/supervisor are NEVER self-assignable on a grant.
--   (2) org_id / person_id / access_role are IMMUTABLE on UPDATE — otherwise a grant could be
--       re-targeted at a different person to escalate them.
--   (3) granted_by / revoked_by are forced server-side; a client-supplied value is overridden, so
--       provenance cannot be forged.
--   (4) no-lockout: revoking admin from the last active admin is refused.
create or replace function shared._guard_person_access_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
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
    if new.revoked_at is not null and old.revoked_at is null then
      new.revoked_by := shared.current_person_id();
    elsif new.revoked_at is null and old.revoked_at is not null then
      new.revoked_by := null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.granted_by := shared.current_person_id();
  end if;

  if new.revoked_at is null
     and new.access_role in ('admin','finance','manager','supervisor')
     and new.person_id = shared.current_person_id() then
    raise exception 'access role % is never self-assignable', new.access_role using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.access_role = 'admin'
     and old.revoked_at is null and new.revoked_at is not null then
    if shared._count_active_admins() <= 1 then
      raise exception 'cannot revoke admin from the last active admin' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
comment on function shared._guard_person_access_roles() is
  'Guard (ADR-0011 D5 + ADR-0016 + ADR-0050 + ADR-0051): admin/finance/manager/supervisor never '
  'self-assignable on grant (42501); org_id/person_id/access_role immutable on UPDATE (42501); '
  'granted_by/revoked_by forced server-side; no-lockout on the last active admin. SECURITY INVOKER.';

create trigger person_access_roles_guard
  before insert or update on shared.person_access_roles
  for each row execute function shared._guard_person_access_roles();

-- ── shared.roles — the hierarchy is acyclic and single-org ───────────────────────────────────
-- A cycle is not a wrong answer, it is a HANG: is_manager_of and the SPA both walk the hierarchy,
-- so one bad re-parent takes out every surface that asks who reports to whom — including the admin
-- screen that would fix it. A CHECK cannot express this: it sees one row, and a cycle is a property
-- of the whole graph. So it is a BEFORE trigger that walks upward from the proposed parent.
--
-- Second invariant, same trigger: reports_to_role_id is a bare self-FK with no org predicate, so
-- without this a role could point at another org's role — a tenancy leak shaped like an org chart.
--
-- SECURITY DEFINER so the walk sees the true graph: under RLS the writer sees only their own org,
-- and a caller whose org resolves to NULL (the rotation gate) would see nothing and wave a cycle
-- through.
create or replace function shared._guard_role_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor uuid := new.reports_to_role_id;
  v_parent_org uuid;
  v_hops   int  := 0;
begin
  -- A root closes nothing.
  if v_cursor is null then
    return new;
  end if;

  -- Self-reference is checked BEFORE the org lookup, and the order is load-bearing: on INSERT the
  -- row does not exist yet, so looking up its org would return NULL and raise the cross-org error
  -- for what is really the shortest possible cycle. Wrong errcode, wrong diagnosis.
  if v_cursor = new.id then
    raise exception 'role hierarchy would contain a cycle' using errcode = '23514';
  end if;

  select org_id into v_parent_org from shared.roles where id = v_cursor;
  if v_parent_org is distinct from new.org_id then
    raise exception 'a role may only report to a role in the same org' using errcode = '42501';
  end if;

  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'role hierarchy would contain a cycle' using errcode = '23514';
    end if;

    -- Belt and braces: if a cycle already exists in the data (a restore, a trigger-bypassing
    -- migration), the walk would never terminate and would hang the WRITING session. Bail loudly
    -- instead. 1000 is far beyond any real org chart.
    v_hops := v_hops + 1;
    if v_hops > 1000 then
      raise exception 'role hierarchy walk exceeded 1000 hops — pre-existing cycle?'
        using errcode = '23514';
    end if;

    select reports_to_role_id into v_cursor from shared.roles where id = v_cursor;
  end loop;

  return new;
end;
$$;
comment on function shared._guard_role_hierarchy() is
  'Refuses a reports_to_role_id edge that would close a cycle, and refuses a cross-org parent. '
  'SECURITY DEFINER so the walk sees the true graph rather than the writer''s RLS-filtered view.';

-- Only ever reached as a trigger, which fires in the table's own context and needs no EXECUTE
-- grant, so the full revoke is safe here (unlike _current_person_must_change_password, which
-- policies call and which therefore needs the grant back to authenticated).
revoke execute on function shared._guard_role_hierarchy() from public, anon, authenticated;

-- Fires on INSERT always, and on UPDATE only when the edge actually moves — an unrelated rename
-- should not pay for a hierarchy walk.
create trigger guard_role_hierarchy
before insert or update of reports_to_role_id, org_id on shared.roles
for each row
execute function shared._guard_role_hierarchy();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. The access-token hook — the single audited claim-injection point (ADR-0001 D1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Stamps org_id + person_id + access_roles. `manager` is never stamped from the role chain: the
-- DERIVED reporting-line manager is walked at query time, so a role-chain change needs no re-mint.
-- An orphan (an auth user with no live people row) still gets an empty access_roles array, so the
-- claim is present and every has_access_role() call is false rather than undefined.
create or replace function shared.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims     jsonb;
  v_person   shared.people;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  select p.* into v_person
  from shared.people p
  where p.user_id = (event ->> 'user_id')::uuid
    and p.archived_at is null
  limit 1;

  if v_person.id is not null then
    claims := jsonb_set(claims, '{org_id}',    to_jsonb(v_person.org_id::text), true);
    claims := jsonb_set(claims, '{person_id}', to_jsonb(v_person.id::text),     true);
    claims := jsonb_set(claims, '{access_roles}',
      coalesce(
        (select to_jsonb(array_agg(par.access_role order by par.access_role))
           from shared.person_access_roles par
          where par.person_id = v_person.id
            and par.revoked_at is null),
        '[]'::jsonb),
      true);
  else
    claims := jsonb_set(claims, '{access_roles}', '[]'::jsonb, true);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
comment on function shared.custom_access_token_hook(jsonb) is
  'Auth hook: stamps org_id + person_id + access_roles (the non-revoked assigned set) from shared.*. OD-P1-1/2, ADR-0011 D5.';

-- Supabase Auth runs the hook as supabase_auth_admin; lock execution to that role only.
revoke execute on function shared.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant  execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema shared to supabase_auth_admin;
grant select on shared.people, shared.person_access_roles to supabase_auth_admin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Base privileges
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- RLS is a FILTER, not a GRANT: Postgres checks the base privilege FIRST and only then applies
-- policies, so without these grants every authenticated read errors "permission denied" before any
-- policy is evaluated. Conversely a grant without a matching policy is closed, not open.
--
-- Reads: the whole directory is org-readable. Writes: only where a feature exists to make them.
--   * people        — INSERT/UPDATE (the admin people screen). No DELETE: archive, never delete.
--   * person_roles  — INSERT/DELETE (assign/remove a Jabatan). No UPDATE at all, which is why
--                     granted_by needs no immutability guard.
--   * person_access_roles — INSERT/UPDATE (grant/revoke). No DELETE: revocation is soft.
-- Everything else is read-only to the app; service_role bypasses RLS and is the seed/admin path.
grant select on
  shared.orgs, shared.business_units, shared.roles, shared.people, shared.person_roles,
  shared.person_access_roles, shared.role_capabilities,
  shared.sites, shared.teams, shared.team_memberships, shared.branches
  to authenticated;

grant insert, update on shared.people               to authenticated;
grant insert, delete on shared.person_roles         to authenticated;
grant insert, update on shared.person_access_roles  to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. RLS — enabled AND forced on every table in `shared`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- FORCE subjects the table OWNER to its own policies. Read that narrowly: it does NOT constrain the
-- definer functions above, which run as a role holding BYPASSRLS, and BYPASSRLS overrides FORCE —
-- those functions are DEFINER precisely so they can bypass RLS, and each carries its own guards for
-- that reason. FORCE is kept on every table as defence in depth, binding any future owner or grantee
-- without BYPASSRLS; it is not what holds the line today. Crediting it with that would invite the
-- next reader to drop the grant and policy posture that is.
alter table shared.orgs                enable row level security;
alter table shared.orgs                force  row level security;
alter table shared.business_units      enable row level security;
alter table shared.business_units      force  row level security;
alter table shared.roles               enable row level security;
alter table shared.roles               force  row level security;
alter table shared.people              enable row level security;
alter table shared.people              force  row level security;
alter table shared.person_roles        enable row level security;
alter table shared.person_roles        force  row level security;
alter table shared.person_access_roles enable row level security;
alter table shared.person_access_roles force  row level security;
alter table shared.role_capabilities   enable row level security;
alter table shared.role_capabilities   force  row level security;
alter table shared.sites               enable row level security;
alter table shared.sites               force  row level security;
alter table shared.teams               enable row level security;
alter table shared.teams               force  row level security;
alter table shared.team_memberships    enable row level security;
alter table shared.team_memberships    force  row level security;
alter table shared.branches            enable row level security;
alter table shared.branches            force  row level security;

-- ── orgs: the tenant itself. No org_id column — it IS the org (ADR-0001 D8). ─────────────────
create policy orgs_select_own on shared.orgs
  for select to authenticated
  using (id = shared.current_org_id());
comment on policy orgs_select_own on shared.orgs is
  'An org row is readable only by its own members. No write policy for authenticated -> writes denied; service_role bypasses RLS.';

-- ── The org-readable directory. One shape, repeated, so a missing arm is visible. ────────────
create policy business_units_select_org on shared.business_units
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy roles_select_org on shared.roles
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy people_select_org on shared.people
  for select to authenticated
  using (org_id = shared.current_org_id());

-- ...but never starve the rotation gate itself. resolveViewer reads shared.people by user_id to
-- discover must_change_password. With org reads closed (current_org_id() is NULL while flagged) and
-- no self policy, that read returns nothing, the SPA resolves person=null and shows the ORPHAN
-- screen — sign-out as the only action, no way to ever clear the flag, and a support call to undo
-- it. Keyed on current_person_id(), which is deliberately NOT gated: it is an identity, not an
-- authorization. Discloses nothing new — the row is the reader's own.
create policy people_select_self on shared.people
  for select to authenticated
  using (id = shared.current_person_id());
comment on policy people_select_self on shared.people is
  'A caller always reads their OWN person row, even while the org seam is closed by the '
  'must_change_password rotation gate — otherwise the set-password screen can never render and the '
  'flag can never clear.';

create policy person_roles_select_org on shared.person_roles
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy person_access_roles_select_org on shared.person_access_roles
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy sites_select_org on shared.sites
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy teams_select_org on shared.teams
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy team_memberships_select_org on shared.team_memberships
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy branches_select_org on shared.branches
  for select to authenticated
  using (org_id = shared.current_org_id());
comment on policy branches_select_org on shared.branches is
  'The branch catalog is org-readable reference data. No write policy and no write grant: the '
  'catalog is seeded, and the admin mapping/maintenance screen is deferred out of cohort 1 '
  '(OD-WAY-39). Until it lands, only service_role writes.';

-- ── Capability vocabulary: readable by any authenticated session, writable by none. ──────────
-- The client derives affordances from it and it is not secret, so `true` is the deliberate read
-- predicate. The fail-closed property here is the WRITE surface: no insert/update/delete policy and
-- no such grant, so only service_role can change it.
create policy role_capabilities_select_all on shared.role_capabilities
  for select to authenticated using (true);

-- ── Admin write surfaces. Every one is org-scoped AND access-role gated. ─────────────────────
-- org_id is defaulted from the session and re-checked here: the default stamps it, the WITH CHECK
-- makes it unspoofable even when a client sends one explicitly (an explicit NULL is rejected too,
-- because NULL <> current_org_id()).
create policy people_insert_admin on shared.people
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

create policy people_update_admin on shared.people
  for update to authenticated
  using       (org_id = shared.current_org_id() and shared.has_access_role('admin'))
  with check  (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Jabatan assign/remove. Plain admin-scoped RLS rather than a definer RPC: person_roles is a
-- directory junction with no auth.* write and no privilege escalation of its own.
create policy person_roles_insert_admin on shared.person_roles
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Hard delete, because there is no soft-delete column and is_manager_of reads live rows.
create policy person_roles_delete_admin on shared.person_roles
  for delete to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'));

create policy person_access_roles_insert_admin on shared.person_access_roles
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Revoke / re-grant. USING gates the visible row, WITH CHECK the resulting state.
create policy person_access_roles_update_admin on shared.person_access_roles
  for update to authenticated
  using       (org_id = shared.current_org_id() and shared.has_access_role('admin'))
  with check  (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- No DELETE policy and no DELETE grant anywhere in this schema except person_roles: every other
-- removal is a soft revoke or an archive.
