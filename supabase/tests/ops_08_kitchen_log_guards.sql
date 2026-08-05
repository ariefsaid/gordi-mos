-- ops, squashed baseline — the kitchen-log guard: everything RLS cannot say on its own.
--
-- ops._guard_kitchen_log folds what were two migrations on the prior chains — the status gate,
-- immutability and the same-org FK seam from one, the reject-provenance stamp from the other — and
-- extends both to the columns this baseline adds. Every carried invariant is asserted here against
-- the merged body, because folding guards is exactly how one quietly disappears.
--
-- The distinction the guard exists for: a WITH CHECK clause cannot compare OLD to NEW. Every rule
-- below is about a TRANSITION rather than about a row, so none of them is expressible as a policy,
-- and each one raises explicitly rather than silently pinning a value — a silent pin looks like
-- success to the caller and produces a row nobody asked for.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

set local role authenticated;

-- ── The status gate (FR-044) ─────────────────────────────────────────────────────────────────
-- A member may submit and may correct their own pending line; they may not decide it is approved.
-- That is the GIGO gate the whole review step exists for.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select throws_ok($$
  update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'only ops_lead/admin may approve or reject a kitchen log',
  'FR-044: a member cannot approve their own production log');
select throws_ok($$
  update ops.kitchen_logs set status = 'Rejected' where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'only ops_lead/admin may approve or reject a kitchen log',
  'FR-044: nor reject one — leaving Submitted in either direction is a reviewer action');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  update ops.kitchen_logs set status = 'Rejected', review_note = 'wrong unit'
   where id = '00000000-0000-0000-0000-00000000ac06'
  $$, 'FR-044 (positive): ops_lead CAN reject, so the two refusals above are the role gate and not a frozen table');

-- ── Reject provenance is stamped server-side ─────────────────────────────────────────────────
-- Reject is a plain guarded UPDATE and the client sends only status and a note. reviewed_by and
-- reviewed_at are client-forgeable provenance, so they are never accepted from the client and are
-- attributed by the guard instead. Approve is left to the approval function, which sets them itself.
reset role;
select is(
  (select reviewed_by from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac06'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'FR-044: the reviewer is stamped server-side on reject, from the session and not from the payload');
select ok(
  (select reviewed_at is not null from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac06'),
  'FR-044: ...and so is the review timestamp');

-- ── Immutability: a fact row cannot be re-attributed or re-homed ─────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select throws_ok($$
  update ops.kitchen_logs set submitted_by = '00000000-0000-0000-0000-0000000000d4'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'submitted_by is immutable',
  'submitted_by is immutable — a log cannot be re-attributed to somebody else after the fact');

select throws_ok($$
  update ops.kitchen_logs set org_id = '00000000-0000-0000-0000-0000000000b1'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'org_id is immutable on a kitchen log',
  'org_id is immutable — a row cannot be re-homed into another tenant on UPDATE');

-- ── The re-target rule, extended to what replaced action_type ────────────────────────────────
-- On the prior chains this froze action_type, wip_item_id and log_date on a Submitted row, because
-- flipping any of them alters the day's actuals silently after they were entered. The movement
-- columns that replaced action_type are the same class of value and are frozen with them.
select throws_ok($$
  update ops.kitchen_logs set action = 'transfer',
                              destination_branch_id = '00000000-0000-0000-0000-00000000bf03'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'the production stream, movement, wip item and date are immutable on a Submitted log',
  'the movement is immutable on a Submitted log — a produce cannot silently become a transfer');
select throws_ok($$
  update ops.kitchen_logs set wip_item_id = '00000000-0000-0000-0000-00000000ab02'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'the production stream, movement, wip item and date are immutable on a Submitted log',
  'the item is immutable on a Submitted log');
select throws_ok($$
  update ops.kitchen_logs set log_date = '2026-06-30'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'the production stream, movement, wip item and date are immutable on a Submitted log',
  'the date is immutable on a Submitted log — moving a run between days moves the day''s COGS with it');

-- The submitter can still fix the thing they are actually likely to have got wrong.
select lives_ok($$
  update ops.kitchen_logs set qty_porsi = 14, notes = 'recounted'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, 'the quantity and the note ARE correctable by the submitter — the freeze is on identity, not on the correction the feature exists for');

-- ── The same-org FK seam ─────────────────────────────────────────────────────────────────────
-- FK lookups bypass RLS and check existence only, so every existence-only reference on this table is
-- a cross-tenant reference unless something compares the org.
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb09','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, '23514', 'business_unit_id must belong to the same org as the kitchen log',
  'a log cannot reference another org''s business unit');

select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab09',1)
  $$, '23514', 'wip_item_id must belong to the same org as the kitchen log',
  'nor another org''s WIP item');

select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                destination_branch_id, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','transfer','00000000-0000-0000-0000-00000000bf09',
          '00000000-0000-0000-0000-00000000ab01',1)
  $$, '23514', 'destination_branch_id must belong to the same org as the kitchen log',
  'nor transfer INTO another org''s branch — the destination is checked as well as the origin');

-- The PEOPLE columns are the same class of reference as the four above, and until now the only ones
-- on this table nothing compared. submitted_by is pinned by the INSERT policy and frozen by the
-- guard, and reviewed_by is stamped server-side on a reject — but reviewed_by sits inside the UPDATE
-- column grant, so a reviewer's own statement can carry one, and neither column is pinned at all on
-- the service and flip-time import paths that write this table without a policy in the way.
select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',1,'00000000-0000-0000-0000-0000000000b4')
  $$, '23514', 'submitted_by must belong to the same org as the kitchen log',
  'a log cannot be submitted in a FOREIGN org''s person''s name');

select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, submitted_by, reviewed_by, reviewed_at, status)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',1,'00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000b4', now(), 'Approved')
  $$, '23514', 'reviewed_by must belong to the same org as the kitchen log',
  'nor reviewed by one — reviewed_by is inside the app tier''s column grant, so it needs the same check as the rest');

-- An imported row legitimately has NO submitter, so the null-guard is load-bearing rather than
-- defensive: without it this write would be diagnosed as a cross-org reference. Run with the role
-- RESET, because that IS the import path — `source = 'import'` is refused to the app tier by policy,
-- and the whole point of the guard is that it still applies to the writer the policy does not.
reset role;
select lives_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, source, status, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-26',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',1,'teable_import','Approved', null)
  $$, 'a row with NO submitter still writes — an imported line has no MOS submitter, and the check must not invent one');

-- ── The plan carries a planner, and it is held to the same rule ──────────────────────────────
-- Unlike the log's submitter, no policy pins this column to the session person: the plan's write
-- gate is the ops_lead/admin role, which says who may write the row and nothing about whose name
-- goes on it.
select throws_ok($$
  insert into ops.kitchen_plans (org_id, log_date, branch_id, activity, action, wip_item_id,
                                 qty_porsi, plan_by)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',1,
          '00000000-0000-0000-0000-0000000000b4')
  $$, '23514', 'plan_by must belong to the same org as the kitchen plan',
  'a plan cannot be attributed to a FOREIGN org''s person');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

-- ── The edit window closes at review ─────────────────────────────────────────────────────────
-- Three controls in three different layers, asserted separately because each can be removed on its
-- own and the other two do not announce it.
--
-- 1. PRIVILEGE. The posting columns are the ERP dispatch record and are written only by the approval
--    path (definer) and the worker (service_role). The app tier holds no column grant on them, which
--    also keeps the enqueue refusal's predicate honest — it reads the posted marker, so that marker
--    must not be writable by the tier the refusal constrains.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select throws_ok($$
  update ops.kitchen_logs set posted_to_esb = false where id = '00000000-0000-0000-0000-00000000aa01'
  $$, '42501', 'permission denied for table kitchen_logs',
  'the posting marker is not writable from the app tier — refused by PRIVILEGE, before any policy or guard is consulted');

select throws_ok($$
  update ops.kitchen_logs set batch_id = 'PR-20260601-999' where id = '00000000-0000-0000-0000-00000000aa01'
  $$, '42501', 'permission denied for table kitchen_logs',
  '...and neither is the batch identifier — the ERP document reference is minted once and is not the app tier''s to restate');

-- The positive that makes the two above a column boundary rather than a table nobody can write.
select lives_ok($$
  update ops.kitchen_logs set qty_porsi = 13 where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '(positive): an ordinary correction on the same table still lands, so the refusals above are the four columns and not the grant');

-- 2. THE GUARD. Every status change is a reviewer action, and review is one-way. The carried rule
--    keyed on the status being LEFT rather than on the act of changing status, which described one
--    direction of a two-directional door.
select throws_ok($$
  update ops.kitchen_logs set status = 'Submitted' where id = '00000000-0000-0000-0000-00000000aa02'
  $$, '42501', 'a reviewed kitchen log keeps its status; record a correction as a new log',
  'a reviewed log keeps its status — even for a reviewer, because the figures behind it have already been signed off and its ERP identifiers are minted once');

update ops.kitchen_logs set status = 'Rejected', review_note = 'portion mismatch'
 where id = '00000000-0000-0000-0000-00000000ac02';
select throws_ok($$
  update ops.kitchen_logs set status = 'Submitted' where id = '00000000-0000-0000-0000-00000000ac02'
  $$, '42501', 'a reviewed kitchen log keeps its status; record a correction as a new log',
  '...and that holds for a rejected log too, so the rule is about leaving review rather than about one outcome of it');

-- 3. THE POLICY. A submitter's arm is scoped to their own row AND to the period before review, so
--    the reach ends where the reviewer's begins. RLS filters rather than raises, so this is a
--    zero-row no-op and the value is read back to prove it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update ops.kitchen_logs set qty_porsi = 999 where id = '00000000-0000-0000-0000-00000000aa02';
reset role;
select is(
  (select qty_porsi from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000aa02'),
  6::numeric(12,2),
  'the submitter''s own edit stops at review: their reviewed row is outside the policy, so the update affects zero rows and the quantity is unchanged');

-- The same submitter on a row still awaiting review, so the zero above is the status term and not a
-- broken persona.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update ops.kitchen_logs set qty_porsi = 14 where id = '00000000-0000-0000-0000-00000000ac03';
reset role;
select is(
  (select qty_porsi from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac03'),
  14::numeric(12,2),
  '(positive): the same submitter DOES still correct a line that has not been reviewed — the window closes at review, it was not closed altogether');

select * from finish();
rollback;
