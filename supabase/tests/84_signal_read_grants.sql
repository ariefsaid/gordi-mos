-- AC-402/403/405/407 (FR-405 / NFR-402): the default-deny read gate — R1 owning-Team member sees it,
-- a same-BU sibling with no grant sees zero, a strictly-higher BU visibility rank (R3) sees it (and
-- loses it when the rank advantage is removed), and a cross-org viewer sees zero.
-- Fixture: 20260716000006_mos_signal_test_seed.sql. Owning Team OwnTeam ⇒ BU Unit-1 (...00a2, rank 0);
-- Unit-2 (...00a3) rank 2.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- Signal owned by OwnTeam, authored by Author ...0d1 (seeded as postgres → RLS bypassed).
insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body) values
  ('d0000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01', now(), 'OwnTeam signal');

set local role authenticated;

-- AC-402: Author (...0d1) is an active OwnTeam member ⇒ R1 ⇒ visible.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000010'),
  1, 'AC-402: owning-Team member sees the Signal (R1)');

-- AC-403: Peer (...0d4) is in SiblingTeam (same BU Unit-1), has no BU-scoped role and no mention ⇒ deny.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000010'),
  0, 'AC-403: same-BU sibling-Team member with no grant sees ZERO (default-deny)');

-- AC-405 (grant): Lead2Holder (...0d7) holds Lead 2 in Unit-2 (rank 2) > owning Unit-1 (rank 0) ⇒ R3 ⇒ visible.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000010'),
  1, 'AC-405: strictly-higher BU visibility rank sees the Signal (R3)');

-- AC-405 (revoke): drop Unit-2 to rank 0 (equal to owning) — the rank advantage is gone ⇒ deny.
reset role;
update shared.business_units set signal_visibility_rank = 0 where id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000010'),
  0, 'AC-405: equal BU visibility rank with no other grant sees ZERO');

-- AC-407: ForeignMgr (...0b4) is in org-B ⇒ org wall ⇒ zero.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='d0000000-0000-0000-0000-000000000010'),
  0, 'AC-407: cross-org viewer sees ZERO (org isolation)');

reset role;
select * from finish();
rollback;
