-- seed.dev-tasks.sql — DEV ONLY (one-click demo + design-review dataset).
-- Provides a representative Tasks set across all 4 statuses, several owners
-- and operating areas, and overdue/soon/calm due-dates so the DB-view (grouping, overdue
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
  v_grinder uuid;
  v_task record;
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

  -- Resolved by the stable `code` column (ADR-0019 D1 remap), not display name — the legacy
  -- operating-area names no longer exist post-remap (renamed "... (legacy)" + archived). Cafe Ops
  -- and Kitchen both fold into the Retail Ops team BU; Roastery -> B2B Ops; Sales -> B2B Sales.
  select id into bu_cafe    from shared.business_units where code = 'retail_ops';
  select id into bu_kitchen from shared.business_units where code = 'retail_ops';
  select id into bu_roast   from shared.business_units where code = 'b2b_ops';
  select id into bu_sales   from shared.business_units where code = 'b2b_sales';
  select id into bu_fin     from shared.business_units where code = 'finance';

  insert into mos.tasks
    (id, org_id, title, business_unit_id, status, responsible_person_id, accountable_person_id,
     consulted_person_ids, informed_person_ids, description, due_date, last_activity_at,
     created_by, created_at, updated_at)
  values
    -- In Progress (4; one overdue)
    (gen_random_uuid(), v_org, 'Dial in new Brazil single-origin', bu_roast, 'In Progress',
       p_rama, p_dewi, array[p_cahya, p_sari], '{}',
       'Pull shots across 3 ratios, log TDS + tasting notes, lock the recipe card before the Saturday wholesale tasting.',
       current_date - 4, now() - interval '2 days', p_dewi,
       now() - interval '9 days', now() - interval '2 days'),
    (gen_random_uuid(), v_org, 'Update espresso recipe cards', bu_cafe, 'In Progress',
       p_cahya, p_dewi, '{}', '{}', 'Refresh dose/yield/time on the bar cards for the new season blend.',
       current_date + 2, now() - interval '5 hours', p_dewi,
       now() - interval '4 days', now() - interval '5 hours'),
    (gen_random_uuid(), v_org, 'Photograph new pastry line', bu_kitchen, 'In Progress',
       p_krishna, p_dewi, array[p_cahya], '{}', 'Studio shots for the menu + socials.',
       current_date + 8, now() - interval '1 day', p_dewi,
       now() - interval '5 days', now() - interval '1 day'),
    (gen_random_uuid(), v_org, 'Q3 wholesale price list', bu_sales, 'In Progress',
       p_sari, p_dewi, '{}', '{}', 'Rebuild the wholesale sheet with the new green-bean costs.',
       current_date + 14, now() - interval '3 days', p_dewi,
       now() - interval '7 days', now() - interval '3 days'),
    -- Blocked (2; both overdue)
    (gen_random_uuid(), v_org, 'Replace grinder burrs (Cafe 2)', bu_cafe, 'Blocked',
       p_cahya, p_dewi, '{}', '{}',
       'Cafe 2 grinder is out of service. Replacement burrs are delayed; resume fitting and safety checks when the parts arrive.',
       current_date - 7, now() - interval '6 days', p_dewi,
       now() - interval '12 days', now() - interval '6 days'),
    (gen_random_uuid(), v_org, 'Source compostable cups vendor', bu_fin, 'Blocked',
       p_fitri, p_dewi, array[p_cahya], '{}', 'Two quotes in; blocked on the sustainability cert check.',
       current_date - 5, now() - interval '4 days', p_dewi,
       now() - interval '10 days', now() - interval '4 days'),
    -- Open (3)
    (gen_random_uuid(), v_org, 'Plan barista latte-art workshop', bu_cafe, 'Open',
       p_cahya, p_dewi, '{}', '{}', 'Half-day internal workshop for the bar team.',
       current_date + 17, now() - interval '1 day', p_dewi,
       now() - interval '1 day', now() - interval '1 day'),
    (gen_random_uuid(), v_org, 'Roastery extractor PM schedule', bu_roast, 'Open',
       p_rama, p_dewi, '{}', '{}', 'Stand up a preventive-maintenance calendar for the extractor.',
       current_date + 22, now() - interval '2 days', p_dewi,
       now() - interval '2 days', now() - interval '2 days'),
    (gen_random_uuid(), v_org, 'Draft Q3 OKRs for cafe team', bu_cafe, 'Open',
       p_dewi, p_dewi, array[p_cahya, p_sari, p_krishna], '{}', 'First pass at the cafe-team objectives for Q3.',
       current_date + 25, now() - interval '7 hours', p_dewi,
       now() - interval '7 hours', now() - interval '7 hours'),
    -- Done (2)
    (gen_random_uuid(), v_org, 'Refit cold brew taps', bu_kitchen, 'Done',
       p_krishna, p_dewi, '{}', '{}', 'Swapped the cold-brew tap hardware on both lines.',
       current_date - 10, now() - interval '9 days', p_dewi,
       now() - interval '15 days', now() - interval '9 days'),
    (gen_random_uuid(), v_org, 'Migrate POS to v4', bu_sales, 'Done',
       p_sari, p_dewi, '{}', '{}', 'Cutover to the v4 POS completed across all outlets.',
       current_date - 14, now() - interval '12 days', p_dewi,
       now() - interval '20 days', now() - interval '12 days');

  -- Seed the event clock behind the displayed Last activity, not just a timestamp on
  -- the Task. Keep each intended latest time in the loop record before event triggers
  -- touch its parent Task.
  for v_task in
    select id, org_id, status, created_by, responsible_person_id, created_at, last_activity_at
      from mos.tasks where org_id = v_org
  loop
    insert into mos.task_events (org_id, task_id, actor_person_id, event_type, created_at)
      values (v_task.org_id, v_task.id, v_task.created_by, 'created', v_task.created_at);
    if v_task.status <> 'Open' then
      insert into mos.task_events
        (org_id, task_id, actor_person_id, event_type, from_value, to_value, created_at)
      values
        (v_task.org_id, v_task.id, v_task.responsible_person_id, 'status_changed',
         case when v_task.status = 'Done' then 'In Progress' else 'Open' end,
         v_task.status, v_task.last_activity_at);
    end if;
  end loop;

  select id into strict v_grinder from mos.tasks
   where org_id = v_org and title = 'Replace grinder burrs (Cafe 2)';
  insert into mos.task_checklist_items
    (org_id, task_id, label, is_done, position, created_at, updated_at)
  values
    (v_org, v_grinder, 'Confirm burr wear and isolate the grinder', true, 0,
     now() - interval '11 days', now() - interval '10 days'),
    (v_org, v_grinder, 'Receive replacement burrs', false, 1,
     now() - interval '11 days', now() - interval '11 days'),
    (v_org, v_grinder, 'Fit burrs and verify alignment and safety', false, 2,
     now() - interval '11 days', now() - interval '11 days');
  insert into mos.comments (org_id, author_id, entity_type, entity_id, body, created_at, updated_at)
  values (v_org, p_cahya, 'task', v_grinder,
          'Replacement burrs are delayed. Cafe 2 grinder stays out of service until they arrive and the safety check passes.',
          now() - interval '6 days', now() - interval '6 days');

  raise notice 'seed.dev-tasks: inserted 11 demo tasks';
end $$;

-- ─── Cascade lookup seed (objectives + work_lines + FK links on tasks) ────────
-- Fixed UUIDs for deterministic dev / design-review usage.
-- Objectives: 2 canonical examples.
-- Work-lines and Task links form plausible daily, project, direct-Objective and
-- unlinked examples for the record and grouped Tasks views.
do $$
declare
  v_org uuid := '10000000-0000-0000-0000-000000000001';
  wl_ig   uuid := 'c0000000-0000-0000-0000-000000000001';  -- Daily IG Content (process)
  wl_menu uuid := 'c0000000-0000-0000-0000-000000000002';  -- New Menu Design (project)
  wl_barista uuid := 'c0000000-0000-0000-0000-000000000003'; -- Barista development (project)
  wl_equipment uuid := 'c0000000-0000-0000-0000-000000000004'; -- Café equipment recovery (project)
  wl_recipe uuid := 'c0000000-0000-0000-0000-000000000005'; -- Beverage recipe rollout (project)
  obj_q3  uuid := 'c0000000-0000-0000-0000-000000000010';  -- Q3 Growth
  obj_ops uuid := 'c0000000-0000-0000-0000-000000000011';  -- Operational Excellence
  p_dewi uuid;
  p_cahya uuid;
  p_krishna uuid;
  p_rama uuid;
  bu_cafe uuid;
  bu_roast uuid;
begin
  if exists (select 1 from mos.work_lines where org_id = v_org limit 1) then
    raise notice 'seed.dev-tasks: cascade lookups not empty — skipping';
    return;
  end if;

  select id into p_dewi from shared.people where email = 'dewi.dev@example.test';
  select id into p_cahya from shared.people where email = 'cahya.dev@example.test';
  select id into p_krishna from shared.people where email = 'krishna.dev@example.test';
  select id into p_rama from shared.people where email = 'rama.dev@example.test';
  select id into bu_cafe from shared.business_units where code = 'retail_ops';
  select id into bu_roast from shared.business_units where code = 'b2b_ops';

  insert into mos.objectives (id, org_id, name, created_at, updated_at) values
    (obj_q3,  v_org, 'Q3 Growth', now() - interval '35 days', now() - interval '35 days'),
    (obj_ops, v_org, 'Operational Excellence', now() - interval '35 days', now() - interval '35 days');

  insert into mos.work_lines
    (id, org_id, name, type, objective_id, business_unit_id,
     responsible_person_id, accountable_person_id, created_at, updated_at)
  values
    (wl_ig, v_org, 'Daily IG Content', 'process', obj_q3, bu_cafe,
     p_krishna, p_dewi, now() - interval '30 days', now() - interval '30 days'),
    (wl_menu, v_org, 'New Menu Design', 'project', obj_q3, bu_cafe,
     p_cahya, p_dewi, now() - interval '30 days', now() - interval '30 days'),
    (wl_barista, v_org, 'Barista development', 'project', null, bu_cafe,
     p_cahya, p_dewi, now() - interval '30 days', now() - interval '30 days'),
    (wl_equipment, v_org, 'Café equipment recovery', 'project', obj_ops, bu_cafe,
     p_cahya, p_dewi, now() - interval '30 days', now() - interval '30 days'),
    (wl_recipe, v_org, 'Beverage recipe rollout', 'project', obj_ops, bu_roast,
     p_rama, p_dewi, now() - interval '30 days', now() - interval '30 days');

  update mos.tasks set work_line_id = wl_ig, objective_id = obj_q3
    where title = 'Photograph new pastry line' and org_id = v_org;
  update mos.tasks set work_line_id = wl_menu, objective_id = obj_q3
    where title = 'Update espresso recipe cards' and org_id = v_org;
  update mos.tasks set work_line_id = wl_recipe, objective_id = obj_ops
    where title = 'Dial in new Brazil single-origin' and org_id = v_org;
  update mos.tasks set work_line_id = wl_equipment, objective_id = obj_ops
    where title = 'Replace grinder burrs (Cafe 2)' and org_id = v_org;
  -- A training Project without an Objective keeps the honest unlinked branch.
  update mos.tasks set work_line_id = wl_barista, objective_id = null
    where title = 'Plan barista latte-art workshop' and org_id = v_org;
  -- Planning/pricing work reaches the Objective directly, with no invented Project.
  update mos.tasks set work_line_id = null, objective_id = obj_q3
    where title in ('Q3 wholesale price list', 'Draft Q3 OKRs for cafe team') and org_id = v_org;

  raise notice 'seed.dev-tasks: inserted cascade lookups (2 objectives, 5 work_lines, coherent Task links + unlinked/direct-Objective cases)';
end $$;
