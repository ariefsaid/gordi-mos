-- #131 — force a password change on first login after provisioning.
--
-- shared.admin_create_login and shared.admin_reset_password both set a password the admin chose or
-- was shown (it is the RPC's return value, handed over once). Nothing made the holder replace it, so
-- every provisioned password stayed valid indefinitely AND stayed known to whoever provisioned it.
-- ADR-0050 (company-wide revenue/COGS/margin) and ADR-0051 (per-branch revenue) put financial data
-- behind those accounts.
--
-- Rollback:
--   drop function shared.clear_must_change_password();
--   alter table shared.people drop column must_change_password;
--   (and restore the previous bodies of _guard_people / admin_create_login / admin_reset_password)

-- ── 1. The flag ──────────────────────────────────────────────────────────────────────────────
alter table shared.people
  add column must_change_password boolean not null default false;

comment on column shared.people.must_change_password is
  '#131: the current password was set by an admin and is known to them. The app shell blocks on a '
  'set-password screen until the holder replaces it. Cleared ONLY by shared.clear_must_change_password() '
  '(definer) — never by a direct app write; see shared._guard_people().';

-- ── 2. Backfill (owner decision 2026-07-31) ──────────────────────────────────────────────────
-- Every person who already has a login was provisioned by the RPCs above, so their password is
-- admin-known. Flagging only new accounts would leave the fix not covering the accounts that
-- motivated it. People with no login stay false: with no auth user there is no password to change,
-- so a flagged row could never clear itself.
update shared.people set must_change_password = true where user_id is not null;

-- ── 3. Guard: the flag is cleared by the RPC, never by a direct write ────────────────────────
-- Without this the gate is bypassable by exactly the wrong population. people_update_admin grants
-- UPDATE on any person in the org to any admin, so admin B — whose password admin A chose and knows
-- — could clear their own flag and skip the rotation entirely. Scoped to current_user =
-- 'authenticated' for the same reason the user_id block is: the definer RPCs and the dev-auth seed
-- run as `postgres`, and triggers fire regardless of RLS.
--
-- Setting the flag TRUE from an app session is allowed on purpose: that is an admin forcing a
-- rotation, which is the feature, not a bypass.
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
    -- #131: clearing must_change_password is the RPC's job. Raising it is not.
    if current_user = 'authenticated'
       and old.must_change_password and not new.must_change_password then
      raise exception 'must_change_password is cleared only by shared.clear_must_change_password()'
        using errcode = '42501';
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
  'Guard (ADR-0016): org_id immutable on UPDATE; user_id is RPC-only (never a direct app write); '
  'must_change_password is cleared only by shared.clear_must_change_password() (#131); no-lockout — '
  'cannot archive the last active admin (42501, FR-041/H-1). SECURITY INVOKER.';

-- ── 4. Both provisioning paths raise the flag ────────────────────────────────────────────────
-- Unconditional, including when the admin passed an explicit p_password: the threat is that the
-- provisioner knows the password, and they know it either way. (An earlier draft exempted
-- magic-link-only users; there are none — admin_create_login always writes encrypted_password.)
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

  -- D11 (migration ...0629000001, PRESERVED): a global email collision — including a login that
  -- exists in ANOTHER org — is caught and re-raised org-agnostically. The raw 23505 DETAIL names the
  -- conflicting row and is therefore a cross-tenant oracle. Race-safe: it catches the constraint
  -- rather than pre-checking. Do not unwrap this when editing the function.
  begin
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
  exception when unique_violation then
    raise exception 'email already in use' using errcode = '22023';
  end;

  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values (
    extensions.gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', false, 'phone_verified', false),
    now(), now()
  );

  -- (4) link the person (NFR-004: creating a login grants NO access role) and flag the rotation.
  update shared.people
     set user_id = v_uid, must_change_password = true, updated_at = now()
   where id = p_person;

  return v_pw;  -- returned ONCE to the calling admin; never persisted/logged (NFR-003).
end;
$$;
comment on function shared.admin_create_login(uuid, text) is
  'ADR-0016 provisioning: create an auth login for a person (admin+org gated). Returns the temp password ONCE (never persisted). Cross-org/global email collisions raise a clean "email already in use" (22023) — no cross-tenant leak (D11). Flags must_change_password (#131). SECURITY DEFINER.';
revoke execute on function shared.admin_create_login(uuid, text) from public, anon;
grant execute on function shared.admin_create_login(uuid, text) to authenticated;

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
  update shared.people
     set must_change_password = true, updated_at = now()
   where id = p_person;
  return v_pw;
end;
$$;
comment on function shared.admin_reset_password(uuid, text) is
  'ADR-0016 interim provisioning: reset a login password (admin+org gated). Returns the new temp password ONCE. Flags must_change_password (#131). SECURITY DEFINER.';
revoke execute on function shared.admin_reset_password(uuid, text) from public, anon;
grant execute on function shared.admin_reset_password(uuid, text) to authenticated;

-- ── 5. Clearing it ───────────────────────────────────────────────────────────────────────────
-- Takes NO person argument: it resolves the caller from the session's own claim. A p_person
-- parameter would be a gate-disarming oracle — any authenticated user could clear anyone's flag.
--
-- Deliberately does NOT set the password. GoTrue is the password authority, and #130 installs its
-- password policy (min length, character classes). An RPC writing encrypted_password directly would
-- run behind GoTrue's back and silently defeat that policy. The client calls
-- supabase.auth.updateUser({ password }) first — real validation, real weak_password errors — and
-- only then calls this. If this call fails the flag stays set and the user is asked again, which
-- fails safe: it errs toward re-prompting, never toward skipping the gate.
--
-- No access role required: being unable to leave your own set-password screen is not a privilege.
create or replace function shared.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid := shared.current_person_id();
begin
  if v_person is null then
    raise exception 'no person bound to this session' using errcode = '42501';
  end if;
  update shared.people
     set must_change_password = false, updated_at = now()
   where id = v_person;
end;
$$;
comment on function shared.clear_must_change_password() is
  '#131: clear the caller''s OWN must_change_password. Takes no argument by design — a person '
  'parameter would let any user disarm another''s gate. Call only after a successful '
  'auth.updateUser({password}). SECURITY DEFINER.';
revoke execute on function shared.clear_must_change_password() from public, anon;
grant execute on function shared.clear_must_change_password() to authenticated;
