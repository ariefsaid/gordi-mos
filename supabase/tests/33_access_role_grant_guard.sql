begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Fixture: GrandMgr (...0d03) -> admin; Author (...0d01) -> member/finance live + ops_lead revoked.
-- The admin under test is GrandMgr (...0d03). Targets with NO fixture rows: DirectMgr (...0d02),
-- Peer (...0d04). Author (...0d01) carries the rows used for the immutability checks.
select mos._test_seed_role_tree();
select mos._test_seed_access_roles();

set local role authenticated;

-- AC-030 (FR-030, NFR-001/003): a non-admin (Peer ...0d04, holding only member) INSERT -> RLS denies.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d2','member')
$$, '42501', null, 'AC-030: non-admin grant denied by RLS');

-- Switch to the admin session (GrandMgr ...0d03).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-031 (FR-030/FR-033): admin grants member to ANOTHER person (DirectMgr ...0d02) -> granted_by =
-- the admin's current_person_id, org_id server-stamped.
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d2','member')
$$, 'AC-031: admin grants member to another person');
select is(
  (select array[granted_by, org_id] from shared.person_access_roles
     where person_id='00000000-0000-0000-0000-0000000000d2' and access_role='member'),
  array['00000000-0000-0000-0000-0000000000d3'::uuid,'00000000-0000-0000-0000-0000000000a1'::uuid],
  'AC-031: granted_by = admin person, org_id server-stamped');

-- AC-032 (FR-031, NFR-001): admin grants admin to SELF -> guard denies (42501).
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d3','admin')
$$, '42501', null, 'AC-032: admin never self-assignable');

-- AC-033 (FR-031, NFR-001): admin grants finance to SELF -> guard denies (42501).
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d3','finance')
$$, '42501', null, 'AC-033: finance never self-assignable');

-- AC-034 (FR-030/FR-031): admin grants finance to ANOTHER person (Peer ...0d04) -> succeeds (only SELF
-- of admin/finance is blocked).
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d4','finance')
$$, 'AC-034: admin may grant finance to another person');

-- AC-035 (FR-032): UPDATE re-targeting person_id / access_role / org_id of an existing grant -> denied
-- (42501, immutable); an UPDATE that only flips revoked_at -> lives. Target: Author's member row.
select throws_ok($$
  update shared.person_access_roles set access_role = 'ops_lead'
   where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='member'
$$, '42501', null, 'AC-035: access_role immutable on UPDATE');
select lives_ok($$
  update shared.person_access_roles set revoked_at = now()
   where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='member'
$$, 'AC-035: an UPDATE that only sets revoked_at succeeds');

-- AC-036 (FR-033, NFR-002/003): admin INSERT with a FOREIGN org_id -> WITH CHECK rejects (42501).
select throws_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d2','ops_lead')
$$, '42501', null, 'AC-036: foreign org_id rejected by WITH CHECK');

reset role;
select * from finish();
rollback;
