-- ops, squashed baseline — the Daily Log guard, and stock as a per-stream balance.
--
-- Two areas that share a file because each is small and neither belongs with the production-fact
-- payload: the Daily Log is a narrative record with no stream at all, and stock is the read side of
-- the stream dimension.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_daily_log();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. ops.log_entries — the guard the 2026-06-12 audit added, carried whole
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The seam it closes is subtle enough to be worth restating: ops.can_edit_log_entry re-reads the row
-- BY ID, so an UPDATE's WITH CHECK evaluates the gate against the OLD created_by and never sees the
-- NEW value. An author therefore passes the gate and could then re-attribute the entry to anyone,
-- including a foreign-org person. WITH CHECK cannot compare OLD to NEW, so this is a trigger.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';

select throws_ok($$
  update ops.log_entries set created_by = '00000000-0000-0000-0000-0000000000d4'
   where id = '00000000-0000-0000-0000-00000000ea01'
  $$, '42501', 'created_by is immutable on a log entry',
  'created_by is immutable on a Daily Log entry — the author gate is evaluated against the old value, so authorship has to be frozen separately');

select throws_ok($$
  update ops.log_entries set org_id = '00000000-0000-0000-0000-0000000000b1'
   where id = '00000000-0000-0000-0000-00000000ea01'
  $$, '42501', 'org_id is immutable on a log entry',
  'org_id is immutable on a Daily Log entry');

select lives_ok($$
  update ops.log_entries set title = 'author corrected'
   where id = '00000000-0000-0000-0000-00000000ea01'
  $$, '(positive): the author CAN still edit the content of their own entry');

select throws_ok($$
  insert into ops.log_entries (business_unit_id, event_type, title)
  values ('00000000-0000-0000-0000-00000000bb09','other','cross-org BU')
  $$, '23514', 'business_unit_id must belong to the same org as the log entry',
  'a Daily Log entry cannot reference another org''s business unit — the FK checks existence only, and FK lookups bypass RLS');

-- Archiving is a timestamp, not a delete. NFR-004 is asserted schema-wide in ops_01; here it is the
-- behaviour that replaces it.
select lives_ok($$
  update ops.log_entries set archived_at = now() where id = '00000000-0000-0000-0000-00000000ea01'
  $$, 'archiving is an UPDATE, which is why no DELETE grant is needed anywhere in this schema');

-- The Daily Log carries no production stream, deliberately: it is a narrative record of what
-- happened on the floor, not a production fact, and OD-WAY-28 scopes the dimension to the three
-- tables that feed COGS. Asserted so it is a decision on the record rather than an omission.
reset role;
select hasnt_column('ops','log_entries','branch_id',
  'the Daily Log carries no branch — it is a narrative record, and the stream dimension belongs to the tables that feed COGS');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. ops.kitchen_stock and the start-of-day read
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The sign convention, unchanged from the incumbent and now expressed on the stored model: a produce
-- adds to the stream's on-hand and a transfer subtracts from it, whatever its destination. A
-- transfer within one branch's books still subtracts — no ERP document is produced, but the WIP has
-- left the kitchen's hands, and that is the number the floor is asking for.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';

-- Only Approved rows count (FR-023). The fixture's Approved rows in this stream are the two imported
-- and MOS-authored produces of 11 and 6.
select is(
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-06-25',
                               '00000000-0000-0000-0000-00000000bf02','kitchen'),
  17::numeric(12,2),
  'FR-023: the start-of-day cut nets only APPROVED logs — a Submitted line is not yet stock');

select is(
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-06-02',
                               '00000000-0000-0000-0000-00000000bf02','kitchen'),
  11::numeric(12,2),
  'FR-061: the cut is strictly BEFORE the date, so the second day''s production is not yet available at the start of it');

-- The same item and date in a DIFFERENT stream is a different number. This is the assertion that
-- would have been impossible before the dimension landed, and it is the one that stops the
-- incumbent's "Stok HQ" label from having to mean something.
select is(
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-06-25',
                               '00000000-0000-0000-0000-00000000bf01','kitchen'),
  0::numeric(12,2),
  'the same item on the same date in another branch''s books is a separate balance, not the same one');

-- Approve one of the seeded transfers and the balance moves DOWN by its quantity: the transfer's
-- sign is asserted through the function rather than assumed from the CASE expression.
--
-- The approval is performed as a REVIEWER, not by resetting to the owner. ops._guard_kitchen_log
-- reads shared.has_access_role, which consults the JWT claim rather than the database role, so
-- dropping back to the table owner does not get past the status gate — and should not. Every state
-- change below therefore arrives the way a real one would.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ac04';
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is(
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-06-25',
                               '00000000-0000-0000-0000-00000000bf02','kitchen'),
  13::numeric(12,2),
  'a cross-branch transfer SUBTRACTS from the origin stream''s on-hand');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ac05';
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is(
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-06-25',
                               '00000000-0000-0000-0000-00000000bf02','kitchen'),
  10::numeric(12,2),
  'and a WITHIN-branch transfer subtracts too — the ERP records nothing, but the WIP has still left the kitchen''s hands');

-- The read is explicitly org-scoped rather than relying on the caller's RLS context, so a definer
-- path and a member session get the same answer instead of silently different ones.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is(
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-06-25',
                               '00000000-0000-0000-0000-00000000bf02','kitchen'),
  0::numeric(12,2),
  'the start-of-day read is org-scoped: another tenant''s session gets nothing from it');

-- Negative balances are preserved rather than clamped (FR-061): a negative is a real signal that
-- more was moved than was made, and hiding it hides the discrepancy the review step exists to catch.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ad05';
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is(
  ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab03','2026-06-25',
                               '00000000-0000-0000-0000-00000000bf02','kitchen'),
  -100::numeric(12,2),
  'FR-061: a negative balance is preserved, not clamped to zero — it is the signal that more left than was made');

reset role;
select ok(
  (select count(*) > 0 from ops.kitchen_stock
    where org_id = '00000000-0000-0000-0000-0000000000a1'
      and branch_id = '00000000-0000-0000-0000-00000000bf01'),
  'stored stock exists for more than one stream, so the per-stream key is exercised and not merely declared');

select is(
  (select count(*)::int from ops.kitchen_stock
    where org_id = '00000000-0000-0000-0000-0000000000a1'
      and log_date = '2026-06-19' and wip_item_id = '00000000-0000-0000-0000-00000000ab01'), 2,
  'the same item on the same date holds two balances, one per branch — which is the whole reason the dimension is on this table too');

-- ── The one-round-trip read is stream-scoped too ─────────────────────────────────────────────
-- Carried from the incumbent, which took only a date. With more than one stream a date-only
-- signature is a silent cross-stream sum: it would add Gordi HQ's balance to Rumah Rames's and
-- report the total as either. Asserted by reading the SAME item and date in two streams and
-- getting two different numbers.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is(
  (select usable_qty from ops.kitchen_stock_for_date('2026-06-19','00000000-0000-0000-0000-00000000bf02','kitchen')
    where wip_item_id = '00000000-0000-0000-0000-00000000ab01'),
  10::numeric(12,2),
  'the per-date read returns the stored balance for the stream asked for');
select is(
  (select usable_qty from ops.kitchen_stock_for_date('2026-06-19','00000000-0000-0000-0000-00000000bf01','kitchen')
    where wip_item_id = '00000000-0000-0000-0000-00000000ab01'),
  3::numeric(12,2),
  '...and a different one for the other stream, rather than summing the two into a number that is true of neither');

select * from finish();
rollback;
