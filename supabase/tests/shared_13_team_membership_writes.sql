-- shared — the admin write surface on team_memberships (20260826000001).
--
-- This junction is an AUTHORIZATION INPUT, not a label: mos.can_read_signal's R1 arm,
-- mos.can_post_signal_for_team and mos.can_start_process_for_team all resolve a caller's rights by
-- asking whether a membership row exists. Opening a write surface here opens the power to change
-- who can READ which Signals and POST to which teams — so every assertion below is about who is
-- refused, not just who is admitted.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select shared._test_seed_directory();
select shared._test_seed_access_roles();
-- GrandMgr ...0d03 -> admin ; Author ...0d01 -> member (+finance). Both in Org A (...00a1).

-- Teams to be a member OF. Inserted as the migration owner, before any role switch: the subject
-- here is the membership policy, not the (deliberately write-closed) teams table.
insert into shared.teams (id, org_id, business_unit_id, name, code) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','A Team','a_team'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','A Team 2','a_team_2'),
  ('00000000-0000-0000-0000-0000000000e9','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','B Team','b_team');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The admin may write — in their own org, and nowhere else
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

select lives_ok($$
  insert into shared.team_memberships (person_id, team_id, is_primary)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1', true)
$$, 'an admin puts a person on a team — the write surface the admin screen needs, and org_id comes from the session default');

select is(
  (select count(*)::int from shared.team_memberships
    where person_id = '00000000-0000-0000-0000-0000000000d1'
      and team_id = '00000000-0000-0000-0000-0000000000e1'),
  1, 'and the row is really there — the lives_ok above is not passing on a silently-dropped insert');

-- The org seam, spoofed explicitly rather than left to the default. WITH CHECK is what refuses it.
-- Cross-org is refused, and this pins WHICH LAYER refuses it rather than accepting any 42501.
-- Both layers raise that SQLSTATE, and the security review showed the trigger gets there first: it
-- is SECURITY INVOKER, so its `select org_id from shared.people` is filtered by people_select_org,
-- returns NULL for another org's person, and NULL is distinct from 'b1'. Matching only the code
-- would therefore stay green with the policy's org_id clause deleted. Asserting the MESSAGE is what
-- makes the claim falsifiable — and it makes the honest statement: the trigger is the active guard
-- here and the policy clause is defence in depth behind it, not the thing doing the work.
select throws_ok($$
  insert into shared.team_memberships (org_id, person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000e9')
$$, '42501', 'person_id must belong to the same org as the membership',
  'an admin cannot write a membership into ANOTHER org — refused by the same-org trigger, which runs ahead of the policy and is what actually holds this seam');

-- The trigger, not the policy, holds the person/team pairing: RLS only ever sees the membership's
-- OWN org_id, so a row stamped with the caller's org that names a foreign team passes the policy
-- and must be refused one layer down.
select throws_ok($$
  insert into shared.team_memberships (person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e9')
$$, '42501', null,
  'and cannot pair their own org''s person with another org''s team — the guard catches what the policy structurally cannot see');

-- Removal is a soft end. The partial unique index is over (is_primary and effective_to is null),
-- so ending the row frees the primary slot without destroying the history.
-- Through the FUNCTION, not a hand-written date. `effective_to` is an INCLUSIVE last day, so
-- `= current_date` leaves every gate still admitting the person until tomorrow.
select lives_ok($$
  select shared.end_team_membership(
    '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1')
$$, 'an admin ends a membership — a soft end, per this schema''s convention, never a delete');

-- THE POINT OF THE REMOVAL, not the column write. The first version of this file asserted only
-- that the update succeeded, which is why it stayed green while the ended person kept every right
-- the membership carried for the rest of the day. Ask the gate's own liveness predicate instead.
select is(
  (select count(*)::int from shared.team_memberships m
    where m.person_id = '00000000-0000-0000-0000-0000000000d1'
      and m.team_id = '00000000-0000-0000-0000-0000000000e1'
      and m.effective_from <= current_date
      and (m.effective_to is null or m.effective_to >= current_date)),
  0,
  'and the ended membership is DEAD TO THE GATES TODAY — the predicate mos.can_read_signal R1, can_post_signal_for_team and ops.is_stream_reviewer all use no longer matches it');

select lives_ok($$
  insert into shared.team_memberships (person_id, team_id, is_primary)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e2', true)
$$, 'and the ended row no longer competes for the one-live-primary slot, so a new primary lands');

-- No DELETE grant and no DELETE policy: the migration says so, this proves it. Without the grant
-- the refusal is 42501 before RLS is even consulted.
select throws_ok($$
  delete from shared.team_memberships
   where person_id = '00000000-0000-0000-0000-0000000000d1'
$$, '42501', null,
  'even an admin cannot hard-delete a membership — there is no DELETE grant, so history survives the screen');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Nobody else may write. This is the half that matters.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Author (...0d01) holds member + finance. A team lead who could add themselves to a team could
-- read that team's Signals, with the read gate working exactly as designed while the boundary
-- moved underneath it — which is why no role but admin appears in the policy.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';

select throws_ok($$
  insert into shared.team_memberships (person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e2')
$$, '42501', null,
  'a non-admin cannot add themselves to a team — membership is a Signal-read and team-post input, not a label');

-- An UPDATE a policy's USING clause filters out matches NO ROWS. Postgres does not raise for that —
-- it reports success having changed nothing — so `throws_ok` here would be asserting the wrong
-- contract and would go red against a correct policy. The honest assertion is that the data did not
-- move. (The INSERT above genuinely does raise, because WITH CHECK rejects a row rather than hiding
-- one, which is why the two arms are asserted differently.)
select lives_ok($$
  update shared.team_memberships set effective_to = null
   where person_id = '00000000-0000-0000-0000-0000000000d1'
$$, 'a non-admin''s UPDATE is a silent no-op rather than an error — RLS hides the rows, it does not refuse the statement');

select is(
  (select count(*)::int from shared.team_memberships
    where person_id = '00000000-0000-0000-0000-0000000000d1'
      and team_id = '00000000-0000-0000-0000-0000000000e1'
      and effective_to is null),
  0,
  '...and the ended membership stays ended — the no-op changed nothing, which is the part that matters');

-- The read stays open to the whole org: the gates above are reads, and narrowing SELECT here would
-- break them. Stated as an assertion so a future tightening of the write surface cannot quietly
-- take the read with it.
select cmp_ok(
  (select count(*) from shared.team_memberships where org_id = '00000000-0000-0000-0000-0000000000a1'),
  '>', 0::bigint,
  'a non-admin still READS their org''s memberships — the authorization gates depend on it, so only the write surface is admin-only');

-- The migration header names ops_lead, manager and supervisor as the roles whose admission would
-- actually move a boundary — a team lead who could add themselves to a team could then read that
-- team's Signals. `member` is the role LEAST likely to ever be admitted, so testing only member
-- tested the easy case. Each of the three, refused explicitly.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead"]}';
select throws_ok($$
  insert into shared.team_memberships (person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e2')
$$, '42501', null,
  'an ops_lead cannot write a membership — adding themselves to a team would widen what Signals they read');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select throws_ok($$
  insert into shared.team_memberships (person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e2')
$$, '42501', null, 'nor a manager');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["supervisor"]}';
select throws_ok($$
  insert into shared.team_memberships (person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e2')
$$, '42501', null, 'nor a supervisor — admin is the only access role on this write surface');

-- ── The seed helpers are not app RPCs ────────────────────────────────────────────────────────
-- `shared` is PostgREST-exposed, so a function without an explicit revoke is reachable at
-- /rest/v1/rpc/<name> by anon and authenticated. shared.seed_role_tiers() shipped that way in its
-- first cut — the line was dropped while copying seed_stream_teams()' shape — and `create or
-- replace` preserves ACLs, so the regression vector is someone copying the shape again. Pinned for
-- both, because the one that was correct is the template for the one that was not.
select ok(not has_function_privilege('anon', 'shared.seed_role_tiers()', 'EXECUTE'),
  'anon cannot execute shared.seed_role_tiers() — a seed helper is not an app RPC');
select ok(not has_function_privilege('authenticated', 'shared.seed_role_tiers()', 'EXECUTE'),
  '...nor authenticated');
select ok(not has_function_privilege('anon', 'shared.seed_stream_teams()', 'EXECUTE'),
  'and the same holds for shared.seed_stream_teams(), whose shape it copies');

-- The revocation helper IS an app RPC and must stay callable, or the admin screen loses its only
-- way to take someone off a team.
select ok(has_function_privilege('authenticated', 'shared.end_team_membership(uuid, uuid)', 'EXECUTE'),
  'shared.end_team_membership stays executable by authenticated — RLS is what admits the caller, not the grant');

select * from finish();
rollback;
