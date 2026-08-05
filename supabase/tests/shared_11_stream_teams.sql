-- shared, bar-capture slice 1 (#231) — a Team IS a (branch, activity) production stream.
--
-- OWNS: AC-001  — a person's live primary Team membership resolves their default capture stream;
--                 a person with no stream-linked primary Team resolves to none.
--       AC-012a — exactly six stream Teams are seeded — {GHQ, RRS, Radiant} x {kitchen, bar} —
--                 and none references the roastery branch.
--       OD-WAY-49's default-not-wall: the stream appears in NO RLS predicate anywhere. The Team
--                 default is an affordance, never authorization.
--
-- The stream is realised ON the Team (FR-004): shared.teams grows a nullable branch link plus
-- activity, both set = a stream team. There is no stream table and no person<->stream assignment —
-- the six seeded stream Teams ARE the enumerable catalog (FR-005, OD-WAY-42). Roastery is a branch,
-- never a stream: it books to its own company and has no production stream (OD-WAY-42).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ── Shape: the pair lives on the Team, half a stream is impossible ───────────────────────────
select has_column('shared','teams','branch_id',
  'FR-004: a stream team carries its branch ON the team — no separate stream table');
select has_column('shared','teams','activity',
  'FR-004: ...and its activity beside it');

-- The branch link is the same-org composite FK, so the tenancy seam is declarative — the same
-- pattern reporting's fact rows use against branches_org_id_key.
select fk_ok('shared','teams', array['org_id','branch_id'], 'shared','branches', array['org_id','id'],
  'the branch half resolves against the canonical catalog INSIDE the team''s own org — declarative seam, not a guard');

select throws_ok($$
  insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
  values ('10000000-0000-0000-0000-000000000001',
          (select id from shared.business_units
            where org_id = '10000000-0000-0000-0000-000000000001' and code = 'retail_ops'),
          'Half Stream A','half_stream_a',
          (select id from shared.branches
            where org_id = '10000000-0000-0000-0000-000000000001' and code = 'radiant'),
          null)
  $$, '23514', null,
  'a branch link with no activity is refused — half a stream is not a stream');

select throws_ok($$
  insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
  values ('10000000-0000-0000-0000-000000000001',
          (select id from shared.business_units
            where org_id = '10000000-0000-0000-0000-000000000001' and code = 'retail_ops'),
          'Half Stream B','half_stream_b', null, 'bar')
  $$, '23514', null,
  '...and an activity with no branch link is refused too — the pair is set or null together');

select throws_ok($$
  insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
  values ('10000000-0000-0000-0000-000000000001',
          (select id from shared.business_units
            where org_id = '10000000-0000-0000-0000-000000000001' and code = 'retail_ops'),
          'Roasting Stream','roasting_stream',
          (select id from shared.branches
            where org_id = '10000000-0000-0000-0000-000000000001' and code = 'radiant'),
          'roasting')
  $$, '23514', null,
  'kitchen and bar are the only activities — the two WIP-producing activities the Cafe Module serves (OD-WAY-26)');

-- One live stream team per (org, branch, activity): the catalog is enumerable because it cannot
-- hold two rows for one stream.
select throws_ok($$
  insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
  values ('10000000-0000-0000-0000-000000000001',
          (select id from shared.business_units
            where org_id = '10000000-0000-0000-0000-000000000001' and code = 'retail_ops'),
          'RRS Bar Duplicate','rrs_bar_duplicate',
          (select id from shared.branches
            where org_id = '10000000-0000-0000-0000-000000000001' and code = 'rumah_rames'),
          'bar')
  $$, '23505', null,
  'a second live team for the same (branch, activity) is refused — the six-team catalog cannot silently grow a seventh (AC-012a''s "exactly")');

-- The composite FK is the cross-org proof: another org's branch id is simply not a row under
-- (org E, id) and the reference fails as a foreign key — declaratively, with no guard involved.
-- Org E gets its own BU so shared._guard_teams passes and the FK is what actually refuses.
insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000e1','Stream Org E','stream-org-e');
insert into shared.business_units (id, org_id, name, code) values
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e1','E-Unit','e_unit');

select throws_ok($$
  insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2',
          'Cross Org Stream','cross_org_stream',
          (select id from shared.branches
            where org_id = '10000000-0000-0000-0000-000000000001' and code = 'radiant'),
          'bar')
  $$, '23503', null,
  'a team cannot point its stream at ANOTHER org''s branch — the composite FK holds the tenancy seam declaratively');

-- ── AC-012a: the seed — six stream teams, the expected pairs, roastery never among them ──────
select is(
  (select count(*)::int from shared.teams t
    where t.org_id = '10000000-0000-0000-0000-000000000001'
      and t.branch_id is not null and t.archived_at is null),
  6,
  'AC-012a: exactly SIX stream teams are seeded for the dev org (FR-005, OD-WAY-42)');

select set_eq($$
  select b.code, t.activity
    from shared.teams t
    join shared.branches b on b.id = t.branch_id
   where t.org_id = '10000000-0000-0000-0000-000000000001'
     and t.branch_id is not null and t.archived_at is null
  $$, $$ values
    ('gordi_hq','kitchen'), ('gordi_hq','bar'),
    ('rumah_rames','kitchen'), ('rumah_rames','bar'),
    ('radiant','kitchen'), ('radiant','bar')
  $$,
  'AC-012a: the six are {GHQ, RRS, Radiant} x {kitchen, bar} — asserted as a set, so a pair silently added or dropped fails here');

select is(
  (select count(*)::int from shared.teams t
    join shared.branches b on b.id = t.branch_id
   where b.code = 'roastery'),
  0,
  'AC-012a: NO stream team references the roastery branch, in any org — roastery is in the branch catalog but carries no production stream (OD-WAY-42)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-001 — default-stream resolution from the live primary membership
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Fixture people in the dev org (no auth link needed — claims are set directly, the same pattern
-- as the mos suite). Names are fixture labels, not staff.
insert into shared.people (id, org_id, full_name) values
  ('47000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Stream Primary Fixture'),
  ('47000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','NonStream Primary Fixture'),
  ('47000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','No Team Fixture'),
  ('47000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Secondary Only Fixture');

-- Person 1: live primary membership of the (RRS, bar) stream team.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
select '10000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001', t.id, true
  from shared.teams t
 where t.org_id = '10000000-0000-0000-0000-000000000001'
   and t.code = 'rumah_rames_bar';

-- Person 2: live primary membership of a NON-stream team (org structure, no branch link).
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
select '10000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000002', t.id, true
  from shared.teams t
 where t.org_id = '10000000-0000-0000-0000-000000000001'
   and t.code = 'marketing_team';

-- Person 4: a NON-primary membership of a stream team — helping on a stream is not defaulting to it.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
select '10000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000004', t.id, false
  from shared.teams t
 where t.org_id = '10000000-0000-0000-0000-000000000001'
   and t.code = 'gordi_hq_bar';

set local role authenticated;
set local request.jwt.claims =
  '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"47000000-0000-0000-0000-000000000001","access_roles":["member"]}';

select results_eq($$
  select branch_id, activity from shared.default_stream()
  $$, $$
  select b.id, 'bar'::text from shared.branches b
   where b.org_id = '10000000-0000-0000-0000-000000000001' and b.code = 'rumah_rames'
  $$,
  'AC-001: a live primary membership of the (RRS, bar) team resolves the default stream to (RRS, bar) — the Team IS the stream (FR-001, OD-WAY-49)');

-- The member can enumerate the stream catalog: the default is an affordance and switching is free
-- (FR-003), which needs the six teams readable, not just the person''s own.
select is(
  (select count(*)::int from shared.teams
    where branch_id is not null and archived_at is null),
  6,
  'FR-003: a member reads all six stream teams of their org — the switcher''s catalog, default not wall');

set local request.jwt.claims =
  '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"47000000-0000-0000-0000-000000000002","access_roles":["member"]}';
select results_eq($$
  select branch_id, activity from shared.default_stream()
  $$, $$ values (null::uuid, null::text) $$,
  'AC-001: a primary Team with no stream link resolves to none — an explicit stream choice is required before capture (FR-002)');

set local request.jwt.claims =
  '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"47000000-0000-0000-0000-000000000003","access_roles":["member"]}';
select is_empty($$
  select branch_id, activity from shared.default_stream()
  $$,
  'AC-001: a person with no live primary membership at all resolves to none');

set local request.jwt.claims =
  '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"47000000-0000-0000-0000-000000000004","access_roles":["member"]}';
select is_empty($$
  select branch_id, activity from shared.default_stream()
  $$,
  'AC-001: a NON-primary membership of a stream team resolves NO default — helping on a stream is switching to it, not defaulting to it');

-- An ENDED primary membership stops resolving: "live" is a property the function reads, not a word
-- in a comment.
reset role;
update shared.team_memberships
   set effective_to = current_date - 1
 where person_id = '47000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims =
  '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"47000000-0000-0000-0000-000000000001","access_roles":["member"]}';
select is_empty($$
  select branch_id, activity from shared.default_stream()
  $$,
  'AC-001: an ENDED primary membership resolves no default — the resolution reads the LIVE membership, not membership history');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OD-WAY-49 — the stream is a default, never a wall
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The whole slice touches NO policy: asserted directly, over every schema, so a later slice that
-- lets the stream leak into a member predicate fails here rather than shipping a wall.
reset role;
select is(
  (select count(*)::int from pg_policies
    where coalesce(qual,'') || ' ' || coalesce(with_check,'') ~* '(branch_id|\mactivity\M)'),
  0,
  'OD-WAY-49: NO RLS policy in any schema references a stream column — the stream is a capture default, never an authorization dimension');

-- The two substrate tables keep exactly the policy surface they had before this slice: one
-- org-scoped SELECT each, nothing added, nothing re-authored.
select set_eq($$
  select tablename || ' :: ' || policyname || ' :: ' || cmd from pg_policies
   where schemaname = 'shared' and tablename in ('teams','team_memberships')
  $$, $$ values
    ('teams :: teams_select_org :: SELECT'),
    ('team_memberships :: team_memberships_select_org :: SELECT')
  $$,
  'OD-WAY-49: the team substrate''s policy set is UNCHANGED by this slice — org-scoped SELECT and nothing else');

select ok(
  not has_table_privilege('authenticated','shared.teams','INSERT')
  and not has_table_privilege('authenticated','shared.teams','UPDATE')
  and not has_table_privilege('authenticated','shared.teams','DELETE'),
  'the stream columns add NO app write surface to shared.teams — stream teams are seeded, exactly as branches are');

-- The resolver takes the caller''s OWN RLS context with it (SECURITY INVOKER): a definer resolver
-- would answer for people the caller cannot see.
select ok(
  not (select p.prosecdef from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'shared' and p.proname = 'default_stream'),
  'shared.default_stream() is SECURITY INVOKER — it resolves under the caller''s own RLS, nothing more');

select * from finish();
rollback;
