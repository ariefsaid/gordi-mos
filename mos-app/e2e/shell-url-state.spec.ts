import { randomUUID } from 'node:crypto'
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures/task-browser'
import { loginAs } from './helpers/login'
import { chooseSelectOption } from './helpers/select'
import { localSql } from './helpers/local-sql'
import { taskCleanupSql } from './fixtures/cleanup'
import { VIEWER } from './fixtures/users'

// @e2e-owned-cleanup: captured-task-ids

// task-collection-adapter.tsx VIEW_ALIASES: 'mine' is accepted as INPUT but is "a legacy Task
// saved-view chip alias that must be rewritten canonically, never kept raw" — the URL always
// settles on `view=my-work`. This file's own canonical-URL assertions must match that, not the
// retired alias.

const ORG = '10000000-0000-0000-0000-000000000001'

// VIEWER (Cahya) holds two roles/Teams (Cafe Ops Lead + Sales Lead) — beginNewTask's
// single-Team auto-resolution never fires for her, so every create leaves Team on its
// "Select team…" placeholder until chosen (createTaskViaUI, e2e/helpers/tasks.ts, carries the
// same conditional pick for the same reason).
async function pickTeamIfUnset(page: Page, form: Locator) {
  const team = form.getByRole('combobox', { name: 'Team', exact: true })
  await expect(team).toBeVisible()
  if (!(await team.innerText()).includes('Select team')) return
  await team.click()
  await page.getByRole('listbox', { name: 'Team', exact: true })
    .getByRole('option').filter({ hasNotText: 'Select team' }).first().click()
  await expect(team).not.toContainText('Select team')
}

// #671/#893: task-create-form.tsx is the ONE Task-creation form now (Title/Team/PIC/Supervisor,
// read top to bottom) — it dropped the due-date field that used to live on the retired
// /work/tasks/new full-page form, so a due-dated fixture can no longer be produced by driving
// the create UI. Seeded directly (mirrors AC-134.spec.ts's own reasoning + shape for the same
// gap), owned by VIEWER so it lands in "My work"/"Overdue". Tracked and swept in afterEach
// alongside the task-browser fixture's own UI-captured ids, honouring this file's
// @e2e-owned-cleanup contract for everything it writes, not only what the browser POSTs.
const seededTaskIds: string[] = []
async function seedTaskDueInDays(title: string, offsetDays: number): Promise<string> {
  const id = randomUUID()
  await localSql(`
    INSERT INTO mos.tasks
      (id, org_id, title, business_unit_id, status,
       responsible_person_id, accountable_person_id,
       consulted_person_ids, informed_person_ids,
       description, due_date, created_by)
    VALUES ('${id}', '${ORG}', '${title.replace(/'/g, "''")}',
      (SELECT id FROM shared.business_units WHERE org_id = '${ORG}' AND code = 'retail_ops' LIMIT 1),
      'Open', '${VIEWER.personId}', '${VIEWER.personId}', '{}', '{}',
      'Seeded for shell-url-state.spec.ts.', (current_date + ${offsetDays}), '${VIEWER.personId}');
  `)
  seededTaskIds.push(id)
  return id
}

test.afterEach(async () => {
  if (!seededTaskIds.length) return
  await localSql(taskCleanupSql(seededTaskIds.splice(0, seededTaskIds.length), ORG))
})

test('AC-306/307/308: tasks saved views survive open, refresh, close, new tab, cancel, and create', async ({ page, context }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)

  const overdueTitle = `URL overdue ${Date.now()}`
  const futureTitle = `URL future ${Date.now()}`
  const mineTitle = `URL mine ${Date.now()}`

  // The legacy `/work/tasks/new` door redirects into the collection (router.tsx) carrying
  // `?create=1`, which the workspace resolves into an inline draft — no `/new` pathname ever
  // reaches the address bar. `r` (a PIC prefill hint) and `view` both survive: neither is a
  // create-only key the workspace's cleanup effect strips (tasks-workspace.tsx).
  await page.goto(`work/tasks/new?view=my-work&r=${VIEWER.personId}`)
  await expect(page).toHaveURL(new RegExp(`/work/tasks\\?r=${VIEWER.personId}&view=my-work$`))
  const createForm = page.getByRole('form', { name: /create task form/i })
  await expect(createForm.getByRole('combobox', { name: /^pic$/i })).toContainText('Cahya Cafe')
  // Cancel discards the client-only draft; it never touched the URL (the workspace only ever
  // updates it on a committed create), so both prefill params are still exactly where they were.
  await createForm.getByRole('button', { name: /cancel/i }).click()
  await expect(page).toHaveURL(new RegExp(`/work/tasks\\?r=${VIEWER.personId}&view=my-work$`))
  await expect(page.getByRole('button', { name: 'My work' })).toHaveAttribute('aria-pressed', 'true')

  // #870: the page-head "+ Create task" is a BUTTON now (tasks-workspace.tsx `action`) — the
  // "+ Create task" LINK only exists in the table's own true-empty state, which "My work" isn't.
  await page.goto('work/tasks?view=my-work')
  await page.getByRole('button', { name: /create task/i }).click()
  // No route change on open either — the draft mounts inline at the same collection URL.
  await expect(page).toHaveURL(/\/work\/tasks\?view=my-work$/)
  const mineForm = page.getByRole('form', { name: /create task form/i })
  await mineForm.getByRole('textbox', { name: 'Title', exact: true }).fill(mineTitle)
  await pickTeamIfUnset(page, mineForm)
  await chooseSelectOption(page, mineForm.getByRole('combobox', { name: 'Supervisor', exact: true }), 'Dewi Director')
  await mineForm.getByRole('button', { name: 'Create task', exact: true }).click()
  // TaskCreateForm's onCreate (tasks-workspace.tsx onEditTitle, the inline-draft commit path)
  // clears the draft and retries the query in place — no ?highlight= and no route change at
  // all, unlike task-surface.tsx's separate full-record submit path. The view survives because
  // nothing ever touched the URL to begin with.
  await expect(page).toHaveURL(/\/work\/tasks\?view=my-work$/)
  await expect(page.locator('tr.task-row', { hasText: mineTitle }).first()).toBeVisible({ timeout: 10_000 })

  await seedTaskDueInDays(overdueTitle, -5)
  await seedTaskDueInDays(futureTitle, 365)

  await page.goto('work/tasks?view=overdue')
  await expect(page).toHaveURL(/\/work\/tasks\?view=overdue$/)
  await expect(page.getByRole('button', { name: 'Overdue', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(overdueTitle)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(futureTitle)).not.toBeVisible()

  // The title link, not the bare row: a plain row.click() can land on an interactive cell
  // control (PIC/Status/Due) instead of the row's own open affordance.
  await page.getByRole('link', { name: overdueTitle }).click()
  // DO-18 / tasks-workspace.tsx:214-217: row opens use ?record= while preserving the view.
  await page.waitForURL(/\/work\/tasks\?(?=[^#]*view=overdue)[^#]*record=[0-9a-f-]{36}$/, { timeout: 15_000 })
  await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible()
  const recordUrl = page.url()

  // OD-63: a refresh (direct open) renders the record as a standalone full page —
  // the saved view (?view=overdue) is preserved in the URL (Rule 4). The page has
  // no table/toolbar shell, so the Overdue chip is verified by returning to the list.
  await page.reload()
  await expect(page).toHaveURL(/\/work\/tasks\?(?=[^#]*view=overdue)[^#]*record=[0-9a-f-]{36}$/)
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
  await expect(secondPage).toHaveURL(/\/work\/tasks\?(?=[^#]*view=overdue)[^#]*record=[0-9a-f-]{36}$/)
  await expect(secondPage.getByRole('heading', { name: overdueTitle })).toBeVisible({ timeout: 15_000 })
})

test('AC-307: task-name link keeps ?view=overdue across open and refresh', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  const title = `URL name-link ${Date.now()}`
  await seedTaskDueInDays(title, -5)

  await page.goto('work/tasks?view=overdue')
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: title }).click()
  await page.waitForURL(/\/work\/tasks\?(?=[^#]*view=overdue)[^#]*record=[0-9a-f-]{36}$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/work\/tasks\?(?=[^#]*view=overdue)[^#]*record=[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
})

// AC-020: "the row ⋯ menu is gone — it held one action" (task-row.tsx). Its one action, a
// hard-navigation escalation to the canonical standalone page, survives as the drawer's own
// "Open full page" door (GAP-2 / OD-91 #7) — reached by opening the row first, same as the
// title-link journey above, then escalating instead of reading the panel in place.
test('AC-307: "Open full page" keeps ?view=overdue across open and refresh', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  const title = `URL open-full-page ${Date.now()}`
  await seedTaskDueInDays(title, -5)

  await page.goto('work/tasks?view=overdue')
  // The title link, not the bare row: a plain row.click() lands wherever Playwright's default
  // click point falls, which can hit an interactive cell control (PIC/Status/Due) instead of the
  // row's own open affordance — proven by a real run, not assumed. The title-link journey above
  // uses the same link for the same reason.
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: title }).click()
  await page.waitForURL(/\/work\/tasks\?(?=[^#]*view=overdue)[^#]*record=[0-9a-f-]{36}$/, { timeout: 15_000 })
  await page.getByRole('button', { name: /open full page/i }).click()
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?(?=[^#]*view=overdue)[^#]*$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  const recordUrl = page.url()

  await page.reload()
  await expect(page).toHaveURL(recordUrl)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
})

test.describe('AC-307 mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('mobile card open keeps ?view=overdue across open and refresh', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    const title = `URL mobile-card ${Date.now()}`
    await seedTaskDueInDays(title, -5)

    await page.goto('work/tasks?view=overdue')
    const cardLink = page.getByRole('link', { name: new RegExp(title) }).first()
    await expect(cardLink).toBeVisible({ timeout: 15_000 })
    await cardLink.click()
    // task-page-mode.ts: below the split threshold (phone, always) a card/row open renders the
    // STANDALONE canonical page directly, not the ?record= panel overlay the desktop drawer uses.
    await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?(?=[^#]*view=overdue)[^#]*$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/\/work\/tasks\/[0-9a-f-]{36}\?(?=[^#]*view=overdue)[^#]*$/)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  })
})
