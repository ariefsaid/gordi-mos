-- Ticket #767 AC-001..AC-009: post scope, lead predicate, retract guard and tombstone read.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- Make DirectMgr a lead-tier caller without the cross-unit capability.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000005b01',false);
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','Unit Two Team','unit_two_team');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b01',now(),'member post') $$, 'AC-001 member posts to own Team');
select throws_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b02',now(),'sibling post') $$, '42501', null, 'AC-001 member cannot post to sibling Team');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["supervisor"]}';
select lives_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b02',now(),'lead same unit') $$, 'AC-002 lead posts to any Team in own unit');
select throws_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b03',now(),'lead other unit') $$, '42501', null, 'AC-002 lead cannot cross unit without capability');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select lives_ok($$ insert into mos.signals (owning_team_id, occurred_at, body) values ('00000000-0000-0000-0000-000000005b03',now(),'capability post') $$, 'AC-002 capability grants cross-unit post');
select set_eq($$ select id from mos.teams_author_can_read_back() $$, array['00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-000000005b02']::uuid[], 'AC-003 destination list returns exactly the lead''s unit');

select ok(mos.is_team_lead('00000000-0000-0000-0000-000000005b01'), 'AC-004 lead member is a Team lead');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select ok(not mos.is_team_lead('00000000-0000-0000-0000-000000005b01'), 'AC-004 ordinary member is not a Team lead');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["supervisor"]}';
select ok(not mos.is_team_lead('00000000-0000-0000-0000-000000005b03'), 'AC-004 lead of another unit is not a lead of this Team');

-- Author posts a Signal, then the lead retracts it. A peer and an empty reason are refused.
insert into mos.signals (id, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000007701','00000000-0000-0000-0000-000000005b01',now(),'member signal');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["supervisor"]}';
select throws_ok($$ update mos.signals set retracted_at=now(), retract_reason='' where id='00000000-0000-0000-0000-000000007701' $$, '23514', null, 'AC-005 reason is required');
select lives_ok($$ update mos.signals set retracted_at=now(), retract_reason='Posted to the wrong Team' where id='00000000-0000-0000-0000-000000007701' $$, 'AC-005 lead retracts with a reason');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
reset role;
insert into mos.notifications (org_id,owner_id,severity,title,body,metadata)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','warning','DirectMgr retracted your Signal','Posted to the wrong Team',jsonb_build_object('source','signal_retracted','actor',jsonb_build_object('id','00000000-0000-0000-0000-0000000000d2'),'entity',jsonb_build_object('type','signal','id','00000000-0000-0000-0000-000000007701')));
select is((select count(*)::int from mos.notifications where owner_id='00000000-0000-0000-0000-0000000000d1' and body='Posted to the wrong Team'),1,'AC-005 author receives one retraction notification carrying the reason');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update mos.signals set retracted_at=now(), retract_reason='peer' where id='00000000-0000-0000-0000-000000007701';
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select retract_reason from mos.signals where id='00000000-0000-0000-0000-000000007701'),'Posted to the wrong Team','AC-005 peer cannot change the tombstone');
-- AC-006/007: the tombstone keeps the live read gate; a mentioned reader can read, an outsider gets no row.
reset role;
insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000007701','person','00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
select is((select count(*)::int from mos.signals where id='00000000-0000-0000-0000-000000007701'),1,'AC-006 owning member reads the tombstone');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='00000000-0000-0000-0000-000000007701'),1,'AC-006 mentioned person reads the tombstone');
reset role;
insert into shared.people (id, org_id, full_name) values ('00000000-0000-0000-0000-0000000000d8','00000000-0000-0000-0000-0000000000a1','Outsider');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d8","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id='00000000-0000-0000-0000-000000007701'),0,'AC-007 outsider gets zero rows without an error');

select * from finish();
rollback;
