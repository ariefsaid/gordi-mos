-- mos, squashed baseline — Signals: All Teams read wall, retired Team read grants, and the post gate.
--
-- Under OD-REDESIGN-88/ticket 867 every NEW Signal is org-wide (`audience = 'org'`, no owning
-- Team): every active same-org member reads it (passive, never a notification). `audience = 'team'`
-- is a RETIRED state kept on historical rows only, whose old Team-rooted grants (R1 owning-Team
-- member, R2 parent-BU role, R3 rank, R4 additive mention, inert R5) must keep holding so history
-- stays describable — and must keep being default-deny for a member no rule reaches.
--
-- FIXTURE DEVIATION, stated at the point of use: mos._test_seed_signal_tree strips Peer's role
-- assignments. The shared directory gives Peer the Staff R role, whose BU is Unit-1 — the owning
-- BU — so R2 alone would grant her every Unit-1 Signal and "a sibling-Team member with no BU role
-- sees nothing" would be unprovable. Stripping the roles models exactly the persona the default-deny
-- assertions are about. It shapes the fixture; it changes no policy.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();
--   Site ...5a01 · OwnTeam ...5b01 (BU Unit-1 ...00a2) · SiblingTeam ...5b02 (same BU, no Site)
--   Author ...0d1 -> OwnTeam · Peer ...0d4 -> SiblingTeam, no roles
--   BU ranks: Unit-1 ...00a2 = 0 · Unit-2 ...00a3 = 2

-- Seed one org-wide (All Teams) Signal and one historical team-audience Signal. The org row has no
-- owning Team; the team row is the retired shape and keeps its owning Team.
insert into mos.signals (id, org_id, author_id, audience, occurred_at, body, attention) values
  ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','org', now(), 'The grinder is jammed again', 'Needs attention');
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body, attention) values
  ('00000000-0000-0000-0000-000000007005','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','team','00000000-0000-0000-0000-000000005b01',
   now(), 'Historical team note', 'FYI');

set local role authenticated;

-- ── All Teams read wall: every active same-org member reads every org Signal ─────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007001'), 1,
  'org wall: the author reads the org Signal');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007001'), 1,
  'org wall: a sibling member with NO Team/BU/mention rule reads the org Signal — All Teams is org-readable');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007001'), 1,
  'org wall: a same-org member in a different role also reads the org Signal');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007001'), 0,
  'org wall: a cross-org identity is DENIED — org reads stop at the tenant seam');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007001'), 1,
  'org wall: any active member reads, regardless of Team or rank — no rule needed for org rows');
set local request.jwt.claims = '{}';
select is((select count(*)::int from mos.signals), 0,
  'org wall: a claimless session reads nothing — the org wall still needs a live same-org identity');

-- An INACTIVE member must not read an org Signal: Archive the author mid-test, deny, restore.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
reset role;
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007001'), 0,
  'org wall: an INACTIVE (archived) member is DENIED even though the JWT still names them');
reset role;
update shared.people set archived_at = null where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;

-- ── Retired team-audience read grants keep holding on historical rows ────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007005'), 1,
  'team R1: an active member of the owning Team still reads the historical team row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007005'), 1,
  'team R2: a holder of a role scoped to the owning BU still reads the historical team row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007005'), 1,
  'team R3: a role in a strictly higher-rank BU still reads the historical team row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007005'), 0,
  'team DEFAULT DENY: a sibling-Team member with no rule reads ZERO historical team rows');
-- R4 stays additive on the retired surface: an explicit, unrevoked mention opens it, revocation
-- closes it again.
reset role;
insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000007005','person','00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007005'), 1,
  'team R4: an explicit @Person mention still grants the historical row read');
reset role;
update mos.signal_mentions set revoked_at = now() where id = '00000000-0000-0000-0000-000000007002';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007005'), 0,
  'team R4: a REVOKED mention closes the historical row read again');

-- ── Posting: All Teams only ──────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select isnt(
  mos.create_signal_with_mentions('Posted atomically', now(),
    '[{"kind":"person","targetId":"00000000-0000-0000-0000-0000000000d4"}]'::jsonb),
  null, 'the All Teams post path returns the new Signal id — signal, mentions and fan-out in one statement');
select is((select audience from mos.signals where body = 'Posted atomically'), 'org',
  'the post path writes an All Teams (org) audience');
select is((select owning_team_id from mos.signals where body = 'Posted atomically'), null,
  'the post path writes NO owning Team on the new org row');
select throws_ok($$
  select mos.create_signal_with_mentions('Cross-org mention', now(),
    '[{"kind":"person","targetId":"00000000-0000-0000-0000-0000000000b4"}]'::jsonb)
$$, '42501', null,
  'a cross-org mention target is rejected BEFORE anything is written — so a failed post leaves no orphan Signal behind');
select mos.create_signal_with_mentions('Urgent post', now(), p_attention => 'Urgent');
select is((select attention from mos.signals where body = 'Urgent post'),
  'Urgent', 'the post path stores an explicitly supplied attention value');
select mos.create_signal_with_mentions('FYI positional post', now(), '[]'::jsonb);
select is((select attention from mos.signals where body = 'FYI positional post'),
  'FYI', 'the positional call defaults attention to FYI');

-- The retired team audience can never be written again: the insert policy admits ONLY org rows
-- with NO owning Team.
select throws_ok($$
  insert into mos.signals (org_id, author_id, audience, owning_team_id, occurred_at, body)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'team','00000000-0000-0000-0000-000000005b01', now(), 'Team-scoped new row')
$$, '42501', null, 'a team-audience insert is rejected — the Team audience is retired, never written again');
select throws_ok($$
  insert into mos.signals (org_id, author_id, audience, owning_team_id, occurred_at, body)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'org','00000000-0000-0000-0000-000000005b01', now(), 'Org row with a Team')
$$, '42501', null, 'an org insert with a non-null owning Team is rejected — All Teams rows carry no Team');
select throws_ok($$
  insert into mos.signals (org_id, author_id, audience, owning_team_id, occurred_at, body, source)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'org', null, now(), 'Machine-claimed', 'rule')
$$, '42501', null,
  'source must be ''human'' on an app-written Signal — the other two values exist for producers that do not exist yet');

-- ── Edit history writes itself, cannot be written by hand, and owning_team/author are immutable ──
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update mos.signals set body = 'The grinder is jammed, third time this week'
 where id = '00000000-0000-0000-0000-000000007001';
select is(
  (select count(*)::int from mos.signal_revisions
    where signal_id = '00000000-0000-0000-0000-000000007001' and field = 'body'),
  1, 'an author''s content edit appends a revision row automatically');
select ok(not has_table_privilege('authenticated','mos.signal_revisions','INSERT'),
  'the history cannot be written by hand — no INSERT privilege, so only the definer guard appends to it');
select throws_ok($$
  update mos.signals set owning_team_id = '00000000-0000-0000-0000-000000005b02'
  where id = '00000000-0000-0000-0000-000000007005'
$$, '42501', null,
  'the owning Team is immutable on historical rows — moving it would re-point the retired grant set');
select throws_ok($$
  update mos.signals set author_id = '00000000-0000-0000-0000-0000000000d2'
  where id = '00000000-0000-0000-0000-000000007001'
$$, '42501', null, 'the author is immutable');

-- ── The Signal→Task link ─────────────────────────────────────────────────────────────────────
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-00000000a7a1','00000000-0000-0000-0000-0000000000a1','Home Task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');
select lives_ok($$
  insert into mos.signal_tasks (org_id, signal_id, task_id, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000007001',
          '00000000-0000-0000-0000-00000000a7a1','00000000-0000-0000-0000-0000000000d1')
$$, 'a same-org Signal→Task link still writes');

-- ── Retraction is soft, and there is no delete path at all ───────────────────────────────────
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000007001'), 1,
  'a retracted Signal still exists — retraction is soft, so the record of what was said survives');
select ok(not has_table_privilege('authenticated','mos.signals','DELETE'),
  'no DELETE privilege on mos.signals for any session');

select * from finish();
rollback;