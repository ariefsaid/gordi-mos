-- P4 — admin user-management: interim staging provisioning surface (ADR-0016 / spec admin-user-mgmt).
-- Three privileged auth.*-writing ops as admin-gated SECURITY DEFINER RPCs (create-login / reset-password
-- / disable-enable), a read-only login-status RPC, an admin write surface on shared.people, and the
-- no-lockout extension to the existing access-role guard. See ADR-0016 for why a definer RPC (not an Edge
-- Function / not the not-yet-deployed thin backend) is the staging path. service_role key never reaches
-- the browser; EXECUTE revoked from anon/public; the in-body admin check is the real gate (NFR-001/002).

-- ===========================================================================================
-- Task 1.1 — admin write surface on shared.people (scoped widening of the M1 read-only posture)
-- ===========================================================================================
-- create-person (FR-020) + archive/restore (FR-060). org_id stays server-stamped + immutable; user_id is
-- NEVER client-writable (the RPCs own the auth link). No DELETE grant (NFR-005: archive, never delete).
grant insert, update on shared.people to authenticated;

create policy people_insert_admin on shared.people
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

create policy people_update_admin on shared.people
  for update to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'))
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Guard: org_id immutable on UPDATE; user_id may NOT be set/changed by a DIRECT APP write (RPC-only
-- seam); created_at/id immutable. SECURITY INVOKER (reads only the effective role + current_* helpers;
-- nothing to revoke).
--
-- DIVERGENCE FROM PLAN §1.1 (forced, documented): the plan blocked any user_id write unconditionally.
-- That breaks the privileged provisioning paths that legitimately set user_id — both shared.admin_create_login
-- (SECURITY DEFINER, runs as the owner role `postgres`) AND the dev-auth seed (supabase/seed.dev-auth.sql,
-- a `do $$` block run as `postgres` by `supabase db reset`). Triggers fire regardless of RLS-bypass, so an
-- unconditional block 42501s the seed. The plan's INTENT is "no DIRECT app write of user_id"; an app write
-- runs as the `authenticated` role, whereas the RPC (definer→owner) and the seed run as a privileged role.
-- So the block is scoped to `current_user = 'authenticated'` — the exact RPC-only seam intended, enforced by
-- effective role rather than a blanket block. Confirmed on the local stack: definer RPC + seed run as
-- `postgres`; an app session runs as `authenticated`.
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
    -- No-lockout (FR-041 / H-1): archiving the LAST active admin's people row is refused. The auth hook
    -- resolves a person `where archived_at is null`, so archiving the sole admin drops admin out of
    -- claim-minting -> permanent org lockout, no in-app recovery. Mirrors the last-admin block in
    -- shared._guard_person_access_roles (revoke arm) and admin_set_login_enabled (disable arm).
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
  'Guard (ADR-0016): org_id immutable on UPDATE; user_id is RPC-only (never a direct app write); no-lockout — cannot archive the last active admin (42501, FR-041/H-1, mirrors the disable/revoke arms). SECURITY INVOKER.';

create trigger people_guard
  before insert or update on shared.people
  for each row execute function shared._guard_people();

-- ===========================================================================================
-- Task 1.2 — shared.admin_create_login (FR-022 ; AC-001 authz / AC-002 org / AC-010 round-trip)
-- ===========================================================================================
-- Generate a policy-compliant temp password (>=8, upper+lower+digit). 12 random base64 chars (padding +
-- non-alnum translated away) + a guaranteed uppercase, lowercase, and digit appended (FR-022).
create or replace function shared._gen_temp_password()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  body text := translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'xyz');
begin
  return body || 'A' || 'a' || (floor(random() * 10))::int::text;
end;
$$;
comment on function shared._gen_temp_password() is 'TEST/PROV helper: 12+ char temp password meeting >=8 mixed-case+digit policy (FR-022).';
revoke execute on function shared._gen_temp_password() from public, anon, authenticated;

create or replace function shared.admin_create_login(p_person uuid, p_password text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := shared.current_org_id();
  v_email  text;
  v_uid    uuid;
  v_pw     text;
  v_target shared.people;
begin
  -- (1) authz FIRST, fail-closed (NFR-001). admin AND target shares caller's org.
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  select * into v_target from shared.people where id = p_person;
  if v_target.id is null or v_target.org_id is distinct from v_org then
    raise exception 'person not found in your org' using errcode = '42501';
  end if;
  if v_target.user_id is not null then
    raise exception 'person already has a login' using errcode = '42501';
  end if;
  v_email := coalesce(v_target.email, '');
  if v_email = '' then
    raise exception 'person has no email to provision a login for' using errcode = '22023';
  end if;

  v_pw  := coalesce(p_password, shared._gen_temp_password());
  v_uid := extensions.gen_random_uuid();

  -- (2) auth.users row — mirror the proven staff-provisioning shape (token cols '' not NULL).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  ) values (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"email_verified":true}'::jsonb, false, false,
    '', '', '', '', '', '', '', '',
    now(), now()
  );

  -- (3) auth.identities — provider_id=user_id::text; email is GENERATED -> omitted.
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values (
    extensions.gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', false, 'phone_verified', false),
    now(), now()
  );

  -- (4) link the person (NFR-004: creating a login grants NO access role).
  update shared.people set user_id = v_uid, updated_at = now() where id = p_person;

  return v_pw;  -- returned ONCE to the calling admin; never persisted/logged (NFR-003).
end;
$$;
comment on function shared.admin_create_login(uuid, text) is
  'ADR-0016 interim provisioning: create an auth login for a person (admin+org gated). Returns the temp password ONCE (never persisted). SECURITY DEFINER.';
revoke execute on function shared.admin_create_login(uuid, text) from public, anon;
grant execute on function shared.admin_create_login(uuid, text) to authenticated;

-- ===========================================================================================
-- Task 1.3 — shared.admin_reset_password (FR-030 ; AC-020)
-- ===========================================================================================
create or replace function shared.admin_reset_password(p_person uuid, p_password text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := shared.current_org_id();
  v_target shared.people;
  v_pw     text;
begin
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  select * into v_target from shared.people where id = p_person;
  if v_target.id is null or v_target.org_id is distinct from v_org then
    raise exception 'person not found in your org' using errcode = '42501';
  end if;
  if v_target.user_id is null then
    raise exception 'person has no login to reset' using errcode = '22023';
  end if;

  v_pw := coalesce(p_password, shared._gen_temp_password());
  update auth.users
     set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')), updated_at = now()
   where id = v_target.user_id;
  return v_pw;
end;
$$;
comment on function shared.admin_reset_password(uuid, text) is
  'ADR-0016 interim provisioning: reset a login password (admin+org gated). Returns the new temp password ONCE. SECURITY DEFINER.';
revoke execute on function shared.admin_reset_password(uuid, text) from public, anon;
grant execute on function shared.admin_reset_password(uuid, text) to authenticated;

-- ===========================================================================================
-- Task 1.4 — shared.admin_set_login_enabled + no-lockout helper (FR-040/041 ; AC-030/040 disable arm)
-- ===========================================================================================
-- Active admin = admin role live + person not archived + login exists and not banned. SECURITY DEFINER:
-- reads auth.users (which authenticated has no SELECT on). It is called from BOTH the definer RPC
-- admin_set_login_enabled AND the SECURITY INVOKER guard shared._guard_person_access_roles (which runs as
-- the calling `authenticated` role on a normal admin revoke). Therefore EXECUTE MUST be granted to
-- `authenticated` — otherwise the no-lockout revoke block 42501s "permission denied for function" for
-- every app revoke. It is safe to expose: it takes only an org uuid, returns only an integer count, leaks
-- no row/secret. Revoked from anon/public; the org argument is the caller's own org in every real path.
--
-- DIVERGENCE FROM PLAN §1.4 (forced, documented): the plan revoked EXECUTE from authenticated too; that
-- makes the INVOKER guard unable to call it on an app revoke (proven by 56_'s negative-control arm). Grant
-- to authenticated instead — the safe, minimal fix; the count-only result discloses nothing sensitive.
-- SECURITY M-1 (audit must-fix): the helper takes NO org argument — it resolves the org from
-- shared.current_org_id() internally. A p_org parameter exposed under EXECUTE-to-authenticated was an
-- arbitrary-org admin-count oracle (any authenticated user could probe ANY org's admin count -> tenancy
-- leak, ADR-0001). Dropping the parameter structurally removes that surface, and is equivalent for every
-- legitimate path: admin writes are RLS-confined to the caller's own org, so the count was always over
-- current_org_id() anyway. EXECUTE stays granted to authenticated (the INVOKER guard needs it; the own-org
-- admin count is non-sensitive, already derivable via person_access_roles RLS).
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
comment on function shared._count_active_admins() is 'No-lockout helper (FR-041): admins who can actually sign in, scoped to current_org_id() (M-1: no arbitrary-org argument -> no cross-org count oracle). SECURITY DEFINER; EXECUTE to authenticated (the INVOKER guard calls it on an app revoke); count-only, no secrets.';
revoke execute on function shared._count_active_admins() from public, anon;
grant execute on function shared._count_active_admins() to authenticated;

create or replace function shared.admin_set_login_enabled(p_person uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid := shared.current_org_id();
  v_target   shared.people;
  v_is_admin boolean;
begin
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  select * into v_target from shared.people where id = p_person;
  if v_target.id is null or v_target.org_id is distinct from v_org then
    raise exception 'person not found in your org' using errcode = '42501';
  end if;
  if v_target.user_id is null then
    raise exception 'person has no login' using errcode = '22023';
  end if;

  -- No-lockout (FR-041): disabling the last active admin's login is refused.
  if p_enabled = false then
    select exists (
      select 1 from shared.person_access_roles
       where person_id = p_person and access_role = 'admin' and revoked_at is null
    ) into v_is_admin;
    if v_is_admin and shared._count_active_admins() <= 1 then
      raise exception 'cannot disable the last active admin login' using errcode = '42501';
    end if;
  end if;

  -- banned_until is the GoTrue block mechanism. Director §8.4: use a far-future FINITE timestamp
  -- (now() + 100 years), NOT 'infinity'::timestamptz (some GoTrue versions fail to parse infinity).
  update auth.users
     set banned_until = case when p_enabled then null else now() + interval '100 years' end,
         updated_at = now()
   where id = v_target.user_id;
end;
$$;
comment on function shared.admin_set_login_enabled(uuid, boolean) is
  'ADR-0016 interim provisioning: disable (banned_until = now()+100y, far-future finite per §8.4) / enable (NULL) a login (admin+org gated). No-lockout: last active admin cannot be disabled (FR-041). SECURITY DEFINER.';
revoke execute on function shared.admin_set_login_enabled(uuid, boolean) from public, anon;
grant execute on function shared.admin_set_login_enabled(uuid, boolean) to authenticated;

-- ===========================================================================================
-- Task 1.5 — extend shared._guard_person_access_roles with the last-admin revoke block (FR-041 ; AC-040)
-- ===========================================================================================
-- Re-paste the ENTIRE 20260619000001 body UNCHANGED, then add the last-admin revoke block before
-- `return new;` (Director §8: do not drop any existing invariant). CREATE OR REPLACE keeps one guard
-- per table (the existing trigger person_access_roles_guard continues to fire this function).
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
    -- (3) force revoked_by server-side on revoke / clear on re-grant.
    if new.revoked_at is not null and old.revoked_at is null then
      new.revoked_by := shared.current_person_id();
    elsif new.revoked_at is null and old.revoked_at is not null then
      new.revoked_by := null;
    end if;
  end if;

  -- (3) force granted_by server-side on INSERT (overrides any client-supplied value).
  if tg_op = 'INSERT' then
    new.granted_by := shared.current_person_id();
  end if;

  -- (1) admin/finance never self-assignable, on a GRANT (a live, non-revoked target state).
  if new.revoked_at is null
     and new.access_role in ('admin','finance')
     and new.person_id = shared.current_person_id() then
    raise exception 'access role % is never self-assignable', new.access_role using errcode = '42501';
  end if;

  -- No-lockout (FR-041 / ADR-0016): a revoke (live->revoked) of the LAST active admin is refused.
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
  'Guard (ADR-0011 D5 + ADR-0016): admin/finance never self-assignable on grant (42501, NFR-001); org_id/person_id/access_role immutable on UPDATE (42501); granted_by/revoked_by forced server-side (NFR-006); no-lockout — cannot revoke admin from the last active admin (42501, FR-041). SECURITY INVOKER.';

-- ===========================================================================================
-- Task 1.6 — shared.admin_list_login_status read RPC (FR-010/011)
-- ===========================================================================================
create or replace function shared.admin_list_login_status()
returns table(person_id uuid, has_login boolean, disabled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  return query
    select pe.id,
           pe.user_id is not null as has_login,
           (u.banned_until is not null and u.banned_until > now()) as disabled
      from shared.people pe
      left join auth.users u on u.id = pe.user_id
     where pe.org_id = shared.current_org_id();
end;
$$;
comment on function shared.admin_list_login_status() is
  'ADR-0016: read-only login-status (none/active/disabled) per person for the admin screen (admin gated, no secrets). SECURITY DEFINER.';
revoke execute on function shared.admin_list_login_status() from public, anon;
grant execute on function shared.admin_list_login_status() to authenticated;

-- ===========================================================================================
-- Task 1.7 — DOWN
-- ===========================================================================================
-- DOWN:
--   drop function shared.admin_list_login_status();
--   drop function shared.admin_set_login_enabled(uuid, boolean);
--   drop function shared.admin_reset_password(uuid, text);
--   drop function shared.admin_create_login(uuid, text);
--   drop function shared._count_active_admins();
--   drop function shared._gen_temp_password();
--   create or replace shared._guard_person_access_roles() with the 20260619000001 body (drop the
--     last-admin revoke block);
--   drop trigger people_guard on shared.people; drop function shared._guard_people();
--   drop policy people_update_admin on shared.people; drop policy people_insert_admin on shared.people;
--   revoke insert, update on shared.people from authenticated;
