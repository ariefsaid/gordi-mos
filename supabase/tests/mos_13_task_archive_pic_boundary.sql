-- OD-WAY-94 archive actor boundary: a Task PIC may edit, but may not archive or unarchive,
-- including when the PIC is also stored as Supervisor. The existing Supervisor and
-- manager-above-PIC paths remain valid.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select shared._test_seed_directory();
set local role authenticated;

-- Author ...d1 is the PIC. DualHat ...d6 is a distinct Supervisor; DirectMgr ...d2 manages the PIC.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values
  ('00000000-0000-0000-0000-000000006010',
   '00000000-0000-0000-0000-0000000000a1', 'OD-94 archive boundary',
   '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d6',
   '00000000-0000-0000-0000-0000000000d1');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set archived_at = now()
  where id = '00000000-0000-0000-0000-000000006010'
$$, 'a distinct Supervisor can archive');
select lives_ok($$
  update mos.tasks set archived_at = null
  where id = '00000000-0000-0000-0000-000000006010'
$$, 'the distinct Supervisor can unarchive');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set archived_at = now()
  where id = '00000000-0000-0000-0000-000000006010'
$$, 'a manager above the PIC can archive');
select lives_ok($$
  update mos.tasks set archived_at = null
  where id = '00000000-0000-0000-0000-000000006010'
$$, 'the manager above the PIC can unarchive');

-- Two-step exploit proof: the PIC can edit Supervisor to themself, but the new boundary still
-- refuses the following archive and reads OLD.responsible_person_id rather than a mutable NEW row.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set accountable_person_id = '00000000-0000-0000-0000-0000000000d1'
  where id = '00000000-0000-0000-0000-000000006010'
$$, 'the PIC may edit Supervisor to themself');
select is(
  (select accountable_person_id from mos.tasks where id = '00000000-0000-0000-0000-000000006010'),
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  'the two-step setup really makes the PIC the stored Supervisor');
select throws_ok($$
  update mos.tasks set archived_at = now()
  where id = '00000000-0000-0000-0000-000000006010'
$$, '42501', null,
  'the PIC cannot archive even when also stored as Supervisor');
select is(
  (select archived_at from mos.tasks where id = '00000000-0000-0000-0000-000000006010'),
  null::timestamptz,
  'the denied PIC archive leaves the Task active');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set archived_at = now()
  where id = '00000000-0000-0000-0000-000000006010'
$$, 'a manager above the PIC can archive after the Supervisor is the PIC');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update mos.tasks set archived_at = null
  where id = '00000000-0000-0000-0000-000000006010'
$$, '42501', null,
  'the PIC cannot unarchive even when also stored as Supervisor');
select ok(
  (select archived_at is not null from mos.tasks where id = '00000000-0000-0000-0000-000000006010'),
  'the denied PIC unarchive leaves the Task archived');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set archived_at = null
  where id = '00000000-0000-0000-0000-000000006010'
$$, 'the manager above the PIC can unarchive after the two-step case');

reset role;
select * from finish();
rollback;
