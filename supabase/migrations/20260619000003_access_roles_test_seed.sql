-- P4 test-support fixture: mos._test_seed_access_roles() grants access roles on the WU-A role tree
-- that _test_seed_role_tree() (…000003 / 20260612000003) seeds. SECURITY DEFINER so it can write under
-- RLS; called ONLY inside a begin;...rollback; pgTAP transaction, AFTER _test_seed_role_tree().
--
-- It: links Author (...0d01) to auth user (...aa01) so the hook resolves a people row for that user_id;
-- grants GrandMgr (...0d03) -> admin; Author (...0d01) -> member + finance (live) + ops_lead (revoked).
create or replace function mos._test_seed_access_roles()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- shared.people.user_id FKs auth.users(id); create the auth user the hook resolves for, then link
  -- Author (...0d01) to it. Inside the rolled-back pgTAP transaction, nothing ships to prod.
  insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aa01')
    on conflict (id) do nothing;
  update shared.people set user_id = '00000000-0000-0000-0000-00000000aa01'
    where id = '00000000-0000-0000-0000-0000000000d1';
  insert into shared.person_access_roles (org_id, person_id, access_role) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','admin'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','member'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','finance');
  insert into shared.person_access_roles (org_id, person_id, access_role, revoked_at) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','ops_lead', now());
end;
$$;
comment on function mos._test_seed_access_roles() is
  'TEST-ONLY fixture (SECURITY DEFINER): access-role grants on the WU-A tree. Call after _test_seed_role_tree(), inside begin;...rollback;.';

-- Lock execution to postgres/service_role only (mirrors mos._test_seed_role_tree) — a public default
-- grant would expose this as a reachable PostgREST RPC letting any user bypass RLS.
revoke execute on function mos._test_seed_access_roles() from public, anon, authenticated;

-- DOWN: drop function mos._test_seed_access_roles();
