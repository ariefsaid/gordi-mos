-- A sample organisation is a test bench on the same project as the real one. Three rules make that
-- true by construction, all keyed on one org flag (shared.orgs.is_sample) read through one helper
-- (shared.is_sample_org):
--   1. A sample org never sends anything to the ERP. Its approvals still complete, but their outbox
--      rows target dry_run, which no worker drains. Any sample-org outbox row aimed at a real ERP
--      environment, and any claim, post, retarget or move of one, is refused for every role.
--      Flagging an org retires the outbox rows it still had queued or in flight.
--   2. A sample account (@sample.gordi.test, the accounts the one-click sample login uses) is issued
--      a token only for a person in a sample org.
--   3. Once flagged, an org stays a sample org.
--
-- DOWN (manual, reversible):
--   drop trigger esb_push_sample_org_guard on integrations.esb_push;
--   drop trigger esb_push_groups_sample_org_guard on integrations.esb_push_groups;
--   drop function integrations._guard_sample_org_outbox();
--   drop trigger orgs_sample_flag_guard on shared.orgs;
--   drop function shared._guard_sample_org_flag();
--   drop trigger orgs_sample_flag_retire_outbox on shared.orgs;
--   drop function integrations._retire_sample_org_outbox();
--   restore integrations.current_esb_target_env() from 20260805000013_integrations_dispatch.sql;
--   restore shared.custom_access_token_hook(jsonb) from 20261006002300_shared_hardening_lows.sql;
--   drop function shared.is_sample_org(uuid);
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

create or replace function shared._guard_sample_org_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_sample and not new.is_sample then
    raise exception 'a sample organisation stays a sample organisation' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function shared._guard_sample_org_flag() is
  'Refuses clearing shared.orgs.is_sample for every role. SECURITY DEFINER.';
revoke execute on function shared._guard_sample_org_flag() from public, anon, authenticated;

create trigger orgs_sample_flag_guard
  before update of is_sample on shared.orgs
  for each row execute function shared._guard_sample_org_flag();

-- ── The outbox: a sample org's rows never reach an ERP ───────────────────────────────────────
-- Allowed for a sample-org row: an insert that targets dry_run, linking it to its approval group,
-- and retiring it to dead_letter. Everything else that touches it is refused.
create or replace function integrations._guard_sample_org_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.target_env <> 'dry_run' and shared.is_sample_org(new.org_id) then
      raise exception 'the sample organisation never sends anything to the ERP' using errcode = '42501';
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
  'Outbox guard for sample orgs (shared.is_sample_org): an insert must target dry_run; an update may only link the approval group or retire the row to dead_letter. Refuses for every role, the worker included. SECURITY DEFINER.';
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

-- Approvals read this when they enqueue: a sample session's rows target dry_run.
create or replace function integrations.current_esb_target_env()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when shared.is_sample_org(shared.current_org_id()) then 'dry_run'
    else coalesce(nullif(current_setting('app.esb_target_env', true), ''), 'dry_run')
  end
$$;
comment on function integrations.current_esb_target_env() is
  'The ERP target environment stamped on an outbox row at enqueue (FR-080/081). dry_run for a sample-org session; otherwise the GUC app.esb_target_env, a deployment property, NOT a JWT claim, so a caller cannot choose which environment their approval posts to. Default dry_run; a deployment sets goo; gkid only at the owner-gated flip (OD-K-2). SECURITY INVOKER.';
revoke execute on function integrations.current_esb_target_env() from public, anon, authenticated;

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

  -- The sample login's accounts are the @sample.gordi.test addresses.
  if exists (
       select 1 from auth.users u
        where u.id = v_user_id
          and lower(u.email) like '%@sample.gordi.test'
     ) and not shared.is_sample_org(v_person.org_id) then
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
  'Auth hook: stamps directory claims, fences agent tokens, validates linked Google identities by auth user on OAuth sign-in, and issues a sample account (@sample.gordi.test) a token only for a person in a sample org.';
revoke execute on function shared.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ── The project's sample org (the id the sample login checks for) ────────────────────────────
update shared.orgs set is_sample = true where id = '5a000000-0000-0000-0000-000000000001';

commit;
