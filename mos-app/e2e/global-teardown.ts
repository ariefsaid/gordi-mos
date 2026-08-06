// E2E global teardown — restores the local dev DB's Tasks data to the realistic Gordi demo set
// after every e2e run.
//
// F1 (rendered-design finding, Tasks surfaces): screenshots taken against a local stack that had
// just run e2e showed 'Dirty veto 1784742614442', 'E2E Archiveable Task', 'AC-305 linked/unlinked/
// no work line task' — QA fixture titles, not realistic Gordi tasks. Root cause: global-setup's
// step 6 WIPES mos.tasks for the org before seeding its own AC-305/E2E fixtures (deterministic
// clean slate for the specs that need it), and individual specs (createTaskViaUI: 'Dirty veto …',
// 'OD63 …', 'OD62 …', 'AC-090 …', 'J1/J2/J3 …') leave their own throwaway-titled tasks behind.
// Nothing ever restored the realistic dataset afterward, so mos.tasks was left holding ONLY test
// fixtures (the 11 seed.dev-tasks.sql rows were wiped, not just diluted) for anyone browsing
// /work/tasks locally post-e2e — including design-review screenshot capture.
//
// This runs once, after the whole e2e run finishes (Playwright's globalTeardown, not per-file):
//   1. deletes every mos.tasks row whose title matches a known e2e/test naming convention (a short
//      spec-id prefix + Date.now() suffix, or a literal AC-###/E2E fixture title — no realistic
//      demo task name matches either shape) — children (task_events, task_checklist_items, etc.)
//      cascade-delete with the task row (all `task_id references mos.tasks(id) on delete cascade`).
//   2. re-inserts the same 11 realistic demo tasks as supabase/seed.dev-tasks.sql, linked to the
//      SAME fixed-id demo objectives/work_lines that script seeded — those are never touched by
//      e2e (global-setup only upserts its own distinctly-id'd AC-305 objective/work_line, it never
//      deletes the demo ones), so this only needs to re-populate mos.tasks itself.
// Idempotent: guarded on one canonical demo title already being present, mirroring
// seed.dev-tasks.sql's own "skip if already seeded" guard.

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

// Every e2e-created task title is either a literal fixture string ('E2E Archiveable Task',
// 'AC-305 linked/unlinked/no work line task') or "<short spec code> <Date.now()>" ('Dirty veto …',
// 'OD63 …', 'OD62 …', 'AC-090 …', 'J1/J2/J3 …') — no seed.dev-tasks.sql title matches either shape.
const JUNK_TITLE_SQL = `title ~ '^(AC-[0-9]+|OD[0-9]+ |J[0-9]+ |E2E )' OR title ~ '^Dirty veto ' OR title ~ '[0-9]{9,}$'`

export default async function globalTeardown() {
  if (!SERVICE_ROLE_KEY) {
    console.warn('[global-teardown] SUPABASE_SERVICE_ROLE_KEY not set — skipping demo-data restore')
    return
  }

  await execSql(`DELETE FROM mos.tasks WHERE org_id = '${ORG}' AND (${JUNK_TITLE_SQL});`)
  console.log('[global-teardown] cleared e2e/test-fixture task rows')

  // Re-seed the realistic demo tasks (mirrors seed.dev-tasks.sql exactly — same titles, owners,
  // relative due-dates, and links to the SAME fixed-id demo objectives/work_lines, which e2e never
  // touches). Guarded so a second teardown invocation (or a run where nothing got wiped) is a no-op.
  await execSql(`
    do $$
    declare
      v_org uuid := '${ORG}';
      p_dewi uuid; p_cahya uuid; p_krishna uuid; p_rama uuid; p_sari uuid; p_fitri uuid;
      bu_cafe uuid; bu_kitchen uuid; bu_roast uuid; bu_sales uuid; bu_fin uuid;
      wl_ig   uuid := 'c0000000-0000-0000-0000-000000000001';
      wl_menu uuid := 'c0000000-0000-0000-0000-000000000002';
      wl_brand uuid := 'c0000000-0000-0000-0000-000000000003';
      obj_q3  uuid := 'c0000000-0000-0000-0000-000000000010';
      obj_ops uuid := 'c0000000-0000-0000-0000-000000000011';
    begin
      if exists (select 1 from mos.tasks where org_id = v_org and title = 'Dial in new Brazil single-origin') then
        raise notice 'global-teardown: demo tasks already present — skipping restore';
        return;
      end if;

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

      insert into mos.tasks
        (id, org_id, title, business_unit_id, status, responsible_person_id, accountable_person_id,
         consulted_person_ids, informed_person_ids, description, due_date, last_activity_at,
         created_by, created_at, updated_at, work_line_id, objective_id)
      values
        (gen_random_uuid(), v_org, 'Dial in new Brazil single-origin', bu_roast, 'In Progress',
           p_rama, p_dewi, array[p_cahya, p_sari], '{}',
           'Pull shots across 3 ratios, log TDS + tasting notes, lock the recipe card before the Saturday wholesale tasting.',
           current_date - 4, now() - interval '2 days', p_dewi, now(), now(), wl_ig, obj_ops),
        (gen_random_uuid(), v_org, 'Update espresso recipe cards', bu_cafe, 'In Progress',
           p_cahya, p_rama, '{}', '{}', 'Refresh dose/yield/time on the bar cards for the new season blend.',
           current_date + 2, now() - interval '5 hours', p_dewi, now(), now(), wl_ig, obj_ops),
        (gen_random_uuid(), v_org, 'Photograph new pastry line', bu_kitchen, 'In Progress',
           p_krishna, p_cahya, array[p_cahya], '{}', 'Studio shots for the menu + socials.',
           current_date + 8, now() - interval '1 day', p_dewi, now(), now(), wl_menu, obj_q3),
        (gen_random_uuid(), v_org, 'Q3 wholesale price list', bu_sales, 'In Progress',
           p_sari, p_cahya, '{}', '{}', 'Rebuild the wholesale sheet with the new green-bean costs.',
           current_date + 14, now() - interval '3 days', p_dewi, now(), now(), wl_brand, obj_q3),
        (gen_random_uuid(), v_org, 'Replace grinder burrs (Cafe 2)', bu_cafe, 'Blocked',
           p_cahya, p_dewi, '{}', '{}', 'Waiting on the Mazzer parts order to clear customs.',
           current_date - 7, now() - interval '6 days', p_dewi, now(), now(), wl_ig, null),
        (gen_random_uuid(), v_org, 'Source compostable cups vendor', bu_fin, 'Blocked',
           p_fitri, p_krishna, array[p_cahya], '{}', 'Two quotes in; blocked on the sustainability cert check.',
           current_date - 5, now() - interval '4 days', p_dewi, now(), now(), null, null),
        (gen_random_uuid(), v_org, 'Plan barista latte-art workshop', bu_cafe, 'Open',
           p_cahya, p_dewi, '{}', '{}', 'Half-day internal workshop for the bar team.',
           current_date + 17, now() - interval '1 day', p_dewi, now(), now(), null, obj_ops),
        (gen_random_uuid(), v_org, 'Roastery extractor PM schedule', bu_roast, 'Open',
           p_rama, p_fitri, '{}', '{}', 'Stand up a preventive-maintenance calendar for the extractor.',
           current_date + 22, now() - interval '2 days', p_dewi, now(), now(), null, null),
        (gen_random_uuid(), v_org, 'Draft Q3 OKRs for cafe team', bu_cafe, 'Open',
           p_dewi, p_dewi, array[p_cahya, p_sari, p_krishna], '{}', 'First pass at the cafe-team objectives for Q3.',
           current_date + 25, now() - interval '7 hours', p_dewi, now(), now(), null, null),
        (gen_random_uuid(), v_org, 'Refit cold brew taps', bu_kitchen, 'Done',
           p_krishna, p_fitri, '{}', '{}', 'Swapped the cold-brew tap hardware on both lines.',
           current_date - 10, now() - interval '9 days', p_dewi, now(), now(), null, null),
        (gen_random_uuid(), v_org, 'Migrate POS to v4', bu_sales, 'Done',
           p_sari, p_cahya, '{}', '{}', 'Cutover to the v4 POS completed across all outlets.',
           current_date - 14, now() - interval '12 days', p_dewi, now(), now(), null, null);

      raise notice 'global-teardown: restored 11 realistic demo tasks';
    end $$;
  `)
  console.log('[global-teardown] restored realistic Gordi demo tasks')
}
