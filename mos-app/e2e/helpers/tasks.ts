// Reusable task helpers for e2e journeys.
import { expect, type Page } from '@playwright/test'
import { chooseSelectOption } from './select'

/**
 * Create a task through the real UI and return the new task's detail URL.
 * Assumes the caller has already navigated to the tasks list (/work/tasks).
 *
 * #671 retired the /work/tasks/new create FORM: create is now an inline draft row with its
 * title focused, committed with Enter, and the route only survives as a redirect to
 * `/work/tasks?create=1` (mos-app/src/router.tsx defines the RouteRedirect; router.test.tsx's Tasks
 * nesting test covers the retired route shape).
 * The create door is the page-head button at every width (the phone + launcher yields on Tasks);
 * an empty collection offers its own link instead.
 */
export async function createTaskViaUI(
  page: Page,
  title: string,
): Promise<string> {
  const headDoor = page.getByRole('button', { name: /create task/i })
  const emptyDoor = page.getByRole('link', { name: /\+\s*create task/i })
  // The doors mount only once the collection reports ready — wait for whichever applies.
  await expect
    .poll(async () => (await headDoor.count()) + (await emptyDoor.count()), {
      message: '[createTaskViaUI] no create door on the Tasks surface',
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
  if (await headDoor.count() > 0) {
    await headDoor.first().click()
  } else {
    await emptyDoor.first().click()
  }

  // The Create task capture page (?create=1 stays in the URL while the draft is open) has the one
  // form with its title focused. Its submit button sits in the page's action bar, outside the form.
  const form = page.getByRole('form', { name: 'Create task form' })
  const titleField = form.getByRole('textbox', { name: 'Title', exact: true })
  await expect(titleField).toBeVisible({ timeout: 10_000 })
  await titleField.fill(title)
  // Multiple eligible Teams intentionally leave ownership unset. Choose a real eligible Team
  // through the same picker as the user; never infer it from the displayed business unit.
  const team = form.getByRole('combobox', { name: 'Team', exact: true })
  await expect(team).toBeVisible()
  if ((await team.innerText()).includes('Choose a team')) {
    await team.click()
    await page.getByRole('listbox', { name: 'Team', exact: true })
      .getByRole('option').filter({ hasNotText: 'Choose a team' }).first().click()
    await expect(team).not.toContainText('Choose a team')
  }
  // Supervisor is deliberately explicit in the current ownership contract.
  const supervisor = form.getByRole('combobox', { name: 'Supervisor', exact: true })
  await expect(supervisor).toBeVisible({ timeout: 10_000 })
  await supervisor.click()
  await page.getByRole('listbox', { name: 'Supervisor', exact: true })
    .getByRole('option', { name: 'Cahya Cafe', exact: true }).click()
  await page.getByRole('button', { name: 'Create task', exact: true }).click()

  // The committed task replaces the draft row: same title, but a real record id in its href
  // (the draft's own id is `new-task-<ts>`), on the table row and the phone card alike.
  const created = page.locator('a[href*="/work/tasks/"]').filter({ hasText: title }).first()
  let href = ''
  await expect
    .poll(async () => {
      href = (await created.getAttribute('href').catch(() => null)) ?? ''
      return /\/work\/tasks\/[0-9a-f-]{36}(?:\?.*)?$/.test(href)
    }, { message: `[createTaskViaUI] "${title}" never landed as a saved task row`, timeout: 15_000 })
    .toBe(true)
  return `/work/tasks/${href.match(/[0-9a-f-]{36}/)![0]}`
}

/**
 * The Task views picker (collection-toolbar.tsx): a combobox named "Task views" whose trigger shows
 * the chosen scope (the primary view — "All" for org-wide admin viewers, "Relevant" for everyone
 * else per OD-TASK-3 — My work / Team work / Overdue, or a saved view). One shared truth so a
 * toolbar shape change is fixed in one place instead of in every spec that picks a view.
 */
export function taskViewsPicker(page: Page) {
  return page.getByRole('combobox', { name: 'Task views', exact: true })
}

/** The "Filters & options" disclosure trigger that hides the narrowing filters, fields and saved views. */
export function viewFiltersDoor(page: Page) {
  return page.getByRole('button', { name: /^filters & options/i })
}

/** Open the "Filters & options" door if it is not already open (idempotent). */
export async function openViewFilters(page: Page) {
  const door = viewFiltersDoor(page)
  if ((await door.getAttribute('aria-expanded')) === 'true') return
  await door.click()
  await expect(door).toHaveAttribute('aria-expanded', 'true')
}

/**
 * Pick a Task view by its visible label ('Relevant' for non-org-wide viewers, 'All' for admin
 * (OD-TASK-3), 'My work', 'Team work', 'Overdue', or a saved-view name) and wait for the picker to
 * show it.
 */
export async function selectTaskView(page: Page, label: string) {
  const picker = taskViewsPicker(page)
  await chooseSelectOption(page, picker, label)
  await expect(picker).toContainText(label)
}
