// Reusable task helpers for e2e journeys.
import type { Page } from '@playwright/test'

/**
 * Open the Create Task form from the Tasks list page, fill the required fields,
 * submit, and return the new task's detail URL.
 * Assumes the caller has already navigated to the tasks list (/work/tasks).
 */
export async function createTaskViaUI(
  page: Page,
  title: string,
): Promise<string> {
  // Click the create-task link from the toolbar or empty state.
  // OD-REDESIGN-71(i): the verb family is "Create" app-wide (was "+ New task").
  const newTaskLink = page.getByRole('link', { name: /create task/i }).first()
  await newTaskLink.click()
  await page.waitForURL(/\/work\/tasks\/new(\?.*)?$/)

  const form = page.getByRole('form', { name: /create task form/i })
  await form.getByLabel('Title').fill(title)

  // Team (the create-form's BU field) should already be pre-filled (creator's
  // primary-role BU) — verify it's there. (OD-62: the field is labeled 'Team'.)
  await form.getByLabel('Team').waitFor({ state: 'visible' })

  // Submit
  await form.getByRole('button', { name: /create task/i }).click()

  // Wait for navigation to the new task detail page
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}(\?.*)?$/, { timeout: 15_000 })

  return page.url()
}
