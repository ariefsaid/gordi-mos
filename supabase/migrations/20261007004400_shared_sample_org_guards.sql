-- A sample organisation is a test bench on the same project as the real one. Three rules make that
-- true by construction, all keyed on one org flag (shared.orgs.is_sample) read through one helper
-- (shared.is_sample_org):
--   1. A sample org never sends anything to the ERP. Its approvals still complete, but the outbox
--      stores every sample-org row as dry_run, which no worker drains, decided by the row's org so
--      an enqueue with no session is covered too. Any claim, post, retarget or move of a sample-org
--      row is refused for every role. Flagging an org retires the outbox rows it still had queued
--      or in flight.
--   2. A sample account (@sample.gordi.test, the accounts the one-click sample login uses) is issued
--      a token only for a person in a sample org, and a person in a sample org only for a sample
--      account.
--   3. Only an org named Gordi Sample whose people all have @sample.gordi.test addresses can be
--      flagged (shared.is_sample_org_shape). Once flagged it stays flagged, keeps that name, and
--      takes only people at sample addresses.
--
-- DOWN (manual, reversible):
--   drop trigger esb_push_sample_org_guard on integrations.esb_push;
--   drop trigger esb_push_groups_sample_org_guard on integrations.esb_push_groups;
--   drop function integrations._guard_sample_org_outbox();
--   drop trigger orgs_sample_flag_guard on shared.orgs;
--   drop function shared._guard_sample_org_flag();
--   drop trigger people_sample_org_address_guard on shared.people;
--   drop function shared._guard_sample_org_people();
--   drop trigger orgs_sample_flag_retire_outbox on shared.orgs;
--   drop function integrations._retire_sample_org_outbox();
--   restore shared.custom_access_token_hook(jsonb) from 20261006002300_shared_hardening_lows.sql;
--   drop function shared.is_sample_org(uuid);
--   restore supabase/seed.sample-org-money.sql's inline refusal check;
--   drop function shared.is_sample_org_shape(uuid, text);
--   drop function shared.is_sample_address(text);
--   alter table shared.orgs drop column is_sample;
--   (rows this migration retired to dead_letter keep that status; requeue them deliberately.)

begin;

-- ── The flag and its one reader ──────────────────────────────────────────────────────────────
alter table shared.orgs add column is_sample boolean not null default false;
comment on column shared.orgs.is_sample is
  'True for a sample (test-bench) organisation: it never sends anything to the ERP and only sample accounts sign in to it. Once true it stays true.';

-- SECURITY DEFINER so an RLS-filtered caller cannot read "no row" and fail open as a real org.
create or replace function shared.is_sample_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select o.is_sample from shared.orgs o where o.id = p_org_id), false)
$$;
comment on function shared.is_sample_org(uuid) is
  'The one reader of shared.orgs.is_sample: true only for an existing sample org. Unknown or null ids read false. SECURITY DEFINER.';
revoke execute on function shared.is_sample_org(uuid) from public, anon, authenticated;

-- The sample login's accounts are the @sample.gordi.test addresses. A missing address is not one.
create or replace function shared.is_sample_address(p_email text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(lower(p_email) like '%@sample.gordi.test', false)
$$;
comment on function shared.is_sample_address(text) is
  'True for an @sample.gordi.test address, in any letter case; false for any other or no address.';
revoke execute on function shared.is_sample_address(text) from public, anon, authenticated;

-- The shape a sample org must have, used by the flag guard and by seed.sample-org-money.sql.
create or replace function shared.is_sample_org_shape(p_org_id uuid, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_name = 'Gordi Sample'
     and not exists (
       select 1 from shared.people p
        where p.org_id = p_org_id
          and not shared.is_sample_address(p.email))
$$;
comment on function shared.is_sample_org_shape(uuid, text) is
  'True when an org with this id and name may be a sample org: it is named Gordi Sample and every person in it, archived or not, has an @sample.gordi.test address. SECURITY DEFINER.';
revoke execute on function shared.is_sample_org_shape(uuid, text) from public, anon, authenticated;

create or replace function shared._guard_sample_org_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_sample and not new.is_sample then
    raise exception 'a sample organisation stays a sample organisation' using errcode = '42501';
  end if;
  if new.is_sample and not shared.is_sample_org_shape(new.id, new.name) then
    raise exception 'only an org named Gordi Sample whose people all have @sample.gordi.test addresses can be a sample organisation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function shared._guard_sample_org_flag() is
  'Refuses clearing shared.orgs.is_sample, and refuses a flagged org (on insert, flagging or rename) that fails shared.is_sample_org_shape, for every role. SECURITY DEFINER.';
revoke execute on function shared._guard_sample_org_flag() from public, anon, authenticated;

create trigger orgs_sample_flag_guard
  before insert or update of is_sample, name on shared.orgs
  for each row execute function shared._guard_sample_org_flag();

-- A person added to a sample org later must have a sample address too (org_id is immutable).
create or replace function shared._guard_sample_org_people()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if shared.is_sample_org(new.org_id) and not shared.is_sample_address(new.email) then
    raise exception 'a sample organisation holds only people with @sample.gordi.test addresses'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function shared._guard_sample_org_people() is
  'Refuses a person in a sample org without an @sample.gordi.test address, on insert and on a change of address, for every role. SECURITY DEFINER.';
revoke execute on function shared._guard_sample_org_people() from public, anon, authenticated;

create trigger people_sample_org_address_guard
  before insert or update of email on shared.people
  for each row execute function shared._guard_sample_org_people();

-- ── The outbox: a sample org's rows never reach an ERP ───────────────────────────────────────
-- A sample-org row is stored as dry_run whatever environment its enqueue named; every dedupe key
-- ends with its environment, so that suffix follows. After that the row may only be linked to its
-- approval group or retired to dead_letter; everything else that touches it is refused.
create or replace function integrations._guard_sample_org_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.target_env <> 'dry_run' and shared.is_sample_org(new.org_id) then
      new.dedup_key := regexp_replace(new.dedup_key, '\|' || new.target_env || '$', '|dry_run');
      new.target_env := 'dry_run';
    end if;
    return new;
  end if;

  if not (shared.is_sample_org(old.org_id) or shared.is_sample_org(new.org_id)) then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'last_error' - 'push_group_id' - 'updated_at')
       is distinct from (to_jsonb(old) - 'status' - 'last_error' - 'push_group_id' - 'updated_at')
     or (new.status is distinct from old.status and new.status <> 'dead_letter') then
    raise exception 'the sample organisation never sends anything to the ERP' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function integrations._guard_sample_org_outbox() is
  'Outbox guard for sample orgs (shared.is_sample_org on the row''s org): an insert is stored as dry_run, with its dedupe key''s environment suffix; an update may only link the approval group or retire the row to dead_letter. Refuses for every role, the worker included. SECURITY DEFINER.';
revoke execute on function integrations._guard_sample_org_outbox() from public, anon, authenticated;

create trigger esb_push_sample_org_guard
  before insert or update on integrations.esb_push
  for each row execute function integrations._guard_sample_org_outbox();
create trigger esb_push_groups_sample_org_guard
  before insert or update on integrations.esb_push_groups
  for each row execute function integrations._guard_sample_org_outbox();

create or replace function integrations._retire_sample_org_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update integrations.esb_push
     set status = 'dead_letter', last_error = 'Sample organisation: never sent to the ERP.'
   where org_id = new.id and status in ('pending', 'failed', 'in_flight');
  update integrations.esb_push_groups
     set status = 'dead_letter', last_error = 'Sample organisation: never sent to the ERP.'
   where org_id = new.id and status in ('pending', 'failed', 'in_flight');
  return null;
end;
$$;
comment on function integrations._retire_sample_org_outbox() is
  'When an org becomes a sample org, moves its queued, failed and in-flight outbox rows and groups to dead_letter so no worker drains them. SECURITY DEFINER.';
revoke execute on function integrations._retire_sample_org_outbox() from public, anon, authenticated;

create trigger orgs_sample_flag_retire_outbox
  after update of is_sample on shared.orgs
  for each row when (new.is_sample and not old.is_sample)
  execute function integrations._retire_sample_org_outbox();

-- ── Sign-in: a sample account only ever enters a sample org ──────────────────────────────────
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
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_user_id := (event ->> 'user_id')::uuid;

  if event ->> 'authentication_method' = 'oauth' and not (claims ? 'client_id') then
    select i.identity_data ->> 'email', i.identity_data ->> 'email_verified'
      into v_google_email, v_google_verified
      from auth.identities i
     where i.user_id = v_user_id
       and i.provider = 'google';

    if found and (
      v_google_verified is distinct from 'true'
      or not exists (
        select 1
          from shared.people p
          join auth.users u on u.id = p.user_id
         where p.user_id = v_user_id
           and lower(p.email) = lower(v_google_email)
           and lower(u.email) = lower(v_google_email)
      )
    ) then
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 403,
        'message', 'Google sign-in requires one provisioned, verified account. Ask an admin for help.'
      ));
    end if;
  end if;

  select p.* into v_person
  from shared.people p
  where p.user_id = v_user_id
    and p.archived_at is null
  limit 1;

  -- A user with no auth row is no sample account, so it keeps the empty-claims path.
  if coalesce((select shared.is_sample_address(u.email) from auth.users u where u.id = v_user_id), false)
       is distinct from shared.is_sample_org(v_person.org_id) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sample accounts sign in only to the sample organisation.'
    ));
  end if;

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
  'Auth hook: stamps directory claims, fences agent tokens, validates linked Google identities by auth user on OAuth sign-in, issues a sample account (@sample.gordi.test) a token only for a person in a sample org, and a person in a sample org a token only for a sample account.';
revoke execute on function shared.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ── The project's sample org (the id the sample login checks for) ────────────────────────────
-- The flag guard refuses this, and so the whole migration, if that org is not sample-shaped. The
-- lock makes the shape check and the retire see every person and outbox row committed before the flag.
lock table shared.people, integrations.esb_push, integrations.esb_push_groups in share row exclusive mode;
update shared.orgs set is_sample = true where id = '5a000000-0000-0000-0000-000000000001';

commit;
