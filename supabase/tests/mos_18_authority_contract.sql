-- Signal / Process / definition-work authority: the tenant-local matrix.
--
-- Ticket 867: Signals are All Teams. Posting and tagging resolve org-wide under the matrix; the
-- composer and retraction authority follow the audience. Retraction on org rows is author-or-org
-- scoped (member own + ops_lead/admin org) with NO Team join; on the retired team-audience
-- historical rows the old owning-Team/BU chain keeps holding.
--
-- The tests deliberately use a finance-only claim for an active org member in the Process start
-- journey: member is a baseline category derived from live org membership, not from access_roles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

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

-- Designate d2 as the lead of OwnTeam ...5b01, so the historical team-retraction chain is provable.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_team_lead_assignment('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-0000000000d2');
set local request.jwt.claims = '{}';
reset role;

create temp table authority_ids (
  signal_org uuid,
  signal_historical uuid,
  signal_two uuid,
  signal_attribution uuid,
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
  'an ordinary org member can tag without owning any Team');
select is((select workline_org from mos.get_work_write_scopes()), false,
  'an ordinary member has no org-wide definition write scope');
select is((select objective_org from mos.get_work_write_scopes()), false,
  'an ordinary member has no org-wide Objective write scope');
select is((select workline_bu_ids from mos.get_work_write_scopes()), '{}'::uuid[],
  'definition write scopes do not enumerate a BU the member does not head');
select is((select objective_bu_ids from mos.get_work_write_scopes()), '{}'::uuid[],
  'Objective write scopes do not enumerate a BU the member does not head');

-- The author posts an All Teams Signal tagging an unrelated active person + Team + BU — the
-- explicit any-person/any-Team/any-BU control under the org-wide signal.tag grant.
update authority_ids
   set signal_org = mos.create_signal_with_mentions(
     'Authority org signal',
     now(),
     jsonb_build_array(
       jsonb_build_object('kind','person','targetId','00000000-0000-0000-0000-0000000000d3'),
       jsonb_build_object('kind','team','targetId','00000000-0000-0000-0000-000000005b02'),
       jsonb_build_object('kind','bu','targetId','00000000-0000-0000-0000-0000000000a2')));
select ok((select signal_org is not null from authority_ids),
  'the member post path returns a Signal id');
select is((select count(*)::int from mos.signal_mentions
            where signal_id = (select signal_org from authority_ids)), 3,
  'the member can tag an active person, an unrelated Team, and a BU under signal.tag');
select is((select audience from mos.signals
            where id = (select signal_org from authority_ids)), 'org',
  'the posted Signal is an All Teams (org) row');

-- sg file editable matrix is the sole tag authority, including BU mentions: an admin deny removes
-- runtime tag authority and a BU mention is refused.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[
  {"action":"signal.tag","role":"member","scope":"none"},
  {"action":"signal.tag","role":"team_lead","scope":"none"},
  {"action":"signal.tag","role":"bu_head","scope":"none"},
  {"action":"signal.tag","role":"ops_lead","scope":"none"},
  {"action":"signal.tag","role":"finance","scope":"none"},
  {"action":"signal.tag","role":"manager","scope":"none"},
  {"action":"signal.tag","role":"supervisor","scope":"none"}
]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select can_tag from mos.get_signal_post_authority()), false,
  'an admin deny removes runtime Signal tag authority from a member who still may post');
select throws_ok($$
  select mos.create_signal_with_mentions(
    'Denied BU mention',
    now(),
    jsonb_build_array(jsonb_build_object('kind','bu','targetId','00000000-0000-0000-0000-0000000000a2')))
$$, '42501', null, 'a denied signal.tag cannot create a BU mention');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[
  {"action":"signal.tag","role":"member","scope":"org"},
  {"action":"signal.tag","role":"ops_lead","scope":"org"},
  {"action":"signal.tag","role":"admin","scope":"org"}
]'::jsonb);

reset role;
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b03',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a3',
        'Cross-BU Team', 'cross_bu_team');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update authority_ids set signal_two = mos.create_signal_with_mentions(
  'Peer org signal', now(), '[]'::jsonb);
select ok((select signal_two is not null from authority_ids),
  'any active member posts an All Teams Signal');
select is((select count(*)::int from mos.signals
            where id = (select signal_two from authority_ids)), 1,
  'a Peer can read back the org Signal they posted and every other org Signal');

-- ── Retraction matrix on All Teams (org) rows: author-or-org-scoped only ──────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select ok(mos.can_retract_signal((select signal_org from authority_ids)),
  'the author retains retraction authority over their own org Signal without a special access role');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select ok(not mos.can_retract_signal((select signal_org from authority_ids)),
  'a peer member cannot retract another author''s org Signal (own scope only)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select ok(not mos.can_retract_signal((select signal_org from authority_ids)),
  'a designated Team lead cannot retract another author''s ORG Signal — the Team chain acts on team rows only');
select ok(not mos.can_retract_signal((select signal_org from authority_ids)),
  'the owning BU head cannot retract another author''s ORG Signal — org rows are author-or-org-scoped');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select ok(mos.can_retract_signal((select signal_org from authority_ids)),
  'an ops lead can retract another author''s org Signal via the org scope');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select ok(mos.can_retract_signal((select signal_org from authority_ids)),
  'an admin can retract another author''s org Signal via the org scope');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["finance"]}';
select ok(not mos.can_retract_signal((select signal_org from authority_ids)),
  'a reporting-line manager is not an org-scoped Signal retraction authority');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select ok(not mos.can_retract_signal((select signal_org from authority_ids)),
  'a Member with no Team/BU/rank has no retraction reach on another author''s org Signal');

-- ── Retraction chain on a retired (historical) team-audience row keeps holding ────────────────
reset role;
update authority_ids
   set signal_historical = '00000000-0000-0000-0000-000000009001'::uuid;
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000009001','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1','team','00000000-0000-0000-0000-000000005b01',
        now(), 'Historical team signal');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select ok(mos.can_retract_signal((select signal_historical from authority_ids)),
  'the author retains retraction authority over their own historical team row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select ok(mos.can_retract_signal((select signal_historical from authority_ids)),
  'the designated owning-Team lead can retract a historical team row');
select ok(mos.can_retract_signal((select signal_historical from authority_ids)),
  'the owning BU head can retract a historical team row in that BU');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select ok(mos.can_retract_signal((select signal_historical from authority_ids)),
  'an ops lead can retract a historical team row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select ok(not mos.can_retract_signal((select signal_historical from authority_ids)),
  'a sibling member with no rule cannot retract a historical team row');

-- ── Process start/close authority (unchanged surface) ────────────────────────────────────────
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

-- ── Definition writes: precise BU head, org scope still agrees with the matrix ───────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"workline.manage","role":"bu_head","scope":"org"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select is(mos.can_manage_definition('00000000-0000-0000-0000-0000000000a3'), true,
  'an admin-saved BU-head org scope changes cross-BU definition authority');
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

-- ── Retraction draws the tombstone + attribution and freezes it ──────────────────────────────
reset role;
update shared.teams set archived_at = null where id = '00000000-0000-0000-0000-000000005b01';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select ok(mos.can_retract_signal((select signal_historical from authority_ids)),
  'the historical chain remains after Team re-activation');
select lives_ok($$
  update mos.signals
     set retracted_at = '2000-01-01 00:00:00+00', retract_reason = 'Duplicate operational report'
   where id = (select signal_historical from authority_ids)
$$, 'a designated Team lead can retract through the existing direct UPDATE path');
select is((select retracted_by from mos.signals
            where id = (select signal_historical from authority_ids)),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'the first retraction records the actual actor');
select is((select retracted_by_name from mos.signals
            where id = (select signal_historical from authority_ids)), 'DirectMgr',
  'the first retraction snapshots the actual actor name');
select is((select count(*)::int from mos.signal_mentions
            where signal_id = (select signal_org from authority_ids)), 3,
  'retraction preserves the original audience mentions on the org row');
-- The tombstone-immutability checks below must run as the AUTHOR (d1): after the first retraction
-- can_retract_signal returns false (it requires an active row), so any other actor's UPDATE matches
-- zero rows and would report a false green instead of proving the guard.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select throws_ok($$
  update mos.signals
     set body = 'Rewritten withdrawn statement'
   where id = (select signal_historical from authority_ids)
$$, '42501', null,
  'an author cannot rewrite the body after the Signal becomes a tombstone');
select throws_ok($$
  update mos.signals
     set retract_reason = 'Rewritten reason'
   where id = (select signal_historical from authority_ids)
$$, '42501', null,
  'a tombstone reason cannot be rewritten after the first retraction');
select throws_ok($$
  update mos.signals
     set retracted_at = '1999-01-01 00:00:00+00'
   where id = (select signal_historical from authority_ids)
$$, '42501', null,
  'a tombstone timestamp cannot be rewritten after the first retraction');
select throws_ok($$
  update mos.signals
     set retracted_by = '00000000-0000-0000-0000-0000000000d1',
         retracted_by_name = 'Forged Name'
   where id = (select signal_historical from authority_ids)
$$, '42501', null,
  'retraction attribution remains immutable after the first transition');

-- A historical tombstone may carry NULL actor provenance (legacy rows), and the actor-name
-- snapshot stays truthful after the retractor is archived.
reset role;
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body,
                         retracted_at, retract_reason)
values ('00000000-0000-0000-0000-00000000e019',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1','team',
        '00000000-0000-0000-0000-000000005b01',
        now(), 'Legacy unknown tombstone', '2000-01-01 00:00:00+00', 'Legacy history');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select retracted_by from mos.signals
            where id = '00000000-0000-0000-0000-00000000e019'), null::uuid,
  'historical tombstones retain NULL actor provenance rather than inventing an actor');
select is((select retracted_by_name from mos.signals
            where id = '00000000-0000-0000-0000-00000000e019'), null::text,
  'historical tombstones retain NULL actor-name provenance rather than inventing a snapshot');
reset role;
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d2';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select retracted_by_name from mos.signals
            where id = (select signal_historical from authority_ids)), 'DirectMgr',
  'the actor-name snapshot remains truthful after the retractor is archived');
reset role;
update shared.people set archived_at = null where id = '00000000-0000-0000-0000-0000000000d2';
set local role authenticated;

-- An archived actor receives no Signal authority even when the JWT still names them.
reset role;
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select can_post from mos.get_signal_post_authority()), false,
  'an archived actor receives no Signal authority even when the JWT still names them');
reset role;
update shared.people set archived_at = null where id = '00000000-0000-0000-0000-0000000000d1';

select * from finish();
rollback;