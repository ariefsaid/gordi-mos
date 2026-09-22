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
  const emptyDoor = page.getByRole('link', { name: /\+\s*create task/i })
  // Both doors mount only once the collection reports ready — wait for whichever this width owns.
  await expect
    .poll(async () => (await headDoor.count()) + (await fab.count()) + (await emptyDoor.count()), {
      message: '[createTaskViaUI] no create door on the Tasks surface',
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
  if (await headDoor.count() > 0) {
    await headDoor.first().click()
  } else if (await fab.count() > 0) {
    await fab.click()
    await page.getByRole('option', { name: 'Create task', exact: true }).click()
  } else {
    await emptyDoor.first().click()
  }

  // The draft row mounts as the one inline create form (task-create-form.tsx) with its title
  // focused — no route change. Its submit button shares the head door's "Create task" name, so
  // every control is scoped to the form.
  const form = page.getByRole('form', { name: 'Create task form' })
  const titleField = form.getByRole('textbox', { name: 'Title', exact: true })
  await expect(titleField).toBeVisible({ timeout: 10_000 })
  await titleField.fill(title)
  // Multiple eligible Teams intentionally leave ownership unset. Choose a real eligible Team
  // through the same picker as the user; never infer it from the displayed business unit.
  const team = form.getByRole('combobox', { name: 'Team', exact: true })
  await expect(team).toBeVisible()
  if ((await team.innerText()).includes('Select team')) {
    await team.click()
    await page.getByRole('listbox', { name: 'Team', exact: true })
      .getByRole('option').filter({ hasNotText: 'Select team' }).first().click()
    await expect(team).not.toContainText('Select team')
  }
  // Supervisor is deliberately explicit in the current ownership contract.
  const supervisor = form.getByRole('combobox', { name: 'Supervisor', exact: true })
  await expect(supervisor).toBeVisible({ timeout: 10_000 })
  await supervisor.click()
  await page.getByRole('listbox', { name: 'Supervisor', exact: true })
    .getByRole('option', { name: 'Cahya Cafe', exact: true }).click()
  await form.getByRole('button', { name: 'Create task', exact: true }).click()

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
 * #870 shape (collection-toolbar.tsx commits 3b71da46/e59120eb): the Task view chips (All / My
 * work / Team work / Overdue, plus any saved views) live in a role="group" named "Task views"
 * (tasks.toolbar.viewNavigation) — `<button aria-pressed>`, never a tablist/tab. One shared truth
 * so a toolbar shape change is fixed in one place instead of in every spec that clicks a view.
 */
export function taskViewsGroup(page: Page) {
  return page.getByRole('group', { name: 'Task views' })
}

/**
 * The "View & filters" disclosure trigger (ViewOptionsDisclosure, common.viewAndFilters) that
 * hides Group/Business unit/Status/Person/Sort/Fields/Save view behind one door — on desktop
 * (collapseOptionsOnDesktop, #870) and on phone alike. Its accessible name grows an active-filter
 * summary suffix ("View & filters, All") once a filter is set, so callers must match by PREFIX,
 * never `exact: true` — an exact match silently stops finding it the moment a filter is applied.
 */
export function viewFiltersDoor(page: Page) {
  return page.getByRole('button', { name: /^view & filters/i })
}

/** Open the "View & filters" door if it is not already open (idempotent). */
export async function openViewFilters(page: Page) {
  const door = viewFiltersDoor(page)
  if ((await door.getAttribute('aria-expanded')) === 'true') return
  await door.click()
  await expect(door).toHaveAttribute('aria-expanded', 'true')
}

/**
 * Click a Task view chip by its visible label ('All', 'My work', 'Team work', 'Overdue', or a
 * saved-view name) and wait for it to report pressed. Self-managing: on phone the chips are
 * nested inside the "View & filters" door (#870) and this opens it first; on desktop the chips
 * already ride the exposed view-axis row, so nothing is opened. Either way it leaves the door
 * exactly as it found it — a door left open as a side effect of selecting a view has been seen to
 * intercept later interactions (e.g. the record-collection-toolbar's own group-scoped keydown
 * handler stealing a page-level keyboard shortcut) — so a caller that ALSO needs the door open
 * for Group/Status/etc. should call `openViewFilters` itself, after this returns.
 */
export async function selectTaskView(page: Page, label: string) {
  const group = taskViewsGroup(page)
  const door = viewFiltersDoor(page)
  // The door button is mounted at every width (desktop's own row 1, or phone's outer copy of the
  // same disclosure) — wait for IT to settle first, so a not-yet-loaded toolbar right after
  // navigation can't be misread as "no door, must be phone". `group.or(door)` looked equivalent
  // but isn't: on desktop BOTH exist at once, and `.or()` matches the union, so `toBeVisible()`
  // on it throws a strict-mode violation instead of picking either — proven by a real run, not
  // assumed.
  await expect(door).toBeVisible()
  // Two independent signals, not one: a caller may have already opened the door itself (its
  // aria-expanded says so, regardless of width), and on desktop the chips are visible without the
  // door ever opening. Only open (and later close) it when NEITHER already holds.
  const doorAlreadyOpen = (await door.getAttribute('aria-expanded')) === 'true'
  const groupAlreadyVisible = await group.isVisible()
  const openedDoor = !doorAlreadyOpen && !groupAlreadyVisible
  if (openedDoor) await openViewFilters(page)
  const chip = group.getByRole('button', { name: label, exact: true })
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  if (openedDoor) {
    await door.click()
    await expect(door).toHaveAttribute('aria-expanded', 'false')
  }
}
