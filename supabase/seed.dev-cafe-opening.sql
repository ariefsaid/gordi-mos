-- seed.dev-cafe-opening.sql — DEV ONLY (Step 7 café retrofit demo + e2e dataset).
-- Enriches the Step-6 process substrate with a specifically-named "Café Opening" process whose
-- Café DAL (mos-app/src/lib/db/cafe-opening.ts, RATIFY-7F) resolves by name — distinct from Step 6's
-- generic "Café HQ daily opening" demo process (seed.dev-processes.sql). Mirrors that file's grammar
-- (resolves BU by `code`, the branch Team by `code`, people by `*.dev@example.test`, roles by name).
--
-- Must stay OUT of any prod seed run (references the fictional *.dev personas — RATIFY-7C: real
-- production branch adoption is owner-gated). Wired in supabase/config.toml [db.seed] sql_paths
-- AFTER seed.dev-processes.sql (needs the Step-6 process/team substrate + its Cafe Ops Lead /
-- Café Opener (demo) roles already seeded).
-- Idempotent: no-op if a "Café Opening" process already exists.
do $$
declare
  v_org        uuid;
  bu_retail    uuid;
  t_radiant    uuid;  -- radiant_operations — the café branch Team (Cahya's primary Team, the demo
                       -- e2e shift-lead who starts today's opening)
  p_dewi       uuid;
  r_cafe_lead  uuid;  -- "Cafe Ops Lead" (seed.dev-processes.sql) — single holder (Cahya)
  r_opener     uuid;  -- "Café Opener (demo)" (seed.dev-processes.sql) — two holders (Cahya + Krishna)
  wl           uuid := 'e3000000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from mos.work_lines where type = 'process' and name = 'Café Opening' limit 1) then
    raise notice 'seed.dev-cafe-opening: a Café Opening process already exists — skipping';
    return;
  end if;

  select org_id into v_org from shared.people where email = 'dewi.dev@example.test';
  if v_org is null then
    raise notice 'seed.dev-cafe-opening: dev personas absent — skipping';
    return;
  end if;
  select id into p_dewi    from shared.people where email = 'dewi.dev@example.test';
  select id into bu_retail from shared.business_units where org_id = v_org and code = 'retail_ops';
  select id into t_radiant from shared.teams where org_id = v_org and code = 'radiant_operations';
  select id into r_cafe_lead from shared.roles where org_id = v_org and name = 'Cafe Ops Lead';
  select id into r_opener    from shared.roles where org_id = v_org and name = 'Café Opener (demo)';
  if bu_retail is null or t_radiant is null or r_cafe_lead is null or r_opener is null then
    raise notice 'seed.dev-cafe-opening: Step-6 process substrate (BU/Team/roles) absent — skipping';
    return;
  end if;

  -- The "Café Opening" process (type=process, BU Retail Ops, A = Dewi) + daily cadence.
  insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id, definition_version) values
    (wl, v_org, 'Café Opening', 'process', bu_retail, p_dewi, 1)
  on conflict (id) do nothing;
  insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind) values
    ('e3000000-0000-0000-0000-0000000000c1', v_org, wl, 'daily')
  on conflict (id) do nothing;

  -- Three task-defs mirroring A1's fixture shape: checklist opening steps → one Task; an
  -- independently-owned production-log step → its own Task; an ambiguous barista step → pending.
  insert into mos.process_task_defs
    (id, org_id, work_line_id, title, position, due_offset_days, checklist_items, pic_role_id) values
    ('e3000000-0000-0000-0000-0000000000d1', v_org, wl, 'Open the café floor', 0, 0,
     '["Unlock the door","Turn on the espresso machine","Check pastry stock","Wipe the bar"]'::jsonb,
     r_cafe_lead),
    ('e3000000-0000-0000-0000-0000000000d2', v_org, wl, 'Log today''s production', 1, 0, '[]'::jsonb,
     r_cafe_lead),
    ('e3000000-0000-0000-0000-0000000000d3', v_org, wl, 'Brew station handover', 2, 0, '[]'::jsonb,
     r_opener)
  on conflict (id) do nothing;
end $$;
