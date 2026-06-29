-- D11 audit (2026-06-29) Medium fix — cross-org duplicate-email tenancy rough-edge in
-- shared.admin_create_login. `auth.users` enforces email uniqueness GLOBALLY
-- (users_email_partial_key, WHERE not is_sso_user) but `shared.people.email` does not, so a login
-- for an email that already exists in ANOTHER org surfaced a raw 23505 whose DETAIL echoed the email
-- + confirmed it exists elsewhere — an opaque error + a minor cross-tenant existence oracle (ADR-0016
-- amendment, D11 verdict; charter: the org_id tenancy seam must not be bypassable).
--
-- Fix: CREATE OR REPLACE admin_create_login (the original ships in …0626000001; never edited in place)
-- to catch unique_violation on the auth.users insert and re-raise a CLEAN, org-agnostic app error
-- (22023 'email already in use') that leaks no cross-org row/DETAIL. The catch is race-safe (no TOCTOU):
-- it handles a concurrent insert landing between any check and the insert, backstopped by the partial
-- unique index. Body is otherwise logic-identical to …0626000001 (only the auth.users insert is now
-- wrapped in the begin/exception block; the rest is unchanged).

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
  -- D11 fix: a global email collision (incl. a login that exists in ANOTHER org) is caught and
  -- re-raised as a clean, org-agnostic error — NEVER the raw 23505 DETAIL (no cross-tenant oracle).
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
    -- org-agnostic: do not echo the conflicting row / which org it belongs to.
    raise exception 'email already in use' using errcode = '22023';
  end;

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
  'ADR-0016 provisioning: create an auth login for a person (admin+org gated). Returns the temp password ONCE (never persisted). Cross-org/global email collisions raise a clean "email already in use" (22023) — no cross-tenant leak (D11 fix). SECURITY DEFINER.';

-- EXECUTE posture is unchanged from …0626000001 (revoked from public/anon; granted to authenticated);
-- CREATE OR REPLACE preserves existing grants. Re-assert defensively:
revoke execute on function shared.admin_create_login(uuid, text) from public, anon;
grant execute on function shared.admin_create_login(uuid, text) to authenticated;

-- DOWN: restore the …0626000001 body (drop the unique_violation catch — reverts to the raw 23505).
-- create or replace function shared.admin_create_login(p_person uuid, p_password text default null)
-- returns text language plpgsql security definer set search_path = '' as $$
-- declare
--   v_org uuid := shared.current_org_id(); v_email text; v_uid uuid; v_pw text; v_target shared.people;
-- begin
--   if not shared.has_access_role('admin') then raise exception 'admin access role required' using errcode='42501'; end if;
--   select * into v_target from shared.people where id = p_person;
--   if v_target.id is null or v_target.org_id is distinct from v_org then raise exception 'person not found in your org' using errcode='42501'; end if;
--   if v_target.user_id is not null then raise exception 'person already has a login' using errcode='42501'; end if;
--   v_email := coalesce(v_target.email, '');
--   if v_email = '' then raise exception 'person has no email to provision a login for' using errcode='22023'; end if;
--   v_pw := coalesce(p_password, shared._gen_temp_password()); v_uid := extensions.gen_random_uuid();
--   insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
--     raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, confirmation_token, recovery_token,
--     email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token,
--     reauthentication_token, created_at, updated_at)
--   values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
--     extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
--     '{"provider":"email","providers":["email"]}'::jsonb, '{"email_verified":true}'::jsonb, false, false,
--     '', '', '', '', '', '', '', '', now(), now());
--   insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
--   values (extensions.gen_random_uuid(), v_uid, 'email', v_uid::text,
--     jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', false, 'phone_verified', false), now(), now());
--   update shared.people set user_id = v_uid, updated_at = now() where id = p_person;
--   return v_pw;
-- end; $$;
