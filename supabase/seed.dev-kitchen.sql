-- ═══════════════════════════════════════════════════════════════════════════════
-- seed.dev-kitchen.sql — DEV-ONLY Café/Kitchen activity so every kitchen screen
-- renders FULL in local dev (the shipped module looked empty only because the local
-- ops.* tables were bare: 0 logs / 3 plans). Generates ~4 weeks of plausible plans
-- and ~2 weeks of approved log history, plus a live "today" (submitted review queue,
-- a couple rejects, a few approvals) and the ESB push outbox that mirrors it.
--
-- LOAD (local ephemeral stack ONLY — NEVER cloud staging, hard rule):
--   docker exec -i supabase_db_gordi-mos psql -U postgres < supabase/seed.dev-kitchen.sql
--
-- Not wired into `supabase db reset` — it is a hand-loaded demo/dev dataset, loaded
-- AFTER the base seed.sql (which owns the 32 real WIP items + personas). Idempotent:
-- it first clears the org's kitchen activity rows (never the WIP roster or personas),
-- then regenerates everything relative to CURRENT_DATE so the app's WIB-"today"
-- default lands mid-dataset every run.
--
-- Reference IDs (from supabase/seed.sql):
--   org  Gordi                 10000000-0000-0000-0000-000000000001
--   BU   Retail Ops (kitchen)  20000000-0000-0000-0000-000000000014   (code retail_ops)
--   Krishna Kitchen (member)   40000000-0000-0000-0000-000000000002   ← submitter
--   Cahya Cafe (ops_lead)      40000000-0000-0000-0000-000000000001   ← reviewer
--   WIP items                  a1100000-0000-0000-0000-0000000000NN   (NN = 01..20 hex)
--
-- Fictional dev data only — no real PII, no real ESB doc numbers.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 0. Clean slate for the Gordi org's kitchen activity (roster + personas untouched) ──
delete from integrations.esb_push
  where org_id = '10000000-0000-0000-0000-000000000001' and source_module = 'kitchen';
delete from ops.kitchen_stock     where org_id = '10000000-0000-0000-0000-000000000001';
delete from ops.kitchen_logs      where org_id = '10000000-0000-0000-0000-000000000001';
delete from ops.kitchen_plans     where org_id = '10000000-0000-0000-0000-000000000001';
delete from ops.kitchen_batch_seq where org_id = '10000000-0000-0000-0000-000000000001';

-- ── 1. Plans — today-13 .. today+13 (feeds the lead Editor @ today AND the member
--       Pesanan 14-day forward horizon). ~22 Production dishes/day with day-to-day
--       drift + a few gaps, plus a handful of transfer plans. ─────────────────────────
insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi, plan_by)
with days as (
  select generate_series(current_date - 13, current_date + 13, interval '1 day')::date as d
),
planned(sfx, base) as (values
  ('01',60),('02',35),('03',30),('04',25),('05',20),('06',30),('07',40),('08',25),
  ('09',20),('0a',30),('0b',15),('0c',22),('0d',28),('10',24),('12',24),('14',26),
  ('15',20),('17',18),('18',22),('1b',20),('1c',16),('1d',18)
)
select
  '10000000-0000-0000-0000-000000000001',
  d,
  ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid,
  'Production',
  greatest(4, base + ((abs(hashtext(d::text || sfx)) % 11) - 5))::numeric(12,2),
  '40000000-0000-0000-0000-000000000002'
from days cross join planned
-- ~1-in-13 dish/day gap so the plan isn't a perfect grid
where (abs(hashtext(d::text || sfx || 'plangap')) % 13) <> 0
on conflict (org_id, log_date, wip_item_id, action_type) do nothing;

-- A few standing transfer plans (Bungur/Radiant) on the anchor dishes.
insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi, plan_by)
with days as (
  select generate_series(current_date - 13, current_date + 13, interval '1 day')::date as d
),
tf(sfx, at) as (values
  ('01','Transfer to Bungur'), ('02','Transfer to Radiant'), ('07','Transfer to Bungur'),
  ('0a','Transfer to Radiant'), ('06','Transfer to Bungur')
)
select
  '10000000-0000-0000-0000-000000000001',
  d,
  ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid,
  at,
  (4 + (abs(hashtext(d::text || sfx || 'tfplan')) % 8))::numeric(12,2),
  '40000000-0000-0000-0000-000000000002'
from days cross join tf
where (abs(hashtext(d::text || sfx || at)) % 2) = 0
on conflict (org_id, log_date, wip_item_id, action_type) do nothing;

-- ── 2. Approved log history — today-13 .. today-1. Production ≈ plan ± variance
--       (drives some FR-022 "variance" notes), a rotating set of off-plan dishes, and
--       scattered transfers. Each gets a real minted batch_id + reviewer provenance. ──
insert into ops.kitchen_logs (
  org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, notes,
  status, submitted_by, reviewed_by, reviewed_at, review_note, batch_id,
  posted_to_esb, esb_doc_num, posted_at, created_at
)
with days as (
  select generate_series(current_date - 13, current_date - 1, interval '1 day')::date as d
),
planned(sfx, base) as (values
  ('01',60),('02',35),('03',30),('04',25),('05',20),('06',30),('07',40),('08',25),
  ('09',20),('0a',30),('0b',15),('0c',22),('0d',28),('10',24),('12',24),('14',26),
  ('15',20),('17',18),('18',22),('1b',20),('1c',16),('1d',18)
),
offplan(sfx) as (values
  ('0e'),('0f'),('11'),('13'),('16'),('19'),('1a'),('1e'),('1f'),('20')
),
-- Production of planned dishes (skip ~1-in-11 so "made" doesn't perfectly mirror plan).
prod_planned as (
  select
    d,
    ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid as wip,
    'Production'::text as at,
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
    'Production'::text as at,
    (8 + (abs(hashtext(d::text || sfx || 'op')) % 16))::numeric(12,2) as qty,
    true as needs_note
  from days cross join offplan
  where (abs(hashtext(d::text || sfx || 'oppick')) % 4) = 0
),
-- Scattered transfers to Bungur / Radiant on the anchor dishes.
transfers as (
  select
    d,
    ('a1100000-0000-0000-0000-0000000000' || sfx)::uuid as wip,
    (case when (abs(hashtext(d::text || sfx)) % 2) = 0
       then 'Transfer to Bungur' else 'Transfer to Radiant' end)::text as at,
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
    (case at when 'Production' then 'PR'
             when 'Transfer to Bungur' then 'TB'
             else 'TR' end) as prefix,
    row_number() over (
      partition by d, (case at when 'Production' then 'PR'
                               when 'Transfer to Bungur' then 'TB' else 'TR' end)
      order by wip
    ) as n
  from all_logs a
)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000014',
  d,
  at,
  wip,
  qty,
  case
    when at <> 'Production' then 'Kirim ke cabang sesuai pesanan'
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
  case when at = 'Production' then 'ok' else null end,                       -- reviewer note (approve)
  prefix || '-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 3, '0'),
  (abs(hashtext(d::text || wip::text)) % 4) <> 0,                            -- ~75% pushed to ESB
  case when (abs(hashtext(d::text || wip::text)) % 4) <> 0
    then 'ESB-' || to_char(d, 'YYMMDD') || '-' || lpad(n::text, 3, '0') else null end,
  case when (abs(hashtext(d::text || wip::text)) % 4) <> 0
    then (d + time '17:05')::timestamptz else null end,
  (d + time '15:40')::timestamptz
from numbered;

-- ── 3. TODAY — the live day. A handful of approvals (so today has stock + fresh
--       pushes), the ops_lead review queue (Submitted), and a couple of Rejects. ──────

-- 3a. Approved today (batch_seq for today starts here).
insert into ops.kitchen_logs (
  org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, notes,
  status, submitted_by, reviewed_by, reviewed_at, review_note, batch_id,
  posted_to_esb, esb_doc_num, posted_at, created_at
)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000014',
  current_date, 'Production',
  ('a1100000-0000-0000-0000-0000000000' || v.sfx)::uuid, v.qty, null,
  'Approved',
  '40000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000001',
  (current_date + time '08:15')::timestamptz, 'ok',
  'PR-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v.n::text, 3, '0'),
  true,
  'ESB-' || to_char(current_date, 'YYMMDD') || '-' || lpad(v.n::text, 3, '0'),
  (current_date + time '08:40')::timestamptz,
  (current_date + time '07:55')::timestamptz
from (values
  ('01', 58::numeric, 1), ('02', 33::numeric, 2), ('06', 28::numeric, 3), ('07', 42::numeric, 4)
) as v(sfx, qty, n);

-- 3b. Submitted today — the ops_lead review queue (mix of on-plan + off-plan; some
--     carry a submitter variance note, some don't → exercises the review note gate).
insert into ops.kitchen_logs (
  org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, notes,
  status, submitted_by, created_at
)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000014',
  current_date, v.at,
  ('a1100000-0000-0000-0000-0000000000' || v.sfx)::uuid, v.qty, v.note,
  'Submitted',
  '40000000-0000-0000-0000-000000000002',
  (current_date + time '09:05')::timestamptz + (v.n || ' minutes')::interval
from (values
  ('03','Production',       31::numeric, null,                               1),
  ('04','Production',       22::numeric, 'Kurang bahan, produksi dikurangi', 2),
  ('05','Production',       20::numeric, null,                               3),
  ('0a','Production',       36::numeric, 'Batch tambahan untuk pesanan',     4),
  ('0d','Production',       30::numeric, null,                               5),
  ('12','Production',       24::numeric, null,                               6),
  ('16','Production',       14::numeric, 'Off-plan — ada sisa bahan',        7),
  ('1a','Production',       10::numeric, 'Off-plan produksi',                8),
  ('01','Transfer to Bungur', 8::numeric, 'Kirim ke Bungur',                 9),
  ('02','Transfer to Radiant',6::numeric, 'Kirim ke Radiant',              10)
) as v(sfx, at, qty, note, n);

-- 3c. Rejected today (reviewer provenance stamped; review_note required).
insert into ops.kitchen_logs (
  org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, notes,
  status, submitted_by, reviewed_by, reviewed_at, review_note, created_at
)
select
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000014',
  current_date, 'Production',
  ('a1100000-0000-0000-0000-0000000000' || v.sfx)::uuid, v.qty, v.note,
  'Rejected',
  '40000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000001',
  (current_date + time '09:40')::timestamptz, v.rnote,
  (current_date + time '09:10')::timestamptz
from (values
  ('08', 25::numeric, 'Produksi pagi', 'Qty tidak sesuai plan — mohon cek ulang'),
  ('14', 40::numeric, null,            'Duplikat — sudah dicatat di batch lain')
) as v(sfx, qty, note, rnote);

-- Keep today's PR batch sequence consistent with the 4 approvals above so a later
-- in-app approval mints PR-<today>-005 (no collision with the seeded rows).
insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
values ('10000000-0000-0000-0000-000000000001', 'PR', current_date, 4)
on conflict (org_id, prefix, log_date) do update set last_n = excluded.last_n;

-- ── 4. Stock snapshots — net of ALL approved logs per (date, item), mirroring the
--       approve RPC's FR-062 end-of-day recompute. Fills the Stock view's `stok`. ─────
insert into ops.kitchen_stock (org_id, log_date, wip_item_id, usable_qty, notes)
select
  '10000000-0000-0000-0000-000000000001',
  log_date,
  wip_item_id,
  sum(case when action_type = 'Production' then qty_porsi else -qty_porsi end)::numeric(12,2),
  null
from ops.kitchen_logs
where org_id = '10000000-0000-0000-0000-000000000001'
  and status = 'Approved'
group by log_date, wip_item_id
on conflict (org_id, log_date, wip_item_id) do update set usable_qty = excluded.usable_qty;

-- ── 5. ESB push outbox — one row per approved log in the last 4 days (the monitoring
--       window). Mostly posted; a few pending on today; one failed + one dead-letter
--       so the S5 Pushes view shows every status + the dead-letter side-stripe. ───────
insert into integrations.esb_push (
  org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key,
  status, retry_count, last_error, esb_doc_num, created_at, posted_at
)
select
  '10000000-0000-0000-0000-000000000001',
  'kitchen',
  batch_id,
  case when action_type = 'Production' then 'assembly-actual' else 'simple-transfer' end,
  jsonb_build_object('batch_id', batch_id, 'qty_porsi', qty_porsi),
  (case (abs(hashtext(batch_id)) % 6) when 0 then 'dry_run' when 1 then 'gkid' else 'goo' end),
  batch_id,
  case
    when log_date = current_date and (abs(hashtext(batch_id)) % 3) = 0 then 'pending'
    else 'posted'
  end,
  0,
  null,
  case
    when log_date = current_date and (abs(hashtext(batch_id)) % 3) = 0 then null
    else esb_doc_num
  end,
  created_at + interval '90 minutes',
  case
    when log_date = current_date and (abs(hashtext(batch_id)) % 3) = 0 then null
    else posted_at
  end
from ops.kitchen_logs
where org_id = '10000000-0000-0000-0000-000000000001'
  and status = 'Approved'
  and batch_id is not null
  and log_date >= current_date - 3;

-- Guarantee one failed + one dead-letter row for the demo (newest two posted rows).
update integrations.esb_push
   set status = 'failed', retry_count = 2, posted_at = null, esb_doc_num = null,
       last_error = 'HTTP 502 from ESB assembly-actual endpoint (upstream timeout)'
 where id = (
   select id from integrations.esb_push
    where org_id = '10000000-0000-0000-0000-000000000001'
      and source_module = 'kitchen' and status = 'posted'
    order by created_at desc limit 1
 );

update integrations.esb_push
   set status = 'dead_letter', retry_count = 5, posted_at = null, esb_doc_num = null,
       last_error = 'ESB rejected: product mapping missing (esb_product_id is null) — needs platform fix'
 where id = (
   select id from integrations.esb_push
    where org_id = '10000000-0000-0000-0000-000000000001'
      and source_module = 'kitchen' and status = 'posted'
    order by created_at desc offset 1 limit 1
 );

commit;

-- ── Sanity summary (printed on load) ─────────────────────────────────────────────
select 'plans'   as tbl, count(*) from ops.kitchen_plans  where org_id = '10000000-0000-0000-0000-000000000001'
union all select 'logs (all)',        count(*) from ops.kitchen_logs   where org_id = '10000000-0000-0000-0000-000000000001'
union all select 'logs (submitted)',  count(*) from ops.kitchen_logs   where org_id = '10000000-0000-0000-0000-000000000001' and status = 'Submitted'
union all select 'logs (approved)',   count(*) from ops.kitchen_logs   where org_id = '10000000-0000-0000-0000-000000000001' and status = 'Approved'
union all select 'logs (rejected)',   count(*) from ops.kitchen_logs   where org_id = '10000000-0000-0000-0000-000000000001' and status = 'Rejected'
union all select 'stock rows',        count(*) from ops.kitchen_stock  where org_id = '10000000-0000-0000-0000-000000000001'
union all select 'esb_push',          count(*) from integrations.esb_push where org_id = '10000000-0000-0000-0000-000000000001' and source_module = 'kitchen';
