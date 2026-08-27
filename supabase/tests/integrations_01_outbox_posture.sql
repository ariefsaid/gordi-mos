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
-- vary only the claimed role SET — one name at a time in D8/E, and then every subset of the
-- vocabulary in D9 and its counterpart. That is sound because shared.has_access_role() reads the
-- roles off the JWT and makes no directory lookup — the person->role hop already happened in the
-- token hook — so a claim set is the honest way to ask "what would this predicate admit?", and
-- varying nothing else isolates the role axis exactly. Varying nothing else is also the limit of
-- what the sweeps can see, and D9 states that limit in full.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- ── The two helpers the role sweeps in D and E run on ────────────────────────────────────────
-- Created here, as the owner, before any role is assumed. Both are pg_temp functions: they live for
-- this transaction only and leave nothing behind for another test to trip over.
--
-- check_literals() hands back the set of values a printed CHECK admits — or it RAISES. Both sweeps
-- below are built on it, and so are the two fixture-coverage assertions: a fixture is only honest
-- if it covers the whole set its CHECK admits, and neither set may be restated by hand here.
--
-- IT MUST NOT BE ABLE TO RETURN A SHORT SET, and BOTH of the versions this replaces could.
--   • The first scanned the printed constraint with `regexp_matches(..., '''([a-z_]+)''', 'g')`, so
--     any name carrying a digit, a hyphen or a capital — `b2b_lead`, `tier2`, `Auditor` — matched
--     nothing and was silently dropped.
--   • The second lifted the array out with an UNANCHORED `substring(p_def from 'ARRAY\[(.*)\]')`.
--     A CHECK that states its set as an array PLUS an extra disjunct — `... = ANY (ARRAY[…]) or
--     value = 'auditor'` — harvested as just the array, and `auditor` was invisible.
-- Neither failure shortens the harvest into a visible mismatch: the swept set stays exactly as long
-- as the fixture expects, so both sweeps below read GREEN while the vocabulary had in fact grown. A
-- sweep that can lose its own subject matter is worse than no sweep, because it is also a standing
-- claim that the subject matter was covered.
--
-- So the harvest is now pinned by TWO independent nets, and a value the domain admits has to get
-- past BOTH of them to go unreported. Either one alone refuses the disjunct shape above.
--
--   NET 1 — SHAPE, ANCHORED AT BOTH ENDS. The whole printed definition must be, end to end, one
--   `<subject> = ANY (ARRAY[…])` test and nothing besides. `^CHECK \(\(` and `\]\)\)\)$` pin the
--   two ends, and `[^()]+` for the subject is what refuses a LEADING disjunct: an OR prints its
--   own parentheses, and parentheses cannot appear there. There is no partial understanding
--   available — a shape this does not match whole is a shape it raises on. A regex re-spelling, a
--   function call, a subquery, an AND-narrowing, two arrays OR'd together: none of them match, and
--   all of them raise.
--
--   NET 2 — LITERAL CENSUS, over the WHOLE definition. Every SQL string literal written anywhere in
--   the text is scanned out (quote-aware, so `''` inside a literal is read as one quote and no
--   character class decides what a name may contain), and that census must equal the set lifted out
--   of the array EXACTLY. A value admitted from outside the array — the `auditor` disjunct — is
--   spelled in the definition but missing from the lift, and the two sets disagree. Net 2 needs no
--   grammar at all: it only asks whether the harvest accounted for every name the constraint names.
--
-- Between the lift and the two nets, nothing here decides what a name may LOOK like. The array
-- expression is handed back WHOLE to the parser that printed it — whatever Postgres wrote as a
-- literal, Postgres reads back, digits, hyphens, capitals and embedded quotes alike. The round trip
-- is exact by construction rather than by enumerating the cases someone happened to think of.
--
-- The only two outcomes are "every value the constraint admits" and an EXCEPTION. Section H at the
-- foot of this file holds that contract as assertions rather than as this comment: the two disjunct
-- shapes, the regex re-spelling and the two-array shape are each fed in by hand and each must
-- raise, and a positive control proves the harvest is not simply a function that always raises.
create function pg_temp.check_literals(p_def text) returns setof text
language plpgsql stable as $fn$
declare
  v_array  text;
  v_lifted text[];
  v_census text[];
begin
  -- NET 1 — shape, anchored at both ends.
  v_array := substring(p_def from '^CHECK \(\([^()]+ = ANY \(ARRAY\[(.*)\]\)\)\)$');
  if v_array is null then
    raise exception
      'check_literals(): refuses this constraint. It is not, end to end, a single '
      '`<subject> = ANY (ARRAY[...])` test, so the set it admits cannot be read off it, and a '
      'partial reading would be a SHORT set that passes: %. Re-teach the harvest before trusting '
      'any sweep that runs on it.', p_def;
  end if;

  -- The values, from the parser that printed them. An expression this cannot evaluate raises here
  -- rather than yielding a shorter list.
  execute format(
    'select array_agg(x order by x) from (select distinct v::text as x from unnest(array[%s]) v) s',
    v_array) into v_lifted;

  if v_lifted is null or cardinality(v_lifted) = 0 then
    raise exception
      'check_literals(): harvested an EMPTY set, and an empty sweep passes: %', p_def;
  end if;

  -- NET 2 — literal census over the whole definition, quote-aware.
  select array_agg(x order by x) into v_census
    from (select distinct replace(m[1], $q$''$q$, $q$'$q$) as x
            from regexp_matches(p_def, $rx$'((?:[^']|'')*)'$rx$, 'g') m) s;

  if v_lifted is distinct from v_census then
    raise exception
      'check_literals(): refuses this constraint. The values it admits (%) are not the whole set '
      'of literals spelled in it (%), so at least one admitted value sits outside the array this '
      'harvest reads: %', v_lifted, v_census, p_def;
  end if;

  return query select unnest(v_lifted);
end $fn$;

-- access_role_vocabulary() reads the access-role set out of the shared.access_role domain's own
-- CHECK rather than restating it here. #216 put that set in ONE place precisely because it grows —
-- it has grown twice already — and a sweep carrying its own copy of the list would go stale in
-- exactly the way a hand-written persona matrix does. A domain with no CHECK at all would harvest
-- to nothing and sweep nothing, which passes, so that case raises too.
--
-- AND THEN IT ASKS THE DOMAIN. Everything above this point reads TEXT that Postgres printed; the
-- last step hands each harvested name back to the live domain as a cast and requires the domain to
-- accept it. That is the database answering for itself, and it cannot be misparsed the way a
-- printed constraint can. It is a cross-check on the reading, not a second source for the set:
-- a disagreement raises. Its own direction is proven live by the sentinel in section H, without
-- which "the domain accepts every name we reported" would be satisfied by a domain that accepts
-- everything.
--
-- A domain constraint can only ever NARROW what the domain admits (multiple CHECKs are ANDed), so
-- taking the union across them cannot under-report; the loop is a superset by construction.
create function pg_temp.access_role_vocabulary() returns setof text
language plpgsql stable as $fn$
declare
  v_def   text;
  v_seen  int := 0;
  v_roles text[] := '{}';
  v_role  text;
begin
  for v_def in
    select pg_get_constraintdef(c.oid)
      from pg_constraint c
     where c.contypid = 'shared.access_role'::regtype
  loop
    v_seen := v_seen + 1;
    v_roles := v_roles || (select array_agg(s) from pg_temp.check_literals(v_def) s);
  end loop;

  if v_seen = 0 then
    raise exception
      'access_role_vocabulary(): shared.access_role carries no CHECK constraint — there is no '
      'vocabulary to sweep, and an empty sweep would pass.';
  end if;

  foreach v_role in array v_roles loop
    begin
      perform cast(v_role as shared.access_role);
    exception when others then
      raise exception
        'access_role_vocabulary(): the harvest reported %, which the live shared.access_role '
        'domain itself REJECTS — the printed constraint and the domain disagree, and the set '
        'swept below would be a reading of neither.', v_role;
    end;
  end loop;

  return query select unnest(v_roles);
end $fn$;

-- reads_as() answers "how many rows of p_rel does a session claiming exactly the role set p_roles
-- see?". It takes a SET and not a single name because the sweeps below vary the whole claim: one
-- role at a time cannot ask what a COMBINATION of roles opens. See D9.
-- SECURITY INVOKER, so the number is the CALLING session's count under RLS and not the owner's.
--
-- IT PUTS THE CALLER'S CLAIM BACK. The claim it sets is transaction-local and would otherwise
-- outlive the call, leaving request.jwt.claims holding whichever role the aggregate evaluated
-- last — and `order by v.role` in the sweeps orders the RESULTS, not the calls, so which one that
-- is is not even determined. The previous answer to that was a comment promising nothing read the
-- claim afterwards. A promise about the rest of the file is not an invariant: it holds only until
-- someone adds a line below a sweep. So the helper saves the claim on entry and restores it on
-- exit, and a sweep is now invisible to everything around it whatever else the file grows. The
-- assertion that follows the sweeps in each section proves the restore actually happens rather
-- than asserting it in prose. ('' and unset are the same thing to shared._claim_uuid — both fail
-- closed — so a call made with no claim in force restores to no claim in force.)
create function pg_temp.reads_as(p_person uuid, p_org uuid, p_roles text[], p_rel text)
returns int language plpgsql security invoker as $$
declare
  n       int;
  v_prior text := current_setting('request.jwt.claims', true);
begin
  perform set_config('request.jwt.claims',
    json_build_object('org_id', p_org, 'person_id', p_person,
                      'access_roles', array_to_json(p_roles))::text, true);
  execute format('select count(*)::int from %s', p_rel) into n;
  perform set_config('request.jwt.claims', v_prior, true);
  return n;
end $$;

-- role_combinations() hands back EVERY subset of the vocabulary it is given — the power set, empty
-- claim and full house included — as the subject matter of the two combination sweeps in D and E.
-- Its callers pass access_role_vocabulary(), so nothing here re-states the set or decides what a
-- role name may look like; it takes the vocabulary as an ARGUMENT only so that the two refusals
-- below can be fed one by hand in section H and proven to fire, exactly as check_literals()' are.
--
-- IT IS EXPONENTIAL, AND THAT IS THE WHOLE COST OF THE EXHAUSTIVE CUT. A probe is one set_config
-- plus one count(*) over a ten-row table, so the 64 subsets today's six roles produce are
-- milliseconds per table and buying anything less would be a saving nobody can spend. But the
-- count DOUBLES with every role the vocabulary grows, and it has grown twice. A ceiling is
-- therefore stated here and RAISES when it is reached, so that "the exhaustive sweep is no longer
-- cheap" arrives as a decision to make rather than as a suite that quietly got slow. Raising it,
-- or cutting the coverage down to pairs and saying so in the assertions, are both fine — doing
-- neither, by accident, is not.
--
-- Subsets come out in canonical form: elements in the vocabulary's own sorted order, no repeats,
-- each subset exactly once. H8 asserts that rather than trusting it, because "no subset misbehaved"
-- is worth nothing if the subsets were not all there.
create function pg_temp.role_combinations(p_roles text[]) returns setof text[]
language plpgsql stable as $fn$
declare
  v_roles text[];
  n       int;
begin
  select array_agg(distinct r order by r) into v_roles from unnest(p_roles) r;
  n := coalesce(cardinality(v_roles), 0);

  if n = 0 then
    raise exception
      'role_combinations(): the vocabulary handed in is EMPTY, so the power set is a single empty '
      'claim and the sweep built on it would pass having asked nothing.';
  end if;

  if n > 12 then
    raise exception
      'role_combinations(): the vocabulary handed in holds % names, so the power set is % '
      'subsets per table and doubles again with the next role. The sweeps in D and E are '
      'exhaustive by construction; past this point that has to be chosen rather than discovered. '
      'Raise this ceiling deliberately, or cut the sweeps down to pairs and change what they '
      'CLAIM to match.', n, (1::bigint << n);
  end if;

  return query
    select (select coalesce(array_agg(v_roles[b] order by b), '{}'::text[])
              from generate_series(1, n) b
             where ((i >> (b - 1)) & 1) = 1)
      from generate_series(0::bigint, (1::bigint << n) - 1) i;
end $fn$;

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
-- The two `=5` cells are the sweep's own anchor: same mechanism, same transaction, so the zeros
-- cannot be a blind session, an empty table, or a policy that denies everyone.
-- WHAT IT DOES NOT ASK is what a COMBINATION of roles opens. Every cell here claims exactly one
-- role, so a predicate widened on two roles held TOGETHER satisfies all six cells and this stays
-- green while admitting real sessions. D9 carries that half, and this assertion's wording is kept
-- to the half it actually decides.
select is(
  (select array_agg(v.role || '=' || pg_temp.reads_as(
            '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1',
            array[v.role], 'integrations.esb_push') order by v.role)
     from pg_temp.access_role_vocabulary() v(role)),
  array['admin=5','finance=0','manager=0','member=0','ops_lead=5','supervisor=0']::text[],
  'esb_push_select_ops_lead_or_admin, role by role over the whole access-role vocabulary: only ops_lead and admin read anything when it is the ONLY role claimed, and both read every posting state — the per-role census, whose LENGTH is what reddens when the vocabulary grows (combinations are D9''s)');

-- ── D9. The admitted SET, swept over the whole POWER SET of the vocabulary ───────────────────
-- D8 varies one role at a time, so it pins the admitted set only against a widening that names ONE
-- role. A widening conditional on a COMBINATION satisfies every cell of it — `or
-- (shared.has_access_role('manager') and shared.has_access_role('finance'))` is what a "let the
-- finance managers watch the outbox" ticket actually looks like, and no cell of D8 ever claims two
-- unadmitted roles at once, so D8 reads green while that predicate admits real sessions. That is
-- not a hypothetical: it was demonstrated against this file, at 41 of 41 passing.
--
-- So this sweep claims EVERY subset of the vocabulary — all 2^n of them, 64 at today's six roles,
-- the empty claim and the full house included — and requires each to read what the admitted set
-- says it must: five rows if the subset contains ops_lead or admin, zero if it contains neither.
-- For any predicate that is a function of the claimed role set, that IS the whole of "admits
-- exactly ops_lead and admin": there is no combination left for a widening to hide in, because
-- there is no combination left unclaimed.
--
-- WHAT IT COSTS. One set_config plus one count(*) over a ten-row table per subset, so 64 of them
-- per table is milliseconds — at this size the exhaustive cut is simply the cheapest honest one,
-- and pairs-only would save nothing worth the hole it leaves. The cost doubles with each role the
-- vocabulary grows; role_combinations() states a ceiling and RAISES at it rather than letting that
-- become a suite that quietly got slow.
--
-- WHAT REMAINS INVISIBLE, stated here rather than left to be found. This sweep varies the CLAIMED
-- ROLE SET and nothing else, so a widening keyed on anything else is outside it: on person_id or
-- org_id, on a row column the fixture holds at one value or at a value/combination its rows do not
-- form, on a clock, a GUC or a session setting, or on any JWT claim other than access_roles. A
-- role the domain does not admit is outside it too, since the vocabulary is the domain's own — and
-- so is vocabulary GROWTH, because a seventh role would simply be swept here and read zero, which
-- is green. D8 is what reddens for that, which is why both sweeps stay.
--
-- IT IS NOT AN EMPTY SWEEP DRESSED AS A PASS. Three quarters of the subsets contain an admitted
-- role and must read five, so a constant probe, a blind session, an empty table or a policy that
-- denied everyone all fail here. H8 pins separately that the enumeration really is the whole power
-- set, in canonical form and with nothing missing.
select is(
  (select coalesce(array_agg('{' || array_to_string(c.roles, '+') || '}=' || r.n
                             order by cardinality(c.roles), c.roles), '{}'::text[])
     from pg_temp.role_combinations(array(select pg_temp.access_role_vocabulary())) as c(roles)
     cross join lateral (select pg_temp.reads_as(
            '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1',
            c.roles, 'integrations.esb_push') as n) r
    where r.n is distinct from
          (case when c.roles && array['ops_lead','admin']::text[] then 5 else 0 end)),
  '{}'::text[],
  'esb_push_select_ops_lead_or_admin admits a session if and only if its claimed roles include ops_lead or admin — checked over EVERY subset of the access-role vocabulary, so no COMBINATION of unadmitted roles opens it (empty = no subset read anything other than what the admitted set says)');

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
            array[v.role], 'integrations.esb_push_groups') order by v.role)
     from pg_temp.access_role_vocabulary() v(role)),
  array['admin=5','finance=0','manager=0','member=0','ops_lead=5','supervisor=0']::text[],
  'esb_push_groups_select_ops_lead_or_admin, role by role over the whole access-role vocabulary: only ops_lead and admin read approval groups when it is the ONLY role claimed — the per-role census; combinations are the sweep straight below');

-- ...and the power set on the group table, for the reason D9 gives at length: one role at a time
-- cannot see a widening conditional on two roles held together, and this predicate is its own, so
-- D9 proving it of the outbox proves nothing here. Same enumeration, same subject, same rule —
-- five if the subset holds ops_lead or admin, zero if it holds neither. D9 also carries the list
-- of what this shape of sweep cannot see; every line of it applies here unchanged.
select is(
  (select coalesce(array_agg('{' || array_to_string(c.roles, '+') || '}=' || r.n
                             order by cardinality(c.roles), c.roles), '{}'::text[])
     from pg_temp.role_combinations(array(select pg_temp.access_role_vocabulary())) as c(roles)
     cross join lateral (select pg_temp.reads_as(
            '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1',
            c.roles, 'integrations.esb_push_groups') as n) r
    where r.n is distinct from
          (case when c.roles && array['ops_lead','admin']::text[] then 5 else 0 end)),
  '{}'::text[],
  'esb_push_groups_select_ops_lead_or_admin admits a session if and only if its claimed roles include ops_lead or admin — checked over EVERY subset of the access-role vocabulary, so no COMBINATION of unadmitted roles opens the approval-group table either');

-- ...and this sweep put the caller's claim back too, proven the same way D8's is. The restore is
-- what makes a sweep invisible to whatever follows it, and `order by v.role` orders the sweep's
-- RESULTS, not the order the aggregate CALLS reads_as() in — so which claim would be left behind
-- is not even determined, and only an assertion can settle whether one is. Asserted at BOTH sweep
-- sites deliberately: an invariant proven at one call site is an invariant the other is free to
-- break.
select is(
  current_setting('request.jwt.claims', true),
  '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}',
  'the group-table role sweep restores the caller''s claim as well: request.jwt.claims still holds the session that was in force before it');

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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- H. The harvest's own contract — the sweeps' foundation, tested rather than described
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Every sweep above rests on check_literals() answering "what does this CHECK admit?" honestly, and
-- the ONE answer it must never give is a SHORT SET: a short set does not fail anything, it just
-- narrows what got swept while every count still matches. That defect shipped twice — first as a
-- character class that dropped any name with a digit, a hyphen or a capital, then as an unanchored
-- array lift that dropped any value stated outside the array. Both read as green.
--
-- So the contract is pinned here, on constraint text handed in BY HAND. Nothing below alters the
-- live domain: these are strings, and the assertions are about the function, which is why they can
-- sit at the foot of the file without disturbing the numbering of anything above.
--
-- H1 and H2 are the shape that shipped green in the last round, in both of the orders Postgres
-- prints it. H3 is a set the harvest cannot read at all. H4 is the shape that would have to defeat
-- the anchor for a greedy lift to succeed. H5 reaches past the shape net to exercise the census net
-- on its own — that definition IS a single `= ANY (ARRAY[…])` test, so net 1 admits it, and only
-- the census notices that the value it admits (`bc`) is not the set of names it spells.
-- H6 is the positive control, and it is what makes H1–H5 mean anything: without it, a harvest that
-- raised on absolutely everything would satisfy all five.
select throws_like(
  $q$select * from pg_temp.check_literals('CHECK (((VALUE = ANY (ARRAY[''admin''::text, ''ops_lead''::text])) OR (VALUE = ''auditor''::text)))')$q$,
  '%refuses this constraint%',
  'H1 the harvest REFUSES a CHECK stating its set as an array plus a TRAILING disjunct — the exact shape whose extra role was silently dropped, leaving both sweeps green');

select throws_like(
  $q$select * from pg_temp.check_literals('CHECK (((VALUE = ''auditor''::text) OR (VALUE = ANY (ARRAY[''admin''::text, ''ops_lead''::text]))))')$q$,
  '%refuses this constraint%',
  'H2 ...and with the extra disjunct LEADING, so the refusal is anchored at both ends and not just at the tail');

select throws_like(
  $q$select * from pg_temp.check_literals('CHECK ((VALUE ~ ''^(admin|ops_lead)$''::text))')$q$,
  '%refuses this constraint%',
  'H3 a constraint re-spelled as a regex RAISES rather than harvesting short: a set this cannot read is a set it refuses to guess at');

select throws_like(
  $q$select * from pg_temp.check_literals('CHECK (((VALUE = ANY (ARRAY[''a''::text])) OR (VALUE = ANY (ARRAY[''b''::text]))))')$q$,
  '%refuses this constraint%',
  'H4 two arrays OR''d together RAISE — the shape a lift anchored only at the tail would have swallowed whole, reporting the first array and losing the second');

select throws_like(
  $q$select * from pg_temp.check_literals('CHECK ((VALUE = ANY (ARRAY[''a''::text, (''b''::text || ''c''::text)])))')$q$,
  '%are not the whole set of literals spelled in it%',
  'H5 the literal census refuses a definition whose admitted values do not account for every name written in it — the second net, failing on its own where the shape net admitted the text');

select is(
  (select array_agg(s order by s collate "C")
     from pg_temp.check_literals('CHECK ((VALUE = ANY (ARRAY[''b2b_lead''::text, ''tier-2''::text, ''Auditor''::text])))') s),
  array['Auditor','b2b_lead','tier-2']::text[],
  'H6 and it harvests a set whose names carry a digit, a hyphen and a capital EXACTLY — so the five refusals above are a harvest that discriminates, not one that always raises');

-- The domain-probe cross-check in access_role_vocabulary() requires the live domain to accept every
-- name the harvest reported. That requirement is only worth making if the domain can refuse, so:
select throws_ok(
  $q$select 'no_such_role_h7'::shared.access_role$q$,
  '23514'::char(5), null,
  'H7 shared.access_role REJECTS a name outside its vocabulary — so the domain probe above is a live check and not a cast that accepts anything handed to it');

-- The combination sweeps in D and E assert an EMPTY list of misbehaving subsets, and an empty list
-- is exactly what an enumeration that produced nothing would also give. So the enumeration is
-- pinned here, in the terms that make "every subset" true: as many rows as the power set has, all
-- of them distinct, none holding a name the vocabulary does not, and each in canonical form
-- (sorted, no repeats) so that distinct ARRAYS really are distinct SUBSETS. 2^n distinct canonical
-- subsets of an n-name vocabulary is all of them — there are no others to be missing.
select is(
  (select array[count(*),
                count(distinct k.roles),
                count(*) filter (where not (k.roles <@ k.vocab)),
                count(*) filter (where k.roles is distinct from k.canon)]
     from (select c.roles,
                  array(select pg_temp.access_role_vocabulary()) as vocab,
                  (select coalesce(array_agg(distinct x order by x), '{}'::text[])
                     from unnest(c.roles) x) as canon
             from pg_temp.role_combinations(array(select pg_temp.access_role_vocabulary())) as c(roles)) k),
  (select array[1::bigint << s.n, 1::bigint << s.n, 0::bigint, 0::bigint]
     from (select cardinality(array(select pg_temp.access_role_vocabulary())) as n) s),
  'H8 role_combinations() enumerates the WHOLE power set of the harvested vocabulary — 2^n subsets, all distinct, all canonical, none carrying a name the domain does not admit — so the empty mismatch lists in D9 and E are an exhaustive sweep finding nothing, not a sweep that ran on nothing');

-- H8 above is also the enumerator's positive control — it runs on the live vocabulary and gets the
-- whole power set back. These two are the refusals it makes instead of degrading, fed a vocabulary
-- by hand the way H1–H6 feed constraint text: an empty sweep and a sweep too big to have been
-- chosen are both failures that would otherwise arrive as a silent pass and a silently slow suite.
select throws_like(
  $q$select * from pg_temp.role_combinations('{}'::text[])$q$,
  '%vocabulary handed in is EMPTY%',
  'H9 the enumerator REFUSES an empty vocabulary rather than yielding the one empty claim — a sweep over nothing passes, and passing is the wrong way to report that the vocabulary was lost');

select throws_like(
  $q$select * from pg_temp.role_combinations(array(select 'r' || g from generate_series(1,13) g))$q$,
  '%doubles again with the next role%',
  'H10 ...and it REFUSES a vocabulary past the ceiling, because the sweep is exponential: growing past it has to be a decision someone made, not a suite that quietly took minutes');

select * from finish();
rollback;
