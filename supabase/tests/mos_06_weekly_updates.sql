-- mos, squashed baseline — weekly updates: the ONE non-org-readable entity in the schema.
--
-- Everything else in `mos` is org-readable by design because cross-unit visibility is the product.
-- This is the exception, and the shape of the exception is UPWARD-ONLY: the author and their
-- manager chain, and nobody else. Sideways (a peer) and downward (a report) both read zero, which
-- is what makes it a reporting line rather than a broadcast.
--
-- The second asymmetry, and the one an "if you can read it you can touch it" model always breaks:
-- a manager may READ an update and may NEVER write one. The manager chain is derived from the role
-- tree, so it is checked recursively and is cycle-safe (shared.is_manager_of).
--
-- Personas from shared._test_seed_directory:
--   Author      ...0d1 Staff R           the subject
--   DirectMgr   ...0d2 Lead R            one level up
--   GrandMgr    ...0d3 Exec              two levels up
--   Peer        ...0d4 Staff R           the same role — sideways
--   Report      ...0d5 SubR              below Author — downward
--   DualHat     ...0d6 Staff R + Staff 2 reports to BOTH DirectMgr and Lead2Holder
--   Lead2Holder ...0d7 Lead 2            DualHat's second manager
--   ForeignMgr  ...0b4 org B             cross-tenant
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select shared._test_seed_directory();

insert into mos.weekly_updates (id, org_id, person_id, week_start, summary, created_by) values
  ('00000000-0000-0000-0000-000000006001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','2026-01-05','Author week', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-000000006002','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d6','2026-01-05','DualHat week','00000000-0000-0000-0000-0000000000d6');
insert into mos.weekly_update_items (id, org_id, weekly_update_id, label, position) values
  ('00000000-0000-0000-0000-000000006003','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000006001','Shipped the thing', 0);

set local role authenticated;

-- ── Upward-only read ─────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'), 1,
  'upward-only: the author reads her own update');
select is((select count(*)::int from mos.weekly_update_items), 1,
  'upward-only: ...and its lines');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'), 1,
  'upward-only: the DIRECT manager reads it');
select is((select count(*)::int from mos.weekly_update_items), 1,
  'upward-only: the direct manager reads its lines — the child inherits the parent gate rather than restating it');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'), 1,
  'upward-only: a GRAND manager reads it — the chain is walked recursively, not one hop');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'), 0,
  'upward-only: a PEER on the same role reads zero — sideways is not upward');
select is((select count(*)::int from mos.weekly_update_items), 0,
  'upward-only: ...and zero lines, so the child does not leak what the parent hides');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'), 0,
  'upward-only: a REPORT reads zero — the direction is up, and only up');

-- Dual-hat: a person holding two roles is reachable from BOTH of their leads. This is why
-- is_manager_of unions over every role the target holds rather than taking a primary one.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006002'), 1,
  'upward-only: a dual-hat person''s SECOND lead reads their update too');
select is((select count(*)::int from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'), 0,
  'upward-only: ...and that second lead reads nothing of an unrelated person''s update');

-- An admin of another org, with a real admin claim, still reads nothing here.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is((select count(*)::int from mos.weekly_updates), 0,
  'upward-only: another org''s ADMIN reads zero — org first, then the chain');

-- ── Author-only write ────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
update mos.weekly_updates set summary = 'Manager edit' where id = '00000000-0000-0000-0000-000000006001';
select is((select summary from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'),
  'Author week',
  'author-only write: a manager who CAN read it writes nothing — read and write are different questions here');
select throws_ok($$
  insert into mos.weekly_update_items (weekly_update_id, label, position)
  values ('00000000-0000-0000-0000-000000006001','Manager line',9)
$$, '42501', null, 'author-only write: nor may a manager add a line to their report''s update');

-- ── Lifecycle: the server owns submitted_at ──────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select submitted_at from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'),
  null, 'lifecycle: a draft carries no submitted_at');
update mos.weekly_updates set status = 'submitted' where id = '00000000-0000-0000-0000-000000006001';
select isnt((select submitted_at from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'),
  null, 'lifecycle: submitting stamps submitted_at server-side — the app sets status only, so the two can never disagree');
update mos.weekly_updates set status = 'draft' where id = '00000000-0000-0000-0000-000000006001';
select is((select submitted_at from mos.weekly_updates where id = '00000000-0000-0000-0000-000000006001'),
  null, 'lifecycle: reopening clears it again');

-- ── The submit-lock, on the summary and on the lines ─────────────────────────────────────────
update mos.weekly_updates set status = 'submitted' where id = '00000000-0000-0000-0000-000000006001';
select throws_ok($$
  update mos.weekly_updates set summary = 'Sneaky edit'
  where id = '00000000-0000-0000-0000-000000006001'
$$, '42501', null,
  'submit-lock: the summary freezes once submitted — a manager may already have read it');
select throws_ok($$
  insert into mos.weekly_update_items (weekly_update_id, label, position)
  values ('00000000-0000-0000-0000-000000006001','Late line',9)
$$, '42501', null, 'submit-lock: no new lines on a submitted update');
update mos.weekly_update_items set label = 'Edited late' where id = '00000000-0000-0000-0000-000000006003';
select is((select label from mos.weekly_update_items where id = '00000000-0000-0000-0000-000000006003'),
  'Shipped the thing',
  'submit-lock: an existing line cannot be rewritten either — the line gate fails closed on a submitted parent, so it is a zero-row no-op');
delete from mos.weekly_update_items where id = '00000000-0000-0000-0000-000000006003';
select is((select count(*)::int from mos.weekly_update_items where id = '00000000-0000-0000-0000-000000006003'),
  1, 'submit-lock: and cannot be deleted');

-- Reopening is the sanctioned way out, so the lock is a workflow step and not a trap.
select lives_ok($$
  update mos.weekly_updates set status = 'draft', summary = 'Reopened and edited'
  where id = '00000000-0000-0000-0000-000000006001'
$$, 'submit-lock: reopening to draft is explicitly allowed, and the summary moves with it');

-- ── Constraints ──────────────────────────────────────────────────────────────────────────────
reset role;
select throws_ok($$
  insert into mos.weekly_updates (org_id, person_id, week_start, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','2026-01-05',
          '00000000-0000-0000-0000-0000000000d1')
$$, '23505', null,
  'one update per person per week — the grain is the week, so a second row for the same one is a duplicate, not a revision');
select throws_ok($$
  insert into mos.weekly_updates (org_id, person_id, week_start, status, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','2026-02-02','archived',
          '00000000-0000-0000-0000-0000000000d4')
$$, '23514', null, 'status is draft or submitted, and nothing else');
select throws_ok($$
  insert into mos.weekly_update_items (org_id, weekly_update_id, label, progress, position)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000006001','Line','stalled',0)
$$, '23514', null, 'a line''s progress is done / in_progress / blocked');
select throws_ok($$
  insert into mos.weekly_update_items (org_id, weekly_update_id, label, position)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000006001','   ',0)
$$, '23514', null, 'a blank line label is refused — whitespace is not content');

select * from finish();
rollback;
