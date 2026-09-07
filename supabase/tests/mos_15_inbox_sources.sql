-- Ticket #771 · OD-WAY-96 (4). AC-010..AC-013.
--
-- What this file proves:
--   AC-010  task_named delivery on naming a new PIC/Supervisor; self-name silent; re-save silent.
--   AC-011  task_comment delivery to PIC + Supervisor; commenter never self-notifies; dedupe folds.
--   AC-012  signal_urgent delivery to every Team lead in the owning-Team business unit; author gets
--           nothing; FYI is silent; raising FYI -> Urgent delivers once; a lead already notified by
--           mention for this Signal is not notified twice.
--   AC-013  every delivery (mention fan-out included) carries source, actor.id, actor.name,
--           entity.type/id/route, and attention on Signal sources.
--
-- Fixture personas map onto the abstract seed tree in shared._test_seed_directory():
--   Author = d1  (mem, no lead access role, home team in Unit-1)      — "Bulan"
--   DirectMgr = d2 (grant 'supervisor' + primary team T1 in Unit-1)   — "Cahya" lead
--   GrandMgr = d3  (role Exec/f1, root role in Unit-1)                — "Dewi" unit-head lead
--   Peer = d4    (grant 'ops_lead' + primary team T1 in Unit-1)       — "Sinta" lead
--   Report = d5    (downline of Author; PIC target for AC-010/011)    — "Bulan-the-PIC"
--   Lead2Holder = d7  (Unit-2; NOT a lead of Unit-1 — the negative)   — "Kris the outsider"
--
-- Nothing in this file writes production data; everything runs inside begin;...rollback;. Delivery
-- goes through the ONE existing definer (mos.create_notification); no GUC/test bypass is used in
-- any decision, and the actor never notifies themself on any path asserted below.

begin;
create extension if not exists pgtap with schema extensions;
select plan(37);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();

-- Team T1 in Unit-1. Author (d1) and Report (d5) are members. DualHat (d6) rounds out the team.
insert into shared.teams (id, org_id, business_unit_id, name, code) values
  ('00000000-0000-0000-0000-000000007701','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Cikal Bar','cikal_bar');

insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000007701', true),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000007701', true),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000007701', true),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-000000007701', false);

-- Lead-tier access-role grants. GrandMgr (d3) is already a unit head via role Exec/f1 (root in
-- Unit-1), so no access-role grant is needed for them — the three leads shape up naturally.
insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','supervisor'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','ops_lead');

-- Give Author (Bulan) the 'signal.create' capability path used by the RPC. The base grant lives in
-- role_capabilities for 'member', so the JWT below carries 'member' on the read/write paths.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-010 · task_named
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- The actor (d1) names Report (d5) PIC and DirectMgr (d2) Supervisor. Both are new to the task,
-- both are not the actor: both hold one row.
select lives_ok($$
  insert into mos.tasks (id, title, business_unit_id, responsible_person_id, accountable_person_id)
  values ('00000000-0000-0000-0000-000000007710', 'AC-010 task', '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d2')
$$, 'AC-010 create a task naming a downline PIC and a manager Supervisor');

reset role;
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d5'
    and metadata->>'source' = 'task_named'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'), 1,
  'AC-010 named PIC (d5) holds exactly one task_named row');
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d2'
    and metadata->>'source' = 'task_named'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'), 1,
  'AC-010 named Supervisor (d2) holds exactly one task_named row');
select is((select metadata->'actor'->>'id' from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d5'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'),
  '00000000-0000-0000-0000-0000000000d1',
  'AC-010 the actor id is stamped on the delivered row');
select is((select metadata->'entity'->>'route' from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d5'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'),
  '/work/tasks/00000000-0000-0000-0000-000000007710',
  'AC-010 the route stamped on the row lands on the Task');
select is((select metadata->>'role' from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d5'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'),
  'PIC',
  'AC-010 the role tag distinguishes PIC from Supervisor');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- PIC = self: creating a task with author as PIC delivers nothing.
select lives_ok($$
  insert into mos.tasks (id, title, business_unit_id, responsible_person_id, accountable_person_id)
  values ('00000000-0000-0000-0000-000000007711', 'AC-010 self-named', '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC-010 create a task with the actor as both PIC and Supervisor');
reset role;
select is((select count(*)::int from mos.notifications
  where metadata->>'source' = 'task_named'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007711'), 0,
  'AC-010 PIC = self delivers nothing (and Supervisor = self likewise)');

-- Re-save the same PIC: the second UPDATE names no new person, so nothing is delivered.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d5'
  where id = '00000000-0000-0000-0000-000000007710'
$$, 'AC-010 re-save the same PIC');
reset role;
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d5'
    and metadata->>'source' = 'task_named'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'), 1,
  'AC-010 re-save delivers nothing — the recipient still holds ONE row');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-011 · task_comment
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Task PIC=d5, Supervisor=d2 (from AC-010). A same-org peer d4 comments first: both PIC and
-- Supervisor hold one row. Then PIC d5 comments: only d2 is a candidate, and the (owner, source,
-- entity) dedupe folds their second delivery into the row they already have.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select lives_ok($$
  insert into mos.comments (entity_type, entity_id, body)
  values ('task','00000000-0000-0000-0000-000000007710','AC-011 first comment from Krishna')
$$, 'AC-011 a same-org peer comments on the task');
reset role;
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d5'
    and metadata->>'source' = 'task_comment'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'), 1,
  'AC-011 PIC (d5) holds one task_comment row');
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d2'
    and metadata->>'source' = 'task_comment'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'), 1,
  'AC-011 Supervisor (d2) holds one task_comment row');
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d4'
    and metadata->>'source' = 'task_comment'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'), 0,
  'AC-011 the commenter never self-notifies');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select lives_ok($$
  insert into mos.comments (entity_type, entity_id, body)
  values ('task','00000000-0000-0000-0000-000000007710','AC-011 PIC comments back')
$$, 'AC-011 the PIC comments back');
reset role;
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d5'
    and metadata->>'source' = 'task_comment'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'), 1,
  'AC-011 PIC self-comment adds nothing — they still hold their earlier row');
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d2'
    and metadata->>'source' = 'task_comment'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007710'), 1,
  'AC-011 Supervisor still holds ONE row — (owner, source, entity) dedupe folds the repeat');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-012 · signal_urgent
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Bulan (d1) posts Urgent via the transactional RPC. The three leads (Cahya d2, Sinta d4, Dewi
-- d3) each receive; Bulan is the author and holds nothing.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select isnt(
  mos.create_signal_with_mentions(
    'AC-012 fresh Urgent to Cikal Bar', '00000000-0000-0000-0000-000000007701', now(),
    '[]'::jsonb, 'Urgent'),
  null, 'AC-012 Bulan posts an Urgent Signal to Cikal Bar');
reset role;
select is((select count(*)::int from mos.notifications
  where owner_id in ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d4')
    and metadata->>'source' = 'signal_urgent'), 3,
  'AC-012 every Cikal Bar lead (Cahya, Sinta, Dewi) holds one signal_urgent row');
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d1'
    and metadata->>'source' = 'signal_urgent'), 0,
  'AC-012 the author (Bulan) is never notified about their own post');

-- FYI post: no signal_urgent for anyone.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select isnt(
  mos.create_signal_with_mentions(
    'AC-012 FYI to Cikal Bar', '00000000-0000-0000-0000-000000007701', now(),
    '[]'::jsonb, 'FYI'),
  null, 'AC-012 Bulan posts an FYI Signal');
reset role;
select is((select count(*)::int from mos.notifications
  where metadata->>'source' = 'signal_urgent'
    and body = 'AC-012 FYI to Cikal Bar'), 0,
  'AC-012 an FYI post delivers no signal_urgent row');

-- FYI raised to Urgent by the author: the delta drives one delivery per lead.
reset role;
insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body, attention)
values ('00000000-0000-0000-0000-000000007720', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000007701',
        now(), 'AC-012 raise-to-Urgent signal', 'FYI');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  update mos.signals set attention = 'Urgent'
  where id = '00000000-0000-0000-0000-000000007720'
$$, 'AC-012 the author raises FYI to Urgent');
reset role;
select is((select count(*)::int from mos.notifications
  where owner_id in ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d4')
    and metadata->>'source' = 'signal_urgent'
    and metadata#>>'{entity,id}' = '00000000-0000-0000-0000-000000007720'), 3,
  'AC-012 raising FYI to Urgent delivers exactly one signal_urgent row per lead');

-- Mention-wins rule: post Urgent + @-mention a lead. The lead holds the mention row and does NOT
-- also hold a signal_urgent row for the same Signal.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select isnt(
  mos.create_signal_with_mentions(
    'AC-012 Urgent + mention', '00000000-0000-0000-0000-000000007701', now(),
    '[{"kind":"person","targetId":"00000000-0000-0000-0000-0000000000d2"}]'::jsonb, 'Urgent'),
  null, 'AC-012 Bulan posts Urgent and mentions Cahya');
reset role;
-- Cahya (d2) has a signal_mention but not a signal_urgent for THIS Signal.
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d2'
    and metadata#>>'{entity,id}' in (
      select id::text from mos.signals where body = 'AC-012 Urgent + mention'
    )
    and metadata->>'source' = 'signal_mention'), 1,
  'AC-012 the mentioned lead (Cahya) holds a signal_mention row');
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d2'
    and metadata#>>'{entity,id}' in (
      select id::text from mos.signals where body = 'AC-012 Urgent + mention'
    )
    and metadata->>'source' = 'signal_urgent'), 0,
  'AC-012 the mentioned lead is NOT also notified as urgent — mention wins');
-- The other two leads still receive signal_urgent.
select is((select count(*)::int from mos.notifications
  where owner_id in ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d4')
    and metadata#>>'{entity,id}' in (
      select id::text from mos.signals where body = 'AC-012 Urgent + mention'
    )
    and metadata->>'source' = 'signal_urgent'), 2,
  'AC-012 the other two leads (Sinta, Dewi) still hold one signal_urgent row each');

-- Lead2Holder (d7) sits in Unit-2 with no role in Unit-1, so they are NOT a lead of Cikal Bar
-- and hold nothing on any of the posts above.
select is((select count(*)::int from mos.notifications
  where owner_id = '00000000-0000-0000-0000-0000000000d7'
    and metadata->>'source' in ('signal_urgent','signal_mention')), 0,
  'AC-012 a person outside the owning-Team business unit is not a lead of Cikal Bar');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-013 · every delivery carries source, actor {id, name}, entity {type, id, route}, and
-- attention on Signal sources.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is((select count(*)::int from mos.notifications
  where metadata->>'source' in ('task_named','task_comment','signal_mention','signal_urgent','signal_retracted')
    and (metadata->'actor'->>'id' is null
         or metadata->'actor'->>'name' is null
         or metadata->'entity'->>'type' is null
         or metadata->'entity'->>'id' is null
         or metadata->'entity'->>'route' is null)), 0,
  'AC-013 every delivered notification carries actor {id, name} and entity {type, id, route}');
select is((select count(*)::int from mos.notifications
  where metadata->'entity'->>'type' = 'signal'
    and metadata->>'source' in ('signal_mention','signal_urgent','signal_retracted')
    and metadata->>'attention' is null), 0,
  'AC-013 every Signal-source delivery carries attention');
select is((select count(distinct metadata->'entity'->>'route')::int from mos.notifications
  where metadata->'entity'->>'type' = 'task'
    and metadata#>>'{entity,route}' not like '/work/tasks/%'), 0,
  'AC-013 every task-source route lands under /work/tasks/');
select is((select count(distinct metadata->'entity'->>'route')::int from mos.notifications
  where metadata->'entity'->>'type' = 'signal'
    and metadata#>>'{entity,route}' not like '/work/signals?record=%'), 0,
  'AC-013 every signal-source route lands on /work/signals?record=<id>');

-- The mention fan-out carries the same shape — the AC-013 clause explicitly names it.
select is((select count(*)::int from mos.notifications
  where metadata->>'source' = 'signal_mention'
    and (metadata->'actor'->>'id' is null or metadata->>'attention' is null)), 0,
  'AC-013 the mention fan-out row carries actor and attention');
select is((select metadata->>'attention' from mos.notifications
  where metadata->>'source' = 'signal_mention'
    and metadata#>>'{entity,id}' in (select id::text from mos.signals where body = 'AC-012 Urgent + mention')
    limit 1),
  'Urgent',
  'AC-013 the mention fan-out records the Signal''s attention verbatim');
select is((select metadata->'actor'->>'id' from mos.notifications
  where metadata->>'source' = 'signal_mention'
    and metadata#>>'{entity,id}' in (select id::text from mos.signals where body = 'AC-012 Urgent + mention')
    limit 1),
  '00000000-0000-0000-0000-0000000000d1',
  'AC-013 the mention fan-out records the author as the actor');

-- The signal_urgent row carries the author as the actor when delivered on the INSERT path.
select is((select metadata->'actor'->>'id' from mos.notifications
  where metadata->>'source' = 'signal_urgent'
    and metadata#>>'{entity,id}' in (select id::text from mos.signals where body = 'AC-012 fresh Urgent to Cikal Bar')
    limit 1),
  '00000000-0000-0000-0000-0000000000d1',
  'AC-013 the signal_urgent row records the actor (author on the INSERT path)');

reset role;
select * from finish();
rollback;
