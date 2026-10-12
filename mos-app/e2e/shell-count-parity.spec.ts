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
    // #1194 / #1207: Home's day header is the current shared open-task count surface; the
    // capped region/drill copy describes its own list and is not the parity oracle.
    const homeCount = page.locator('.home-head-counts')
    await expect(homeCount).toHaveText(/^\d+ open$/)
    const homeOpen = Number(/^(\d+) open$/.exec((await homeCount.textContent()) ?? '')?.[1])
    expect(Number.isInteger(homeOpen), 'Home states its shared open-task count').toBe(true)
    await expect(link).toHaveAccessibleName(homeOpen ? `Tasks, ${homeOpen} open tasks` : 'Tasks')
    await link.click()
    await expect(taskViewsGroup(page).getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true')
    // #1628: the head names the view's open count and its 30-day Done window, not a
    // loaded-row total that could be mistaken for the rail badge's own-tasks count.
    const countLine = page.getByTestId('tasks-count-line')
    await expect(countLine).toBeVisible()
    await expect(countLine).toHaveText(/^\d+ open in this view · Active \+ Done in the last 30 days$/)
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
      () => countLine.textContent(),
      { message: 'count line settles to the traversed open total' },
    ).toBe(`${open.size} open in this view · Active + Done in the last 30 days`)
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
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
    const bell = page.getByRole('banner').getByRole('button', { name: /^Inbox, \d+ unread$/ })
    await expect(bell).toBeVisible()
    const notificationList = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.ok()
        && response.request().method() === 'GET'
        && url.pathname.endsWith('/rest/v1/notifications')
        && url.searchParams.get('select') === 'id,severity,title,body,metadata,read_at,handled_at,created_at'
    })
    const homeUrl = page.url()
    await bell.click()
    const notifications = await (await notificationList).json() as { id: string; read_at: string | null }[]
    const unreadIds = notifications.filter(notification => notification.read_at === null).map(notification => notification.id)
    expect(unreadIds).toContain(id)
    const initial = unreadIds.length
    await expect(bell).toHaveAccessibleName(`Inbox, ${initial} unread`)
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: `Inbox, ${initial} unread`, exact: true })).toBeVisible()
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
