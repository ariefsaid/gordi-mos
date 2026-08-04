-- ops, squashed baseline — the contracts carried over from the retired numbered suites (#186).
--
-- WHY THIS FILE EXISTS, stated plainly so it is not mistaken for a grab-bag.
--
-- The squash replaced two migration chains with one domain-ordered set (OD-WAY-35) and re-authored
-- the pgTAP suite alongside it. Twenty-two numbered files from the prior chain survived into the
-- integration branch and aborted on a renamed seed helper. Retiring them is #186's job, and the bar
-- OD-WAY-37 sets is the union of both branches' suites — the CONTRACTS, not the file names. Most of
-- those 22 files' assertions were already re-homed by the link that re-authored their schema, often
-- in a stronger form (a catalog-wide DELETE-grant sweep in ops_01 subsumes five per-table
-- throws_ok). The assertions below are the remainder: every invariant that was proven by a retired
-- file, is still live in the squashed schema, and had NO equivalent anywhere in the new 38 files.
--
-- They are gathered here rather than scattered across ops_03/04/08/09 for one reason: this set is
-- the audit trail of the retirement itself, and a reader checking "was anything dropped?" should be
-- able to read one file against one list rather than reconstruct it from six diffs.
--
-- ON THE `carried/NN` TAGS. Each assertion below cites the retired suite it came from rather than
-- that suite's own AC number. The retired numbering belonged to the pre-squash chain and overlaps
-- the port spec's live AC range — six ids collided outright, so `grep -r AC-014` returned confident
-- green assertions about an unrelated contract. A traceability check that passes for the wrong
-- reason is the same defect class as a test that does. `carried/28` says exactly where the assertion
-- came from and cannot be mistaken for a spec id.
--
-- Retired file each section carries, in order:
--   A  27_ops_log_constraints, 47_log_entries_origin_kitchen
--   B  24_ops_log_insert
--   C  28_ops_log_linked_task
--   D  23_ops_log_read, 25_ops_log_edit_gate (archive half)
--   E  25_ops_log_edit_gate (dual-hat half)
--   F  37_kitchen_plans (upsert key)
--   G  38_kitchen_logs_assign, 40_kitchen_logs_rls_gates, 49_kitchen_reject_provenance
--   H  50_kitchen_stock_for_date
--   I  36_wip_items (reverse direction)
--   J  46_approve_rpc_atomicity (the deferred-mirror assertion)
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_daily_log();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. ops.log_entries — every column constraint on the table (27, 47)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The new suite used these columns constantly and asserted none of them. A CHECK nobody tests is a
-- CHECK a later widening removes without anything going red.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select throws_ok($$
  insert into ops.log_entries (business_unit_id, title)
  values ('00000000-0000-0000-0000-00000000bb01','   ')
  $$, '23514', 'new row for relation "log_entries" violates check constraint "log_entries_title_check"',
  'a blank title is refused — btrim(title) <> '''' rejects whitespace, not merely the empty string');

select throws_ok($$
  insert into ops.log_entries (business_unit_id, event_type, title)
  values ('00000000-0000-0000-0000-00000000bb01','escalation','out-of-set event type')
  $$, '23514', 'new row for relation "log_entries" violates check constraint "log_entries_event_type_check"',
  'event_type is a closed vocabulary — production/receiving/qc/follow_up/other and nothing else');

select throws_ok($$
  insert into ops.log_entries (business_unit_id, origin, title)
  values ('00000000-0000-0000-0000-00000000bb01','imported','out-of-set origin')
  $$, '23514', 'new row for relation "log_entries" violates check constraint "log_entries_origin_check"',
  'origin is a closed vocabulary too, so a surface cannot invent a provenance for its own rows');

-- carried/47. The kitchen mirror that WROTE origin='kitchen' is deferred, but the value is retained in
-- the CHECK on purpose, and the legacy 'kitchen_app' beside it is the incumbent's own writer. A port
-- that tightened this set would break the incumbent silently rather than loudly.
select lives_ok($$
  insert into ops.log_entries (business_unit_id, origin, title)
  values ('00000000-0000-0000-0000-00000000bb01','kitchen','origin kitchen')
  $$, 'carried/47: origin=kitchen is accepted — the value the deferred mirror will write');

select lives_ok($$
  insert into ops.log_entries (business_unit_id, origin, title)
  values ('00000000-0000-0000-0000-00000000bb01','kitchen_app','origin kitchen_app')
  $$, 'carried/47: the incumbent''s legacy kitchen_app origin still writes — back-compat is a retained value, not an accident');

-- The error CODE is the assertion, not merely the refusal. Migration ...0010 states that the guard
-- deliberately does not pre-empt this column rule so the code stays 23502; a guard that grew a null
-- check would still refuse the row, and would change the contract to 23514 with nothing to catch it.
select throws_ok($$
  insert into ops.log_entries (title) values ('no business unit')
  $$, '23502', 'null value in column "business_unit_id" of relation "log_entries" violates not-null constraint',
  'a null business_unit_id is refused by the NOT NULL column itself (23502) — the guard does not pre-empt the more fundamental rule');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. ops.log_entries — server stamping, read back as a value (24)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ops_02 asserts the DEFAULT EXPRESSION on ops.kitchen_logs.org_id from the catalog. That is a
-- different table and a different kind of proof: it says what is written in pg_attrdef, not what
-- lands in the row. Both are worth having; only one of them was here.
insert into ops.log_entries (id, business_unit_id, title)
values ('00000000-0000-0000-0000-00000000ec01','00000000-0000-0000-0000-00000000bb01','stamped entry');

select is(
  (select org_id from ops.log_entries where id = '00000000-0000-0000-0000-00000000ec01'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'carried/24: an insert naming no org_id lands in the session''s org, from the unspoofable claim helper');

select is(
  (select created_by from ops.log_entries where id = '00000000-0000-0000-0000-00000000ec01'),
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  'carried/24: ...and created_by lands as the session person, so authorship is never client-supplied');

-- carried/24: a spoofed org_id is refused. WHICH mechanism refuses it is the part worth stating exactly,
-- because the obvious answer is wrong and this assertion was written twice before it was right.
--
-- The insert policy does carry `org_id = shared.current_org_id()`, and it looks like the control. It
-- is not the one that fires: ops._guard_log_entry is a BEFORE trigger, so it runs before the policy
-- is consulted, and it compares the referenced business unit's org to new.org_id. Every available
-- business_unit_id loses that comparison. A same-org unit reads back org A against a spoofed org B.
-- A foreign unit is invisible under the guard's SECURITY INVOKER RLS, so the lookup returns NULL and
-- NULL is distinct from anything. There is therefore NO reachable input on this table for which the
-- policy's org clause is the thing that refuses — it is defence in depth behind a guard that always
-- fires first, the same relationship ops_02 records for ops.kitchen_logs.
--
-- Asserted as the guard, by its own error code and message. Writing it as a 42501 policy refusal
-- would have been a green test crediting a mechanism that never runs, which is how the thing doing
-- the work gets removed by the next reader.
select throws_ok($$
  insert into ops.log_entries (org_id, business_unit_id, title)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb01','spoofed org')
  $$, '23514', 'business_unit_id must belong to the same org as the log entry',
  'carried/24: an insert naming another org''s org_id is refused by ops._guard_log_entry, which fires before the policy — the policy''s org clause is defence in depth, not the control');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. ops.log_entries.linked_task_id — the optional cross-schema link (28)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This column had zero references in the whole new suite while its guard clause and its ON DELETE
-- SET NULL both shipped. It is the one place `ops` reaches into `mos`, so the org seam on it is a
-- cross-schema seam and the FK checks existence only.
reset role;
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by) values
  ('00000000-0000-0000-0000-00000000ed01','00000000-0000-0000-0000-0000000000a1','Same-org task',
   '00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000ed09','00000000-0000-0000-0000-0000000000b1','Foreign task',
   '00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b4',
   '00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b4');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok($$
  insert into ops.log_entries (id, business_unit_id, title, linked_task_id)
  values ('00000000-0000-0000-0000-00000000ec02','00000000-0000-0000-0000-00000000bb01','linked','00000000-0000-0000-0000-00000000ed01')
  $$, 'carried/28: a same-org task may be linked — the positive that makes the two refusals below a seam and not a dead column');

select lives_ok($$
  insert into ops.log_entries (id, business_unit_id, title)
  values ('00000000-0000-0000-0000-00000000ec03','00000000-0000-0000-0000-00000000bb01','unlinked')
  $$, 'carried/28: the link is optional — a null linked_task_id is the ordinary case');

select throws_ok($$
  insert into ops.log_entries (business_unit_id, title, linked_task_id)
  values ('00000000-0000-0000-0000-00000000bb01','xorg link','00000000-0000-0000-0000-00000000ed09')
  $$, '23514', 'linked_task_id must belong to the same org as the log entry',
  'carried/28: a task in another org cannot be linked — the FK checks existence only, so the cross-schema org seam is the guard''s');

select throws_ok($$
  update ops.log_entries set linked_task_id = '00000000-0000-0000-0000-00000000ed09'
   where id = '00000000-0000-0000-0000-00000000ec02'
  $$, '23514', 'linked_task_id must belong to the same org as the log entry',
  'carried/28: nor re-pointed at one on UPDATE — an INSERT-only guard would leave the seam open to a second statement');

-- ON DELETE SET NULL, from the privileged side: the app tier cannot hard-delete a task, so this is
-- the admin/cascade path. The entry must SURVIVE — a cascade here would delete floor history because
-- somebody tidied a task.
reset role;
delete from mos.tasks where id = '00000000-0000-0000-0000-00000000ed01';
select is(
  (select count(*) filter (where linked_task_id is null)::int from ops.log_entries
    where id = '00000000-0000-0000-0000-00000000ec02'),
  1,
  'carried/28: removing the referenced task nulls the link and the entry survives — ON DELETE SET NULL, never CASCADE');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. ops.log_entries — archiving is a soft, reversible, still-visible state (23, 25)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The policy comment says archived rows are hidden by a query predicate and NOT by RLS. That is a
-- claim about the read policy, and it is only true while nothing adds an archived_at clause to it.
update ops.log_entries set archived_at = now() where id = '00000000-0000-0000-0000-00000000ea02';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select count(*)::int from ops.log_entries where id = '00000000-0000-0000-0000-00000000ea02'),
  1,
  'carried/23: an archived entry is STILL org-readable — RLS does not filter it, so the default feed''s predicate is a UI choice and remains reversible');

-- Author ...0d1 is not Peer ...0d4's manager, so the archive attempt is a no-op rather than an error.
update ops.log_entries set archived_at = null where id = '00000000-0000-0000-0000-00000000ea02';
reset role;
select isnt(
  (select archived_at from ops.log_entries where id = '00000000-0000-0000-0000-00000000ea02'),
  null,
  'carried/25: a non-editor cannot UNarchive either — the same gate covers archive in both directions, and it fails as zero rows rather than an error');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update ops.log_entries set archived_at = null where id = '00000000-0000-0000-0000-00000000ea02';
reset role;
select is(
  (select archived_at from ops.log_entries where id = '00000000-0000-0000-0000-00000000ea02'),
  null,
  'carried/25: the author unarchives their own entry — a soft delete that could not be undone would be a hard one with extra steps');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- E. The dual-hat edit gate, composed end to end (25)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- shared_04 proves shared.is_manager_of unions over held roles, and mos_06 proves the composition on
-- a weekly-update READ gate. Neither reaches ops.can_edit_log_entry, which is a WRITE gate over a
-- different table. One person holding two positions is the case the helper exists for, so the
-- composition is worth asserting where a wrong answer lets the wrong person rewrite floor history.
insert into ops.log_entries (id, org_id, business_unit_id, title, created_by)
values ('00000000-0000-0000-0000-00000000ec04','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000bb01','dual-hat entry','00000000-0000-0000-0000-0000000000d6');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.log_entries set title = 'edited by first lead' where id = '00000000-0000-0000-0000-00000000ec04';
reset role;
select is(
  (select title from ops.log_entries where id = '00000000-0000-0000-0000-00000000ec04'),
  'edited by first lead',
  'carried/25: the lead of the dual-hat author''s FIRST held role can edit their entry');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
update ops.log_entries set title = 'edited by second lead' where id = '00000000-0000-0000-0000-00000000ec04';
reset role;
select is(
  (select title from ops.log_entries where id = '00000000-0000-0000-0000-00000000ec04'),
  'edited by second lead',
  'carried/25: ...and so can the lead of the SECOND — the edit gate unions over held roles, it does not pick one');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- F. ops.kitchen_plans — the upsert key (37)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The migration calls this key load-bearing and nothing asserted it. A plan is re-saved every time
-- somebody adjusts the day's target; if the key stopped matching, the second save would create a
-- SECOND row and the variance baseline would silently double. NULLS NOT DISTINCT is the part that
-- does the work — destination_branch_id is null on a produce, and under the default NULLS DISTINCT
-- two produce plans for the same item, day and stream would not collide at all.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select throws_ok($$
  insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by)
  values ('2026-06-20','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,99,'00000000-0000-0000-0000-0000000000d2')
  $$, '23505', null,
  'FR-031: a second plan for the same item, day and stream COLLIDES — with a null destination, which is what NULLS NOT DISTINCT buys');

insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by)
values ('2026-06-20','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,99,'00000000-0000-0000-0000-0000000000d2')
on conflict (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id)
do update set qty_porsi = excluded.qty_porsi;

reset role;
select results_eq($$
  select count(*)::int, max(qty_porsi)::int from ops.kitchen_plans
   where org_id = '00000000-0000-0000-0000-0000000000a1' and log_date = '2026-06-20'
     and wip_item_id = '00000000-0000-0000-0000-00000000ab01'
     and branch_id = '00000000-0000-0000-0000-00000000bf02' and activity = 'kitchen' and action = 'produce'
  $$, $$ values (1, 99) $$,
  'FR-031: so the re-save takes the UPDATE path — one row carrying the new target, not two rows summing to a doubled baseline');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- H. ops.kitchen_stock_for_date — the one-round-trip reader (50)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Run BEFORE section G, which approves logs: available_qty nets Approved rows, so an approval above
-- this point would move the numbers it reads.
--
-- available_qty had zero occurrences in the new 38 files. The reader's whole reason to exist is
-- returning BOTH balances per item in one call, and only the stored half was ever asserted.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- ab01 holds a stored row for this stream on 2026-06-19 (10); ab02 and ab03 hold none.
select is(
  (select usable_qty from ops.kitchen_stock_for_date('2026-06-19','00000000-0000-0000-0000-00000000bf02','kitchen')
    where wip_item_id = '00000000-0000-0000-0000-00000000ab02'),
  0::numeric(12,2),
  'AC: an item with no stored balance that day reads 0, not a missing row — the capture surface needs a line for every item it can log against');

-- The lateral join is the reason a caller can trust one number against the other. If the two ever
-- disagreed, the surface would show a start-of-day cut computed from a different rule than the one
-- every other caller of the scalar gets.
select is(
  (select available_qty from ops.kitchen_stock_for_date('2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen')
    where wip_item_id = '00000000-0000-0000-0000-00000000ab01'),
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-06-25',
                               '00000000-0000-0000-0000-00000000bf02','kitchen'),
  'AC: the reader''s available_qty IS the scalar''s answer — one rule for the start-of-day cut, not two implementations that can drift');

select is(
  (select available_qty from ops.kitchen_stock_for_date('2026-06-01','00000000-0000-0000-0000-00000000bf02','kitchen')
    where wip_item_id = '00000000-0000-0000-0000-00000000ab01'),
  0::numeric(12,2),
  'AC: available_qty is start-of-day on the reader too — the day''s own production is not yet available at the start of it');

-- RLS is the ONLY thing scoping this function: unlike the scalar it carries no org_id predicate of
-- its own, so the isolation claim in its comment rests entirely on the policies underneath it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is(
  (select count(*)::int from ops.kitchen_stock_for_date('2026-06-19','00000000-0000-0000-0000-00000000bf02','kitchen')
    where wip_item_id = '00000000-0000-0000-0000-00000000ab01'),
  0,
  'AC: another tenant''s admin reads none of org A''s items through the reader — it holds no org predicate, so RLS is doing all of the work');

-- flag_active is the filter in the function body and had zero references in the new suite. Retiring
-- an item is how master data is withdrawn; if the filter went, withdrawn items would reappear on
-- every capture surface.
reset role;
update ops.wip_items set flag_active = false where id = '00000000-0000-0000-0000-00000000ab03';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select count(*)::int from ops.kitchen_stock_for_date('2026-06-19','00000000-0000-0000-0000-00000000bf02','kitchen')
    where wip_item_id = '00000000-0000-0000-0000-00000000ab03'),
  0,
  'AC: a retired WIP item drops out of the reader — flag_active is how master data is withdrawn, and it is enforced here rather than left to each caller');
reset role;
update ops.wip_items set flag_active = true where id = '00000000-0000-0000-0000-00000000ab03';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- I. ops.wip_items — the seam in the other direction (36)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ops_02 walks six tables A→B and only five of them B→A; wip_items is the one missing from the
-- reverse list. Master data is where a one-directional read would be least obvious, because the
-- catalog is the thing every other surface joins to.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is(
  (select count(*)::int from ops.wip_items where org_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'carried/36: an org-B admin reads zero org-A WIP items — the item catalog''s seam is not one-directional either');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- G. ops.kitchen_logs — the guard as a catalog object, and the two behaviours nothing named (38, 40, 49)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The role gate on approve/reject lives ONLY in this trigger — the UPDATE policy is org-and-author
-- scoped and admits any submitter. So the trigger existing and being ENABLED is the control, and
-- `alter table ... disable trigger` is a one-line change that no behavioural test can see coming.
-- reporting_05 asserts exactly this pair for its own guard; kitchen_logs never got it.
reset role;
select has_trigger('ops','kitchen_logs','kitchen_logs_guard',
  'the kitchen log guard is present as a catalog object, not merely implied by behaviour');

select is(
  (select t.tgenabled::text from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ops' and c.relname = 'kitchen_logs' and t.tgname = 'kitchen_logs_guard'),
  'O',
  '...and it is ENABLED — a disabled trigger still passes has_trigger while enforcing nothing, and the approve/reject role gate lives nowhere else');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
values ('00000000-0000-0000-0000-00000000ee01','00000000-0000-0000-0000-00000000bb01','2026-06-23',
        '00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',5);
reset role;
select is(
  (select status from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ee01'),
  'Submitted',
  'carried/38: a member''s log lands Submitted by DEFAULT — the insert policy pins the value, and this is the column default that has to agree with it');

-- The reject stamp REWRITES the NEW row inside the guard. reviewed_by and reviewed_at are asserted
-- in ops_08; the note the reviewer actually typed is the one field the guard must leave alone, and
-- a change there would leave a rejected log with attribution and no reason.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.kitchen_logs set status = 'Rejected', review_note = 'portion mismatch'
 where id = '00000000-0000-0000-0000-00000000ee01';
reset role;
select is(
  (select review_note from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ee01'),
  'portion mismatch',
  'FR-044: the reviewer''s own note survives the stamp — the guard adds provenance to the row, it does not rewrite what the reviewer said');

-- ops_08 names only the reject positive. ops_09 leans on this path for its stock arithmetic without
-- asserting it, so a regression here would surface as a confusing stock failure two files away.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ac11'
  $$, 'FR-044 (positive): ops_lead may also move a log to Approved directly, so the guard admits both reviewer outcomes and not only rejection');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- J. Approval writes NO Daily Log mirror row (46)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The Daily Log mirror is DEFERRED: the prior chain mirrored each approval into ops.log_entries and that
-- mirror was removed. The surface it used survives — origin still admits 'kitchen' and the partial
-- unique index on the batch id is still there — so re-adding the mirror is a small change, and
-- nothing would have gone red. An absence is only evidence if something is watching it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac12', null);
reset role;
select is(
  (select count(*)::int from ops.log_entries
    where org_id = '00000000-0000-0000-0000-0000000000a1' and origin = 'kitchen'
      and title not in ('origin kitchen')),
  0,
  'carried/46: the deferred Daily Log mirror stays deferred — an approval writes no Daily Log mirror row — asserted so re-adding one is a decision rather than a side effect');

select * from finish();
rollback;
