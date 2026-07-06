-- mos.comments RLS + append-only guard (ADR-0019 D4 / P3a Phase F).
-- AC-P3-CM-001: same-org members can read comments; cross-org callers read 0; INSERT stamps
-- org_id/author_id from JWT; comments are append-only (no UPDATE/DELETE).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select mos._test_seed_role_tree();

-- Role tree recap (org WU-A = ...0a1, org WU-B = ...0b1):
--   Author     ...0d1 [Staff R, org A]  -- comment author under test
--   DirectMgr  ...0d2 [Lead R,  org A]  -- same-org reader
--   ForeignMgr ...0b4 [B-Lead,  org B]  -- cross-org reader

set local role authenticated;

-- A same-org task is the entity under comment. The comments v1 read posture is same-org, matching
-- the existing task read posture and the Director decision in the plan.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

insert into mos.tasks
  (id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values
  ('00000000-0000-0000-0000-00000000c001', 'Commented task',
   '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d2',
   '00000000-0000-0000-0000-0000000000d1');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'comments'),
  'AC-P3-CM-001: mos.comments has RLS enabled and forced');

select ok(
  (select with_check is not null
     from pg_policies
    where schemaname = 'mos' and tablename = 'comments' and policyname = 'comments_insert'),
  'AC-P3-CM-001: comments INSERT policy carries a WITH CHECK');

select lives_ok($$
  insert into mos.comments (id, entity_type, entity_id, body)
  values ('00000000-0000-0000-0000-00000000c101', 'task',
          '00000000-0000-0000-0000-00000000c001', 'Please review @direct')
$$, 'AC-P3-CM-001: author INSERT without org_id/author_id succeeds (stamped from JWT)');

select is(
  (select org_id::text from mos.comments where id = '00000000-0000-0000-0000-00000000c101'),
  '00000000-0000-0000-0000-0000000000a1',
  'AC-P3-CM-001: org_id stamped from the JWT org_id claim');

select is(
  (select author_id::text from mos.comments where id = '00000000-0000-0000-0000-00000000c101'),
  '00000000-0000-0000-0000-0000000000d1',
  'AC-P3-CM-001: author_id stamped from the JWT person_id claim');

-- Same-org non-author can read comments in v1.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.comments where id = '00000000-0000-0000-0000-00000000c101'),
  1, 'AC-P3-CM-001: same-org member can read the comment');

-- Cross-org caller cannot see it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.comments where id = '00000000-0000-0000-0000-00000000c101'),
  0, 'AC-P3-CM-001: cross-org caller sees 0 comments');

-- Back to author: comments are append-only.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok(
  $$update mos.comments set body = 'edited' where id = '00000000-0000-0000-0000-00000000c101'$$,
  '42501', null, 'AC-P3-CM-001: UPDATE is rejected (append-only)');

select throws_ok(
  $$delete from mos.comments where id = '00000000-0000-0000-0000-00000000c101'$$,
  '42501', null, 'AC-P3-CM-001: DELETE is rejected (append-only)');

reset role;

select * from finish();
rollback;
