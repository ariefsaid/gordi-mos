-- ⚠ WIB, not UTC (#459). Every date below is a date the APP reads as "today" in Asia/Jakarta
-- (wibToday, NFR-007). Postgres current_date in these containers is UTC, and for seven hours of
-- every day (00:00-07:00 WIB) those are different dates — a seed written at current_date lands on
-- yesterday and the Café surfaces render empty with nothing on screen to explain it. This file is
-- the hand-loaded demo dataset, i.e. precisely the "developer seeds before breakfast" case.
-- ═══════════════════════════════════════════════════════════════════════════════
-- seed.dev-kitchen.sql — DEV-ONLY Café/Kitchen activity so every kitchen screen
-- renders FULL in local dev (the shipped module looks empty only when the local
-- ops.* tables are bare). Generates ~4 weeks of plausible plans and ~2 weeks of
-- approved log history, plus a live "today" (submitted review queue, a couple of
-- rejects, a few approvals) and the ESB push outbox that mirrors it.
--
-- PORTED from the v4 line (seed.dev-kitchen.sql there) onto the squashed baseline's
-- reshaped `ops` schema. The adaptations, so nobody re-derives them wrongly:
--   * action_type is GONE (DD-WAY-13). Every row now carries the (branch, activity)
--     production stream (OD-WAY-28) plus `action ∈ {produce, transfer}` and a
--     destination branch for transfers. The incumbent's "Transfer to Bungur" is a
--     transfer whose destination equals its origin (Rumah Rames — 'Bungur' is a UI
--     label, never stored); "Transfer to Radiant" is an inter-branch transfer.
--   * Streams are SPREAD across the six-stream catalog ({GHQ, RRS, Radiant} x
--     {kitchen, bar}, OD-WAY-42) rather than everything landing on one branch —
--     each item has a home stream in the maps below.
--   * An intra-branch transfer has NO ERP counterpart (endpoint 'noop', FR-053
--     permanent): its log is never marked posted, and no outbox row is seeded for
--     it (see step 6 — the pgTAP held-row sweep counts the whole outbox).
--   * integrations.esb_push carries the AC-012 enqueue refusal (a trigger): an
--     outbox row cannot be inserted for a batch already marked posted. So logs are
--     inserted UNPOSTED, outbox rows are inserted, and only then are the posted
--     flags stamped onto the logs (step 7).
--   * ops.kitchen_logs.item_unit_id binds automatically to each item's confirmed
--     default unit (#234's bind trigger; seed.sql confirms a 'porsi' default for
--     all 32 items), so seeded rows pass the no-coordinates-no-row gate.
--   * target_env is uniformly 'dry_run': the local stack posts nowhere real.
--
-- LOAD (local ephemeral stack ONLY — NEVER cloud staging, hard rule):
--   docker exec -i supabase_db_gordi-mos psql -U postgres < supabase/seed.dev-kitchen.sql
--
-- Not wired into `supabase db reset` — a hand-loaded demo/dev dataset, loaded AFTER
-- the base seed.sql (which owns the 32 WIP items + their confirmed units + the
-- personas). Kept out of [db.seed] deliberately: the kitchen e2e journeys (AC-090,
-- AC-014) assume the clean post-reset ops state. Idempotent: it first clears the
-- org's kitchen activity rows (never the WIP roster, units, or personas), then
-- regenerates everything relative to CURRENT_DATE so the app's "today" default
-- lands mid-dataset every run.
--
-- Reference IDs (from supabase/seed.sql):
--   org  Gordi                 10000000-0000-0000-0000-000000000001
--   BU   Retail Ops            20000000-0000-0000-0000-000000000014  (code retail_ops)
--   branch Gordi HQ            25000000-0000-0000-0000-000000000001  (gordi_hq)
--   branch Rumah Rames         25000000-0000-0000-0000-000000000002  (rumah_rames)
--   branch Radiant             25000000-0000-0000-0000-000000000003  (radiant)
--   Krishna Kitchen (member)   40000000-0000-0000-0000-000000000002  ← submitter
--   Cahya Cafe                 40000000-0000-0000-0000-000000000001  ← reviewer
--   WIP items                  a1100000-0000-0000-0000-0000000000NN  (NN = 01..20 hex)
--
-- Fictional dev data only — no real PII, no real ESB doc numbers.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── LOCAL-DEV GUARD (fail-closed) ────────────────────────────────────────────────
-- This file deletes and regenerates the org's kitchen activity, so it must be able
-- to run ONLY on the local dev stack. The structural marker: seed.dev-auth.sql —
-- applied exclusively by local `supabase db reset` — creates the *.dev@example.test
-- auth accounts, and no other environment can ever hold one. No marker → refuse,
-- inside the transaction, before any delete.
do $$
begin
  if not exists (select 1 from auth.users where email like '%.dev@example.test') then
    raise exception 'seed.dev-kitchen: REFUSING to run — no *.dev@example.test auth account found, '
      'so this is not the local dev stack (marker seeded by seed.dev-auth.sql on `supabase db reset`). '
      'Nothing was deleted.';
  end if;
end $$;

-- ── 0. Clean slate for the Gordi org's kitchen activity (roster + units + personas untouched) ──
delete from integrations.esb_push
  where org_id = '10000000-0000-0000-0000-000000000001' and source_module = 'kitchen';
delete from ops.kitchen_stock     where org_id = '10000000-0000-0000-0000-000000000001';
delete from ops.kitchen_logs      where org_id = '10000000-0000-0000-0000-000000000001';
delete from ops.kitchen_plans     where org_id = '10000000-0000-0000-0000-000000000001';
delete from ops.kitchen_batch_seq where org_id = '10000000-0000-0000-0000-000000000001';

-- ── 1. Plans — today-13 .. today+13 (feeds the lead Editor @ today AND the member
--       14-day forward horizon). ~22 produced dishes/day with day-to-day drift + a
--       few gaps, spread across the six-stream catalog, plus standing transfer
--       plans on the Rumah Rames kitchen anchors. ───────────────────────────────
insert into ops.kitchen_plans
  (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by)
with days as (
  select generate_series((now() at time zone 'Asia/Jakarta')::date - 13, (now() at time zone 'Asia/Jakarta')::date + 13, interval '1 day')::date as d
),
-- Each planned item's base qty and HOME production stream (OD-WAY-28 spread).
planned(sfx, base, branch_id, activity) as (values
  -- (Rumah Rames, kitchen) — the incumbent's captured stream, the main volume
  ('01',60,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('02',35,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('03',30,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('04',25,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('05',20,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('06',30,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('07',40,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('08',25,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('09',20,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('0a',30,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  -- (Gordi HQ, kitchen)
  ('0b',15,'25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('0c',22,'25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('0d',28,'25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('10',24,'25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  -- (Radiant, kitchen)
  ('12',24,'25000000-0000-0000-0000-000000000003'::uuid,'kitchen'),
  ('14',26,'25000000-0000-0000-0000-000000000003'::uuid,'kitchen'),
  ('15',20,'25000000-0000-0000-0000-000000000003'::uuid,'kitchen'),
  -- (Gordi HQ, bar)
  ('17',18,'25000000-0000-0000-0000-000000000001'::uuid,'bar'),
  ('18',22,'25000000-0000-0000-0000-000000000001'::uuid,'bar'),
  -- (Rumah Rames, bar)
  ('1b',20,'25000000-0000-0000-0000-000000000002'::uuid,'bar'),
  ('1c',16,'25000000-0000-0000-0000-000000000002'::uuid,'bar'),
  -- (Radiant, bar)
  ('1d',18,'25000000-0000-0000-0000-000000000003'::uuid,'bar')
)
select
  '10000000-0000-0000-0000-000000000001',
  d,
  ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid,
  branch_id,
  activity,
  'produce',
  null,
  greatest(4, base + ((abs(hashtext(d::text || sfx)) % 11) - 5))::numeric(12,2),
  '40000000-0000-0000-0000-000000000002'
from days cross join planned
-- ~1-in-13 dish/day gap so the plan isn't a perfect grid
where (abs(hashtext(d::text || sfx || 'plangap')) % 13) <> 0
on conflict (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id)
  do nothing;

-- A few standing transfer plans out of the (Rumah Rames, kitchen) stream: some
-- intra-branch (destination = origin, the held 'noop' movement), some to Radiant.
insert into ops.kitchen_plans
  (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by)
with days as (
  select generate_series((now() at time zone 'Asia/Jakarta')::date - 13, (now() at time zone 'Asia/Jakarta')::date + 13, interval '1 day')::date as d
),
tf(sfx, dest) as (values
  ('01','25000000-0000-0000-0000-000000000002'::uuid),  -- intra-branch (held)
  ('02','25000000-0000-0000-0000-000000000003'::uuid),  -- to Radiant
  ('07','25000000-0000-0000-0000-000000000002'::uuid),  -- intra-branch (held)
  ('0a','25000000-0000-0000-0000-000000000003'::uuid),  -- to Radiant
  ('06','25000000-0000-0000-0000-000000000002'::uuid)   -- intra-branch (held)
)
select
  '10000000-0000-0000-0000-000000000001',
  d,
  ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid,
  '25000000-0000-0000-0000-000000000002',
  'kitchen',
  'transfer',
  dest,
  (4 + (abs(hashtext(d::text || sfx || 'tfplan')) % 8))::numeric(12,2),
  '40000000-0000-0000-0000-000000000002'
from days cross join tf
where (abs(hashtext(d::text || sfx || dest::text)) % 2) = 0
on conflict (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id)
  do nothing;

-- ── 2. Approved log history — today-13 .. today-1. Production ≈ plan ± variance
--       (drives "variance" notes), a rotating set of off-plan dishes, and scattered
--       transfers. Each gets a real minted batch_id + reviewer provenance. Posted
--       flags are stamped in step 7, AFTER the outbox rows exist — the AC-012
--       enqueue refusal refuses an outbox row for an already-posted batch. ───────
insert into ops.kitchen_logs (
  org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
  wip_item_id, qty_porsi, notes, status, submitted_by, reviewed_by, reviewed_at, review_note,
  batch_id, created_at
)
with days as (
  select generate_series((now() at time zone 'Asia/Jakarta')::date - 13, (now() at time zone 'Asia/Jakarta')::date - 1, interval '1 day')::date as d
),
planned(sfx, base, branch_id, activity) as (values
  ('01',60,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('02',35,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('03',30,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('04',25,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('05',20,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('06',30,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('07',40,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('08',25,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('09',20,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('0a',30,'25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('0b',15,'25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('0c',22,'25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('0d',28,'25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('10',24,'25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('12',24,'25000000-0000-0000-0000-000000000003'::uuid,'kitchen'),
  ('14',26,'25000000-0000-0000-0000-000000000003'::uuid,'kitchen'),
  ('15',20,'25000000-0000-0000-0000-000000000003'::uuid,'kitchen'),
  ('17',18,'25000000-0000-0000-0000-000000000001'::uuid,'bar'),
  ('18',22,'25000000-0000-0000-0000-000000000001'::uuid,'bar'),
  ('1b',20,'25000000-0000-0000-0000-000000000002'::uuid,'bar'),
  ('1c',16,'25000000-0000-0000-0000-000000000002'::uuid,'bar'),
  ('1d',18,'25000000-0000-0000-0000-000000000003'::uuid,'bar')
),
-- Off-plan items with their own home streams (produced without a plan that day).
offplan(sfx, branch_id, activity) as (values
  ('0e','25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('0f','25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('11','25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('13','25000000-0000-0000-0000-000000000001'::uuid,'kitchen'),
  ('16','25000000-0000-0000-0000-000000000003'::uuid,'kitchen'),
  ('19','25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('1a','25000000-0000-0000-0000-000000000002'::uuid,'kitchen'),
  ('1e','25000000-0000-0000-0000-000000000001'::uuid,'bar'),
  ('1f','25000000-0000-0000-0000-000000000002'::uuid,'bar'),
  ('20','25000000-0000-0000-0000-000000000003'::uuid,'bar')
),
-- Production of planned dishes (skip ~1-in-11 so "made" doesn't perfectly mirror plan).
prod_planned as (
  select
    d,
    ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid as wip,
    branch_id, activity,
    'produce'::text as action,
    null::uuid as dest,
    greatest(3, base + ((abs(hashtext(d::text || sfx || 'made')) % 13) - 6))::numeric(12,2) as qty,
    (abs(hashtext(d::text || sfx || 'note')) % 6) = 0 as needs_note
  from days cross join planned
  where (abs(hashtext(d::text || sfx || 'skipmade')) % 11) <> 0
),
-- ~2-3 off-plan dishes produced per day (not planned that day → Off-plan group).
prod_offplan as (
  select
    d,
    ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid as wip,
    branch_id, activity,
    'produce'::text as action,
    null::uuid as dest,
    (8 + (abs(hashtext(d::text || sfx || 'op')) % 16))::numeric(12,2) as qty,
    true as needs_note
  from days cross join offplan
  where (abs(hashtext(d::text || sfx || 'oppick')) % 4) = 0
),
-- Scattered transfers out of the (Rumah Rames, kitchen) stream: intra-branch or to Radiant.
transfers as (
  select
    d,
    ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid as wip,
    '25000000-0000-0000-0000-000000000002'::uuid as branch_id,
    'kitchen'::text as activity,
    'transfer'::text as action,
    (case when (abs(hashtext(d::text || sfx)) % 2) = 0
       then '25000000-0000-0000-0000-000000000002'   -- intra-branch (held, no ERP doc)
       else '25000000-0000-0000-0000-000000000003'   -- to Radiant (simple-transfer)
     end)::uuid as dest,
    (3 + (abs(hashtext(d::text || sfx || 'tfqty')) % 9))::numeric(12,2) as qty,
    false as needs_note
  from days cross join (values ('01'),('02'),('06'),('07'),('0a')) as t(sfx)
  where (abs(hashtext(d::text || sfx || 'tfpick')) % 2) = 0
),
all_logs as (
  select * from prod_planned
  union all select * from prod_offplan
  union all select * from transfers
),
numbered as (
  select
    a.*,
    -- Counter namespace derived from the movement, exactly as ops.kitchen_batch_prefix does.
    (case when action = 'produce' then 'PR'
          when dest = branch_id   then 'TB'
          else 'TR' end) as prefix,
    row_number() over (
      partition by d, (case when action = 'produce' then 'PR'
                            when dest = branch_id   then 'TB'
                            else 'TR' end)
      order by wip
    ) as n
  from all_logs a
)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000014',
  d,
  branch_id, activity, action, dest,
  wip,
  qty,
  case
    when action <> 'produce' then 'Kirim antar-cabang sesuai pesanan'
    when needs_note then (array[
      'Variance — extra prep for a walk-in group',
      'Off-plan produksi, stok bahan lebih',
      'Batch tambahan sore hari',
      'Selisih plan — permintaan naik'
    ])[1 + (abs(hashtext(d::text || wip::text)) % 4)]
    else null
  end,
  'Approved',
  '40000000-0000-0000-0000-000000000002',                                   -- submitted_by Krishna
  '40000000-0000-0000-0000-000000000001',                                   -- reviewed_by Cahya
  (d + time '16:30')::timestamptz,
  case when action = 'produce' then 'ok' else null end,                     -- reviewer note (approve)
  prefix || '-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 3, '0'),
  (d + time '15:40')::timestamptz
from numbered;

-- ── 3. TODAY — the live day. A handful of approvals (so today has stock + fresh
--       pushes), the review queue (Submitted, spread across streams), and a couple
--       of Rejects. NO today's rows land on (Rumah Rames, bar): the AC-014 e2e
--       journey owns that stream's live day if this file is ever loaded before e2e. ──

-- 3a. Approved today on (Rumah Rames, kitchen) — batch_seq for today starts here.
insert into ops.kitchen_logs (
  org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
  wip_item_id, qty_porsi, notes, status, submitted_by, reviewed_by, reviewed_at, review_note,
  batch_id, created_at
)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000014',
  (now() at time zone 'Asia/Jakarta')::date,
  '25000000-0000-0000-0000-000000000002', 'kitchen', 'produce', null,
  ('a1100000-0000-0000-0000-0000000000' || v.sfx)::uuid, v.qty, null,
  'Approved',
  '40000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000001',
  ((now() at time zone 'Asia/Jakarta')::date + time '08:15')::timestamptz, 'ok',
  'PR-' || to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYYMMDD') || '-' || lpad(v.n::text, 3, '0'),
  ((now() at time zone 'Asia/Jakarta')::date + time '07:55')::timestamptz
from (values
  ('01', 58::numeric, 1), ('02', 33::numeric, 2), ('06', 28::numeric, 3), ('07', 42::numeric, 4)
) as v(sfx, qty, n);

-- 3b. Submitted today — the review queue (mix of on-plan + off-plan across three
--     streams; some carry a submitter variance note, some don't → exercises the
--     review note gate). Transfers wait for production review (FR-043) — both are
--     deliberately behind Submitted production on their stream, which is the gate's
--     honest live state.
insert into ops.kitchen_logs (
  org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
  wip_item_id, qty_porsi, notes, status, submitted_by, created_at
)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000014',
  (now() at time zone 'Asia/Jakarta')::date,
  v.branch_id::uuid, v.activity, v.action, v.dest::uuid,
  ('a1100000-0000-0000-0000-0000000000' || v.sfx)::uuid, v.qty, v.note,
  'Submitted',
  '40000000-0000-0000-0000-000000000002',
  ((now() at time zone 'Asia/Jakarta')::date + time '09:05')::timestamptz + (v.n || ' minutes')::interval
from (values
  ('03','25000000-0000-0000-0000-000000000002','kitchen','produce',null,               31::numeric, null,                               1),
  ('04','25000000-0000-0000-0000-000000000002','kitchen','produce',null,               22::numeric, 'Kurang bahan, produksi dikurangi', 2),
  ('05','25000000-0000-0000-0000-000000000002','kitchen','produce',null,               20::numeric, null,                               3),
  ('0a','25000000-0000-0000-0000-000000000002','kitchen','produce',null,               36::numeric, 'Batch tambahan untuk pesanan',     4),
  ('0d','25000000-0000-0000-0000-000000000001','kitchen','produce',null,               30::numeric, null,                               5),
  ('12','25000000-0000-0000-0000-000000000003','kitchen','produce',null,               24::numeric, null,                               6),
  ('16','25000000-0000-0000-0000-000000000003','kitchen','produce',null,               14::numeric, 'Off-plan — ada sisa bahan',        7),
  ('1a','25000000-0000-0000-0000-000000000002','kitchen','produce',null,               10::numeric, 'Off-plan produksi',                8),
  ('01','25000000-0000-0000-0000-000000000002','kitchen','transfer','25000000-0000-0000-0000-000000000002', 8::numeric, 'Kirim internal sesuai pesanan', 9),
  ('02','25000000-0000-0000-0000-000000000002','kitchen','transfer','25000000-0000-0000-0000-000000000003', 6::numeric, 'Kirim ke Radiant',             10)
) as v(sfx, branch_id, activity, action, dest, qty, note, n);

-- 3c. Rejected today (reviewer provenance stamped; review_note required).
insert into ops.kitchen_logs (
  org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
  wip_item_id, qty_porsi, notes, status, submitted_by, reviewed_by, reviewed_at, review_note,
  created_at
)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000014',
  (now() at time zone 'Asia/Jakarta')::date,
  v.branch_id::uuid, 'kitchen', 'produce', null,
  ('a1100000-0000-0000-0000-0000000000' || v.sfx)::uuid, v.qty, v.note,
  'Rejected',
  '40000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000001',
  ((now() at time zone 'Asia/Jakarta')::date + time '09:40')::timestamptz, v.rnote,
  ((now() at time zone 'Asia/Jakarta')::date + time '09:10')::timestamptz
from (values
  ('08','25000000-0000-0000-0000-000000000002', 25::numeric, 'Produksi pagi', 'Qty tidak sesuai plan — mohon cek ulang'),
  ('14','25000000-0000-0000-0000-000000000003', 40::numeric, null,            'Duplikat — sudah dicatat di batch lain')
) as v(sfx, branch_id, qty, note, rnote);

-- ── 4. Batch counters — consistent with EVERY seeded batch id, per (prefix, date),
--       so a later in-app approval mints the next number instead of colliding with
--       a seeded row (the unique (org_id, batch_id) backstop would refuse it). ────
insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
select org_id, split_part(batch_id, '-', 1), log_date,
       max(split_part(batch_id, '-', 3)::int)
from ops.kitchen_logs
where org_id = '10000000-0000-0000-0000-000000000001' and batch_id is not null
group by org_id, split_part(batch_id, '-', 1), log_date
on conflict (org_id, prefix, log_date) do update set last_n = excluded.last_n;

-- ── 5. Stock snapshots — net of ALL approved logs per (date, item, STREAM),
--       mirroring the approve RPC's end-of-day recompute (FR-062, OD-WAY-28). A
--       transfer subtracts from its origin stream whatever its destination. ──────
insert into ops.kitchen_stock (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
select
  '10000000-0000-0000-0000-000000000001',
  log_date,
  wip_item_id,
  branch_id,
  activity,
  sum(case when action = 'produce' then qty_porsi else -qty_porsi end)::numeric(12,2)
from ops.kitchen_logs
where org_id = '10000000-0000-0000-0000-000000000001'
  and status = 'Approved'
group by log_date, wip_item_id, branch_id, activity
on conflict (org_id, log_date, wip_item_id, branch_id, activity)
  do update set usable_qty = excluded.usable_qty;

-- ── 6. ESB push outbox — one row per POSTABLE approved batch in the last 4 days
--       (the monitoring window), endpoint derived from the movement (FR-071):
--       produce → assembly-actual, inter-branch transfer → simple-transfer.
--       Intra-branch (noop/held, FR-053) batches are deliberately NOT seeded here:
--       the pgTAP sweep integrations_02_approval_enqueue #45 counts noop rows
--       across the WHOLE outbox to prove no held row ever carries an ERP document,
--       and seeded held rows would turn `supabase test db` red on a hand-loaded
--       dev DB. The held movements stay fully visible as unposted TB logs + stock.
--       Postable rows: mostly posted, a few pending (no dispatch worker runs
--       locally, so pending is honest). Logs are still unposted here, so the
--       AC-012 enqueue refusal admits every row. ─────────────────────────────────
insert into integrations.esb_push (
  org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key,
  status, retry_count, last_error, esb_doc_num, created_at, posted_at
)
select
  '10000000-0000-0000-0000-000000000001',
  'kitchen',
  batch_id,
  ops.esb_endpoint_for(action, branch_id, destination_branch_id),
  jsonb_build_object(
    'batch_id', batch_id, 'qty_porsi', qty_porsi,
    'action', action, 'activity', activity,
    'branch_id', branch_id, 'destination_branch_id', destination_branch_id),
  'dry_run',
  'kitchen|' || batch_id || '|dry_run',
  case
    when log_date = (now() at time zone 'Asia/Jakarta')::date and (abs(hashtext(batch_id)) % 3) = 0 then 'pending'
    when log_date < (now() at time zone 'Asia/Jakarta')::date and (abs(hashtext(batch_id)) % 4) = 0 then 'pending'
    else 'posted'
  end,
  0,
  null,
  case
    when log_date = (now() at time zone 'Asia/Jakarta')::date and (abs(hashtext(batch_id)) % 3) = 0 then null
    when log_date < (now() at time zone 'Asia/Jakarta')::date and (abs(hashtext(batch_id)) % 4) = 0 then null
    else 'ESB-' || to_char(log_date, 'YYMMDD') || '-' || split_part(batch_id, '-', 3)
  end,
  created_at + interval '90 minutes',
  case
    when log_date = (now() at time zone 'Asia/Jakarta')::date and (abs(hashtext(batch_id)) % 3) = 0 then null
    when log_date < (now() at time zone 'Asia/Jakarta')::date and (abs(hashtext(batch_id)) % 4) = 0 then null
    when log_date = (now() at time zone 'Asia/Jakarta')::date then ((now() at time zone 'Asia/Jakarta')::date + time '08:40')::timestamptz
    else (log_date + time '17:05')::timestamptz
  end
from ops.kitchen_logs
where org_id = '10000000-0000-0000-0000-000000000001'
  and status = 'Approved'
  and batch_id is not null
  and log_date >= (now() at time zone 'Asia/Jakarta')::date - 3
  and ops.esb_endpoint_for(action, branch_id, destination_branch_id) <> 'noop';

-- ── 7. NOW stamp the posted flags onto the logs (same predicate as step 6, plus
--       every posted history day outside the outbox window). Intra-branch (noop)
--       batches are never marked posted: no ERP document exists for them. ────────
update ops.kitchen_logs
   set posted_to_esb = true,
       esb_doc_num   = 'ESB-' || to_char(log_date, 'YYMMDD') || '-' || split_part(batch_id, '-', 3),
       posted_at     = case when log_date = (now() at time zone 'Asia/Jakarta')::date
                            then ((now() at time zone 'Asia/Jakarta')::date + time '08:40')::timestamptz
                            else (log_date + time '17:05')::timestamptz end
 where org_id = '10000000-0000-0000-0000-000000000001'
   and status = 'Approved'
   and batch_id is not null
   and ops.esb_endpoint_for(action, branch_id, destination_branch_id) <> 'noop'
   and case when log_date = (now() at time zone 'Asia/Jakarta')::date
            then (abs(hashtext(batch_id)) % 3) <> 0
            else (abs(hashtext(batch_id)) % 4) <> 0 end;

-- ── 8. Guarantee one failed + one dead-letter row for the demo (newest two posted
--       postable rows), and un-post their logs so log + outbox agree. ─────────────
update integrations.esb_push
   set status = 'failed', retry_count = 2, posted_at = null, esb_doc_num = null,
       last_error = 'HTTP 502 from ESB assembly-actual endpoint (upstream timeout)'
 where id = (
   select id from integrations.esb_push
    where org_id = '10000000-0000-0000-0000-000000000001'
      and source_module = 'kitchen' and status = 'posted' and esb_doc_num is not null
    order by created_at desc limit 1
 );

update integrations.esb_push
   set status = 'dead_letter', retry_count = 5, posted_at = null, esb_doc_num = null,
       last_error = 'ESB rejected: product mapping missing (esb_product_id is null) — needs platform fix'
 where id = (
   select id from integrations.esb_push
    where org_id = '10000000-0000-0000-0000-000000000001'
      and source_module = 'kitchen' and status = 'posted' and esb_doc_num is not null
    order by created_at desc offset 1 limit 1
 );

update ops.kitchen_logs
   set posted_to_esb = false, esb_doc_num = null, posted_at = null
 where org_id = '10000000-0000-0000-0000-000000000001'
   and batch_id in (
     select source_ref from integrations.esb_push
      where org_id = '10000000-0000-0000-0000-000000000001'
        and source_module = 'kitchen' and status in ('failed','dead_letter'));

commit;

-- ── Sanity summary (printed on load) ─────────────────────────────────────────────
select 'plans'   as tbl, count(*) from ops.kitchen_plans  where org_id = '10000000-0000-0000-0000-000000000001'
union all select 'logs (all)',        count(*) from ops.kitchen_logs   where org_id = '10000000-0000-0000-0000-000000000001'
union all select 'logs (submitted)',  count(*) from ops.kitchen_logs   where org_id = '10000000-0000-0000-0000-000000000001' and status = 'Submitted'
union all select 'logs (approved)',   count(*) from ops.kitchen_logs   where org_id = '10000000-0000-0000-0000-000000000001' and status = 'Approved'
union all select 'logs (rejected)',   count(*) from ops.kitchen_logs   where org_id = '10000000-0000-0000-0000-000000000001' and status = 'Rejected'
union all select 'streams w/ logs',   count(distinct (branch_id, activity)) from ops.kitchen_logs where org_id = '10000000-0000-0000-0000-000000000001'
union all select 'stock rows',        count(*) from ops.kitchen_stock  where org_id = '10000000-0000-0000-0000-000000000001'
union all select 'esb_push',          count(*) from integrations.esb_push where org_id = '10000000-0000-0000-0000-000000000001' and source_module = 'kitchen';
