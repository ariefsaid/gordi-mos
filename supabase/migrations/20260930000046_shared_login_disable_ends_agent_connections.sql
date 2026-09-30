-- Disabling a login ends the person's agent connections (#1063).
--
-- shared.admin_set_login_enabled(person, false) blocks the login through auth.users.banned_until.
-- It now also revokes every agent consent the person holds and deletes their agent sessions and
-- refresh tokens (api_private._end_agent_connections), in the same transaction. Enabling the login
-- again revives no connection, and a null flag is refused. It is the only path in the schema that
-- sets banned_until.
--
-- DOWN (manual): restore shared.admin_set_login_enabled from
-- 20260805000003_shared_admin_provisioning.sql.

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

  -- A login that cannot sign in also has no agent connection, ended in the same transaction.
  if not p_enabled then
    perform api_private._end_agent_connections(v_target.org_id, v_target.user_id, null);
  end if;
end;
$$;

comment on function shared.admin_set_login_enabled(uuid, boolean) is
  'ADR-0016 provisioning: disable (banned_until = now()+100y, far-future finite) / enable (NULL) a login (admin + org gated). Disabling also ends the person''s agent connections in the same transaction; enabling revives none. No-lockout: the last active admin cannot be disabled (FR-041). SECURITY DEFINER.';
