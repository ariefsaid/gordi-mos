begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into shared.deployment_stamp (id, backend_sha, deployed_at)
values (true, repeat('a', 40), '2026-10-19T12:00:00Z')
on conflict (id) do update
set backend_sha = excluded.backend_sha, deployed_at = excluded.deployed_at;

select has_table('shared', 'deployment_stamp', 'the deployment stamp exists in shared');
select ok((select relrowsecurity and relforcerowsecurity
  from pg_class where oid = 'shared.deployment_stamp'::regclass),
  'the deployment stamp enables and forces RLS');
select is((select count(*)::int from pg_policy
  where polrelid = 'shared.deployment_stamp'::regclass), 1,
  'the deployment stamp has one read policy');
select ok(has_table_privilege('authenticated', 'shared.deployment_stamp', 'SELECT')
  and not has_table_privilege('authenticated', 'shared.deployment_stamp', 'INSERT')
  and not has_table_privilege('authenticated', 'shared.deployment_stamp', 'UPDATE')
  and not has_table_privilege('authenticated', 'shared.deployment_stamp', 'DELETE')
  and not has_table_privilege('anon', 'shared.deployment_stamp', 'SELECT')
  and not has_table_privilege('service_role', 'shared.deployment_stamp', 'INSERT')
  and not has_table_privilege('service_role', 'shared.deployment_stamp', 'UPDATE')
  and not has_table_privilege('service_role', 'shared.deployment_stamp', 'DELETE'),
  'authenticated has read-only access and anon cannot read');

set local role authenticated;
select is((select backend_sha from shared.deployment_stamp where id), repeat('a', 40),
  'authenticated can read the deployment stamp');
select throws_ok($$insert into shared.deployment_stamp (id, backend_sha)
  values (true, repeat('b', 40))$$, '42501', null,
  'authenticated cannot insert a deployment stamp');
select throws_ok($$update shared.deployment_stamp set backend_sha = repeat('b', 40) where id$$,
  '42501', null, 'authenticated cannot update the deployment stamp');
select throws_ok($$delete from shared.deployment_stamp where id$$, '42501', null,
  'authenticated cannot delete the deployment stamp');
reset role;

set local role anon;
select throws_ok($$select backend_sha from shared.deployment_stamp$$, '42501', null,
  'anon cannot read the deployment stamp');
reset role;

select * from finish();
rollback;
