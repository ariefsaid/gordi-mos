// E2E global teardown — restores the local dev DB's Tasks data to the realistic Gordi demo set
// after every e2e run.
//
// F1 (rendered-design finding, Tasks surfaces): screenshots taken against a local stack that had
// just run e2e showed 'Dirty veto 1784742614442', 'E2E Archiveable Task', QA fixture titles — not
// realistic Gordi tasks. Root cause: global-setup's step 6 WIPES mos.tasks for the org before
// seeding its own fixtures (deterministic clean slate for the specs that need it), and individual
// specs leave their own throwaway-titled tasks behind. Nothing ever restored the realistic dataset
// afterward, so mos.tasks was left holding ONLY test fixtures (the 11 seed.dev-tasks.sql rows were
// wiped, not just diluted) for anyone browsing /work/tasks locally post-e2e — including
// design-review screenshot capture.
//
// This runs once, after the whole e2e run finishes (Playwright's globalTeardown, not per-file):
//   1. deletes every mos.tasks row whose title matches a known e2e/test naming convention (a short
//      spec-id prefix + Date.now() suffix, or a literal AC-###/E2E fixture title — no realistic
//      demo task name matches either shape) — children (task_events, task_checklist_items,
//      signal_tasks) cascade-delete with the task row. Process-spawned occurrence tasks
//      ("Unlock and prep the floor", …) are left alone: their titles are realistic, and
//      mos.process_run_pending_tasks.materialized_task_id has no cascade.
//   2. re-inserts the same 11 realistic demo tasks as supabase/seed.dev-tasks.sql — same titles,
//      RACI, relative due-dates, and the same work-line/objective links that file's second block
//      applies — pointing at the SAME fixed-id demo objectives/work_lines that script seeded
//      (e2e never deletes those; global-setup only clears its own 'E2E %' objectives).
// Idempotent PER TASK: each of the 11 rows is inserted where-not-exists on its own title, so a
// partial wipe (a run that died after deleting some demo tasks) is healed row by row rather than
// skipped because one canonical row happened to survive.
//
// LOCAL-DEV ONLY, enforced: this file runs service-role DELETEs, so it refuses to run unless the
// resolved Supabase URL points at 127.0.0.1/localhost. The /pg/query endpoint it uses is itself
// local-stack-only, but the refusal must not depend on that.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

function loadEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return vars
  } catch {
    return {}
  }
}

const envFile = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL = envFile.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_ROLE_KEY = envFile.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const ORG = '10000000-0000-0000-0000-000000000001'

async function execSql(query: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[global-teardown] SQL exec failed: ${res.status} ${body} — query: ${query}`)
  }
}

// Every e2e-created task title is either a literal fixture string ('E2E Archiveable Task') or
// "<short spec code> <Date.now()>" ('Dirty veto …', 'OD63 …', 'AC-090 …', 'J1/J2/J3 …') — no
// seed.dev-tasks.sql title matches either shape.
const JUNK_TITLE_SQL = `title ~ '^(AC-[0-9]+|OD[0-9]+ |J[0-9]+ |E2E )' OR title ~ '^Dirty veto ' OR title ~ '[0-9]{9,}$'`

export default async function globalTeardown() {
  // Environment guard FIRST, before any other branch: deleting and re-seeding demo data is a
  // local-dev-only operation, whatever keys happen to be in the environment.
  const host = new URL(SUPABASE_URL).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `[global-teardown] REFUSING to run against non-local Supabase URL (${SUPABASE_URL}) — ` +
        'this teardown deletes and re-seeds demo data and is local-dev only',
    )
  }

  if (!SERVICE_ROLE_KEY) {
    console.warn('[global-teardown] SUPABASE_SERVICE_ROLE_KEY not set — skipping demo-data restore')
    return
  }

  await execSql(`DELETE FROM mos.tasks WHERE org_id = '${ORG}' AND (${JUNK_TITLE_SQL});`)
  console.log('[global-teardown] cleared e2e/test-fixture task rows')

  // Re-seed the realistic demo tasks (mirrors seed.dev-tasks.sql exactly — same titles, RACI,
  // relative due-dates, and its second block's links to the SAME fixed-id demo
  // objectives/work_lines, which e2e never touches). PER-TASK idempotent: each row is inserted
  // where-not-exists on its own title, so a partial wipe is healed row by row and a run where
  // nothing got wiped is a no-op — never all-or-skip on one canonical title.
  await execSql(`
    do $$
    declare
      v_org uuid := '${ORG}';
      p_dewi uuid; p_cahya uuid; p_krishna uuid; p_rama uuid; p_sari uuid; p_fitri uuid;
      bu_cafe uuid; bu_kitchen uuid; bu_roast uuid; bu_sales uuid; bu_fin uuid;
      wl_ig    uuid := 'c0000000-0000-0000-0000-000000000001';
      wl_menu  uuid := 'c0000000-0000-0000-0000-000000000002';
      wl_brand uuid := 'c0000000-0000-0000-0000-000000000003';
      obj_q3   uuid := 'c0000000-0000-0000-0000-000000000010';
      obj_ops  uuid := 'c0000000-0000-0000-0000-000000000011';
      t record;
      v_n integer;
      v_restored integer := 0;
    begin
      select id into p_dewi    from shared.people where email = 'dewi.dev@example.test';
      select id into p_cahya   from shared.people where email = 'cahya.dev@example.test';
      select id into p_krishna from shared.people where email = 'krishna.dev@example.test';
      select id into p_rama    from shared.people where email = 'rama.dev@example.test';
      select id into p_sari    from shared.people where email = 'sari.dev@example.test';
      select id into p_fitri   from shared.people where email = 'fitri.dev@example.test';

      select id into bu_cafe    from shared.business_units where code = 'retail_ops';
      select id into bu_kitchen from shared.business_units where code = 'retail_ops';
      select id into bu_roast   from shared.business_units where code = 'b2b_ops';
      select id into bu_sales   from shared.business_units where code = 'b2b_sales';
      select id into bu_fin     from shared.business_units where code = 'finance';

      for t in
        select * from (values
          -- In Progress (4; one overdue)
          ('Dial in new Brazil single-origin', bu_roast, 'In Progress', p_rama, array[p_cahya, p_sari],
             'Pull shots across 3 ratios, log TDS + tasting notes, lock the recipe card before the Saturday wholesale tasting.',
             -4, interval '2 days', wl_ig, obj_ops),
          ('Update espresso recipe cards', bu_cafe, 'In Progress', p_cahya, '{}'::uuid[],
             'Refresh dose/yield/time on the bar cards for the new season blend.',
             2, interval '5 hours', wl_ig, obj_ops),
          ('Photograph new pastry line', bu_kitchen, 'In Progress', p_krishna, array[p_cahya],
             'Studio shots for the menu + socials.',
             8, interval '1 day', wl_menu, obj_q3),
          ('Q3 wholesale price list', bu_sales, 'In Progress', p_sari, '{}'::uuid[],
             'Rebuild the wholesale sheet with the new green-bean costs.',
             14, interval '3 days', wl_brand, obj_q3),
          -- Blocked (2; both overdue). Grinder burrs carries the explicit Unlinked-branch fixture
          -- (work_line set, objective NULL) exactly as seed.dev-tasks.sql leaves it.
          ('Replace grinder burrs (Cafe 2)', bu_cafe, 'Blocked', p_cahya, '{}'::uuid[],
             'Waiting on the Mazzer parts order to clear customs.',
             -7, interval '6 days', wl_ig, null),
          ('Source compostable cups vendor', bu_fin, 'Blocked', p_fitri, array[p_cahya],
             'Two quotes in; blocked on the sustainability cert check.',
             -5, interval '4 days', null, null),
          -- Open (3). Latte-art carries the No-Project/Process subgroup fixture (objective set,
          -- work_line NULL), matching seed.dev-tasks.sql's work-spine branch fixtures.
          ('Plan barista latte-art workshop', bu_cafe, 'Open', p_cahya, '{}'::uuid[],
             'Half-day internal workshop for the bar team.',
             17, interval '1 day', null, obj_ops),
          ('Roastery extractor PM schedule', bu_roast, 'Open', p_rama, '{}'::uuid[],
             'Stand up a preventive-maintenance calendar for the extractor.',
             22, interval '2 days', null, null),
          ('Draft Q3 OKRs for cafe team', bu_cafe, 'Open', p_dewi, array[p_cahya, p_sari, p_krishna],
             'First pass at the cafe-team objectives for Q3.',
             25, interval '7 hours', null, null),
          -- Done (2)
          ('Refit cold brew taps', bu_kitchen, 'Done', p_krishna, '{}'::uuid[],
             'Swapped the cold-brew tap hardware on both lines.',
             -10, interval '9 days', null, null),
          ('Migrate POS to v4', bu_sales, 'Done', p_sari, '{}'::uuid[],
             'Cutover to the v4 POS completed across all outlets.',
             -14, interval '12 days', null, null)
        ) as v(title, bu, status, responsible, consulted, descr, due_offset, activity_ago, wl, obj)
      loop
        insert into mos.tasks
          (id, org_id, title, business_unit_id, status, responsible_person_id, accountable_person_id,
           consulted_person_ids, informed_person_ids, description, due_date, last_activity_at,
           created_by, created_at, updated_at, work_line_id, objective_id)
        select gen_random_uuid(), v_org, t.title, t.bu, t.status, t.responsible, p_dewi,
               t.consulted, '{}', t.descr, current_date + t.due_offset, now() - t.activity_ago,
               p_dewi, now(), now(), t.wl, t.obj
        where not exists (select 1 from mos.tasks where org_id = v_org and title = t.title);
        get diagnostics v_n = row_count;
        v_restored := v_restored + v_n;
      end loop;

      raise notice 'global-teardown: restored % of the 11 realistic demo tasks (rest already present)', v_restored;
    end $$;
  `)
  console.log('[global-teardown] restored realistic Gordi demo tasks')
}
