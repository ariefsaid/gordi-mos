begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- This file asserts against the COMMITTED seed.sql default assignments (applied by supabase db reset),
-- read as the migration/seed owner (postgres bypasses RLS + the guard). No fixture wrap — it reads the
-- real seed rows. begin;...rollback; keeps it isolated (read-only).

-- AC-050 (FR-060): the seed admin row for the owner stand-in (Dewi, 4000...0000) exists despite the
-- admin-only RLS rule and the self-escalation guard (service_role/owner bypass), with granted_by NULL.
select ok(
  exists(select 1 from shared.person_access_roles
           where person_id='40000000-0000-0000-0000-000000000000' and access_role='admin'),
  'AC-050: seed admin row exists despite admin-only RLS / self-guard (service_role bypass)');
select is(
  (select granted_by from shared.person_access_roles
     where person_id='40000000-0000-0000-0000-000000000000' and access_role='admin'),
  null, 'AC-050: seed admin granted_by NULL (no granting person)');

-- AC-051 (FR-061): a non-owner seeded person (Cahya, 4000...0001) holds member (the default).
select ok(
  exists(select 1 from shared.person_access_roles
           where person_id='40000000-0000-0000-0000-000000000001' and access_role='member'),
  'AC-051: non-owner seeded person holds member (default)');

select * from finish();
rollback;
