begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- UNIQUE-per-week, line write gate, line+summary submit-lock, ON DELETE CASCADE, org spoof
-- (FR-002/007/015/016/017, AC-020/021/022/023).
select mos._test_seed_role_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
insert into mos.weekly_updates (id, person_id, week_start, summary, created_by) values
  ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000d1','2026-06-08','week one','00000000-0000-0000-0000-0000000000d1');

-- AC-020: a second update for the same (person, week) -> UNIQUE rejects.
select throws_ok($$
  insert into mos.weekly_updates (person_id, week_start, summary, created_by)
  values ('00000000-0000-0000-0000-0000000000d1','2026-06-08','dupe','00000000-0000-0000-0000-0000000000d1')
$$, '23505', null, 'AC-020: UNIQUE(org,person,week) rejects a second update for the same person+week');

-- AC-021a: the author (draft) inserts a line -> succeeds.
insert into mos.weekly_update_items (id, weekly_update_id, label, progress, position) values
  ('00000000-0000-0000-0000-0000000e0001','00000000-0000-0000-0000-00000000c001','did stuff','in_progress',0);
select is((select count(*)::int from mos.weekly_update_items where id='00000000-0000-0000-0000-0000000e0001'),
  1, 'AC-021: author can insert a line while the parent is draft');

-- AC-021b: a peer attempts a line insert on the author's update -> denied by can_write_own_update.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
select throws_ok($$
  insert into mos.weekly_update_items (weekly_update_id, label, progress, position)
  values ('00000000-0000-0000-0000-00000000c001','peer line','done',1)
$$, '42501', null, 'AC-021: a non-author (peer) cannot write a line on the author''s update');

-- AC-006/org spoof: a line insert with a foreign org_id -> rejected by WITH CHECK.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select throws_ok($$
  insert into mos.weekly_update_items (org_id, weekly_update_id, label, progress, position)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000c001','x','done',2)
$$, '42501', null, 'AC-021: a line insert with a foreign org_id is rejected (unspoofable org)');

-- AC-023: submit the update, then attempt a line INSERT without reopening -> denied (parent not draft).
update mos.weekly_updates set status='submitted' where id='00000000-0000-0000-0000-00000000c001';
select throws_ok($$
  insert into mos.weekly_update_items (weekly_update_id, label, progress, position)
  values ('00000000-0000-0000-0000-00000000c001','late line','done',3)
$$, '42501', null, 'AC-023: line write on a SUBMITTED (locked) update is denied until reopened');

-- AC-023 (summary side): editing the summary of a still-submitted update raises 42501 (guard trigger).
select throws_ok($$
  update mos.weekly_updates set summary='sneaky edit' where id='00000000-0000-0000-0000-00000000c001'
$$, '42501', null, 'AC-023: summary edit on a submitted update raises 42501 (submit-lock trigger)');

-- AC-022: cascade — delete the parent (as owner, bypassing RLS since authenticated has no DELETE);
-- its lines must be gone. Verified as the table owner.
reset role;
set local row_security = off;
delete from mos.weekly_updates where id='00000000-0000-0000-0000-00000000c001';
select is((select count(*)::int from mos.weekly_update_items where weekly_update_id='00000000-0000-0000-0000-00000000c001'),
  0, 'AC-022: deleting a weekly update cascade-deletes its lines');

select * from finish();
rollback;
