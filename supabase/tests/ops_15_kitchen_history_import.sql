-- ops, squashed baseline — the kitchen history import's DB contracts (#349, OD-WAY-57/OD-WAY-38).
--
-- scripts/import-kitchen-history.py is the loader this file pins. pg_prove cannot execute it
-- (tests run inside the container with only supabase/tests mounted), so the contract is asserted
-- the way ops_06 already asserts the flip-time loader: perform the exact INSERT the loader
-- performs and prove what the database does with it. The loader's generated SQL is additionally
-- pinned statically by scripts/import-kitchen-history.test.sh.
--
-- Contracts owned here, each one acceptance criterion of #349:
--   §A the imported row's SHAPE satisfies every constraint and carries its ERP posting history;
--   §B idempotent re-run — deterministic id + ON CONFLICT DO NOTHING inserts nothing twice;
--   §C the import path creates ZERO outbox rows;
--   §D the only enqueuer (ops.approve_kitchen_log) refuses an imported row BEFORE minting
--      anything — history can never be re-enqueued (AC-013's shape on a teable_import row);
--   §E imported rows read like any other record — the read policy has no source seam.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

create temp table _outbox_before as select count(*)::int as n from integrations.esb_push;
create temp table _seq_before    as select count(*)::int as n from ops.kitchen_batch_seq;

-- ══ §A the loader's INSERT shape is legal and carries what #349 rules ═════════════════════════
-- The loader's column set verbatim: source teable_import, status Approved (final — never
-- Submitted, the one-character slip AC-012's comment names), submitted_by/reviewed_by/batch_id
-- NULL (AC-011 + the prior owner call on batch_id), posting history verbatim.
select lives_ok($$
  insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, branch_id, activity,
      action, destination_branch_id, wip_item_id, qty_porsi, notes, status, source, submitted_by,
      reviewed_by, reviewed_at, batch_id, posted_to_esb, esb_doc_num, posted_at)
  values ('00000000-0000-0000-0000-00000000a9b1','00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-00000000bb01','2026-08-01','00000000-0000-0000-0000-00000000bf02',
      'kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',10,'hift','Approved',
      'teable_import',null,null,'2026-08-01T09:30:00Z',null,true,'ESB-HIST-1','2026-08-01T09:00:00Z')
  $$, '#349: the loader''s produce row — Approved, unattributed, posting history carried — is accepted');

select is((select source  from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000a9b1'),
  'teable_import', 'provenance is queryable from the data (OD-WAY-57: no badge, the column is it)');
select is((select status   from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000a9b1'),
  'Approved', 'imported rows land final — never Submitted, so never approvable, so never enqueued');
select is((select submitted_by from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000a9b1'),
  null, 'AC-011: an imported row need not name a MOS person');
select is((select batch_id from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000a9b1'),
  null, 'batch_id is nulled on import — the prior owner call; the unique (org, batch) cannot hold Teable''s shared ids');
select ok((select posted_to_esb and esb_doc_num = 'ESB-HIST-1' and posted_at is not null
     from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000a9b1'),
  'the ERP posting history is carried as-is (OD-K-4''s third leg — the input AC-012 reads)');

select lives_ok($$
  insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, branch_id, activity,
      action, destination_branch_id, wip_item_id, qty_porsi, status, source, submitted_by, posted_to_esb)
  values ('00000000-0000-0000-0000-00000000a9b2','00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-00000000bb01','2026-08-03','00000000-0000-0000-0000-00000000bf02',
      'kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',
      5,'Approved','teable_import',null,false)
  $$, 'the loader''s transfer row ("Transfer to Radiant") — destination radiant, unposted — is accepted');
select is((select (action, destination_branch_id) from ops.kitchen_logs
     where id='00000000-0000-0000-0000-00000000a9b2'),
  row('transfer'::text,'00000000-0000-0000-0000-00000000bf03'::uuid),
  'the incumbent''s label became the structural movement (DD-WAY-13): transfer, destination radiant');

select lives_ok($$
  insert into ops.kitchen_plans (id, org_id, log_date, wip_item_id, branch_id, activity, action,
      destination_branch_id, qty_porsi, notes, source, plan_by)
  values ('00000000-0000-0000-0000-00000000a9b3','00000000-0000-0000-0000-0000000000a1',
      '2026-08-01','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02',
      'kitchen','produce',null,40,'shift plan','teable_import',null)
  $$, 'the loader''s plan row is accepted (plans have no status — final by nature, never post)');
select is((select source from ops.kitchen_plans where id='00000000-0000-0000-0000-00000000a9b3'),
  'teable_import', 'plan history carries the same provenance');

-- ══ §B idempotent re-run ═════════════════════════════════════════════════════════════════════
-- The loader keys rows by a deterministic uuid5 of the source record id and loads with ON CONFLICT
-- DO NOTHING, so a second run of the same export is a strict no-op.
select lives_ok($$
  insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, branch_id, activity,
      action, destination_branch_id, wip_item_id, qty_porsi, notes, status, source, submitted_by,
      reviewed_by, reviewed_at, batch_id, posted_to_esb, esb_doc_num, posted_at)
  values ('00000000-0000-0000-0000-00000000a9b1','00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-00000000bb01','2026-08-01','00000000-0000-0000-0000-00000000bf02',
      'kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',10,'hift','Approved',
      'teable_import',null,null,'2026-08-01T09:30:00Z',null,true,'ESB-HIST-1','2026-08-01T09:00:00Z')
  on conflict do nothing
  $$, 're-running the loader''s log insert is a no-op, not a duplicate');
select is((select count(*)::int from ops.kitchen_logs where id in
     ('00000000-0000-0000-0000-00000000a9b1','00000000-0000-0000-0000-00000000a9b2')), 2,
  '...and the fact count did not double');
select lives_ok($$
  insert into ops.kitchen_plans (id, org_id, log_date, wip_item_id, branch_id, activity, action,
      destination_branch_id, qty_porsi, notes, source, plan_by)
  values ('00000000-0000-0000-0000-00000000a9b3','00000000-0000-0000-0000-0000000000a1',
      '2026-08-01','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02',
      'kitchen','produce',null,40,'shift plan','teable_import',null)
  on conflict do nothing
  $$, 're-running the loader''s plan insert is a no-op');
select is((select count(*)::int from ops.kitchen_plans where id='00000000-0000-0000-0000-00000000a9b3'),
  1, '...and the plan count did not double');

-- ══ §C the import path itself creates no outbox row ══════════════════════════════════════════
select is((select count(*)::int from integrations.esb_push),
  (select n from _outbox_before),
  '#349 done-means: zero rows enqueued — inserting history through the loader''s path wrote nothing to the outbox');

-- ══ §D the only enqueuer refuses imported rows before touching anything ══════════════════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000a9b1','again')
  $$, 'P0003', 'log is not Submitted (current: Approved)',
  'the sole creator of outbox rows refuses an imported row — history can never be re-enqueued');
reset role;
select is((select count(*)::int from integrations.esb_push),
  (select n from _outbox_before),
  '...and the refusal left no outbox row behind');
select is((select count(*)::int from ops.kitchen_batch_seq),
  (select n from _seq_before),
  '...and consumed no batch sequence number');
select is((select batch_id from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000a9b1'),
  null, '...and the imported row itself is untouched');

-- ══ §E imported rows read like any other record ══════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from ops.kitchen_logs
     where id='00000000-0000-0000-0000-00000000a9b1'), 1,
  'OD-WAY-57: a plain member reads the imported row through the same policy — no source seam');
reset role;

select * from finish();
rollback;
