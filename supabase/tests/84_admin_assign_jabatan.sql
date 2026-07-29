begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

reset role;
select * from finish();
rollback;
