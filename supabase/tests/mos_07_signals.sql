-- mos, squashed baseline — Signals: a default-deny read gate, an author-owned record, and fan-out.
--
-- The read gate is the crux and it is DEFAULT-DENY: a Signal is not org-readable, and a same-org
-- member reaches one only through an explicit rule. Five rules, all asserted here:
--   R1  an active member of the owning Team
--   R2  a holder of a role scoped to the owning Team's parent business unit
--   R3  a holder of a role in a BU whose visibility rank is STRICTLY higher (inert by default:
--       every rank starts NULL, read as 0, so nothing outranks anything until an admin says so)
--   R4  an explicit, unrevoked mention reaching the caller
--   R5  the signal.read_all override — deliberately UNREGISTERED, so it grants nothing today
--
-- FIXTURE DEVIATION, stated at the point of use: mos._test_seed_signal_tree strips Peer's role
-- assignments. The shared directory gives Peer the Staff R role, whose BU is Unit-1 — the owning
-- BU — so R2 alone would grant her every Unit-1 Signal and "a sibling-Team member with no BU role
-- sees nothing" would be unprovable. Stripping the roles models exactly the persona the default-deny
-- assertions are about. It shapes the fixture; it changes no policy.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();
--   Site ...5a01 · OwnTeam ...5b01 (BU Unit-1) · SiblingTeam ...5b02 (same BU, no Site)
--   Author ...0d1 -> OwnTeam · Peer ...0d4 -> SiblingTeam, no roles
--   BU ranks: Unit-1 ...00a2 = 0 · Unit-2 ...00a3 = 2

insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body, attention) values
  ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01',
   now(), 'The grinder is jammed again', 'Needs attention');

set local role authenticated;

-- ── The five read rules ──────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.signals), 1, 'R1: an active member of the owning Team reads the Signal');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is((select count(*)::int from mos.signals), 1,
  'R2: a holder of a role scoped to the owning Team''s business unit reads it, without being on that Team');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is((select count(*)::int from mos.signals), 1,
  'R3: a role in a BU with a strictly higher visibility rank reads it — the upward-reach layer');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals), 0,
  'DEFAULT DENY: a sibling-Team member with no BU-scoped role reads ZERO — Team membership alone does not reach across Teams');

-- R4: an explicit mention opens it, and revoking closes it again. Both halves matter — a revocation
-- that leaves the read open is a mention that can never be taken back.
reset role;
insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000007001','person','00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals), 1, 'R4: an explicit @Person mention grants the read');

reset role;
update mos.signal_mentions set revoked_at = now() where id = '00000000-0000-0000-0000-000000007002';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals), 0, 'R4: a REVOKED mention closes it again');

-- R5 is registered nowhere, so even an admin holds it not at all — the override is inert by
-- construction rather than by anyone remembering not to grant it.
select is(
  (select count(*)::int from shared.role_capabilities where capability = 'signal.read_all'),
  0, 'R5: signal.read_all is unregistered for every role, so the override grants nothing today');

-- ── Posting ──────────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  insert into mos.signals (owning_team_id, occurred_at, body)
  values ('00000000-0000-0000-0000-000000005b01', now(), 'Second signal')
$$, 'a member of the owning Team holding signal.create may post');

-- Peer is on SiblingTeam and holds no signal.create_for_team, so she may not post for OwnTeam.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  insert into mos.signals (owning_team_id, occurred_at, body)
  values ('00000000-0000-0000-0000-000000005b01', now(), 'Posted for a Team I am not on')
$$, '42501', null,
  'a member cannot post FOR a Team they are not on — that needs the signal.create_for_team capability');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into mos.signals (author_id, owning_team_id, occurred_at, body)
  values ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000005b01', now(), 'Forged author')
$$, '42501', null, 'a Signal cannot be posted in another person''s name');
select throws_ok($$
  insert into mos.signals (owning_team_id, occurred_at, body, source)
  values ('00000000-0000-0000-0000-000000005b01', now(), 'Machine-claimed', 'rule')
$$, '42501', null,
  'source must be ''human'' on an app-written Signal — the other two values exist for producers that do not exist yet');

-- ── Immutability and the author-only content rule ────────────────────────────────────────────
select throws_ok($$
  update mos.signals set owning_team_id = '00000000-0000-0000-0000-000000005b02'
  where id = '00000000-0000-0000-0000-000000007001'
$$, '42501', null,
  'the owning Team is immutable — moving it would silently re-point the entire read gate');
select throws_ok($$
  update mos.signals set author_id = '00000000-0000-0000-0000-0000000000d2'
  where id = '00000000-0000-0000-0000-000000007001'
$$, '42501', null, 'the author is immutable');

-- A signal.retract holder who is not the author is admitted by the UPDATE policy's USING clause —
-- it has to be, or nobody could retract someone else's Signal — and is then stopped by the guard.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select throws_ok($$
  update mos.signals set body = 'Rewritten by a retract holder'
  where id = '00000000-0000-0000-0000-000000007001'
$$, '42501', null,
  'content is AUTHOR-ONLY: a signal.retract holder passes the policy and is refused by the guard — retract is not edit');
select throws_ok($$
  update mos.signals set retracted_at = now() where id = '00000000-0000-0000-0000-000000007001'
$$, '23514', null, 'a retraction without a reason is refused — a withdrawn statement needs to say why');
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Duplicate of an earlier report'
  where id = '00000000-0000-0000-0000-000000007001'
$$, 'a signal.retract holder CAN retract another author''s Signal, with a reason');

-- Retraction is soft, and there is no delete path at all.
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007001'), 1,
  'a retracted Signal still exists — retraction is soft, so the record of what was said survives');
select ok(not has_table_privilege('authenticated','mos.signals','DELETE'),
  'no DELETE privilege on mos.signals for any session');

-- ── The edit history writes itself, and cannot be written by hand ────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update mos.signals set body = 'The grinder is jammed, third time this week'
 where id = '00000000-0000-0000-0000-000000007001';
select is(
  (select count(*)::int from mos.signal_revisions
    where signal_id = '00000000-0000-0000-0000-000000007001' and field = 'body'),
  1, 'an author''s content edit appends a revision row automatically');
select isnt((select edited_at from mos.signals where id = '00000000-0000-0000-0000-000000007001'), null,
  '...and stamps edited_at, so a reader can see the statement changed after they read it');
select ok(not has_table_privilege('authenticated','mos.signal_revisions','INSERT'),
  'the history cannot be written by hand — no INSERT privilege, so only the definer guard appends to it');

-- ── Mentions are immutable except revoked_at ─────────────────────────────────────────────────
-- Re-targeting a mention would bypass the checks applied at INSERT: a @BU mention needs
-- signal.mention_bu, and read rule R4 then grants every role-holder in that BU a read.
select throws_ok($$
  update mos.signal_mentions set target_person_id = '00000000-0000-0000-0000-0000000000d5'
  where id = '00000000-0000-0000-0000-000000007002'
$$, '42501', null,
  'a mention cannot be re-targeted after insert — re-targeting means revoking and inserting, which re-runs the capability and org checks');
select lives_ok($$
  update mos.signal_mentions set revoked_at = null where id = '00000000-0000-0000-0000-000000007002'
$$, 'revoked_at IS movable — revoking, and un-revoking, is a real author-owned action');
select throws_ok($$
  insert into mos.signal_mentions (signal_id, mention_kind, target_person_id)
  values ('00000000-0000-0000-0000-000000007001','person','00000000-0000-0000-0000-0000000000b4')
$$, '42501', null, 'a mention target from another org is refused at the policy, not only inside the RPC');
select throws_ok($$
  insert into mos.signal_mentions (signal_id, mention_kind, target_bu_id)
  values ('00000000-0000-0000-0000-000000007001','bu','00000000-0000-0000-0000-0000000000a3')
$$, '42501', null,
  'a @BU mention needs signal.mention_bu — it reaches every role-holder in that BU, so a plain member cannot cast one');

-- ── Fan-out: author-only, and idempotent ─────────────────────────────────────────────────────
-- Idempotency is not a nicety: fan-out is synchronous, so a retry or a double-tap on a slow network
-- would otherwise deliver the same mention twice.
select is(mos.fan_out_signal_mention('00000000-0000-0000-0000-000000007001'), 1,
  'fan-out delivers one notification to the mentioned person');
select is(mos.fan_out_signal_mention('00000000-0000-0000-0000-000000007001'), 0,
  'fan-out run twice delivers ZERO the second time — a retry cannot flood an inbox');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select throws_ok($$ select mos.fan_out_signal_mention('00000000-0000-0000-0000-000000007001') $$,
  '42501', null, 'only the AUTHOR may fan out their Signal');

-- ── The transactional post path ──────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select isnt(
  mos.create_signal_with_mentions('Posted atomically', '00000000-0000-0000-0000-000000005b01', now(),
    '[{"kind":"person","targetId":"00000000-0000-0000-0000-0000000000d4"}]'::jsonb),
  null, 'the transactional post path returns the new Signal id — signal, mentions and fan-out in one statement');
select throws_ok($$
  select mos.create_signal_with_mentions('Cross-org mention', '00000000-0000-0000-0000-000000005b01', now(),
    '[{"kind":"person","targetId":"00000000-0000-0000-0000-0000000000b4"}]'::jsonb)
$$, '42501', null,
  'a cross-org mention target is rejected BEFORE anything is written — so a failed post leaves no orphan Signal behind');

reset role;
select * from finish();
rollback;
