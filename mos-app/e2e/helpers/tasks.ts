// Reusable task helpers for e2e journeys.
import { expect, type Page } from '@playwright/test'

/**
 * Create a task through the real UI and return the new task's detail URL.
 * Assumes the caller has already navigated to the tasks list (/work/tasks).
 *
 * #671 retired the /work/tasks/new create FORM: create is now an inline draft row with its
 * title focused, committed with Enter, and the route only survives as a redirect to
 * `/work/tasks?create=1` (mos-app/src/router.tsx defines the RouteRedirect; router.test.tsx's Tasks
 * nesting test covers the retired route shape).
 * The create door itself is width-dependent — the page-head button on desktop, the actions
 * FAB on phone, where the head button is deliberately absent (one door per width).
 */
export async function createTaskViaUI(
  page: Page,
  title: string,
): Promise<string> {
  const headDoor = page.getByRole('button', { name: /create task/i })
  const fab = page.getByRole('button', { name: /open actions/i })
  // Both doors mount only once the collection reports ready — wait for whichever this width owns.
  await expect
    .poll(async () => (await headDoor.count()) + (await fab.count()), {
      message: '[createTaskViaUI] no create door on the Tasks surface',
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
  if (await headDoor.count() > 0) {
    await headDoor.first().click()
  } else {
    await fab.click()
    await page.getByRole('option', { name: 'Create task', exact: true }).click()
  }

  // The draft row mounts in edit mode with the title field focused — no form, no route change.
  const titleField = page.getByRole('textbox', { name: 'Edit task title' })
  await expect(titleField).toBeVisible({ timeout: 10_000 })
  await titleField.fill(title)
  await titleField.press('Enter')

  // The committed task replaces the draft row: same title, but a real record id in its href
  // (the draft's own id is `new-task-<ts>`), on the table row and the phone card alike.
  const created = page.locator('a[href*="/work/tasks/"]').filter({ hasText: title }).first()
  let href = ''
  await expect
    .poll(async () => {
      href = (await created.getAttribute('href').catch(() => null)) ?? ''
      return /\/work\/tasks\/[0-9a-f-]{36}$/.test(href)
    }, { message: `[createTaskViaUI] "${title}" never landed as a saved task row`, timeout: 15_000 })
    .toBe(true)
  return `/work/tasks/${href.match(/[0-9a-f-]{36}/)![0]}`
}
