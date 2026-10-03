-- Google sign-in links only to a login already provisioned for one verified directory person.
-- DOWN: drop trigger guard_google_identity_link on auth.identities;
--       drop trigger guard_google_user_creation on auth.users;
--       drop function shared._guard_google_identity_link();
--       drop function shared._guard_google_user_creation();

create or replace function shared._guard_google_user_creation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A Google identity may be attached to an existing provisioned login; this path does not create one.
  if new.raw_app_meta_data ->> 'provider' = 'google'
     or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google' then
    raise exception 'Google sign-in requires one provisioned, verified account. Ask an admin for help.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
comment on function shared._guard_google_user_creation() is
  'Keeps Google sign-in on existing provisioned logins; Google sign-in does not create auth accounts.';
revoke execute on function shared._guard_google_user_creation() from public, anon, authenticated;

drop trigger if exists guard_google_user_creation on auth.users;
create trigger guard_google_user_creation
before insert on auth.users
for each row execute function shared._guard_google_user_creation();

create or replace function shared._guard_google_identity_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_match_count bigint;
  v_person_user_id uuid;
begin
  if new.provider is distinct from 'google' then
    return new;
  end if;

  v_email := new.identity_data ->> 'email';
  if new.identity_data ->> 'email_verified' is distinct from 'true' then
    raise exception 'Google sign-in requires one provisioned, verified account. Ask an admin for help.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_match_count
    from shared.people p
   where lower(p.email) = lower(v_email);
  if v_match_count <> 1 then
    raise exception 'Google sign-in requires one provisioned, verified account. Ask an admin for help.'
      using errcode = 'P0001';
  end if;

  select p.user_id into v_person_user_id
    from shared.people p
   where lower(p.email) = lower(v_email);
  if v_person_user_id is distinct from new.user_id
     or not exists (
       select 1
         from auth.users u
        where u.id = new.user_id
          and lower(u.email) = lower(v_email)
     ) then
    raise exception 'Google sign-in requires one provisioned, verified account. Ask an admin for help.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
comment on function shared._guard_google_identity_link() is
  'Links a verified Google identity only to the one provisioned person and that person’s existing auth login.';
revoke execute on function shared._guard_google_identity_link() from public, anon, authenticated;

drop trigger if exists guard_google_identity_link on auth.identities;
create trigger guard_google_identity_link
before insert on auth.identities
for each row execute function shared._guard_google_identity_link();

-- Existing Google identities also pass this check when GoTrue issues an OAuth token. The insert
-- triggers above prevent account/identity creation; this hook covers later Google sign-ins after an
-- identity has already been linked. Password sign-ins and agent OAuth tokens remain unchanged.
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
  v_user_id  uuid;
  v_google_email text;
  v_google_verified text;
  v_google_match_count bigint;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_user_id := (event ->> 'user_id')::uuid;

  if event ->> 'authentication_method' = 'oauth' and not (claims ? 'client_id') then
    select i.identity_data ->> 'email', i.identity_data ->> 'email_verified'
      into v_google_email, v_google_verified
      from auth.identities i
     where i.user_id = v_user_id
       and i.provider = 'google';

    if found then
      select count(*) into v_google_match_count
        from shared.people p
       where lower(p.email) = lower(v_google_email);

      if v_google_verified is distinct from 'true'
         or v_google_match_count <> 1
         or not exists (
           select 1
             from shared.people p
             join auth.users u on u.id = p.user_id
            where p.user_id = v_user_id
              and lower(p.email) = lower(v_google_email)
              and lower(u.email) = lower(v_google_email)
         ) then
        return jsonb_build_object('error', jsonb_build_object(
          'http_code', 403,
          'message', 'Google sign-in requires one provisioned, verified account. Ask an admin for help.'
        ));
      end if;
    end if;
  end if;

  select p.* into v_person
  from shared.people p
  where p.user_id = v_user_id
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
  'Auth hook: stamps directory claims, fences agent tokens, and validates linked Google identities on OAuth sign-in.';
revoke execute on function shared.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;
