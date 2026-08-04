-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 4 of 4: `shared` pgTAP fixtures (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- These fixtures previously lived in `mos` while seeding `shared` rows only. In the squashed
-- baseline they sit with the schema they write, so the `shared` pgTAP suite has no dependency on a
-- schema authored by a different ticket. The fixture UUIDs are UNCHANGED, so a suite that used to
-- call mos._test_seed_role_tree() re-points with a rename and nothing else.
--
-- SECURITY DEFINER so they can write the directory under RLS. Intended to be called ONLY inside a
-- begin;...rollback; pgTAP transaction — the rows never ship. EXECUTE is revoked from
-- public/anon/authenticated because `shared` is exposed through PostgREST: a default PUBLIC grant
-- would make these reachable RPCs that let any authenticated user write arbitrary orgs, people and
-- roles into the directory.
--
-- DOWN: drop function shared._test_seed_access_roles(); drop function shared._test_seed_directory();

-- The tree (org A unless noted):
--   Org A = ...0a01 ; foreign Org B = ...0b01
--   BUs: Unit-1 ...0a02, Unit-2 ...0a03 (A); B-Unit ...0b02 (B)
--   Roles (reports_to climbs upward):
--     Exec    ...0f01 (root)
--     Lead R  ...0f02 (-> Exec)
--     Staff R ...0f03 (-> Lead R)
--     SubR    ...0f06 (-> Staff R)
--     Lead 2  ...0f04 (-> Exec, Unit-2)
--     Staff 2 ...0f05 (-> Lead 2)
--     B-Lead  ...0bf1 -> id ...0c01 (org B root)
--   People (held role in []):
--     Author      ...0d01 [Staff R]            the subject
--     DirectMgr   ...0d02 [Lead R]             one level up
--     GrandMgr    ...0d03 [Exec]               two levels up
--     Peer        ...0d04 [Staff R]            same role -> peer, NOT a manager
--     Report      ...0d05 [SubR]               downward of Author
--     DualHat     ...0d06 [Staff R, Staff 2]   reports to BOTH DirectMgr and Lead2Holder
--     Lead2Holder ...0d07 [Lead 2]
--     ForeignMgr  ...0b04 [B-Lead]             org B; cross-org negative control
create or replace function shared._test_seed_directory()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into shared.orgs (id, name, slug) values
    ('00000000-0000-0000-0000-0000000000a1','Org A','org-a'),
    ('00000000-0000-0000-0000-0000000000b1','Org B','org-b');

  insert into shared.business_units (id, org_id, name) values
    ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a1','Unit-1'),
    ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a1','Unit-2'),
    ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b1','B-Unit');

  insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
    ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Exec',    null),
    ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Lead R',  '00000000-0000-0000-0000-0000000000f1'),
    ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Staff R', '00000000-0000-0000-0000-0000000000f2'),
    ('00000000-0000-0000-0000-0000000000f6','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','SubR',    '00000000-0000-0000-0000-0000000000f3'),
    ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','Lead 2',  '00000000-0000-0000-0000-0000000000f1'),
    ('00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','Staff 2', '00000000-0000-0000-0000-0000000000f4'),
    ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','B-Lead',  null);

  insert into shared.people (id, org_id, full_name) values
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','Author'),
    ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000a1','DirectMgr'),
    ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000a1','GrandMgr'),
    ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000a1','Peer'),
    ('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000a1','Report'),
    ('00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000a1','DualHat'),
    ('00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000a1','Lead2Holder'),
    ('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b1','ForeignMgr');

  insert into shared.person_roles (org_id, person_id, role_id) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f3'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000f2'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000f1'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f3'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000f6'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000f3'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000f5'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000f4'),
    ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000c1');
end;
$$;
comment on function shared._test_seed_directory() is
  'TEST-ONLY fixture (SECURITY DEFINER): seeds the two-org directory + role tree the shared pgTAP suite asserts against. Call only inside a begin;...rollback; transaction.';
revoke execute on function shared._test_seed_directory() from public, anon, authenticated;

-- Access-role grants on the tree above, plus the auth link the hook resolves.
-- GrandMgr (...0d03) -> admin; Author (...0d01) -> member + finance live, ops_lead revoked.
create or replace function shared._test_seed_access_roles()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aa01')
    on conflict (id) do nothing;
  update shared.people set user_id = '00000000-0000-0000-0000-00000000aa01'
    where id = '00000000-0000-0000-0000-0000000000d1';
  insert into shared.person_access_roles (org_id, person_id, access_role) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','admin'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','member'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','finance');
  insert into shared.person_access_roles (org_id, person_id, access_role, revoked_at) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','ops_lead', now());
end;
$$;
comment on function shared._test_seed_access_roles() is
  'TEST-ONLY fixture (SECURITY DEFINER): access-role grants on the seeded tree. Call after shared._test_seed_directory(), inside begin;...rollback;.';
revoke execute on function shared._test_seed_access_roles() from public, anon, authenticated;
