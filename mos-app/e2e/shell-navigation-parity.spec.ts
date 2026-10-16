import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN, BAR_MEMBER, MANAGER, RECOVERY_VIEWER, VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

// One persona per distinct admission outcome (Café tab, capture action, revenue prompt, Admin link).
// A Café lead matches the Café member, and Sales matches the ordinary member, on every one.
const personas = [
  { name: 'ordinary member', ...RECOVERY_VIEWER, cafe: false, capture: false, revenue: false, view: 'My work' },
  { name: 'Café member', ...BAR_MEMBER, cafe: true, capture: true, revenue: false, view: 'My work' },
  { name: 'Finance', email: 'fitri.dev@example.test', password: VIEWER.password, cafe: false, capture: false, revenue: true, view: 'My work' },
  { name: 'director', ...MANAGER, cafe: false, capture: true, revenue: true, view: 'All' },
  // capabilities.ts REVENUE_VIEW_ROLES = finance/manager/supervisor (#797/OD-WAY-98 dropped admin
  // from both money-read sets): admin is the users-and-settings role and reads no money of its
  // own — the ADMIN fixture holds only `admin` (global-setup.ts), so it has no revenue view here.
  { name: 'admin', ...ADMIN, cafe: false, capture: true, revenue: false, view: 'All' },
]

// The admin holds budget/pricing pages when that flag is on, so Money is admitted for it then.
const PLAN_BUDGET_ENABLED = process.env.VITE_SHOW_PLAN_BUDGET === 'true'

for (const actor of personas) {
  test(`R1 ${actor.name}: navigation, More, route, palette and launcher admission`, async ({ page }) => {
    test.setTimeout(60_000)
    const dialog = page.getByRole('dialog', { name: 'Command menu' })
    const money = actor.revenue || (actor.name === 'admin' && PLAN_BUDGET_ENABLED)
    // Phone first: a viewer who opens Café is offered it as a tab from then on, so the
    // untouched tab bar is asserted before any Café page is visited.
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, actor.email, actor.password)
    const phoneNav = page.getByRole('navigation', { name: 'Primary' })
    await expect(phoneNav.getByRole('link', { name: 'Café', exact: true })).toHaveCount(actor.cafe ? 1 : 0)
    await expect(phoneNav.getByRole('link')).toHaveText(actor.cafe ? ['Home', 'Work', 'Café'] : ['Home', 'Work'])
    await phoneNav.getByRole('button', { name: 'More' }).click()
    const more = page.getByRole('dialog', { name: 'More', exact: true })
    for (const label of ['Home', 'Work', 'Inbox']) {
      await expect(more.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    // Money stays out of the fixed tabs and appears in More only for the roles that reach it.
    await expect(phoneNav.getByRole('link', { name: 'Money', exact: true })).toHaveCount(0)
    await expect(more.getByRole('link', { name: 'Money', exact: true })).toHaveCount(money ? 1 : 0)
    if (actor.cafe) {
      await page.keyboard.press('Escape')
      await phoneNav.getByRole('link', { name: 'Café', exact: true }).click()
    } else {
      await more.getByRole('link', { name: 'Café', exact: true }).click()
    }
    await expect(page).toHaveURL(/\/cafe$/)
    await expect(more).toBeHidden()
    await page.getByRole('button', { name: /^Search/ }).click()
    await expect(dialog.getByRole('group')).toHaveCount(0)
    await dialog.getByRole('combobox').fill(TASKS.VIEWER_ACCOUNTABLE.title)
    await expect(dialog.getByRole('group', { name: 'Task', exact: true }).getByRole('option')).toBeVisible()
    await expect(dialog.getByRole('group', { name: /Go to|Actions/ })).toHaveCount(0)
    await expect(dialog.getByRole('option', { name: 'Create task', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    // DD-MVP-17 (bottom-tab-bar.tsx CAPTURE_SURFACE_PATHS): /cafe is itself the capture surface
    // now, so the phone launcher is deliberately hidden there. This test is about the launcher's
    // PERSONA-gated options, so it reaches the launcher from a non-capture surface instead.
    await page.goto('')
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    await expect(dialog.getByRole('option', { name: 'Create task', exact: true })).toBeVisible()
    await expect(dialog.getByRole('option', { name: 'Share signal', exact: true })).toBeVisible()
    await expect(dialog.getByRole('option', { name: 'Log Café production', exact: true })).toHaveCount(actor.capture ? 1 : 0)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 900 })
    // The sidebar (or the rail beside its pages panel) holds the areas; Work's pages open with Work.
    const nav = page.locator('aside, nav:not([aria-label="Breadcrumb"])')
    for (const label of ['Home', 'Work', 'Café']) {
      await expect(nav.getByRole('link', { name: label, exact: true }).first()).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Inbox', exact: true })).toBeVisible()
    await nav.getByRole('link', { name: 'Work', exact: true }).first().click()
    for (const label of ['Signals', 'Tasks', 'Projects & Processes', 'Objectives']) {
      await expect(nav.getByRole('link', { name: new RegExp(`^${label}(,|\\s|$)`) }).first()).toBeVisible()
    }
    await expect(nav.getByRole('link', { name: 'Money', exact: true })).toHaveCount(money ? 1 : 0)
    await expect(nav.getByRole('link', { name: 'Admin settings', exact: true })).toHaveCount(['admin', 'director'].includes(actor.name) ? 1 : 0)
    await nav.getByRole('link', { name: 'Café', exact: true }).first().click()
    await expect(page).toHaveURL(/\/cafe$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto('cafe/log')
    await expect(page).toHaveURL(/\/cafe\/production$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto('')
    await page.getByRole('button', { name: /^Search/ }).click()
    await expect(dialog.getByRole('group', { name: 'Go to', exact: true })).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'Actions', exact: true })).toBeVisible()
    await expect(dialog.getByRole('option', { name: 'Café', exact: true })).toBeVisible()
    await dialog.getByRole('combobox').fill('Log Café')
    await expect(dialog.getByRole('option', { name: 'Log Café production', exact: true })).toHaveCount(actor.capture ? 1 : 0)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /^Search/ }).click()
    await dialog.getByRole('combobox').fill(TASKS.VIEWER_ACCOUNTABLE.title)
    await dialog.getByRole('group', { name: 'Task', exact: true }).getByRole('option').click()
    await expect(page).toHaveURL(new RegExp(`/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}$`))
    await page.getByRole('button', { name: /^Search/ }).click()
    await expect(dialog.getByRole('group')).toHaveCount(3)
    await expect(dialog.getByRole('group').nth(0)).toHaveAttribute('aria-label', 'Recent')
    await expect(dialog.getByRole('group').nth(1)).toHaveAttribute('aria-label', 'Actions')
    await expect(dialog.getByRole('group').nth(2)).toHaveAttribute('aria-label', 'Go to')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Open deputy', exact: true }).click()
    await expect(page.getByRole('button', { name: "What's on my plate this week?", exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: "Show last week's revenue", exact: true })).toHaveCount(actor.revenue ? 1 : 0)
  })
}

// Revenue prompt present (director) at desktop, absent (Café member) at phone, where the menu item
// must also meet the 44px floor: each outcome once.
for (const [actor, width] of [[personas[3], 1440], [personas[1], 390]] as const) {
  test(`R1 ${actor.name}: Deputy retains Task context at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await loginAs(page, actor.email, actor.password)
    await page.goto(`work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}`)
    // Ask Deputy is one item in the record's ⋯ menu.
    const menuTrigger = page.getByRole('button', { name: 'More actions', exact: true })
    await menuTrigger.click()
    const askDeputy = page.getByRole('menuitem', { name: 'Ask Deputy', exact: true })
    await expect(askDeputy).toBeVisible()
    if (width === 390) expect((await askDeputy.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await askDeputy.click()
    await expect(page.getByRole('textbox', { name: 'Ask the deputy…' })).toHaveValue(`About Task: ${TASKS.VIEWER_ACCOUNTABLE.title}`)
    await expect(page.getByRole('button', { name: "What's on my plate this week?", exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: "Show last week's revenue", exact: true })).toHaveCount(actor.revenue ? 1 : 0)
    await expect(page).toHaveURL(new RegExp(`/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}$`))
    await page.keyboard.press('Escape')
    await expect(menuTrigger).toBeVisible()
  })
}
