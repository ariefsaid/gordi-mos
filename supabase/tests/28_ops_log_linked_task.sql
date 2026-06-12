begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

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

select * from finish();
rollback;
