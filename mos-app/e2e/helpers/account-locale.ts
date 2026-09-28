import type { Page } from '@playwright/test'

const PREFERENCES = '**/rest/v1/person_preferences*'

/** Renders the signed-in persona in `locale` without saving anything: the app reads the account's
 *  language from shared.person_preferences, so this answers that read for this page only. Install
 *  before sign-in; a later call replaces the earlier answer. account-language.spec.ts owns the real save-and-load journey. */
export async function stubAccountLocale(page: Page, locale: 'en' | 'id') {
  await page.unroute(PREFERENCES)
  await page.route(PREFERENCES, (route) => (
    route.request().method() === 'GET' ? route.fulfill({ json: [{ locale }] }) : route.continue()
  ))
}
