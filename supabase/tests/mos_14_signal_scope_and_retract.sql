-- Ticket #767 AC-001..AC-009: post scope, lead predicate, retract guard and tombstone read.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);
select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- Make DirectMgr a lead-tier caller without the cross-unit capability.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000005b01',false);
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','Unit Two Team','unit_two_team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-000000005b03',false),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000005b01',false);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b01',now(),'member post') $$, 'AC-001 member posts to own Team');
select throws_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b02',now(),'sibling post') $$, '42501', null, 'AC-001 member cannot post to sibling Team');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["supervisor"]}';
select lives_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b02',now(),'lead same unit') $$, 'AC-002 lead posts to any Team in own unit');
select throws_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b03',now(),'lead other unit') $$, '42501', null, 'AC-002 lead cannot cross unit without capability');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["ops_lead"]}';
select lives_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b03',now(),'own-membership post') $$, 'AC-002 an ops_lead posts cross-unit into a Team they are a member of — own-membership arm; the pure capability arm is isolated below');
-- d2 holds Lead R (Unit-1) and a membership in 5b01 (Unit-1) — no membership or role in Unit-2 —
-- so the ONLY arm of mos.can_post_signal_for_team that could admit d2 to 5b03 (Unit-2) is
-- shared.can('signal.create_for_team'). Cross-references the refusal above where the same actor
-- holds only ["supervisor"] (no signal.create_for_team) and is denied.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select lives_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b03',now(),'capability-only post') $$, 'AC-002 a signal.create_for_team holder who is neither a member nor a lead of the target Team posts cross-unit — capability arm alone; refused counterpart is the preceding "lead cannot cross unit without capability"');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["supervisor"]}';
select set_eq($$ select id from mos.teams_author_can_read_back() $$, array['00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-000000005b02']::uuid[], 'AC-003 destination list returns exactly the lead''s unit');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["supervisor"]}';
select ok(mos.is_team_lead('00000000-0000-0000-0000-000000005b01'), 'AC-004 lead member is a Team lead');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["manager"]}';
select ok(mos.is_team_lead('00000000-0000-0000-0000-000000005b01'), 'AC-004 unit head above Unit-1 is a lead');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select ok(not mos.is_team_lead('00000000-0000-0000-0000-000000005b01'), 'AC-004 ordinary member is not a Team lead');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["supervisor"]}';
select ok(not mos.is_team_lead('00000000-0000-0000-0000-000000005b03'), 'AC-004 lead of another unit is not a lead of this Team');

-- Author posts a Signal, then the lead retracts it. A peer and an empty reason are refused.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into mos.signals (id, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000007701','00000000-0000-0000-0000-000000005b01',now(),'member signal');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["supervisor"]}';
select throws_ok($$ update mos.signals set retracted_at=now(), retract_reason='' where id='00000000-0000-0000-0000-000000007701' $$, '23514', null, 'AC-005 reason is required');
select lives_ok($$ update mos.signals set retracted_at=now(), retract_reason='Posted to the wrong Team' where id='00000000-0000-0000-0000-000000007701' $$, 'AC-005 lead retracts with a reason');
reset role;
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d1'
    and title = 'DirectMgr retracted your Signal'
    and body = 'Posted to the wrong Team'
    and metadata->>'source' = 'signal_retracted'), 1,
  'AC-005 author receives the named retraction notification with source metadata');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$ update mos.signals set retracted_at=clock_timestamp(), retract_reason='peer' where id='00000000-0000-0000-0000-000000007701' $$, '42501', null, 'AC-005 peer retract reaches the guard and fails loudly');
select throws_ok($$ update mos.signals set retract_reason='rewritten by peer' where id='00000000-0000-0000-0000-000000007701' $$, '42501', null, 'AC-005 teammate cannot rewrite a colleague''s retract_reason');
select throws_ok($$ update mos.signals set id='00000000-0000-0000-0000-000000007702' where id='00000000-0000-0000-0000-000000007701' $$, '42501', null, 'AC-005 peer cannot change a Signal id');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$ update mos.signals set id='00000000-0000-0000-0000-000000007702' where id='00000000-0000-0000-0000-000000007701' $$, '42501', null, 'AC-005 author cannot change a Signal id');
-- AC-006/007: the tombstone keeps the live read gate; a mentioned reader can read, an outsider gets no row.
reset role;
delete from shared.team_memberships
where person_id = '00000000-0000-0000-0000-0000000000d4'
  and team_id = '00000000-0000-0000-0000-000000005b01';
insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000007701','person','00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='00000000-0000-0000-0000-000000007701'),1,'AC-006 owning member reads the tombstone');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='00000000-0000-0000-0000-000000007701'),1,'AC-006 mentioned person reads the tombstone');
reset role;
insert into shared.people (id, org_id, full_name) values ('00000000-0000-0000-0000-0000000000d8','00000000-0000-0000-0000-0000000000a1','Outsider');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d8","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='00000000-0000-0000-0000-000000007701'),0,'AC-007 outsider gets zero rows without an error');

-- AC-009: the production seed pins the three viewer lead-team shapes.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead"]}';
select set_eq($$ select t.name from mos.viewer_lead_team_ids() ids join shared.teams t on t.id = ids $$,
  array['Cikal Bar','Ecommerce Team','Gordi HQ Bar','Gordi HQ Kitchen','HQ Operations',
        'Radiant Bar','Radiant Kitchen','Radiant Operations','Rumah Rames Bar','Rumah Rames Kitchen']::text[],
  'AC-009 Cahya leads exactly her own BU Teams');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000000","access_roles":["admin"]}';
select is((select count(*)::int from mos.viewer_lead_team_ids()),
  (select count(*)::int from shared.teams where org_id = '10000000-0000-0000-0000-000000000001' and archived_at is null),
  'AC-009 Dewi leads every Team in her line');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
select is((select count(*)::int from mos.viewer_lead_team_ids()), 0, 'AC-009 Bulan leads no Team');

-- Pins AC-009's Cikal Bar arm on the production seed row that says Cahya belongs to that Team.
-- Without this, deleting `('40000000-0000-0000-0000-000000000001', 'cikal_bar', false)` from
-- supabase/seed.sql leaves the assertion above green (Cahya leads Cikal Bar via her hq_operations
-- home-team, which shares the retail_ops BU with Cikal Bar), so the seed row would drift into
-- being ornamental. Both facts must hold: the membership row AND the lead-scope entry.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead"]}';
select ok(
  exists (
    select 1
    from shared.team_memberships m
    join shared.teams t on t.id = m.team_id
    where m.person_id = '40000000-0000-0000-0000-000000000001'
      and t.org_id = '10000000-0000-0000-0000-000000000001'
      and t.code = 'cikal_bar'
      and t.archived_at is null
  )
  and exists (
    select 1
    from mos.viewer_lead_team_ids() ids
    join shared.teams t on t.id = ids
    where t.code = 'cikal_bar'
  ),
  'AC-009 Cahya''s seeded cikal_bar membership anchors her Cikal Bar lead scope — the membership row and the lead entry must both hold'
);

select * from finish();
rollback;
