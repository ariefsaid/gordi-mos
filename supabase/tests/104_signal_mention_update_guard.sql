-- SEC-M1 (ADR-0050 D5, FR-404/407): mos.signal_mentions carries an UPDATE grant whose only sanctioned
-- use is revoking a mention. Without a guard the author-scoped UPDATE policy lets a plain `member`
-- (who holds signal.create but NOT signal.mention_bu) PATCH their own person-mention row into a @BU
-- mention — re-opening exactly the broadcast reach signal.mention_bu exists to gate, because
-- mos.can_read_signal R4 grants read to every holder of a role in the mentioned BU. The guard must
-- reject every column change except revoked_at, and must still allow the revoke.
-- Fixture: 20260716000006_mos_signal_test_seed.sql (Author ...0d1 → OwnTeam ...5b01, BU Unit-1 ...00a2;
-- Unit-2 ...00a3 is the BU the escalation would broadcast to; Peer ...0d4).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- The member posts a Signal for their own Team and mentions one person — both within their rights.
insert into mos.signals (id, owning_team_id, occurred_at, body)
values ('d0000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000005b01', now(), 'guard fixture');
insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
values ('d2000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-0000000000a1',
        'd0000000-0000-0000-0000-000000000040','person','00000000-0000-0000-0000-0000000000d4');

-- THE ATTACK: PATCH the own-authored mention row into a @BU mention. USING (author) and WITH CHECK
-- (org) both pass and signal_mentions_one_target is satisfied, so only the guard can stop it.
select throws_ok($$
  update mos.signal_mentions
     set mention_kind = 'bu', target_person_id = null,
         target_bu_id = '00000000-0000-0000-0000-0000000000a3'
   where id = 'd2000000-0000-0000-0000-000000000010'
$$, '42501', null, 'SEC-M1: a member cannot PATCH their own mention into a @BU broadcast');

select is((select mention_kind from mos.signal_mentions where id='d2000000-0000-0000-0000-000000000010'),
  'person', 'SEC-M1: the rejected escalation leaves mention_kind untouched');
select is((select target_bu_id from mos.signal_mentions where id='d2000000-0000-0000-0000-000000000010'),
  null::uuid, 'SEC-M1: the rejected escalation leaves target_bu_id unset');

-- Lateral variant: silently re-pointing the mention at a different person is a leak too.
select throws_ok($$
  update mos.signal_mentions
     set target_person_id = '00000000-0000-0000-0000-0000000000d7'
   where id = 'd2000000-0000-0000-0000-000000000010'
$$, '42501', null, 'SEC-M1: a member cannot re-target their own mention at another person');

-- The sanctioned use the UPDATE grant exists for still works.
select lives_ok($$
  update mos.signal_mentions set revoked_at = now()
   where id = 'd2000000-0000-0000-0000-000000000010'
$$, 'SEC-M1: the author can still revoke the mention');
select isnt((select revoked_at from mos.signal_mentions where id='d2000000-0000-0000-0000-000000000010'),
  null::timestamptz, 'SEC-M1: the revoke actually landed');

reset role;
select * from finish();
rollback;
