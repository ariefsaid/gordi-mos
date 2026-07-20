-- RATIFY R-OWNER-3: provisional read-vs-handled semantics; do not deploy before owner ratification.
--
-- pgTAP for the owner-gated `handled_at` prerequisite (migration 20260721000002). Proves the read-vs
-- -handled invariants encoded in mos-app/src/components/inbox/read-handled-semantics.ts against the one
-- local Supabase: handled_at is private + nullable, owner-only RLS is preserved, an UPDATE may flip
-- only read_at/handled_at (content immutable), read-but-unhandled is representable, opening marks read
-- only, explicit handle is separate, and a handled flag can be rolled back (unset).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select mos._test_seed_role_tree();

-- Role tree recap (org WU-A = ...0a1, org WU-B = ...0b1):
--   Author     ...0d1 [org A]  -- the notification owner under test
--   DirectMgr  ...0d2 [org A]  -- same-org non-owner (must NOT see Author's inbox)
--   ForeignMgr ...0b4 [org B]  -- cross-org
-- Fixed test-only notification ids: read-but-unhandled ...f101 ; triage target ...f102

-- ── Schema shape: handled_at column (nullable) + active-queue index ─────────────────────────────
select ok(
  (select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'mos' and table_name = 'notifications' and column_name = 'handled_at'),
  'R-OWNER-3: mos.notifications.handled_at exists and is nullable');

select ok(
  (select true from pg_indexes
    where schemaname = 'mos' and indexname = 'mos_notifications_owner_unhandled_idx'),
  'R-OWNER-3: active-queue fast-path index (owner_id where handled_at is null) exists');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'notifications'),
  'R-OWNER-3: owner-only RLS remains enabled and forced');

set local role authenticated;

-- ── read-but-unhandled is a valid, representable state ───────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  insert into mos.notifications (id, severity, title, body, metadata, read_at)
  values ('00000000-0000-0000-0000-00000000f101','info','Mention in a Signal',
          'You were mentioned', '{"entity":{"type":"signal","id":"s1"}}', now())
$$, 'R-OWNER-3: owner can insert a read-but-unhandled notification (read_at set, handled_at null)');

select ok(
  (select read_at is not null and handled_at is null
     from mos.notifications where id = '00000000-0000-0000-0000-00000000f101'),
  'R-OWNER-3: read-but-unhandled row is representable (seen but still in the active queue)');

-- ── Owner isolation preserved (recipient-only inbox) ─────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.notifications where id = '00000000-0000-0000-0000-00000000f101'),
  0, 'R-OWNER-3: same-org non-owner still sees zero of the owner''s inbox');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.notifications where id = '00000000-0000-0000-0000-00000000f101'),
  0, 'R-OWNER-3: cross-org caller still sees zero');

-- ── Opening marks READ only; explicit handle is a distinct state ─────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  insert into mos.notifications (id, severity, title, metadata)
  values ('00000000-0000-0000-0000-00000000f102','warning','Task assigned to you',
          '{"entity":{"type":"task","id":"t1"}}')
$$, 'R-OWNER-3: owner inserts an unread, unhandled notification');

select lives_ok($$
  update mos.notifications set read_at = now()
   where id = '00000000-0000-0000-0000-00000000f102'
$$, 'R-OWNER-3: opening marks read only (UPDATE read_at succeeds, handled_at untouched)');

select ok(
  (select read_at is not null and handled_at is null
     from mos.notifications where id = '00000000-0000-0000-0000-00000000f102'),
  'R-OWNER-3: opening did NOT silently triage (handled_at stays null)');

select lives_ok($$
  update mos.notifications set handled_at = now()
   where id = '00000000-0000-0000-0000-00000000f102'
$$, 'R-OWNER-3: explicit Mark handled (UPDATE handled_at) succeeds');

-- ── Content stays immutable: the guard permits only read_at/handled_at ───────────────────────────
select throws_ok($$
  update mos.notifications set title = 'tampered'
   where id = '00000000-0000-0000-0000-00000000f102'
$$, '42501', null,
  'R-OWNER-3: UPDATE of content (title) is still rejected — handled_at did not loosen the guard');

-- ── Handled is reversible (optimistic-update rollback / un-handle) ───────────────────────────────
select lives_ok($$
  update mos.notifications set handled_at = null
   where id = '00000000-0000-0000-0000-00000000f102'
$$, 'R-OWNER-3: a handled flag can be rolled back to null (returned to the active queue)');

reset role;

select * from finish();
rollback;
