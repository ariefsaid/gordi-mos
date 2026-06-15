// Reusable task helpers for e2e journeys.
import type { Page } from '@playwright/test'

/**
 * Open the Create Task form from the Tasks list page, fill the required fields,
 * submit, and return the new task's detail URL.
 * Assumes the caller has already navigated to the tasks list (/tasks).
 */
export async function createTaskViaUI(
  page: Page,
  title: string,
): Promise<string> {
  // Click "+ New task" link from the toolbar or empty state
  const newTaskLink = page.getByRole('link', { name: /new task/i })
  await newTaskLink.click()
  await page.waitForURL(/\/tasks\/new$/)

  // The create surface mounts BESIDE the persistent table (split-view, ADR-0007),
  // so scope to the create form — the toolbar has its own BU/search controls.
  const form = page.getByRole('form', { name: /create task form/i })
  await form.getByLabel('Title').fill(title)

  // BU should already be pre-filled (creator's primary-role BU) — verify it's there.
  await form.getByLabel('Business unit').waitFor({ state: 'visible' })

  // Submit
  await form.getByRole('button', { name: /create task/i }).click()

  // Wait for navigation to the new task detail page
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/, { timeout: 15_000 })

  return page.url()
}
