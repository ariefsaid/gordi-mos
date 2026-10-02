import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'
import { AC204, TASKS } from './fixtures/tasks'
import { isShipGated } from './helpers/ship-gate'
import { taskViewsGroup } from './helpers/tasks'
import { e2eAppPath } from './helpers/app-path'

// notFound.title (i18n/messages.ts): the not-found page's ONE heading now carries the message
// itself ("Page not found" retired — see src/pages/not-found-page.tsx's docblock).
const NOT_FOUND_HEADING = /^That page isn.t here$/

const PLAN_BUDGET_ENABLED = process.env.VITE_SHOW_PLAN_BUDGET === 'true'

const redirectCases = [
  { oldPath: 'tasks', finalPath: /\/work\/tasks$/, needsAdmin: false },
  { oldPath: `tasks/${TASKS.VIEWER_ACCOUNTABLE.id}`, finalPath: new RegExp(`/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}$`), needsAdmin: false },
  { oldPath: 'work/cascade', finalPath: /\/work\/tasks$/, needsAdmin: false },
  // OD-V4-1 / use-record-collection.ts: any urlMode:'synced' collection (Objectives,
  // Projects/Processes, Signals) always mirrors its live presentation into the URL as
  // `?layout=<presentation>` — "collection query state belongs in the URL where it must survive
  // refresh/share" (DESIGN.md "Navigation, canonical URLs, and overlay grammar"). Tasks is the one
  // exception (serializeTaskQuery omits `layout` when it's the neutral 'table'), which is why its
  // redirects above stay bare. The canonical one-hop landing for these three is WITH the param.
  { oldPath: 'objectives', finalPath: /\/work\/objectives\?layout=list$/, needsAdmin: true, replacement: '/work/objectives' },
  { oldPath: 'projects-processes', finalPath: /\/work\/projects\?layout=list$/, needsAdmin: true, replacement: '/work/projects' },
  { oldPath: 'work/projects-processes', finalPath: /\/work\/projects\?layout=list$/, needsAdmin: true, replacement: '/work/projects' },
  { oldPath: 'updates', finalPath: /\/work\/signals\?layout=feed$/, needsAdmin: false },
  // #1239: the dedicated production route is the canonical capture surface; retired kitchen log
  // paths land there directly. The remaining legacy kitchen screens keep their 1:1 route under /cafe.
  { oldPath: 'kitchen', finalPath: /\/cafe\/production$/, needsAdmin: false },
  { oldPath: 'kitchen/log', finalPath: /\/cafe\/production$/, needsAdmin: false },
  // Café Opening is hidden (CAFE_OPENING_ENABLED): its own path lands on the root.
  { oldPath: 'cafe/opening', finalPath: /\/cafe$/, needsAdmin: false },
  { oldPath: 'kitchen/plan', finalPath: /\/cafe\/plan$/, needsAdmin: false },
  { oldPath: 'kitchen/stock', finalPath: /\/cafe\/stock$/, needsAdmin: false },
  { oldPath: 'kitchen/review', finalPath: /\/cafe\/review$/, needsAdmin: true },
  { oldPath: 'kitchen/pushes', finalPath: /\/cafe\/pushes$/, needsAdmin: true },
  { oldPath: 'dashboard', finalPath: /\/money$/, needsAdmin: true, replacement: '/money' },
  { oldPath: 'dashboard/detail', finalPath: /\/money\/detail$/, needsAdmin: true, replacement: '/money/detail' },
  { oldPath: 'sales', finalPath: /\/money$/, needsAdmin: true, replacement: '/money' },
  { oldPath: 'plan/budget', finalPath: /\/money\/budget$/, needsAdmin: true, flag: 'plan-budget', replacement: '/money/budget' },
  { oldPath: 'plan/pricing', finalPath: /\/money\/pricing$/, needsAdmin: true, flag: 'plan-budget', replacement: '/money/pricing' },
] as const

async function expectBackDoesNotReenterOld(page: import('@playwright/test').Page, oldPath: string) {
  await page.goBack()
  await page.waitForTimeout(250)
  expect(new URL(page.url()).pathname).not.toBe(e2eAppPath(`/${oldPath}`))
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, ADMIN.email, ADMIN.password)
})

test('AC-001: old shell routes redirect to their new canonical URL and Back never re-enters the retired URL', async ({ page }) => {
  test.setTimeout(120_000)
  for (const routeCase of redirectCases) {
    if ('flag' in routeCase && routeCase.flag === 'plan-budget' && !PLAN_BUDGET_ENABLED) continue
    // issue 444 — a retired path whose canonical replacement is ship-gated no longer forwards to
    // that replacement: doing so would hand the viewer a second hop onto a route that forwards
    // them home. What this walk asserts is the MAP (retired spelling -> canonical replacement),
    // and that mapping is precisely what is suspended while the destination is hidden; the
    // forward-home behaviour is held instead by `src/shell/ship-gate.test.tsx`. `replacement` is
    // declared on the row itself rather than parsed out of `finalPath`, so the row states its own
    // destination and the skip cannot silently mis-read a regex. Un-gate the destination and the
    // row walks again with no edit here.
    if ('replacement' in routeCase && isShipGated(routeCase.replacement)) continue

    await page.goto('')
    await expect(page).toHaveURL(new URL(e2eAppPath('/'), page.url()).href)

    await page.goto(routeCase.oldPath, { waitUntil: 'commit', timeout: 10_000 })
    await page.waitForTimeout(1_000)
    await expect(page).toHaveURL(routeCase.finalPath, { timeout: 10_000 })
    if ('surface' in routeCase) {
      await expect(page.getByTestId('page-head').getByRole('heading', { name: String(routeCase.surface) })).toBeVisible({ timeout: 10_000 })
    }
    await expectBackDoesNotReenterOld(page, routeCase.oldPath)
  }
})

test('AC-003 (DD-WAY-60): retired Daily Log URLs render in-shell not-found without redirect', async ({ page }) => {
  for (const path of ['ops', 'ops/new', 'ops/retired-id/edit']) {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`/${path.replaceAll('/', '\\/')}$`))
    await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
  }
})

test('AC-004 (DD-WAY-36): /work/follow-ups renders not-found in one hop — no redirect', async ({ page }) => {
  await page.goto('work/follow-ups')
  // No redirect: the URL the viewer asked for is the URL they keep.
  await expect(page).toHaveURL(/\/work\/follow-ups$/)
  // AC-021: not-found renders INSIDE the shell — the real cross-stack proof of the guard's
  // fall-through assertion (unit layer owns the invariant; this owns the journey).
  await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
})

test('AC-004: /tasks/:taskId redirects to /work/tasks/:taskId and renders the task surface', async ({ page }) => {
  await page.goto(`tasks/${TASKS.VIEWER_ACCOUNTABLE.id}`)
  await expect(page).toHaveURL(new RegExp(`/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}$`))
  await expect(taskViewsGroup(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: TASKS.VIEWER_ACCOUNTABLE.title, exact: true })).toBeVisible()
})

test('AC-005: /kitchen/* redirects to /cafe/* and renders the re-homed kitchen surfaces', async ({ page }) => {
  const cases = [
    // #1239: the retired path lands on the dedicated production capture surface. Read the
    // page-head heading every state renders, not a table that only some states do.
    { oldPath: 'kitchen/log', finalPath: /\/cafe\/production$/, surface: page.getByTestId('page-head').getByRole('heading', { name: /^café/i }) },
    { oldPath: 'kitchen/plan', finalPath: /\/cafe\/plan$/, surface: page.getByRole('heading', { name: /café · (plan|pesanan)/i }) },
    { oldPath: 'kitchen/stock', finalPath: /\/cafe\/stock$/, surface: page.getByRole('heading', { name: /café · stock/i }) },
    { oldPath: 'kitchen/review', finalPath: /\/cafe\/review$/, surface: page.getByRole('heading', { name: /café · review/i }) },
    { oldPath: 'kitchen/pushes', finalPath: /\/cafe\/pushes$/, surface: page.getByRole('heading', { name: /café · pushes/i }) },
  ]

  for (const routeCase of cases) {
    await page.goto(routeCase.oldPath)
    await expect(page).toHaveURL(routeCase.finalPath)
    await expect(routeCase.surface).toBeVisible({ timeout: 15_000 })
  }
})

test('legacy /mos and /kitchen addresses redirect to the base-aware Café routes and retain queries', async ({ page }) => {
  const cases = [
    { oldPath: '/mos?return=home', path: '/', search: '?return=home' },
    { oldPath: '/mos/work/follow-ups?origin=old-mos', path: '/work/follow-ups', search: '?origin=old-mos' },
    { oldPath: '/mos/kitchen/plan?week=this-week', path: '/cafe/plan', search: '?week=this-week' },
    { oldPath: '/mos/cafe/log?date=today', path: '/cafe/production', search: '?date=today' },
    { oldPath: 'cafe/log?date=today', path: '/cafe/production', search: '?date=today' },
    { oldPath: '/kitchen/pushes?status=failed', path: '/cafe/pushes', search: '?status=failed' },
  ]
  for (const route of cases) {
    await page.goto(route.oldPath, { waitUntil: 'commit' })
    await expect(page).toHaveURL(new URL(`${e2eAppPath(route.path)}${route.search}`, page.url()).href)
  }
})

test('AC-025: /work/signals, /cafe, and /work/tasks?view=overdue resolve and are not 404s', async ({ page }) => {
  // Step 4 (C3): /work/signals is the real archive/search page now (SliceStubPage retired here).
  // Canonical URL carries `?layout=feed` (see the redirectCases comment above) — asserting the
  // bare path here would be racing the mount-time canonicalization effect that appends it.
  await page.goto('work/signals')
  await expect(page).toHaveURL(/\/work\/signals\?layout=feed$/)
  // Scoped to the page head: with zero Signals seeded for this org, the collection also renders
  // an empty-state heading ("No Signals match \"\""), whose accessible name CONTAINS "Signals" —
  // an unscoped getByRole('heading', {name:'Signals'}) is a substring match against both and hits
  // a strict-mode violation. page-head is the same disambiguation this file already uses below.
  await expect(page.getByTestId('page-head').getByRole('heading', { name: 'Signals' })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: /search signals/i })).toBeVisible()

  // /cafe remains the Café Today entry; production and transfer have dedicated routes.
  await page.goto('cafe')
  await expect(page).toHaveURL(/\/cafe$/)
  await expect(page.getByTestId('page-head').getByRole('heading', { name: /^café/i })).toBeVisible({ timeout: 15_000 })

  await page.goto('work/tasks?view=overdue')
  await expect(page).toHaveURL(/\/work\/tasks\?view=overdue$/)
  await expect(page.getByTestId('page-head').getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(taskViewsGroup(page)).toBeVisible()
})


test('R7: canonical Objective and Project IDs survive direct load and reload; unknown IDs remain unavailable', async ({ page }, testInfo) => {
  for (const record of [
    { path: `work/objectives/${AC204.objective.id}`, title: AC204.objective.name },
    { path: `work/projects/${AC204.launch.id}`, title: AC204.launch.name },
  ]) {
    await page.goto(record.path)
    await expect(page.getByRole('heading', { name: record.title, exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: record.title, exact: true })).toBeVisible()
  }
  await page.screenshot({ path: testInfo.outputPath('canonical-project.png'), fullPage: true })
  for (const collection of ['projects', 'objectives', 'signals']) {
    const path = `work/${collection}/00000000-0000-0000-0000-000000000000`
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    if (collection === 'signals') {
      // A Signal the viewer cannot read (retracted, deleted or withheld) is one answer, with one way back.
      await expect(page.getByRole('heading', { name: 'Signal is outside your access', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
    } else {
      await expect(page.getByRole('heading', { name: 'This record is no longer available.', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: /^Back to/ })).toBeVisible()
    }
  }
})
