-- mos, squashed baseline — the money surfaces: the certified-metric registry, budget capture, and
-- the AR settlement bridge.
--
-- ⚠ THE AR HALF IS DELIBERATELY DARK AND KNOWN-WRONG-SHAPED. OD-WAY-34 rules that a follow-up is a
-- finance/accounting record rather than work, that the scope is the retail pending-bill stream only,
-- and that the job is reconciliation rather than chasing — which invalidates the `b2b_ar` kind, the
-- lane split and the chase verbs exercised below. DD-WAY-16 rules it ports AS-IS anyway: the table
-- has zero rows and no importer, the right shape is not decided, and reshaping now would mean
-- reshaping twice. These assertions therefore pin the SHIPPED behaviour so the rebuild has a known
-- starting point — they are not an endorsement of the model.
--
-- ⚠ mos.capture_budget's happy path is NOT exercised here, and the omission is deliberate rather
-- than an oversight: the RPC recomputes its total by joining reporting.ingredient_cost_lines, which
-- the `reporting` pass authors. Everything the RPC checks BEFORE reaching that table is asserted
-- below; the end-to-end capture belongs to the integrate-and-verify ticket, where both schemas
-- exist. Asserting it here would mean either faking the cost table or skipping the recompute, and
-- the recompute is the entire reason the RPC exists.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();   -- Author ...0d1 -> member + finance
select mos._test_seed_follow_ups();        -- coded lane BUs, two chasers, two org-A follow-ups, one org-B

-- The registry is seeded per org that exists at migration time; these orgs are born in this
-- transaction, so their definitions land here.
insert into mos.certified_metrics (org_id, key, name, meaning, unit, grain, certified) values
  ('00000000-0000-0000-0000-0000000000a1','cogs.budgeted','Budgeted COGS','The certified figure','IDR','menu item', true),
  ('00000000-0000-0000-0000-0000000000a1','margin.gross_pct','Gross margin %','A ratio','percent','menu item x price', false);

set local role authenticated;

-- ── The certified-metric registry: read by finance/admin, written by nobody ──────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from mos.certified_metrics), 2,
  'finance reads the certified-metric definitions');
select is((select certified from mos.certified_metrics where key = 'margin.gross_pct'), false,
  'a definition can be UNCERTIFIED — that is the point: an uncertified figure renders a fail-loud badge instead of a confident number');
select throws_ok($$
  insert into mos.certified_metrics (key, name, meaning, unit, grain)
  values ('cogs.invented','Invented','Made up on the spot','IDR','whatever')
$$, '42501', null,
  'even finance cannot add a metric definition at runtime — the registry is migration-owned, exactly like the capability vocabulary');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.certified_metrics), 0,
  'a plain member reads no metric definitions — the fail-loud badge renders on the finance-gated surfaces');

-- ── Budget capture: everything the RPC checks before it reaches the cost lines ───────────────
select throws_ok($$
  select mos.capture_budget('SKU-1','Latte','baseline','baseline',
    '00000000-0000-0000-0000-0000000000a2', now())
$$, '42501', null,
  'capture_budget requires can(''cogs.write'') — a plain member cannot capture a budget');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select throws_ok($$
  select mos.capture_budget('SKU-1','Latte','baseline','baseline',
    '00000000-0000-0000-0000-0000000000b2', now())
$$, '23514', null,
  'capture_budget refuses a business unit from another org — the column is an existence-only FK and the RPC runs with RLS bypassed, so this check is the only tenancy control on it');
select throws_ok($$
  select mos.capture_budget('SKU-1','Latte','baseline','speculative',
    '00000000-0000-0000-0000-0000000000a2', now())
$$, 'P0003', null, 'capture_budget refuses a scenario type outside the four');

select ok(not has_table_privilege('authenticated','mos.budgets','INSERT')
      and not has_table_privilege('authenticated','mos.budgets','UPDATE'),
  'no direct write path to mos.budgets exists at all — so a client cannot assert its own COGS total and bypass the server-side recompute');

-- ── The AR bridge: lane gates ────────────────────────────────────────────────────────────────
-- SalesChaser holds a role in the BU whose code IS the b2b_sales lane. That is the whole mechanism:
-- the lane is matched against a business-unit code, not against an access role.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d10","access_roles":["member"]}';
select is((select count(*)::int from mos.follow_ups), 1,
  'a lane chaser reads only their OWN lane''s follow-ups');
select is((select count(*)::int from mos.follow_ups where lane = 'retail_ops'), 0,
  '...and none of the other lane''s');
select is((select count(*)::int from mos.follow_ups where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  '...and none of another org''s');

select is(
  (select state from mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','chase','{}'::jsonb)),
  'chased', 'the chaser can advance their own lane');
select throws_ok($$
  select mos.transition_follow_up('00000000-0000-0000-0000-000000000e02','chase','{}'::jsonb)
$$, '42501', null, 'the chaser cannot advance the OTHER lane');
select throws_ok($$
  select mos.transition_follow_up('00000000-0000-0000-0000-000000000e03','chase','{}'::jsonb)
$$, '42501', null,
  'and cannot touch another org''s follow-up — the RPC bypasses RLS, so it checks the org itself before any gate');

-- ── The state machine and its required fields ────────────────────────────────────────────────
select throws_ok($$
  select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','promise','{}'::jsonb)
$$, 'P0003', null, 'a promise without a date is refused — a promise with no date is not a promise');
select is(
  (select promise_date from mos.transition_follow_up(
     '00000000-0000-0000-0000-000000000e01','promise','{"promise_date":"2026-07-15"}'::jsonb)),
  date '2026-07-15', 'a promise with a date is recorded on the row');

select throws_ok($$
  select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','partial',
    '{"amount":"400000","cash_in_date":"2026-07-10"}'::jsonb)
$$, 'P0003', null,
  'a payment without EVIDENCE is refused — evidence and the cash-in date are what Finance matches against the bank statement');
select throws_ok($$
  select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','partial',
    '{"amount":"400000","evidence":"transfer.png"}'::jsonb)
$$, 'P0003', null, 'a payment without a CASH-IN DATE is refused for the same reason');
select throws_ok($$
  select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','partial',
    '{"amount":"9000000","cash_in_date":"2026-07-10","evidence":"transfer.png"}'::jsonb)
$$, 'P0003', null, 'a payment larger than the outstanding balance is refused — there is no such thing as overpaying a balance here');

select is(
  (select running_balance from mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','partial',
     '{"amount":"400000","cash_in_date":"2026-07-10","evidence":"transfer-1.png"}'::jsonb)),
  600000::numeric, 'a partial payment reduces the running balance server-side');

select throws_ok($$
  select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','settle',
    '{"amount":"100000","cash_in_date":"2026-07-20","evidence":"transfer-2.png"}'::jsonb)
$$, 'P0003', null,
  'a settle amount that does NOT equal the balance is refused — a payment leaving money outstanding is a partial, and conflating the two is how a balance drifts');
select is(
  (select running_balance from mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','settle',
     '{"cash_in_date":"2026-07-20","evidence":"transfer-2.png"}'::jsonb)),
  0::numeric, 'settling with the amount omitted takes the remaining balance and zeroes it');

-- Confirmation is Finance's, not the chaser's: the person who says the money arrived is not the
-- person who chased it.
select throws_ok($$
  select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','confirm','{}'::jsonb)
$$, '42501', null, 'the chaser cannot CONFIRM their own settlement');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is(
  (select state from mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','confirm','{}'::jsonb)),
  'confirmed', 'finance can confirm a settled follow-up');

-- Every transition left an audited row behind; that ledger is the reconciliation grain.
select is((select count(*)::int from mos.follow_up_events
            where follow_up_id = '00000000-0000-0000-0000-000000000e01'),
  5, 'each transition wrote one audited event — chase, promise, partial, settle, confirm');
select ok(not has_table_privilege('authenticated','mos.follow_up_events','INSERT'),
  'the ledger cannot be written by hand — the RPC is the only author, so an event always matches a real transition');

-- ── Reconciliation ───────────────────────────────────────────────────────────────────────────
select is(
  (select mos_amount from mos.follow_up_recon_summary
    where counterparty = 'PT Big Buyer' and period = '2026-07'),
  1000000::numeric,
  'the recon summary sums the cash that actually landed, by counterparty and cash-in month — the per-invoice grain a spreadsheet is doing today');
select ok(
  (select is_drift from mos.follow_up_recon_drift
    where counterparty = 'PT Big Buyer' and period = '2026-07'),
  'with the ERP feed empty every MOS settlement shows as drift — honest, and it becomes a real check the moment the feed lands');

reset role;
select * from finish();
rollback;
