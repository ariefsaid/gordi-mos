// PROOF-03 / PROOF-08 / WORK-17 — one joined persona + fixture closure journey.
//
// This is deliberately bounded to seeded rows plus one occurrence created by this test. It does
// not reseed, infer authority from display labels, or clean by title/date. The only writes are the
// current Café Opening occurrence and its generated rows, all captured by run id and removed in
// finally. The read-only inventory is written beside the Playwright result for the closure report.

import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { loginAs } from './helpers/login'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { RECOVERY_VIEWER } from './fixtures/users'
import { assertFixtureSqlSafe, processRunCleanupSql } from './fixtures/cleanup'

const ORG = '10000000-0000-0000-0000-000000000001'
const WORK_LINE_ID = 'e3000000-0000-0000-0000-000000000001'
const SIGNAL_ID = 'd1000000-0000-0000-0000-000000000001'
const PROJECT_ID = '4e204000-0000-0000-0000-000000000010'
const OBJECTIVE_ID = '4e204000-0000-0000-0000-000000000001'
const CURRENT_DATE_SQL = "(now() at time zone 'Asia/Jakarta')::date"

type Evidence = Record<string, unknown>

async function inventory(): Promise<Evidence> {
  const [rows] = await localSqlRead<Evidence>(`
    select jsonb_build_object(
      'actors', (
        select jsonb_agg(jsonb_build_object(
          'person_id', p.id,
          'email', p.email,
          'access_roles', coalesce((select jsonb_agg(par.access_role order by par.access_role)
                                    from shared.person_access_roles par where par.person_id = p.id), '[]'::jsonb),
          'memberships', coalesce((select jsonb_agg(jsonb_build_object(
              'team_id', tm.team_id, 'team_code', t.code, 'business_unit_id', t.business_unit_id,
              'business_unit', bu.code, 'is_primary', tm.is_primary) order by tm.is_primary desc, t.code)
            from shared.team_memberships tm
            join shared.teams t on t.id = tm.team_id
            join shared.business_units bu on bu.id = t.business_unit_id
            where tm.person_id = p.id and tm.effective_to is null), '[]'::jsonb)
        ) order by p.id)
        from shared.people p
        where p.id in (
          '40000000-0000-0000-0000-000000000000',
          '40000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000002',
          '40000000-0000-0000-0000-000000000004',
          '40000000-0000-0000-0000-000000000005',
          '${RECOVERY_VIEWER.personId}'
        )
      ),
      'teams', (
        select jsonb_agg(jsonb_build_object(
          'id', t.id, 'code', t.code, 'name', t.name, 'business_unit_id', t.business_unit_id,
          'business_unit', bu.code, 'branch_id', t.branch_id, 'activity', t.activity
        ) order by t.code)
        from shared.teams t join shared.business_units bu on bu.id = t.business_unit_id
        where t.org_id = '${ORG}' and t.id in (
          select team_id from shared.team_memberships where person_id in (
            '40000000-0000-0000-0000-000000000002', '${RECOVERY_VIEWER.personId}'
          )
          union select owning_team_id from mos.process_runs where work_line_id = '${WORK_LINE_ID}'
          union select id from shared.teams where code in ('finance_team', 'b2b_sales_team')
        )
      ),
      'signals', (
        select jsonb_agg(to_jsonb(s) order by s.id)
        from (select id, author_id, owning_team_id, attention, category
              from mos.signals where id = '${SIGNAL_ID}') s
      ),
      'objectives', (
        select jsonb_agg(to_jsonb(o) order by o.id)
        from (select id, name, business_unit_id, accountable_person_id
              from mos.objectives where id in ('${OBJECTIVE_ID}', 'c0000000-0000-0000-0000-000000000010',
                                                'c0000000-0000-0000-0000-000000000011')) o
      ),
      'work_lines', (
        select jsonb_agg(to_jsonb(w) order by w.id)
        from (select id, name, type, code, objective_id
              from mos.work_lines where id in ('${WORK_LINE_ID}', '${PROJECT_ID}',
                                                '4e204000-0000-0000-0000-000000000011')) w
      ),
      'tasks', (
        select jsonb_agg(to_jsonb(t) order by t.id)
        from (select id, title, status, due_date, team_id, work_line_id, objective_id,
                     process_run_id, responsible_person_id, accountable_person_id
              from mos.tasks
              where id in ('4e204000-0000-0000-0000-000000000100',
                           '4e204000-0000-0000-0000-000000000101',
                           '4e204000-0000-0000-0000-000000000102',
                           '4e204000-0000-0000-0000-000000000103',
                           '4e204000-0000-0000-0000-000000000104')
                 or id in (select id from mos.tasks where process_run_id is not null)) t
      ),
      'occurrences', (
        select jsonb_agg(to_jsonb(r) order by r.scheduled_date)
        from (select id, work_line_id, owning_team_id, period_key, scheduled_date, status, started_by
              from mos.process_runs where work_line_id = '${WORK_LINE_ID}') r
      ),
      'pending', (
        select jsonb_agg(to_jsonb(p) order by p.id)
        from (select id, process_run_id, task_def_id, reason, resolved_at
              from mos.process_run_pending_tasks
              where process_run_id in (select id from mos.process_runs where work_line_id = '${WORK_LINE_ID}')) p
      ),
      'legacy_null_team_tasks', (
        select jsonb_agg(to_jsonb(t) order by t.id)
        from (select id, title, business_unit_id, process_run_id, team_id
              from mos.tasks where team_id is null) t
      )
    ) as evidence
  `)
  return rows.evidence as Evidence
}

test('joined persona and fixture evidence: graph, current/past occurrence, and denied viewer', async ({ page }, testInfo) => {
  test.setTimeout(120_000)

  const [team] = await localSqlRead<{ id: string; code: string; business_unit_id: string }>(
    `select id, code, business_unit_id from shared.teams where org_id='${ORG}' and code='gordi_hq_kitchen'`,
  )
  expect(team).toBeTruthy()

  const before = await inventory()
  const [currentBefore] = await localSqlRead<{ id: string }>(
    `select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${team.id}' and period_key=to_char(${CURRENT_DATE_SQL}, 'YYYY-MM-DD')`,
  )
  expect(currentBefore).toBeUndefined()

  let runId: string | undefined
  let generatedTaskIds: string[] = []
  const browserJourneys: Evidence[] = []

  try {
    // Explicit authority fact used by this journey: Krishna is the seeded member of the actual
    // owning Team. The browser proves the resulting real start → pending state.
    await loginAs(page, 'krishna.dev@example.test', DEMO_PASSWORD)
    await page.goto('cafe', { waitUntil: 'commit' })
    const start = page.getByRole('button', { name: "Start today's opening", exact: true })
    await expect(start).toBeVisible()
    const spawn = page.waitForResponse((response) => /\/rpc\/spawn_process_run/.test(response.url()) && response.ok())
    await start.click()
    const spawned = await (await spawn).json() as { run_id: string; idempotent: boolean }
    expect(spawned.idempotent).toBe(false)
    runId = spawned.run_id

    const [current] = await localSqlRead<{ id: string; owning_team_id: string; started_by: string }>(
      `select id, owning_team_id, started_by from mos.process_runs where id='${runId}'`,
    )
    expect(current).toMatchObject({ id: runId, owning_team_id: team.id, started_by: '40000000-0000-0000-0000-000000000002' })

    await expect(page.getByText(/Café Opening/).first()).toBeVisible()
    await expect(page.getByText(/to assign/).first()).toBeVisible()
    browserJourneys.push({ actor: 'Krishna', authority: 'member + active membership of actual owning Team', action: 'start current Café Opening', outcome: 'current occurrence rendered with pending assignment' })

    await page.getByRole('link', { name: /view opening tasks/i }).click()
    await expect(page).toHaveURL(/\/work\/tasks\?occurrence=/)
    await expect(page.getByText('Open the café floor', { exact: true })).toBeVisible()
    await expect(page.getByText("Log today's production", { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /to assign/i })).toBeVisible()
    browserJourneys.push({ actor: 'Krishna', record: 'Café Opening current occurrence', action: 'view generated task group', outcome: 'linked generated Tasks plus one unresolved pending step' })

    const [generated] = await localSqlRead<{ ids: string[] }>(
      `select to_jsonb(coalesce(array_agg(id order by id)::text[], '{}'::text[])) as ids from mos.tasks where process_run_id='${runId}'`,
    )
    generatedTaskIds = Array.isArray(generated?.ids) ? generated.ids : []

    // The same current Work record is opened by a dedicated ordinary member. This actor has no
    // Team membership and no access-role grant in the inventory; the UI must not expose the
    // owning-Team start/assignment control.
    await page.evaluate(() => localStorage.clear())
    await loginAs(page, RECOVERY_VIEWER.email, RECOVERY_VIEWER.password)
    await page.goto(`work/projects/${WORK_LINE_ID}`)
    await expect(page.getByRole('heading', { name: 'Café Opening', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Occurrences', exact: true }).click()
    await expect(page.getByText(new RegExp(runId.slice(0, 8))).first()).toHaveCount(0)
    await expect(page.getByRole('button', { name: /to assign/i })).toHaveCount(0)
    browserJourneys.push({ actor: 'Recovery Tester', authority: 'no Team membership; no access-role grant', record: runId, action: 'open same Process record', outcome: 'record frame visible but no current occurrence assignment control' })

    // OD-WAY-102 (docs/decisions.md, owner 2026-09-18): "A Signal's audience is All Teams; a
    // Team audience is a retired historical state." Every new Signal is audience='org',
    // owning_team_id null, "readable by every active same-org member" — confirmed against this
    // fixture directly (mos.signals: owning_team_id IS NULL, audience='org') and against the
    // live seed, which no longer holds any Team-scoped row to exercise the old denial with.
    // RECOVERY_VIEWER's Team-less/role-less authority no longer gates this read at all; the
    // journey this step now owns is that an org member reads an org-wide Signal, not a denial.
    // The org-BOUNDARY denial (a person outside the org entirely) is separate, unaffected
    // coverage — AC-430-post-a-signal.spec.ts's "unrelated org targets" case.
    await page.goto(`work/signals/${SIGNAL_ID}`)
    await expect(page.getByRole('button', { name: /more signal actions/i })).toBeVisible()
    browserJourneys.push({ actor: 'Recovery Tester', authority: 'org member, no Team membership — OD-WAY-102 org-wide audience', record: SIGNAL_ID, action: 'direct-load seeded Signal', outcome: 'Signal record rendered (org-audience read has no Team gate)' })

    // Finance and Sales are real seeded members of non-stream Teams. Their Home journeys are
    // read-only admission checks against the same organization, not role-label inference.
    await page.evaluate(() => localStorage.clear())
    await loginAs(page, 'sari.dev@example.test', DEMO_PASSWORD)
    await page.goto('cafe/log')
    await expect(page.getByRole('status').filter({ hasText: /read Café records/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Submit/i }).first()).toBeDisabled()
    browserJourneys.push({ actor: 'Sari Sales', authority: 'member of b2b_sales_team; no stream Team', action: 'open Café capture for seeded records', outcome: 'read-only; submit disabled' })

    await page.evaluate(() => localStorage.clear())
    await loginAs(page, 'fitri.dev@example.test', DEMO_PASSWORD)
    await page.goto('./')
    await expect(page.getByTestId('home-cafe-door')).toHaveCount(0)
    await expect(page.locator('main a[href*="/cafe"]')).toHaveCount(0)
    browserJourneys.push({ actor: 'Fitri Finance', authority: 'member + finance role; finance_team only', action: 'open Home', outcome: 'no Café door or production link' })

    const afterJourney = await inventory()
    writeFileSync(testInfo.outputPath('joined-inventory.json'), JSON.stringify({ before, current: { runId, teamId: team.id, generatedTaskIds }, afterJourney, browserJourneys }, null, 2))
  } finally {
    if (runId) {
      const cleanup = processRunCleanupSql([runId])
      assertFixtureSqlSafe(cleanup)
      await localSql(cleanup)
    }
  }

  const afterCleanup = await inventory()
  const [currentAfter] = await localSqlRead<{ id: string }>(
    `select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${team.id}' and period_key=to_char(${CURRENT_DATE_SQL}, 'YYYY-MM-DD')`,
  )
  const remainingGenerated = generatedTaskIds.length
    ? await localSqlRead<{ id: string }>(`select id from mos.tasks where id in (${generatedTaskIds.map((id) => `'${id}'`).join(',')})`)
    : []
  writeFileSync(testInfo.outputPath('cleanup-proof.json'), JSON.stringify({ runId, currentAfter: currentAfter ?? null, remainingGenerated, pastOccurrences: afterCleanup.occurrences }, null, 2))
  expect(currentAfter).toBeUndefined()
  expect(remainingGenerated).toEqual([])
  expect(afterCleanup.occurrences).toEqual(before.occurrences)
})
