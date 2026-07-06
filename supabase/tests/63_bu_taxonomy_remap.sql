-- BU taxonomy re-mapping (ADR-0019 D1 / OD-IA-1). Business Unit = team, not operating area.
-- This file asserts against the COMMITTED seed.sql rows (Gordi org, real seed data), read as the
-- migration owner (postgres bypasses RLS) — no fixture wrap, begin;...rollback; keeps it isolated.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ── AC-BU-001: the 6 team BUs exist (Gordi org), each with its expected stable code ────────────
select ok(
  exists(select 1 from shared.business_units
           where org_id = '10000000-0000-0000-0000-000000000001' and code = 'marketing'),
  'AC-BU-001: Marketing BU exists with code marketing');
select ok(
  exists(select 1 from shared.business_units
           where org_id = '10000000-0000-0000-0000-000000000001' and code = 'hr'),
  'AC-BU-001: HR BU exists with code hr');
select ok(
  exists(select 1 from shared.business_units
           where org_id = '10000000-0000-0000-0000-000000000001' and code = 'finance'),
  'AC-BU-001: Finance BU exists with code finance');
select ok(
  exists(select 1 from shared.business_units
           where org_id = '10000000-0000-0000-0000-000000000001' and code = 'retail_ops'),
  'AC-BU-001: Retail Ops BU exists with code retail_ops');
select ok(
  exists(select 1 from shared.business_units
           where org_id = '10000000-0000-0000-0000-000000000001' and code = 'b2b_ops'),
  'AC-BU-001: B2B Ops BU exists with code b2b_ops');
select ok(
  exists(select 1 from shared.business_units
           where org_id = '10000000-0000-0000-0000-000000000001' and code = 'b2b_sales'),
  'AC-BU-001: B2B Sales BU exists with code b2b_sales');

select is(
  (select count(*)::int from shared.business_units
     where org_id = '10000000-0000-0000-0000-000000000001'
       and code in ('marketing','hr','finance','retail_ops','b2b_ops','b2b_sales')
       and archived_at is null),
  6, 'AC-BU-001: exactly 6 live team BUs carry the 6 expected codes');

-- ── AC-BU-002: legacy operating-area BUs are retired (archived_at set), not deleted ────────────
select is(
  (select count(*)::int from shared.business_units
     where org_id = '10000000-0000-0000-0000-000000000001'
       and name like '%(legacy)'
       and archived_at is not null),
  5, 'AC-BU-002: all 5 legacy operating-area BUs are archived + renamed with (legacy) suffix');

-- ── AC-BU-003: zero rows still reference a legacy (archived) BU ────────────────────────────────
select is(
  (select count(*)::int from shared.roles r
     join shared.business_units bu on bu.id = r.business_unit_id
    where bu.archived_at is not null),
  0, 'AC-BU-003: no shared.roles row references an archived legacy BU');
select is(
  (select count(*)::int from mos.tasks t
     join shared.business_units bu on bu.id = t.business_unit_id
    where bu.archived_at is not null),
  0, 'AC-BU-003: no mos.tasks row references an archived legacy BU');
select is(
  (select count(*)::int from ops.log_entries l
     join shared.business_units bu on bu.id = l.business_unit_id
    where bu.archived_at is not null),
  0, 'AC-BU-003: no ops.log_entries row references an archived legacy BU');
select is(
  (select count(*)::int from ops.kitchen_logs k
     join shared.business_units bu on bu.id = k.business_unit_id
    where bu.archived_at is not null),
  0, 'AC-BU-003: no ops.kitchen_logs row references an archived legacy BU');

-- ── AC-BU-004: role-chain (person -> role -> BU) intact for the seeded personas ────────────────
-- Cahya (Cafe Ops + Sales lead) now resolves to Retail Ops (via Cafe Ops Lead) and B2B Sales
-- (via Sales Lead); Krishna (Kitchen Lead) -> Retail Ops; Rama (Roastery Lead) -> B2B Ops;
-- Fitri (Finance Lead) -> Finance.
select is(
  (select bu.code from shared.roles ro
     join shared.business_units bu on bu.id = ro.business_unit_id
    where ro.id = '30000000-0000-0000-0000-000000000001'), -- Cafe Ops Lead
  'retail_ops', 'AC-BU-004: Cafe Ops Lead role now points at Retail Ops BU');
select is(
  (select bu.code from shared.roles ro
     join shared.business_units bu on bu.id = ro.business_unit_id
    where ro.id = '30000000-0000-0000-0000-000000000002'), -- Kitchen Lead
  'retail_ops', 'AC-BU-004: Kitchen Lead role now points at Retail Ops BU');
select is(
  (select bu.code from shared.roles ro
     join shared.business_units bu on bu.id = ro.business_unit_id
    where ro.id = '30000000-0000-0000-0000-000000000003'), -- Roastery Lead
  'b2b_ops', 'AC-BU-004: Roastery Lead role now points at B2B Ops BU');
select is(
  (select bu.code from shared.roles ro
     join shared.business_units bu on bu.id = ro.business_unit_id
    where ro.id = '30000000-0000-0000-0000-000000000004'), -- Sales Lead
  'b2b_sales', 'AC-BU-004: Sales Lead role now points at B2B Sales BU');
select is(
  (select bu.code from shared.roles ro
     join shared.business_units bu on bu.id = ro.business_unit_id
    where ro.id = '30000000-0000-0000-0000-000000000005'), -- Finance Lead
  'finance', 'AC-BU-004: Finance Lead role now points at Finance BU');

-- ── AC-BU-005: org_id seam intact — every team BU still belongs to the Gordi org ───────────────
select is(
  (select count(*)::int from shared.business_units
     where code in ('marketing','hr','finance','retail_ops','b2b_ops','b2b_sales')
       and org_id <> '10000000-0000-0000-0000-000000000001'),
  0, 'AC-BU-005: no team BU leaks outside the Gordi org (org_id seam intact)');

-- ── AC-BU-006: resolveKitchenBuId's target resolves by CODE (retail_ops), not display name ─────
select ok(
  exists(select 1 from shared.business_units
           where org_id = '10000000-0000-0000-0000-000000000001'
             and code = 'retail_ops' and archived_at is null),
  'AC-BU-006: a live, non-archived BU exists at code retail_ops for resolveKitchenBuId to resolve');

select * from finish();
rollback;
