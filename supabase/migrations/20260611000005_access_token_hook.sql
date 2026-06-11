-- P1-2 — custom access token hook (OD-P1-1/2). Injects org_id + person_id claims at token mint.
-- SECURITY DEFINER: must read shared.people regardless of caller; granted only to supabase_auth_admin.
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
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
comment on function shared.custom_access_token_hook(jsonb) is
  'Auth hook: stamps org_id + person_id custom claims from shared.people. OD-P1-1/2.';

-- Supabase Auth runs the hook as supabase_auth_admin; lock execution to that role only.
revoke execute on function shared.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant  execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;
-- The hook (definer) needs to read people; grant the admin role select on the directory.
grant usage on schema shared to supabase_auth_admin;
grant select on shared.people to supabase_auth_admin;
