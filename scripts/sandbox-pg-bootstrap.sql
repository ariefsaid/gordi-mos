-- sandbox-pg-bootstrap.sql
--
-- Supabase-compatibility shim for a bare (non-Docker) PostgreSQL instance, so that
-- supabase/migrations/*.sql and supabase/tests/*.sql (pgTAP) can be applied/run WITHOUT the
-- supabase/postgres Docker image. Built by grepping the migrations for every role, extension,
-- schema and auth.* table/column they touch (see scripts/sandbox-pg.sh header for the audit).
--
-- Run once per fresh database by scripts/sandbox-pg.sh, as the `postgres` superuser, BEFORE
-- supabase/migrations/*.sql. Idempotent (IF NOT EXISTS / DO blocks) so re-running is safe.
--
-- NOT a claim of GoTrue schema perfection: this is a minimal stub covering exactly the auth.*
-- surface this repo's migrations/tests/seeds reference (grep -rn "auth\." supabase/migrations
-- supabase/tests supabase/seed*.sql). If a future migration touches a new auth.users column or a
-- new role, extend this file the same way — grep first, add only what's referenced.

-- ============================================================================================
-- 1. Roles referenced by migrations/tests (grep -hoE roles + GRANT ... TO targets).
--    NOLOGIN/NOINHERIT to mirror the real Supabase roles; service_role gets BYPASSRLS (that is
--    literally how it bypasses RLS in the real stack — no policy special-cases it).
-- ============================================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin noinherit createrole nologin;
    alter role supabase_auth_admin set search_path = 'auth';
  end if;
  -- authenticator: not exercised by migrations directly (no PostgREST in Priority-1 path), but
  -- cheap to create for parity / in case Priority-2's Node proxy later authenticates through it.
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login noreplication;
    grant anon, authenticated, service_role to authenticator;
  end if;
end
$$;

-- ============================================================================================
-- 2. Extensions. grep -hn "extensions\.\|gen_random_uuid\|CREATE EXTENSION" migrations/*.sql:
--    pgcrypto (extensions.gen_random_uuid/gen_random_bytes/crypt/gen_salt) lives in an
--    `extensions` schema, same as the real stack. pgtap is created lazily by each test file
--    itself (`create extension if not exists pgtap with schema extensions;`) but pg needs the
--    extension files installed (apt: postgresql-16-pgtap) and this schema to exist first.
-- ============================================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

grant usage on schema extensions to anon, authenticated, service_role;

-- ============================================================================================
-- 3. auth schema — minimal GoTrue-shaped stub. Columns are exactly the ones
--    supabase/migrations/*.sql + supabase/seed.dev-auth.sql insert/update/select
--    (grep -n "auth\.users\|auth\.identities" supabase/migrations/*.sql supabase/seed*.sql).
-- ============================================================================================
create schema if not exists auth;
grant usage on schema auth to supabase_auth_admin;
alter schema auth owner to supabase_auth_admin;

create table if not exists auth.users (
  instance_id                 uuid,
  id                           uuid primary key default extensions.gen_random_uuid(),
  aud                          varchar(255),
  role                         varchar(255),
  email                        varchar(255),
  encrypted_password           varchar(255),
  email_confirmed_at           timestamptz,
  invited_at                   timestamptz,
  confirmation_token           varchar(255) default '',
  confirmation_sent_at         timestamptz,
  recovery_token                varchar(255) default '',
  recovery_sent_at             timestamptz,
  email_change_token_new       varchar(255) default '',
  email_change                 varchar(255) default '',
  email_change_sent_at         timestamptz,
  last_sign_in_at              timestamptz,
  raw_app_meta_data             jsonb,
  raw_user_meta_data            jsonb,
  is_super_admin                boolean,
  created_at                    timestamptz,
  updated_at                    timestamptz,
  phone                         text,
  phone_confirmed_at            timestamptz,
  phone_change                  text default '',
  phone_change_token            varchar(255) default '',
  phone_change_sent_at          timestamptz,
  email_change_token_current    varchar(255) default '',
  email_change_confirm_status   smallint default 0,
  banned_until                  timestamptz,
  reauthentication_token        varchar(255) default '',
  reauthentication_sent_at      timestamptz,
  is_sso_user                   boolean not null default false,
  deleted_at                    timestamptz,
  is_anonymous                  boolean not null default false
);
alter table auth.users owner to supabase_auth_admin;
create unique index if not exists users_email_partial_key on auth.users (email) where deleted_at is null;

create table if not exists auth.identities (
  id             uuid primary key default extensions.gen_random_uuid(),
  provider_id    text not null,
  user_id        uuid not null references auth.users (id) on delete cascade,
  identity_data  jsonb not null,
  provider       text not null,
  last_sign_in_at timestamptz,
  created_at     timestamptz,
  updated_at     timestamptz,
  email          text generated always as (lower(identity_data ->> 'email')) stored,
  unique (provider_id, provider)
);
alter table auth.identities owner to supabase_auth_admin;

-- supabase_auth_admin owns + reads/writes the auth schema (GoTrue's own role, real stack parity).
-- postgres (script runner / SECURITY DEFINER "owner" role) needs unrestricted access too: several
-- migrations INSERT/UPDATE auth.users/auth.identities from SECURITY DEFINER functions that
-- `set search_path = ''` and run as `postgres` (see 20260626000001_admin_provisioning_rpcs.sql,
-- 20260626000002_admin_users_test_seed.sql, seed.dev-auth.sql's `do $$ ... $$` block).
grant all privileges on all tables in schema auth to postgres, supabase_auth_admin;
grant usage on all sequences in schema auth to postgres, supabase_auth_admin;

-- authenticated has NO direct grant on auth.* in the real stack either (GoTrue owns it; the app
-- only ever reaches it through SECURITY DEFINER RPCs) — deliberately absent here.

-- ============================================================================================
-- 4. auth.uid() / auth.jwt() / auth.role() / auth.email() — the standard Supabase stubs, reading
--    request.jwt.claims exactly like shared._claim_uuid() does (20260611000004_helpers.sql).
--    Not currently called by this repo's migrations/tests (grep found none — shared.current_org_id()
--    etc. read the same GUC directly), but requested compatibility surface + cheap insurance for
--    any future migration that assumes the standard Supabase auth.* helpers exist.
-- ============================================================================================
create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select
      coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
  $$;

create or replace function auth.role() returns text
  language sql stable
  as $$
    select
      coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
      )::text
  $$;

create or replace function auth.email() returns text
  language sql stable
  as $$
    select
      coalesce(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
      )::text
  $$;

create or replace function auth.jwt() returns jsonb
  language sql stable
  as $$
    select nullif(current_setting('request.jwt.claims', true), '')::jsonb
  $$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant execute on function auth.email() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
