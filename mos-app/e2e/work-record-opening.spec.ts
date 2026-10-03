import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER, VIEWER } from './fixtures/users'

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }
const COLLECTIONS = [
  { key: 'signals', path: 'work/signals?layout=feed', label: 'Signals' },
  { key: 'tasks', path: 'work/tasks', label: 'Tasks' },
  { key: 'projects', path: 'work/projects', label: 'Projects & Processes' },
  { key: 'objectives', path: 'work/objectives', label: 'Objectives' },
] as const

type CollectionKey = typeof COLLECTIONS[number]['key']
type RecordTarget = { path: string; kind: 'signal' | 'task' | 'catalog'; name: string }

async function openFirstRecord(page: Page, collection: CollectionKey, phone: boolean): Promise<RecordTarget> {
  if (collection === 'signals') {
    const row = page.locator('main [data-signal-id][role="button"]').first()
    await expect(row).toBeVisible()
    const id = (await row.getAttribute('data-signal-id'))!
    await row.click()
    return { path: `/work/signals/${id}`, kind: 'signal', name: id }
  }

  if (collection === 'tasks' && phone) {
    const card = page.locator('.task-card-link').first()
    await expect(card).toBeVisible()
    const href = (await card.getAttribute('href'))!
    const name = (await card.locator('.task-name').innerText()).trim()
    await card.click()
    return { path: new URL(href, page.url()).pathname, kind: 'task', name }
  }

  if (collection === 'tasks') {
    const row = page.locator('tr.task-row').first()
    await expect(row).toBeVisible()
    const href = (await row.locator('a[href*="/work/tasks/"]').first().getAttribute('href'))!
    const name = (await row.locator('.task-name').first().innerText()).trim()
    const title = row.locator('.task-name').first()
    const bounds = await title.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.click(bounds!.x + 8, bounds!.y + bounds!.height / 2)
    return { path: new URL(href, page.url()).pathname, kind: 'task', name }
  }

  const row = page.locator('.catalog-collection__row-link').first()
  await expect(row).toBeVisible()
  const href = (await row.getAttribute('href'))!
  const name = (await row.getAttribute('aria-label')) ?? ''
  await row.click()
  return { path: new URL(href, page.url()).pathname, kind: 'catalog', name }
}

async function expectRecordReady(scope: Page | Locator, target: RecordTarget) {
  if (target.kind === 'signal') {
    await expect(scope.locator('[data-signal-region="facts"]')).toBeVisible()
  } else {
    await expect(scope.getByRole('region', { name: target.name, exact: true })).toBeVisible()
  }
}

async function visitPhoneRecords(page: Page, info: TestInfo, actorName: string) {
  for (const collection of COLLECTIONS) {
    await page.goto(collection.path)
    const switcher = page.locator('[data-anatomy="work-collection-switcher"]')
    await expect(switcher).toBeVisible()
    await expect(switcher.getByRole('link', { name: collection.label, exact: true })).toHaveAttribute('aria-current', 'location')

    const target = await openFirstRecord(page, collection.key, true)
    await expect(page).toHaveURL((url) => url.pathname === target.path)
    await expect(page.locator('[data-overlay-host]')).toHaveCount(0)
    await expectRecordReady(page, target)
    const back = page.getByRole('link', { name: `Back to ${collection.label}`, exact: true })
    await expect(back).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${actorName}-390-${collection.key}-record.png`), animations: 'disabled' })
    await back.click()
    await expect(page).toHaveURL((url) => url.pathname.endsWith(`/work/${collection.key}`))
    await expect(switcher.getByRole('link', { name: collection.label, exact: true })).toHaveAttribute('aria-current', 'location')
    await expect(page.locator('[data-overlay-host]')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
}

async function visitDesktopPanels(page: Page, info: TestInfo, actorName: string) {
  for (const collection of COLLECTIONS) {
    await page.goto(collection.path)
    const target = await openFirstRecord(page, collection.key, false)
    const panel = page.locator('[data-overlay-host]')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveClass(/drawer-split/)
    await expect(page.getByRole('heading', { name: collection.label, exact: true })).toBeVisible()
    await expectRecordReady(panel, target)
    await page.screenshot({ path: info.outputPath(`${actorName}-1440-${collection.key}-panel.png`), animations: 'disabled' })

    await page.reload()
    if (collection.key === 'signals') {
      // OD-REDESIGN-63 explicitly makes a hard refresh of a Signal's transient ?record= state
      // resolve to its standalone canonical page; preserving that ruling is the only reload exception.
      await expect(page).toHaveURL((url) => url.pathname === target.path)
      await expect(page.locator('[data-overlay-host]')).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Back to Signals', exact: true })).toBeVisible()
      await expectRecordReady(page, target)
    } else {
      await expect(page.locator('[data-overlay-host]')).toBeVisible()
      await expect(page.locator('[data-overlay-host]')).toHaveClass(/drawer-split/)
      await expect(page).toHaveURL(/record=/)
      await expectRecordReady(page.locator('[data-overlay-host]'), target)
    }
  }

  if (actorName === 'director') {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('work/tasks')
    const target = await openFirstRecord(page, 'tasks', false)
    const panel = page.locator('[data-overlay-host]')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveClass(/drawer-split/)
    await expectRecordReady(panel, target)
    await page.screenshot({ path: info.outputPath(`${actorName}-1920-tasks-panel.png`), animations: 'disabled' })
  }
}

for (const actor of [
  { name: 'Director', ...MANAGER },
  { name: 'member', ...VIEWER },
]) {
  test(`${actor.name}: all four Work records open as full pages on phone and return with one Back`, async ({ page }, info) => {
    test.setTimeout(55_000)
    await page.setViewportSize(PHONE)
    await loginAs(page, actor.email, actor.password)
    await visitPhoneRecords(page, info, actor.name.toLowerCase())
  })

  test(`${actor.name}: Work record panels restore on desktop except Signals under OD-REDESIGN-63`, async ({ page }, info) => {
    test.setTimeout(55_000)
    await page.setViewportSize(DESKTOP)
    await loginAs(page, actor.email, actor.password)
    await visitDesktopPanels(page, info, actor.name.toLowerCase())
  })
}

test('a cold query-linked panel closes to its collection; a cold canonical URL stays a full page', async ({ page, context }) => {
  await page.setViewportSize(DESKTOP)
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('work/projects')
  const row = page.locator('.catalog-collection__row-link').first()
  await expect(row).toBeVisible()
  const href = (await row.getAttribute('href'))!
  const name = (await row.getAttribute('aria-label')) ?? ''
  await row.click()
  await expect(page).toHaveURL(/record=/)

  const coldPanel = await context.newPage()
  await coldPanel.setViewportSize(DESKTOP)
  await coldPanel.goto(page.url())
  await expect(coldPanel.locator('[data-overlay-host]')).toBeVisible()
  await coldPanel.locator('[data-overlay-host]').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(coldPanel).toHaveURL((url) => url.pathname === '/work/projects' && !url.searchParams.has('record'))
  await expect(coldPanel.getByRole('heading', { name: 'Projects & Processes' })).toBeVisible()
  await expect(coldPanel.locator('[data-overlay-host]')).toHaveCount(0)
  await coldPanel.close()

  const canonicalPage = await context.newPage()
  await canonicalPage.setViewportSize(DESKTOP)
  await canonicalPage.goto(new URL(href, page.url()).toString())
  await expect(canonicalPage.locator('[data-overlay-host]')).toHaveCount(0)
  await expectRecordReady(canonicalPage, { path: href, kind: 'catalog', name })
  await canonicalPage.close()
})

test('pushing the task-create frame keeps Title focused without validating the blank form', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('work/projects')
  const rows = page.locator('.catalog-collection__row-link')
  await expect(rows.first()).toBeVisible()
  let projectRow: Locator | null = null
  for (let index = 0; index < await rows.count(); index += 1) {
    const candidate = rows.nth(index)
    if (await candidate.locator('.catalog-collection__identity .mk-tag').innerText() === 'Project') {
      projectRow = candidate
      break
    }
  }
  expect(projectRow, 'the seeded Projects collection has a Project record').not.toBeNull()
  await projectRow!.click()
  const panel = page.locator('[data-overlay-host]')
  await expect(panel).toBeVisible()
  await expectRecordReady(panel, {
    path: (await projectRow!.getAttribute('href')) ?? '',
    kind: 'catalog',
    name: (await projectRow!.getAttribute('aria-label')) ?? '',
  })

  await panel.getByRole('button', { name: /add task/i }).first().click()
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await expect(title).toBeFocused()
  await expect(page.getByRole('alert').filter({ hasText: 'Title is required' })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Back', exact: true }).click()
  await expectRecordReady(panel, {
    path: (await projectRow!.getAttribute('href')) ?? '',
    kind: 'catalog',
    name: (await projectRow!.getAttribute('aria-label')) ?? '',
  })
})

