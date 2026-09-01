-- mos, squashed baseline — the communication layer: notifications, comments, user-composed views,
-- the deputy transcript, and the DB-side aggregate.
--
-- One theme runs through all of it: these records belong to ONE person, and "admin" is not an
-- exception to that. The org gate comes first on every branch, and the owner gate sits inside it,
-- so a cross-org row of any scope is invisible and a same-org row someone else owns is invisible
-- too. The one sanctioned way a row lands in someone else's inbox is a definer RPC that walls the
-- org itself.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

select shared._test_seed_directory();

insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id,
                       accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-0000000000a1','Commentable Task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id,
                       accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000008002','00000000-0000-0000-0000-0000000000b1','Foreign Task',
        '00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b4',
        '00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b4');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- ── Cross-owner delivery goes through the RPC, and the RPC walls the org ─────────────────────
select throws_ok($$
  insert into mos.notifications (owner_id, title)
  values ('00000000-0000-0000-0000-0000000000d2','Planted directly')
$$, '42501', null,
  'a direct INSERT addressed to another owner is refused — otherwise anyone could plant a row in anyone''s inbox');
select isnt(
  mos.create_notification('00000000-0000-0000-0000-0000000000d2','info','You were mentioned'),
  null, 'mos.create_notification IS the sanctioned cross-owner path, and it succeeds within the org');
select throws_ok($$
  select mos.create_notification('00000000-0000-0000-0000-0000000000b4','info','Cross-org delivery')
$$, '42501', null,
  'the RPC refuses a target in ANOTHER org — a cross-org @mention is impossible, not merely unauthorised');

reset role;
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d5';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  select mos.create_notification('00000000-0000-0000-0000-0000000000d5','info','To a leaver')
$$, '42501', null, 'the RPC refuses an ARCHIVED person — a leaver''s inbox stops receiving');

-- ── Delivered content is immutable; only the read state moves ────────────────────────────────
reset role;
insert into mos.notifications (id, org_id, owner_id, title, body)
values ('00000000-0000-0000-0000-000000008003','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1','Original title','Original body');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok($$
  update mos.notifications set read_at = now() where id = '00000000-0000-0000-0000-000000008003'
$$, 'the owner can mark their own notification read');
select lives_ok($$
  update mos.notifications set handled_at = now() where id = '00000000-0000-0000-0000-000000008003'
$$, '...and triage it out of the active queue — read and handled are different states, and both are representable');
-- lives_ok alone proves no exception; a policy DENYING the owner's UPDATE (zero-row update) would
-- still pass. Read back the stamp directly so AC-004 actually fails if the write matches nothing.
select is((select handled_at is not null from mos.notifications where id = '00000000-0000-0000-0000-000000008003'), true,
  '...and the owner''s handled stamp actually stuck — the UPDATE matched a row, not a denial');
select throws_ok($$
  update mos.notifications set title = 'Rewritten after delivery'
  where id = '00000000-0000-0000-0000-000000008003'
$$, '42501', null,
  'the content is immutable once delivered — a notification the owner has already read cannot be changed under them');

-- ── Handled is the owner's PRIVATE triage stamp (OD-WAY-88 / #549) ───────────────────────────
select lives_ok($$
  update mos.notifications set handled_at = null where id = '00000000-0000-0000-0000-000000008003'
$$, 'the owner can also CLEAR their handled stamp — set and clear are the same private right');

-- A peer in the SAME org: the row is invisible under their RLS, so the UPDATE matches nothing
-- (the mos_03 no-op pattern). Read back as the owner to prove nothing moved.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
update mos.notifications set handled_at = now() where id = '00000000-0000-0000-0000-000000008003';
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*) from mos.notifications where id = '00000000-0000-0000-0000-000000008003' and handled_at is not null), 0::bigint,
  'a peer in the SAME org cannot handled-stamp someone else''s row — RLS hides it, the write matches nothing');

-- A person in ANOTHER org: same no-op shape — cross-org stays invisible.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
update mos.notifications set handled_at = now() where id = '00000000-0000-0000-0000-000000008003';
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*) from mos.notifications where id = '00000000-0000-0000-0000-000000008003' and handled_at is not null), 0::bigint,
  'a person in ANOTHER org cannot handled-stamp the row either — cross-org writes match nothing');

-- ── Comments: the polymorphic target must exist AND be same-org ──────────────────────────────
select lives_ok($$
  insert into mos.comments (entity_type, entity_id, body)
  values ('task','00000000-0000-0000-0000-000000008001','A comment on a real, same-org task')
$$, 'a comment on a same-org task is accepted');
select throws_ok($$
  insert into mos.comments (entity_type, entity_id, body)
  values ('task','00000000-0000-0000-0000-000000008002','Pointing into another org')
$$, '23514', null,
  'a comment cannot point at ANOTHER org''s task — entity_id is a bare uuid with no FK, so the guard is the only thing that can say this');
select throws_ok($$
  insert into mos.comments (entity_type, entity_id, body)
  values ('task', gen_random_uuid(), 'Pointing at nothing')
$$, '23514', null, 'nor at a task that does not exist — a dangling comment is refused at write time');
select ok(not has_table_privilege('authenticated','mos.comments','UPDATE')
      and not has_table_privilege('authenticated','mos.comments','DELETE'),
  'comments are append-only at the privilege layer — what was said stays said');

-- ── User views: private by default, shared DOWN the reporting line ───────────────────────────
-- The direction is the subtle part. A manager shares a view TO their reports, so the VIEWER asks
-- "does the owner manage me" — the reverse of every other manager question in the schema.
reset role;
insert into mos.user_views (id, org_id, owner_id, name, scope) values
  ('00000000-0000-0000-0000-000000008004','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d2','Manager private view','private'),
  ('00000000-0000-0000-0000-000000008005','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d2','Manager shared view','shared_team');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select is((select count(*)::int from mos.user_views where id = '00000000-0000-0000-0000-000000008005'), 1,
  'a report sees the view their MANAGER shared — sharing runs down the reporting line');
select is((select count(*)::int from mos.user_views where id = '00000000-0000-0000-0000-000000008004'), 0,
  '...and not the manager''s PRIVATE one');

-- Lead2Holder sits on a different branch of the role tree, so the manager is not above her. Peer
-- would NOT prove this: she holds the same role as the report and therefore IS managed by the same
-- lead, so she legitimately sees the shared view.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["admin"]}';
select is((select count(*)::int from mos.user_views), 0,
  'a same-org ADMIN outside that reporting line sees NEITHER view — admin is not a share, and shared_team means shared with YOUR reports');

-- The classifier columns are all-or-nothing and immutable once set, so a persisted collection view
-- cannot drift into a composition row while keeping the other one''s spec.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into mos.user_views (name, kind) values ('Half-classified','collection')
$$, '23514', null,
  'a partial classifier tuple is refused — kind, context and lifecycle travel together or not at all');
select throws_ok($$
  insert into mos.user_views (name, kind, context, lifecycle, spec)
  values ('Bad collection','collection','work','active','{"kind":"collection","version":"1","collectionId":"invoices"}'::jsonb)
$$, '23514', null,
  'a collection view over an unknown collection is refused — the spec and the classifier must agree');
select lives_ok($$
  insert into mos.user_views (id, name, kind, context, lifecycle, spec)
  values ('00000000-0000-0000-0000-000000008006','Real collection','collection','work','active',
          '{"kind":"collection","version":"1","collectionId":"tasks"}'::jsonb)
$$, 'a well-formed collection view is accepted');
select throws_ok($$
  update mos.user_views set kind = 'composition' where id = '00000000-0000-0000-0000-000000008006'
$$, '42501', null, 'kind is immutable once set — a collection view cannot be mutated into a composition row');
select lives_ok($$
  update mos.user_views set name = 'Renamed collection' where id = '00000000-0000-0000-0000-000000008006'
$$, '...and an ordinary rename still works, so the pin is narrow rather than a freeze');
select lives_ok($$
  insert into mos.user_views (name) values ('Legacy-shaped view')
$$, 'a view with the classifier left null is still valid — the all-null branch is what keeps older rows legal');

-- ── The deputy transcript: append-only except the owner rating their own turn ────────────────
reset role;
insert into mos.agent_threads (id, org_id, owner_id, title)
values ('00000000-0000-0000-0000-000000008007','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1','Thread');
insert into mos.agent_runs (id, org_id, thread_id, owner_id)
values ('00000000-0000-0000-0000-000000008008','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000008007','00000000-0000-0000-0000-0000000000d1');
insert into mos.agent_events (id, org_id, run_id, owner_id, seq, type, text) values
  ('00000000-0000-0000-0000-000000008009','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000008008','00000000-0000-0000-0000-0000000000d1',1,'assistant','An answer'),
  ('00000000-0000-0000-0000-00000000800a','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000008008','00000000-0000-0000-0000-0000000000d1',2,'tool','A tool call');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok($$
  update mos.agent_events set rating = 'down', downvote_reason = 'Wrong number'
  where id = '00000000-0000-0000-0000-000000008009'
$$, 'the owner can rate their own ASSISTANT turn — the one permitted mutation on the transcript');
select throws_ok($$
  update mos.agent_events set text = 'Rewritten answer' where id = '00000000-0000-0000-0000-000000008009'
$$, '42501', null, 'the turn itself cannot be rewritten — a transcript that can be edited is not a transcript');
select throws_ok($$
  update mos.agent_events set rating = 'up' where id = '00000000-0000-0000-0000-00000000800a'
$$, '42501', null, 'and a TOOL row cannot be rated — feedback belongs on what the model said, not on what it ran');
select throws_ok($$
  insert into mos.agent_events (run_id, seq, type, text)
  values ('00000000-0000-0000-0000-000000008008',1,'assistant','Duplicate sequence')
$$, '23505', null, 'the (run, seq) key is unique — a replayed transcript has one event per position');
select lives_ok($$
  insert into mos.agent_events (run_id, seq, type, text)
  values ('00000000-0000-0000-0000-000000008008',3,'user','The echoed user turn')
$$, 'a user turn is a first-class event type — without one persisted, a thread cannot be replayed from the database at all');

-- The transcript is a two-link chain — thread -> run -> event — and both links are existence-only
-- FKs into org-scoped tables. Every row in the chain is owner-pinned by its own policy, so a crossed
-- link discloses nothing by itself; it is refused anyway, because "the parent is in another org" is
-- the same defect wherever it appears and a chain whose links are only sometimes checked is how one
-- of them ends up unchecked. Asserted from the privileged connection, where no policy is in the way.
reset role;
insert into mos.agent_threads (id, org_id, owner_id, title)
values ('00000000-0000-0000-0000-00000000800b','00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000b4','Foreign thread');
insert into mos.agent_runs (id, org_id, thread_id, owner_id)
values ('00000000-0000-0000-0000-00000000800c','00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-00000000800b','00000000-0000-0000-0000-0000000000b4');

select throws_ok($$
  insert into mos.agent_runs (org_id, thread_id, owner_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000800b',
          '00000000-0000-0000-0000-0000000000d1')
$$, '42501', 'thread_id belongs to a different org',
  'a run cannot hang off a FOREIGN org''s thread');

select throws_ok($$
  insert into mos.agent_events (org_id, run_id, owner_id, seq, type, text)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000800c',
          '00000000-0000-0000-0000-0000000000d1',1,'assistant','Crossed event')
$$, '42501', 'run_id belongs to a different org',
  '...and an event cannot hang off a FOREIGN org''s run — the second link of the same chain');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- The positive that keeps the two above about the crossing rather than about the chain: a run and an
-- event on the caller's OWN thread still write, through the ordinary app-tier path.
select lives_ok($$
  insert into mos.agent_runs (id, thread_id) values
    ('00000000-0000-0000-0000-00000000800d','00000000-0000-0000-0000-000000008007')
$$, 'a run on a same-org thread still writes');
select lives_ok($$
  insert into mos.agent_events (run_id, seq, type, text)
  values ('00000000-0000-0000-0000-00000000800d',1,'assistant','A same-org event')
$$, '...and an event on that run does too');

-- ── Push subscriptions ───────────────────────────────────────────────────────────────────────
select lives_ok($$
  insert into mos.push_subscriptions (endpoint) values ('https://push.example/endpoint-1')
$$, 'the owner can register a push endpoint');
select throws_ok($$
  insert into mos.push_subscriptions (endpoint) values ('https://push.example/endpoint-1')
$$, '23505', null, 'the same endpoint cannot be registered twice for one owner');

-- ── The DB-side aggregate: two trust boundaries, and RLS is still the inner one ──────────────
select throws_ok($$
  select * from mos.aggregate_compiled('{"entity":"pg_authid","resolvedAggregate":{"fn":"count"}}'::jsonb)
$$, '22023', null,
  'aggregate_compiled: an entity outside the hard-coded dispatch is refused — the client whitelist is the first boundary, this is the second');
select throws_ok($$
  select * from mos.aggregate_compiled('{"entity":"tasks","resolvedAggregate":{"fn":"count"}}'::jsonb)
$$, '22023', null,
  'aggregate_compiled: an entity that requires a time bound is refused without one — an unbounded scan is a denial of service, not a query');
select throws_ok($$
  select * from mos.aggregate_compiled(
    '{"entity":"tasks","resolvedTimeRange":{"column":"created_at","from":"2020-01-01","to":"2030-01-01"},
      "resolvedAggregate":{"fn":"count"},"resolvedGroupBy":"title"}'::jsonb)
$$, '22023', null,
  'aggregate_compiled: grouping by a column outside the groupable allow-set is refused — identifiers never come from the payload');
select is(
  (select agg_value from mos.aggregate_compiled(
    '{"entity":"tasks","resolvedTimeRange":{"column":"created_at","from":"2020-01-01","to":"2030-01-01"},
      "resolvedAggregate":{"fn":"count"}}'::jsonb)),
  1::numeric,
  'aggregate_compiled: the count covers only the caller''s OWN org — it is SECURITY INVOKER, so base-table RLS still filters what it sees');

reset role;
select * from finish();
rollback;
