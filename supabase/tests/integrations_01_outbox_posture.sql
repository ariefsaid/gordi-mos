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
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

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
-- The seeded population both axes are read against: one outbox row in org A (...ba01) and one in
-- org B (...ba09), from ops._test_seed_cafe().
set local role authenticated;

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from integrations.esb_push), 0,
  'esb_push_select_ops_lead_or_admin fails closed: a member of the org without ops_lead or admin reads zero outbox rows');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from integrations.esb_push), 1,
  'esb_push_select_ops_lead_or_admin (positive, ops_lead): reads their own org''s one outbox row — so the zero above is the role gate, not an empty table');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}';
select is((select count(*)::int from integrations.esb_push), 1,
  'esb_push_select_ops_lead_or_admin (positive, admin): the policy names two roles and both are proven, not one and an assumption');

-- ...and the org half of the same predicate, which the role half would otherwise mask.
select is((select count(*)::int from integrations.esb_push
            where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'esb_push_select_ops_lead_or_admin: an admin sees NONE of the other tenant''s outbox rows — the org half of the predicate holds under the strongest same-org persona');

-- The other-org cells. The subject is a real person of org B (ForeignMgr ...0b04), because
-- current_org_id() resolves NULL for a person_id claim that does not name a live directory row —
-- an invented viewer would read zero for a reason that has nothing to do with this policy.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from integrations.esb_push
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'esb_push_select_ops_lead_or_admin (other org, admitted role): an ops_lead of the OTHER tenant reads none of org A''s outbox rows — holding the role is not enough');

select is((select count(*)::int from integrations.esb_push), 1,
  'esb_push_select_ops_lead_or_admin: ...and that same other-tenant session reads its OWN org''s one row, so the zero above is the org half of the predicate and not a blind session');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from integrations.esb_push), 0,
  'esb_push_select_ops_lead_or_admin (other org, unadmitted role): the fourth cell reads zero — neither half of the conjunction is satisfied');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D2. esb_push_groups_select_ops_lead_or_admin — the same four cells, on the approval-group table
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The group table carries its own policy, so it needs its own behavioural proof: a widening of THIS
-- predicate is invisible to every assertion made about the outbox row's. The fixtures seed no
-- approval groups — a group is minted by a bulk approval, not by the catalog fixture — so one per
-- org is inserted here, as the owner, before any role is assumed.
insert into integrations.esb_push_groups (id, org_id, target_env, dedup_key) values
  ('00000000-0000-0000-0000-00000000bd01','00000000-0000-0000-0000-0000000000a1','dry_run','kitchen-group|posture-org-a|dry_run'),
  ('00000000-0000-0000-0000-00000000bd09','00000000-0000-0000-0000-0000000000b1','dry_run','kitchen-group|posture-org-b|dry_run');

set local role authenticated;

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from integrations.esb_push_groups), 1,
  'esb_push_groups_select_ops_lead_or_admin (own org, ops_lead): reads their own org''s one approval group — the positive cell the negatives below are the negatives OF');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}';
select is((select count(*)::int from integrations.esb_push_groups), 1,
  'esb_push_groups_select_ops_lead_or_admin (own org, admin): the policy names two roles and both are proven on the group table too');

select is((select count(*)::int from integrations.esb_push_groups
            where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'esb_push_groups_select_ops_lead_or_admin: an admin sees NONE of the other tenant''s approval groups — the org half, under the strongest same-org persona');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from integrations.esb_push_groups), 0,
  'esb_push_groups_select_ops_lead_or_admin fails closed (own org, unadmitted role): a member of the org without ops_lead or admin reads zero approval groups');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from integrations.esb_push_groups
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'esb_push_groups_select_ops_lead_or_admin (other org, admitted role): an ops_lead of the OTHER tenant reads none of org A''s approval groups');

select is((select count(*)::int from integrations.esb_push_groups), 1,
  'esb_push_groups_select_ops_lead_or_admin: ...and that same other-tenant session reads its OWN org''s one group — the zero above is the org half, not a blind session');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from integrations.esb_push_groups), 0,
  'esb_push_groups_select_ops_lead_or_admin (other org, unadmitted role): the fourth cell reads zero on the group table as well');

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- E. The enqueue refusal authored in the ops pass — verified here, not assumed
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
-- F. The target-env helper added by this pass
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
