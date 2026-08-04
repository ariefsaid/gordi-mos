-- shared, squashed baseline — the org_id tenancy seam.
--
-- The seam has three parts and all three are asserted here, because any one of them alone is
-- defeatable: the column DEFAULT stamps the session's org, the policy WITH CHECK makes that stamp
-- unspoofable, and the claim helpers fail CLOSED so a malformed or absent claim denies rather than
-- raising (a raise inside an RLS predicate surfaces as a probeable 500).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

reset role;
select * from finish();
rollback;
