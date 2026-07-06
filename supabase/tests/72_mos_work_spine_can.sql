-- pgTAP: shared.can() resolution (ADR-0020 D4, FR-332). Proves the capability function
-- the write policies call. AC-311/312 cite this as the FR-332 proof.
-- can('objective.manage'): admin TRUE; ops_lead/member/finance FALSE.
-- can('workline.manage'):  admin+ops_lead TRUE; member+finance FALSE.
-- fail-closed: no access_roles claim -> every can() FALSE.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- service_role inserts nothing extra; the migration seed is the only grant source.
-- AC-311/FR-332: objective.manage
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}';
select is(shared.can('objective.manage'), true,  'AC-311: admin can(objective.manage) = true');
select is(shared.can('workline.manage'),  true,  'AC-312: admin can(workline.manage) = true');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-00000000ca11","access_roles":["ops_lead"]}';
select is(shared.can('objective.manage'), false, 'AC-311: ops_lead can(objective.manage) = false (OD-C-2 holds)');
select is(shared.can('workline.manage'),  true,  'AC-312: ops_lead can(workline.manage) = true');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}';
select is(shared.can('objective.manage'), false, 'AC-311: member can(objective.manage) = false');
select is(shared.can('workline.manage'),  false, 'AC-312: member can(workline.manage) = false');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","access_roles":["finance"]}';
select is(shared.can('objective.manage'), false, 'AC-311: finance can(objective.manage) = false');
select is(shared.can('workline.manage'),  false, 'AC-312: finance can(workline.manage) = false');

-- fail-closed: absent claim -> FALSE for everything
set local request.jwt.claims = '{}';
select is(shared.can('objective.manage'), false, 'AC-311: no access_roles claim -> can() = false (fail closed)');
reset role;
select * from finish();
rollback;
