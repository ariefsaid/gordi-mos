-- CQ IMPORTANT-1 + SECURITY LOW-1/LOW-2 (Step-4 review): mos.create_signal_with_mentions is the ONE
-- transactional post path (signal + mentions + fan-out in a single statement), so a failure after the
-- insert can never leave a committed Signal a retry would double-post. LOW-1: every mention target must
-- exist in the caller's org (rejected otherwise — enforced in the RPC AND the signal_mentions_insert
-- WITH CHECK). LOW-2: fan-out is idempotent — a recipient already notified for this Signal is skipped,
-- so repeated fan-out cannot notification-flood. Fixture: 20260716000006_mos_signal_test_seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- ── Happy path: one transactional call inserts the Signal + mention and fans out ────────────────
-- Author (...0d1, OwnTeam member) posts, @-mentioning Peer (...0d4, a same-org person).
select isnt(
  mos.create_signal_with_mentions(
    'transactional signal', '00000000-0000-0000-0000-000000005b01', now(),
    '[{"kind":"person","targetId":"00000000-0000-0000-0000-0000000000d4"}]'::jsonb),
  null, 'LOW-1: create_signal_with_mentions returns the new Signal id');

select is((select count(*)::int from mos.signals where body='transactional signal'),
  1, 'the Signal row persisted');
select is((select count(*)::int from mos.signal_mentions sm
             join mos.signals s on s.id = sm.signal_id
             where s.body='transactional signal' and sm.target_person_id='00000000-0000-0000-0000-0000000000d4'),
  1, 'the staged mention persisted in the same transaction');

-- ── LOW-2: fan-out is idempotent — Peer has exactly one notification, and a repeat call adds none ─
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d4'
             and title='You were mentioned in a Signal'),
  1, 'LOW-2: the mentioned recipient has exactly one notification after the initial post');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(mos.fan_out_signal_mention((select id from mos.signals where body='transactional signal')),
  0, 'LOW-2: re-invoking fan-out delivers zero new notifications (idempotent)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d4'
             and title='You were mentioned in a Signal'),
  1, 'LOW-2: the recipient still has exactly one notification (no flood on repeat)');

-- ── LOW-1 + atomicity: a mention target outside the caller''s org is rejected and nothing persists ─
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  select mos.create_signal_with_mentions(
    'bad-target signal', '00000000-0000-0000-0000-000000005b01', now(),
    '[{"kind":"person","targetId":"00000000-0000-0000-0000-0000000000b4"}]'::jsonb)
$$, '42501', null, 'LOW-1: a mention target outside the caller''s org is rejected');
select is((select count(*)::int from mos.signals where body='bad-target signal'),
  0, 'CQ-IMPORTANT-1 atomicity: the rejected post leaves NO committed Signal row');

reset role;
select * from finish();
rollback;
