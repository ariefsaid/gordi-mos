-- shared, squashed baseline — the org_id tenancy seam.
--
-- The seam has three parts and all three are asserted here, because any one of them alone is
-- defeatable: the column DEFAULT stamps the session's org, the policy WITH CHECK makes that stamp
-- unspoofable, and the claim helpers fail CLOSED so a malformed or absent claim denies rather than
-- raising (a raise inside an RLS predicate surfaces as a probeable 500).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select shared._test_seed_directory();
-- org A = ...0a01 with Unit-1/Unit-2, the role tree and people d1..d7
-- org B = ...0b01 with B-Unit, B-Lead and ForeignMgr (...0b04)

-- Give both orgs a row in every remaining org-scoped table, so cross-org isolation is asserted
-- against real foreign rows rather than against emptiness.
insert into shared.sites (id, org_id, name, code) values
  ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000a1','A Site','a_site'),
  ('00000000-0000-0000-0000-000000000e02','00000000-0000-0000-0000-0000000000b1','B Site','b_site');
insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
  ('00000000-0000-0000-0000-000000000e03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000e01','A Team','a_team'),
  ('00000000-0000-0000-0000-000000000e04','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000e02','B Team','b_team');
insert into shared.team_memberships (org_id, person_id, team_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000e03'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-000000000e04');
insert into shared.branches (org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1','a_branch','A Branch'),
  ('00000000-0000-0000-0000-0000000000b1','b_branch','B Branch');

set local role authenticated;

-- ── An org-A session sees org A and nothing else ─────────────────────────────────────────────
-- A no-person claim is used deliberately: people_select_self would otherwise add the caller's own
-- row and blur what people_select_org is being asked to prove.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';

select is((select count(*)::int from shared.orgs),              1, 'org A session reads exactly its own org row');
select is((select count(*)::int from shared.business_units),    2, 'org A session reads only org A business units');
select is((select count(*)::int from shared.roles),             6, 'org A session reads only org A roles');
select is((select count(*)::int from shared.people),            7, 'org A session reads only org A people');
select is((select count(*)::int from shared.person_roles),      8, 'org A session reads only org A jabatan assignments');
select is((select count(*)::int from shared.sites),             1, 'org A session reads only org A sites');
select is((select count(*)::int from shared.teams),             1, 'org A session reads only org A teams');
select is((select count(*)::int from shared.team_memberships),  1, 'org A session reads only org A team memberships');
select is((select count(*)::int from shared.branches),          1, 'org A session reads only org A branches');

-- ── The stamp is a default AND a WITH CHECK ──────────────────────────────────────────────────
-- Proven WITHOUT leaving a standing write surface in the shipped schema: the INSERT grant and the
-- own-org policy are created HERE, inside this rolled-back transaction, so neither survives the
-- test. What is proven is the property "even WHEN a write policy exists, a client cannot stamp a
-- foreign org_id".
reset role;
grant insert on shared.people to authenticated;
create policy people_insert_own_org on shared.people
  for insert to authenticated
  with check (org_id = shared.current_org_id());
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';

select lives_ok($$
  insert into shared.people (full_name) values ('Honest Person')
$$, 'an insert with org_id omitted takes the session default (org A)');

select is(
  (select org_id from shared.people where full_name = 'Honest Person'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '...and the defaulted value is the session org, stamped server-side');

select throws_ok($$
  insert into shared.people (org_id, full_name)
  values ('00000000-0000-0000-0000-0000000000b1', 'Spoofer')
$$, '42501', null, 'a client cannot stamp a FOREIGN org_id — WITH CHECK rejects the spoof');

select throws_ok($$
  insert into shared.people (org_id, full_name) values (null, 'Null-org Smuggler')
$$, '42501', null,
  'an EXPLICIT NULL org_id is rejected too — it overrides the default, and NULL <> current_org_id()');

-- ── The claim helpers fail CLOSED, they never raise ──────────────────────────────────────────
set local request.jwt.claims = '';
select is(shared.current_org_id(), null, 'empty-string claims -> current_org_id NULL, no raise');
select is((select count(*)::int from shared.people), 0,
  'empty-string claims -> the directory reads zero rows (fail closed, not an error)');

set local request.jwt.claims = '{"org_id":"not-a-uuid","person_id":"also-bad"}';
select is(shared.current_org_id(), null, 'non-UUID claim value -> current_org_id NULL, no raise');

set local request.jwt.claims = 'not json at all';
select is(shared.current_org_id(), null, 'malformed-JSON claims -> current_org_id NULL, no raise');
select is((select count(*)::int from shared.roles), 0,
  'malformed-JSON claims -> zero rows rather than a 500 an attacker could probe');

-- Happy path intact, so the defensive parsing is not just denying everything.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
select cmp_ok((select count(*) from shared.roles), '>', 0::bigint,
  'a valid claim still resolves — the fail-closed path did not break normal extraction');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The seam resolves against the DIRECTORY, not against the claim alone
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A claim set is minted once and stands until the token expires, so an org claim taken on its own
-- describes the directory as it was at sign-in. These four say the seam reads the directory as it is
-- now: the same org claim opens or closes depending on whether the person named alongside it still
-- resolves to a live row. The control at the end is what makes the other three mean something — it
-- is the same org_id, so what changed is the person and nothing else.
--
-- Note which table is counted: shared.roles, not shared.people. people carries people_select_self,
-- which is keyed on current_person_id() and deliberately ungated, so a caller always reads their own
-- row — that is what keeps the set-password screen renderable. Counting people would measure that
-- policy instead of this seam.
reset role;
update shared.people set archived_at = now()
 where id = '00000000-0000-0000-0000-0000000000d7';
-- d1 gets a real login, because two of the assertions below are about which login a person resolves
-- to and an unlinked person would let them pass on "user_id is null" rather than on a mismatch.
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aa01') on conflict (id) do nothing;
update shared.people set user_id = '00000000-0000-0000-0000-00000000aa01'
 where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7"}';
select is(shared.current_org_id(), null,
  'an ARCHIVED person''s claim set resolves to NO org — the seam asks the directory, not the token');
select is((select count(*)::int from shared.roles), 0,
  '...and the org-scoped directory therefore reads zero rows, so archiving is an authorization change and not a UI one');

-- A person_id that was never in the directory at all — the same answer by the same route.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000df"}';
select is(shared.current_org_id(), null,
  'a person_id claim that names nobody resolves to no org either');

-- A claim set is three assertions about the directory, not one, and the seam resolves only if all
-- three still hold together. The two below are the pairing conditions: the person must belong to the
-- org the token names, and must still be the person this login resolves to. Both restate, where the
-- claims are CONSUMED, an invariant the hook holds where they are minted — and a claim set outlives
-- the mint, so the consuming end is where it has to be checked.
--
-- Org A's own d1, but presented alongside org B's id. The hook mints both from one row and could
-- never produce this pairing; what the seam must not do is take it on trust.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select is(shared.current_org_id(), null,
  'a person_id and an org_id that name DIFFERENT rows resolve to no org — the pair has to agree, not merely each exist');

-- Same person, same org, a `sub` that is not the login this person resolves to. d1 is linked to
-- ...aa01 by the access-role fixture; ...aa09 is some other auth user.
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aa09') on conflict (id) do nothing;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","sub":"00000000-0000-0000-0000-00000000aa09"}';
select is(shared.current_org_id(), null,
  'a token whose `sub` is not the login this person resolves to gets no org — the person_id claim means "the person of THIS login", and the seam holds it to that');

-- THE CONTROLS. Same three claims, all agreeing: the seam opens. Without these the five refusals
-- above would also pass under a current_org_id() that had simply been broken to return NULL.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select is(shared.current_org_id(), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'the SAME org claim with a LIVE person still resolves — the person is what closed it, not the org');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","sub":"00000000-0000-0000-0000-00000000aa01"}';
select is(shared.current_org_id(), '00000000-0000-0000-0000-0000000000a1'::uuid,
  '...and so does the full claim set an ordinary sign-in actually carries, `sub` included — the login arm refuses a mismatch, not the presence of the claim');

reset role;
update shared.people set archived_at = null
 where id = '00000000-0000-0000-0000-0000000000d7';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The org-structure junctions cannot be assembled across the seam
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- shared.teams and shared.team_memberships hold four existence-only foreign keys between them, and
-- an FK lookup checks existence only — it bypasses RLS, so the column alone will accept a row from
-- any org. These assert the tenancy half that the FK cannot state. team_memberships matters beyond
-- tidiness: the Signal read gate and the Team post/start gates resolve a caller's rights by asking
-- whether a membership row exists.
--
-- Run with the role RESET, i.e. as the connection that actually writes these tables today. That is
-- the point rather than a convenience: a trigger fires for every writer, so proving it here proves
-- it for the seeding path too, where no policy is in the way.
select throws_ok($$
  insert into shared.teams (org_id, business_unit_id, name, code)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','Crossed Team','crossed_team')
$$, '42501', null,
  'a team cannot be scoped to a FOREIGN org''s business unit');

select throws_ok($$
  insert into shared.teams (org_id, business_unit_id, site_id, name, code)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-000000000e02','Crossed Site Team','crossed_site_team')
$$, '42501', null,
  'a team cannot sit at a FOREIGN org''s site');

select throws_ok($$
  insert into shared.team_memberships (org_id, person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b4',
          '00000000-0000-0000-0000-000000000e03')
$$, '42501', null,
  'a membership cannot enrol a FOREIGN org''s person — this junction is an authorization input to the Signal read gate, so it is held to the tenancy rule and not only to the FK');

select throws_ok($$
  insert into shared.team_memberships (org_id, person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-000000000e04')
$$, '42501', null,
  '...and cannot enrol a same-org person into a FOREIGN org''s team either — both ends are checked');

-- The honest positive: a wholly same-org membership still writes, so the guard is refusing the
-- crossing rather than refusing the table.
select lives_ok($$
  insert into shared.team_memberships (org_id, person_id, team_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2',
          '00000000-0000-0000-0000-000000000e03')
$$, 'a same-org membership still writes — the guard refuses the crossing, not the junction');

reset role;
select * from finish();
rollback;
