begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- #136 / GHSA-mgxm-685w-62mm — shared.roles.reports_to_role_id has no cycle guard.
--
-- A cycle is not a wrong answer, it is a HANG: shared.is_manager_of and the client's
-- deriveIsManager both walk the hierarchy, and a walk over a cycle never terminates. One bad
-- re-parent by an admin takes out every surface that asks "who reports to whom".
--
-- A CHECK constraint cannot express this — it sees one row, and a cycle is a property of the whole
-- graph. It has to be a trigger that walks upward from the proposed parent and refuses if the walk
-- reaches the row being written.

select mos._test_seed_role_tree();
-- org a1: f1 Exec (root) -> f2 Lead R -> f3 Staff R -> f6 SubR
--                        -> f4 Lead 2 -> f5 Staff 2
-- org b1: c1 B-Lead (root)

-- Precondition: the chain the cycle tests rely on actually exists. Without this, a "rejected"
-- assertion below could pass against an empty or differently-shaped tree.
select is(
  (select reports_to_role_id from shared.roles where id = '00000000-0000-0000-0000-0000000000f3'),
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  'precondition: f3 reports to f2, so f1 -> f2 -> f3 is a real chain to close into a cycle');

-- ── Self-reference ───────────────────────────────────────────────────────────────────────────
select throws_ok($$
  insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id)
  values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000a2','Ouroboros','00000000-0000-0000-0000-0000000000e1')
$$, '23514',
  'role hierarchy would contain a cycle',
  'AC-136a: a role INSERTed as its own parent is refused — the shortest possible cycle');

select throws_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000f2'
   where id = '00000000-0000-0000-0000-0000000000f2'
$$, '23514',
  'role hierarchy would contain a cycle',
  'AC-136b: a role UPDATEd to report to itself is refused');

-- ── Longer cycle: point the ROOT at its own grandchild ───────────────────────────────────────
-- f1 -> f3 closes f1 -> f2 -> f3 -> f1. This is the case a naive "is the new parent == this row?"
-- check misses entirely: the parent is three hops away, so only a real upward walk catches it.
select throws_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000f3'
   where id = '00000000-0000-0000-0000-0000000000f1'
$$, '23514',
  'role hierarchy would contain a cycle',
  'AC-136b: a multi-hop cycle (f1 -> f2 -> f3 -> f1) is refused, not just self-reference');

-- ── Legal moves still work — the guard is not a blanket block ────────────────────────────────
select lives_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000f2'
   where id = '00000000-0000-0000-0000-0000000000f5'
$$, 'AC-136c: a legal re-parent (f5 under f2) still succeeds');
select is(
  (select reports_to_role_id from shared.roles where id = '00000000-0000-0000-0000-0000000000f5'),
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  'AC-136c: and the re-parent actually took — the guard did not silently swallow it');

-- Moving a SUBTREE under a deeper node is legal as long as it does not close a loop. f2 carries
-- f3 and f6 beneath it; parking it under f4 is a reorg, not a cycle.
select lives_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000f4'
   where id = '00000000-0000-0000-0000-0000000000f2'
$$, 'AC-136c: re-parenting a node that has descendants is allowed when no loop is closed');

-- ── Roots ────────────────────────────────────────────────────────────────────────────────────
select lives_ok($$
  update shared.roles set reports_to_role_id = null
   where id = '00000000-0000-0000-0000-0000000000f2'
$$, 'AC-136d: clearing the parent (making a root) is always allowed — null can close no cycle');

-- ── Org seam ─────────────────────────────────────────────────────────────────────────────────
-- reports_to_role_id is a bare self-FK with no org predicate, so today nothing stops a role
-- pointing at another org's role. That is a tenancy leak in the shape of an org chart: the walk
-- would cross into org b1 and report a manager relationship spanning two tenants.
select throws_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000c1'
   where id = '00000000-0000-0000-0000-0000000000f3'
$$, '42501',
  'a role may only report to a role in the same org',
  'AC-136e: a cross-org parent is refused — the org seam holds on the hierarchy too');

select * from finish();
rollback;
