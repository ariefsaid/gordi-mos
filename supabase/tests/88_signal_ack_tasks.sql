-- AC-413/415 (FR-412/413, D25/D33): a reader may acknowledge a Signal exactly once (self-pinned), and a
-- reader may link a same-org Task to a Signal (created_by self-pinned) — while the Signal itself never
-- gains a work Status. Fixture: 20260716000006_mos_signal_test_seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- Signal owned by OwnTeam (author ...0d1) + a same-org Task to link (both seeded as postgres).
insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body) values
  ('d0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01', now(), 'ack + tasks signal');
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by) values
  ('d3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Follow up on the Signal',
   '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2',
   '00000000-0000-0000-0000-0000000000d1');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- AC-413: a reader acknowledges once (self-pinned), and cannot acknowledge twice.
select lives_ok($$
  insert into mos.signal_acknowledgements (signal_id) values ('d0000000-0000-0000-0000-000000000050')
$$, 'AC-413: a reader can acknowledge the Signal (self-pinned)');
select is((select person_id from mos.signal_acknowledgements where signal_id='d0000000-0000-0000-0000-000000000050'),
  '00000000-0000-0000-0000-0000000000d1'::uuid, 'AC-413: acknowledgement person_id is stamped to the caller');
select throws_ok($$
  insert into mos.signal_acknowledgements (signal_id) values ('d0000000-0000-0000-0000-000000000050')
$$, '23505', null, 'AC-413: a second acknowledgement is rejected (unique signal_id, person_id)');

-- AC-415: a reader links a same-org Task; created_by is self-pinned.
select lives_ok($$
  insert into mos.signal_tasks (signal_id, task_id)
  values ('d0000000-0000-0000-0000-000000000050','d3000000-0000-0000-0000-000000000001')
$$, 'AC-415: a reader can link a same-org Task to the Signal');
select is((select created_by from mos.signal_tasks
             where signal_id='d0000000-0000-0000-0000-000000000050'),
  '00000000-0000-0000-0000-0000000000d1'::uuid, 'AC-415: signal_tasks.created_by is stamped to the caller');

-- AC-415: a Signal carries no work Status (it derives linked-work counts only, never a status).
select hasnt_column('mos','signals','status',
  'AC-415: mos.signals has no status column (Signal never gains work Status)');

reset role;
select * from finish();
rollback;
