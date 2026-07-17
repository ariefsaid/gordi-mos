-- AC-414/416 (FR-406, NFR-403 / RATIFY-note): the fan-out RPC delivers exactly one notification per
-- deduplicated recipient and never crosses org; and a signal's comments are readable only to readers of
-- the parent Signal. Fixture: 20260716000006_mos_signal_test_seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- ── AC-414: dedup fan-out ─────────────────────────────────────────────────────────────────────
-- Signal (author ...0d1, OwnTeam) mentions SiblingTeam (@Team → Peer ...0d4) AND Peer directly
-- (@Person → Peer) — the two paths overlap on Peer, so dedup must deliver Peer exactly one notification.
insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body) values
  ('d0000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01', now(), 'fan-out signal @Cahya @SiblingTeam');
insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_team_id) values
  ('00000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000060','team','00000000-0000-0000-0000-000000005b02');
insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_person_id) values
  ('00000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000060','person','00000000-0000-0000-0000-0000000000d4');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(mos.fan_out_signal_mention('d0000000-0000-0000-0000-000000000060'),
  1, 'AC-414: overlapping @Team + @Person mentions deduplicate to 1 delivered recipient');

-- Peer (the mentionee) receives exactly one notification.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.notifications where title='You were mentioned in a Signal'),
  1, 'AC-414: the deduplicated recipient sees exactly one notification');

-- No org-B owner is ever notified (NFR-403: fan-out is org-walled).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from mos.notifications where title='You were mentioned in a Signal'),
  0, 'AC-414: no notification crosses org (org wall holds)');

-- ── AC-416: signal comments are readable only to Signal readers ─────────────────────────────────
-- A separate Signal with NO mention to Peer, so Peer is a genuine non-reader (SiblingTeam member, no
-- role, no mention). Author (a reader) posts a comment on it (seeded as postgres to bypass the insert
-- policy's own gate — the assertion under test is the READ gate).
reset role;
insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body) values
  ('d0000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01', now(), 'commented signal');
insert into mos.comments (id, org_id, author_id, entity_type, entity_id, body) values
  ('d4000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','signal','d0000000-0000-0000-0000-000000000061','a comment on the signal');

set local role authenticated;
-- Author (owning-Team member ⇒ reader) SEES the comment.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.comments where entity_type='signal' and entity_id='d0000000-0000-0000-0000-000000000061'),
  1, 'AC-416: a reader of the parent Signal can read its comments');
-- Peer (same org, non-reader of this Signal) sees ZERO comments.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.comments where entity_type='signal' and entity_id='d0000000-0000-0000-0000-000000000061'),
  0, 'AC-416: a non-reader of the parent Signal sees ZERO of its comments (read gated)');

reset role;
select * from finish();
rollback;
