-- Regression (mig 20260729000005): the org-seam guards on shared.person_roles and
-- reporting.supervisor_revenue_scope must EXEMPT the service/seed context (current_org_id() NULL),
-- so `supabase db reset` (seed.sql seeds person_roles) and fresh deploys don't 42501. Before the fix
-- this file aborts at the `_test_seed_role_tree()` call below — the helper's OWN person_roles inserts
-- hit the guard under null org and raise 42501 before the explicit assertions even run (that abort is
-- itself the regression trigger; the check provably could fail). Post-fix, seed + both inserts pass.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

-- AC-215: the service/seed insert above must leave granted_by NULL. FR-208 promises this in prose;
-- without an assertion, a future column DEFAULT could silently attribute seed rows to a real person.
select is(
  (select granted_by from shared.person_roles
     where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f2'),
  null, 'AC-215: service/seed context leaves granted_by NULL (no actor to attribute)');

-- ── M-2 (security audit 2026-07-30): the OTHER half of the exemption ──────────────────────────
-- The two assertions above prove the guard LETS THE SEED THROUGH. Nothing proved it still KEEPS
-- ATTACKERS OUT. Mig ...000005 deliberately disabled the org-seam check whenever current_org_id()
-- is NULL, taking these two tables from two walls down to one: the RLS WITH CHECK
-- `org_id = shared.current_org_id() and shared.has_access_role('admin')`, which refuses a
-- null-org session only because `org_id = NULL` evaluates to NULL rather than TRUE.
--
-- That is a subtle wall to be standing on alone, and the failure mode is specific: the next time a
-- seed breaks, the reflex that produced ...000005 ("loosen the check") would relax that WITH CHECK
-- and re-open an org-unbound write into both tables — with no failing test anywhere. These two
-- assertions are that missing test. They pin the wall, not the exemption.
--
-- Session: authenticated, admin claim, person_id set — but NO org_id claim, which is the only
-- authenticated shape that reaches the exempted branch of the guard.
set local role authenticated;
set local request.jwt.claims = '{"person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

select throws_ok($$
  insert into shared.person_roles (org_id, person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000f2')
$$, '42501', null,
  'M-2: an AUTHENTICATED null-org session is still refused on person_roles (the guard exemption is not a bypass)');

select throws_ok($$
  insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','B2B',null)
$$, '42501', null,
  'M-2: an AUTHENTICATED null-org session is still refused on supervisor_revenue_scope');

reset role;
-- L-2 (security review): M-2 above pins ONE of the three legs holding this door shut — the RLS
-- WITH CHECK. The other two are the absent table grants and org_id NOT NULL. The grants matter most:
-- mig ...000005's comment justifies the exemption by calling service_role "trusted + bypasses RLS",
-- but service_role is actually stopped by having NO INSERT GRANT — BYPASSRLS confers no table
-- privileges. If anyone runs the Supabase-conventional `grant all on all tables in schema shared to
-- service_role`, that comment's rationale becomes the real security model and a leaked service key
-- becomes an unguarded cross-org write. These four assertions pin the leg the comment misdescribes.
select ok(not has_table_privilege('service_role','shared.person_roles','INSERT'),
  'L-2: service_role holds no INSERT on person_roles (this, not "trust", is what stops a leaked service key)');
select ok(not has_table_privilege('anon','shared.person_roles','INSERT'),
  'L-2: anon holds no INSERT on person_roles');
select ok(not has_table_privilege('service_role','reporting.supervisor_revenue_scope','INSERT'),
  'L-2: service_role holds no INSERT on supervisor_revenue_scope');
select ok(not has_table_privilege('anon','reporting.supervisor_revenue_scope','INSERT'),
  'L-2: anon holds no INSERT on supervisor_revenue_scope');

select * from finish();
rollback;
