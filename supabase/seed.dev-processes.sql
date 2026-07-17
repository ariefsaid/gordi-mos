-- seed.dev-processes.sql — DEV ONLY (one-click demo + design-review dataset for Occurrence-as-tasks).
-- Provides one recurring Process ("Café HQ daily opening") with a daily cadence and two generated Task
-- definitions: one whose job-function PIC resolves to a single holder (materializes a Task on spawn) and
-- one whose job-function PIC has two holders (spawns a pending human-choice row — the ambiguity demo).
-- Mirrors seed.dev-signals grammar (resolves BU by `code`, people by `*.dev@example.test`).
--
-- Must stay OUT of any prod seed run (it references the fictional *.dev personas + a demo role).
-- Wired in supabase/config.toml [db.seed] sql_paths AFTER seed.dev-signals.sql (needs people/BUs/roles).
-- Idempotent: skips entirely if mos.process_cadences already has rows.
do $$
declare
  v_org        uuid;
  bu_retail    uuid;
  p_dewi       uuid; p_cahya uuid; p_krishna uuid;
  r_cafe_lead  uuid;
  r_opener     uuid := 'e2000000-0000-0000-0000-0000000000a0';  -- demo role held by two (pending demo)
  wl           uuid := 'e2000000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from mos.process_cadences limit 1) then
    raise notice 'seed.dev-processes: mos.process_cadences not empty — skipping';
    return;
  end if;

  select org_id into v_org from shared.people where email = 'dewi.dev@example.test';
  if v_org is null then
    raise notice 'seed.dev-processes: dev personas absent — skipping';
    return;
  end if;
  select id into p_dewi    from shared.people where email = 'dewi.dev@example.test';
  select id into p_cahya   from shared.people where email = 'cahya.dev@example.test';
  select id into p_krishna from shared.people where email = 'krishna.dev@example.test';
  select id into bu_retail from shared.business_units where org_id = v_org and code = 'retail_ops';
  -- single-holder role: "Cafe Ops Lead" is held by exactly one dev person (Cahya) → resolvable PIC.
  select id into r_cafe_lead from shared.roles where org_id = v_org and name = 'Cafe Ops Lead';

  -- Demo ambiguity role held by TWO dev people (Cahya + Krishna) → spawn records a pending choice.
  insert into shared.roles (id, org_id, business_unit_id, name) values
    (r_opener, v_org, bu_retail, 'Café Opener (demo)')
  on conflict (id) do nothing;
  insert into shared.person_roles (org_id, person_id, role_id) values
    (v_org, p_cahya,   r_opener),
    (v_org, p_krishna, r_opener)
  on conflict (person_id, role_id) do nothing;

  -- The recurring Process (type=process, BU Retail Ops, A = Dewi) + daily cadence.
  insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id, definition_version) values
    (wl, v_org, 'Café HQ daily opening', 'process', bu_retail, p_dewi, 1)
  on conflict (id) do nothing;
  insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind) values
    ('e2000000-0000-0000-0000-0000000000c1', v_org, wl, 'daily')
  on conflict (id) do nothing;

  -- Two generated Task definitions: one resolvable (single holder + checklist), one ambiguous (two holders).
  insert into mos.process_task_defs (id, org_id, work_line_id, title, description, position, due_offset_days, checklist_items, pic_role_id) values
    ('e2000000-0000-0000-0000-0000000000d1', v_org, wl, 'Unlock and prep the floor',
     'Opening checklist for the café floor.', 0, 0,
     '["Unlock front door","Turn on espresso machine","Count the till float"]'::jsonb, r_cafe_lead),
    ('e2000000-0000-0000-0000-0000000000d2', v_org, wl, 'Bakery handover',
     'Confirm the morning bakery drop — two people could own this, so spawn defers to a human choice.', 1, 0,
     '[]'::jsonb, r_opener)
  on conflict (id) do nothing;
end $$;
