import { test, expect, type Locator } from '@playwright/test'

async function assertReachable(control: Locator, width: number) {
  const box = await control.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width)
  expect(await control.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return top === element || element.contains(top)
  })).toBe(true)
}

for (const locale of ['en', 'id']) {
  for (const width of [390, 1024, 1440]) {
    for (const presentation of ['table', 'feed']) {
      test(`${locale} ${presentation} controls fit at ${width}px beside a narrowed collection`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`e2e/fixtures/collection-controls.html?locale=${locale}&presentation=${presentation}${width > 390 ? '&deputy' : ''}${presentation === 'table' ? '&door' : ''}`)
        const frame = page.locator('#collection-frame')
        await expect(frame.getByRole('heading')).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        const door = page.locator('.collection-toolbar__desktop-door-trigger')
        const retry = page.getByRole('button', { name: locale === 'id' ? /coba lagi.*tampilan|ulang.*tampilan/i : /retry saved views/i })
        // Use the shared error region's action so the test survives localized recovery wording.
        await assertReachable(frame.locator('.collection-toolbar__saved-error button'), width)
        await frame.locator('.collection-toolbar__saved-error button').click()
        await expect(retry).toHaveCount(0)

        if (await door.count()) await door.click()
        const choices = page.locator('.collection-toolbar__picker-trigger')
        await expect(choices).toHaveCount(5)
        for (const trigger of await choices.all()) {
          const value = trigger.locator('span').first()
          expect(await value.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
        }
        const saveTrigger = page.getByRole('button', { name: locale === 'id' ? /simpan tampilan/i : /save view/i })
        await saveTrigger.click()
        const form = page.locator('.collection-toolbar__save')
        const input = form.getByRole('textbox')
        await expect(input).toBeFocused()
        await input.fill('Example view')
        const frameBox = await frame.boundingBox()
        const formBox = await form.boundingBox()
        expect(formBox!.x).toBeGreaterThanOrEqual(frameBox!.x)
        expect(formBox!.x + formBox!.width).toBeLessThanOrEqual(frameBox!.x + frameBox!.width)
        for (const control of await form.locator('input, button').all()) await assertReachable(control, width)
        await page.keyboard.press('Escape')
        await expect(form).toHaveCount(0)
        await expect(saveTrigger).toBeFocused()

        const columnsTrigger = page.getByRole('button', { name: 'Columns', exact: true })
        await columnsTrigger.click()
        const columns = page.getByRole('group', { name: 'Columns', exact: true })
        await assertReachable(columns, width)
        const columnsBox = await columns.boundingBox()
        expect(columnsBox!.x).toBeGreaterThanOrEqual(frameBox!.x)
        expect(columnsBox!.x + columnsBox!.width).toBeLessThanOrEqual(frameBox!.x + frameBox!.width)
        await columns.getByRole('checkbox', { name: 'Due' }).check()
        await expect(columns.getByRole('checkbox', { name: 'Due' })).toBeChecked()
        await page.keyboard.press('Escape')
        await expect(columnsTrigger).toBeFocused()
      })
    }
  }
}
