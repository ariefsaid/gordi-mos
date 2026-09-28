import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { processRunCleanupSql, processRunPendingCleanupSql, taskCleanupSql } from './fixtures/cleanup'
import { loginAs } from './helpers/login'
import type { Page } from '@playwright/test'

async function signOutViaUi(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).and(page.locator('[aria-haspopup="menu"]')).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()
}

const ORG_ID = '10000000-0000-0000-0000-000000000001'
const CAFE_OPENING_TASK_DEF_ID = 'e3000000-0000-0000-0000-000000000013'
const RESERVED_PENDING_ID = 'e9000000-0000-0000-0000-000000000003'
const HOME_TASK_IDS = [
  'e9000000-0000-0000-0000-000000000001',
  'e9000000-0000-0000-0000-000000000002',
] as const
const ALLOW_SHARED_HOME_CAFE_FIXTURE = process.env.MOS_E2E_ALLOW_SHARED_HOME_CAFE_FIXTURE === '1'

interface IdRow { id: string }
interface PendingSnapshot {
  id: string
  resolved_by: string | null
  materialized_task_id: string | null
}
interface ExistingOpening {
  runId: string
  unresolvedPending: PendingSnapshot | null
}

interface CafeRollup {
  done: number
  total: number
  overdue: number
  pending: number
}

interface HomeProgress {
  done: number
  total: number
}

const TODAY_CAFE_OPENING_RUN_SQL = `
  select r.id::text as id
  from mos.process_runs r
  join mos.work_lines wl on wl.id = r.work_line_id
  join shared.teams t on t.id = r.owning_team_id
  join shared.branches b on b.id = t.branch_id
  where r.org_id = '${ORG_ID}'
    and wl.code = 'cafe_opening'
    and b.code = 'gordi_hq'
    and r.period_key = to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD')
  order by r.id
`

function uuidLiteral(value: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`Unexpected UUID from fixture SQL: ${value}`)
  return `'${value}'`
}

function nullableUuidLiteral(value: string | null): string {
  return value === null ? 'null' : uuidLiteral(value)
}

function parseCafeRollup(text: string): CafeRollup {
  const match = /^(\d+)\/(\d+) done · (\d+) overdue · (\d+) (?:to assign|unassigned)$/.exec(text)
  if (!match) throw new Error(`Unexpected Café roll-up: ${text}`)
  return {
    done: Number(match[1]),
    total: Number(match[2]),
    overdue: Number(match[3]),
    pending: Number(match[4]),
  }
}

function parseHomeProgress(text: string): HomeProgress {
  const match = /^Opening checklist (\d+)\/(\d+)$/.exec(text)
  if (!match) throw new Error(`Unexpected Home opening progress: ${text}`)
  return { done: Number(match[1]), total: Number(match[2]) }
}

let existingOpening: ExistingOpening | null = null
let insertedPendingId: string | null = null
let fixtureReady = false
let homeTaskIdsToDelete: string[] = []
let createdRunId: string | null = null
let selectedPendingId: string | null = null
let materializedTaskIdToDelete: string | null = null

if (!ALLOW_SHARED_HOME_CAFE_FIXTURE) {
  test('home-café parity is disabled until its process fixture is isolated', () => { test.skip() })
} else {
test.beforeAll(async () => {
  // Read the current local state first. A pre-existing run is a user fixture and must survive this
  // spec; it is never folded into a broad delete/recreate cleanup.
  const runRows = await localSqlRead<IdRow>(TODAY_CAFE_OPENING_RUN_SQL)
  if (runRows.length > 1) throw new Error('Expected at most one current-day Gordi HQ Café Opening run')
  const [runRow] = runRows
  if (runRow) {
    const runId = runRow.id
    const pendingRows = await localSqlRead<PendingSnapshot>(`
      select id::text as id, resolved_by::text as resolved_by,
             materialized_task_id::text as materialized_task_id
      from mos.process_run_pending_tasks
      where process_run_id = ${uuidLiteral(runId)} and resolved_at is null
      order by created_at, id
    `)
    existingOpening = {
      runId,
      unresolvedPending: pendingRows[0] ?? null,
    }
  }

  const existingHomeTasks = await localSqlRead<IdRow>(`
    select id::text as id
    from mos.tasks
    where org_id = '${ORG_ID}'
      and id in (${HOME_TASK_IDS.map(id => `'${id}'`).join(', ')})
  `)
  const existingHomeTaskIds = new Set(existingHomeTasks.map(row => row.id))
  homeTaskIdsToDelete = HOME_TASK_IDS.filter(id => !existingHomeTaskIds.has(id))

  // Mark the fixture as restorable before the optional scoped mutation below. If seed/setup fails,
  // afterAll still restores the pre-existing pending row and removes only rows this test owns.
  fixtureReady = true

  // If an existing run has no unresolved queue item, add one reserved fixture row so the test can
  // exercise the real resolve_pending_task path without editing a pre-existing Task. It is removed
  // in afterAll; the run itself and every baseline row remain untouched.
  if (existingOpening && !existingOpening.unresolvedPending) {
    const [reservedRow] = await localSqlRead<IdRow>(`
      select id::text as id
      from mos.process_run_pending_tasks
      where id = ${uuidLiteral(RESERVED_PENDING_ID)}
    `)
    if (reservedRow) throw new Error(`Reserved Café Opening pending fixture already exists: ${RESERVED_PENDING_ID}`)
    await localSql(`
      insert into mos.process_run_pending_tasks
        (id, org_id, process_run_id, task_def_id, candidate_person_ids, reason)
      select ${uuidLiteral(RESERVED_PENDING_ID)}, '${ORG_ID}', ${uuidLiteral(existingOpening.runId)}, '${CAFE_OPENING_TASK_DEF_ID}',
             array_agg(p.id order by p.email), 'multiple'
      from shared.people p
      where p.org_id = '${ORG_ID}'
        and p.email in ('cahya.dev@example.test', 'krishna.dev@example.test');
    `)
    insertedPendingId = RESERVED_PENDING_ID
    const [row] = await localSqlRead<IdRow>(`
      select id::text as id
      from mos.process_run_pending_tasks
      where id = ${uuidLiteral(RESERVED_PENDING_ID)}
        and process_run_id = ${uuidLiteral(existingOpening.runId)}
        and resolved_at is null
    `)
    if (!row) throw new Error('Could not create the isolated pending Café Opening fixture row')
  }

  const seed = readFileSync(new URL('../../supabase/seed.dev-home-work.sql', import.meta.url), 'utf8')
  await localSql(seed.slice(seed.indexOf('insert into mos.tasks')))
})

test.afterAll(async () => {
  if (!fixtureReady) return

  if (existingOpening) {
    // If the browser failed immediately after the resolve click, recover the one Task identity
    // from the exact pending row we selected. Never widen this to a process-wide non-baseline
    // delete: another worker or a user may legitimately add a Task to the same run.
    if (selectedPendingId && !materializedTaskIdToDelete) {
      const [materializedRow] = await localSqlRead<IdRow>(`
        select materialized_task_id::text as id
        from mos.process_run_pending_tasks
        where id = ${uuidLiteral(selectedPendingId)}
      `)
      const originalMaterializedTaskId = existingOpening.unresolvedPending?.materialized_task_id ?? null
      if (materializedRow?.id && materializedRow.id !== originalMaterializedTaskId) {
        materializedTaskIdToDelete = materializedRow.id
      }
    }
    const restoreBaselinePending = existingOpening.unresolvedPending
      ? `update mos.process_run_pending_tasks
           set resolved_at = null,
               resolved_by = ${nullableUuidLiteral(existingOpening.unresolvedPending.resolved_by)},
               materialized_task_id = ${nullableUuidLiteral(existingOpening.unresolvedPending.materialized_task_id)}
         where id = ${uuidLiteral(existingOpening.unresolvedPending.id)};`
      : ''
   const restoreInsertedPending = insertedPendingId
     ? `update mos.process_run_pending_tasks
           set resolved_at = null, resolved_by = null, materialized_task_id = null
         where id = ${uuidLiteral(insertedPendingId)};
        ${processRunPendingCleanupSql([insertedPendingId], ORG_ID)}`
     : ''
    const deleteMaterializedTask = materializedTaskIdToDelete
     ? taskCleanupSql([materializedTaskIdToDelete], ORG_ID)
      : ''
    await localSql(`
      ${restoreBaselinePending}
      ${restoreInsertedPending}
      ${deleteMaterializedTask}
    `)
  } else {
    const runId = createdRunId
    if (runId) {
      await localSql(processRunCleanupSql([runId], ORG_ID))
    }
  }

  if (homeTaskIdsToDelete.length > 0) {
    await localSql(taskCleanupSql(homeTaskIdsToDelete, ORG_ID))
  }
})

test('Barista Home follows the canonical Café Opening run through completion', async ({ page }) => {
  test.setTimeout(120_000)

  await loginAs(page, 'krishna.dev@example.test', DEMO_PASSWORD)
  await page.goto('cafe')
  await expect(page).toHaveURL(/\/cafe$/)

  if (!existingOpening) {
    const spawnResponse = page.waitForResponse((response) => /\/rpc\/spawn_process_run/.test(response.url()) && response.ok())
    await page.getByRole('button', { name: "Start today's opening", exact: true }).click()
   const spawned = await (await spawnResponse).json() as { run_id: string; idempotent: boolean }
   expect(spawned.idempotent, 'Home Café must own a newly-created run, not an idempotent existing run').toBe(false)
   expect(spawned.run_id).toMatch(/^[0-9a-f-]{36}$/i)
   createdRunId = spawned.run_id
  }

  const cafePanel = page.locator('.cafe-opening-panel--started')
  await expect(cafePanel).toBeVisible({ timeout: 15_000 })
  const initialCafeRollup = cafePanel.getByText(/^\d+\/\d+ done · \d+ overdue · \d+ (?:to assign|unassigned)$/)
  await expect(initialCafeRollup).toBeVisible()
  const initialCafe = parseCafeRollup(await initialCafeRollup.innerText())
  expect(initialCafe.pending).toBeGreaterThan(0)

  const occurrenceHref = await cafePanel
    .getByRole('link', { name: /view opening tasks/i })
    .getAttribute('href')
  expect(occurrenceHref).toBeTruthy()
  const occurrenceId = occurrenceHref
    ? new URL(occurrenceHref, page.url()).searchParams.get('occurrence')
    : null
  expect(occurrenceId).toBeTruthy()
  if (!occurrenceId) throw new Error('Café Opening link did not contain an occurrence id')
  if (!existingOpening) expect(occurrenceId).toBe(createdRunId)

  await signOutViaUi(page, 'Krishna Kitchen')
  await page.waitForURL(url => url.pathname.endsWith('/login'))
  await loginAs(page, 'bulan.dev@example.test', DEMO_PASSWORD)
  await page.goto('./')
  const homeDoor = page.getByTestId('home-cafe-door')
  await expect(homeDoor).toBeVisible({ timeout: 15_000 })
  const initialHomeChecklist = homeDoor.getByText(/^Opening checklist \d+\/\d+$/)
  await expect(initialHomeChecklist).toBeVisible()
  const initialHome = parseHomeProgress(await initialHomeChecklist.innerText())
  expect(initialHome.done).toBe(initialCafe.done)
  expect(initialHome.total).toBe(initialCafe.total)

  // Existing runs are never allowed to mutate one of their baseline Tasks. Resolve the pending
  // queue item into a new real Task instead, then restore that queue row and delete only the new
  // materialized Task in afterAll. Fresh runs keep one pending item visible while completing the
  // single-holder "Open the café floor" Task.
  let taskTitle = 'Open the café floor'
  if (existingOpening) {
    selectedPendingId = existingOpening.unresolvedPending?.id ?? insertedPendingId
    if (!selectedPendingId) throw new Error('Existing Café Opening has no isolated pending item to resolve')
    await homeDoor.locator('a.home-cafe-door-link').click()
    await expect(page.locator('.cafe-opening-panel--started')).toBeVisible({ timeout: 15_000 })

    // Pending resolution is Team-authorized. Krishna is the seeded Gordi HQ Kitchen member who
    // can resolve the existing run's queue item; the selected PIC remains Cahya for the Task path.
    await signOutViaUi(page, 'Bulan Barista')
    await page.waitForURL(url => url.pathname.endsWith('/login'))
    await loginAs(page, 'krishna.dev@example.test', DEMO_PASSWORD)
    await page.goto('cafe')
    await expect(page.locator('.cafe-opening-panel--started')).toBeVisible({ timeout: 15_000 })
    const assignCahya = page.getByRole('button', { name: 'Cahya Cafe', exact: true })
    await expect(assignCahya).toBeVisible({ timeout: 10_000 })
    await assignCahya.click()
    const [materializedRow] = await localSqlRead<IdRow>(`
      select materialized_task_id::text as id
      from mos.process_run_pending_tasks
      where id = ${uuidLiteral(selectedPendingId)}
    `)
    const originalMaterializedTaskId = existingOpening.unresolvedPending?.materialized_task_id ?? null
    if (materializedRow?.id && materializedRow.id !== originalMaterializedTaskId) {
      materializedTaskIdToDelete = materializedRow.id
    }
    taskTitle = 'Brew station handover'
    await signOutViaUi(page, 'Krishna Kitchen')
    await page.waitForURL(url => url.pathname.endsWith('/login'))
  } else {
    await signOutViaUi(page, 'Bulan Barista')
    await page.waitForURL(url => url.pathname.endsWith('/login'))
  }

  await loginAs(page, 'cahya.dev@example.test', DEMO_PASSWORD)
  await page.goto(`work/tasks?occurrence=${encodeURIComponent(occurrenceId)}`)
  await expect(page.getByText(taskTitle, { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByText(taskTitle, { exact: true }).first().click()
  const taskRecord = page.getByRole('region', { name: taskTitle, exact: true })
  await expect(taskRecord).toBeVisible({ timeout: 15_000 })
  await taskRecord.getByRole('button', { name: 'Mark complete', exact: true }).click()
  await expect(taskRecord.getByRole('button', { name: 'Edit Status', exact: true })).toContainText('Done')

  await signOutViaUi(page, 'Cahya Cafe')
    await page.waitForURL(url => url.pathname.endsWith('/login'))
  await loginAs(page, 'bulan.dev@example.test', DEMO_PASSWORD)
  await page.goto('./')
  const completedHomeDoor = page.getByTestId('home-cafe-door')
  await expect(completedHomeDoor).toBeVisible({ timeout: 15_000 })
  const completedHomeChecklist = completedHomeDoor.getByText(/^Opening checklist \d+\/\d+$/)
  await expect(completedHomeChecklist).toBeVisible()
  const completedHome = parseHomeProgress(await completedHomeChecklist.innerText())
  expect(completedHome.done).toBe(initialHome.done + 1)
  expect(completedHome.total).toBe(initialHome.total + (existingOpening ? 1 : 0))

  await completedHomeDoor.locator('a.home-cafe-door-link').click()
  const completedCafePanel = page.locator('.cafe-opening-panel--started')
  await expect(completedCafePanel).toBeVisible({ timeout: 15_000 })
  const completedCafeRollup = completedCafePanel.getByText(/^\d+\/\d+ done · \d+ overdue · \d+ (?:to assign|unassigned)$/)
  await expect(completedCafeRollup).toBeVisible()
  const completedCafe = parseCafeRollup(await completedCafeRollup.innerText())
  expect(completedCafe.done).toBe(initialCafe.done + 1)
  expect(completedCafe.total).toBe(initialCafe.total + (existingOpening ? 1 : 0))
  expect(completedCafe.pending).toBe(initialCafe.pending - (existingOpening ? 1 : 0))
})
}
