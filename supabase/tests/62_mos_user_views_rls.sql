-- mos.user_views RLS (ADR-0018 D6 P1 / ADR-0017 D5/D6). Adapted from the sibling internal
-- project's user_views RLS test suite; MOS deltas: mos schema, owner_id (person), shared_team via
-- shared.is_managed_by (reverse of is_manager_of), org-gate on every SELECT branch.
-- AC-UV-010: RLS enabled+forced, org_id default, INSERT/UPDATE carry WITH CHECK.
-- AC-UV-011: private view — owner-only; same-org non-owner and cross-org both 0 rows.
-- AC-UV-012: shared_team view — owner's reports see it; peer/unrelated-manager/cross-org see 0.
-- AC-UV-013: spoofed owner_id / org_id on INSERT rejected by WITH CHECK.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select mos._test_seed_role_tree();

-- Role tree recap (mos._test_seed_role_tree, org WU-A = ...0a1):
--   Exec ...0f1 (top) <- Lead R ...0f2 <- Staff R ...0f3 <- SubR ...0f6
--   Exec ...0f1 (top) <- Lead 2 ...0f4 <- Staff 2 ...0f5
--   DirectMgr ...0d02 [Lead R]   -- M: manages anyone holding Staff R (or its descendants)
--   Author    ...0d01 [Staff R] -- R: DirectMgr's report (Staff R reports to Lead R)
--   Peer      ...0d04 [Staff R] -- also DirectMgr's report (same role as Author) -- NOT used as the
--                                  "peer of R" for AC-UV-012 (peer needs to be OUTSIDE M's management)
--   Lead2Holder ...0d07 [Lead 2] -- unrelated to DirectMgr's chain (Lead 2 reports to Exec directly,
--                                    not through Lead R) -- doubles as "peer of R, not M's report"
--   GrandMgr  ...0d03 [Exec]    -- unrelated manager (Exec has no parent; not managed by DirectMgr)
--   ForeignMgr ...0b04 [B-Lead] -- cross-org (Org WU-B)

-- ── AC-UV-010: RLS enabled+forced, org_id default, INSERT/UPDATE carry WITH CHECK ─────────
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'user_views'),
  'AC-UV-010: mos.user_views has RLS enabled and forced');

select ok(
  (select column_default like '%current_org_id%'
     from information_schema.columns
    where table_schema = 'mos' and table_name = 'user_views' and column_name = 'org_id'),
  'AC-UV-010: org_id defaults to shared.current_org_id()');

select ok(
  (select with_check is not null
     from pg_policies
    where schemaname = 'mos' and tablename = 'user_views' and policyname = 'user_views_insert'),
  'AC-UV-010: INSERT policy carries a WITH CHECK');

select ok(
  (select with_check is not null
     from pg_policies
    where schemaname = 'mos' and tablename = 'user_views' and policyname = 'user_views_update'),
  'AC-UV-010: UPDATE policy carries a WITH CHECK');

set local role authenticated;

-- ── AC-UV-011: private view — owner-only; same-org non-owner + cross-org both 0 rows ──────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
insert into mos.user_views (name, spec, scope) values
  ('M private view', '{"version":1,"panels":[]}'::jsonb, 'private');

select is(
  (select count(*)::int from mos.user_views where name = 'M private view'),
  1, 'AC-UV-011: owner (M) sees their own private view');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'M private view'),
  0, 'AC-UV-011: same-org non-owner (R) sees 0 rows of a private view');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'M private view'),
  0, 'AC-UV-011: cross-org person (F) sees 0 rows of a private view');

-- ── AC-UV-012: shared_team view — owner's reports see it; peer/unrelated-mgr/cross-org see 0 ──
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
insert into mos.user_views (name, spec, scope) values
  ('M shared view', '{"version":1,"panels":[]}'::jsonb, 'shared_team');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'M shared view'),
  1, 'AC-UV-012: M''s report (R = Author) sees the shared_team view');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'M shared view'),
  0, 'AC-UV-012: a peer of R who is not M''s report (Lead2Holder) sees 0 rows');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'M shared view'),
  0, 'AC-UV-012: an unrelated manager (GrandMgr) sees 0 rows');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'M shared view'),
  0, 'AC-UV-012: a cross-org person (F) sees 0 rows even of a shared_team view');

-- ── AC-UV-013: spoofed owner_id / org_id on INSERT rejected by WITH CHECK ─────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into mos.user_views (org_id, owner_id, name, spec, scope) values (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000d2',
    'R spoofing M ownership', '{"version":1,"panels":[]}'::jsonb, 'private'
  )
$$, '42501', null, 'AC-UV-013: INSERT with spoofed owner_id (claiming M''s identity) is rejected');

select throws_ok($$
  insert into mos.user_views (org_id, owner_id, name, spec, scope) values (
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000d1',
    'R spoofing foreign org', '{"version":1,"panels":[]}'::jsonb, 'private'
  )
$$, '42501', null, 'AC-UV-013: INSERT with spoofed org_id (foreign org) is rejected');

reset role;

select * from finish();
rollback;
