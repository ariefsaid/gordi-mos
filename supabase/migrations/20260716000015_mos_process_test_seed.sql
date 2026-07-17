-- TEST-ONLY (SECURITY DEFINER, revoked). Extends the ADR-0050 signal seed (mos._test_seed_signal_tree(),
-- which builds org …00a1, BU Unit-1 …00a2, Teams own_team/sibling_team + memberships) with a process +
-- cadence + three task-defs exercising all three PIC-resolution paths (single / vacant / ambiguous).
--
-- GUARD: mirrors 20260717000003 (LOW-3 fix). Fail-closed unless the caller has opted in via the
-- app.allow_test_seeds GUC (the pgTAP harness sets it per-transaction). Prod never sets it, so this
-- mutating fixture raises 42501 there. _test_seed_signal_tree carries the same guard; this outer guard
-- fires first so the whole tree is fail-closed at its entry point.
--
-- Fixture ids (valid hex):
--   People  Solo …f001 (RoleSolo, 1 holder) · Twin A …f002 + Twin B …f003 (RoleTwin, 2) · Boss …f004 (Process A)
--   Roles   Opener …e001 (1 holder) · Twin Station …e002 (2 holders) · Vacant Station …e003 (0 holders)
--   Process Café Opening …c001 (type=process, BU Unit-1, A=Boss) + daily cadence …c002
--   Defs    TdSolo …d001 (resolvable, 2 checklist items) · TdVacant …d002 (0) · TdTwin …d003 (2)
create or replace function mos._test_seed_process_tree()
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := '00000000-0000-0000-0000-0000000000a1';
        v_bu  uuid := '00000000-0000-0000-0000-0000000000a2';  -- Unit-1
        v_team uuid;
begin
  -- LOW-3: fail-closed unless the caller has explicitly opted in (local/CI only). Prod never sets it.
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_process_tree is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  perform mos._test_seed_signal_tree();                       -- org + BU + Teams(own_team/sibling_team) + memberships
  select id into v_team from shared.teams where org_id = v_org and code = 'own_team';

  -- People: Solo (1 holder), TwinA + TwinB (2 holders), Boss (process A).
  insert into shared.people (id, org_id, full_name) values
    ('00000000-0000-0000-0000-00000000f001', v_org, 'Solo Holder'),
    ('00000000-0000-0000-0000-00000000f002', v_org, 'Twin A'),
    ('00000000-0000-0000-0000-00000000f003', v_org, 'Twin B'),
    ('00000000-0000-0000-0000-00000000f004', v_org, 'Boss (Process A)')
  on conflict (id) do nothing;

  -- Roles: RoleSolo (1 holder), RoleTwin (2 holders), RoleVacant (0 holders).
  insert into shared.roles (id, org_id, business_unit_id, name) values
    ('00000000-0000-0000-0000-00000000e001', v_org, v_bu, 'Opener'),
    ('00000000-0000-0000-0000-00000000e002', v_org, v_bu, 'Twin Station'),
    ('00000000-0000-0000-0000-00000000e003', v_org, v_bu, 'Vacant Station')
  on conflict (id) do nothing;
  insert into shared.person_roles (org_id, person_id, role_id) values
    (v_org, '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001'),
    (v_org, '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e002'),
    (v_org, '00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e002')
  on conflict do nothing;

  -- Team memberships (active) so pic_team_id scoping resolves.
  insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
    (v_org, '00000000-0000-0000-0000-00000000f001', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f002', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f003', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f004', v_team, false)
  on conflict do nothing;

  -- Process definition (type=process, BU Unit-1, A=Boss) + daily cadence.
  insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id, definition_version) values
    ('00000000-0000-0000-0000-00000000c001', v_org, 'Café Opening', 'process', v_bu,
     '00000000-0000-0000-0000-00000000f004', 1) on conflict (id) do nothing;
  insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind) values
    ('00000000-0000-0000-0000-00000000c002', v_org, '00000000-0000-0000-0000-00000000c001', 'daily')
    on conflict (id) do nothing;

  -- Three task-defs: TdSolo (resolvable, checklist), TdVacant (0), TdTwin (2).
  insert into mos.process_task_defs (id, org_id, work_line_id, title, position, due_offset_days, checklist_items, pic_role_id, pic_team_id) values
    ('00000000-0000-0000-0000-00000000d001', v_org, '00000000-0000-0000-0000-00000000c001', 'Open the café', 0, 0,
     '["Unlock door","Turn on machine"]'::jsonb, '00000000-0000-0000-0000-00000000e001', v_team),
    ('00000000-0000-0000-0000-00000000d002', v_org, '00000000-0000-0000-0000-00000000c001', 'Vacant step', 1, 0,
     '[]'::jsonb, '00000000-0000-0000-0000-00000000e003', v_team),
    ('00000000-0000-0000-0000-00000000d003', v_org, '00000000-0000-0000-0000-00000000c001', 'Twin step', 2, 0,
     '[]'::jsonb, '00000000-0000-0000-0000-00000000e002', v_team)
  on conflict (id) do nothing;
end $$;
revoke execute on function mos._test_seed_process_tree() from public, anon, authenticated;
comment on function mos._test_seed_process_tree() is
  'TEST-ONLY fixture (SECURITY DEFINER): Café-Opening process on the WU-A signal tree. Guarded by app.allow_test_seeds=on (LOW-3, fail-closed in prod). Call inside begin;...rollback;.';
-- DOWN: drop function if exists mos._test_seed_process_tree();
