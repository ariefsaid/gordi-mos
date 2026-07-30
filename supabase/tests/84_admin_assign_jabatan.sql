begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select mos._test_seed_role_tree();      -- org a1 people d1..d7, roles f1..f6/c1; org b1 person b4, role c1
select mos._test_seed_access_roles();   -- grants admin -> GrandMgr (...d3)

set local role authenticated;

-- Admin session = GrandMgr (...d3).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-111: admin assigns a Position to Peer (...d4) -> Lead R (...f2), not already held.
select lives_ok($$
  insert into shared.person_roles (person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f2')
$$, 'AC-111: admin assigns a Position (person_roles insert)');
select is(
  (select org_id from shared.person_roles
     where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f2'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'AC-111: org_id server-stamped on assign');

-- AC-118 (M-1, audit 2026-07-30): a Jabatan assignment is ATTRIBUTABLE. Assigning a top-of-chain
-- Position silently widens what the holder can read/write (shared.is_manager_of unions over
-- person_roles, which gates mos.tasks read+update, weekly updates and ops logs). Before this the row
-- carried no actor at all, so a permission-affecting write left no trace of who made it (STRIDE
-- Repudiation). granted_by is stamped by the guard, never by the client.
select is(
  (select granted_by from shared.person_roles
     where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f2'),
  '00000000-0000-0000-0000-0000000000d3'::uuid,
  'AC-118: granted_by is server-stamped to the acting admin on assign');

-- AC-119: and a client-supplied granted_by is OVERWRITTEN, not trusted — otherwise the attribution
-- is worthless, since the actor could name someone else. (d5,f2) is a free pair in the role tree.
select lives_ok($$
  insert into shared.person_roles (person_id, role_id, granted_by)
  values ('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000f2',
          '00000000-0000-0000-0000-0000000000d1')
$$, 'AC-119: insert with a spoofed granted_by is accepted');
select is(
  (select granted_by from shared.person_roles
     where person_id='00000000-0000-0000-0000-0000000000d5' and role_id='00000000-0000-0000-0000-0000000000f2'),
  '00000000-0000-0000-0000-0000000000d3'::uuid,
  'AC-119: the spoofed granted_by was replaced by the real actor (...d3), not stored as sent');

-- AC-112: admin removes a Position (Peer's Staff R ...f3 row seeded by role tree).
select lives_ok($$
  delete from shared.person_roles
   where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f3'
$$, 'AC-112: admin removes a Position');
select is(
  (select count(*)::int from shared.person_roles
     where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f3'),
  0, 'AC-112: Position row removed');

-- AC-114: cross-org role_id rejected by guard (assign Peer ...d4 the WU-B B-Lead ...c1).
select throws_ok($$
  insert into shared.person_roles (person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000c1')
$$, '42501', null, 'AC-114: cross-org Position rejected by guard');

-- AC-115: explicit foreign org_id rejected by WITH CHECK.
select throws_ok($$
  insert into shared.person_roles (org_id, person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f2')
$$, '42501', null, 'AC-115: foreign org_id rejected by WITH CHECK');

-- AC-116: cross-org PERSON rejected by guard (assign org-B person ...b4 an org-A role ...f2). The guard
-- checks the PERSON's org (not just the role's), so a same-org role to a foreign person is still refused.
select throws_ok($$
  insert into shared.person_roles (person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000f2')
$$, '42501', null, 'AC-116: cross-org person rejected by guard');

-- AC-110: admin grants manager to another person (...d4) -> lives; to self (...d3) -> 42501 (self-guard).
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d4','manager')
$$, 'AC-110: admin grants manager to another person');
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d3','manager')
$$, '42501', null, 'AC-110: manager not self-assignable');

-- AC-113: non-admin (Peer ...d4, no access roles) cannot assign a Position.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":[]}';
select throws_ok($$
  insert into shared.person_roles (person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f2')
$$, '42501', null, 'AC-113: non-admin Position assign denied by RLS');

-- AC-117: non-admin DELETE is denied. The delete policy USING is admin-only, so a non-admin's delete
-- matches zero rows and silently no-ops (no error) — prove the target row (...d4 -> ...f2 from AC-111)
-- is untouched, so a future policy regression that let it through would fail here loudly.
select lives_ok($$
  delete from shared.person_roles
   where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f2'
$$, 'AC-117: non-admin delete runs without error (RLS filters the row out)');
select is(
  (select count(*)::int from shared.person_roles
     where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f2'),
  1, 'AC-117: non-admin delete removed nothing (row still present)');

reset role;
select * from finish();
rollback;
