begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- status<->submitted_at coupling (CHECK + _stamp_submitted_at trigger) and enum/label CHECKs
-- (FR-001/004/005/013/014, §3.4, AC-015/016/017/018).
select mos._test_seed_role_tree();

-- AC-017b: a DIRECT literal desync proof. Suppress the stamping trigger (replica role) so we can
-- attempt a raw mismatched write; the status<->submitted_at CHECK must then fire. Run as the table
-- owner BEFORE switching to the authenticated role.
set local session_replication_role = replica;
select throws_ok($$
  insert into mos.weekly_updates (id, org_id, person_id, week_start, status, submitted_at, created_by)
  values ('00000000-0000-0000-0000-00000000cf01','00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000d1','2026-06-08','submitted', null,
          '00000000-0000-0000-0000-0000000000d1')
$$, '23514', null, 'AC-017: status=submitted with submitted_at NULL is rejected by the CHECK (trigger suppressed)');
set local session_replication_role = origin;

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
insert into mos.weekly_updates (id, person_id, week_start, summary, created_by) values
  ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000d1','2026-06-08','draft week','00000000-0000-0000-0000-0000000000d1');

-- AC-015: into 'submitted' (submitted_at left null) -> trigger stamps it; CHECK holds.
update mos.weekly_updates set status='submitted' where id='00000000-0000-0000-0000-00000000c001';
select isnt((select submitted_at from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  null, 'AC-015: submit stamps submitted_at (trigger owns it; CHECK holds)');

-- AC-016: Reopen back to 'draft' -> submitted_at cleared to null; CHECK holds.
update mos.weekly_updates set status='draft' where id='00000000-0000-0000-0000-00000000c001';
select is((select submitted_at from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001'),
  null, 'AC-016: reopen clears submitted_at to NULL');

-- AC-018a: an invalid status value is rejected by the status CHECK.
select throws_ok($$
  update mos.weekly_updates set status='archived' where id='00000000-0000-0000-0000-00000000c001'
$$, '23514', null, 'AC-018: status outside {draft,submitted} is rejected by CHECK');

-- AC-018b: an invalid line progress value is rejected by the progress CHECK.
select throws_ok($$
  insert into mos.weekly_update_items (weekly_update_id, label, progress, position)
  values ('00000000-0000-0000-0000-00000000c001','x','nope',0)
$$, '23514', null, 'AC-018: progress outside {done,in_progress,blocked} is rejected by CHECK');

-- AC-018c: a blank line label is rejected by the non-blank CHECK.
select throws_ok($$
  insert into mos.weekly_update_items (weekly_update_id, label, progress, position)
  values ('00000000-0000-0000-0000-00000000c001','   ','done',0)
$$, '23514', null, 'AC-018: blank line label is rejected by CHECK');

reset role;
select * from finish();
rollback;
