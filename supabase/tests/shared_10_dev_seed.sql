-- shared, squashed baseline — the committed dev seed lands as intended.
--
-- Read as the migration/seed owner, against the REAL rows supabase/seed.sql wrote. No fixture wrap:
-- the subject is the seed itself. begin;...rollback; keeps it read-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- The seed admin row exists despite the admin-only RLS rule AND the self-escalation guard: the seed
-- runs under a connection that bypasses RLS, and the guard's self-assign check is keyed on
-- current_person_id(), which is NULL there. If either of those ever changed, a fresh reset would
-- ship an org with no admin and no way to make one.
select ok(
  exists (select 1 from shared.person_access_roles
           where person_id = '40000000-0000-0000-0000-000000000000' and access_role = 'admin'),
  'the seed grants admin to the owner stand-in, past the admin-only RLS and the self-assign guard');

select is(
  (select granted_by from shared.person_access_roles
    where person_id = '40000000-0000-0000-0000-000000000000' and access_role = 'admin'),
  null, 'and granted_by is NULL — honest: a seed insert has no acting person to attribute it to');

select ok(
  exists (select 1 from shared.person_access_roles
           where person_id = '40000000-0000-0000-0000-000000000001' and access_role = 'member'),
  'an ordinary seeded person holds member, the default');

-- The Jabatan seed runs through _guard_person_roles, whose org check is skipped only because the
-- seed connection has no org claim. If that exemption were removed the whole seed would 42501.
select cmp_ok(
  (select count(*) from shared.person_roles
    where org_id = '10000000-0000-0000-0000-000000000001'),
  '>', 0::bigint,
  'the Jabatan seed survives the org-seam guard — the null-org service/seed path stays exempt');

select * from finish();
rollback;
