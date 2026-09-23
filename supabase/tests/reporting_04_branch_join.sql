-- reporting, squashed baseline — propose-not-reject, and the per-branch join it exists to unlock.
--
-- OD-WAY-39 in two halves, both asserted here:
--
--   PROPOSE, NEVER REJECT. An ERP branch code MOS has never seen ingests with a null link and no
--   error. Nothing about the row is refused, delayed, or normalised — the code is stored exactly as
--   sent, and the mapping is left for a human. The failure this prevents is concrete: a hard
--   reference on the ERP's own text turns the night the ERP adds a branch into a failed job.
--
--   ONE BRANCH IDENTITY. Once a row IS mapped, MOS's own production data and the ERP's money resolve
--   to the SAME shared.branches row. That is the picture July's COGS blow-up needed and did not have
--   (OD-WAY-27): today the two sides cannot be joined at all, because one is a real entity and the
--   other is loose text.
--
-- The link's org seam is a composite foreign key on (org_id, branch_id), and its behaviour is the
-- reason it was chosen over a trigger: under MATCH SIMPLE a composite FK is not enforced AT ALL
-- while any of its columns is null, so an unlinked row is entirely unconstrained — propose-not-
-- reject's resting state — while a mapped row must name a branch in its own org. Both halves are
-- asserted, because a constraint that is inert when it should bite is the same defect as one that
-- bites when it should be inert.
--
-- OWNS: AC-010 (the ERP branch join — an unmapped code ingests, a mapped one resolves to one branch
-- identity, and the org seam holds across the link). This file is that AC's single owner in the test
-- pyramid; nothing else asserts it, and the tag was missing until #186.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select ops._test_seed_cafe();   -- branches bf01 Gordi HQ / bf02 Rumah Rames / bf03 Radiant (org A),
                                -- bf09 B-Branch (org B), and kitchen logs across four streams

-- ── An ERP branch nobody has mapped ──────────────────────────────────────────────────────────
select lives_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-02','POS','GXX','NEWBRANCH-2027',
          'A Branch The ERP Added Last Night',1,111.00,'2026-07-02 04:00:00+07')
$$, 'a branch code absent from the catalog INGESTS — no error, nothing rejected, which is the whole of propose-not-reject');

select is(
  (select branch_id from reporting.sales_daily_revenue where branch_code = 'NEWBRANCH-2027'),
  null::uuid,
  '...and lands unlinked, queued for a human rather than guessed at');

select is(
  (select branch_code from reporting.sales_daily_revenue where esb_code = 'GXX'),
  'NEWBRANCH-2027',
  '...with the ERP''s spelling kept exactly as sent — the raw value is what the next snapshot upserts on, and the only record of what the ERP actually said');

select lives_ok($$
  insert into reporting.sales_margin_daily
    (org_id, margin_date, esb_code, branch_code, branch_name, revenue, cogs_interim_sm, margin_interim, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-02','GXX','NEWBRANCH-2027',
          'A Branch The ERP Added Last Night',111.00,50.00,61.00,'2026-07-02 04:00:00+07')
$$, 'the same holds on the COGS side — an unknown branch does not break the margin feed either');

-- The structural reason it cannot start failing later: there is no constraint on branch_code at all.
select is(
  (select count(*)::int
     from pg_constraint c
     join pg_attribute a
       on a.attrelid = c.conrelid and a.attnum = any(c.conkey) and a.attname = 'branch_code'
    where c.contype = 'f'
      and c.conrelid in ('reporting.sales_daily_revenue'::regclass,
                         'reporting.sales_margin_daily'::regclass,
                         'reporting.supervisor_revenue_scope'::regclass)),
  0,
  'no foreign key anywhere references branch_code — the ERP namespace is not MOS''s to validate, and constraining it would move the breakage from ingest-time to constraint-time rather than removing it');

-- ── The link, when it IS set, stays inside one org ───────────────────────────────────────────
select throws_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_id, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-03','POS','GKI','RRS',
          '00000000-0000-0000-0000-00000000bf09',1,1.00,'2026-07-03 04:00:00+07')
$$, '23503', null,
  'a link pointing at ANOTHER org''s branch is refused — the composite FK carries the org seam, so a mis-mapping cannot quietly file one tenant''s revenue under another''s branch');

select lives_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, branch_id, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','RRS','Rumah Rames',
          '00000000-0000-0000-0000-00000000bf02',10,1000000.00,'2026-07-01 04:00:00+07')
$$, '...while a link to a branch in the row''s own org is accepted — the constraint bites on the wrong case and is inert on the right one');

-- ── One branch identity: two ERP spellings, one branch ───────────────────────────────────────
-- This is the real shape of the problem. The incumbent app calls Rumah Rames "Bungur", and the ERP
-- has emitted both codes. Mapped, they are one branch; unmapped, they are two rows of loose text
-- that no report can add together.
insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, branch_id, transactions, clean_revenue, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','BGR','Bungur',
   '00000000-0000-0000-0000-00000000bf02',5,250000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GHQ','GHQ','Gordi HQ',
   '00000000-0000-0000-0000-00000000bf01',8,800000.00,'2026-07-01 04:00:00+07');

insert into reporting.sales_margin_daily
  (org_id, margin_date, esb_code, branch_code, branch_name, branch_id, revenue, cogs_interim_sm, margin_interim, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','RRS','Rumah Rames',
   '00000000-0000-0000-0000-00000000bf02',1000000.00,600000.00,400000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','BGR','Bungur',
   '00000000-0000-0000-0000-00000000bf02',250000.00,150000.00,100000.00,'2026-07-01 04:00:00+07');

select is(
  (select count(distinct branch_id)::int from reporting.sales_daily_revenue
    where branch_code in ('RRS','BGR')),
  1,
  'two ERP spellings — RRS and the incumbent''s "BGR" — resolve to ONE branch, which is exactly what free text could never do');

-- ── The prize: production cost and revenue, per branch, from MOS's own data ──────────────────
-- Scalar subqueries per branch rather than one wide join, so each figure is read at its own grain
-- and a fan-out cannot silently multiply a number. All three resolve through shared.branches.
select is(
  (select (select sum(r.clean_revenue) from reporting.sales_daily_revenue r where r.branch_id = b.id)
     from shared.branches b
    where b.org_id = '00000000-0000-0000-0000-0000000000a1' and b.code = 'rumah_rames'),
  1250000.00::numeric,
  'REVENUE resolves through the catalog: both ERP spellings of Rumah Rames add up to one branch total');

select is(
  (select (select sum(m.cogs_interim_sm) from reporting.sales_margin_daily m where m.branch_id = b.id)
     from shared.branches b
    where b.org_id = '00000000-0000-0000-0000-0000000000a1' and b.code = 'rumah_rames'),
  750000.00::numeric,
  'COST resolves through the SAME catalog row — so revenue and COGS are joinable per branch, which they were not before this link existed');

select cmp_ok(
  (select (select count(*) from ops.kitchen_logs k where k.branch_id = b.id)
     from shared.branches b
    where b.org_id = '00000000-0000-0000-0000-0000000000a1' and b.code = 'rumah_rames'),
  '>', 0::bigint,
  'and MOS''s OWN production capture hangs off the same branch row — one identity spanning ops and reporting, which is what makes the picture MOS''s rather than the warehouse''s');

select is(
  (select count(*)::int
     from shared.branches b
     join reporting.sales_daily_revenue r on r.branch_id = b.id
     join reporting.sales_margin_daily  m on m.branch_id = b.id
    where b.org_id = '00000000-0000-0000-0000-0000000000a1'
      and b.code = 'gordi_hq'),
  0,
  'a branch with revenue but no margin row yields no joined row — the join tells the truth about a missing COGS feed instead of inventing a zero');

-- ── The propose queue ────────────────────────────────────────────────────────────────────────
-- What "proposed for a human to confirm" means with the admin screen deferred: the unmapped codes
-- are a query anyone can run, not a state that has to be discovered by noticing a wrong total.
select set_eq($$
  select distinct branch_code from reporting.sales_daily_revenue
   where org_id = '00000000-0000-0000-0000-0000000000a1' and branch_id is null
$$, array['NEWBRANCH-2027'],
  'the unmapped ERP codes are enumerable — that list IS the proposal queue while the admin mapping screen is deferred');

-- ── The scope table carries the same link, and an unmapped grant still writes ────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
select lives_ok($$
  insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','POS','NEWBRANCH-2027')
$$, 'a revenue-scope grant naming an UNMAPPED ERP branch is writable — a supervisor can be given a new branch the night it appears, without waiting for anyone to map it');

-- ── The org cascade still works with the composite FK in place ───────────────────────────────
-- A composite FK with no ON DELETE action is checked at end of statement, so an org delete that
-- removes the branch and the fact row in the same cascade is fine. Worth proving rather than
-- reasoning about: had it been RESTRICT, deleting a tenant would fail on its own cascade.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000c9','Org C','org-c');
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-00000000bc09','00000000-0000-0000-0000-0000000000c9','c_branch','C Branch');
insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_id, transactions, clean_revenue, snapshot_as_of)
values ('00000000-0000-0000-0000-0000000000c9','2026-07-01','POS','GC','C','00000000-0000-0000-0000-00000000bc09',1,1.00,now());
select lives_ok($$
  delete from shared.orgs where id = '00000000-0000-0000-0000-0000000000c9'
$$, 'deleting a tenant still cascades cleanly with the link in place — the branch and the fact row go in the same statement, and the FK is checked at the end of it');

select * from finish();
rollback;
