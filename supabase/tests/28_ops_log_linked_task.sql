begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- FR-006: linked_task_id is an OPTIONAL FK -> mos.tasks ON DELETE SET NULL. If the referenced task is
-- ever removed (admin/cascade; app tier can't hard-delete tasks, so this runs as the privileged owner),
-- the link is nulled and the entry SURVIVES. Fixture tree documented in 20260612000003_mos_test_seed.sql.
select mos._test_seed_role_tree();

-- TK: a mos.tasks row in WU-A (R/A/created_by = Author). E: an ops entry linked to TK.
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000a1','Linked Task',
  '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');
insert into ops.log_entries (id, org_id, business_unit_id, title, created_by, linked_task_id) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2','linked entry','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-00000000c001');

-- AC-041a: the link is set before delete.
select is(
  (select linked_task_id from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  '00000000-0000-0000-0000-00000000c001'::uuid,
  'AC-041: linked_task_id set before task removal');

-- AC-041b: remove the task (as postgres); the link is nulled and the entry survives.
delete from mos.tasks where id='00000000-0000-0000-0000-00000000c001';
select is(
  (select linked_task_id from ops.log_entries where id='00000000-0000-0000-0000-00000000e001'),
  null,
  'AC-041: referenced task removed nulls the link, entry survives');

-- SECURITY (Medium, audit 2026-06-12): FK checks existence ONLY, not org. A WU-A entry could reference
-- a WU-B business_unit_id or linked_task_id (existence oracle / cross-org reference leak). The
-- ops._guard_log_entry trigger (BEFORE INSERT OR UPDATE) requires the referenced
-- shared.business_units.org_id and mos.tasks.org_id (when non-null) to EQUAL new.org_id, else RAISE.
-- Asserted under the authenticated role (the real attack surface) by error code.
-- Foreign-org fixtures: BU = B-Unit (...0b02, org b1); task = TK-B in WU-B.
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-00000000c0b1','00000000-0000-0000-0000-0000000000b1','Foreign Task',
  '00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b4',
  '00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b4');
-- A same-org task TK2 in WU-A (for the allowed-link assertion).
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-0000000000a1','Same-org Task',
  '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');

set local role authenticated;
-- Claims = Author (...0d01), a WU-A member.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';

-- AC-013a: INSERT referencing a FOREIGN-org business_unit_id (...0b02, org b1) -> rejected.
select throws_ok($$
  insert into ops.log_entries (business_unit_id, title)
  values ('00000000-0000-0000-0000-0000000000b2','xorg bu insert')
$$, null, null, 'AC-013: insert with foreign-org business_unit_id rejected');

-- AC-014a: INSERT referencing a FOREIGN-org linked_task_id (TK-B, org b1) -> rejected.
select throws_ok($$
  insert into ops.log_entries (business_unit_id, title, linked_task_id)
  values ('00000000-0000-0000-0000-0000000000a2','xorg task insert','00000000-0000-0000-0000-00000000c0b1')
$$, null, null, 'AC-014: insert with foreign-org linked_task_id rejected');

-- AC-013b/AC-014b: a same-org BU + same-org linked task + null linked task all succeed.
select lives_ok($$
  insert into ops.log_entries (id, business_unit_id, title, linked_task_id)
  values ('00000000-0000-0000-0000-00000000e013','00000000-0000-0000-0000-0000000000a2','same-org refs',
          '00000000-0000-0000-0000-00000000c002')
$$, 'AC-013/014: same-org business_unit + same-org linked_task allowed');
select lives_ok($$
  insert into ops.log_entries (id, business_unit_id, title)
  values ('00000000-0000-0000-0000-00000000e014','00000000-0000-0000-0000-0000000000a3','null linked task')
$$, 'AC-014: null linked_task_id allowed');

-- AC-014c: UPDATE re-pointing linked_task_id to a FOREIGN-org task -> rejected (guard covers UPDATE too).
select throws_ok($$
  update ops.log_entries set linked_task_id='00000000-0000-0000-0000-00000000c0b1'
  where id='00000000-0000-0000-0000-00000000e013'
$$, null, null, 'AC-014: update re-pointing linked_task_id cross-org rejected');

reset role;
select * from finish();
rollback;
