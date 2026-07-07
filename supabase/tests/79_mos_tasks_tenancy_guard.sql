-- Round-2 audit finding A1 (Sec-High) — mos.tasks tenancy guard.
-- Closes the cross-org reference seam (FKs check existence only; RLS only gated the row's own org_id)
-- plus the created_by/org_id immutability seam. One BEFORE INSERT OR UPDATE trigger, SECURITY INVOKER:
-- a foreign-org id is invisible under INVOKER RLS -> lookup returns NULL -> raise 23514.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Fixture: two orgs, each with a BU + people.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1','Org A','org-a'),
  ('00000000-0000-0000-0000-0000000000b1','Org B','org-b');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a1','A Unit 1'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b1','B Unit 1');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a1','A Member'),
  ('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a1','A Other'),
  ('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b1','B Member');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000a4","access_roles":["member"]}';

-- A1/AC (audit finding A1): a task whose every reference is in org A inserts cleanly.
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, consulted_person_ids, informed_person_ids, created_by)
  values ('Guard Task A',
          '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-0000000000a4',
          '{00000000-0000-0000-0000-0000000000a4}',
          '{00000000-0000-0000-0000-0000000000a4}',
          '00000000-0000-0000-0000-0000000000a4')
$$, 'A1/AC: valid same-org task inserts (all refs resolve within org A)');

-- Cross-org reference seam: each foreign-org reference is rejected by the guard (23514).
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('BU from B','00000000-0000-0000-0000-0000000000b2',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-0000000000a4')
$$, '23514', null, 'A1: foreign-org business_unit_id rejected (same-org FK seam)');

select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Resp from B','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-0000000000a4')
$$, '23514', null, 'A1: foreign-org responsible_person_id rejected');

select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Acc from B','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000b4',
          '00000000-0000-0000-0000-0000000000a4')
$$, '23514', null, 'A1: foreign-org accountable_person_id rejected');

select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, consulted_person_ids, created_by)
  values ('Consult B','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4',
          '{00000000-0000-0000-0000-0000000000b4}',
          '00000000-0000-0000-0000-0000000000a4')
$$, '23514', null, 'A1: foreign-org consulted_person_ids[] element rejected');

select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, informed_person_ids, created_by)
  values ('Inform B','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4',
          '{00000000-0000-0000-0000-0000000000b4}',
          '00000000-0000-0000-0000-0000000000a4')
$$, '23514', null, 'A1: foreign-org informed_person_ids[] element rejected');

select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Creator from B','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-0000000000b4')
$$, '23514', null, 'A1: foreign-org created_by rejected');

-- Immutability (UPDATE only): created_by and org_id cannot change once written (42501). 'Guard Task A'
-- was inserted by the org-A member who is also its R + A, so the update policy (can_edit_task) admits
-- the row; the BEFORE trigger then blocks the immutable-column change. created_by is pivoted to a
-- DIFFERENT valid org-A person (A Other) so the only reason it fails is immutability, not same-org.
select throws_ok($$
  update mos.tasks set created_by = '00000000-0000-0000-0000-0000000000a5'
  where title = 'Guard Task A'
$$, '42501', null, 'A1: created_by is immutable on UPDATE (42501)');

select throws_ok($$
  update mos.tasks set org_id = '00000000-0000-0000-0000-0000000000b1'
  where title = 'Guard Task A'
$$, '42501', null, 'A1: org_id is immutable on UPDATE (42501)');

select * from finish();
rollback;
