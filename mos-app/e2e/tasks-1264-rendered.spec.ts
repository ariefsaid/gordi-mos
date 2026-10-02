import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { MANAGER, VIEWER } from './fixtures/users'
import { loginAs } from './helpers/login'

const screenshotDir = process.env.GORDI_1264_SCREENSHOT_DIR
const PROCESS_ID = 'e3000000-0000-0000-0000-000000000001'

async function capture(page: import('@playwright/test').Page, testInfo: import('@playwright/test').TestInfo, filename: string) {
  await page.screenshot({
    path: screenshotDir ? join(screenshotDir, filename) : testInfo.outputPath(filename),
    fullPage: false,
  })
}

test('1264 rendered check: Director Process and member create form at phone and desktop widths', async ({ page }, testInfo) => {
  test.setTimeout(60_000)

  await page.setViewportSize({ width: 390, height: 844 })
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto(`work/projects/${PROCESS_ID}`)
  await expect(page.getByRole('heading', { name: 'Café Opening', exact: true })).toBeVisible()
  const occurrenceSection = page.getByRole('region', { name: 'Current and next action', exact: true })
  await expect(occurrenceSection).toBeVisible()
  const settledOccurrence = occurrenceSection.getByRole('note')
    .or(occurrenceSection.getByRole('button', { name: /Past occurrences/ }))
    .or(occurrenceSection.getByRole('listitem').first())
  await expect(settledOccurrence.first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, testInfo, 'director-process-390.png')

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('heading', { name: 'Café Opening', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, testInfo, 'director-process-1440.png')

  await page.setViewportSize({ width: 390, height: 844 })
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks?create=1')
  const form = page.locator('form.tcf')
  await expect(form).toBeVisible()
  await expect(page.getByRole('textbox', { name: /title/i })).toBeFocused()

  const frame = page.locator('.page-frame--v3')
  await page.evaluate(() => window.scrollTo(0, 0))
  await frame.evaluate((element) => { element.scrollTop = 0 })
  const geometry = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('.page-frame--v3')
    const submit = document.querySelector<HTMLButtonElement>('.tcf-foot > button[type="submit"]')
    const tabs = document.querySelector<HTMLElement>('.bottom-tab-bar')
    if (!frame || !submit || !tabs) throw new Error('Task create frame, submit, or phone tabs did not render')
    const buttonRect = submit.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    return {
      frameScrollTop: frame.scrollTop,
      windowScrollY: window.scrollY,
      documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      buttonTop: buttonRect.top,
      buttonBottom: buttonRect.bottom,
      buttonHeight: buttonRect.height,
      frameTop: frameRect.top,
      tabsTop: tabs.getBoundingClientRect().top,
    }
  })
  expect(geometry.frameScrollTop).toBe(0)
  expect(geometry.windowScrollY).toBe(0)
  expect(geometry.documentScrollTop).toBe(0)
  expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44)
  expect(geometry.buttonTop).toBeGreaterThanOrEqual(geometry.frameTop)
  expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.tabsTop)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.getByRole('button', { name: /Create task/i }).count()).toBe(1)
  await capture(page, testInfo, 'member-task-create-390.png')

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(form).toBeVisible()
  expect(await page.getByRole('button', { name: /Create task/i }).count()).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, testInfo, 'member-task-create-1440.png')
})
