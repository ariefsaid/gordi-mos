-- ops, squashed baseline — the org_id tenancy seam across the whole schema.
--
-- AC-006: "Given a person in org A, When they select production logs, plans or stock, Then no row
-- belonging to org B is returned." Asserted table by table against a fixture where org B is a REAL
-- tenant holding a real row in every one of them — so each zero below is isolation, not emptiness. A
-- suite that only proves "returns nothing" passes just as happily against a schema that returns
-- nothing to anyone, which is why every zero here is paired with a non-zero own-org count.
--
-- The reader is GrandMgr ...0d3 holding admin, deliberately the WIDEST persona available: if the
-- seam held only for a narrow role, that would prove the role gate rather than the org gate. Every
-- zero here is produced despite the caller being an admin of their own org.
--
-- The seam is then asserted in the other direction from org B, because a one-directional test passes
-- against a policy that leaks one way — for instance one written against a literal org id.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();   -- GrandMgr ...0d3 -> admin
select ops._test_seed_daily_log();         -- rows in every ops table, in BOTH orgs

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin","ops_lead"]}';

-- ── Not one org-B row is reachable, from any table ───────────────────────────────────────────
select is((select count(*)::int from ops.log_entries   where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'AC-006: an org-A admin reads zero org-B Daily Log entries');
select is((select count(*)::int from ops.wip_items     where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'AC-006: an org-A admin reads zero org-B WIP items');
select is((select count(*)::int from ops.kitchen_plans where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'AC-006: an org-A admin reads zero org-B production plans');
select is((select count(*)::int from ops.kitchen_logs  where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'AC-006: an org-A admin reads zero org-B production logs');
select is((select count(*)::int from ops.kitchen_stock where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'AC-006: an org-A admin reads zero org-B stock rows');
select is((select count(*)::int from integrations.esb_push where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'AC-006: an org-A admin reads zero org-B outbox rows');

-- ── ...and the org-B rows genuinely exist, so the zeros above are isolation ──────────────────
-- Read back as the owner, which is subject to no policy: if any of these were zero the assertions
-- above would be measuring an empty database rather than a closed seam.
reset role;
select is((select count(*)::int from ops.log_entries   where org_id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'control: org B really does hold a Daily Log entry');
select is((select count(*)::int from ops.wip_items     where org_id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'control: org B really does hold a WIP item');
select is((select count(*)::int from ops.kitchen_plans where org_id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'control: org B really does hold a production plan');
select is((select count(*)::int from ops.kitchen_logs  where org_id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'control: org B really does hold a production log');
select is((select count(*)::int from ops.kitchen_stock where org_id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'control: org B really does hold a stock row');
select is((select count(*)::int from integrations.esb_push where org_id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'control: org B really does hold an outbox row');

-- ── The seam holds in the other direction too ────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin","ops_lead"]}';
select is((select count(*)::int from ops.kitchen_logs  where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'AC-006: and an org-B admin reads zero org-A production logs — the seam is not one-directional');
select is((select count(*)::int from ops.kitchen_plans where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'AC-006: an org-B admin reads zero org-A production plans');
select is((select count(*)::int from ops.kitchen_stock where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'AC-006: an org-B admin reads zero org-A stock rows');
select is((select count(*)::int from ops.log_entries   where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'AC-006: an org-B admin reads zero org-A Daily Log entries');
select is((select count(*)::int from integrations.esb_push where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'AC-006: an org-B admin reads zero org-A outbox rows');
select isnt((select count(*)::int from ops.kitchen_logs), 0,
  'control: the org-B admin does read their OWN logs, so the four zeros above are the seam and not a dead session');

-- ── The seam is not only a read filter ───────────────────────────────────────────────────────
-- Three independent parts hold it, and any one alone is defeatable: the column default, the policy
-- WITH CHECK, and the fail-closed claim helper. A write that names another org's id is refused even
-- though the writer is an admin of their own org.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin","ops_lead"]}';
-- Asserted on wip_items rather than on kitchen_logs, and the reason is worth recording because it
-- looks like the wrong table to pick. kitchen_logs carries a BEFORE trigger that refuses a
-- cross-org reference first, so a cross-org write there raises 23514 from the guard and the POLICY
-- is never reached — the test would pass while proving something else. wip_items has no guard, so
-- what refuses is the policy's WITH CHECK and nothing else. ops_08 asserts the guard separately, on
-- the table that has one.
select throws_ok($$
  insert into ops.wip_items (org_id, name) values ('00000000-0000-0000-0000-0000000000b1','planted')
  $$, '42501',
  'new row violates row-level security policy for table "wip_items"',
  'org seam: an org-A admin cannot write a row INTO org B — the seam is a write control, not only a read filter');

select is(
  (select pg_get_expr(d.adbin, d.adrelid)
     from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'ops.kitchen_logs'::regclass and a.attname = 'org_id'),
  'shared.current_org_id()',
  'org seam: org_id defaults from the unspoofable claim helper, so an omitted org_id cannot land anywhere else');

-- A claimless session reads nothing at all: shared.current_org_id() returns NULL and every org-scoped
-- policy closes at once. This is the shared fail-closed property of all six read policies; each one
-- gets its own separate negative in ops_03.
set local request.jwt.claims = '{}';
select is(
  (select (select count(*) from ops.log_entries) + (select count(*) from ops.wip_items)
        + (select count(*) from ops.kitchen_plans) + (select count(*) from ops.kitchen_logs)
        + (select count(*) from ops.kitchen_stock) + (select count(*) from integrations.esb_push)),
  0::bigint,
  'every ops read policy: a session with NO claims reads zero rows across all six tables (fail closed, no raise)');

select * from finish();
rollback;
