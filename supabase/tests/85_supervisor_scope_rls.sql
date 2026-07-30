begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select mos._test_seed_role_tree();      -- org a1 people d1..d7; org b1 person b4
select mos._test_seed_access_roles();   -- grants admin -> GrandMgr (...d3)

set local role authenticated;

-- Admin session = GrandMgr (...d3).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-303: admin grants a specific-branch scope + a whole-channel scope; org_id server-stamped.
select lives_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','POS','BGR')
$$, 'AC-303: admin grants specific-branch revenue scope');
select is(
  (select org_id from reporting.supervisor_revenue_scope
     where person_id='00000000-0000-0000-0000-0000000000d4' and channel='POS' and branch_code='BGR'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'AC-303: org_id server-stamped on scope insert');
select lives_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','B2B',null)
$$, 'AC-303: admin grants whole-channel scope (branch_code null)');

-- AC-305: cross-org person rejected by guard; foreign org_id rejected by WITH CHECK; bad channel by CHECK.
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000b4','POS','BGR')
$$, '42501', null, 'AC-305: cross-org person rejected by guard');
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d4','POS','BGR')
$$, '42501', null, 'AC-305: foreign org_id rejected by WITH CHECK');
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','GRAB','X')
$$, '23514', null, 'AC-305: out-of-set channel rejected by CHECK');

-- AC-307 (part 1): admin deletes a scope row.
select lives_ok($$
  delete from reporting.supervisor_revenue_scope
   where person_id='00000000-0000-0000-0000-0000000000d4' and channel='POS' and branch_code='BGR'
$$, 'AC-307: admin removes a scope row');

-- Seed a scope row for Report (...d5) as admin, for the supervisor-read test.
insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d5','POS','BGR');

-- AC-308: supervisor not self-assignable; admin grants supervisor to another person.
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d3','supervisor')
$$, '42501', null, 'AC-308: supervisor not self-assignable');
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d5','supervisor')
$$, 'AC-308: admin grants supervisor to another person');

-- AC-306: supervisor (Report ...d5) reads ONLY their own scope row (d4's B2B row not visible).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.supervisor_revenue_scope), 1,
  'AC-306: supervisor reads only their own scope row');
select is((select branch_code from reporting.supervisor_revenue_scope), 'BGR',
  'AC-306: the visible scope row is the supervisor''s own POS/BGR grant');

-- AC-307 (part 2): non-admin (supervisor) delete of own row filtered by admin-only USING (0 rows, remains).
select lives_ok($$
  delete from reporting.supervisor_revenue_scope
   where person_id='00000000-0000-0000-0000-0000000000d5' and channel='POS' and branch_code='BGR'
$$, 'AC-307: non-admin delete raises no error');
select is((select count(*)::int from reporting.supervisor_revenue_scope), 1,
  'AC-307: non-admin delete affected zero rows — the scope row remains');

-- AC-304: a non-admin (supervisor ...d5) INSERT is rejected by the admin-only WITH CHECK (42501).
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d5','B2B',null)
$$, '42501', null, 'AC-304: non-admin scope insert denied by RLS WITH CHECK');

reset role;

-- AC-309 (I-1, review 2026-07-30): sibling of AC-214 — the guard must be attached, not just defined.
select has_trigger('reporting','supervisor_revenue_scope','supervisor_revenue_scope_guard',
  'AC-309: supervisor_revenue_scope_guard is attached (org seam + granted_by stamp depend on it)');

select * from finish();
rollback;
