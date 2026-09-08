-- ops #744 — the Café write gate: affiliation is "works a line at all", never "which line"
-- (OD-WAY-93 #1, Q-1/F-1).
--
-- OWNS: AC-001 — the predicate's truth table (current stream membership → true; org-structure
--               team only, ended membership, or no membership → false);
--       AC-002 — ops.kitchen_logs inserts: a stream-A member logs into stream B (help-out
--               preserved, submitted_by session-pinned); an unaffiliated member is refused;
--               ops_lead/admin are admitted; plan and master-data writes are UNCHANGED;
--       AC-003 — ops.log_entries (floor records): unaffiliated refused, affiliated accepted
--               with created_by pinned;
--       AC-004 — reads stay org-scoped for the unaffiliated member (read-only, not hidden).
--
-- Personas (shared fixture): Author ...0d1 — member+finance, ops_lead seeded REVOKED, on an
-- org-structure team only → THE unaffiliated member. Peer ...0d4 — plain member given a live
-- membership of stream A here → THE affiliated member. DirectMgr ...0d2 — ops_lead. GrandMgr
-- ...0d3 — admin (and deliberately NO membership: the predicate is a membership fact, never a
-- role fact — the POLICY admits the roles separately, and this file asserts both halves).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_daily_log();

-- The gate needs two DIFFERENT streams so "affiliated with A may log into B" is a live
-- insert, not a tautology (OD-WAY-49's help-out). Plus one org-structure team (no branch/
-- activity) — the membership that must NOT affiliate.
insert into shared.teams (id, org_id, business_unit_id, name, code) values
  ('00000000-0000-0000-0000-00000000aa13','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','Gate Org Team','gate_org_team');

insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4',(select id from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'gordi_hq_bar'),true),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000aa13',true);
-- Report ...0d5: a stream membership that ENDED yesterday — history, not affiliation.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from, effective_to) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5',(select id from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'gordi_hq_bar'),true,
   current_date - 10, current_date - 1);

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-001 — the predicate reads membership existence, nothing else
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is(shared.is_cafe_affiliated(), true,
  'AC-001: a person with a CURRENT stream-Team membership is Café-affiliated');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is(shared.is_cafe_affiliated(), false,
  'AC-001: an org-structure team membership alone does NOT affiliate — only a stream Team does');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select is(shared.is_cafe_affiliated(), false,
  'AC-001: an ENDED stream membership does not affiliate — the predicate reads CURRENT membership');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is(shared.is_cafe_affiliated(), false,
  'AC-001: admin is NOT affiliated by the predicate — roles are admitted by the POLICY arm, a separate mechanism, so the predicate stays a membership fact');

set local request.jwt.claims = '{}';
select is(shared.is_cafe_affiliated(), false,
  'AC-001: a claimless session is not affiliated — the predicate fails closed');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-002 — ops.kitchen_logs: the write gate and the help-out rule
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, 'AC-002: a stream-A member may log into stream B — affiliation is works-a-line-at-all, never which line (OD-WAY-49 help-out)');

select is(
  (select submitted_by from ops.kitchen_logs
    where org_id = '00000000-0000-0000-0000-0000000000a1' and wip_item_id = '00000000-0000-0000-0000-00000000ab01'
      and qty_porsi = 1),
  '00000000-0000-0000-0000-0000000000d4'::uuid,
  'AC-002: ...and that cross-stream line is submitted_by the SESSION person — the pin holds across the help-out');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab01',9)
  $$, '42501', 'new row violates row-level security policy for table "kitchen_logs"',
  'AC-002: an unaffiliated member is REFUSED the production log insert — the fail-closed negative the gate exists for');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf01',
          'bar','produce','00000000-0000-0000-0000-00000000ab02',2)
  $$, 'AC-002: ops_lead is admitted without any membership');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf01',
          'kitchen','produce','00000000-0000-0000-0000-00000000ab03',3)
  $$, 'AC-002: admin is admitted without any membership');

-- The gate is ADDITIVE to the ops_lead/admin arms that were already there: plan and master-data
-- writes must be unchanged by this migration.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select throws_ok($$
  insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, qty_porsi)
  values ('2026-06-28','00000000-0000-0000-0000-00000000ab01',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',5)
  $$, '42501', 'new row violates row-level security policy for table "kitchen_plans"',
  'AC-002: plan writes are unchanged — an unaffiliated member still cannot write the plan (ops_lead/admin only, as before)');

select throws_ok($$
  insert into ops.wip_items (org_id, name)
  values ('00000000-0000-0000-0000-0000000000a1','Gate Probe Item')
  $$, '42501', 'new row violates row-level security policy for table "wip_items"',
  'AC-002: master-data writes are unchanged — a member (affiliated or not) still cannot create items');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, qty_porsi)
  values ('2026-06-28','00000000-0000-0000-0000-00000000ab01',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',5)
  $$, 'AC-002: plan writes are unchanged — ops_lead still CAN write the plan');

select lives_ok($$
  insert into ops.wip_items (org_id, name) values ('00000000-0000-0000-0000-0000000000a1','Gate Probe Item')
  $$, 'AC-002: master-data writes are unchanged — ops_lead still CAN create items');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-003 — ops.log_entries: the same gate on floor records
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select throws_ok($$
  insert into ops.log_entries (business_unit_id, event_type, title)
  values ('00000000-0000-0000-0000-00000000bb01','other','unaffiliated floor record')
  $$, '42501', 'new row violates row-level security policy for table "log_entries"',
  'AC-003: an unaffiliated member cannot file a floor record — the same gate, on log_entries');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select lives_ok($$
  insert into ops.log_entries (business_unit_id, event_type, title)
  values ('00000000-0000-0000-0000-00000000bb01','production','affiliated floor record')
  $$, 'AC-003: an affiliated member CAN file a floor record');

select is(
  (select created_by from ops.log_entries
    where org_id = '00000000-0000-0000-0000-0000000000a1' and title = 'affiliated floor record'),
  '00000000-0000-0000-0000-0000000000d4'::uuid,
  'AC-003: ...and it is created_by the session person — the pin survives the new arm');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  insert into ops.log_entries (business_unit_id, event_type, title)
  values ('00000000-0000-0000-0000-00000000bb01','other','ops lead floor record')
  $$, 'AC-003: ops_lead can file a floor record without membership');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-004 — reads unchanged for the unaffiliated member: read-only, never hidden (OD-WAY-51)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select isnt((select count(*)::int from ops.kitchen_logs), 0,
  'AC-004: the unaffiliated member still reads the org''s production logs');
select isnt((select count(*)::int from ops.log_entries), 0,
  'AC-004: ...the org''s floor records');
select isnt((select count(*)::int from ops.wip_items), 0,
  'AC-004: ...the item master data');
select isnt((select count(*)::int from ops.kitchen_plans), 0,
  'AC-004: ...and the plans — every Café surface stays readable, the gate is write-only');

select * from finish();
rollback;
