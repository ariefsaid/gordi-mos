begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Fixture: two orgs; org A has a BU + a member person (the creator, who is also R+A by default).
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1','Org A','org-a'),
  ('00000000-0000-0000-0000-0000000000b1','Org B','org-b');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a1','A Unit 1');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a1','A Member');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000a4"}';

-- AC-010: insert with title+BU+R+A and NO org_id -> default stamps the session org A.
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Honest Task','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-0000000000a4')
$$, 'AC-010: member inserts a task without org_id (default stamps session org)');

select is(
  (select org_id from mos.tasks where title = 'Honest Task'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'AC-010: inserted task org_id was stamped to the session org (not client-supplied)'
);

-- AC-011: explicit foreign org_id (org B) -> WITH CHECK rejects (42501).
select throws_ok($$
  insert into mos.tasks (org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('00000000-0000-0000-0000-0000000000b1','Spoof Task','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-0000000000a4')
$$, '42501', null, 'AC-011: client cannot stamp a foreign org_id (WITH CHECK blocks spoof)');

-- AC-012: bad status AND blank title both rejected by CHECK (23514).
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, status, responsible_person_id, accountable_person_id, created_by)
  values ('Bad Status','00000000-0000-0000-0000-0000000000a2','Bogus',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-0000000000a4')
$$, '23514', null, 'AC-012: invalid status rejected by CHECK');

select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-0000000000a4')
$$, '23514', null, 'AC-012: blank title rejected by CHECK (btrim(title) <> '''')');

select * from finish();
rollback;
