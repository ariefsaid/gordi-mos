-- Work definition, Signal, and Process authority consume the tenant-local matrix.
--
-- The tests deliberately use a finance-only claim for an active org member in the Process start
-- journey: member is a baseline category derived from live org membership, not from access_roles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

reset role;
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id)
values ('00000000-0000-0000-0000-0000000000f7',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a2',
        'Unit-1 Head', null);
insert into shared.person_roles (org_id, person_id, role_id)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000f7');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-000000005b01', false);

create temp table authority_ids (
  signal_one uuid,
  signal_peer uuid,
  signal_cross_bu uuid,
  signal_two uuid,
  run_one uuid,
  run_two uuid
)
on commit drop;
insert into authority_ids default values;
grant select, update on authority_ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select can_post from mos.get_signal_post_authority()), true,
  'an ordinary org member can post Signals without a signal-specific access role');
select is((select can_tag from mos.get_signal_post_authority()), true,
  'an ordinary org member can tag without owning the destination Team');
select is(mos.can_start_process_for_team('00000000-0000-0000-0000-000000005b01'), true,
  'an active owning-Team member can start a Process');
select is((select workline_org from mos.get_work_write_scopes()), false,
  'an ordinary member has no org-wide definition write scope');
select is((select objective_org from mos.get_work_write_scopes()), false,
  'an ordinary member has no org-wide Objective write scope');
select is((select workline_bu_ids from mos.get_work_write_scopes()), '{}'::uuid[],
  'definition write scopes do not enumerate a BU the member does not head');
select is((select objective_bu_ids from mos.get_work_write_scopes()), '{}'::uuid[],
  'Objective write scopes do not enumerate a BU the member does not head');

-- The author tags an active same-org person and a different active same-org Team. Neither target is
-- the author's Team member, so this is the explicit any-person/any-Team control.
update authority_ids
   set signal_one = mos.create_signal_with_mentions(
     'Authority signal one',
     '00000000-0000-0000-0000-000000005b01',
     now(),
     jsonb_build_array(
       jsonb_build_object('kind','person','targetId','00000000-0000-0000-0000-0000000000d3'),
       jsonb_build_object('kind','team','targetId','00000000-0000-0000-0000-000000005b02')));
select ok((select signal_one is not null from authority_ids),
  'the member post path returns a Signal id');
select is((select count(*)::int from mos.signal_mentions
            where signal_id = (select signal_one from authority_ids)), 2,
  'the member can tag both an active person and an unrelated active Team');

reset role;
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b03',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a3',
        'Cross-BU Team', 'cross_bu_team');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is(mos.can_post_signal_for_team('00000000-0000-0000-0000-000000005b01'), true,
  'a member may post for an active same-org Team outside their own membership');
update authority_ids
   set signal_peer = mos.create_signal_with_mentions(
     'Peer-owned signal for OwnTeam',
     '00000000-0000-0000-0000-000000005b01', now(), '[]'::jsonb);
select is((select count(*)::int from mos.signals
            where id = (select signal_peer from authority_ids)), 1,
  'the author can read back a Signal posted for an unrelated same-org Team');
update authority_ids
   set signal_cross_bu = mos.create_signal_with_mentions(
     'Peer-owned signal for Cross-BU Team',
     '00000000-0000-0000-0000-000000005b03', now(), '[]'::jsonb);
select is((select count(*)::int from mos.signals
            where id = (select signal_cross_bu from authority_ids)), 1,
  'the author can post and read back for an active same-org Team in another BU');
select set_eq($$ select id from mos.teams_author_can_read_back() $$,
  array[
    '00000000-0000-0000-0000-000000005b01',
    '00000000-0000-0000-0000-000000005b02',
    '00000000-0000-0000-0000-000000005b03']::uuid[],
  'destination read-back lists every active same-org Team allowed by signal.post');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from mos.signals
            where id = (select signal_one from authority_ids)), 1,
  'the original author reads the active Signal before governance retraction');

reset role;
update shared.people set archived_at = now()
 where id = '00000000-0000-0000-0000-0000000000d3';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select throws_ok($$
  select mos.create_signal_with_mentions(
    'Archived target',
    '00000000-0000-0000-0000-000000005b01', now(),
    jsonb_build_array(jsonb_build_object('kind','person','targetId','00000000-0000-0000-0000-0000000000d3')))
$$, '42501', null,
  'an archived person cannot be tagged');
reset role;
update shared.people set archived_at = null
 where id = '00000000-0000-0000-0000-0000000000d3';

-- The precise BU-head role is a root in Unit-1. The existing Lead R role is a broad manager shape,
-- but not a BU head, and is covered by the deny below.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select throws_ok($$
  insert into mos.objectives (name, business_unit_id)
  values ('Member cannot define', '00000000-0000-0000-0000-0000000000a2')
$$, '42501', null,
  'a member cannot create a BU-scoped Objective');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select throws_ok($$
  insert into mos.work_lines (name, type, business_unit_id)
  values ('Wrong claims', 'project', '00000000-0000-0000-0000-0000000000a2')
$$, '42501', null,
  'a person claim from another org is rejected');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select is(mos.can_manage_definition('00000000-0000-0000-0000-0000000000a3'), false,
  'the default BU-head own_bu grant does not authorize a different BU');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"workline.manage","role":"bu_head","scope":"org"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select is(mos.can_manage_definition('00000000-0000-0000-0000-0000000000a3'), true,
  'an admin-saved BU-head org scope changes cross-BU definition authority');
select is((select workline_org from mos.get_work_write_scopes()), true,
  'the viewer work scope reports the saved BU-head org authority');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"workline.manage","role":"bu_head","scope":"own_bu"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select lives_ok($$
  insert into mos.objectives (name, business_unit_id)
  values ('BU-head objective', '00000000-0000-0000-0000-0000000000a2')
$$, 'the precise BU head can create an Objective in the headed BU');
select lives_ok($$
  insert into mos.work_lines (name, type, business_unit_id)
  values ('BU-head project', 'project', '00000000-0000-0000-0000-0000000000a2')
$$, 'the precise BU head can create a Project in the headed BU');
select is((select workline_bu_ids from mos.get_work_write_scopes()),
  array['00000000-0000-0000-0000-0000000000a2']::uuid[],
  'the viewer scope exposes only the BU the person precisely heads');

-- Team lead is explicit, active, and additive to the member baseline.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_team_lead_assignment(
  '00000000-0000-0000-0000-000000005b01',
  '00000000-0000-0000-0000-0000000000d2');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
update authority_ids
   set run_one = (mos.spawn_process_run(
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-000000005b01', date '2026-03-20')->>'run_id')::uuid;
select ok((select run_one is not null from authority_ids),
  'the member start RPC works without a process.start access-role claim');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select is(mos.can_close_process_run_id((select run_one from authority_ids)), true,
  'the designated owning-Team lead can close a run started by another member');
select is((select status from mos.complete_process_run((select run_one from authority_ids))), 'completed',
  'the existing complete_process_run RPC admits the designated Team lead');
select is(mos.can_close_process_run_id((select run_one from authority_ids)), false,
  'a terminal run has no close affordance');

-- The BU head is not a close authority by inheritance; only own, own_team, org are admitted for close.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
update authority_ids
   set run_two = (mos.spawn_process_run(
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-000000005b01', date '2026-03-21')->>'run_id')::uuid;
reset role;
update shared.teams
   set archived_at = now()
 where id = '00000000-0000-0000-0000-000000005b01';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is(mos.can_close_process_run_id((select run_two from authority_ids)), true,
  'the starter can still close an open run after its owning Team is archived');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is(mos.can_close_process_run_id((select run_two from authority_ids)), true,
  'an admin can still close an open run after its owning Team is archived');
reset role;
update shared.teams
   set archived_at = null
 where id = '00000000-0000-0000-0000-000000005b01';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select is(mos.can_retract_signal((select signal_one from authority_ids)), true,
  'the designated Team lead can retract an active Signal');
select throws_ok($$
  update mos.signals set body = 'forged content'
   where id = (select signal_one from authority_ids)
$$, '42501', null,
  'a non-author retract authority cannot edit Signal content');
select lives_ok($$
  update mos.signals
     set retracted_at = now(), retract_reason = 'Duplicate operational report'
   where id = (select signal_one from authority_ids)
$$, 'a designated Team lead can retract through the existing direct UPDATE path');
select ok((select retracted_at is not null from mos.signals
            where id = (select signal_one from authority_ids)),
  'retraction stores a tombstone on the original Signal');
select is((select count(*)::int from mos.signal_mentions
            where signal_id = (select signal_one from authority_ids)), 2,
  'retraction preserves the original audience mentions');
reset role;
update shared.teams
   set archived_at = now()
 where id = '00000000-0000-0000-0000-000000005b01';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from mos.signals
            where id = (select signal_one from authority_ids)), 1,
  'the original author retains read access to the Signal tombstone');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select is((select count(*)::int from mos.signals
            where id = (select signal_one from authority_ids)), 1,
  'the governance actor retains read access to the tombstone after Team archival');
reset role;
update shared.teams
   set archived_at = null
 where id = '00000000-0000-0000-0000-000000005b01';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((
  select n.metadata
    from mos.notifications n
   where n.owner_id = '00000000-0000-0000-0000-0000000000d1'
     and n.metadata ->> 'source' = 'signal_retraction'
   order by n.created_at desc
   limit 1
), jsonb_build_object(
  'source', 'signal_retraction',
  'actor', jsonb_build_object(
    'id', '00000000-0000-0000-0000-0000000000d2',
    'name', 'DirectMgr'),
  'reason', 'Duplicate operational report',
  'entity', jsonb_build_object(
    'type', 'signal',
    'id', (select signal_one from authority_ids),
    'route', '/work/signals?record=' || (select signal_one from authority_ids))
), 'retraction notifies the author with named actor, reason, and canonical Signal route');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
update authority_ids
   set signal_two = mos.create_signal_with_mentions(
     'Authority signal two',
     '00000000-0000-0000-0000-000000005b01', now(), '[]'::jsonb);
select ok((select signal_two is not null from authority_ids),
  'the member can create a second active Signal for the negative authority control');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["finance"]}';
select ok(not mos.can_retract_signal((select signal_two from authority_ids)),
  'a broad reporting-line manager is not a Signal retract authority');
select throws_ok($$
  select mos.complete_process_run((select run_two from authority_ids))
$$, '42501', null,
  'a BU/line manager without the designated Team-lead role cannot close a run');

reset role;
update shared.people
   set archived_at = now()
 where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select can_post from mos.get_signal_post_authority()), false,
  'an archived actor receives no Signal authority even when the JWT still names them');
reset role;
update shared.people
   set archived_at = null
 where id = '00000000-0000-0000-0000-0000000000d1';

select * from finish();
rollback;
