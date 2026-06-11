-- P2-2 test-support fixture: mos._test_seed_role_tree() seeds the role tree that the weekly-update
-- pgTAP files (18..22) assert against. SECURITY DEFINER so it can write the shared.* directory under
-- RLS; it inserts FIXED-UUID fixtures and is intended to be called ONLY inside a begin;...rollback;
-- pgTAP transaction (the rows are rolled back; nothing ships to prod). No app/grant path calls it.
--
-- The tree (org WU-A unless noted):
--   Org WU-A = ...0a01 ; foreign Org WU-B = ...0b01
--   BUs: Unit-1 ...0a02, Unit-2 ...0a03 (WU-A); B-Unit ...0b02 (WU-B)
--   Roles (reports_to climbs upward):
--     Exec    ...0f01 (top, no parent)
--     Lead R  ...0f02 (-> Exec)
--     Staff R ...0f03 (-> Lead R)
--     SubR    ...0f06 (-> Staff R)        -- so a holder is DOWNWARD of a Staff R holder
--     Lead 2  ...0f04 (-> Exec, Unit-2)
--     Staff 2 ...0f05 (-> Lead 2)
--     B-Lead  ...0bf1 (WU-B top)
--   People (held role in []):
--     Author      ...0d01 [Staff R]      -- the author under test
--     DirectMgr   ...0d02 [Lead R]       -- M1: one level up
--     GrandMgr    ...0d03 [Exec]         -- two levels up
--     Peer        ...0d04 [Staff R]      -- SAME role as Author -> peer, NOT a manager
--     Report      ...0d05 [SubR]         -- reports up to Author's role -> DOWNWARD of Author
--     DualHat     ...0d06 [Staff R, Staff 2]  -- reports to BOTH DirectMgr (via Staff R) and Lead2Holder
--     Lead2Holder ...0d07 [Lead 2]       -- M2 for DualHat
--     ForeignMgr  ...0b04 [B-Lead]       -- WU-B; cross-org
create or replace function mos._test_seed_role_tree()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into shared.orgs (id, name, slug) values
    ('00000000-0000-0000-0000-0000000000a1','Org WU-A','org-wu-a'),
    ('00000000-0000-0000-0000-0000000000b1','Org WU-B','org-wu-b');

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
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f3'), -- Author: Staff R
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000f2'), -- DirectMgr: Lead R
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000f1'), -- GrandMgr: Exec
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f3'), -- Peer: Staff R (sibling, NOT a manager)
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000f6'), -- Report: SubR (downward of Author)
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000f3'), -- DualHat: Staff R
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000f5'), -- DualHat: Staff 2
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000f4'), -- Lead2Holder: Lead 2 (M2 of DualHat)
    ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000c1'); -- ForeignMgr: B-Lead
end;
$$;
comment on function mos._test_seed_role_tree() is 'TEST-ONLY fixture (SECURITY DEFINER): seeds the WU-A/WU-B role tree for the weekly-update pgTAP suite. Call only inside a begin;...rollback; transaction.';

-- Lock execution to postgres/service_role only — public default grant would expose this as a
-- reachable PostgREST RPC (mos is in api.schemas), letting any authenticated user bypass RLS
-- and write arbitrary orgs/people/roles into the shared directory (audit Critical, 2026-06-11).
revoke execute on function mos._test_seed_role_tree() from public, anon, authenticated;

-- DOWN: drop function mos._test_seed_role_tree();
