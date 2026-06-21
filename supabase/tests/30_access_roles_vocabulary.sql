begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Fixture: Author (...0d01) holds member + finance (live) + ops_lead (revoked).
select mos._test_seed_role_tree();
select mos._test_seed_access_roles();

-- AC-002 (FR-002): a person holds several; assigned = the non-revoked set union {finance, member}.
select is(
  (select array_agg(access_role order by access_role) from shared.person_access_roles
     where person_id='00000000-0000-0000-0000-0000000000d1' and revoked_at is null),
  array['finance','member']::text[], 'AC-002: assigned set is the union {finance, member}');

-- AC-003 (FR-003/FR-004): 'manager' and any out-of-set value are rejected by the CHECK (23514).
-- Run as the migration owner (postgres) so RLS does not preempt the CHECK error contract.
select throws_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','manager')
$$, '23514', null, 'AC-003: access_role = manager rejected (derived, never assigned)');
select throws_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','superuser')
$$, '23514', null, 'AC-003: out-of-set value rejected');

-- AC-004 (FR-003): the manager capability is derived from the role chain, never a stored row.
select is(
  (select count(*)::int from shared.person_access_roles
     where person_id='00000000-0000-0000-0000-0000000000d6' and access_role='manager'),
  0, 'AC-004: manager capability is derived, never a person_access_roles row');

-- AC-004 sanity: the chain still derives the manager capability. DirectMgr (...0d02) is_manager_of
-- Author (...0d01). is_manager_of reads current_person_id, so set DirectMgr's claim.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select ok(shared.is_manager_of('00000000-0000-0000-0000-0000000000d1'),
  'AC-004: the chain still derives the manager capability (fixture sanity)');

select * from finish();
rollback;
