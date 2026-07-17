-- TEST-ONLY (SECURITY DEFINER, revoked). Calls _test_seed_role_tree() then adds the Signal substrate.
-- Fixture ids (valid hex — the plan's "...5t01" mnemonics are NOT valid UUIDs, so concrete hex is used):
--   Site  Unit-1 Site   00000000-0000-0000-0000-000000005a01
--   Team  OwnTeam       00000000-0000-0000-0000-000000005b01  (BU Unit-1 ...00a2, site ...5a01)
--   Team  SiblingTeam   00000000-0000-0000-0000-000000005b02  (same BU Unit-1, no site)
-- Memberships (active): Author(...0d1)→OwnTeam (primary), Peer(...0d4)→SiblingTeam (primary).
-- Personas for the read grants:
--   R1 Author(...0d1) is an OwnTeam member. R2 DirectMgr(...0d2) holds Lead R (Unit-1 role) over the
--   owning BU. R3 Lead2Holder(...0d7) holds Lead 2 (Unit-2, rank 2) > owning BU Unit-1 rank 0.
-- BU ranks: Unit-1 ...00a2 rank 0; Unit-2 ...00a3 rank 2.
--
-- DEVIATION (recorded): _test_seed_role_tree() gives Peer(...0d4) the Staff R role, whose BU is Unit-1
-- (the owning BU). Under the BU-scoped R2 grant (ADR-0050 D4, RATIFY-3), that role alone would grant
-- Peer read to any Unit-1-owned Signal — making AC-403 (sibling default-deny) and AC-406 (revoked-mention
-- default-deny) unprovable. So this fixture strips Peer's person_roles, modelling exactly what those ACs
-- describe: "a member of a sibling Team ... with no [BU-scoped] role", i.e. team membership alone must
-- NOT grant read. This is a test-fixture shaping decision, not a policy change.
create or replace function mos._test_seed_signal_tree()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform mos._test_seed_role_tree();

  -- Peer(...0d4) becomes a pure sibling-Team member with no BU-scoped role (see DEVIATION note above).
  delete from shared.person_roles where person_id = '00000000-0000-0000-0000-0000000000d4';

  insert into shared.sites (id, org_id, name, code) values
    ('00000000-0000-0000-0000-000000005a01','00000000-0000-0000-0000-0000000000a1','Unit-1 Site','unit1_site');
  insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
    ('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000005a01','OwnTeam','own_team'),
    ('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',null,'SiblingTeam','sibling_team');
  insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01',true),  -- Author→OwnTeam
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000005b02',true);  -- Peer→SiblingTeam
  update shared.business_units set signal_visibility_rank = 2 where id = '00000000-0000-0000-0000-0000000000a3'; -- Unit-2
  update shared.business_units set signal_visibility_rank = 0 where id = '00000000-0000-0000-0000-0000000000a2'; -- Unit-1
end $$;
revoke execute on function mos._test_seed_signal_tree() from public, anon, authenticated;
comment on function mos._test_seed_signal_tree() is
  'TEST-ONLY fixture (SECURITY DEFINER): Signal Team substrate on the WU-A tree. Call inside begin;...rollback;.';
-- DOWN: drop function if exists mos._test_seed_signal_tree();
