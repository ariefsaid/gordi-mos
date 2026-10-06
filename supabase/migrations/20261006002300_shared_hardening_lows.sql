-- Close the five remaining low-severity database seams without changing successful API response
-- shapes. The existence checks below are org-scoped before a row lock, so foreign and missing ids
-- keep the same no-record response.
--
-- DOWN (manual, reversible):
--   drop index shared.people_org_lower_email_unique;
--   alter table mos.signals drop constraint signals_body_length_ck;
--   alter table mos.comments drop constraint comments_body_length_ck;
--   alter table mos.tasks drop constraint tasks_title_length_ck, drop constraint tasks_description_length_ck;
--   alter table mos.process_task_defs drop constraint process_task_defs_title_length_ck,
--     drop constraint process_task_defs_description_length_ck;
--   alter table mos.push_subscriptions drop constraint push_subscriptions_endpoint_https_length_ck;
--   drop trigger tasks_server_fields_guard on mos.tasks;
--   drop function mos._guard_task_server_fields();
--   drop trigger kitchen_logs_server_created_at_guard on ops.kitchen_logs;
--   drop function ops._guard_kitchen_log_server_fields();
--   drop trigger kitchen_logs_z_confirmed_unit_guard on ops.kitchen_logs;
--   drop function ops._guard_confirmed_erp_item_unit();
--   restore shared._guard_google_identity_link() and shared.custom_access_token_hook(jsonb)
--     from 20261003000001_shared_google_sign_in_guards.sql;
--   restore shared.admin_create_login(uuid,text) from 20260805000003_shared_admin_provisioning.sql;
--   restore shared.admin_reset_password(uuid,text) from 20261006002100_shared_session_authority.sql;
--   restore shared._count_active_admins() from 20260805000002_shared_access_control.sql;
--   restore mos.resolve_pending_task(uuid,uuid) and mos.transition_follow_up(uuid,text,jsonb) from
--     20260805000007_mos_functions.sql;
--   restore mos.fan_out_signal_mention(uuid) from 20260928000001_mos_signal_mention_actor_name.sql;
--   restore ops.can_add_cafe_waste_photo(text) from 20261005000005_ops_cafe_waste_draft_restart.sql;
--   restore ops.restart_cafe_waste_draft(uuid,date) from 20261005000006_ops_cafe_unit_multiples.sql;
--   grant usage on schema shared to anon;
--   grant update on integrations.esb_push to authenticated;
--   grant execute on function api_private._agent_fence(text) to authenticated;
--   Restore the previous function grants together with each restored function body.

begin;

-- identity resolution follows the auth user, not an email shared by separate tenants.
create unique index people_org_lower_email_unique
  on shared.people (org_id, lower(email))
  where email is not null and btrim(email) <> '';

create or replace function shared._guard_google_identity_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
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

  select p.user_id into v_person_user_id
    from shared.people p
   where p.user_id = new.user_id
     and lower(p.email) = lower(v_email);

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
  'Links a verified Google identity only to the provisioned person attached to that auth user; another org''s matching email is irrelevant.';
revoke execute on function shared._guard_google_identity_link() from public, anon, authenticated;

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
  'Auth hook: stamps directory claims, fences agent tokens, and validates linked Google identities by auth user on OAuth sign-in.';
revoke execute on function shared.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- role-authority helpers were already revoked from authenticated in 20261005000400.
-- Anonymous callers do not need shared-schema access; check_request still needs the authenticated
-- fence helper for API authorization, so only its public and anon grants are removed.
revoke usage on schema shared from anon;
revoke execute on function api_private._agent_fence(text) from public, anon, authenticated;
grant execute on function api_private._agent_fence(text) to authenticated;
revoke update on integrations.esb_push from authenticated;

-- keep last-admin checks serialized for each organization.
create or replace function shared._count_active_admins()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shared.active-admins:' || coalesce(v_org::text, 'none'), 0));

  select count(*)::int into v_count
    from shared.person_access_roles par
    join shared.people pe on pe.id = par.person_id
    join auth.users u on u.id = pe.user_id
   where par.org_id = v_org
     and par.access_role = 'admin'
     and par.revoked_at is null
     and pe.archived_at is null
     and (u.banned_until is null or u.banned_until <= now());
  return v_count;
end;
$$;
comment on function shared._count_active_admins() is
  'Counts active admins in the caller''s org while holding its transaction-scoped no-lockout lock.';
revoke execute on function shared._count_active_admins() from public, anon, authenticated;
grant execute on function shared._count_active_admins() to authenticated;

-- Match Supabase auth.minimum_password_length and auth.password_requirements for admin-set values.
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
  if p_password is not null and (
       char_length(p_password) < 8
       or p_password !~ '[a-z]'
       or p_password !~ '[A-Z]'
       or p_password !~ '[0-9]'
  ) then
    raise exception 'password does not meet the configured policy' using errcode = '22023';
  end if;

  v_pw  := coalesce(p_password, shared._gen_temp_password());
  v_uid := extensions.gen_random_uuid();

  -- Re-raise global auth-email collisions without the unique-constraint DETAIL.
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
      '', '', '', '', '', '', '', '', now(), now()
    );
  exception when unique_violation then
    raise exception 'email already in use' using errcode = '22023';
  end;

  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values (
    extensions.gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', false, 'phone_verified', false),
    now(), now()
  );

  update shared.people
     set user_id = v_uid, must_change_password = true, updated_at = now()
   where id = p_person;
  return v_pw;
end;
$$;
comment on function shared.admin_create_login(uuid, text) is
  'Creates an auth login for an admin-scoped person. Explicit passwords follow auth config; global email collisions return an org-neutral message.';
revoke execute on function shared.admin_create_login(uuid, text) from public, anon, authenticated;
grant execute on function shared.admin_create_login(uuid, text) to authenticated;

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
  if p_password is not null and (
       char_length(p_password) < 8
       or p_password !~ '[a-z]'
       or p_password !~ '[A-Z]'
       or p_password !~ '[0-9]'
  ) then
    raise exception 'password does not meet the configured policy' using errcode = '22023';
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
  'Resets an admin-scoped login, expires its sessions and flags rotation. Explicit passwords follow auth config.';
revoke execute on function shared.admin_reset_password(uuid, text) from public, anon, authenticated;
grant execute on function shared.admin_reset_password(uuid, text) to authenticated;

-- database-enforced text and endpoint bounds match the public write contract.
alter table mos.signals add constraint signals_body_length_ck check (char_length(body) <= 4000);
alter table mos.comments add constraint comments_body_length_ck check (char_length(body) <= 4000);
alter table mos.tasks
  add constraint tasks_title_length_ck check (char_length(title) <= 300),
  add constraint tasks_description_length_ck check (description is null or char_length(description) <= 2000);
alter table mos.process_task_defs
  add constraint process_task_defs_title_length_ck check (char_length(title) <= 300),
  add constraint process_task_defs_description_length_ck
    check (description is null or char_length(description) <= 2000);
alter table mos.push_subscriptions add constraint push_subscriptions_endpoint_https_length_ck
  check (endpoint ~* '^https://' and char_length(endpoint) <= 2048);

-- Client-authored timestamps/attribution are overwritten at the boundary; system triggers can still
-- advance task activity, and trusted definer/import paths retain their existing server behavior.
create function mos._guard_task_server_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and current_user = 'authenticated' then
    if new.created_by is distinct from shared.current_person_id() then
      raise exception 'created_by is the session person' using errcode = '42501';
    end if;
    new.created_at := clock_timestamp();
    new.last_activity_at := new.created_at;
  elsif tg_op = 'UPDATE' and current_user = 'authenticated' then
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is server-managed on a task' using errcode = '42501';
    end if;
    if new.last_activity_at is distinct from old.last_activity_at and pg_trigger_depth() = 1 then
      raise exception 'last_activity_at is server-managed on a task' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function mos._guard_task_server_fields() is
  'Stamps task timestamps and preserves session-person attribution for authenticated inserts; nested event-trigger activity updates remain allowed.';
revoke execute on function mos._guard_task_server_fields() from public, anon, authenticated;
create trigger tasks_server_fields_guard before insert or update on mos.tasks
  for each row execute function mos._guard_task_server_fields();

create function ops._guard_kitchen_log_server_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  elsif tg_op = 'UPDATE' and current_user = 'authenticated'
        and new.created_at is distinct from old.created_at then
    raise exception 'created_at is server-managed on a kitchen log' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_log_server_fields() is
  'Stamps kitchen-log creation time and prevents authenticated clients from changing the waste-photo window.';
revoke execute on function ops._guard_kitchen_log_server_fields() from public, anon, authenticated;
create trigger kitchen_logs_server_created_at_guard before insert or update on ops.kitchen_logs
  for each row execute function ops._guard_kitchen_log_server_fields();

-- The bind trigger runs first by name. Require its ERP detail to be confirmed for every MOS capture,
-- not only waste rows (which already have a separate evidence guard).
create function ops._guard_confirmed_erp_item_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_confirmed_at timestamptz;
  v_source_active boolean;
  v_detail_id text;
begin
  if (tg_op = 'UPDATE' and old.item_unit_id is not null
      and new.item_unit_id is not distinct from old.item_unit_id)
     or new.source <> 'mos' or new.item_unit_id is null then
    return new;
  end if;

  select item.reference_source, unit.confirmed_at, unit.source_active, unit.esb_product_detail_id
    into v_source, v_confirmed_at, v_source_active, v_detail_id
    from ops.wip_items item
    join ops.item_units unit
      on unit.org_id = item.org_id and unit.wip_item_id = item.id
   where item.id = new.wip_item_id
     and item.org_id = new.org_id
     and unit.id = new.item_unit_id;

  if v_source = 'erp_catalog'
     and (v_confirmed_at is null or not v_source_active or v_detail_id is null) then
    raise exception 'CAFE_ITEM_UNIT_NOT_SHOWN: the selected ERP detail is not confirmed and available'
      using errcode = 'P0015';
  end if;
  return new;
end;
$$;
comment on function ops._guard_confirmed_erp_item_unit() is
  'Requires confirmed, active ERP details for MOS kitchen-log bindings after the default-unit binder runs.';
revoke execute on function ops._guard_confirmed_erp_item_unit() from public, anon, authenticated;
create trigger kitchen_logs_z_confirmed_unit_guard before insert or update on ops.kitchen_logs
  for each row execute function ops._guard_confirmed_erp_item_unit();

-- compare waste-photo windows against the wall clock after acquiring the shared lock.
create or replace function ops.can_add_cafe_waste_photo(p_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_log_id uuid := ops.cafe_waste_photo_log_id(p_name);
  v_org_id uuid := shared.current_org_id();
begin
  if v_log_id is null or split_part(p_name, '/', 1) <> v_org_id::text then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cafe-waste-photo:' || v_log_id::text, 0));
  return exists (
    select 1 from ops.kitchen_logs log
    where log.id = v_log_id
      and log.org_id = v_org_id
      and log.action = 'waste'
      and log.status = 'Draft'
      and log.superseded_by is null
      and log.source = 'mos'
      and log.submitted_by = shared.current_person_id()
      and log.created_at > pg_catalog.clock_timestamp() - interval '15 minutes'
      and (select count(*) from storage.objects photo
           where photo.bucket_id = 'waste-photos'
             and ops.cafe_waste_photo_log_id(photo.name) = v_log_id) < 4
  );
end;
$$;
comment on function ops.can_add_cafe_waste_photo(text) is
  'Storage insert predicate: only the same-org submitter can add a photo to their own unsuperseded waste Draft in its 15-minute server-timestamp window; the advisory lock makes the four-photo cap race-safe.';
revoke execute on function ops.can_add_cafe_waste_photo(text) from public, anon, authenticated;
grant execute on function ops.can_add_cafe_waste_photo(text) to authenticated, service_role;

create or replace function ops.restart_cafe_waste_draft(p_log_id uuid, p_log_date date)
returns table (id uuid, log_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log ops.kitchen_logs;
  v_replacement uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cafe-waste-photo:' || p_log_id::text, 0));
  select * into v_log from ops.kitchen_logs log where log.id = p_log_id for update;
  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if v_log.org_id is distinct from shared.current_org_id()
     or v_log.submitted_by is distinct from shared.current_person_id()
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'only the waste-log submitter may restart their own draft' using errcode = '42501';
  end if;
  if v_log.action <> 'waste' or v_log.source <> 'mos' or v_log.status <> 'Draft' then
    raise exception 'waste log is not an eligible Draft' using errcode = 'P0003';
  end if;
  if v_log.superseded_by is not null then
    return query select log.id, log.log_date from ops.kitchen_logs log where log.id = v_log.superseded_by;
    return;
  end if;
  if v_log.created_at > pg_catalog.clock_timestamp() - interval '15 minutes' or exists (
    select 1 from storage.objects photo where photo.bucket_id = 'waste-photos'
      and ops.cafe_waste_photo_log_id(photo.name) = v_log.id
  ) then
    raise exception 'restart requires an expired waste draft without photos' using errcode = '23514';
  end if;
  if p_log_date is null then
    raise exception 'replacement log date is required' using errcode = '22023';
  end if;
  insert into ops.kitchen_logs
    (org_id, submitted_by, business_unit_id, log_date, branch_id, activity, action,
     destination_branch_id, wip_item_id, item_unit_id, qty_porsi, notes, status, source,
     entry_quantity, entry_unit_factor, entry_unit_name)
  values
    (v_log.org_id, v_log.submitted_by, v_log.business_unit_id, p_log_date, v_log.branch_id,
     v_log.activity, 'waste', null, v_log.wip_item_id, v_log.item_unit_id, v_log.qty_porsi,
     v_log.notes, 'Draft', 'mos', v_log.entry_quantity, v_log.entry_unit_factor, v_log.entry_unit_name)
  returning kitchen_logs.id into v_replacement;
  update ops.kitchen_logs set superseded_by = v_replacement where kitchen_logs.id = v_log.id;
  return query select log.id, log.log_date from ops.kitchen_logs log where log.id = v_replacement;
end;
$$;
comment on function ops.restart_cafe_waste_draft(uuid,date) is
  'Atomically replaces the current submitter''s expired photo-less waste draft, copying its captured unit snapshot; retries return the same replacement.';
revoke execute on function ops.restart_cafe_waste_draft(uuid,date) from public, anon, authenticated;
grant execute on function ops.restart_cafe_waste_draft(uuid,date) to authenticated;

-- scope rows before FOR UPDATE so foreign and missing ids have identical responses.
create or replace function mos.resolve_pending_task(p_pending_id uuid, p_pic_person_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_pend mos.process_run_pending_tasks;
  v_run mos.process_runs;
  v_td mos.process_task_defs;
  v_team shared.teams;
  v_wl mos.work_lines;
  v_sup uuid;
  v_task_id uuid;
  v_holders uuid[];
  v_label text;
  v_pos int := 0;
begin
  select * into v_pend
    from mos.process_run_pending_tasks
   where id = p_pending_id and org_id = v_org
   for update;
  if v_pend.id is null then
    raise exception 'pending item not found' using errcode = 'P0002';
  end if;
  if v_pend.resolved_at is not null then
    raise exception 'pending item already resolved' using errcode = 'P0003';
  end if;
  select * into v_run from mos.process_runs where id = v_pend.process_run_id;
  if not (shared.can('process.start') and mos.can_start_process_for_team(v_run.owning_team_id)) then
    raise exception 'not authorized to resolve this pending item' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.people where id = p_pic_person_id and org_id = v_org and archived_at is null) then
    raise exception 'chosen PIC is not a current-org active person' using errcode = '42501';
  end if;
  if v_pend.reason = 'multiple' and not (p_pic_person_id = any (v_pend.candidate_person_ids)) then
    raise exception 'chosen PIC is not one of the candidates' using errcode = 'P0003';
  end if;

  select * into v_td from mos.process_task_defs where id = v_pend.task_def_id;
  select * into v_wl from mos.work_lines where id = v_run.work_line_id;
  select * into v_team from shared.teams where id = v_run.owning_team_id;
  v_sup := v_td.supervisor_person_id;
  if v_sup is null and v_td.supervisor_role_id is not null then
    select array_agg(h) into v_holders from mos._function_holders(v_org, v_td.supervisor_role_id, v_td.supervisor_team_id) h;
    if v_holders is not null and array_length(v_holders,1) = 1 then v_sup := v_holders[1]; end if;
  end if;
  v_sup := coalesce(v_sup, v_wl.accountable_person_id, p_pic_person_id);

  insert into mos.tasks (org_id, title, description, business_unit_id, status,
                         responsible_person_id, accountable_person_id, due_date,
                         work_line_id, process_run_id, generated_from_task_def_id, created_by)
  values (v_org, v_td.title, v_td.description, v_team.business_unit_id, 'Open',
          p_pic_person_id, v_sup, v_run.scheduled_date + v_td.due_offset_days,
          v_run.work_line_id, v_run.id, v_td.id, shared.current_person_id())
  returning id into v_task_id;
  for v_label in select value from jsonb_array_elements_text(v_td.checklist_items) loop
    insert into mos.task_checklist_items (org_id, task_id, label, position)
    values (v_org, v_task_id, v_label, v_pos);
    v_pos := v_pos + 1;
  end loop;
  update mos.process_run_pending_tasks
     set resolved_at = now(), resolved_by = shared.current_person_id(), materialized_task_id = v_task_id
   where id = v_pend.id;
  return v_task_id;
end;
$$;
comment on function mos.resolve_pending_task(uuid,uuid) is
  'Resolves a current-org pending task under row lock; missing and foreign ids share the same no-record response.';
revoke execute on function mos.resolve_pending_task(uuid,uuid) from public, anon, authenticated;
grant execute on function mos.resolve_pending_task(uuid,uuid) to authenticated;

create or replace function mos.transition_follow_up(p_follow_up_id uuid, p_transition text, p_options jsonb)
returns mos.follow_ups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_fu mos.follow_ups;
  v_lane text;
  v_state text;
  v_balance numeric(14,2);
  v_amt numeric(14,2);
  v_cash date;
  v_evid text;
  v_promise date;
  v_to_state text;
  v_note text;
begin
  select * into v_fu
    from mos.follow_ups
   where id = p_follow_up_id and org_id = v_org
   for update;
  if v_fu.id is null then
    raise exception 'follow-up not found' using errcode = 'P0002';
  end if;

  v_lane := v_fu.lane;
  v_state := v_fu.state;
  v_balance := v_fu.running_balance;
  v_note := nullif(p_options ->> 'note', '');
  case p_transition
    when 'chase' then
      if not mos.can_work_lane(v_lane) then raise exception 'not authorized to advance lane %', v_lane using errcode = '42501'; end if;
      if v_state not in ('open','chased','promised') then raise exception 'cannot chase from state %', v_state using errcode = 'P0003'; end if;
      v_to_state := 'chased';
    when 'promise' then
      if not mos.can_work_lane(v_lane) then raise exception 'not authorized to advance lane %', v_lane using errcode = '42501'; end if;
      if v_state not in ('open','chased','promised') then raise exception 'cannot promise from state %', v_state using errcode = 'P0003'; end if;
      begin v_promise := nullif(p_options ->> 'promise_date', '')::date;
      exception when others then raise exception 'promise_date is required (invalid)' using errcode = 'P0003'; end;
      if v_promise is null then raise exception 'promise_date is required' using errcode = 'P0003'; end if;
      v_to_state := 'promised';
    when 'partial' then
      if not mos.can_work_lane(v_lane) then raise exception 'not authorized to advance lane %', v_lane using errcode = '42501'; end if;
      if v_state not in ('open','chased','promised','partial') then raise exception 'cannot record a partial from state %', v_state using errcode = 'P0003'; end if;
      begin v_amt := nullif(p_options ->> 'amount', '')::numeric;
      exception when others then raise exception 'partial requires a numeric amount > 0' using errcode = 'P0003'; end;
      begin v_cash := nullif(p_options ->> 'cash_in_date', '')::date;
      exception when others then raise exception 'partial requires a valid cash_in_date' using errcode = 'P0003'; end;
      v_evid := nullif(p_options ->> 'evidence', '');
      if v_amt is null or v_amt <= 0 then raise exception 'partial requires amount > 0' using errcode = 'P0003'; end if;
      if v_cash is null then raise exception 'partial requires cash_in_date' using errcode = 'P0003'; end if;
      if v_evid is null or btrim(v_evid) = '' then raise exception 'partial requires evidence' using errcode = 'P0003'; end if;
      if v_amt > v_balance then raise exception 'partial amount % exceeds running balance %', v_amt, v_balance using errcode = 'P0003'; end if;
      v_balance := v_balance - v_amt;
      v_to_state := 'partial';
    when 'settle' then
      if not mos.can_work_lane(v_lane) then raise exception 'not authorized to advance lane %', v_lane using errcode = '42501'; end if;
      if v_state not in ('open','chased','promised','partial') then raise exception 'cannot settle from state %', v_state using errcode = 'P0003'; end if;
      if v_balance <= 0 then raise exception 'nothing to settle (balance already 0)' using errcode = 'P0003'; end if;
      begin v_amt := nullif(p_options ->> 'amount', '')::numeric;
      exception when others then raise exception 'settle requires a numeric amount' using errcode = 'P0003'; end;
      if v_amt is null then v_amt := v_balance;
      elsif v_amt <> v_balance then raise exception 'settle amount % must equal running balance %', v_amt, v_balance using errcode = 'P0003'; end if;
      begin v_cash := nullif(p_options ->> 'cash_in_date', '')::date;
      exception when others then raise exception 'settle requires a valid cash_in_date' using errcode = 'P0003'; end;
      v_evid := nullif(p_options ->> 'evidence', '');
      if v_cash is null then raise exception 'settle requires cash_in_date' using errcode = 'P0003'; end if;
      if v_evid is null or btrim(v_evid) = '' then raise exception 'settle requires evidence' using errcode = 'P0003'; end if;
      v_balance := 0;
      v_to_state := 'settled';
    when 'confirm' then
      if not shared.can('followup.confirm') then raise exception 'confirm requires the followup.confirm capability (finance/admin)' using errcode = '42501'; end if;
      if v_state <> 'settled' then raise exception 'can only confirm a settled follow-up (current: %)', v_state using errcode = 'P0003'; end if;
      v_to_state := 'confirmed';
    else
      raise exception 'unknown transition %', p_transition using errcode = 'P0003';
  end case;

  insert into mos.follow_up_events
    (org_id, follow_up_id, transition, from_state, to_state, amount, cash_in_date, evidence, promise_date, note, actor_person_id)
  values
    (v_fu.org_id, v_fu.id, p_transition, v_state, v_to_state,
     case when p_transition in ('partial','settle') then v_amt else null end,
     case when p_transition in ('partial','settle') then v_cash else null end,
     case when p_transition in ('partial','settle') then v_evid else null end,
     case when p_transition = 'promise' then v_promise else null end,
     v_note, shared.current_person_id());
  update mos.follow_ups
     set state = v_to_state,
         running_balance = v_balance,
         promise_date = case when p_transition = 'promise' then v_promise else v_fu.promise_date end,
         updated_at = now()
   where id = v_fu.id;
  select * into v_fu from mos.follow_ups where id = p_follow_up_id;
  return v_fu;
end;
$$;
comment on function mos.transition_follow_up(uuid,text,jsonb) is
  'Gated settlement transition: scope before row lock, then lane/capability gate, state-machine validation, audited event and recomputed balance.';
revoke execute on function mos.transition_follow_up(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function mos.transition_follow_up(uuid,text,jsonb) to authenticated;

create or replace function mos.fan_out_signal_mention(p_signal_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_sig mos.signals;
  v_person uuid;
  v_count int := 0;
  v_recipients uuid[];
  v_actor_name text;
begin
  select * into v_sig from mos.signals where id = p_signal_id and org_id = v_org;
  if v_sig.id is null then
    raise exception 'signal not found' using errcode = 'P0002';
  end if;
  if v_sig.author_id is distinct from shared.current_person_id() then
    raise exception 'only the author may fan out' using errcode = '42501';
  end if;

  select p.full_name into v_actor_name
    from shared.people p
   where p.id = v_sig.author_id and p.org_id = v_sig.org_id and p.archived_at is null;

  select array_agg(distinct pid) into v_recipients from (
    select sm.target_person_id as pid from mos.signal_mentions sm
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'person'
    union
    select m.person_id from mos.signal_mentions sm
      join shared.team_memberships m on m.team_id = sm.target_team_id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'team'
        and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date)
    union
    select m2.person_id from mos.signal_mentions sm
      join shared.teams tt on tt.business_unit_id = sm.target_bu_id
      join shared.team_memberships m2 on m2.team_id = tt.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu'
        and shared.role_authority_allows('signal.tag', sm.target_bu_id, null, null)
        and m2.effective_from <= current_date and (m2.effective_to is null or m2.effective_to >= current_date)
    union
    select pr.person_id from mos.signal_mentions sm
      join shared.roles r on r.business_unit_id = sm.target_bu_id
      join shared.person_roles pr on pr.role_id = r.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu'
        and shared.role_authority_allows('signal.tag', sm.target_bu_id, null, null)
  ) dedup
  where pid is not null and pid <> v_sig.author_id
    and not exists (
      select 1 from mos.notifications n
      where n.owner_id = dedup.pid
        and n.metadata ->> 'source' = 'signal_mention'
        and n.metadata #>> '{entity,id}' = p_signal_id::text);

  if v_recipients is null then return 0; end if;
  if array_length(v_recipients, 1) > 50 then
    raise exception 'fan-out exceeds cap of 50 recipients (%). Confirm before broadcasting.', array_length(v_recipients,1)
      using errcode = 'P0003';
  end if;
  foreach v_person in array v_recipients loop
    perform mos.create_notification(v_person, 'info', 'You were mentioned in a Signal',
      left(v_sig.body, 200), jsonb_build_object('source','signal_mention',
        'actor', jsonb_build_object('id', v_sig.author_id, 'name', v_actor_name),
        'entity', jsonb_build_object('type','signal','id', v_sig.id, 'route', '/work/signals?record=' || v_sig.id)));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
comment on function mos.fan_out_signal_mention(uuid) is
  'Author-only @mention fan-out; foreign and missing Signal ids share the same no-record response. BU delivery keeps signal.tag authority, and notification metadata retains the author actor.';
revoke execute on function mos.fan_out_signal_mention(uuid) from public, anon, authenticated;
grant execute on function mos.fan_out_signal_mention(uuid) to authenticated;

commit;
