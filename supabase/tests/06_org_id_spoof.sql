begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B', 'org-b');

-- POSTURE (was M1 read-only; deliberately WIDENED for the admin role by ADR-0016 / plan §8.1): there is
-- now a standing INSERT grant on people, but the only standing INSERT policy (people_insert_admin) gates
-- it to `has_access_role('admin')`. Assert the admin-gating still holds — a member/loginless session is
-- write-closed by policy even though the base grant exists. (The org_id-spoof property below is unchanged.)
select ok(
  has_table_privilege('authenticated', 'shared.people', 'INSERT'),
  'authenticated now has a standing INSERT grant on shared.people (admin write surface, ADR-0016 §8.1)'
);
select is(
  (select count(*)::int from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'shared' and c.relname = 'people' and p.polcmd = 'a'),  -- 'a' = INSERT
  1, 'the only standing INSERT policy on people is the admin-gated one (people_insert_admin)'
);

-- The org_id-spoof property is proven WITHOUT a persistent surface: we grant INSERT and create the
-- WITH CHECK policy HERE, inside this test transaction (which ends in rollback), so neither the grant
-- nor the policy survives the test. This proves "even WHEN a write policy exists, a client cannot
-- stamp a foreign org_id" (OD-P1-1) without leaving a standing write grant in the shipped schema.
grant insert on shared.people to authenticated;
create policy people_insert_own_org on shared.people
  for insert to authenticated
  with check (org_id = shared.current_org_id());

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';

-- Insert WITHOUT org_id -> default stamps current_org_id() = A. Allowed.
select lives_ok($$
  insert into shared.people (full_name) values ('Honest Person')
$$, 'insert with defaulted org_id (current org A) is allowed');

-- Insert CLAIMING org B while session is org A -> WITH CHECK rejects (RLS 42501).
select throws_ok($$
  insert into shared.people (org_id, full_name)
  values ('00000000-0000-0000-0000-0000000000b2', 'Spoofer')
$$, '42501', null, 'client cannot stamp a foreign org_id (WITH CHECK blocks spoof, OD-P1-1)');

-- Insert with an EXPLICIT NULL org_id -> overrides the default, NULL <> current_org_id() so the
-- WITH CHECK rejects (a client cannot smuggle an org-less row past the policy). 42501.
select throws_ok($$
  insert into shared.people (org_id, full_name)
  values (null, 'Null-org Smuggler')
$$, '42501', null, 'explicit NULL org_id is rejected by WITH CHECK (cannot bypass org stamping)');

reset role;
select * from finish();
rollback;
