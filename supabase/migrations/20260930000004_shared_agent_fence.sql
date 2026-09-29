-- shared — the agent fence (#1005, ADR-0060 D3/D4/D5).
--
-- Tokens the login service issues to an OAuth client (an AI agent) carry a `client_id` claim; an
-- app session never does. This migration makes such a token reach only the versioned API:
--   1. shared.trusted_agent_clients — the per-org allow-list of agent apps an admin has switched on.
--   2. shared.agent_access_settings — the one-row, operator-set resource identifier the hook stamps
--      into `aud`.
--   3. `agent.connect` — a role-authority action (default: the admin category, org-wide).
--   4. api_private.check_request() — the data API's pre-request function, set on the `authenticator`
--      role here so it travels to every environment with the schema.
--   5. shared.custom_access_token_hook — gains the `client_id` branch.
--
-- The fence refuses only tokens that carry `client_id`; app tokens return on its first line.
--
-- DOWN (manual, in order):
--   alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
--   revoke usage on schema api_private from anon, service_role;
--   drop function api_private.check_request(); drop function api_private._agent_fence(text);
--   -- restore shared.custom_access_token_hook and shared._role_authority_defaults() from the
--   -- migrations that defined them (20260805000002, 20260918000001);
--   delete from shared.role_authority where action = 'agent.connect';
--   alter table shared.role_authority drop constraint role_authority_action_ck,
--     add constraint role_authority_action_ck check (action in ('workline.manage','objective.manage',
--       'signal.post','signal.tag','signal.retract','process.start','process.close'));
--   drop table shared.agent_access_settings; drop table shared.trusted_agent_clients;
--   drop function shared._guard_trusted_agent_clients();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The allow-list of trusted agent clients
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table shared.trusted_agent_clients (
  org_id       uuid not null default shared.current_org_id()
                 references shared.orgs(id) on delete cascade,
  client_id    text not null check (btrim(client_id) <> '' and length(client_id) <= 200),
  display_name text not null check (btrim(display_name) <> '' and length(display_name) <= 100),
  enabled      boolean not null default false,
  added_by     uuid references shared.people(id) on delete set null,
  added_at     timestamptz not null default now(),
  updated_by   uuid references shared.people(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (org_id, client_id)
);
comment on table shared.trusted_agent_clients is
  'Per-org allow-list of OAuth client apps (AI agents) an admin has switched on. Registering a client '
  'grants nothing: the access-token hook refuses to mint a token, and api_private.check_request() '
  'refuses every request, for a client that is not enabled here for the person''s org. Display names '
  'come from this table, never from the client. Rows are switched off, never deleted.';
comment on column shared.trusted_agent_clients.client_id is
  'The OAuth client id exactly as the login service puts it in the token''s client_id claim.';

alter table shared.trusted_agent_clients enable row level security;
alter table shared.trusted_agent_clients force  row level security;
revoke all on shared.trusted_agent_clients from public, anon, authenticated;
grant select, insert, update on shared.trusted_agent_clients to authenticated;

create policy trusted_agent_clients_select_org on shared.trusted_agent_clients
  for select to authenticated
  using (org_id = shared.current_org_id());
create policy trusted_agent_clients_insert_admin on shared.trusted_agent_clients
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
create policy trusted_agent_clients_update_admin on shared.trusted_agent_clients
  for update to authenticated
  using      (org_id = shared.current_org_id() and shared.has_access_role('admin'))
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
comment on policy trusted_agent_clients_select_org on shared.trusted_agent_clients is
  'Any signed-in member of the org reads its allow-list (the consent page shows display names).';
comment on policy trusted_agent_clients_insert_admin on shared.trusted_agent_clients is
  'Admin-only, own org only. There is no delete policy: a client is switched off, not removed.';
comment on policy trusted_agent_clients_update_admin on shared.trusted_agent_clients is
  'Admin-only, own org only. Identity columns are immutable (guard trigger).';

create or replace function shared._guard_trusted_agent_clients()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id
       or new.client_id is distinct from old.client_id
       or new.added_by is distinct from old.added_by
       or new.added_at is distinct from old.added_at then
      raise exception 'org_id, client_id and the adder are immutable on trusted_agent_clients'
        using errcode = '42501';
    end if;
    new.updated_by := shared.current_person_id();
    new.updated_at := now();
  else
    new.added_by   := shared.current_person_id();
    new.added_at   := now();
    new.updated_by := new.added_by;
    new.updated_at := new.added_at;
  end if;
  return new;
end;
$$;
comment on function shared._guard_trusted_agent_clients() is
  'Guard for the agent allow-list: identity columns immutable, adder and editor stamped server-side. '
  'SECURITY INVOKER.';
revoke execute on function shared._guard_trusted_agent_clients() from public, anon, authenticated;
create trigger trusted_agent_clients_guard
  before insert or update on shared.trusted_agent_clients
  for each row execute function shared._guard_trusted_agent_clients();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The resource identifier the hook binds agent tokens to (one row, set per environment)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table shared.agent_access_settings (
  singleton    boolean primary key default true check (singleton),
  mcp_resource text check (mcp_resource is null or btrim(mcp_resource) <> ''),
  updated_at   timestamptz not null default now()
);
comment on table shared.agent_access_settings is
  'One row. mcp_resource is the audience identifier the access-token hook puts in `aud` for agent '
  'tokens. Set by the operator per environment; NULL until set, and while it is NULL the hook refuses '
  'to mint any agent token. No application role can read or write it.';
insert into shared.agent_access_settings (singleton) values (true);
alter table shared.agent_access_settings enable row level security;
alter table shared.agent_access_settings force  row level security;
revoke all on shared.agent_access_settings from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. agent.connect in the role-authority matrix
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table shared.role_authority
  drop constraint role_authority_action_ck,
  add constraint role_authority_action_ck check (action in (
    'workline.manage', 'objective.manage', 'signal.post', 'signal.tag', 'signal.retract',
    'process.start', 'process.close', 'agent.connect'));

create or replace function shared._role_authority_defaults()
returns table(action text, role text, default_scope text, allowed_scopes text[])
language sql
immutable
set search_path = ''
as $$
  with actions(action, allowed_scopes) as (
    values
      ('workline.manage',  array['none','own_bu','org']::text[]),
      ('objective.manage',  array['none','own_bu','org']::text[]),
      ('signal.post',      array['none','org']::text[]),
      ('signal.tag',       array['none','org']::text[]),
      ('signal.retract',   array['none','own','own_team','own_bu','org']::text[]),
      ('process.start',    array['none','own_team','org']::text[]),
      ('process.close',    array['none','own','own_team','org']::text[]),
      ('agent.connect',    array['none','org']::text[])
  ),
  roles(role) as (
    values
      ('member'), ('team_lead'), ('bu_head'), ('ops_lead'), ('admin'),
      ('finance'), ('manager'), ('supervisor')
  ),
  defaults(action, role, default_scope) as (
    values
      ('workline.manage',  'member',     'none'),
      ('workline.manage',  'team_lead',  'none'),
      ('workline.manage',  'bu_head',    'own_bu'),
      ('workline.manage',  'ops_lead',   'org'),
      ('workline.manage',  'admin',      'org'),
      ('workline.manage',  'finance',    'none'),
      ('workline.manage',  'manager',    'none'),
      ('workline.manage',  'supervisor', 'none'),

      ('objective.manage',  'member',     'none'),
      ('objective.manage',  'team_lead',  'none'),
      ('objective.manage',  'bu_head',    'own_bu'),
      ('objective.manage',  'ops_lead',   'org'),
      ('objective.manage',  'admin',      'org'),
      ('objective.manage',  'finance',    'none'),
      ('objective.manage',  'manager',    'none'),
      ('objective.manage',  'supervisor', 'none'),

      ('signal.post',      'member',     'org'),
      ('signal.post',      'team_lead',  'none'),
      ('signal.post',      'bu_head',    'none'),
      ('signal.post',      'ops_lead',   'org'),
      ('signal.post',      'admin',      'org'),
      ('signal.post',      'finance',    'none'),
      ('signal.post',      'manager',    'none'),
      ('signal.post',      'supervisor', 'none'),

      ('signal.tag',       'member',     'org'),
      ('signal.tag',       'team_lead',  'org'),
      ('signal.tag',       'bu_head',    'org'),
      ('signal.tag',       'ops_lead',   'org'),
      ('signal.tag',       'admin',      'org'),
      ('signal.tag',       'finance',    'org'),
      ('signal.tag',       'manager',    'org'),
      ('signal.tag',       'supervisor', 'org'),

      ('signal.retract',   'member',     'own'),
      ('signal.retract',   'team_lead',  'own_team'),
      ('signal.retract',   'bu_head',    'own_bu'),
      ('signal.retract',   'ops_lead',   'org'),
      ('signal.retract',   'admin',      'org'),
      ('signal.retract',   'finance',    'none'),
      ('signal.retract',   'manager',    'none'),
      ('signal.retract',   'supervisor', 'none'),

      ('process.start',    'member',     'own_team'),
      ('process.start',    'team_lead',  'none'),
      ('process.start',    'bu_head',    'none'),
      ('process.start',    'ops_lead',   'org'),
      ('process.start',    'admin',      'org'),
      ('process.start',    'finance',    'none'),
      ('process.start',    'manager',    'none'),
      ('process.start',    'supervisor', 'none'),

      ('process.close',    'member',     'own'),
      ('process.close',    'team_lead',  'own_team'),
      ('process.close',    'bu_head',    'none'),
      ('process.close',    'ops_lead',   'org'),
      ('process.close',    'admin',      'org'),
      ('process.close',    'finance',    'none'),
      ('process.close',    'manager',    'none'),
      ('process.close',    'supervisor', 'none'),

      ('agent.connect',    'member',     'none'),
      ('agent.connect',    'team_lead',  'none'),
      ('agent.connect',    'bu_head',    'none'),
      ('agent.connect',    'ops_lead',   'none'),
      ('agent.connect',    'admin',      'org'),
      ('agent.connect',    'finance',    'none'),
      ('agent.connect',    'manager',    'none'),
      ('agent.connect',    'supervisor', 'none')
  )
  select d.action, d.role, d.default_scope, a.allowed_scopes
    from defaults d
    join actions a on a.action = d.action
    join roles r on r.role = d.role
   order by d.action, case r.role
       when 'member' then 1 when 'team_lead' then 2 when 'bu_head' then 3
       when 'ops_lead' then 4 when 'admin' then 5 when 'finance' then 6
       when 'manager' then 7 else 8 end;
$$;
comment on function shared._role_authority_defaults() is
  'Complete settings surface: eight actions x eight categories = 64 rows. signal.post and signal.tag '
  'default to org for every role; signal.retract keeps scoped defaults; agent.connect (an AI agent may '
  'act for the person) defaults to the admin category only and admits just none or org.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. The fence
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PostgREST runs the pre-request function as the request role, after it has set the request's
-- claims and its search path (the schema named by the profile header first). The entry point is
-- SECURITY INVOKER with NO search_path of its own, because a pinned path would hide the one thing it
-- must read; every name in it is qualified. It reads the request schema, then hands the decisions to
-- a definer helper, which needs auth.sessions and has an empty path of its own.
create or replace function api_private._agent_fence(p_schema text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_uuid   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_client text := v_claims ->> 'client_id';
  v_sub    uuid := case when v_claims ->> 'sub'        ~* v_uuid then (v_claims ->> 'sub')::uuid end;
  v_sid    uuid := case when v_claims ->> 'session_id' ~* v_uuid then (v_claims ->> 'session_id')::uuid end;
  v_org    uuid := shared.current_org_id();
begin
  -- Messages are fixed and say nothing about which check failed.
  if p_schema is distinct from 'api_v1' then
    raise exception 'Not available to agent sessions.' using errcode = 'PT403';
  end if;

  if v_client is null or v_sub is null or v_sid is null or v_org is null
     or not exists (
       select 1 from auth.sessions s
        where s.id = v_sid and s.user_id = v_sub
          and (s.not_after is null or s.not_after > now()))
     or not exists (
       select 1 from shared.trusted_agent_clients t
        where t.org_id = v_org and t.client_id = v_client and t.enabled) then
    raise exception 'Agent session is not valid.' using errcode = 'PT401';
  end if;

  if not shared.role_authority_allows('agent.connect') then
    raise exception 'Agent access isn''t switched on for you yet.' using errcode = 'PT403';
  end if;
end;
$$;
comment on function api_private._agent_fence(text) is
  'Decisions of the agent fence for a request that carries a client_id claim (ADR-0060 D5): 403 unless '
  'the request schema is api_v1; 401 unless the token''s session still exists and the client is '
  'enabled for the person''s org; 403 unless agent.connect allows the person. SECURITY DEFINER for '
  'auth.sessions; called only by api_private.check_request().';
revoke execute on function api_private._agent_fence(text) from public, anon, authenticated;
grant  execute on function api_private._agent_fence(text) to authenticated;

create or replace function api_private.check_request()
returns void
language plpgsql
as $$
declare
  v_claims pg_catalog.jsonb := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb;
begin
  -- The app's own tokens, API v1 session tokens and anonymous calls carry no client_id: nothing to do.
  if v_claims is null or not pg_catalog.jsonb_exists(v_claims, 'client_id') then
    return;
  end if;
  -- The request schema is the first entry of the search path PostgREST sets (quoted, comma-separated).
  perform api_private._agent_fence(
    pg_catalog.btrim(pg_catalog.split_part(pg_catalog.current_setting('search_path'), ',', 1), ' "'));
end;
$$;
comment on function api_private.check_request() is
  'The data API''s pre-request function (pgrst.db_pre_request on the authenticator role). Returns '
  'immediately for any request without a client_id claim; otherwise refuses unless the agent fence '
  'passes. SECURITY INVOKER with no search_path of its own so it can read the request schema. '
  'Executable by anon, authenticated and service_role (each holds USAGE on api_private): PostgREST runs it as the request role, and an '
  'anonymous request passes untouched.';
revoke execute on function api_private.check_request() from public, anon, authenticated;
-- All three request roles run it: PostgREST resolves the pre-request function as the request role,
-- which needs the schema too. Anonymous requests carry no client_id and return on the first line.
-- Nothing else in api_private is executable by anon or service_role.
grant  execute on function api_private.check_request() to anon, authenticated, service_role;
grant usage on schema api_private to anon, service_role;

alter role authenticator set pgrst.db_pre_request = 'api_private.check_request';
notify pgrst, 'reload config';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. The access-token hook: the client branch
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Unchanged for a token without a client_id. For one WITH a client_id (an OAuth-issued token, also
-- on refresh) the hook binds the audience to the configured resource and keeps role = authenticated;
-- it refuses with an http_code error (a raised exception would leak its message as a 500) unless
-- the person is live, the client is enabled for the person's org and a resource is configured.
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
  v_resource text;
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
    -- No live person resolves, so the hook has no identity and no tenant to state, and it says so
    -- explicitly rather than by omission. All THREE claims are written, because the hook's output is
    -- a function of the LOOKUP: `event -> 'claims'` is an input the hook copies forward, so every
    -- claim the hook owns is stated on every path, whatever arrived under those keys. Identity and
    -- tenant travel together — shared.current_org_id() reads the org_id claim and every org-scoped
    -- policy resolves through it — so the three are one statement and are cleared as one. NULL
    -- rather than absent, for the same reason access_roles is '[]' rather than absent:
    -- shared._claim_uuid returns NULL for both, so the fail-closed result is identical, and a
    -- present-and-null claim is legible to anyone reading a decoded token, where a missing key reads
    -- as "the hook did not run".
    claims := jsonb_set(claims, '{org_id}',       'null'::jsonb, true);
    claims := jsonb_set(claims, '{person_id}',    'null'::jsonb, true);
    claims := jsonb_set(claims, '{access_roles}', '[]'::jsonb,   true);
  end if;

  if claims ? 'client_id' then
    select s.mcp_resource into v_resource from shared.agent_access_settings s;
    if v_person.id is null
       or v_resource is null
       or not exists (
         select 1 from shared.trusted_agent_clients t
          where t.org_id = v_person.org_id
            and t.client_id = claims ->> 'client_id'
            and t.enabled) then
      return jsonb_build_object('error',
        jsonb_build_object('http_code', 403, 'message', 'Agent access is not available.'));
    end if;
    claims := jsonb_set(claims, '{aud}', to_jsonb(v_resource), true);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
comment on function shared.custom_access_token_hook(jsonb) is
  'Auth hook: stamps org_id + person_id + access_roles (the non-revoked assigned set) from shared.*. '
  'OD-P1-1/2, ADR-0011 D5. When no live person resolves it states all three as empty. For a token that '
  'carries a client_id (an agent) it also sets aud to the configured resource identifier, or refuses '
  'with an http_code 403 unless the person is live, the client is enabled for their org and a resource '
  'is configured (ADR-0060 D3/D4).';
revoke execute on function shared.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant  execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;
