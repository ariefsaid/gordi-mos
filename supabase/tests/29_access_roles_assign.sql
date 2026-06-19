begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- AC-001 (FR-001/FR-030): an admin grants an access role to a person; the row is live with org_id
-- server-stamped. Fixture: _test_seed_role_tree() (role tree) + _test_seed_access_roles() (GrandMgr
-- ...0d03 -> admin; Author ...0d01 -> member/finance/ops_lead-revoked). The admin (...0d03) grants
-- ops_lead to DirectMgr (...0d02), who carries NO fixture access-role rows (so no unique collision).
select mos._test_seed_role_tree();
select mos._test_seed_access_roles();

set local role authenticated;
-- Admin session: GrandMgr (...0d03), holding the admin access role.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d2','ops_lead')
$$, 'AC-001: admin grants ops_lead to person P');

select is((select org_id from shared.person_access_roles
            where person_id='00000000-0000-0000-0000-0000000000d2' and access_role='ops_lead'),
          '00000000-0000-0000-0000-0000000000a1'::uuid, 'AC-001: org_id server-stamped');

select is((select revoked_at from shared.person_access_roles
            where person_id='00000000-0000-0000-0000-0000000000d2' and access_role='ops_lead'),
          null, 'AC-001: granted row is live (revoked_at null)');

reset role;
select * from finish();
rollback;
