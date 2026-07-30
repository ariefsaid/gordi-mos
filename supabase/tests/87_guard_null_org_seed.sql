-- Regression (mig 20260729000005): the org-seam guards on shared.person_roles and
-- reporting.supervisor_revenue_scope must EXEMPT the service/seed context (current_org_id() NULL),
-- so `supabase db reset` (seed.sql seeds person_roles) and fresh deploys don't 42501. Before the fix
-- this file aborts at the `_test_seed_role_tree()` call below — the helper's OWN person_roles inserts
-- hit the guard under null org and raise 42501 before the explicit assertions even run (that abort is
-- itself the regression trigger; the check provably could fail). Post-fix, seed + both inserts pass.

begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select mos._test_seed_role_tree();  -- org a1 people d1..d7, roles f1..f6; d4=Peer, f2=Lead R

-- No `set local role` / no request.jwt.claims → current_org_id() is NULL (the seed/service context).
-- org_id is passed explicitly (the column is NOT NULL and the default current_org_id() would be NULL here).

select lives_ok($$
  insert into shared.person_roles (org_id, person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f2')
$$, 'null-org service context: person_roles insert is allowed by the guard (db-reset regression)');

select lives_ok($$
  insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','B2B',null)
$$, 'null-org service context: supervisor scope insert is allowed by the guard');

select * from finish();
rollback;
