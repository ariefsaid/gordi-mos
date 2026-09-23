-- shared, squashed baseline — the directory's structural contracts and the DERIVED manager chain.
--
-- The manager relation is derived from the role chain and never stored, so these are the assertions
-- that keep it honest: it unions over every role a dual-hat person holds, it is strictly upward, and
-- it degrades safely if the hook's org/person invariant were ever violated.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select shared._test_seed_directory();

-- ── A person exists before a login (OD-P1-2) ─────────────────────────────────────────────────
-- Many rows may carry NULL user_id without colliding: the uniqueness is PARTIAL, on non-null only.
select lives_ok($$
  insert into shared.people (org_id, full_name) values
    ('00000000-0000-0000-0000-0000000000a1','Login-less One'),
    ('00000000-0000-0000-0000-0000000000a1','Login-less Two')
$$, 'two people with NULL user_id insert without a unique violation — person-first, login later');

select is(
  (select count(*)::int from shared.people
    where org_id = '00000000-0000-0000-0000-0000000000a1' and user_id is null),
  9, 'all login-less people persist (7 seeded + 2 just added)');

-- ── Dual hat (OD-P1-7) ───────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from shared.person_roles
    where person_id = '00000000-0000-0000-0000-0000000000d6'),
  2, 'one person holds two positions at once (dual hat)');

select throws_ok($$
  insert into shared.person_roles (org_id, person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000f3')
$$, '23505', null, 'the same (person, position) pair cannot be assigned twice');

-- ── is_manager_of: union over held roles, strictly upward ────────────────────────────────────
set local role authenticated;

-- DualHat (...0d06) holds Staff R and Staff 2, so BOTH DirectMgr (Lead R) and Lead2Holder (Lead 2)
-- manage them. A non-union implementation would find only one.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select ok(shared.is_manager_of('00000000-0000-0000-0000-0000000000d6'),
  'the lead of the FIRST held role manages a dual-hat person');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7"}';
select ok(shared.is_manager_of('00000000-0000-0000-0000-0000000000d6'),
  'the lead of the SECOND held role ALSO manages them — the relation unions over held roles');

-- GrandMgr holds Exec, two levels above Staff R: the walk is recursive, not one hop.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3"}';
select ok(shared.is_manager_of('00000000-0000-0000-0000-0000000000d1'),
  'a manager two levels up still manages — the chain is walked recursively');

-- Peer holds the SAME role as Author. Same-role is not management.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4"}';
select ok(not shared.is_manager_of('00000000-0000-0000-0000-0000000000d1'),
  'a peer holding the SAME position does not manage — only a STRICT ancestor counts');

-- ...and it does not run backwards.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select ok(not shared.is_manager_of('00000000-0000-0000-0000-0000000000d2'),
  'a subordinate does not manage their own manager — the relation is strictly upward');

-- ── is_managed_by: the same chain, asked from the other end ──────────────────────────────────
-- Sharing runs the opposite way from reviewing, so both directions exist. Asserted separately
-- because "the reverse of a correct function" is not itself a proof — the swap is easy to get wrong.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select ok(shared.is_managed_by('00000000-0000-0000-0000-0000000000d2'),
  'is_managed_by is true when the named person is the caller''s manager');
select ok(not shared.is_managed_by('00000000-0000-0000-0000-0000000000d4'),
  'is_managed_by is false for a peer — it is not merely "we are related"');
select ok(not shared.is_managed_by('00000000-0000-0000-0000-0000000000b4'),
  'is_managed_by is false for a person in another org (fail closed across the tenant boundary)');

-- ── Fail-closed on an inconsistent claim ─────────────────────────────────────────────────────
-- is_manager_of's correctness relies on the hook minting org_id and person_id from the SAME people
-- row. If a forged session paired org A with an org-B person_id, RLS scopes person_roles to org A,
-- the cross-org person holds no in-org roles, and the function must return false rather than
-- reaching across the tenant boundary.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000b4"}';
select ok(not shared.is_manager_of('00000000-0000-0000-0000-0000000000d1'),
  'an inconsistent claim (org A + an org-B person_id) manages nobody — the seam degrades closed');

-- Control, so the assertion above cannot pass merely because the fixture is broken.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4"}';
select ok(not shared.is_manager_of('00000000-0000-0000-0000-0000000000d1'),
  'control: the same org-B person does not manage an org-A person from their OWN org either');

reset role;
select * from finish();
rollback;
