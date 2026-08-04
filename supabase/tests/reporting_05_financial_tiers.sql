-- reporting, squashed baseline — the two financial visibility tiers.
--
-- ⚠ PORTED, NOT REDESIGNED. `manager` (company-wide revenue and margin, read-only) and `supervisor`
-- (revenue only, inside an explicitly granted channel/branch scope) are shipped and owner-locked.
-- OD-WAY-18 put the supervisor model back to the owner after it had been implemented as an explicit
-- per-person grant rather than derived from a business unit, and it stands: nobody inherits revenue
-- visibility from their org position, and every supervisor needs a deliberate grant. These
-- assertions pin that contract against re-authored policies; they do not re-open it.
--
-- The reason the per-person grant is the shipped model, restated so nobody "simplifies" it back:
-- deriving scope from a business unit over-grants for anyone whose remit is narrower than their
-- whole BU — a head over one outlet would read every outlet — and it needs a BU-to-branch map that
-- does not exist. This table's grain is channel plus branch code, with no business-unit dimension
-- at all.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select shared._test_seed_directory();
select shared._test_seed_access_roles();   -- GrandMgr ...0d3 -> admin

-- Org A: two POS branches and two B2B branches, so a channel-wide grant and a single-branch grant
-- produce visibly different reaches. One margin row, for the supervisor-is-denied-COGS assertion.
insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','RRS','Rumah Rames',   10,1250000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GHQ','GHQ','Gordi HQ',       8, 900000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GRI','GRI','Gordi Roastery', 7,3500000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GJK','JKT','B2B Jakarta',    5,2200000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','POS','GKI','RRS','B''s own RRS',  99,9900000.00,'2026-07-01 04:00:00+07');

insert into reporting.sales_margin_daily
  (org_id, margin_date, esb_code, branch_code, branch_name, revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, margin_interim_pct, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','RRS','Rumah Rames',1250000.00,750000.00,700000.00,500000.00,0.4000,'2026-07-01 04:00:00+07');

-- Scope grants, seeded as the superuser: RLS is bypassed here, but the BEFORE-INSERT guard still
-- runs and reads current_org_id(), so the claim is set first.
--   Report      ...0d5  one POS branch
--   DualHat     ...0d6  the whole B2B channel (branch_code null)
--   Lead2Holder ...0d7  both at once
--   Author      ...0d1  deliberately NO grant — the fail-closed subject
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','POS','RRS'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','B2B',null),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','POS','RRS'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','B2B',null);

set local role authenticated;

-- ══ The manager tier: company-wide, both money tables, read-only ════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 4,
  'a manager reads every revenue row in their org — the tier is company-wide, not scoped');
select is((select count(*)::int from reporting.sales_margin_daily), 1,
  '...and the margin rows too: manager is the tier that gets COGS and gross margin as figures');

-- Coexistence. Access roles are a union, and the two axes are independent: holding an operational
-- role must not subtract from a financial one, which is the failure an "effective role" that picked
-- one winner would produce.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead","manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 4,
  'ops_lead + manager still reads revenue — effective access is the union of the roles held');
select is((select count(*)::int from reporting.sales_margin_daily), 1,
  '...and margin');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'company-wide means company-wide within ONE company: a manager in another org reads zero of org A''s revenue');
select is((select count(*)::int from reporting.sales_margin_daily
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  '...and zero of its margin — the seam is asked on both money tables, because a manager reaches both');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select throws_ok($$
  insert into reporting.sales_daily_revenue (org_id, revenue_date, channel, esb_code, branch_code, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','POS','GKI','RRS',1,1.00,now())
$$, '42501', null, 'the tier is view-only: a manager cannot write a revenue figure');
select throws_ok($$
  insert into reporting.sales_margin_daily (org_id, margin_date, esb_code, branch_code, revenue, cogs_interim_sm, margin_interim, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','GKI','RRS',1.00,1.00,0.00,now())
$$, '42501', null, '...nor a margin figure');

-- ══ Maintaining scope: admin only, own org, real person ═════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','POS','GHQ')
$$, 'an admin grants a single-branch revenue scope');
select is(
  (select org_id from reporting.supervisor_revenue_scope
    where person_id = '00000000-0000-0000-0000-0000000000d4' and channel = 'POS' and branch_code = 'GHQ'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '...with org_id taken from the session, never from the request body');
select lives_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','B2B',null)
$$, 'a null branch_code grants the whole channel — the one grant shape that is not a single branch');

select throws_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000b4','POS','RRS')
$$, '42501', null,
  'granting scope to a person in ANOTHER org is refused by the trigger — the WITH CHECK cannot see the target person, so this check has to be where it is');
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d4','POS','RRS')
$$, '42501', null,
  'and a request that sends a foreign org_id outright is refused by the WITH CHECK — proving the column default is convenience, not the control');
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','TIKTOK','X')
$$, '23514', null,
  'a channel outside the known set is refused: the scope vocabulary tracks the revenue fact''s channel column and grows by migration');

select lives_ok($$
  delete from reporting.supervisor_revenue_scope
   where person_id = '00000000-0000-0000-0000-0000000000d4' and channel = 'POS'
$$, 'an admin revokes a grant by deleting it');

-- ══ A supervisor sees their own grant and nobody else's ═════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.supervisor_revenue_scope), 1,
  'a supervisor reads exactly one scope row — their own — out of the five now in the org');
select is((select branch_code from reporting.supervisor_revenue_scope), 'RRS',
  '...and it is their own POS/RRS grant. This self-read is load-bearing: the revenue policy resolves its EXISTS over this table under this same session''s RLS');

-- ══ The scoped revenue arm ══════════════════════════════════════════════════════════════════
select is((select count(*)::int from reporting.sales_daily_revenue), 1,
  'a single-branch supervisor reads exactly one revenue row out of four');
select is((select branch_code from reporting.sales_daily_revenue), 'RRS',
  '...and it is the branch they were granted — not the other POS branch, and not either B2B branch');
select is((select count(*)::int from reporting.sales_margin_daily), 0,
  'a supervisor reads ZERO margin rows: the tier is revenue-only, and margin carries COGS');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue where channel = 'B2B'), 2,
  'a whole-channel grant reads every branch in that channel, including branches added after the grant');
select is((select count(*)::int from reporting.sales_daily_revenue where channel = 'POS'), 0,
  '...and nothing in the other channel');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 3,
  'two grants union rather than override — one POS branch plus the whole B2B channel is three rows');
select is((select count(*)::int from reporting.sales_daily_revenue where branch_code = 'GHQ'), 0,
  '...and the union still stops at its edges: the ungranted POS branch stays invisible');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0,
  'a supervisor with NO grant reads nothing — the tier fails closed by construction: an empty scope makes the EXISTS false, so there is no default to get wrong');

-- ══ The arms the supervisor clause was added beside are still there ═════════════════════════
-- The originals reached this shape through ALTER POLICY, which replaces the WHOLE using-expression;
-- a re-author is the same hazard by a different route. Both wider arms are re-checked after the
-- narrow one has been exercised.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 4,
  'finance still reads every revenue row — the arm survived the supervisor clause landing beside it');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["admin"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 4,
  'and so did admin''s');

reset role;

-- ══ The guard is attached AND enabled ═══════════════════════════════════════════════════════
-- Two assertions, not one: has_trigger passes for a trigger that has been DISABLED and is therefore
-- entirely inert. The org seam on a grant depends on this trigger firing, so both halves are asked.
select has_trigger('reporting','supervisor_revenue_scope','supervisor_revenue_scope_guard',
  'the scope guard is attached to the table, not merely defined as a function');
select ok(
  (select tgenabled from pg_trigger
    where tgname = 'supervisor_revenue_scope_guard'
      and tgrelid = 'reporting.supervisor_revenue_scope'::regclass) in ('O','A'),
  '...and it is ENABLED — a disabled trigger passes has_trigger while enforcing nothing');

select * from finish();
rollback;
