-- integrations, squashed baseline — approval is the only door into the outbox, and every guard on
-- that door refuses BEFORE anything is written.
--
-- AC-013 and its two siblings are all the same shape: a refused approval must leave no outbox row.
-- Asserting only the raise would prove the caller was told "no" while leaving open whether a row was
-- written first and the raise came afterwards, which is the failure that matters — a row in the
-- outbox is a document the ERP is about to be asked for.
--
-- Each refusal below is therefore asserted THREE ways: the raise, the outbox count read as the owner
-- (the app-tier persona cannot see the rows it is being proven not to have created), and the log's
-- own batch_id still NULL. Then the FIRST successful approval mints -001, which is the assertion the
-- other three lean on: if any refusal had run far enough to touch the counter, the first success
-- would come back -002 and this file would go red.
--
-- Read DD-WAY-20 alongside this file. The status guard proven here is one of the two structural
-- protections against re-POSTing a document the ERP already holds; the other is that nothing else
-- creates an outbox row, which is what the "exactly one row" assertions are about.
--
-- Personas: Author ...0d1 is a member of org A whose ops_lead grant is seeded already-revoked;
-- DirectMgr ...0d2 holds ops_lead. Org B's log ...ac09 is the cross-tenant subject.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- The owner's view of the outbox before anything is approved. Read as the owner deliberately: every
-- "no row was created" assertion below has to be made by somebody who could have seen one.
create temp table _outbox_before as select count(*)::int as n from integrations.esb_push;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. Refused: the caller does not hold the role
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';

select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01','looks fine')
  $$, '42501', 'only the stream''s supervisor or ops_lead/admin may approve',
  'a member of the org without review authority over the stream cannot approve a production log');

select is((select status from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  'Submitted', '...and the log is untouched — the refusal is a raise, not a partial write');

reset role;
select is((select count(*)::int from integrations.esb_push), (select n from _outbox_before),
  '...and NO outbox row was created, read by the owner rather than by the persona that was refused');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. Refused: the log belongs to another tenant
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This function is SECURITY DEFINER, so its load can lock ANY org's row and another tenant's
-- ops_lead satisfies the role gate. The org check is what stands between those two facts, and it
-- runs first so that neither the row's existence nor the caller's role is an oracle.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac09','not mine')
  $$, '42501', 'cannot approve a log outside your org',
  'an ops_lead cannot approve another tenant''s log, however strong their role in their own org');

reset role;
select is((select status from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac09'),
  'Submitted', '...and the other tenant''s log is untouched');
select is((select count(*)::int from integrations.esb_push), (select n from _outbox_before),
  '...and NO outbox row was created for it');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. AC-013 — refused: the log is not Submitted
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ...aa02 is Approved already. This is exactly the state an imported row lands in (OD-WAY-38), which
-- is why DD-WAY-20 counts this guard as one of the two structural re-POST protections: history
-- carried in at the flip cannot be approved a second time, so it never reaches the outbox.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000aa02','again')
  $$, 'P0003', 'log is not Submitted (current: Approved)',
  'AC-013: an already-Approved log cannot be approved again — the shape an imported row arrives in');

reset role;
select is((select count(*)::int from integrations.esb_push where source_ref = 'PR-20260602-001'),
  1, '...and its batch still has exactly the ONE outbox row it started with, not a second');

-- The other non-Submitted status. Rejecting is a plain guarded UPDATE, so this also proves the guard
-- reads the status it finds rather than the one the reviewer last set through the RPC.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select lives_ok($$
  update ops.kitchen_logs set status = 'Rejected', review_note = 'wrong unit'
   where id = '00000000-0000-0000-0000-00000000ac06'
  $$, 'setup: an ops_lead rejects a log through the plain guarded UPDATE path');

select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac06','changed my mind')
  $$, 'P0003', 'log is not Submitted (current: Rejected)',
  'AC-013: a Rejected log cannot be approved either — the guard admits one status, not "anything but Approved"');

select is((select batch_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac06'),
  null, '...and no batch id was minted for it');

reset role;
select is((select count(*)::int from integrations.esb_push), (select n from _outbox_before),
  '...and after FOUR refusals the outbox is still exactly as it was');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. The first success — and the proof that the refusals cost nothing
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- -001, not -004. The batch counter is the one piece of state a half-run approval would have moved,
-- so this single value is what turns the four refusals above from "raised" into "wrote nothing".
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01','ok'), 'PR-20260620-001',
  'the first successful approval mints -001 — so none of the four refusals consumed a sequence number');

select is((select status from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  'Approved', 'the log is Approved');
select is((select reviewed_by from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'reviewer provenance is stamped server-side from the session, not from anything the client sent');
select ok((select reviewed_at is not null and review_note = 'ok'
             from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  'reviewed_at and the review note are stamped with it (FR-044)');

-- ── The outbox row it created ────────────────────────────────────────────────────────────────
select is((select count(*)::int from integrations.esb_push where source_ref = 'PR-20260620-001'), 1,
  'FR-070: exactly ONE outbox row for the batch (OD-K-4 — one row per batch is the double-post guard)');

select row_eq($$
  select endpoint, status, target_env, dedup_key
    from integrations.esb_push where source_ref = 'PR-20260620-001' $$,
  row('assembly-actual'::text,'pending'::text,'dry_run'::text,'kitchen|PR-20260620-001|dry_run'::text)::record,
  'a produce enqueues an assembly, pending, stamped with the default target environment, keyed per batch and environment');

-- DD-WAY-13: the payload describes the movement in the stored model. The worker keys its dispatch on
-- the endpoint COLUMN, so re-introducing the banned literal here would be re-introducing it as data.
select ok(not ((select payload from integrations.esb_push where source_ref = 'PR-20260620-001') ? 'action_type'),
  'DD-WAY-13: the outbox payload carries no action_type — the three labels are derived and are stored nowhere, including in a message');

select row_eq($$
  select payload->>'action', payload->>'activity', payload->>'branch_code', payload->>'destination_branch_code'
    from integrations.esb_push where source_ref = 'PR-20260620-001' $$,
  row('produce'::text,'kitchen'::text,'rumah_rames'::text,null::text)::record,
  'the payload names the production stream and the movement, and carries the branch CODE so the row is dispatchable without a grant on shared.branches');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- E. The target environment is READ, proven by changing only the GUC
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A stamp that always said 'dry_run' would pass every assertion above. This is the mutation that
-- separates a value that is read from one that merely exists — and the value decides whether a batch
-- can reach production GKID (OD-K-2, FR-080..082).
set local app.esb_target_env = 'goo';

select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac02','ok'), 'PR-20260620-002',
  'the second approval of the day mints -002');

select row_eq($$
  select target_env, dedup_key
    from integrations.esb_push where source_ref = 'PR-20260620-002' $$,
  row('goo'::text,'kitchen|PR-20260620-002|goo'::text)::record,
  'FR-081: with only the GUC changed the row is stamped goo, and the environment is INSIDE the dedup key — so the guarantee is one post per batch PER ENVIRONMENT (DD-WAY-14)');

-- And back, on a third batch. Without this the 'goo' above is equally explained by a value latched
-- at first use, which would be a far worse bug than a constant: the environment would be whatever
-- the first approval after a restart happened to see.
set local app.esb_target_env = '';

select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac03','ok'), 'PR-20260620-003',
  'the third approval of the day mints -003');

select is((select target_env from integrations.esb_push where source_ref = 'PR-20260620-003'),
  'dry_run',
  '...and with the GUC cleared it is stamped dry_run again — the environment is read at every enqueue, not latched');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- F. The endpoint is derived from branches, not from a label (OD-WAY-26)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac04','ok'), 'TR-20260620-001',
  'a transfer to a DIFFERENT branch mints a TR batch');
select row_eq($$
  select endpoint, payload->>'destination_branch_code'
    from integrations.esb_push where source_ref = 'TR-20260620-001' $$,
  row('simple-transfer'::text,'radiant'::text)::record,
  'FR-071: it enqueues a simple transfer, and the destination travels on the message');

select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac05','ok'), 'TB-20260620-001',
  'a transfer whose destination branch IS its origin branch mints a TB batch');
select is((select endpoint from integrations.esb_push where source_ref = 'TB-20260620-001'), 'noop',
  'OD-WAY-26: it enqueues a NO-OP — the ERP already books that branch as holding the WIP, so there is nothing to record. Not "it stayed in the same place".');
select is((select count(*)::int from integrations.esb_push where source_ref = 'TB-20260620-001'), 1,
  '...and it STILL gets an outbox row: OD-K-4 wants one row per batch whatever the batch owes the ERP, and the incumbent closes such a batch with a sentinel rather than skipping it');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- G. Stock is recomputed per PRODUCTION STREAM (OD-WAY-28)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Approved so far on (Rumah Rames, kitchen) / item ab01 / 2026-06-20: produce 12, produce 8,
-- produce 5, transfer out 4, transfer out 3 = 18. A transfer subtracts whatever its destination, including the
-- no-op: no ERP document is produced, but the WIP has left the kitchen's hands.
select is((select usable_qty from ops.kitchen_stock
            where org_id = '00000000-0000-0000-0000-0000000000a1' and log_date = '2026-06-20'
              and wip_item_id = '00000000-0000-0000-0000-00000000ab01'
              and branch_id = '00000000-0000-0000-0000-00000000bf02' and activity = 'kitchen'),
  18::numeric(12,2),
  'FR-062: the stream''s end-of-day balance nets every Approved movement, the no-op transfer included');

-- The same item, the same date, a DIFFERENT branch's books. On the prior chains the recompute summed
-- by (org, item, date) alone, which would have written 20 into both rows.
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac11','ok'), 'PR-20260620-004',
  'the batch counter is per (org, prefix, date) and NOT per stream — a second stream''s produce that day mints -004');

select is((select usable_qty from ops.kitchen_stock
            where org_id = '00000000-0000-0000-0000-0000000000a1' and log_date = '2026-06-20'
              and wip_item_id = '00000000-0000-0000-0000-00000000ab01'
              and branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'kitchen'),
  7::numeric(12,2),
  'OD-WAY-28: the Gordi HQ kitchen stream gets its own balance');

select is((select usable_qty from ops.kitchen_stock
            where org_id = '00000000-0000-0000-0000-0000000000a1' and log_date = '2026-06-20'
              and wip_item_id = '00000000-0000-0000-0000-00000000ab01'
              and branch_id = '00000000-0000-0000-0000-00000000bf02' and activity = 'kitchen'),
  18::numeric(12,2),
  '...and Rumah Rames''s is still 18 — the two streams do not sum into each other, which is the COGS defect this dimension exists to stop');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- H. Nothing else in the org gained an outbox row
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Five approvals, five rows, and the two the fixture seeded. An enqueue that fired twice, or a
-- refusal that leaked one, shows up here and nowhere else.
reset role;
select is((select count(*)::int from integrations.esb_push), (select n + 6 from _outbox_before),
  'six successful approvals created exactly six outbox rows — no path other than approval wrote one');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- I. The minted identifier is scoped to the org that mints it
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ops.kitchen_batch_seq is keyed (org_id, prefix, log_date), so the counter counts per org and the
-- identifier it produces is a per-org namespace. ops.log_entries already scopes the same identifier
-- the same way, on (org_id, batch_id). This section pins kitchen_logs to that scope in both
-- directions, so a later widening or narrowing goes red rather than being noticed by accident.
select is(
  (select string_agg(a.attname, ',' order by a.attnum)
     from pg_constraint c, unnest(c.conkey) k(attnum), pg_attribute a
    where c.conrelid = 'ops.kitchen_logs'::regclass and c.contype = 'u'
      and a.attrelid = c.conrelid and a.attnum = k.attnum),
  'org_id,batch_id',
  'the batch identifier is unique on (org_id, batch_id) — the same scope its counter works in, and the same scope ops.log_entries uses for it');

select lives_ok($$
  insert into ops.kitchen_logs
    (org_id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi,
     submitted_by, batch_id)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb09','2026-06-20',
          '00000000-0000-0000-0000-00000000bf09','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab09',9,'00000000-0000-0000-0000-0000000000b4',
          'PR-20260620-001')
  $$, 'each org keeps its own batch-id namespace: the same identifier in another org is a different batch, and both are allowed');

select throws_ok($$
  insert into ops.kitchen_logs
    (org_id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi,
     submitted_by, batch_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',9,'00000000-0000-0000-0000-0000000000d1',
          'PR-20260620-001')
  $$, '23505', null,
  '...and within one org it is still unique, so the identifier the approval minted cannot be reused there');

select * from finish();
rollback;
