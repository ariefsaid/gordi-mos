begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Fixture: Author (...0d01) holds member + finance (live) + ops_lead (revoked).
select mos._test_seed_role_tree();
select mos._test_seed_access_roles();

-- AC-002 (FR-002): a person holds several; assigned = the non-revoked set union {finance, member}.
select is(
  (select array_agg(access_role order by access_role) from shared.person_access_roles
     where person_id='00000000-0000-0000-0000-0000000000d1' and revoked_at is null),
  array['finance','member']::text[], 'AC-002: assigned set is the union {finance, member}');

-- AC-101 (FR-101): 'manager' is now a VALID access-role value (ADR-0050); only out-of-set values are rejected.
-- Run as the migration owner (postgres) so RLS does not preempt the CHECK error contract.
select lives_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','manager')
$$, 'AC-101: access_role = manager is accepted (ADR-0050)');
select throws_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','superuser')
$$, '23514', null, 'AC-302: out-of-set value rejected');

-- AC-301 (FR-301): 'supervisor' is a VALID access-role value (ADR-0051).
select lives_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','supervisor')
$$, 'AC-301: access_role = supervisor is accepted (ADR-0051)');

-- AC-103b: the reporting-line manager (is_manager_of) still derives from the role chain, never a
-- stored row — distinct from the manager access role (which IS now a stored row, above).
select is(
  (select count(*)::int from shared.person_access_roles
     where person_id='00000000-0000-0000-0000-0000000000d6' and access_role='manager'),
  0, 'AC-103b: reporting-line manager still derived from the role chain (distinct from the manager access role)');

-- AC-103b sanity: the chain still derives the manager capability. DirectMgr (...0d02) is_manager_of
-- Author (...0d01). is_manager_of reads current_person_id, so set DirectMgr's claim.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select ok(shared.is_manager_of('00000000-0000-0000-0000-0000000000d1'),
  'AC-103b: reporting-line manager still derived from the role chain (distinct from the manager access role)');

select * from finish();
rollback;
