import { expect, test, type Page } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { TASKS } from './fixtures/tasks'
import { localSql } from './helpers/local-sql'
import { loginViaForm } from './helpers/login'

const orgId = TASKS.VIEWER_ACCOUNTABLE.orgId

async function setWork(page: Page, value: 'on' | 'off') {
  await page.goto('admin/modules')
  const setting = page.getByRole('combobox', { name: 'Work: Org availability' })
  await expect(setting).toBeVisible()
  const label = value === 'on' ? 'On' : 'Off'
  if (await setting.innerText() !== label) {
    await setting.click()
    await page.getByRole('option', { name: label }).click()
    await page.getByRole('button', { name: 'Save module settings' }).click()
    await expect(setting).toHaveText(label)
  }
}

test('an admin switch removes Work from navigation and closes direct routes until re-enabled', async ({ page }) => {
  let signedIn = false
  let settingTouched = false
  let workWasDisabled = false
  try {
    await loginViaForm(page, ADMIN.email, ADMIN.password)
    signedIn = true
    await page.goto('admin/modules')
    await expect(page.getByRole('combobox', { name: 'Work: Org availability' })).toHaveText('On')
    await expect(page.getByRole('link', { name: 'Work', exact: true })).toBeVisible()

    settingTouched = true
    await setWork(page, 'off')
    workWasDisabled = true
    await expect(page.getByRole('link', { name: 'Work', exact: true })).toHaveCount(0)

    await page.goto('work')
    await expect(page.getByRole('heading', { name: 'This module is switched off' })).toBeVisible()

    await setWork(page, 'on')
    workWasDisabled = false
    await expect(page.getByRole('link', { name: 'Work', exact: true })).toBeVisible()
  } finally {
    try {
      if (signedIn && settingTouched && workWasDisabled) await setWork(page, 'on')
    } finally {
      if (settingTouched) await localSql(`DELETE FROM mos.org_module_settings WHERE org_id = '${orgId}' AND module_id = 'work';`)
    }
  }
})
