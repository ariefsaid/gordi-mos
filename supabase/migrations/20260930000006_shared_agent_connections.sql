-- Connected agent administration (#1062, ADR-0060 D4/D8).
--
-- Supabase Auth v2.189.0 exposes only DELETE /user/oauth/grants for the bearer user. It has no
-- admin revoke-another-user route. This migration mirrors that handler's transaction narrowly:
-- set auth.oauth_consents.revoked_at and delete that user's auth.sessions for exactly one OAuth
-- client. The refresh_tokens.session_id FK cascades. The api_v1 pre-request fence then rejects
-- the deleted session on the next request.
--
-- This deliberately couples to the self-hosted Auth schema and revoke semantics in
-- supabase/auth v2.189.0. The guard below checks the upstream OAuth schema migration marker,
-- referenced column types, unique consent key, revoke privileges, and refresh-token cascade; a
-- changed Auth schema stops this migration before the feature is deployed. Re-check handlers.go
-- and the Auth migrations before upgrading the self-hosted Auth image.
--
-- DOWN (manual; remove the application routes first):
--   drop function shared.admin_revoke_agent_connection(uuid, text);
--   drop function shared.admin_list_agent_connections();
--   drop table api_private.agent_connection_admin_events;
--   alter table shared.trusted_agent_clients
--     drop constraint trusted_agent_clients_oauth_uuid_lower_ck;

do $$
declare
  v_sessions oid := to_regclass('auth.sessions');
  v_consents oid := to_regclass('auth.oauth_consents');
  v_tokens oid := to_regclass('auth.refresh_tokens');
  v_clients oid := to_regclass('auth.oauth_clients');
  v_schema_migrations oid := to_regclass('auth.schema_migrations');
  v_version_column text;
  v_has_oauth_migration boolean;
begin
  if v_sessions is null or v_consents is null or v_tokens is null or v_clients is null
     or v_schema_migrations is null then
    raise exception 'Connected-agent revoke requires the Supabase Auth v2.189.0 OAuth schema';
  end if;

  select a.attname into v_version_column
    from pg_attribute a
   where a.attrelid = v_schema_migrations and a.attnum > 0 and not a.attisdropped
     and a.attname in ('version', 'id')
   order by case a.attname when 'version' then 0 else 1 end
   limit 1;
  if v_version_column is null or not exists (
    select 1 from pg_attribute a where a.attrelid = v_schema_migrations
      and a.attname = v_version_column and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'Connected-agent revoke cannot identify the installed Supabase Auth schema version';
  end if;

  -- OAuth consent schema is introduced by upstream migration 20250804100000.
  execute format(
    'select count(distinct %1$I::text) = 2 from auth.schema_migrations where %1$I::text = any($1)',
    v_version_column
  ) into v_has_oauth_migration using array['20250804100000', '20250904133000']::text[];
  if not coalesce(v_has_oauth_migration, false) then
    raise exception 'Connected-agent revoke requires Auth OAuth consent and OAuth session migrations from the v2.189.0 contract';
  end if;

  if not exists (select 1 from pg_attribute where attrelid = v_consents and attname = 'user_id'
                  and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_consents and attname = 'client_id'
                  and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_consents and attname = 'id'
                  and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_consents and attname = 'granted_at'
                  and atttypid = 'timestamptz'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_consents and attname = 'scopes'
                  and atttypid = 'text'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_consents and attname = 'revoked_at'
                  and atttypid = 'timestamptz'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_sessions and attname = 'user_id'
                  and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_sessions and attname = 'oauth_client_id'
                  and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_sessions and attname = 'id'
                  and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_clients and attname = 'id'
                  and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = v_tokens and attname = 'session_id'
                  and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped) then
    raise exception 'Connected-agent revoke found an incompatible Supabase Auth column contract';
  end if;

  if not has_table_privilege(current_user, v_consents, 'SELECT')
     or not has_table_privilege(current_user, v_consents, 'UPDATE')
     or not has_table_privilege(current_user, v_sessions, 'SELECT')
     or not has_table_privilege(current_user, v_sessions, 'DELETE') then
    raise exception 'Connected-agent revoke requires the migration and function owner to read and revoke Auth consents and sessions';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = v_sessions and c.confrelid = v_clients and c.contype = 'f'
      and c.conname = 'sessions_oauth_client_id_fkey' and c.confdeltype = 'c'
      and (select array_agg(a.attname order by k.ordinality)
             from unnest(c.conkey) with ordinality k(attnum, ordinality)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
          = array['oauth_client_id']::name[]
      and (select array_agg(a.attname order by k.ordinality)
             from unnest(c.confkey) with ordinality k(attnum, ordinality)
             join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
          = array['id']::name[]
  ) then
    raise exception 'Connected-agent revoke requires Auth sessions.oauth_client_id to reference oauth_clients(id)';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = v_consents and c.contype = 'u'
      and c.conname = 'oauth_consents_user_client_unique'
      and (select array_agg(a.attname order by k.ordinality)
             from unnest(c.conkey) with ordinality k(attnum, ordinality)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
          = array['user_id', 'client_id']::name[]
  ) then
    raise exception 'Connected-agent revoke requires the Auth OAuth consent unique (user_id, client_id) key';
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = v_tokens and c.confrelid = v_sessions and c.contype = 'f'
       and c.confdeltype = 'c'
       and (select array_agg(a.attname order by k.ordinality)
              from unnest(c.conkey) with ordinality k(attnum, ordinality)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
           = array['session_id']::name[]
       and (select array_agg(a.attname order by k.ordinality)
              from unnest(c.confkey) with ordinality k(attnum, ordinality)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
           = array['id']::name[]
  ) then
    raise exception 'Connected-agent revoke requires Auth refresh_tokens.session_id ON DELETE CASCADE';
  end if;
end;
$$;

-- OAuth client ids in Auth are UUIDs serialized in lowercase. Fail closed on legacy mixed-case
-- UUID rows and reject new noncanonical UUID rows while preserving non-UUID fence IDs.
do $$
begin
  if exists (
    select 1 from shared.trusted_agent_clients t
     where t.client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and t.client_id <> lower(t.client_id)
  ) then
    raise exception 'Normalize existing OAuth UUID client IDs in shared.trusted_agent_clients to lowercase before deploying connected-agent administration';
  end if;
end;
$$;
alter table shared.trusted_agent_clients
  add constraint trusted_agent_clients_oauth_uuid_lower_ck
  check (
    client_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or client_id = lower(client_id)
  );

create table api_private.agent_connection_admin_events (
  id               bigint generated always as identity primary key,
  org_id           uuid not null,
  actor_person_id  uuid not null,
  target_person_id uuid not null,
  client_id        uuid not null,
  revoked_at       timestamptz not null default now()
);
comment on table api_private.agent_connection_admin_events is
  'Private append-only audit of organization-admin connected-agent revocations (#1062).';
alter table api_private.agent_connection_admin_events enable row level security;
alter table api_private.agent_connection_admin_events force row level security;
revoke all on api_private.agent_connection_admin_events from public, anon, authenticated, service_role;

create or replace function shared.admin_list_agent_connections()
returns table (
  client_id text,
  display_name text,
  enabled boolean,
  person_id uuid,
  person_name text,
  person_archived boolean,
  granted_at timestamptz,
  scopes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
begin
  if v_org is null or not coalesce(shared.has_access_role('admin'), false) then
    raise exception 'Not available' using errcode = '42501';
  end if;

  return query
    select t.client_id, t.display_name, t.enabled,
           p.id, p.full_name, (p.archived_at is not null), c.granted_at, c.scopes
      from shared.trusted_agent_clients t
      left join auth.oauth_consents c
        on c.client_id::text = t.client_id and c.revoked_at is null
       and exists (
         select 1 from shared.people p2
          where p2.user_id = c.user_id and p2.org_id = t.org_id
       )
      left join shared.people p
        on p.user_id = c.user_id and p.org_id = t.org_id
     where t.org_id = v_org
     order by t.display_name, p.full_name nulls first, c.granted_at desc;
end;
$$;
comment on function shared.admin_list_agent_connections() is
  'Lists this organization''s trusted agent apps and their active OAuth connections for admins only. Names come from the trusted allow-list and directory, never OAuth client metadata.';
revoke execute on function shared.admin_list_agent_connections() from public, anon, service_role;
grant execute on function shared.admin_list_agent_connections() to authenticated;

create or replace function shared.admin_revoke_agent_connection(p_person_id uuid, p_client_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_user uuid;
  v_client uuid;
  v_consent_id uuid;
begin
  if v_org is null or v_actor is null or not coalesce(shared.has_access_role('admin'), false) then
    raise exception 'Not available' using errcode = '42501';
  end if;

  if p_client_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_client := p_client_id::uuid;

  select p.user_id into v_user
    from shared.people p
   where p.id = p_person_id and p.org_id = v_org and p.user_id is not null
   for key share;
  if v_user is null or not exists (
    select 1 from shared.trusted_agent_clients t
     where t.org_id = v_org and t.client_id = v_client::text
  ) then
    return false;
  end if;

  select c.id into v_consent_id
    from auth.oauth_consents c
   where c.user_id = v_user and c.client_id = v_client and c.revoked_at is null
   for update;
  if v_consent_id is null then
    return false;
  end if;

  update auth.oauth_consents
     set revoked_at = now()
   where id = v_consent_id and revoked_at is null;

  -- Mirrors Auth v2.189.0 RevokeOAuthSessions; refresh tokens cascade by the guarded FK above.
  delete from auth.sessions s
   where s.user_id = v_user and s.oauth_client_id = v_client;

  insert into api_private.agent_connection_admin_events
    (org_id, actor_person_id, target_person_id, client_id)
  values (v_org, v_actor, p_person_id, v_client);
  return true;
end;
$$;
comment on function shared.admin_revoke_agent_connection(uuid, text) is
  'Admin-only exact user+OAuth-client revoke. Mirrors Supabase Auth v2.189.0: revokes the consent, deletes matching sessions (and cascading refresh tokens), and appends a private audit event atomically. The api_v1 fence rejects a deleted session on its next request.';
revoke execute on function shared.admin_revoke_agent_connection(uuid, text) from public, anon, service_role;
grant execute on function shared.admin_revoke_agent_connection(uuid, text) to authenticated;
