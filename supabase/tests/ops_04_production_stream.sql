-- ops, squashed baseline — the (branch, activity) production stream on logs, plans AND stock.
--
-- AC-007: a production log inserted without a stream is REFUSED.
-- AC-008: a plan row and a stock row each carry a stream.
--
-- Why this is worth landing during a squash and not after (OD-WAY-28). The incumbent's 'Production'
-- value encodes no branch. Add the dimension after real rows exist and every historical row's stream
-- becomes a permanent guess — data that cannot be recovered, feeding COGS. Add it against zero
-- production rows and every row is born with a true one. It is not "pay now or pay later"; it is
-- "pay a little now, or lose the data". The assertions below are what make that irreversible in the
-- right direction: NOT NULL, so the value cannot be omitted, and a real reference, so it cannot be
-- invented.
--
-- The stream is (branch, activity) and NOT a place. There is one physical kitchen; it is a constant
-- and appears nowhere in this schema. What varies is whose books the raw comes from and the output
-- goes to, which is why branch_id points at the canonical catalog rather than at shared.sites.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- ── AC-008, structurally: the dimension is NOT NULL on all three tables ──────────────────────
-- Asserted on the catalog first, because a column that is merely usually-populated is not a
-- dimension. This is the property that makes a historical guess impossible rather than unlikely.
select col_not_null('ops','kitchen_logs','branch_id',
  'AC-007: ops.kitchen_logs.branch_id is NOT NULL — a production log cannot be written without saying whose books it moves');
select col_not_null('ops','kitchen_logs','activity',
  'AC-007: ops.kitchen_logs.activity is NOT NULL — kitchen and bar are different streams, not one');
select col_not_null('ops','kitchen_plans','branch_id',
  'AC-008: ops.kitchen_plans.branch_id is NOT NULL — the variance baseline carries the stream too');
select col_not_null('ops','kitchen_plans','activity',
  'AC-008: ops.kitchen_plans.activity is NOT NULL');
select col_not_null('ops','kitchen_stock','branch_id',
  'AC-008: ops.kitchen_stock.branch_id is NOT NULL — OD-WAY-28 puts the dimension on stock as well, not only on the fact rows');
select col_not_null('ops','kitchen_stock','activity',
  'AC-008: ops.kitchen_stock.activity is NOT NULL');

-- ── The branch half resolves against the ONE canonical catalog (OD-WAY-39) ───────────────────
-- Not free text and not shared.sites. A free-text branch on a COGS-feeding table is the same class
-- of defect as the incumbent's three-literal action_type.
select fk_ok('ops','kitchen_logs','branch_id','shared','branches','id',
  'the stream''s branch resolves against the canonical branch catalog, not free text');
select fk_ok('ops','kitchen_plans','branch_id','shared','branches','id',
  'plans link to the same catalog');
select fk_ok('ops','kitchen_stock','branch_id','shared','branches','id',
  'stock links to the same catalog');
select fk_ok('ops','kitchen_logs','destination_branch_id','shared','branches','id',
  'the destination branch resolves against the same catalog, so origin and destination are comparable');

-- ── AC-007 behaviourally: the insert is refused ──────────────────────────────────────────────
select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, activity, action,
                                wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',1,
          '00000000-0000-0000-0000-0000000000d1')
  $$, '23502', 'null value in column "branch_id" of relation "kitchen_logs" violates not-null constraint',
  'AC-007: a production log inserted with no branch is refused by the column itself (23502), not by a guard that could be relaxed');

select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, action,
                                wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf02','produce','00000000-0000-0000-0000-00000000ab01',1,
          '00000000-0000-0000-0000-0000000000d1')
  $$, '23502', 'null value in column "activity" of relation "kitchen_logs" violates not-null constraint',
  'AC-007: ...and with no activity it is refused too — half a stream is not a stream');

select lives_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf01','bar','produce',
          '00000000-0000-0000-0000-00000000ab03',1,'00000000-0000-0000-0000-0000000000d1')
  $$, 'AC-007 (positive): a log WITH a stream is accepted — including a bar stream, which has never had a capture surface at all');

-- ── AC-008 behaviourally ─────────────────────────────────────────────────────────────────────
select throws_ok($$
  insert into ops.kitchen_plans (org_id, log_date, wip_item_id, activity, action, qty_porsi)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-25','00000000-0000-0000-0000-00000000ab01',
          'kitchen','produce',5)
  $$, '23502', 'null value in column "branch_id" of relation "kitchen_plans" violates not-null constraint',
  'AC-008: a plan row inserted with no branch is refused');

select throws_ok($$
  insert into ops.kitchen_stock (org_id, log_date, wip_item_id, activity, usable_qty)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-25','00000000-0000-0000-0000-00000000ab01',
          'kitchen',5)
  $$, '23502', 'null value in column "branch_id" of relation "kitchen_stock" violates not-null constraint',
  'AC-008: a stock row inserted with no branch is refused');

select is(
  (select count(*)::int from ops.kitchen_plans where branch_id is null or activity is null), 0,
  'AC-008: every seeded plan row carries a stream');
select is(
  (select count(*)::int from ops.kitchen_stock where branch_id is null or activity is null), 0,
  'AC-008: every seeded stock row carries a stream');

-- ── The model captures ALL of them, not the subset the incumbent covers ──────────────────────
-- OD-WAY-28: "the bungur pilot is a smaller use case only. MOS needs to capture all." A schema that
-- can only express the two captured streams would pass every assertion above.
select cmp_ok(
  (select count(distinct (branch_id, activity))::int from ops.kitchen_logs
    where org_id = '00000000-0000-0000-0000-0000000000a1'),
  '>=', 3,
  'the fact table holds logs across at least three distinct production streams, including ones the incumbent never captured');

select isnt(
  (select count(*)::int from ops.kitchen_logs
    where org_id = '00000000-0000-0000-0000-0000000000a1' and activity = 'bar'), 0,
  'a bar stream is expressible in the same table as a kitchen one — the Cafe Module serves two activities, not one');

-- ── Stock is keyed PER STREAM, so two branches do not share one balance ──────────────────────
-- This is where the "Stok HQ" label trap would have become permanent: the incumbent's stock tab uses
-- HQ for the central kitchen, which books to Rumah Rames. With the stream in the key the balance
-- says which books it is in and no label has to carry that meaning.
select lives_ok($$
  insert into ops.kitchen_stock (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-19','00000000-0000-0000-0000-00000000ab01',
          '00000000-0000-0000-0000-00000000bf03','kitchen',4)
  $$, 'stock: the same item on the same date in a DIFFERENT branch is a different balance');

select throws_ok($$
  insert into ops.kitchen_stock (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-19','00000000-0000-0000-0000-00000000ab01',
          '00000000-0000-0000-0000-00000000bf02','kitchen',4)
  $$, '23505', null,
  'stock: ...but the same item, date AND stream collides — one balance per stream, no silent doubling');

-- ── The stream cannot be moved after the fact ────────────────────────────────────────────────
-- Re-homing a submitted run into another branch's books after submission is the COGS defect this
-- whole effort exists to stop, so it is frozen exactly as the prior chains froze action_type.
select throws_ok($$
  update ops.kitchen_logs set branch_id = '00000000-0000-0000-0000-00000000bf01'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'the production stream, movement, wip item and date are immutable on a Submitted log',
  'the stream is immutable on a Submitted log — a run cannot be moved into another branch''s books after the fact');

select throws_ok($$
  update ops.kitchen_logs set activity = 'bar'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'the production stream, movement, wip item and date are immutable on a Submitted log',
  'the activity half is frozen with it');

-- ── The stream is a real cross-tenant reference and is checked as one ────────────────────────
select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf09','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',1,'00000000-0000-0000-0000-0000000000d1')
  $$, '23514', 'branch_id must belong to the same org as the kitchen log',
  'a log cannot point its stream at another org''s branch — an existence-only FK is a cross-tenant reference unless something checks the org');

-- ── The stream COUNT, as it is published to anyone inspecting the schema ─────────────────────
-- OD-WAY-42 retracting DD-WAY-25, then OD-WAY-79 for Cikal: there are SEVEN distinct
-- (branch, activity) streams — {GHQ, RRS, Radiant} x {kitchen, bar}, plus cikal/bar — and TWO are
-- captured today. DD-WAY-25's five/one recount (which this assertion once enforced, in the other
-- direction) was itself the error, and the baseline shipped it into a `comment on column` — the
-- copy a reader gets from \d+ or any schema browser. #231 restored the count in the source file
-- and re-issued the comment for applied databases (20260806000002); 20260827000001 re-issues it
-- again for Cikal.
--
-- The two assertions are deliberately different shapes. The first is a CLASS check — no ops comment
-- may publish the retracted five — so rewording is free and reviving the retraction is not. It is
-- now a strict SUBSET of shared_11's stale-count guard, which spans both schemas and reaches
-- functions too; kept as a local canary in the file a reader of ops.kitchen_logs actually opens.
-- (`classoid` pinned: pg_description's key is (objoid, classoid, objsubid), so an unpinned objoid
-- can match a row from another catalog. The same latent bug was just fixed one file over.) The
-- second PINS the current literal, because the failure this file exists to catch is a comment left
-- behind by a count change, and only a pin fails on that. A pin costs one edit per count change;
-- that cost is the point. Keep this header in step with the pin — it went stale once already, which
-- is how a test came to enforce the wrong number while reading as if it enforced the right one.
reset role;
select is(
  (select count(*)::int from pg_description d
     join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ops' and d.description ~* '(five|5) distinct'),
  0,
  'OD-WAY-42: no comment in the ops catalog publishes the retracted five-stream count — the number a schema reader sees agrees with the restored ruling');

select ok(
  (select col_description('ops.kitchen_logs'::regclass,
            (select attnum from pg_attribute
              where attrelid = 'ops.kitchen_logs'::regclass and attname = 'activity'))
     ~* 'SEVEN distinct'),
  'OD-WAY-42: the activity column PUBLISHES the stream count — the re-issued comment reached this database, not only the source file');

select * from finish();
rollback;
