-- AC-408/409/410 (FR-404/407, NFR-401): the write gates. Owning Team must be one the author belongs to
-- (absent signal.create_for_team); a @BU mention needs signal.mention_bu; and no caller may DELETE any
-- Signal table (soft-retract only). Fixture: 20260716000006_mos_signal_test_seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

set local role authenticated;

-- AC-408 (deny): Author (...0d1, member ⇒ signal.create) is NOT a SiblingTeam member and lacks
-- signal.create_for_team ⇒ posting with owning_team_id = SiblingTeam violates the insert WITH CHECK.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into mos.signals (id, owning_team_id, occurred_at, body)
  values ('d0000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000005b02', now(), 'sibling post')
$$, '42501', null, 'AC-408: posting for a Team the author is not a member of is denied');

-- AC-408 (allow): posting for OwnTeam (an active membership Team) succeeds.
select lives_ok($$
  insert into mos.signals (id, owning_team_id, occurred_at, body)
  values ('d0000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000005b01', now(), 'own-team post')
$$, 'AC-408: posting for the author''s own Team succeeds');

-- AC-409 (deny): Author without signal.mention_bu cannot add a @BU mention.
select throws_ok($$
  insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_bu_id)
  values ('00000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000030','bu',
          '00000000-0000-0000-0000-0000000000a2')
$$, '42501', null, 'AC-409: a @BU mention without signal.mention_bu is denied');

-- AC-409 (allow): the same author acting with an admin access-role (which holds signal.mention_bu) succeeds.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_bu_id)
  values ('00000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000030','bu',
          '00000000-0000-0000-0000-0000000000a2')
$$, 'AC-409: a @BU mention with signal.mention_bu succeeds');

-- AC-410: no DELETE grant on any Signal table ⇒ delete is denied (42501 insufficient_privilege).
select throws_ok($$delete from mos.signals$$,                 '42501', null, 'AC-410: DELETE on mos.signals denied');
select throws_ok($$delete from mos.signal_mentions$$,         '42501', null, 'AC-410: DELETE on mos.signal_mentions denied');
select throws_ok($$delete from mos.signal_acknowledgements$$, '42501', null, 'AC-410: DELETE on mos.signal_acknowledgements denied');
select throws_ok($$delete from mos.signal_revisions$$,        '42501', null, 'AC-410: DELETE on mos.signal_revisions denied');
select throws_ok($$delete from mos.signal_tasks$$,            '42501', null, 'AC-410: DELETE on mos.signal_tasks denied');

reset role;
select * from finish();
rollback;
