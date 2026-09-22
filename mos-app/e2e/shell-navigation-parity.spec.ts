import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN, BAR_MEMBER, MANAGER, RECOVERY_VIEWER, VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

const personas = [
  { name: 'ordinary member', ...RECOVERY_VIEWER, cafe: false, capture: false, revenue: false, view: 'My work' },
  { name: 'Café member', ...BAR_MEMBER, cafe: true, capture: true, revenue: false, view: 'My work' },
  { name: 'Café lead', ...VIEWER, cafe: true, capture: true, revenue: false, view: 'Team work' },
  { name: 'Finance', email: 'fitri.dev@example.test', password: VIEWER.password, cafe: false, capture: false, revenue: true, view: 'My work' },
  { name: 'Sales', email: 'sari.dev@example.test', password: VIEWER.password, cafe: false, capture: false, revenue: false, view: 'My work' },
  { name: 'director', ...MANAGER, cafe: false, capture: true, revenue: true, view: 'All' },
  { name: 'admin', ...ADMIN, cafe: false, capture: true, revenue: true, view: 'All' },
]

for (const actor of personas) {
  test(`R1 ${actor.name}: rail, More, route, palette and launcher admission`, async ({ page }, info) => {
    test.setTimeout(60_000)
    await loginAs(page, actor.email, actor.password)
    const rail = page.getByRole('navigation', { name: 'Primary' })
    for (const label of ['Home', 'Work', 'Signals', 'Tasks', 'Projects & Processes', 'Objectives', 'Inbox', 'Café']) {
      await expect(rail.getByRole('link', { name: new RegExp(`^${label}(,|$)`) }).first()).toBeVisible()
    }
    await expect(rail.getByRole('link', { name: 'Money', exact: true })).toHaveCount(0)
    await expect(rail.getByRole('link', { name: 'Admin Settings' })).toHaveCount(['admin', 'director'].includes(actor.name) ? 1 : 0)
    await rail.getByRole('link', { name: 'Café', exact: true }).click()
    await expect(page).toHaveURL(/\/cafe$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto('cafe/log')
    await expect(page).toHaveURL(/\/cafe\/log/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto('')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Command menu' })
    await expect(dialog.getByRole('group').first()).toHaveAttribute('aria-label', 'GO TO')
    await expect(dialog.getByRole('group').last()).toHaveAttribute('aria-label', 'ACT')
    await expect(dialog.getByRole('option', { name: 'Café', exact: true })).toBeVisible()
    await dialog.getByRole('combobox').fill('Log Café')
    await expect(dialog.getByRole('option', { name: 'Log Café production', exact: true })).toHaveCount(actor.capture ? 1 : 0)
    await page.keyboard.press('Escape')

    await page.setViewportSize({ width: 390, height: 844 })
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Café', exact: true })).toHaveCount(actor.cafe ? 1 : 0)
    await expect(nav.locator('.bottom-tab-label')).toHaveText(actor.cafe ? ['Home', 'Work', 'Café', 'Inbox', 'More'] : ['Home', 'Work', 'Inbox', 'More'])
    for (const label of await nav.locator('.bottom-tab-label').all()) {
      const geometry = await label.evaluate(el => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight), width: el.clientWidth, scroll: el.scrollWidth }))
      expect(geometry.height).toBeLessThanOrEqual(geometry.line + 1)
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
    }
    await nav.getByRole('button', { name: 'More' }).click()
    const more = page.getByRole('dialog', { name: 'More', exact: true })
    for (const label of ['Signals', 'Tasks', 'Projects & Processes', 'Objectives']) {
      await expect(more.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    if (actor.cafe) {
      await expect(more.getByRole('link', { name: 'Café', exact: true })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await nav.getByRole('link', { name: 'Café', exact: true }).click()
    } else {
      await more.getByRole('link', { name: 'Café', exact: true }).click()
    }
    await expect(page).toHaveURL(/\/cafe$/)
    await expect(more).toBeHidden()
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(dialog.getByRole('group')).toHaveCount(0)
    await dialog.getByRole('combobox').fill(TASKS.VIEWER_ACCOUNTABLE.title)
    await expect(dialog.getByRole('group', { name: 'Records', exact: true }).getByRole('option')).toBeVisible()
    await expect(dialog.getByRole('group', { name: /GO TO|ACT/ })).toHaveCount(0)
    await expect(dialog.getByRole('option', { name: 'Create task', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    // DD-MVP-17 (bottom-tab-bar.tsx CAPTURE_SURFACE_PATHS): /cafe is itself the capture surface
    // now, so the phone Action Launcher is deliberately hidden there — its own control is the
    // primary action. This test is about the launcher's PERSONA-gated options, not about Café
    // specifically, so it reaches the launcher from a non-capture surface instead.
    await page.goto('')
    await page.getByRole('button', { name: 'Open actions' }).click()
    await expect(dialog.getByRole('option', { name: 'Create task', exact: true })).toBeVisible()
    await expect(dialog.getByRole('option', { name: 'Share Signal', exact: true })).toBeVisible()
    await expect(dialog.getByRole('option', { name: 'Log Café production', exact: true })).toHaveCount(actor.capture ? 1 : 0)
    await page.screenshot({ path: info.outputPath('phone-launcher.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Tasks(,|$)/ })).toBeVisible()
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await dialog.getByRole('combobox').fill(TASKS.VIEWER_ACCOUNTABLE.title)
    await dialog.getByRole('group', { name: 'Records', exact: true }).getByRole('option').click()
    await expect(page).toHaveURL(new RegExp(`/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}$`))
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(dialog.getByRole('group')).toHaveCount(3)
    await expect(dialog.getByRole('group').nth(0)).toHaveAttribute('aria-label', 'Recent')
    await expect(dialog.getByRole('group').nth(1)).toHaveAttribute('aria-label', 'GO TO')
    await expect(dialog.getByRole('group').nth(2)).toHaveAttribute('aria-label', 'ACT')
    await dialog.getByRole('option', { name: 'Create task', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('desktop-recent.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Open deputy', exact: true }).click()
    await expect(page.getByRole('button', { name: "What's on my plate this week?", exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: "Show last week's revenue", exact: true })).toHaveCount(actor.revenue ? 1 : 0)
  })
}

for (const actor of [personas[1], personas[5]]) {
  for (const width of [1440, 390]) {
    test(`R1 ${actor.name}: Deputy retains Task context at ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await loginAs(page, actor.email, actor.password)
      await page.goto(`work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}`)
      const footer = page.getByRole('button', { name: 'Ask Deputy about this Task', exact: true })
      await expect(footer).toBeVisible()
      await footer.scrollIntoViewIfNeeded()
      const box = await footer.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      await footer.click()
      await expect(page.getByRole('textbox', { name: 'Ask the deputy…' })).toHaveValue(`About Task: ${TASKS.VIEWER_ACCOUNTABLE.title}`)
      await expect(page.getByRole('button', { name: "What's on my plate this week?", exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: "Show last week's revenue", exact: true })).toHaveCount(actor.revenue ? 1 : 0)
      await expect(page.locator('[data-record-deputy="footer"]')).toHaveCount(1)
      await expect(page).toHaveURL(new RegExp(`/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}$`))
      await page.screenshot({ path: info.outputPath('deputy-context.png'), animations: 'disabled' })
      await page.keyboard.press('Escape')
      await expect(footer).toBeVisible()
    })
  }
}
