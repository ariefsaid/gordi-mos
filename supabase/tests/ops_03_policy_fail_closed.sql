-- ops, squashed baseline — ONE fail-closed assertion per policy, none inherited.
--
-- A re-authored RLS policy is a NEW policy. Its fail-closed proof does not carry over from the
-- policy it replaces, so this file pairs every policy created in
-- 20260805000010_ops_access_control.sql with its own negative assertion, written against that SQL.
-- Sections are ordered by table so the mapping is checkable by eye rather than by trust.
--
-- Two different shapes of "denied", and reading one for the other is exactly how a hole gets missed:
--   * an INSERT with no permitting policy RAISES 42501;
--   * an UPDATE whose USING clause excludes the row silently affects ZERO ROWS;
--   * an UPDATE whose USING passes but whose WITH CHECK fails RAISES 42501.
-- Each is asserted in its correct form, and every zero-row case is confirmed by reading the
-- surviving state back as the owner — proving nothing moved, not merely that nothing was reported.
--
-- Every negative is paired with the POSITIVE it is the negative of. Without that pairing a policy
-- that denies everybody passes the whole file, and a capture surface nobody can write to is a
-- worse failure here than a permissive one: the whole point of moving production capture into MOS
-- is that four streams stop being retyped by hand.
--
-- Personas, and why each one:
--   Author    ...0d1  member + finance. Her ops_lead grant is seeded ALREADY REVOKED, which makes
--                     her the honest negative subject for every ops_lead gate — a real member of
--                     the org who simply does not hold the role.
--   Peer      ...0d4  holds the same role as Author, so is neither her manager nor a reviewer: the
--                     same-org member who should reach nothing of hers beyond what is org-readable.
--   DirectMgr ...0d2  ops_lead, and one level above Author in the role chain. The positive subject.
--   GrandMgr  ...0d3  admin. The strongest same-org persona.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_daily_log();

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. ops.log_entries
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- log_entries_select_org
set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.log_entries), 0,
  'log_entries_select_org: a claimless session reads zero Daily Log entries');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select isnt((select count(*)::int from ops.log_entries), 0,
  'log_entries_select_org (positive): a member of the org does read the org''s entries');

-- log_entries_insert_member — created_by is pinned to the session person, so an entry cannot be
-- filed in somebody else's name.
select throws_ok($$
  insert into ops.log_entries (business_unit_id, event_type, title, created_by)
  values ('00000000-0000-0000-0000-00000000bb01','other','forged',
          '00000000-0000-0000-0000-0000000000d4')
  $$, '42501', 'new row violates row-level security policy for table "log_entries"',
  'log_entries_insert_member: a member cannot file a Daily Log entry attributed to somebody else');

select lives_ok($$
  insert into ops.log_entries (business_unit_id, event_type, title)
  values ('00000000-0000-0000-0000-00000000bb01','other','mine')
  $$, 'log_entries_insert_member (positive): a member CAN file their own entry');

-- log_entries_update_editor — the gate is author-or-manager, so a peer is excluded by USING and the
-- UPDATE reports success while affecting nothing. Read the row back to prove it did not move.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update ops.log_entries set title = 'peer edited' where id = '00000000-0000-0000-0000-00000000ea01';
reset role;
select is((select title from ops.log_entries where id = '00000000-0000-0000-0000-00000000ea01'),
  'Author entry',
  'log_entries_update_editor: a peer''s edit of another member''s entry affects zero rows — the title is unchanged');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.log_entries set title = 'manager edited' where id = '00000000-0000-0000-0000-00000000ea01';
reset role;
select is((select title from ops.log_entries where id = '00000000-0000-0000-0000-00000000ea01'),
  'manager edited',
  'log_entries_update_editor (positive): a MANAGER of the author can edit it, so the zero above is the gate and not a dead policy');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. ops.wip_items — master data, ops_lead/admin write
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.wip_items), 0,
  'wip_items_select_org: a claimless session reads zero WIP items');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select isnt((select count(*)::int from ops.wip_items), 0,
  'wip_items_select_org (positive): a member reads the item list they log against');

select throws_ok($$
  insert into ops.wip_items (name) values ('member added')
  $$, '42501', 'new row violates row-level security policy for table "wip_items"',
  'wip_items_insert_ops: a member without ops_lead cannot add master data — the item list decides what every capture surface can record');

update ops.wip_items set name = 'member renamed' where id = '00000000-0000-0000-0000-00000000ab01';
reset role;
select is((select name from ops.wip_items where id = '00000000-0000-0000-0000-00000000ab01'),
  'Nasi Goreng',
  'wip_items_update_ops: a member''s rename affects zero rows — the name is unchanged');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$ insert into ops.wip_items (name) values ('ops_lead added') $$,
  'wip_items_insert_ops (positive): ops_lead CAN add master data');
update ops.wip_items set name = 'ops renamed' where id = '00000000-0000-0000-0000-00000000ab01';
reset role;
select is((select name from ops.wip_items where id = '00000000-0000-0000-0000-00000000ab01'),
  'ops renamed',
  'wip_items_update_ops (positive): ops_lead CAN rename, so the zero above is the role gate');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. ops.kitchen_plans
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.kitchen_plans), 0,
  'kitchen_plans_select_org: a claimless session reads zero plans');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select isnt((select count(*)::int from ops.kitchen_plans), 0,
  'kitchen_plans_select_org (positive): a member reads the plan they are working to');

select throws_ok($$
  insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, qty_porsi)
  values ('2026-06-28','00000000-0000-0000-0000-00000000ab01',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',5)
  $$, '42501', 'new row violates row-level security policy for table "kitchen_plans"',
  'kitchen_plans_insert_ops: a member without ops_lead cannot write the plan');

update ops.kitchen_plans set qty_porsi = 999 where id = '00000000-0000-0000-0000-00000000ae01';
reset role;
select is((select qty_porsi from ops.kitchen_plans where id = '00000000-0000-0000-0000-00000000ae01'),
  20::numeric(12,2),
  'kitchen_plans_update_ops: a member''s plan edit affects zero rows — the variance baseline is unchanged');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, qty_porsi)
  values ('2026-06-28','00000000-0000-0000-0000-00000000ab01',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',5)
  $$, 'kitchen_plans_insert_ops (positive): ops_lead CAN write the plan');

-- The source pin: even ops_lead cannot author a plan row that claims to be imported Teable history.
select throws_ok($$
  insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, qty_porsi, source)
  values ('2026-06-29','00000000-0000-0000-0000-00000000ab01',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',5,'teable_import')
  $$, '42501', 'new row violates row-level security policy for table "kitchen_plans"',
  'kitchen_plans_insert_ops: the app tier cannot forge imported history — source is pinned to mos and the flip import runs as service_role');

update ops.kitchen_plans set qty_porsi = 21 where id = '00000000-0000-0000-0000-00000000ae01';
reset role;
select is((select qty_porsi from ops.kitchen_plans where id = '00000000-0000-0000-0000-00000000ae01'),
  21::numeric(12,2),
  'kitchen_plans_update_ops (positive): ops_lead CAN edit the plan');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. ops.kitchen_logs — the production fact table
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.kitchen_logs), 0,
  'kitchen_logs_select_org: a claimless session reads zero production logs');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select isnt((select count(*)::int from ops.kitchen_logs), 0,
  'kitchen_logs_select_org (positive): a member reads the org''s logs — the review queue is deliberately org-readable');

-- kitchen_logs_insert_member pins three things at once. Each is asserted separately, because a
-- single combined negative would pass with two of the three clauses deleted.
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',1,
          '00000000-0000-0000-0000-0000000000d4')
  $$, '42501', 'new row violates row-level security policy for table "kitchen_logs"',
  'kitchen_logs_insert_member: a member cannot log production in another person''s name');

select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, status)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',1,'Approved')
  $$, '42501', 'new row violates row-level security policy for table "kitchen_logs"',
  'kitchen_logs_insert_member: a member cannot insert a log that is already Approved — approval is a reviewed transition, not an initial state');

select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, source)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',1,'teable_import')
  $$, '42501', 'new row violates row-level security policy for table "kitchen_logs"',
  'kitchen_logs_insert_member: a member cannot claim their own row is imported Teable history — which is what keeps the conditional submitted_by rule honest');

select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, 'kitchen_logs_insert_member (positive): a member CAN log their own line, server-attributed and Submitted');

-- kitchen_logs_update_own_or_reviewer — the control that scopes pre-approval edits to the submitter.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update ops.kitchen_logs set qty_porsi = 999 where id = '00000000-0000-0000-0000-00000000ac01';
reset role;
select is((select qty_porsi from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  12::numeric(12,2),
  'kitchen_logs_update_own_or_reviewer: a peer''s edit of another member''s pending line affects zero rows — the quantity is unchanged');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
update ops.kitchen_logs set qty_porsi = 13 where id = '00000000-0000-0000-0000-00000000ac01';
reset role;
select is((select qty_porsi from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  13::numeric(12,2),
  'kitchen_logs_update_own_or_reviewer (positive): the SUBMITTER can still correct their own pending line');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.kitchen_logs set review_note = 'reviewed' where id = '00000000-0000-0000-0000-00000000ac01';
reset role;
select is((select review_note from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  'reviewed',
  'kitchen_logs_update_own_or_reviewer (positive): ops_lead retains the review-edit they need');

-- An imported row has a NULL submitted_by, so it matches no member and only a reviewer can touch it.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
update ops.kitchen_logs set notes = 'member touched history' where id = '00000000-0000-0000-0000-00000000aa01';
reset role;
select is((select notes from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000aa01'),
  null::text,
  'kitchen_logs_update_own_or_reviewer: an imported row has a NULL submitter, so it matches no member and history is not member-editable');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- E. ops.kitchen_stock
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.kitchen_stock), 0,
  'kitchen_stock_select_org: a claimless session reads zero stock rows');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select isnt((select count(*)::int from ops.kitchen_stock), 0,
  'kitchen_stock_select_org (positive): a member reads their org''s stock');

-- There is no write policy AND no write grant. The privilege refuses before RLS is consulted, which
-- is the stronger of the two controls and the one asserted here.
select throws_ok($$
  insert into ops.kitchen_stock (log_date, wip_item_id, branch_id, activity, usable_qty)
  values ('2026-06-25','00000000-0000-0000-0000-00000000ab01',
          '00000000-0000-0000-0000-00000000bf02','kitchen',5)
  $$, '42501',
  'permission denied for table kitchen_stock',
  'kitchen_stock: a direct member write is refused by PRIVILEGE, before any policy is consulted — stock is recomputed at approval');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- F. ops.kitchen_batch_seq — no policy, deliberately
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select throws_ok($$ select count(*) from ops.kitchen_batch_seq $$, '42501',
  'permission denied for table kitchen_batch_seq',
  'kitchen_batch_seq has no policy AND no grant: the app tier cannot read the counter or mint from it');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- G. integrations.esb_push
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The gate here is the ROLE, not only the org, so the negative subject has to be a member of the
-- same org holding a real row — otherwise the zero would be the org seam over again.
select is((select count(*)::int from integrations.esb_push), 0,
  'esb_push_select_ops: a member without ops_lead or admin reads zero outbox rows, in their OWN org');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select isnt((select count(*)::int from integrations.esb_push), 0,
  'esb_push_select_ops (positive): ops_lead does read them, so the zero above is the role gate and not an empty table');

select * from finish();
rollback;
