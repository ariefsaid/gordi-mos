-- mos.notifications RLS + mark-read-only guard (ADR-0044 §5 analog / ADR-0019 D9 Inbox).
-- Adapted from the sibling internal project's notifications pgTAP; MOS deltas: mos schema, owner_id
-- (person, no profiles), org-gate on every branch, no cross-owner read, cross-owner delivery only via
-- the SECURITY DEFINER mos.create_notification helper (tested separately in 67).
-- AC-P3-NF-001: owner isolation + cross-org denial; INSERT re-pins owner_id/org_id; a caller cannot
--   INSERT a notification addressed to another owner (direct cross-owner INSERT denied at RLS).
-- AC-P3-NF-002: an UPDATE touching any column other than read_at is rejected (42501) — even by owner.
-- AC-P3-NF-004: the unread fast-path index exists (owner_id where read_at is null).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select mos._test_seed_role_tree();

-- Role tree recap (org WU-A = ...0a1, org WU-B = ...0b1):
--   Author     ...0d1 [Staff R, org A]  -- the notification owner under test
--   DirectMgr  ...0d2 [Lead R,  org A]  -- same-org non-owner (must NOT see Author's inbox)
--   ForeignMgr ...0b4 [B-Lead,  org B]  -- cross-org
-- Fixed test-only notification id: ...f001

set local role authenticated;

-- ── AC-P3-NF-004: unread fast-path index exists ──────────────────────────────────────────────
select ok(
  (select true from pg_indexes
    where schemaname = 'mos' and indexname = 'mos_notifications_owner_unread_idx'),
  'AC-P3-NF-004: unread fast-path index (owner_id where read_at is null) exists');

-- ── AC-P3-NF-001: RLS shape ──────────────────────────────────────────────────────────────────
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'notifications'),
  'AC-P3-NF-001: mos.notifications has RLS enabled and forced');

select ok(
  (select with_check is not null from pg_policies
    where schemaname = 'mos' and tablename = 'notifications' and policyname = 'notifications_insert'),
  'AC-P3-NF-001: notifications INSERT policy carries a WITH CHECK');

-- ── AC-P3-NF-001: owner inserts own (org_id/owner_id stamped from JWT), then isolation ─────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok($$
  insert into mos.notifications (id, severity, title, body, metadata)
  values ('00000000-0000-0000-0000-00000000f001','info','Task assigned to you',
          'Replace grinder burrs', '{"entity":{"type":"task","id":"t1","route":"/tasks/t1"}}')
$$, 'AC-P3-NF-001: owner INSERT without org_id/owner_id succeeds (stamped from JWT)');

select is(
  (select count(*)::int from mos.notifications where id = '00000000-0000-0000-0000-00000000f001'),
  1, 'AC-P3-NF-001: owner sees their own notification');

-- Same-org non-owner (DirectMgr) must see zero.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.notifications where id = '00000000-0000-0000-0000-00000000f001'),
  0, 'AC-P3-NF-001: same-org NON-owner sees zero (inbox is recipient-only)');

-- Cross-org (ForeignMgr, org B) must see zero.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.notifications where id = '00000000-0000-0000-0000-00000000f001'),
  0, 'AC-P3-NF-001: cross-org caller sees zero');

-- ── AC-P3-NF-001: a caller cannot INSERT a notification addressed to ANOTHER owner ─────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into mos.notifications (owner_id, severity, title)
  values ('00000000-0000-0000-0000-0000000000d2','info','Forged cross-owner')
$$, '42501', null,
  'AC-P3-NF-001: direct cross-owner INSERT (owner_id = another person) denied by RLS');

-- ── AC-P3-NF-002: only read_at may change on UPDATE ────────────────────────────────────────────
select lives_ok($$
  update mos.notifications set read_at = now()
   where id = '00000000-0000-0000-0000-00000000f001'
$$, 'AC-P3-NF-002: owner UPDATE of read_at (mark read) succeeds');

select throws_ok($$
  update mos.notifications set title = 'tampered'
   where id = '00000000-0000-0000-0000-00000000f001'
$$, '42501', null,
  'AC-P3-NF-002: UPDATE of title rejected (content is immutable)');

select throws_ok($$
  update mos.notifications set severity = 'critical'
   where id = '00000000-0000-0000-0000-00000000f001'
$$, '42501', null,
  'AC-P3-NF-002: UPDATE of severity rejected');

select throws_ok($$
  update mos.notifications set metadata = '{"x":1}'
   where id = '00000000-0000-0000-0000-00000000f001'
$$, '42501', null,
  'AC-P3-NF-002: UPDATE of metadata rejected');

select * from finish();
rollback;
