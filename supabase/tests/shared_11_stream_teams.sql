-- shared, bar-capture slice 1 (#231) — a Team IS a (branch, activity) production stream.
--
-- OWNS: AC-001  — a person's live primary Team membership resolves their default capture stream;
--                 a person with no stream-linked primary Team resolves to none.
--       AC-012a — the stream Team catalog is enumerable and complete: {GHQ, RRS, Radiant} x
--                 {kitchen, bar} plus Cikal x bar = SEVEN (amended 2026-08-27; see below) —
--                 and none references the roastery branch.
--       OD-WAY-49's default-not-wall: the stream gates no MEMBER read or write — an affordance,
--                 never authorization. NOT "no RLS predicate anywhere": reviewer policies DO key on
--                 (branch_id, activity) via ops.is_stream_reviewer (20260811000001:78-83).
--
-- The stream is realised ON the Team (FR-004): shared.teams grows a nullable branch link plus
-- activity, both set = a stream team. There is no stream table and no person<->stream assignment —
-- the seeded stream Teams ARE the enumerable catalog — SEVEN since OD-WAY-79 (FR-005,
-- OD-WAY-42). Roastery is a branch, never a stream: it books to its own company and has no
-- production stream (OD-WAY-42).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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
  $$, '23503', null,
  'the Activity catalog rejects an unknown activity (OD-WAY-26)');

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
  'a second live team for the same (branch, activity) is refused — the catalog cannot silently grow a DUPLICATE pair. Its size is ruled (seven, OD-WAY-79) and changes only by ruling; its shape — one team per pair — is not negotiable');

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

-- ── AC-012a: the seed — the expected pairs, roastery never among them ───────────────────────
-- The count moved from six to SEVEN on 2026-08-27: the owner added Cikal as a branch with a BAR
-- stream and no kitchen. "Exactly six" was never a claim that six is the permanent size — it was a
-- claim that the catalog is ENUMERABLE and complete, so a capture surface can list the streams
-- rather than guess. Seven satisfies that property; a stream nobody declared would not.
-- The grid is deliberately asymmetric now, and this is the SECOND such fact here: roastery is a
-- branch with no stream at all. Do not "complete" either one.
select is(
  (select count(*)::int from shared.teams t
    where t.org_id = '10000000-0000-0000-0000-000000000001'
      and t.branch_id is not null and t.archived_at is null),
  7,
  'AC-012a: exactly SEVEN stream teams are seeded for the dev org — the six-grid plus Cikal bar (FR-005, OD-WAY-42, amended 2026-08-27)');

-- ── No comment in `shared` publishes a stale stream count ────────────────────────────────────
-- A CLASS check, and it exists because the pinned-text check in ops_04 could not reach here. When
-- The database serves comments to anyone running \d+, so a stale count is a wrong answer the
-- schema itself gives. Three said six when Cikal made it seven.
--
-- BOTH AXES, because scoping to one is the mistake being fixed: schema (`shared` AND `ops`) and
-- object class (pg_class AND pg_proc — the stale one was a FUNCTION comment). `classoid` is pinned
-- per arm; a bare objoid matches across catalogs.
--
-- MATCHES ON ARITHMETIC, NOT WORDING: a comment naming streams and six-or-five must also name
-- seven. A phrase list fails both ways — too wide it reddens the true "…six streams … = SEVEN
-- distinct"; too narrow it misses "Seeds the six stream teams" (20260806000001:154), the actual
-- stale one. When a ruling moves the count, this predicate moves with it.
--
-- Re-issue stale comments FROM A NEW MIGRATION; editing an applied file changes no deployed db.
reset role;
select is(
  (select count(*)::int from (
     select d.description
       from pg_description d
       join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('shared','ops')
     union all
     select d.description
       from pg_description d
       join pg_proc pr on pr.oid = d.objoid and d.classoid = 'pg_proc'::regclass
       join pg_namespace n on n.oid = pr.pronamespace
      where n.nspname in ('shared','ops')
   ) x
   where x.description ~* 'stream'
     and x.description ~* '\m(six|6|five|5)\M'
     and x.description !~* '\mseven\M'),
  0,
  'FR-005 documentation honesty (spec Further Notes, not AC-012a itself): no comment on any relation, column or function in shared or ops describes the stream catalog by a superseded count — anything naming six or five must also name the shipped seven — so the number a schema reader gets from \d+ agrees with the catalog (OD-WAY-42, OD-WAY-79)');

select set_eq($$
  select b.code, t.activity
    from shared.teams t
    join shared.branches b on b.id = t.branch_id
   where t.org_id = '10000000-0000-0000-0000-000000000001'
     and t.branch_id is not null and t.archived_at is null
  $$, $$ values
    ('gordi_hq','kitchen'), ('gordi_hq','bar'),
    ('rumah_rames','kitchen'), ('rumah_rames','bar'),
    ('radiant','kitchen'), ('radiant','bar'),
    ('cikal','bar')
  $$,
  'AC-012a: the seven are {GHQ, RRS, Radiant} x {kitchen, bar} plus Cikal bar — asserted as a SET, so a pair silently added or dropped fails here, and a cikal/kitchen nobody asked for fails too');

select is(
  (select count(*)::int from shared.teams t
    join shared.branches b on b.id = t.branch_id
   where b.code = 'roastery'),
  0,
  'AC-012a: NO stream team references the roastery branch, in any org — roastery is in the branch catalog but carries no production stream (OD-WAY-42)');

-- ── The seeder: one home for the pair list, idempotent, and FAIL-LOUD on a code collision ────
-- Org G is a second seed-shaped org (Retail Ops BU + the branch catalog): calling the seeder again
-- must seven it up while leaving the already-seeded dev org exactly as it was (idempotence), and
-- it gives the FR-003 catalog test below a second org to prove scoping against.
--
-- ORG G CARRIES CIKAL ON PURPOSE. Without it, a Cikal disjunct hardcoded to the dev org passes the
-- whole suite. The three org-G assertions below are what distinguish org-generic from dev-pinned —
-- do not drop the branch to round a number. Roastery holds the other half: a branch no rule names
-- gets no stream.
insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000f1','Stream Org G','stream-org-g');
insert into shared.business_units (id, org_id, name, code) values
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f1','G Retail Ops','retail_ops');
insert into shared.branches (org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000f1','gordi_hq','G Gordi HQ'),
  ('00000000-0000-0000-0000-0000000000f1','rumah_rames','G Rumah Rames'),
  ('00000000-0000-0000-0000-0000000000f1','radiant','G Radiant'),
  ('00000000-0000-0000-0000-0000000000f1','cikal','G Cikal'),
  ('00000000-0000-0000-0000-0000000000f1','roastery','G Roastery');

select lives_ok(
  $$ select shared.seed_stream_teams() $$,
  'the seeder is idempotent — re-running it over an already-seeded org changes nothing and seeds the org that arrived later');

select is(
  (select count(*)::int from shared.teams t
    where t.org_id = '00000000-0000-0000-0000-0000000000f1'
      and t.branch_id is not null and t.archived_at is null),
  7,
  'AC-012a: a second seed-shaped org gets its OWN seven stream teams — the SAME seven, three full branches x the activity catalog plus cikal/bar, proving the rule is org-generic and not pinned to the dev org — and its roastery branch is skipped identically (the roastery-zero assertion above spans all orgs)');

-- The count cannot tell WHICH seven — a rule that lost cikal/bar and gained roastery/kitchen holds
-- it. AC-012 promises the same SET.
select set_eq($$
  select b.code, t.activity
    from shared.teams t
    join shared.branches b on b.id = t.branch_id
   where t.org_id = '00000000-0000-0000-0000-0000000000f1'
     and t.branch_id is not null and t.archived_at is null
  $$, $$ values
    ('gordi_hq','kitchen'), ('gordi_hq','bar'),
    ('rumah_rames','kitchen'), ('rumah_rames','bar'),
    ('radiant','kitchen'), ('radiant','bar'),
    ('cikal','bar')
  $$,
  'AC-012a: the second org gets the SAME SET as the dev org, pair for pair — the catalog rule is org-generic in shape, not only in size');

select is(
  (select count(*)::int from shared.teams t
    where t.branch_id is not null and t.archived_at is null),
  14,
  'fourteen live stream teams now exist ACROSS orgs — which is what makes the member-enumeration test below prove org scoping rather than pass vacuously');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-001 — default-stream resolution from the live primary membership
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Fixture people in the dev org (no auth link needed — claims are set directly, the same pattern
-- as the mos suite). Names are fixture labels, not staff.
insert into shared.people (id, org_id, full_name) values
  ('47000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Stream Primary Fixture'),
  ('47000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','NonStream Primary Fixture'),
  ('47000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','No Team Fixture'),
  ('47000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Secondary Only Fixture'),
  ('47000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','Future Start Fixture'),
  ('47000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','Scheduled End Fixture');

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

-- Person 5: a primary membership that STARTS TOMORROW (open-ended, so it IS this person''s one
-- index-counted primary — which is exactly why the resolver must check effective_from itself).
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '10000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000005', t.id, true,
       current_date + 1
  from shared.teams t
 where t.org_id = '10000000-0000-0000-0000-000000000001'
   and t.code = 'gordi_hq_kitchen';

-- Person 6: a primary membership with a SCHEDULED END next week — on the team today, but no longer
-- the open-ended primary the substrate''s index polices.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from, effective_to)
select '10000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000006', t.id, true,
       current_date - 30, current_date + 7
  from shared.teams t
 where t.org_id = '10000000-0000-0000-0000-000000000001'
   and t.code = 'radiant_bar';

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
-- (FR-003), which needs all seven teams readable, not just the person''s own. FOURTEEN live stream
-- teams exist across orgs (asserted above: seven here, seven in org G), so this count proves RLS
-- org-scoping of the catalog, not merely that some rows exist somewhere. The two orgs holding the
-- SAME number is what makes this sharp: a leak of even one row reads as eight, never as a plausible
-- total.
select is(
  (select count(*)::int from shared.teams
    where branch_id is not null and archived_at is null),
  7,
  'FR-003: a member enumerates exactly their OWN org''s seven stream teams — org G''s seven are invisible; the switcher''s catalog is org-scoped by RLS');

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

-- ── The liveness boundary, both edges, pinned (review blocker on #263) ───────────────────────
-- The chosen rule: live = STARTED (effective_from <= today) AND OPEN-ENDED (effective_to IS NULL)
-- — deliberately the same predicate as team_memberships_one_primary, so at most one candidate row
-- exists BY INDEX and the resolution is deterministic without a tie-break. The cost, accepted on
-- purpose: a scheduled future end drops the default early, and the person picks explicitly
-- (FR-002/003) — a missing default costs a tap, a wrong default files production against the wrong
-- branch''s books. See the migration header for the full argument.
set local request.jwt.claims =
  '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"47000000-0000-0000-0000-000000000005","access_roles":["member"]}';
select is_empty($$
  select branch_id, activity from shared.default_stream()
  $$,
  'AC-001 boundary: a primary membership STARTING TOMORROW resolves no default today — even though it is the person''s one open-ended primary, the resolver checks effective_from itself');

set local request.jwt.claims =
  '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"47000000-0000-0000-0000-000000000006","access_roles":["member"]}';
select is_empty($$
  select branch_id, activity from shared.default_stream()
  $$,
  'AC-001 boundary: a primary membership with a SCHEDULED END next week resolves no default — live means open-ended, matching the substrate''s own one-live-primary index (decision recorded on the function)');

-- The determinism claim above rests on the index predicate staying what it is — pin it, so a
-- future relaxation of the index is forced to revisit the resolver''s semantics with it.
reset role;
select ok(
  (select indexdef from pg_indexes
    where schemaname = 'shared' and indexname = 'team_memberships_one_primary')
    ~* 'is_primary.*effective_to is null',
  'the one-live-primary index predicate is exactly the resolver''s liveness rule (is_primary AND effective_to IS NULL) — at most one candidate row can exist, so the default is deterministic by construction');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The seed CANNOT ship thin — the shortfall raise proven able to fire (review blocker on #263)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ON CONFLICT (org_id, code) DO NOTHING means an ordinary team already holding a reserved code
-- would silently swallow its stream team. The seeder validates pair-existence after inserting and
-- raises on any shortfall. Org H is that collision: seed-shaped (Retail Ops BU + branches), but an
-- ordinary NON-stream team already owns the code 'radiant_bar' — so the (radiant, bar) stream team
-- cannot be created under its reserved code, and the call must fail loudly, not seed five.
insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000a9','Stream Org H','stream-org-h');
insert into shared.business_units (id, org_id, name, code) values
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000a9','H Retail Ops','retail_ops');
insert into shared.branches (org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000a9','gordi_hq','H Gordi HQ'),
  ('00000000-0000-0000-0000-0000000000a9','rumah_rames','H Rumah Rames'),
  ('00000000-0000-0000-0000-0000000000a9','radiant','H Radiant');
insert into shared.teams (org_id, business_unit_id, name, code)
  values ('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000aa',
          'Ordinary Team Squatting a Reserved Code','radiant_bar');

select throws_ok(
  $$ select shared.seed_stream_teams() $$,
  'P0001', null,
  'AC-012a fail-loud: a reserved code held by a non-stream team makes the seeder RAISE — a five-stream catalog cannot ship silently (the check is proven able to fail)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OD-WAY-49 — the stream is a default, never a wall
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Originally: the whole slice touches NO policy. Since #236 (FR-040, OD-WAY-48) some policies may:
-- the spec's rule is "stream appears in the REVIEWER predicate only, never in member read/write
-- policies". Two assertions enforce that, and the second is the one that carries the meaning:
--
--   (1) the ALLOWLIST — which policies name a stream column at all. Named one by one, so a stream
--       leaking into an unreviewed predicate fails here rather than being absorbed silently.
--   (2) the RULE — every policy on that list reaches the stream THROUGH ops.is_stream_reviewer or
--       ops.can_review_stream. That is what makes a new entry principled instead of a rubber
--       stamp: a policy could join the list only by gating on the reviewer predicate, and a member
--       wall — `branch_id = <the caller's stream>` — would fail (2) even if somebody added it to (1).
--
-- #238 (FR-031) adds the two ops.stream_completeness WRITE policies: a stream's completeness is
-- confirmed by that stream's supervisor/lead, which is ops.can_review_stream, the same predicate
-- FR-040 defines and this slice reuses rather than re-derives. Its SELECT policy is deliberately
-- absent from the list — reading which streams are confirmed is org-wide (OD-WAY-49's posture:
-- org-wide read, scoped write).
-- (ops_12 proves the member arms of the kitchen-log policy are byte-identical to the baseline;
-- ops_14 proves the completeness policies refuse every unauthorised writer.)
reset role;
select set_eq($$
  select schemaname || '.' || tablename || ' :: ' || policyname from pg_policies
   where coalesce(qual,'') || ' ' || coalesce(with_check,'') ~* '(branch_id|\mactivity\M)'
  $$, $$ values
    ('ops.kitchen_logs :: kitchen_logs_update_own_or_reviewer'),
    ('ops.stream_completeness :: stream_completeness_insert_stream_lead'),
    ('ops.stream_completeness :: stream_completeness_update_stream_lead')
  $$,
  'OD-WAY-49: the only policies referencing a stream column are the #236 kitchen-log reviewer arm and the #238 completeness write arms — the stream is a capture default, never a member authorization dimension');

select is(
  (select coalesce(array_agg(schemaname || '.' || policyname order by policyname), '{}')
     from pg_policies
    where coalesce(qual,'') || ' ' || coalesce(with_check,'') ~* '(branch_id|\mactivity\M)'
      and coalesce(qual,'') || ' ' || coalesce(with_check,'') !~* '(is_stream_reviewer|can_review_stream)'),
  '{}'::text[],
  'OD-WAY-49: ...and every one of them reaches the stream through the REVIEWER predicate — no policy compares a stream column to the caller''s own, which is what a member wall would look like');

-- The two substrate tables' whole policy surface, enumerated. It was SELECT-only when this slice
-- landed; the two admin-write policies joined it on 2026-08-26 (20260826000001) so the admin screen
-- can put people on teams instead of that being a SQL edit.
--
-- That addition does not touch OD-WAY-49, which is about the STREAM: the two assertions above are
-- the ruling's teeth, and they still hold, because neither new policy mentions branch_id or
-- activity or compares a stream column to the caller's own. What the new policies add is an
-- admin-only maintenance surface over the org chart — which is the thing OD-WAY-49 says a Team
-- already IS ("the owner is describing the org chart that already exists").
--
-- Keep this list exhaustive. It is the guard that makes a NEW write policy on either table an
-- explicit decision rather than a diff nobody read — and on team_memberships that matters more
-- than usual, because membership is an authorization input for the Signal read gate and the team
-- post/start gates (shared_13_team_membership_writes.sql carries the who-is-refused assertions).
select set_eq($$
  select tablename || ' :: ' || policyname || ' :: ' || cmd from pg_policies
   where schemaname = 'shared' and tablename in ('teams','team_memberships')
  $$, $$ values
    ('teams :: teams_select_org :: SELECT'),
    ('team_memberships :: team_memberships_select_org :: SELECT'),
    ('team_memberships :: team_memberships_insert_admin :: INSERT'),
    ('team_memberships :: team_memberships_update_admin :: UPDATE')
  $$,
  'the team substrate''s policy set is exactly: org-scoped SELECT on both, plus admin-only INSERT/UPDATE on memberships');

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
