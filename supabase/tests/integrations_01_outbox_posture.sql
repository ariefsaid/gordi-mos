-- integrations, squashed baseline — the posture of the whole schema, and the fail-closed proof of
-- its policies (the outbox row's, and the approval group's since #432).
--
-- AC-005: RLS is enabled on every table in `integrations`. Asserted as a CATCH-ALL over the catalog
-- rather than against a list of names, so a table added by a later ticket without RLS fails THIS
-- file instead of quietly sitting outside its plan.
--
-- ⚠ THE POLICY THIS FILE PROVES WAS AUTHORED IN THE `ops` PASS, AND IS PROVEN AGAIN HERE ON PURPOSE.
-- integrations.esb_push had to land with `ops` because AC-012's enqueue refusal is a trigger and a
-- trigger needs its table, so ops_03_policy_fail_closed.sql carries a pair of assertions for
-- esb_push_select_ops_lead_or_admin. The rule this chain works to is that a re-authored policy is a NEW policy
-- whose fail-closed proof does not carry over — and the same reasoning says the proof of an
-- `integrations` policy belongs in the `integrations` suite, whichever migration happened to create
-- it. The assertions below were written here against the SQL, not copied. The overlap with ops_03 is
-- deliberate and is the cheaper of the two mistakes available.
--
-- The other half of this file is the VERIFY-DON'T-RE-CREATE criterion, discharged as assertions
-- rather than as a claim: the schema holds exactly the two tables asserted below, and the enqueue refusal really does
-- fire on INSERT *and* on an UPDATE that re-points source_ref, and really is revoked.
--
-- Personas, from the shared fixture:
--   Author    ...0d1  member + finance. Her ops_lead grant is seeded already-revoked, so she is a
--                     real member of the org who simply does not hold the role — the honest negative.
--   DirectMgr ...0d2  ops_lead. The positive subject.
--   GrandMgr  ...0d3  admin. The second positive, because the policy names two roles and a proof of
--                     one of them would leave the other untested.
--   ForeignMgr ...0b4 a real person of ORG B, claiming ops_lead or member as the cell requires.
--                     The other tenant's subject in every other-org cell below. She has to be a
--                     real directory row: current_org_id() resolves NULL for a person_id naming no
--                     live person, so an invented viewer would read zero for a reason that has
--                     nothing to do with these policies.
--
-- The role SWEEPS in D and E hold one subject fixed (DirectMgr ...0d2, a real live org-A row) and
-- vary only the claimed role. That is sound because shared.has_access_role() reads the role off the
-- JWT and makes no directory lookup — the person->role hop already happened in the token hook — so
-- a claim set is the honest way to ask "what would this predicate admit?", and varying nothing else
-- isolates the role axis exactly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- ── The two helpers the role sweeps in D and E run on ────────────────────────────────────────
-- Created here, as the owner, before any role is assumed. Both are pg_temp functions: they live for
-- this transaction only and leave nothing behind for another test to trip over.
--
-- check_literals() hands back every literal of a printed CHECK's `= ANY (ARRAY[...])`. Both sweeps
-- below are built on it, and so are the two fixture-coverage assertions: a fixture is only honest
-- if it covers the whole set its CHECK admits, and neither set may be restated by hand here.
--
-- IT MUST NOT BE ABLE TO DROP A NAME, and the version this replaces could. That one scanned the
-- printed constraint with `regexp_matches(..., '''([a-z_]+)''', 'g')`, so any name carrying a
-- digit, a hyphen or a capital — `b2b_lead`, `tier2`, `Auditor` — matched nothing and was silently
-- left out. A dropped name does not shorten the harvest into a visible mismatch: it leaves the
-- swept set exactly six long, so both sweeps below stayed GREEN while the vocabulary had in fact
-- grown. A sweep that can lose its own subject matter is worse than no sweep, because it is also a
-- standing claim that the subject matter was covered.
--
-- So nothing here decides what a name may look like. The array expression is lifted out WHOLE and
-- handed back to the parser that printed it — whatever Postgres wrote as a literal, Postgres reads
-- back, digits, hyphens, capitals and embedded quotes alike. There is no character class left to be
-- wrong about, and the round trip is exact by construction rather than by enumerating the cases
-- someone happened to think of.
--
-- The only two outcomes are "every element of the array" and an EXCEPTION. If a constraint is ever
-- re-spelled into a shape this cannot lift — a regex, a subquery, a lookup table — this raises and
-- the file dies loudly. It cannot return a SHORT list, which is the one failure that goes unnoticed.
create function pg_temp.check_literals(p_def text) returns setof text
language plpgsql stable as $$
declare
  v_array_expr text := substring(p_def from 'ARRAY\[(.*)\]');
  v_literal    text;
begin
  if v_array_expr is null then
    raise exception
      'check_literals(): this constraint no longer states its set as an array of literals, so it '
      'cannot be harvested: %. Re-teach the harvest before trusting any sweep that runs on it.',
      p_def;
  end if;
  -- Postgres parses back what Postgres printed. An expression this cannot evaluate raises here
  -- rather than yielding a shorter list.
  for v_literal in execute format('select unnest(array[%s])::text', v_array_expr) loop
    return next v_literal;
  end loop;
end $$;

-- access_role_vocabulary() reads the access-role set out of the shared.access_role domain's own
-- CHECK rather than restating it here. #216 put that set in ONE place precisely because it grows —
-- it has grown twice already — and a sweep carrying its own copy of the list would go stale in
-- exactly the way a hand-written persona matrix does. A domain with no CHECK at all would harvest
-- to nothing and sweep nothing, which passes, so that case raises too.
create function pg_temp.access_role_vocabulary() returns setof text
language plpgsql stable as $$
declare
  v_def  text;
  v_seen int := 0;
  v_role text;
begin
  for v_def in
    select pg_get_constraintdef(c.oid)
      from pg_constraint c
     where c.contypid = 'shared.access_role'::regtype
  loop
    v_seen := v_seen + 1;
    for v_role in select * from pg_temp.check_literals(v_def) loop
      return next v_role;
    end loop;
  end loop;
  if v_seen = 0 then
    raise exception
      'access_role_vocabulary(): shared.access_role carries no CHECK constraint — there is no '
      'vocabulary to sweep, and an empty sweep would pass.';
  end if;
end $$;

-- reads_as() answers "how many rows of p_rel does a session claiming exactly p_role see?".
-- SECURITY INVOKER, so the number is the CALLING session's count under RLS and not the owner's.
--
-- IT PUTS THE CALLER'S CLAIM BACK. The claim it sets is transaction-local and would otherwise
-- outlive the call, leaving request.jwt.claims holding whichever role the aggregate evaluated
-- last — and `order by v.role` in the sweeps orders the RESULTS, not the calls, so which one that
-- is is not even determined. The previous answer to that was a comment promising nothing read the
-- claim afterwards. A promise about the rest of the file is not an invariant: it holds only until
-- someone adds a line below a sweep. So the helper saves the claim on entry and restores it on
-- exit, and a sweep is now invisible to everything around it whatever else the file grows. The
-- assertion straight after the D8 sweep proves the restore actually happens rather than asserting
-- it in prose. ('' and unset are the same thing to shared._claim_uuid — both fail closed — so a
-- call made with no claim in force restores to no claim in force.)
create function pg_temp.reads_as(p_person uuid, p_org uuid, p_role text, p_rel text)
returns int language plpgsql security invoker as $$
declare
  n       int;
  v_prior text := current_setting('request.jwt.claims', true);
begin
  perform set_config('request.jwt.claims',
    json_build_object('org_id', p_org, 'person_id', p_person,
                      'access_roles', json_build_array(p_role))::text, true);
  execute format('select count(*)::int from %s', p_rel) into n;
  perform set_config('request.jwt.claims', v_prior, true);
  return n;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. AC-005 — RLS posture, over the catalog
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'integrations' and c.relkind = 'r' and not c.relrowsecurity),
  '{}'::name[],
  'AC-005: every table in integrations has row-level security ENABLED (empty = none missing)');

select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'integrations' and c.relkind = 'r' and not c.relforcerowsecurity),
  '{}'::name[],
  'AC-005: every table in integrations has row-level security FORCED — the owner is not exempt');

-- The verify-don't-re-create criterion, as an assertion. If this pass had duplicated the outbox
-- under another name, or added a table nobody proved, the set below would not be a single element.
select is(
  (select array_agg(c.relname order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'integrations' and c.relkind = 'r'),
  array['esb_push','esb_push_groups']::name[],
  'integrations holds the outbox and the explicit approval-group table, each with its own owner and tests');

select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'integrations' and c.relkind = 'r'
      and not exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid and a.attname = 'org_id'
                         and a.attnum > 0 and not a.attisdropped)),
  '{}'::name[],
  'org seam: every table in integrations carries org_id, so there is a seam for a policy to enforce');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. Privilege, where privilege is the control
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The app tier reads and never writes. That is held by the ABSENCE of a grant, which fails closed
-- with nothing to widen, rather than by the absence of a policy, which is one CREATE POLICY away
-- from being no control at all.
select ok(not has_table_privilege('authenticated','integrations.esb_push','INSERT')
      and not has_table_privilege('authenticated','integrations.esb_push','UPDATE'),
  'the app tier cannot write posting state: enqueue is the approval path''s, status flips are the worker''s');

select ok(has_table_privilege('authenticated','integrations.esb_push','SELECT'),
  '...and it IS readable, so the assertion above is a write gate and not an unreachable table');

-- A posting record is evidence that an ERP document was asked for. Neither tier may destroy one,
-- and the worker is included deliberately: "never silently dropped" has to bind the process that
-- would be doing the dropping.
select ok(not has_table_privilege('authenticated','integrations.esb_push','DELETE')
      and not has_table_privilege('service_role','integrations.esb_push','DELETE'),
  'NFR-002: neither the app tier NOR the worker holds DELETE on the outbox — a push cannot be made to disappear');

select ok(has_table_privilege('service_role','integrations.esb_push','SELECT')
      and has_table_privilege('service_role','integrations.esb_push','UPDATE')
      and not has_table_privilege('service_role','integrations.esb_push','INSERT'),
  'the worker may read outbox rows and flip their status, and may NOT create one — enqueue belongs to the approval path alone');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. Each table carries exactly one policy, and each is a read policy
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Asserted structurally as well as behaviourally: "there is no INSERT or UPDATE policy" is a claim
-- about what does NOT exist, and the catalog is the only place that can answer it.
select is(
  (select array_agg(p.policyname || ':' || p.cmd order by p.policyname)
     from pg_policies p where p.schemaname = 'integrations'),
  array['esb_push_groups_select_ops_lead_or_admin:SELECT','esb_push_select_ops_lead_or_admin:SELECT']::text[],
  'integrations policies are SELECT-only — no write policy exists to be widened');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. esb_push_select_ops_lead_or_admin — the four cells the predicate actually admits
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The predicate is a conjunction — org AND (ops_lead OR admin) — so proving it takes both axes, and
-- proving it takes the POSITIVE cell as much as the negatives: a policy that admitted nobody at all
-- would satisfy every "reads zero" on its own. The four cells, per issue 474:
--
--                          own org (A)                       other org (B)
--   admitted role          reads the row  (D2, D3)           reads NONE of A's  (D5)
--   unadmitted role        reads zero     (D1)               reads zero         (D7)
--
-- Each negative is paired with a read that proves the session is not simply blind: D1 sits beside
-- D2/D3 in the same org, and D5 sits beside D6, which is the same org-B session counting its OWN
-- org's row. Without that pairing "reads zero" would be satisfied by a broken session, an empty
-- table, or a policy that denies everyone.
--
-- The four cells pin the ORG axis. They do NOT pin the admitted SET, because the unadmitted persona
-- holds the two roles she happens to hold and no others — so the sweep at the end of this section
-- carries the role axis, over the whole vocabulary. Both halves are needed: the sweep says nothing
-- about org, and the cells say nothing about a role nobody in them holds.
--
-- ── The population both axes are read against ────────────────────────────────────────────────
-- ops._test_seed_cafe() seeds ONE outbox row per org (...ba01 in A, ...ba09 in B), and both are
-- `pending`. Read against that population alone, every count in this section is a count of pending
-- rows — which means a widening scoped to any OTHER row state is invisible to all of them. That is
-- not a hypothetical shape: `or (status <> 'pending' and shared.has_access_role('manager'))` is
-- what a "let managers watch the stuck and failed posts" ticket actually looks like, and against a
-- pending-only fixture it changes no number anywhere in this file.
--
-- So the other four states the outbox really reaches are seeded here, as the owner, before any
-- role is assumed: each org ends up with exactly one row per status of the table's five-state
-- CHECK. Every count below is therefore five, and a widening scoped to any single state moves it.
--
-- STATUS IS NOT THE ONLY COLUMN A PREDICATE COULD BE SCOPED TO, and every one the fixture holds
-- CONSTANT is the same blind spot wearing a different column name — the seeded rows are `kitchen`
-- / `assembly-actual` / `dry_run` / retry 0 to a row, so `or (endpoint = 'noop' and ...)` would
-- have been just as invisible as the status version. Spanning those costs nothing here: the same
-- five rows carry every value of every enumerated column between them (both source_modules, all
-- three endpoints, all three target_envs) and a spread of retry counts, rather than five rows that
-- differ only in status. What is NOT covered, and cannot be by enumeration, is a predicate keyed
-- on a specific COMBINATION these five rows do not happen to form, or on an unbounded column at a
-- value they do not take.
--
-- source_ref names no kitchen batch on purpose. The enqueue refusal is a live trigger on this
-- table and it refuses only a batch already marked posted to the ERP; an unmatched ref looks up
-- NULL and is admitted. These rows therefore seed without the fixture having to weaken the guard
-- that the two seeded rows were deliberately chosen to respect.
insert into integrations.esb_push
  (id, org_id, source_module, source_ref, endpoint, target_env, dedup_key, status, retry_count, posted_at) values
  ('00000000-0000-0000-0000-00000000ba02','00000000-0000-0000-0000-0000000000a1','kitchen', 'PR-POSTURE-A-INFLIGHT','simple-transfer','goo',    'kitchen|PR-POSTURE-A-INFLIGHT|goo',    'in_flight',   1, null),
  ('00000000-0000-0000-0000-00000000ba03','00000000-0000-0000-0000-0000000000a1','kitchen', 'PR-POSTURE-A-POSTED',  'noop',           'gkid',   'kitchen|PR-POSTURE-A-POSTED|gkid',     'posted',      0, now()),
  ('00000000-0000-0000-0000-00000000ba04','00000000-0000-0000-0000-0000000000a1','roastery','PR-POSTURE-A-FAILED',  'assembly-actual','goo',    'roastery|PR-POSTURE-A-FAILED|goo',     'failed',      3, null),
  ('00000000-0000-0000-0000-00000000ba05','00000000-0000-0000-0000-0000000000a1','kitchen', 'PR-POSTURE-A-DEAD',    'noop',           'dry_run','kitchen|PR-POSTURE-A-DEAD|dry_run',    'dead_letter', 7, null),
  ('00000000-0000-0000-0000-00000000ba0a','00000000-0000-0000-0000-0000000000b1','kitchen', 'PR-POSTURE-B-INFLIGHT','simple-transfer','goo',    'kitchen|PR-POSTURE-B-INFLIGHT|goo',    'in_flight',   1, null),
  ('00000000-0000-0000-0000-00000000ba0b','00000000-0000-0000-0000-0000000000b1','kitchen', 'PR-POSTURE-B-POSTED',  'noop',           'gkid',   'kitchen|PR-POSTURE-B-POSTED|gkid',     'posted',      0, now()),
  ('00000000-0000-0000-0000-00000000ba0c','00000000-0000-0000-0000-0000000000b1','roastery','PR-POSTURE-B-FAILED',  'assembly-actual','goo',    'roastery|PR-POSTURE-B-FAILED|goo',     'failed',      3, null),
  ('00000000-0000-0000-0000-00000000ba0d','00000000-0000-0000-0000-0000000000b1','kitchen', 'PR-POSTURE-B-DEAD',    'noop',           'dry_run','kitchen|PR-POSTURE-B-DEAD|dry_run',    'dead_letter', 7, null);

-- The fixture is only worth its numbers if it really covers the state space, so that is asserted
-- against the table's own CHECK rather than assumed. A state added by a later migration and not
-- seeded here reopens exactly the blind spot above — and it reddens HERE, instead of passing
-- quietly as a count that happens to still match.
select is(
  (select array_agg(distinct e.status order by e.status)
     from integrations.esb_push e where e.org_id = '00000000-0000-0000-0000-0000000000a1'),
  (select array_agg(s order by s)
     from pg_constraint c
     cross join lateral pg_temp.check_literals(pg_get_constraintdef(c.oid)) s
    where c.conrelid = 'integrations.esb_push'::regclass
      and c.conname = 'esb_push_status_check'),
  'the outbox fixture covers EVERY posting state the table admits, so a widening scoped to one state cannot hide behind an all-pending population');

set local role authenticated;

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from integrations.esb_push), 0,
  'esb_push_select_ops_lead_or_admin fails closed: a member of the org without ops_lead or admin reads zero outbox rows');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from integrations.esb_push), 5,
  'esb_push_select_ops_lead_or_admin (positive, ops_lead): reads their own org''s outbox rows in ALL five posting states — so the zero above is the role gate, not an empty table');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}';
select is((select count(*)::int from integrations.esb_push), 5,
  'esb_push_select_ops_lead_or_admin (positive, admin): the policy names two roles and both are proven, not one and an assumption');

-- ...and the org half of the same predicate, which the role half would otherwise mask.
select is((select count(*)::int from integrations.esb_push
            where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'esb_push_select_ops_lead_or_admin: an admin sees NONE of the other tenant''s outbox rows — the org half of the predicate holds under the strongest same-org persona');

-- The other-org cells, read by ForeignMgr (...0b4) — see the persona table at the head of the file
-- for why the other tenant's subject has to be a real directory row.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from integrations.esb_push
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'esb_push_select_ops_lead_or_admin (other org, admitted role): an ops_lead of the OTHER tenant reads none of org A''s outbox rows — holding the role is not enough');

select is((select count(*)::int from integrations.esb_push), 5,
  'esb_push_select_ops_lead_or_admin: ...and that same other-tenant session reads its OWN org''s five rows, so the zero above is the org half of the predicate and not a blind session');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from integrations.esb_push), 0,
  'esb_push_select_ops_lead_or_admin (other org, unadmitted role): the fourth cell reads zero — neither half of the conjunction is satisfied');

-- ── D8. The admitted SET, swept over the whole role vocabulary ───────────────────────────────
-- One assertion whose CONTENT is the admitted set: every role the shared.access_role domain allows,
-- next to what a session claiming only that role may read. It goes red when
--   • any unadmitted role is added to the predicate       — its cell flips 0 -> 1;
--   • either admitted role is dropped from it             — its cell flips 1 -> 0;
--   • the vocabulary grows a seventh role                 — the array is a different length, which
--     is the point: a new role does not get to arrive unproven here, which is how `manager` and
--     `supervisor` came to be invisible to the four cells above in the first place. That last one
--     only holds because the harvest cannot drop a name — see check_literals() above for the
--     version that could, and for how far it silently under-swept while reading as green.
-- It is behavioural, so it survives any rewrite of how the predicate is SPELLED and still answers
-- the only question that matters — who gets in. A rewrite that preserves the set passes, and that
-- is correct: this file pins what the policy admits, not how it is worded (section C already pins
-- the policy's name and command structurally).
-- The two `=1` cells are the sweep's own anchor: same mechanism, same transaction, so the zeros
-- cannot be a blind session, an empty table, or a policy that denies everyone.
select is(
  (select array_agg(v.role || '=' || pg_temp.reads_as(
            '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1',
            v.role, 'integrations.esb_push') order by v.role)
     from pg_temp.access_role_vocabulary() v(role)),
  array['admin=5','finance=0','manager=0','member=0','ops_lead=5','supervisor=0']::text[],
  'esb_push_select_ops_lead_or_admin admits EXACTLY ops_lead and admin out of the whole access-role vocabulary — every other role the domain allows reads zero, and both admitted roles read every posting state');

-- ...and the sweep left the session exactly as it found it. This is the enforced half of what used
-- to be a comment promising the sweep was always the last statement before a `reset role`. The
-- claim in force here is the one set above the sweep, not the role that happened to be evaluated
-- last: if reads_as() stopped restoring, this would hold a single-role claim for ...0d2 in org A.
select is(
  current_setting('request.jwt.claims', true),
  '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}',
  'the role sweep restores the caller''s claim: request.jwt.claims still holds the session that was in force before it, so no assertion after a sweep can be reading a claim the sweep left behind');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- E. esb_push_groups_select_ops_lead_or_admin — the same four cells, on the approval-group table
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The group table carries its own policy, so it needs its own behavioural proof: a widening of THIS
-- predicate is invisible to every assertion made about the outbox row's. The fixtures seed no
-- approval groups — a group is minted by a bulk approval, not by the catalog fixture — so they are
-- inserted here, as the owner, before any role is assumed.
--
-- The group table carries the SAME five-state status as the outbox row, so it carries the same
-- blind spot, and it is closed the same way: one group per state per org rather than one pending
-- group per org. Every count in this section is therefore five.
-- target_env is spanned across the same five rows for the same reason it is on the outbox: a
-- column the fixture holds constant is a column a predicate can be scoped to for free.
-- source_module is not spanned because the group table's CHECK admits only 'kitchen'.
insert into integrations.esb_push_groups (id, org_id, target_env, dedup_key, status, posted_at) values
  ('00000000-0000-0000-0000-00000000bd01','00000000-0000-0000-0000-0000000000a1','dry_run','kitchen-group|posture-org-a-pending|dry_run',  'pending',     null),
  ('00000000-0000-0000-0000-00000000bd02','00000000-0000-0000-0000-0000000000a1','goo',    'kitchen-group|posture-org-a-inflight|goo',     'in_flight',   null),
  ('00000000-0000-0000-0000-00000000bd03','00000000-0000-0000-0000-0000000000a1','gkid',   'kitchen-group|posture-org-a-posted|gkid',      'posted',      now()),
  ('00000000-0000-0000-0000-00000000bd04','00000000-0000-0000-0000-0000000000a1','goo',    'kitchen-group|posture-org-a-failed|goo',       'failed',      null),
  ('00000000-0000-0000-0000-00000000bd05','00000000-0000-0000-0000-0000000000a1','dry_run','kitchen-group|posture-org-a-dead|dry_run',     'dead_letter', null),
  ('00000000-0000-0000-0000-00000000bd09','00000000-0000-0000-0000-0000000000b1','dry_run','kitchen-group|posture-org-b-pending|dry_run',  'pending',     null),
  ('00000000-0000-0000-0000-00000000bd0a','00000000-0000-0000-0000-0000000000b1','goo',    'kitchen-group|posture-org-b-inflight|goo',     'in_flight',   null),
  ('00000000-0000-0000-0000-00000000bd0b','00000000-0000-0000-0000-0000000000b1','gkid',   'kitchen-group|posture-org-b-posted|gkid',      'posted',      now()),
  ('00000000-0000-0000-0000-00000000bd0c','00000000-0000-0000-0000-0000000000b1','goo',    'kitchen-group|posture-org-b-failed|goo',       'failed',      null),
  ('00000000-0000-0000-0000-00000000bd0d','00000000-0000-0000-0000-0000000000b1','dry_run','kitchen-group|posture-org-b-dead|dry_run',     'dead_letter', null);

-- Same coverage assertion as the outbox's, against the group table's own CHECK.
select is(
  (select array_agg(distinct g.status order by g.status)
     from integrations.esb_push_groups g where g.org_id = '00000000-0000-0000-0000-0000000000a1'),
  (select array_agg(s order by s)
     from pg_constraint c
     cross join lateral pg_temp.check_literals(pg_get_constraintdef(c.oid)) s
    where c.conrelid = 'integrations.esb_push_groups'::regclass
      and c.conname = 'esb_push_groups_status_check'),
  'the approval-group fixture covers EVERY status the group table admits, so a state-scoped widening of ITS predicate cannot hide either');

set local role authenticated;

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from integrations.esb_push_groups), 5,
  'esb_push_groups_select_ops_lead_or_admin (own org, ops_lead): reads their own org''s approval groups in ALL five states — the positive cell the negatives below are the negatives OF');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}';
select is((select count(*)::int from integrations.esb_push_groups), 5,
  'esb_push_groups_select_ops_lead_or_admin (own org, admin): the policy names two roles and both are proven on the group table too');

select is((select count(*)::int from integrations.esb_push_groups
            where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'esb_push_groups_select_ops_lead_or_admin: an admin sees NONE of the other tenant''s approval groups — the org half, under the strongest same-org persona');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from integrations.esb_push_groups), 0,
  'esb_push_groups_select_ops_lead_or_admin fails closed (own org, unadmitted role): a member of the org without ops_lead or admin reads zero approval groups');

-- ...and the pairing that zero needs, in the SAME session rather than a neighbouring one. A session
-- whose person_id no longer names a live directory row has current_org_id() NULL and reads zero from
-- everything, for a reason that has nothing to do with this policy. shared.orgs is gated on exactly
-- that seam (`id = shared.current_org_id()`), so one row here means this session resolves to org A
-- and its org half is open — and the zero above is therefore the role gate.
select is((select count(*)::int from shared.orgs), 1,
  'esb_push_groups_select_ops_lead_or_admin: ...and that same unadmitted session still resolves to its own org and reads its org row, so the zero above is the role gate and not a dead session');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from integrations.esb_push_groups
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'esb_push_groups_select_ops_lead_or_admin (other org, admitted role): an ops_lead of the OTHER tenant reads none of org A''s approval groups');

select is((select count(*)::int from integrations.esb_push_groups), 5,
  'esb_push_groups_select_ops_lead_or_admin: ...and that same other-tenant session reads its OWN org''s five groups — the zero above is the org half, not a blind session');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from integrations.esb_push_groups), 0,
  'esb_push_groups_select_ops_lead_or_admin (other org, unadmitted role): the fourth cell reads zero on the group table as well');

-- ── The admitted SET on the group table, swept the same way ──────────────────────────────────
-- The group table's predicate is its own, so its admitted set is its own claim to prove: a widening
-- of THIS one is invisible to D8. Same sweep, same subject, same reading — see D8 for what each
-- cell buys.
select is(
  (select array_agg(v.role || '=' || pg_temp.reads_as(
            '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1',
            v.role, 'integrations.esb_push_groups') order by v.role)
     from pg_temp.access_role_vocabulary() v(role)),
  array['admin=5','finance=0','manager=0','member=0','ops_lead=5','supervisor=0']::text[],
  'esb_push_groups_select_ops_lead_or_admin admits EXACTLY ops_lead and admin out of the whole access-role vocabulary — every other role the domain allows reads zero approval groups');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- F. The enqueue refusal authored in the ops pass — verified here, not assumed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-012's behaviour is proven in ops_07_enqueue_refusal.sql. What is checked here is the SHAPE this
-- ticket was told to verify: that the trigger covers the re-point path as well as the enqueue, and
-- that the function behind it is not itself a reachable RPC.
select matches(
  (select pg_get_triggerdef(t.oid) from pg_trigger t
     where t.tgrelid = 'integrations.esb_push'::regclass and t.tgname = 'esb_push_not_posted_guard'),
  'BEFORE INSERT OR UPDATE OF source_ref',
  'the enqueue refusal fires on INSERT *and* on an UPDATE that re-points source_ref — enqueue is not the only way to arrive at a posted batch');

select ok(not has_function_privilege('authenticated','integrations._guard_esb_push_not_posted()','EXECUTE')
      and not has_function_privilege('anon','integrations._guard_esb_push_not_posted()','EXECUTE'),
  'the refusal''s trigger function is not a callable RPC: execute is revoked, not left on the default PUBLIC grant');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- G. The target-env helper added by this pass
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `integrations` is exposed through PostgREST. Which environment the outbox is pointed at is
-- operational state, and nothing in the app tier calls this — the only caller is the approval path,
-- which runs as the owner.
select ok(not has_function_privilege('authenticated','integrations.current_esb_target_env()','EXECUTE')
      and not has_function_privilege('anon','integrations.current_esb_target_env()','EXECUTE'),
  'integrations.current_esb_target_env() is not reachable from the app tier');

select is(integrations.current_esb_target_env(), 'dry_run',
  'FR-080: with no GUC set the target environment is dry_run — the default is the safe one, not the live one');

select * from finish();
rollback;
