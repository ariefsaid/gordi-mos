import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { localSql } from './helpers/local-sql'
import { notificationCleanupSql } from './fixtures/cleanup'
import { ADMIN, BAR_MEMBER, MANAGER, RECOVERY_VIEWER, VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'
import { taskViewsGroup } from './helpers/tasks'

for (const [name, actor, view] of [
  ['ordinary member', RECOVERY_VIEWER, 'My work'],
  ['Café member', BAR_MEMBER, 'My work'], ['lead', VIEWER, 'Team work'],
  ['director', MANAGER, 'All'], ['admin', ADMIN, 'All'],
] as const) {
  // #1129: the rail badge and Home are ONE number — the viewer's own open tasks — for every role.
  // The Tasks head is the current view's own count and is labelled as such, so it may differ.
  test(`R1 ${name}: Tasks badge equals Home's open count; the head counts the traversed view`, async ({ page }, info) => {
    const countRead = page.waitForResponse(r => r.request().method() === 'HEAD' && /\/rest\/v1\/tasks\?/.test(r.url()))
    await loginAs(page, actor.email, actor.password)
    expect((await countRead).ok()).toBe(true)
    const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Tasks(,|$)/ })
    // Home's open figure: the "N shown · M open" door (behind the My open work tab when tabbed).
    const personalTab = page.getByRole('tab', { name: /^My open work/ })
    if (await personalTab.count()) await personalTab.click()
    const homeDoor = page.getByRole('link', { name: /\d+ shown · \d+ open/ }).first()
    await expect(homeDoor).toBeVisible()
    const homeOpen = Number(/(\d+) open/.exec((await homeDoor.textContent()) ?? '')?.[1])
    expect(Number.isInteger(homeOpen), 'Home states its open count').toBe(true)
    await expect(link).toHaveAccessibleName(homeOpen ? `Tasks, ${homeOpen} open tasks` : 'Tasks')
    await link.click()
    await expect(taskViewsGroup(page).getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true')
    // The head scopes its own nouns to the view ("N open in this view · M shown", Done rows
    // kept 7 days included), so it cannot be mistaken for the rail badge's own-tasks count.
    await expect(page.getByText(/^\d+ open in this view · \d+ shown$/)).toBeVisible()
    await expect(page.getByRole('status', { name: 'Loading tasks' })).toHaveCount(0)
    // Read the actual rendered default queue, including virtual rows as they enter view.
    const open = new Set<string>()
    const scroll = page.locator('.tasks-scroll')
    if (await scroll.count()) {
      for (let step = 0; step < 100; step++) {
        const rows = await page.locator('tr.task-row').evaluateAll(elements => elements.map(el => ({
          href: el.querySelector<HTMLAnchorElement>('a[href*="/work/tasks/"]')?.href,
          status: el.querySelector('.td-status')?.textContent?.trim(),
        })))
        for (const row of rows) if (row.href && row.status !== 'Done') open.add(row.href)
        const atEnd = await scroll.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)
        if (atEnd) break
        await scroll.evaluate(el => { el.scrollTop += Math.max(100, el.clientHeight - 100) })
        await page.waitForTimeout(50) // allow the virtualizer's scroll render to commit
        expect(step, 'bounded traversal reaches the queue end').toBeLessThan(99)
      }
    }
    // The traversed total settles a tick after the last virtualized row commits — poll the
    // meta line's own text rather than assume it is already in sync (R1's timing gap).
    await expect.poll(
      () => page.getByTestId('tasks-count-line').textContent(),
      { message: 'count line settles to the traversed open total' },
    ).toMatch(new RegExp(`^${open.size} open in this view · \\d+ shown$`))
    if (view === 'My work') {
      expect(homeOpen, 'Home count equals the actual open rows in the default My work view').toBe(open.size)
    }
    // The badge is still Home's number after traversing a view that may hold more or fewer.
    await expect(link).toHaveAccessibleName(homeOpen ? `Tasks, ${homeOpen} open tasks` : 'Tasks')
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Signals', exact: true })).not.toHaveAttribute('aria-label')
    await info.attach('default-count', { body: JSON.stringify({ name, view, homeOpen, viewOpen: open.size, recordUrls: [...open] }, null, 2), contentType: 'application/json' })
    await page.screenshot({ path: info.outputPath('default-count.png'), animations: 'disabled' })
  })
}

for (const state of ['zero', 'failed'] as const) {
  test(`R1 ${state}: unavailable or zero counts remain quiet`, async ({ page }) => {
    let taskReads = 0
    let inboxReads = 0
    await page.route('**/rest/v1/tasks?*', async route => {
      if (route.request().method() !== 'HEAD') return route.continue()
      taskReads++
      await route.fulfill({ status: state === 'failed' ? 500 : 200, headers: { 'content-range': '*/0' }, body: '' })
    })
    await page.route('**/rest/v1/notifications?*', async route => {
      if (new URL(route.request().url()).searchParams.get('select') !== 'id') return route.continue()
      inboxReads++
      await route.fulfill({ status: state === 'failed' ? 500 : 200, contentType: 'application/json', body: state === 'failed' ? '{"message":"count unavailable"}' : '[]' })
    })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
    await expect.poll(() => taskReads).toBeGreaterThan(0)
    await expect.poll(() => inboxReads).toBeGreaterThan(0)
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Tasks', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Inbox', exact: true })).toBeVisible()
    await expect(nav.locator('[aria-label$="open tasks"], [aria-label*="unread"]')).toHaveCount(0)
  })
}

test('R1 same notification: desktop bell, phone Inbox, unread and handled parity', async ({ page }, info) => {
  const id = randomUUID()
  const org = TASKS.VIEWER_ACCOUNTABLE.orgId
  await localSql(`INSERT INTO mos.notifications (id, org_id, owner_id, title, metadata) VALUES ('${id}', '${org}', '${BAR_MEMBER.personId}', 'R1 owned mention', '{"entity":{"type":"task","id":"${TASKS.VIEWER_ACCOUNTABLE.id}","route":"/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}"}}');`)
  try {
    let unreadIds: string[] | undefined
    page.on('response', async response => {
      if (response.ok() && /\/rest\/v1\/notifications\?/.test(response.url()) && new URL(response.url()).searchParams.get('select') === 'id') {
        unreadIds = (await response.json() as { id: string }[]).map(row => row.id)
      }
    })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
    await expect.poll(() => unreadIds?.includes(id)).toBe(true)
    const initial = unreadIds!.length
    const bell = page.getByRole('banner').getByRole('button', { name: `Inbox, ${initial} unread`, exact: true })
    await expect(bell).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: `Inbox, ${initial} unread`, exact: true })).toBeVisible()
    const homeUrl = page.url()
    await bell.click()
    const row = page.locator(`[data-notification-id="${id}"]`)
    await expect(row).toBeVisible()
    await expect(row).toHaveClass(/inbox-row--unread/)
    await expect(page).toHaveURL(homeUrl)
    await page.screenshot({ path: info.outputPath('desktop-bell.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(bell).toBeFocused()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('banner').getByRole('link', { name: `Inbox, ${initial} unread`, exact: true }).click()
    await expect(page).toHaveURL(/\/inbox$/)
    await expect(page.getByRole('dialog', { name: 'Inbox', exact: true })).toHaveCount(0)
    await expect(row).toBeVisible()
    await expect(row).toHaveClass(/inbox-row--unread/)
    await page.getByRole('button', { name: /^Unread ·/ }).click()
    await row.getByRole('button', { name: 'Mark handled', exact: true }).click()
    await expect(row).toHaveCount(0)
    const next = initial - 1
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: next ? `Inbox, ${next} unread` : 'Inbox', exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: /^Handled ·/ }).click()
    await expect(row).toBeVisible()
    await expect(row).not.toHaveClass(/inbox-row--unread/)
    await expect(row.getByRole('button', { name: 'Mark handled', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: /^Unread ·/ }).click()
    await expect(row).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('phone-handled.png'), animations: 'disabled' })
  } finally {
    await localSql(notificationCleanupSql([id], org, BAR_MEMBER.personId))
  }
})
