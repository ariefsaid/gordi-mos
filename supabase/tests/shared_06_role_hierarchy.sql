-- shared, squashed baseline — the role hierarchy is acyclic, single-org, and safe to walk.
--
-- Two INDEPENDENT protections, both asserted, because neither subsumes the other:
--   * the guard closes the WRITE path, so a cycle cannot be created through any normal route;
--   * is_manager_of's UNION (not UNION ALL) recursion TERMINATES on a cycle that already exists —
--     a restore from an older backup, a trigger-bypassing data migration or a superuser fix-up can
--     all still produce one, and a cycle is a hang, not a wrong answer.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select shared._test_seed_directory();
-- org A: Exec f1 -> Lead R f2 -> Staff R f3 -> SubR f6 ; Lead 2 f4 -> Staff 2 f5
-- org B: B-Lead c1 (root)

-- Precondition, so a "rejected" assertion below cannot pass against a tree of the wrong shape.
select is(
  (select reports_to_role_id from shared.roles where id = '00000000-0000-0000-0000-0000000000f3'),
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  'precondition: f1 -> f2 -> f3 is a real chain, so there is something to close into a cycle');

-- ── Self-reference: the shortest cycle ───────────────────────────────────────────────────────
select throws_ok($$
  insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id)
  values ('00000000-0000-0000-0000-000000000ea1','00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000a2','Ouroboros','00000000-0000-0000-0000-000000000ea1')
$$, '23514', 'role hierarchy would contain a cycle',
  'a role INSERTed as its own parent is refused — and with the CYCLE error, not the cross-org one');

select throws_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000f2'
   where id = '00000000-0000-0000-0000-0000000000f2'
$$, '23514', 'role hierarchy would contain a cycle', 'a role UPDATEd to report to itself is refused');

-- ── A multi-hop cycle: the case a naive "is the new parent this row?" check misses entirely ──
select throws_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000f3'
   where id = '00000000-0000-0000-0000-0000000000f1'
$$, '23514', 'role hierarchy would contain a cycle',
  'f1 -> f2 -> f3 -> f1 is refused: the guard walks the graph, it does not just compare two ids');

-- ── The guard is not a blanket block ─────────────────────────────────────────────────────────
select lives_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000f2'
   where id = '00000000-0000-0000-0000-0000000000f5'
$$, 'a legal re-parent still succeeds');
select is(
  (select reports_to_role_id from shared.roles where id = '00000000-0000-0000-0000-0000000000f5'),
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  '...and it actually took — the guard did not silently swallow the write');
select lives_ok($$
  update shared.roles set reports_to_role_id = null
   where id = '00000000-0000-0000-0000-0000000000f2'
$$, 'clearing the parent is always allowed — a root closes no cycle');

-- ── The org seam holds on the hierarchy too ──────────────────────────────────────────────────
-- Without this, a role could report to another org's role: a tenancy leak shaped like an org chart.
select throws_ok($$
  update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-0000000000c1'
   where id = '00000000-0000-0000-0000-0000000000f3'
$$, '42501', 'a role may only report to a role in the same org',
  'a cross-org parent is refused');

-- The table's OTHER existence-only reference, held to the same rule. A role's business unit is what
-- BU-scoped capability grants and @BU fan-out resolve through, so a role scoped across the seam
-- would answer both of those about the wrong tenant.
select throws_ok($$
  update shared.roles set business_unit_id = '00000000-0000-0000-0000-0000000000b2'
   where id = '00000000-0000-0000-0000-0000000000f3'
$$, '42501', 'a role may only be scoped to a business unit in the same org',
  'a cross-org business unit is refused on UPDATE');

-- On INSERT too, and specifically on a ROOT role — the guard returns early once it sees there is no
-- parent edge to walk, so a check placed after that early return would never run for a root.
select throws_ok($$
  insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id)
  values ('00000000-0000-0000-0000-000000000ea2','00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000b2','Crossed Root', null)
$$, '42501', 'a role may only be scoped to a business unit in the same org',
  'a ROOT role with a cross-org business unit is refused — the check runs before the no-parent early return');

-- Same-org, still allowed: the guard refuses the crossing rather than the column.
select lives_ok($$
  update shared.roles set business_unit_id = '00000000-0000-0000-0000-0000000000a3'
   where id = '00000000-0000-0000-0000-0000000000f3'
$$, 'a same-org business unit still writes');

-- ── Termination on data that is ALREADY cyclic ───────────────────────────────────────────────
-- The guard is disabled for the fixture on purpose: the subject here is is_manager_of, not the
-- guard. The viewer holds an UNRELATED role, so `exists` cannot short-circuit and the ancestor walk
-- must drain in full — under UNION ALL that walk is the infinite cycle.
alter table shared.roles disable trigger guard_role_hierarchy;
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-000000000eb1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Cyc A', null),
  ('00000000-0000-0000-0000-000000000eb2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Cyc B','00000000-0000-0000-0000-000000000eb1'),
  ('00000000-0000-0000-0000-000000000eb3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Outsider', null);
update shared.roles set reports_to_role_id = '00000000-0000-0000-0000-000000000eb2'
 where id = '00000000-0000-0000-0000-000000000eb1';
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-000000000ec1','00000000-0000-0000-0000-0000000000a1','Cycle Holder'),
  ('00000000-0000-0000-0000-000000000ec2','00000000-0000-0000-0000-0000000000a1','Cycle Viewer');
insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000ec1','00000000-0000-0000-0000-000000000eb1'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000ec2','00000000-0000-0000-0000-000000000eb3');
alter table shared.roles enable trigger guard_role_hierarchy;

-- Bounded, so a non-terminating walk surfaces as an error rather than hanging the suite.
set local statement_timeout = '5s';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000ec2"}';
select isa_ok(
  shared.is_manager_of('00000000-0000-0000-0000-000000000ec1'), 'boolean',
  'is_manager_of TERMINATES on an already-cyclic graph — the write guard is not the only defence');

reset role;
select * from finish();
rollback;
