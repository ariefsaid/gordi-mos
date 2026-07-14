import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

const PLAN_BUDGET_ENABLED = process.env.VITE_SHOW_PLAN_BUDGET === 'true'

const redirectCases = [
  { oldPath: 'tasks', finalPath: /\/work\/tasks$/, needsAdmin: false },
  { oldPath: `tasks/${TASKS.VIEWER_ACCOUNTABLE.id}`, finalPath: new RegExp(`/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}$`), needsAdmin: false },
  { oldPath: 'work/cascade', finalPath: /\/work\/tasks$/, needsAdmin: false },
  { oldPath: 'work/follow-ups', finalPath: /\/work\/tasks\?view=followups$/, needsAdmin: false },
  { oldPath: 'objectives', finalPath: /\/work\/objectives$/, needsAdmin: true },
  { oldPath: 'projects-processes', finalPath: /\/work\/projects$/, needsAdmin: true },
  { oldPath: 'work/projects-processes', finalPath: /\/work\/projects$/, needsAdmin: true },
  { oldPath: 'updates', finalPath: /\/work\/signals$/, needsAdmin: false },
  { oldPath: 'ops', finalPath: /\/$|\/mos\/?$/, needsAdmin: false },
  { oldPath: 'ops/new', finalPath: /\/$|\/mos\/?$/, needsAdmin: false },
  { oldPath: 'ops/legacy/edit', finalPath: /\/$|\/mos\/?$/, needsAdmin: false },
  { oldPath: 'kitchen/log', finalPath: /\/cafe\/log$/, needsAdmin: false },
  { oldPath: 'kitchen/plan', finalPath: /\/cafe\/plan$/, needsAdmin: false },
  { oldPath: 'kitchen/stock', finalPath: /\/cafe\/stock$/, needsAdmin: false },
  { oldPath: 'kitchen/review', finalPath: /\/cafe\/review$/, needsAdmin: true },
  { oldPath: 'kitchen/pushes', finalPath: /\/cafe\/pushes$/, needsAdmin: true },
  { oldPath: 'dashboard', finalPath: /\/money$/, needsAdmin: true },
  { oldPath: 'dashboard/detail', finalPath: /\/money\/detail$/, needsAdmin: true },
  { oldPath: 'sales', finalPath: /\/money$/, needsAdmin: true },
  { oldPath: 'plan/budget', finalPath: /\/money\/budget$/, needsAdmin: true, flag: 'plan-budget' },
  { oldPath: 'plan/pricing', finalPath: /\/money\/pricing$/, needsAdmin: true, flag: 'plan-budget' },
] as const

async function expectBackDoesNotReenterOld(page: import('@playwright/test').Page, oldPath: string) {
  await page.goBack()
  await page.waitForTimeout(250)
  expect(page.url()).not.toContain(`/mos/${oldPath}`)
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, ADMIN.email, ADMIN.password)
})

test('AC-001: old shell routes redirect to their new canonical URL and Back never re-enters the retired URL', async ({ page }) => {
  test.setTimeout(120_000)
  for (const routeCase of redirectCases) {
    if (routeCase.flag === 'plan-budget' && !PLAN_BUDGET_ENABLED) continue

    await page.goto('')
    await expect(page).toHaveURL(/\/$|\/mos\/?$/)

    await page.goto(routeCase.oldPath, { waitUntil: 'commit', timeout: 10_000 })
    await page.waitForTimeout(1_000)
    await expect(page).toHaveURL(routeCase.finalPath, { timeout: 10_000 })
    await expectBackDoesNotReenterOld(page, routeCase.oldPath)
  }
})

test('AC-003: /work/follow-ups redirects to /work/tasks?view=followups and the saved view survives refresh', async ({ page }) => {
  await page.goto('work/follow-ups')
  await expect(page).toHaveURL(/\/work\/tasks\?view=followups$/)
  await page.reload()
  await expect(page).toHaveURL(/\/work\/tasks\?view=followups$/)
  await expect(page.getByTestId('page-head').getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()
})

test('AC-004: /tasks/:taskId redirects to /work/tasks/:taskId and renders the task surface', async ({ page }) => {
  await page.goto(`tasks/${TASKS.VIEWER_ACCOUNTABLE.id}`)
  await expect(page).toHaveURL(new RegExp(`/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}$`))
  await expect(page.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible()
})

test('AC-005: /kitchen/* redirects to /cafe/* and renders the re-homed kitchen surfaces', async ({ page }) => {
  const cases = [
    { oldPath: 'kitchen/log', finalPath: /\/cafe\/log$/, surface: page.getByRole('table', { name: /kitchen production log/i }) },
    { oldPath: 'kitchen/plan', finalPath: /\/cafe\/plan$/, surface: page.getByRole('heading', { name: /kitchen · (plan|pesanan)/i }) },
    { oldPath: 'kitchen/stock', finalPath: /\/cafe\/stock$/, surface: page.getByRole('heading', { name: /kitchen · stock/i }) },
    { oldPath: 'kitchen/review', finalPath: /\/cafe\/review$/, surface: page.getByRole('heading', { name: /kitchen · review/i }) },
    { oldPath: 'kitchen/pushes', finalPath: /\/cafe\/pushes$/, surface: page.getByRole('heading', { name: /kitchen · pushes/i }) },
  ]

  for (const routeCase of cases) {
    await page.goto(routeCase.oldPath)
    await expect(page).toHaveURL(routeCase.finalPath)
    await expect(routeCase.surface).toBeVisible({ timeout: 15_000 })
  }
})

test('AC-025: /work/signals, /cafe, and /work/tasks?view=overdue resolve and are not 404s', async ({ page }) => {
  await page.goto('work/signals')
  await expect(page).toHaveURL(/\/work\/signals$/)
  await expect(page.getByRole('heading', { name: 'Signals' })).toBeVisible()
  await expect(page.getByText(/not in this slice/i)).toBeVisible()

  await page.goto('cafe')
  await expect(page).toHaveURL(/\/cafe\/log$/)
  await expect(page.getByRole('table', { name: /kitchen production log/i })).toBeVisible({ timeout: 15_000 })

  await page.goto('work/tasks?view=overdue')
  await expect(page).toHaveURL(/\/work\/tasks\?view=overdue$/)
  await expect(page.getByTestId('page-head').getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()
})
