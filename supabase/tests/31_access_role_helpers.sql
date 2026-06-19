begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- The read helpers source the JWT access_roles claim only — no fixture rows needed.
set local role authenticated;

-- AC-020 (FR-020/FR-021): claim present -> current_access_roles + has_access_role read it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","access_roles":["ops_lead","member"]}';
select set_eq($$ select unnest(shared.current_access_roles()) $$, array['ops_lead','member'],
  'AC-020: current_access_roles returns the claim set');
select ok(shared.has_access_role('ops_lead'), 'AC-020: has_access_role(ops_lead) true');
select ok(not shared.has_access_role('admin'), 'AC-020: has_access_role(admin) false');

-- AC-021 (FR-020): absent claim -> empty, all checks false (fail closed).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
select is(array_length(shared.current_access_roles(),1), null, 'AC-021: absent claim -> empty array');
select ok(not shared.has_access_role('member'), 'AC-021: absent claim -> has_access_role false');

-- AC-021: malformed claims setting -> empty, no raise (fail closed).
set local request.jwt.claims = 'not json at all';
select ok(not shared.has_access_role('admin'), 'AC-021: malformed claims -> false (fail closed, no raise)');

reset role;
select * from finish();
rollback;
