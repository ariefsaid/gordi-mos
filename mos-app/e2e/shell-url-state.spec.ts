import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

async function createOverdueTask(page: Page, title: string) {
  await page.goto('work/tasks?view=mine')
  await page.getByRole('link', { name: /new task/i }).first().click()
  await expect(page).toHaveURL(/\/work\/tasks\/new\?view=mine$/)
  const form = page.getByRole('form', { name: /create task form/i })
  await form.getByLabel('Title').fill(title)
  await form.getByLabel('Due date').fill('2020-01-01')
  await form.getByRole('button', { name: /create task/i }).click()
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=mine$/, { timeout: 15_000 })
}

test('AC-306/307/308: tasks saved views survive open, refresh, close, new tab, cancel, and create', async ({ page, context }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)

  const overdueTitle = `URL overdue ${Date.now()}`
  const futureTitle = `URL future ${Date.now()}`
  const mineTitle = `URL mine ${Date.now()}`

  await page.goto(`work/tasks/new?view=mine&r=${VIEWER.personId}`)
  await expect(page).toHaveURL(new RegExp(`/work/tasks/new\\?view=mine&r=${VIEWER.personId}$`))
  const createForm = page.getByRole('form', { name: /create task form/i })
  await expect(createForm.getByLabel(/^pic$/i)).toHaveValue(VIEWER.personId)
  await createForm.getByRole('button', { name: /cancel/i }).click()
  await expect(page).toHaveURL(/\/work\/tasks\?view=mine$/)
  await expect(page.getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'true')

  await page.goto('work/tasks?view=mine')
  await page.getByRole('link', { name: /new task/i }).first().click()
  await expect(page).toHaveURL(/\/work\/tasks\/new\?view=mine$/)
  const mineForm = page.getByRole('form', { name: /create task form/i })
  await mineForm.getByLabel('Title').fill(mineTitle)
  await mineForm.getByRole('button', { name: /create task/i }).click()
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=mine$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: mineTitle })).toBeVisible()

  await createOverdueTask(page, overdueTitle)

  await page.goto('work/tasks?view=mine')
  await page.getByRole('link', { name: /new task/i }).first().click()
  const futureForm = page.getByRole('form', { name: /create task form/i })
  await futureForm.getByLabel('Title').fill(futureTitle)
  await futureForm.getByLabel('Due date').fill('2030-12-31')
  await futureForm.getByRole('button', { name: /create task/i }).click()
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=mine$/, { timeout: 15_000 })

  await page.goto('work/tasks?view=overdue')
  await expect(page).toHaveURL(/\/work\/tasks\?view=overdue$/)
  await expect(page.getByRole('button', { name: 'Overdue', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(overdueTitle)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(futureTitle)).not.toBeVisible()

  await page.locator('tr.task-row', { hasText: overdueTitle }).first().click()
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/, { timeout: 15_000 })
  await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible()
  const recordUrl = page.url()

  // OD-63: a refresh (direct open) renders the record as a standalone full page —
  // the saved view (?view=overdue) is preserved in the URL (Rule 4). The page has
  // no table/toolbar shell, so the Overdue chip is verified by returning to the list.
  await page.reload()
  await expect(page).toHaveURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/)
  await expect(page.getByRole('heading', { name: overdueTitle })).toBeVisible()

  // Return to the list — the saved view is still active: Overdue chip pressed,
  // overdue row present, future row absent.
  await page.goto('work/tasks?view=overdue')
  await expect(page.getByRole('button', { name: 'Overdue', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('tr.task-row', { hasText: overdueTitle }).first()).toBeVisible()
  await expect(page.locator('tr.task-row', { hasText: futureTitle })).toHaveCount(0)

  // New tab / direct URL of the record → the same full page, ?view= preserved.
  const secondPage = await context.newPage()
  await secondPage.goto(recordUrl)
  await expect(secondPage).toHaveURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/)
  await expect(secondPage.getByRole('heading', { name: overdueTitle })).toBeVisible({ timeout: 15_000 })
})

test('AC-307: task-name link keeps ?view=overdue across open and refresh', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  const title = `URL name-link ${Date.now()}`
  await createOverdueTask(page, title)

  await page.goto('work/tasks?view=overdue')
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: title }).click()
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
})

test('AC-307: row-menu Open keeps ?view=overdue across open and refresh', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  const title = `URL row-menu ${Date.now()}`
  await createOverdueTask(page, title)

  await page.goto('work/tasks?view=overdue')
  const row = page.locator('tr.task-row', { hasText: title }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.hover()
  await row.getByRole('button', { name: /row actions/i }).click()
  await page.getByRole('menuitem', { name: /open/i }).click()
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
})

test.describe('AC-307 mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('mobile card open keeps ?view=overdue across open and refresh', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    const title = `URL mobile-card ${Date.now()}`
    await createOverdueTask(page, title)

    await page.goto('work/tasks?view=overdue')
    const cardLink = page.getByRole('link', { name: new RegExp(title) }).first()
    await expect(cardLink).toBeVisible({ timeout: 15_000 })
    await cardLink.click()
    await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  })
})
