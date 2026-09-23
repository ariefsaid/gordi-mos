-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 3 of 4: `shared` privileged provisioning (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The auth.*-writing operations, as admin-gated SECURITY DEFINER RPCs: create-login, reset-password,
-- disable/enable, a read-only login-status list, and the password-rotation trigger.
--
-- Why definer RPCs and not an Edge Function or the thin backend: ADR-0016. The service_role key
-- never reaches the browser; EXECUTE is revoked from anon/public; the in-body admin check is the
-- real gate, not the grant.
--
-- Every function here declares SECURITY DEFINER and carries its own REVOKE, which is also what the
-- CI definer lint requires.
--
-- DOWN: drop function shared.admin_list_login_status(); drop function
--   shared.admin_set_login_enabled(uuid, boolean); drop function shared.admin_reset_password(uuid, text);
--   drop function shared.admin_create_login(uuid, text); drop function shared._gen_temp_password();
--   drop trigger clear_must_change_password_on_pw_change on auth.users;
--   drop function shared._clear_must_change_password_on_pw_change();

-- ── Temp password generation ─────────────────────────────────────────────────────────────────
-- 12 random base64 chars (padding and non-alphanumerics translated away) plus a guaranteed
-- uppercase, lowercase and digit, so the result always satisfies a >=8 mixed-case-plus-digit policy.
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
comment on function shared._gen_temp_password() is 'Provisioning helper: a 12+ char temp password meeting the >=8 mixed-case-plus-digit policy.';
revoke execute on function shared._gen_temp_password() from public, anon, authenticated;

-- ── Create a login for an existing person ────────────────────────────────────────────────────
-- Authorization FIRST, fail-closed: admin AND the target shares the caller's org. Creating a login
-- grants NO access role — the two are separate acts on purpose.
--
-- The password is returned ONCE to the calling admin and never persisted or logged. Because the
-- provisioner therefore knows it, the person is flagged must_change_password unconditionally —
-- including when the admin supplied an explicit one, since they know it either way.
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

  -- A global email collision — INCLUDING a login that exists in another org — is caught and
  -- re-raised org-agnostically. The raw 23505 DETAIL names the conflicting row and is therefore a
  -- cross-tenant oracle. Race-safe because it catches the constraint rather than pre-checking.
  -- Do not unwrap this when editing the function.
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

  update shared.people
     set user_id = v_uid, must_change_password = true, updated_at = now()
   where id = p_person;

  return v_pw;
end;
$$;
comment on function shared.admin_create_login(uuid, text) is
  'ADR-0016 provisioning: create an auth login for a person (admin + org gated). Returns the temp '
  'password ONCE, never persisted. Cross-org and global email collisions raise a clean "email already '
  'in use" (22023) — no cross-tenant leak. Flags must_change_password. SECURITY DEFINER.';
revoke execute on function shared.admin_create_login(uuid, text) from public, anon;
grant  execute on function shared.admin_create_login(uuid, text) to authenticated;

-- ── Reset a password ─────────────────────────────────────────────────────────────────────────
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
  'ADR-0016 provisioning: reset a login password (admin + org gated). Returns the new temp password ONCE. Flags must_change_password. SECURITY DEFINER.';
revoke execute on function shared.admin_reset_password(uuid, text) from public, anon;
grant  execute on function shared.admin_reset_password(uuid, text) to authenticated;

-- ── Disable / enable a login ─────────────────────────────────────────────────────────────────
-- banned_until is GoTrue's block mechanism. Use a far-future FINITE timestamp, NOT
-- 'infinity'::timestamptz — some GoTrue versions fail to parse infinity.
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

  -- No-lockout (FR-041), the third arm alongside the revoke block in _guard_person_access_roles and
  -- the archive block in _guard_people.
  if p_enabled = false then
    select exists (
      select 1 from shared.person_access_roles
       where person_id = p_person and access_role = 'admin' and revoked_at is null
    ) into v_is_admin;
    if v_is_admin and shared._count_active_admins() <= 1 then
      raise exception 'cannot disable the last active admin login' using errcode = '42501';
    end if;
  end if;

  update auth.users
     set banned_until = case when p_enabled then null else now() + interval '100 years' end,
         updated_at = now()
   where id = v_target.user_id;
end;
$$;
comment on function shared.admin_set_login_enabled(uuid, boolean) is
  'ADR-0016 provisioning: disable (banned_until = now()+100y, far-future finite) / enable (NULL) a login (admin + org gated). No-lockout: the last active admin cannot be disabled (FR-041). SECURITY DEFINER.';
revoke execute on function shared.admin_set_login_enabled(uuid, boolean) from public, anon;
grant  execute on function shared.admin_set_login_enabled(uuid, boolean) to authenticated;

-- ── Read-only login status for the admin screen ──────────────────────────────────────────────
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
  'ADR-0016: read-only login status (none/active/disabled) per person for the admin screen (admin gated, no secrets). SECURITY DEFINER.';
revoke execute on function shared.admin_list_login_status() from public, anon;
grant  execute on function shared.admin_list_login_status() to authenticated;

-- ── The password change is the ONLY thing that clears the rotation flag ──────────────────────
-- An earlier design had an RPC the client called after setting a password. That left the ordering
-- ("set the password FIRST, then clear the flag") living only in the SPA, so the threat actor the
-- flag exists to stop — the provisioner, who by definition holds the password — could sign in, POST
-- the RPC from devtools, and carry on using the admin-known password on a permanently unflagged
-- account. There is no separate act left to forge here: the trigger fires only when GoTrue actually
-- writes a different encrypted_password.
--
-- GoTrue stays the password authority. Nothing here writes encrypted_password; it only reacts.
create or replace function shared._clear_must_change_password_on_pw_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Narrowed by `and must_change_password` so an ordinary password change by an unflagged user is a
  -- no-op rather than a pointless write that would bump updated_at and fire _guard_people for
  -- nothing.
  update shared.people
     set must_change_password = false, updated_at = now()
   where user_id = new.id
     and must_change_password;
  return new;
end;
$$;
comment on function shared._clear_must_change_password_on_pw_change() is
  'Lowers shared.people.must_change_password when GoTrue writes a new encrypted_password. SECURITY '
  'DEFINER so it can pass shared._guard_people(), which refuses to clear the flag from an '
  '`authenticated` session. This is the ONLY thing that clears the flag.';

-- Reached only as a trigger, which fires in the table's own context and needs no EXECUTE grant, so
-- the full revoke is safe and keeps a DEFINER function that can lower the rotation flag off
-- PUBLIC's menu.
revoke execute on function shared._clear_must_change_password_on_pw_change() from public, anon, authenticated;

-- The WHEN clause is the whole point: a plain AFTER UPDATE would clear the flag on any incidental
-- auth write — a sign-in stamp is enough — and the gate would be exactly as forgeable as the RPC it
-- replaced.
--
-- KNOWN RESIDUAL, recorded rather than implied away: "the hash changed" is weaker than "the password
-- is now one the admin never saw". An admin holding the provisioned password can sign in as the
-- holder before their first login and cycle it A -> B -> A; GoTrue rejects only same-as-current, not
-- a cycle. This trigger cannot detect it — bcrypt salts per write and the database never sees
-- plaintext. Closing it needs password history where the plaintext is, in GoTrue.
drop trigger if exists clear_must_change_password_on_pw_change on auth.users;
create trigger clear_must_change_password_on_pw_change
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function shared._clear_must_change_password_on_pw_change();
