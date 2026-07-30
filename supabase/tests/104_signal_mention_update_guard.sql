-- SEC-M1 (ADR-0050 D5, FR-404/407): mos.signal_mentions rows are IMMUTABLE except `revoked_at`.
-- The table carries an UPDATE grant whose only sanctioned use is revoking a mention; the author-scoped
-- UPDATE policy alone does not constrain WHICH columns move, so a database trigger owns that rule.
-- Invariant under test: an UPDATE that changes any column other than `revoked_at` is rejected with
-- 42501, and the revoke itself still succeeds. Re-pointing a mention is done by revoking it and
-- inserting a new one, so the capability checks that gate a mention at INSERT time (notably
-- `signal.mention_bu` for a @BU mention) cannot be sidestepped by editing a row after the fact.
-- Fixture: 20260716000006_mos_signal_test_seed.sql (Author ...0d1 -> OwnTeam ...5b01, BU Unit-1 ...00a2,
-- second BU Unit-2 ...00a3, Peer ...0d4).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- Arrange: a `member` principal posts a Signal for their own Team and mentions one person. Both
-- actions are within a member's rights, so the row below is a legitimately authored mention.
insert into mos.signals (id, owning_team_id, occurred_at, body)
values ('d0000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000005b01', now(), 'guard fixture');
insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
values ('d2000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-0000000000a1',
        'd0000000-0000-0000-0000-000000000040','person','00000000-0000-0000-0000-0000000000d4');

-- Changing mention_kind/target on an own-authored row must be rejected. The row-level policy and the
-- one_target constraint are both satisfied by this statement, so the column guard is what enforces it.
select throws_ok($$
  update mos.signal_mentions
     set mention_kind = 'bu', target_person_id = null,
         target_bu_id = '00000000-0000-0000-0000-0000000000a3'
   where id = 'd2000000-0000-0000-0000-000000000010'
$$, '42501', null, 'SEC-M1: mention_kind/target_bu_id are immutable under the author UPDATE grant');

select is((select mention_kind from mos.signal_mentions where id='d2000000-0000-0000-0000-000000000010'),
  'person', 'SEC-M1: a rejected UPDATE leaves mention_kind untouched');
select is((select target_bu_id from mos.signal_mentions where id='d2000000-0000-0000-0000-000000000010'),
  null::uuid, 'SEC-M1: a rejected UPDATE leaves target_bu_id unset');

-- Same rule for a same-kind edit: the target is immutable too, not just the kind.
select throws_ok($$
  update mos.signal_mentions
     set target_person_id = '00000000-0000-0000-0000-0000000000d7'
   where id = 'd2000000-0000-0000-0000-000000000010'
$$, '42501', null, 'SEC-M1: target_person_id is immutable under the author UPDATE grant');

-- The one sanctioned UPDATE — setting revoked_at — must still work.
select lives_ok($$
  update mos.signal_mentions set revoked_at = now()
   where id = 'd2000000-0000-0000-0000-000000000010'
$$, 'SEC-M1: the author can still revoke the mention');
select isnt((select revoked_at from mos.signal_mentions where id='d2000000-0000-0000-0000-000000000010'),
  null::timestamptz, 'SEC-M1: the revoke actually landed');

reset role;
select * from finish();
rollback;
