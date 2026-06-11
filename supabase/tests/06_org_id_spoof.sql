begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B', 'org-b');

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

reset role;
select * from finish();
rollback;
