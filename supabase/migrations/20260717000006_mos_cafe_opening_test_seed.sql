-- Step 7 (café retrofit) TEST-ONLY fixture. SECURITY DEFINER, revoked. NO business schema/column/RLS/RPC
-- (NFR-701) — data + a test seed function only, mirroring mos._test_seed_process_tree (Step 6). DOWN drops
-- the function. Builds the "Café Opening" occurrence entirely on Step-6 tables (ADR-0051 D11 map).
--
-- GUARD: the fail-closed app.allow_test_seeds guard fires via the inner
-- mos._test_seed_process_tree() call (20260716000015) — this fixture adds no separate guard, it just
-- extends that already-guarded tree with café-meaningful defs on the same Café Opening process (…c001).
create or replace function mos._test_seed_cafe_opening()
returns void language plpgsql security definer set search_path = '' as $$
declare v_org  uuid := '00000000-0000-0000-0000-0000000000a1';
        v_bu   uuid := '00000000-0000-0000-0000-0000000000a2';   -- Unit-1 (stands in for the café Retail-Ops BU)
        v_team uuid;
begin
  perform mos._test_seed_process_tree();                          -- org+BU+Team(own_team)+people+roles+memberships
  select id into v_team from shared.teams where org_id = v_org and code = 'own_team';

  -- Reuse the Step-6 "Café Opening" process (…c001) + daily cadence (…c002); (re)author café defs (…ca01..03).
  -- Idempotent: archive any prior café defs on this process so counts are deterministic under re-seed.
  update mos.process_task_defs set archived_at = now()
   where work_line_id = '00000000-0000-0000-0000-00000000c001' and org_id = v_org
     and id not in ('00000000-0000-0000-0000-00000000ca01','00000000-0000-0000-0000-00000000ca02','00000000-0000-0000-0000-00000000ca03');

  insert into mos.process_task_defs
    (id, org_id, work_line_id, title, position, due_offset_days, checklist_items, pic_role_id, pic_team_id) values
    -- ca01: single-operator opening steps → ONE Task with checklist_items (OD-12). PIC = Opener (Solo, 1 holder).
    ('00000000-0000-0000-0000-00000000ca01', v_org, '00000000-0000-0000-0000-00000000c001',
     'Open the café floor', 0, 0,
     '["Unlock the door","Turn on the espresso machine","Check pastry stock","Wipe the bar"]'::jsonb,
     '00000000-0000-0000-0000-00000000e001', v_team),
    -- ca02: independently-owned step → its OWN Task (deep-links to /cafe/log in the UI). PIC = Opener (Solo).
    ('00000000-0000-0000-0000-00000000ca02', v_org, '00000000-0000-0000-0000-00000000c001',
     'Log today''s production', 1, 0, '[]'::jsonb,
     '00000000-0000-0000-0000-00000000e001', v_team),
    -- ca03: ambiguous barista step → 2 holders (Twin A + Twin B) ⇒ a pending "to assign" item (OD-41).
    ('00000000-0000-0000-0000-00000000ca03', v_org, '00000000-0000-0000-0000-00000000c001',
     'Brew station handover', 2, 0, '[]'::jsonb,
     '00000000-0000-0000-0000-00000000e002', v_team)
  on conflict (id) do update
    set title = excluded.title, position = excluded.position, checklist_items = excluded.checklist_items,
        pic_role_id = excluded.pic_role_id, pic_team_id = excluded.pic_team_id, archived_at = null;
end $$;
comment on function mos._test_seed_cafe_opening() is
  'TEST-ONLY (SECURITY DEFINER): café-opening def set on the Step-6 Café Opening process (…c001). Reuses _test_seed_process_tree. ADR-0051 D11 map; no kitchen-schema change.';
revoke execute on function mos._test_seed_cafe_opening() from public, anon, authenticated;
-- DOWN: drop function if exists mos._test_seed_cafe_opening();
