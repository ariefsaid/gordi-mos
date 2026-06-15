-- DEV-ONLY auth provisioning for the one-click demo login (dev-gated UI).
-- Creates a Supabase Auth account for each fictional dev persona from seed.sql
-- and links it via shared.people.user_id, so the localhost demo buttons work.
--
-- Loaded ONLY by local `supabase db reset` (config.toml [db.seed]). Production
-- provisions real accounts via the gitignored production seed and keeps open
-- signup disabled (L5 hardening) — this file never runs there.
--
-- Password for EVERY persona: Passw0rd!dev  (mirrors mos-app DemoLogin.tsx).
-- Fictional .test emails only — NEVER real PII (matches seed.sql header rule).
-- Idempotent: reuses an existing auth user for the email if one already exists.

do $$
declare
  demo_password constant text := 'Passw0rd!dev';
  rec record;
  uid uuid;
begin
  for rec in
    select id, email from shared.people where email like '%.dev@example.test'
  loop
    select u.id into uid from auth.users u where u.email = rec.email;

    if uid is null then
      uid := gen_random_uuid();

      -- The *_token / email_change / phone_change columns must be '' not NULL:
      -- GoTrue scans them as non-nullable Go strings and 500s on NULL
      -- ("converting NULL to string is unsupported").
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        rec.email, crypt(demo_password, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
        '', '', '', '', '', '', '', ''
      );

      -- Email identity row — required for password sign-in in current GoTrue.
      insert into auth.identities (
        provider_id, user_id, identity_data, provider,
        created_at, updated_at, last_sign_in_at
      ) values (
        rec.email, uid,
        jsonb_build_object('sub', uid::text, 'email', rec.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    update shared.people set user_id = uid where id = rec.id;
  end loop;
end $$;
