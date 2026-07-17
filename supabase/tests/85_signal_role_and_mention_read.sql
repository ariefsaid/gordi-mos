-- AC-404/406 (FR-405/406, D31): a BU-scoped Role over the owning BU reads the Signal (R2), and an
-- explicit unrevoked mention (person OR team) grants read (R4) that disappears the moment it is revoked.
-- Fixture: 20260716000006_mos_signal_test_seed.sql. Signal owned by OwnTeam (BU Unit-1, ...00a2).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body) values
  ('d0000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01', now(), 'role+mention signal');

set local role authenticated;

-- AC-404: DirectMgr (...0d2) holds Lead R in Unit-1 (the owning BU) ⇒ R2 ⇒ visible.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000020'),
  1, 'AC-404: BU-scoped Role holder over the owning BU sees the Signal (R2)');

-- AC-406 (person mention, grant): mention Peer (...0d4) directly. Setup inserts run as postgres.
reset role;
insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id) values
  ('d2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1',
   'd0000000-0000-0000-0000-000000000020','person','00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000020'),
  1, 'AC-406: an unrevoked @Person mention grants read (R4)');

-- AC-406 (person mention, revoke): revoking it removes the only grant Peer had ⇒ deny.
reset role;
update mos.signal_mentions set revoked_at = now() where id='d2000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000020'),
  0, 'AC-406: revoking the @Person mention removes read (default-deny again)');

-- AC-406 (team mention, grant): mention SiblingTeam — Peer is an active member ⇒ R4 via team.
reset role;
insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_team_id) values
  ('d2000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1',
   'd0000000-0000-0000-0000-000000000020','team','00000000-0000-0000-0000-000000005b02');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000020'),
  1, 'AC-406: an unrevoked @Team mention grants read to active members (R4)');

-- AC-406 (team mention, revoke): revoke it ⇒ Peer loses read again.
reset role;
update mos.signal_mentions set revoked_at = now() where id='d2000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000020'),
  0, 'AC-406: revoking the @Team mention removes read');

reset role;
select * from finish();
rollback;
