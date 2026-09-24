// #927 — the interface language belongs to the signed-in account: it follows the person to another
// device, never leaks to the next person on the same browser, and the sign-in screen between them
// is in the product default.
import { test, expect, type Page } from '@playwright/test'
import { ADMIN, BAR_SUPERVISOR } from './fixtures/users'
import { loginViaForm } from './helpers/login'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { personPreferenceCleanupSql } from './fixtures/cleanup'
import { TASKS } from './fixtures/tasks'

const A = ADMIN
const B = BAR_SUPERVISOR
const PEOPLE = [A.personId, B.personId]

let before: { person_id: string; locale: string }[] = []

async function restore(rows: { person_id: string; locale: string }[]) {
  await localSql(personPreferenceCleanupSql(PEOPLE))
  for (const row of rows) {
    await localSql(`INSERT INTO shared.person_preferences (person_id, org_id, locale)
      SELECT id, org_id, '${row.locale === 'id' ? 'id' : 'en'}' FROM shared.people WHERE id = '${row.person_id}'`)
  }
}

test.beforeAll(async () => {
  before = await localSqlRead(`SELECT person_id::text, locale FROM shared.person_preferences
    WHERE person_id IN ('${A.personId}', '${B.personId}')`)
  await restore([]) // both accounts start with no saved choice
})

test.afterAll(async () => {
  await restore(before)
})

async function signOut(page: Page, fullName: string) {
  await page.getByRole('button', { name: fullName, exact: true }).click()
  await page.getByRole('menuitem', { name: /^(sign out|keluar)$/i }).click()
  await expect(page).toHaveURL(/\/login/)
}

async function openProfile(page: Page, heading: 'Personal Profile' | 'Profil Pribadi') {
  await page.goto('profile')
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

test('issue 927: language follows the account across sign-outs and devices, never the browser', async ({ page, browser }, testInfo) => {
  // A chooses Indonesian on this browser.
  await loginViaForm(page, A.email, A.password)
  await openProfile(page, 'Personal Profile')
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Bahasa Indonesia' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Profil Pribadi' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'id')

  // Signed out, the sign-in screen is entirely in the product default — footer included.
  await signOut(page, A.displayName)
  await expect(page.getByText('Trouble signing in? Contact your admin.')).toBeVisible()
  await expect(page.getByText(/Hubungi admin/)).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  // B on the same browser gets B's own value (none saved → English), not A's.
  await loginViaForm(page, B.email, B.password)
  await openProfile(page, 'Personal Profile')
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveText(/English/)

  // A back on the same browser: Indonesian again, from the account.
  await signOut(page, B.displayName)
  await loginViaForm(page, A.email, A.password)
  await openProfile(page, 'Profil Pribadi')

  // A on a second device (a fresh browser context, no shared storage): still Indonesian.
  const device = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  try {
    const second = await device.newPage()
    await loginViaForm(second, A.email, A.password)
    await openProfile(second, 'Profil Pribadi')
    await expect(second.locator('html')).toHaveAttribute('lang', 'id')
  } finally {
    await device.close()
  }
})

// The form already on screen, not loginViaForm: that helper reloads /login, which is not what the
// next person at a shared browser does.
async function signInHere(page: Page, user: { email: string; password: string }) {
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test('a return route belongs to the session that parked it', async ({ page }) => {
  const taskPath = `work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}`

  // A signs out while on a Task; B signs in on the same browser and lands on B's own Home.
  await loginViaForm(page, A.email, A.password)
  await page.goto(taskPath)
  await expect(page).toHaveURL(new RegExp(TASKS.VIEWER_ACCOUNTABLE.id))
  await signOut(page, A.displayName)
  await signInHere(page, B)
  await expect(page).toHaveURL(/\/mos\/?$/)

  // A signed-out visitor who opens a deep link still arrives there after signing in.
  await signOut(page, B.displayName)
  await page.goto(taskPath)
  await expect(page).toHaveURL(/\/login/)
  await signInHere(page, A)
  await expect(page).toHaveURL(new RegExp(TASKS.VIEWER_ACCOUNTABLE.id))
})
