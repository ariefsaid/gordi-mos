-- P4 test-support fixture for admin-user-management (ADR-0016): mos._test_seed_admin_users() seeds the
-- people / logins / access-role rows the admin-provisioning pgTAP suite (52..57) asserts against.
-- SECURITY DEFINER so it can write the shared.* directory + auth.* under RLS; called ONLY inside a
-- begin;...rollback; pgTAP transaction (rows are rolled back; nothing ships to prod). No app/grant path
-- calls it. Auth users are created with the FULL proven GoTrue column shape (mirrors admin_create_login)
-- so _count_active_admins' banned_until join is real and reset/disable have a real hash to mutate.
--
-- The fixture (org A = ...0000a1 ; foreign org B = ...0000b1):
--   Org A admin person  ...00d3  linked to auth user ...00aa03 ; person_access_roles(admin) live.
--                                  (the single admin in org A -> the AC-040 no-lockout floor)
--   Org A person         ...00d1  email budi@ops.gordi.local, user_id NULL (create-login target, AC-010).
--   Org A person         ...00d2  linked to auth user ...00aa02 (reset/disable target, AC-020/030).
--   Org B person         ...00b4  linked to auth user ...00aa04 (cross-org target, AC-002).
create or replace function mos._test_seed_admin_users()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := extensions.crypt('seed-password-1A', extensions.gen_salt('bf'));
begin
  -- Orgs.
  insert into shared.orgs (id, name, slug) values
    ('00000000-0000-0000-0000-0000000000a1','Org Admin-A','org-admin-a'),
    ('00000000-0000-0000-0000-0000000000b1','Org Admin-B','org-admin-b')
  on conflict (id) do nothing;

  -- Auth users with the full proven GoTrue shape (token cols '' not NULL; bf hash; confirmed).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  ) values
    ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@ops.gordi.local',v_hash,now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{"email_verified":true}'::jsonb,false,false,'','','','','','','','',now(),now()),
    ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dewi@ops.gordi.local',v_hash,now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{"email_verified":true}'::jsonb,false,false,'','','','','','','','',now(),now()),
    ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','orgb@ops.gordi.local',v_hash,now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{"email_verified":true}'::jsonb,false,false,'','','','','','','','',now(),now())
  on conflict (id) do nothing;

  -- People. ...00d3 admin (login), ...00d1 no-login create target, ...00d2 reset/disable target,
  -- ...00b4 cross-org. user_id is set by the seed (definer), not an app write, so the people guard's
  -- INSERT-with-user_id branch is not in scope here (this fixture is the owner/service path).
  insert into shared.people (id, org_id, user_id, full_name, email) values
    ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','Admin Person','admin@ops.gordi.local'),
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1',null,'Budi Santoso','budi@ops.gordi.local'),
    ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Dewi Lestari','dewi@ops.gordi.local'),
    ('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a4','Org-B Person','orgb@ops.gordi.local')
  on conflict (id) do nothing;

  -- Access roles. Org A has EXACTLY ONE admin (...00d3, who has a login) -> the no-lockout floor (AC-040).
  insert into shared.person_access_roles (org_id, person_id, access_role) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','admin')
  on conflict (person_id, access_role) do nothing;
end;
$$;
comment on function mos._test_seed_admin_users() is
  'TEST-ONLY fixture (SECURITY DEFINER): people/logins/admin grant for the admin-provisioning pgTAP suite (52..57). Call inside begin;...rollback; only.';

-- Lock execution to postgres/service_role only (mirrors mos._test_seed_access_roles) — a public default
-- grant would expose this as a reachable PostgREST RPC letting any user write the shared directory + auth.
revoke execute on function mos._test_seed_admin_users() from public, anon, authenticated;

-- DOWN: drop function mos._test_seed_admin_users();
