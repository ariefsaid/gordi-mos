begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B', 'org-b');

-- INVARIANT (security audit M1): there is NO standing INSERT grant for authenticated on people. Assert
-- that first, as superuser, BEFORE we open the temporary surface — the schema must ship write-closed.
select ok(
  not has_table_privilege('authenticated', 'shared.people', 'INSERT'),
  'authenticated has NO standing INSERT privilege on shared.people (M1: no app write surface)'
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
