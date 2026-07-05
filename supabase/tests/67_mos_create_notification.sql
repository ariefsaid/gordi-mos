-- mos.create_notification (SECURITY DEFINER cross-owner @mention delivery) — ADR-0044 §5 / D4.
-- AC-P3-CM-005: an author in org A mentioning a same-org person delivers a notification visible to
--   that mentionee (and only them); a cross-org target raises (org wall holds).
-- AC-P3-NF-001: the delivered row is owned by the target, not the author.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select mos._test_seed_role_tree();

-- Author ...0d1 (org A) mentions DirectMgr ...0d2 (org A). ForeignMgr ...0b4 (org B) is unreachable.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- ── AC-P3-CM-005: same-org mention delivers ──────────────────────────────────────────────────
select lives_ok($$
  select mos.create_notification(
    '00000000-0000-0000-0000-0000000000d2', 'info', 'You were mentioned',
    'Dewi mentioned you on a task', '{"entity":{"type":"task","id":"t9","route":"/tasks/t9"}}')
$$, 'AC-P3-CM-005: same-org author→target mention delivers via the definer helper');

-- The author (d1) does NOT see the row they delivered to someone else (RLS: inbox is recipient-only).
select is(
  (select count(*)::int from mos.notifications where title = 'You were mentioned'),
  0, 'AC-P3-NF-001: author does not see the notification they delivered to another owner');

-- ── AC-P3-CM-005: the mentionee sees it, and it is owned by THEM (not the author) ──────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.notifications where title = 'You were mentioned'),
  1, 'AC-P3-CM-005: the mentionee sees the delivered notification');

select is(
  (select owner_id from mos.notifications where title = 'You were mentioned'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'AC-P3-NF-001: the delivered row is owned by the mentionee, not the author');

-- ── AC-P3-CM-005: cross-org target is denied (org wall) ───────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  select mos.create_notification(
    '00000000-0000-0000-0000-0000000000b4', 'info', 'Cross-org attempt', null, '{}')
$$, '42501', null,
  'AC-P3-CM-005: mentioning a cross-org person raises (org wall)');

select * from finish();
rollback;
