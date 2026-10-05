-- Current role assignments and administrator credential changes take effect on the next request.
--
-- DOWN (manual): drop shared._test_set_access_roles(text); restore shared.current_access_roles()
-- and shared.has_access_role(text) and the shared.can(text) comment from
-- 20260805000002_shared_access_control.sql; restore shared.admin_reset_password(uuid, text) from
-- 20260805000003_shared_admin_provisioning.sql; restore
-- shared.admin_set_login_enabled(uuid, boolean) from
-- 20260930000048_shared_login_disable_ends_agent_connections.sql; set
-- auth.email.secure_password_change = false in supabase/config.toml.

drop function if exists shared._test_set_access_roles(jsonb);

create or replace function shared._test_set_access_roles(p_claims text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims    jsonb;
  v_person_id uuid;
  v_org_id    uuid;
  v_role      text;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'test fixture helper is restricted to local database tests' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claims', '{}', true);
  begin
    v_claims := p_claims::jsonb;
  exception when invalid_text_representation then
    v_claims := null;
  end;
  begin
    v_person_id := nullif(v_claims ->> 'person_id', '')::uuid;
  exception when invalid_text_representation then
    v_person_id := null;
  end;

  if v_person_id is not null then
    select pe.org_id into v_org_id from shared.people pe where pe.id = v_person_id;
    if v_org_id is not null then
      delete from shared.person_access_roles par where par.person_id = v_person_id;
      for v_role in
        select distinct roles.value
          from jsonb_array_elements_text(
            case when jsonb_typeof(v_claims -> 'access_roles') = 'array'
              then v_claims -> 'access_roles' else '[]'::jsonb end
          ) as roles(value)
         where roles.value is not null
      loop
        -- Let the role domain own its vocabulary; stale fixture-only values are ignored.
        begin
          insert into shared.person_access_roles (org_id, person_id, access_role)
          values (v_org_id, v_person_id, v_role::shared.access_role);
        exception when check_violation then
          null;
        end;
      end loop;
    end if;
  end if;

  perform set_config('request.jwt.claims', coalesce(p_claims, '{}'), true);
end;
$$;
comment on function shared._test_set_access_roles(text) is
  'TEST-ONLY fixture: mirrors the supplied role claim into live assignments for its person; API sessions cannot use it.';
revoke execute on function shared._test_set_access_roles(text) from public, anon, authenticated, service_role;
grant execute on function shared._test_set_access_roles(text) to authenticated;

create or replace function shared.current_access_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(par.access_role::text order by par.access_role::text), '{}'::text[])
    from shared.person_access_roles par
   where par.person_id = shared.current_person_id()
     and par.org_id = shared.current_org_id()
     and par.revoked_at is null
$$;
comment on function shared.current_access_roles() is
  'Current non-revoked access roles for the caller''s claimed person and org. A role change takes effect on the next request.';
revoke execute on function shared.current_access_roles() from public, anon;
grant execute on function shared.current_access_roles() to authenticated, service_role;

create or replace function shared._claim_text_array(claim_key text)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  raw text := current_setting('request.jwt.claims', true);
begin
  if claim_key = 'access_roles' then
    return shared.current_access_roles();
  end if;
  if raw is null or btrim(raw) = '' then
    return '{}'::text[];
  end if;
  return coalesce(
    (select array_agg(value::text)
       from jsonb_array_elements_text((raw::jsonb -> claim_key)) as t(value)),
    '{}'::text[]);
exception
  when others then
    return '{}'::text[];
end;
$$;
comment on function shared._claim_text_array(text) is
  'Defensive claim-array extraction. access_roles is resolved from current assignments rather than the JWT; malformed/absent/non-array claims return {}.';

create or replace function shared.has_access_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_role = any(shared.current_access_roles()), false)
$$;
comment on function shared.has_access_role(text) is
  'True iff the caller holds the current org-scoped access role p_role. A role change takes effect on the next request.';
revoke execute on function shared.has_access_role(text) from public, anon;
grant execute on function shared.has_access_role(text) to authenticated, service_role;
comment on function shared.can(text) is
  'True iff the caller''s current org-scoped assignments grant capability p. Uses shared.current_access_roles() and role_capabilities; SECURITY INVOKER.';

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
  delete from auth.sessions s where s.user_id = v_target.user_id;
  return v_pw;
end;
$$;
comment on function shared.admin_reset_password(uuid, text) is
  'ADR-0016 provisioning: reset a login password (admin + org gated), delete its sessions and refresh tokens, and flag password rotation. Returns the new temp password ONCE. SECURITY DEFINER.';
revoke execute on function shared.admin_reset_password(uuid, text) from public, anon;
grant execute on function shared.admin_reset_password(uuid, text) to authenticated;

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
  if p_enabled is null then
    raise exception 'p_enabled is required' using errcode = '22023';
  end if;
  select * into v_target from shared.people where id = p_person;
  if v_target.id is null or v_target.org_id is distinct from v_org then
    raise exception 'person not found in your org' using errcode = '42501';
  end if;
  if v_target.user_id is null then
    raise exception 'person has no login' using errcode = '22023';
  end if;

  -- The last active admin login remains enabled.
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

  if not p_enabled then
    perform api_private._end_agent_connections(v_target.org_id, v_target.user_id, null);
    delete from auth.sessions s where s.user_id = v_target.user_id;
  end if;
end;
$$;
comment on function shared.admin_set_login_enabled(uuid, boolean) is
  'ADR-0016 provisioning: disable or enable a login (admin + org gated). Disabling also ends the person''s agent connections and deletes all sessions and refresh tokens in the same transaction. The last active admin cannot be disabled. SECURITY DEFINER.';
revoke execute on function shared.admin_set_login_enabled(uuid, boolean) from public, anon;
grant execute on function shared.admin_set_login_enabled(uuid, boolean) to authenticated;
