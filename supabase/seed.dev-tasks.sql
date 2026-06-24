-- seed.dev-tasks.sql — DEV ONLY (one-click demo + design-review dataset).
-- Provides a representative Tasks set across all 4 statuses, all 5 BUs, several
-- owners, and overdue/soon/calm due-dates so the DB-view (grouping, overdue
-- subtotals, soft chips, off-track signal) renders meaningfully. Mirrors the
-- adopted mockup docs/design-mockups/tasks-dbview-final.html.
--
-- Must stay OUT of any prod seed run (it references the fictional *.dev personas).
-- Wired in supabase/config.toml [db.seed] sql_paths AFTER seed.sql (needs people/BUs).
-- Idempotent: skips if mos.tasks already has rows. Due-dates are RELATIVE to
-- current_date so overdue/soon/calm stay correct regardless of run date.
do $$
declare
  v_org uuid;
  p_dewi uuid; p_cahya uuid; p_krishna uuid; p_rama uuid; p_sari uuid; p_fitri uuid;
  bu_cafe uuid; bu_kitchen uuid; bu_roast uuid; bu_sales uuid; bu_fin uuid;
begin
  if exists (select 1 from mos.tasks limit 1) then
    raise notice 'seed.dev-tasks: mos.tasks not empty — skipping';
    return;
  end if;

  select org_id into v_org from shared.people where email = 'dewi.dev@example.test';
  select id into p_dewi    from shared.people where email = 'dewi.dev@example.test';
  select id into p_cahya   from shared.people where email = 'cahya.dev@example.test';
  select id into p_krishna from shared.people where email = 'krishna.dev@example.test';
  select id into p_rama    from shared.people where email = 'rama.dev@example.test';
  select id into p_sari    from shared.people where email = 'sari.dev@example.test';
  select id into p_fitri   from shared.people where email = 'fitri.dev@example.test';

  select id into bu_cafe    from shared.business_units where name = 'Cafe Ops – General';
  select id into bu_kitchen from shared.business_units where name = 'Kitchen and Bar';
  select id into bu_roast   from shared.business_units where name = 'Roastery';
  select id into bu_sales   from shared.business_units where name = 'Sales – CRM';
  select id into bu_fin     from shared.business_units where name = 'Finance and People';

  insert into mos.tasks
    (id, org_id, title, business_unit_id, status, responsible_person_id, accountable_person_id,
     consulted_person_ids, informed_person_ids, description, due_date, last_activity_at,
     created_by, created_at, updated_at)
  values
    -- In Progress (4; one overdue)
    (gen_random_uuid(), v_org, 'Dial in new Brazil single-origin', bu_roast, 'In Progress',
       p_rama, p_dewi, array[p_cahya, p_sari], '{}',
       'Pull shots across 3 ratios, log TDS + tasting notes, lock the recipe card before the Saturday wholesale tasting.',
       current_date - 4, now() - interval '2 days', p_dewi, now(), now()),
    (gen_random_uuid(), v_org, 'Update espresso recipe cards', bu_cafe, 'In Progress',
       p_cahya, p_dewi, '{}', '{}', 'Refresh dose/yield/time on the bar cards for the new season blend.',
       current_date + 2, now() - interval '5 hours', p_dewi, now(), now()),
    (gen_random_uuid(), v_org, 'Photograph new pastry line', bu_kitchen, 'In Progress',
       p_krishna, p_dewi, array[p_cahya], '{}', 'Studio shots for the menu + socials.',
       current_date + 8, now() - interval '1 day', p_dewi, now(), now()),
    (gen_random_uuid(), v_org, 'Q3 wholesale price list', bu_sales, 'In Progress',
       p_sari, p_dewi, '{}', '{}', 'Rebuild the wholesale sheet with the new green-bean costs.',
       current_date + 14, now() - interval '3 days', p_dewi, now(), now()),
    -- Blocked (2; both overdue)
    (gen_random_uuid(), v_org, 'Replace grinder burrs (Cafe 2)', bu_cafe, 'Blocked',
       p_cahya, p_dewi, '{}', '{}', 'Waiting on the Mazzer parts order to clear customs.',
       current_date - 7, now() - interval '6 days', p_dewi, now(), now()),
    (gen_random_uuid(), v_org, 'Source compostable cups vendor', bu_fin, 'Blocked',
       p_fitri, p_dewi, array[p_cahya], '{}', 'Two quotes in; blocked on the sustainability cert check.',
       current_date - 5, now() - interval '4 days', p_dewi, now(), now()),
    -- Open (3)
    (gen_random_uuid(), v_org, 'Plan barista latte-art workshop', bu_cafe, 'Open',
       p_cahya, p_dewi, '{}', '{}', 'Half-day internal workshop for the bar team.',
       current_date + 17, now() - interval '1 day', p_dewi, now(), now()),
    (gen_random_uuid(), v_org, 'Roastery extractor PM schedule', bu_roast, 'Open',
       p_rama, p_dewi, '{}', '{}', 'Stand up a preventive-maintenance calendar for the extractor.',
       current_date + 22, now() - interval '2 days', p_dewi, now(), now()),
    (gen_random_uuid(), v_org, 'Draft Q3 OKRs for cafe team', bu_cafe, 'Open',
       p_dewi, p_dewi, array[p_cahya, p_sari, p_krishna], '{}', 'First pass at the cafe-team objectives for Q3.',
       current_date + 25, now() - interval '7 hours', p_dewi, now(), now()),
    -- Done (2)
    (gen_random_uuid(), v_org, 'Refit cold brew taps', bu_kitchen, 'Done',
       p_krishna, p_dewi, '{}', '{}', 'Swapped the cold-brew tap hardware on both lines.',
       current_date - 10, now() - interval '9 days', p_dewi, now(), now()),
    (gen_random_uuid(), v_org, 'Migrate POS to v4', bu_sales, 'Done',
       p_sari, p_dewi, '{}', '{}', 'Cutover to the v4 POS completed across all outlets.',
       current_date - 14, now() - interval '12 days', p_dewi, now(), now());

  raise notice 'seed.dev-tasks: inserted 11 demo tasks';
end $$;

-- ─── Cascade lookup seed (objectives + work_lines + FK links on tasks) ────────
-- Fixed UUIDs for deterministic dev / design-review usage.
-- Objectives: 2 canonical examples.
-- Work-lines: designer canon from plan (process + project + project).
-- A handful of existing tasks are linked so the grouped Tasks view renders with data.
do $$
declare
  v_org uuid := '10000000-0000-0000-0000-000000000001';
  wl_ig   uuid := 'c0000000-0000-0000-0000-000000000001';  -- Daily IG Content (process)
  wl_menu uuid := 'c0000000-0000-0000-0000-000000000002';  -- New Menu Design (project)
  wl_brand uuid := 'c0000000-0000-0000-0000-000000000003'; -- Brand Refresh (project)
  obj_q3  uuid := 'c0000000-0000-0000-0000-000000000010';  -- Q3 Growth
  obj_ops uuid := 'c0000000-0000-0000-0000-000000000011';  -- Operational Excellence
begin
  if exists (select 1 from mos.work_lines where org_id = v_org limit 1) then
    raise notice 'seed.dev-tasks: cascade lookups not empty — skipping';
    return;
  end if;

  insert into mos.objectives (id, org_id, name) values
    (obj_q3,  v_org, 'Q3 Growth'),
    (obj_ops, v_org, 'Operational Excellence');

  insert into mos.work_lines (id, org_id, name, type) values
    (wl_ig,    v_org, 'Daily IG Content', 'process'),
    (wl_menu,  v_org, 'New Menu Design',  'project'),
    (wl_brand, v_org, 'Brand Refresh',    'project');

  -- Link a sample of the existing dev tasks to work-lines + objectives so the
  -- grouped Tasks view and per-person split render with data.
  update mos.tasks set work_line_id = wl_menu,  objective_id = obj_q3
    where title = 'Photograph new pastry line'  and org_id = v_org;
  update mos.tasks set work_line_id = wl_brand, objective_id = obj_q3
    where title = 'Q3 wholesale price list'     and org_id = v_org;
  update mos.tasks set work_line_id = wl_ig,    objective_id = obj_ops
    where title = 'Update espresso recipe cards' and org_id = v_org;
  update mos.tasks set work_line_id = wl_ig,    objective_id = obj_ops
    where title = 'Dial in new Brazil single-origin' and org_id = v_org;

  raise notice 'seed.dev-tasks: inserted cascade lookups (2 objectives, 3 work_lines, 4 task links)';
end $$;
