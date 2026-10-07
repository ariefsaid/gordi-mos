-- integrations, squashed baseline — what the schema owes the dispatch path, and what happens to a
-- push that fails.
--
-- The worker is a process, not a schema object. What the database has to hold up for it is three
-- things, and this file asserts each as behaviour rather than as a comment:
--
--   1. THE DRAIN. Pending rows are claim candidates; failed rows wait for their recorded retry time. A failed push returns only after retry promotion
--      through the queue reaper.
--   2. VISIBILITY. A push that has stopped moving stays readable, with the error that stopped it.
--      An outbox whose failures disappear from the operator's view is worse than no outbox: the
--      batch is silently un-posted and the ERP is silently short a document.
--   3. NO DROPS. Nobody holds DELETE — not the app tier, and not the worker. That is the only form
--      of "never silently dropped" that survives contact with a process that is having a bad day.
--
-- The transition graph, claim RPC, retry schedule, and retention routine are exercised by
-- integrations_07_outbox_hardening.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. The drain filter
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select matches(
  (select indexdef from pg_indexes
    where schemaname = 'integrations' and indexname = 'esb_push_pending_idx'),
  'WHERE \(status = ANY',
  'the drain is indexed as a PARTIAL index over the statuses dispatch actually reads, not a full scan the worker filters afterwards');

-- The seeded row starts pending, so it is in the drain set. Stated first because every assertion
-- after it is a change FROM this state.
select is((select count(*)::int from integrations.esb_push
            where id = '00000000-0000-0000-0000-00000000ba01' and status in ('pending','failed')),
  1, 'a newly enqueued row is pending and is inside the drain filter');

-- ── A push that failed is drained again ──────────────────────────────────────────────────────
-- The worker holds service_role, which is who actually writes this transition.
set local role service_role;
select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000ba01'::uuid])), 1,
  'the worker claims the pending row before recording its outcome');
select lives_ok($$
  update integrations.esb_push
     set status = 'failed', retry_count = retry_count + 1, last_error = 'ESB timeout'
   where id = '00000000-0000-0000-0000-00000000ba01'
  $$, 'the worker records a retryable failure');
reset role;

select is((select count(*)::int from integrations.esb_push
            where id = '00000000-0000-0000-0000-00000000ba01' and status = 'failed'
              and next_attempt_at > clock_timestamp()),
  1, 'a FAILED push waits outside the claim set until its scheduled retry time');

-- ── A push that succeeded is not ─────────────────────────────────────────────────────────────
-- The negative half. Without it, a filter that matched everything would pass the assertion above.
set local role service_role;
select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000ba09'::uuid])), 1,
  'the worker claims a second pending row');
select lives_ok($$
  update integrations.esb_push
     set status = 'posted', esb_doc_num = 'ESB-OK-0001', posted_at = now(), last_error = null
   where id = '00000000-0000-0000-0000-00000000ba09'
  $$, 'the worker closes a push it managed to post');
reset role;

select is((select count(*)::int from integrations.esb_push
            where id = '00000000-0000-0000-0000-00000000ba09' and status in ('pending','failed')),
  0, '...and a POSTED push drops out of the drain, so the filter distinguishes the two states rather than matching both');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. Dead letter — reachable, terminal to the drain, and still on the operator's screen
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role service_role;
select lives_ok($$update integrations.esb_push
  set next_attempt_at = clock_timestamp() - interval '1 second'
  where id = '00000000-0000-0000-0000-00000000ba01'$$,
  'the failure reaches its retry time');
select is(integrations.reap_esb_pushes(), 1, 'the reaper promotes the due retry');
select is((select count(*)::int from integrations.claim_esb_pushes(array['00000000-0000-0000-0000-00000000ba01'::uuid])), 1,
  'the worker claims the promoted retry');
select lives_ok($$
  update integrations.esb_push
     set status = 'dead_letter', retry_count = 5, last_error = 'ESB timeout (retry budget exhausted)'
   where id = '00000000-0000-0000-0000-00000000ba01'
  $$, 'the worker closes a claimed row as dead-lettered');
reset role;

select is((select count(*)::int from integrations.esb_push
            where id = '00000000-0000-0000-0000-00000000ba01' and status in ('pending','failed')),
  0, 'a dead-lettered push leaves the drain — the worker stops burning retries on it, which is the incumbent''s MAX_RETRY skip expressed as state instead of as a log line');

-- The half that matters. The SELECT policy names an org and a role and says NOTHING about status, so
-- a stalled push is exactly as visible as a healthy one. If it were filtered out, the batch would be
-- un-posted and nobody would be looking at it.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');

select is((select count(*)::int from integrations.esb_push
            where id = '00000000-0000-0000-0000-00000000ba01'),
  1, 'a dead-lettered push is STILL readable by the ops tier: the policy gates on org and role, never on status');

select row_eq($$
  select status, retry_count, last_error
    from integrations.esb_push where id = '00000000-0000-0000-0000-00000000ba01' $$,
  row('dead_letter'::text, 5, 'ESB timeout (retry budget exhausted)'::text)::record,
  '...with the retry count and the error that stopped it intact — an operator can see WHY, not just THAT');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. Never silently dropped, and never silently re-pointed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Still the ops_lead persona: the strongest app-tier reader of this table cannot make a push vanish,
-- and cannot quietly mark one posted either.
select throws_ok($$
  delete from integrations.esb_push where id = '00000000-0000-0000-0000-00000000ba01'
  $$, '42501', 'permission denied for table esb_push',
  'the app tier cannot delete a push — refused by PRIVILEGE, before any policy is consulted');

select throws_ok($$ update integrations.esb_push set status = 'posted'
  where id = '00000000-0000-0000-0000-00000000ba01' $$,
  '42501', null, 'the strongest app-tier reader cannot change posting state because it has no UPDATE privilege');

reset role;

-- The worker is bound by the same rule, and this is the assertion that gives "never dropped" its
-- meaning: the process that would be doing the dropping is the one under test.
set local role service_role;
select throws_ok($$
  delete from integrations.esb_push where id = '00000000-0000-0000-0000-00000000ba01'
  $$, '42501', 'permission denied for table esb_push',
  'the WORKER cannot delete a push either — a failed dispatch has no code path that ends in the row being gone');
reset role;

select is((select count(*)::int from integrations.esb_push
            where id = '00000000-0000-0000-0000-00000000ba01'),
  1, '...and the row is still there after both attempts, read by the owner — nothing moved, rather than nothing being reported');

select * from finish();
rollback;
