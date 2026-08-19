// Reusable task helpers for e2e journeys.
import { expect, type Page } from '@playwright/test'

/**
 * Open the Create Task form from the Tasks list page, fill the required fields,
 * submit, and return the new task's detail URL.
 * Assumes the caller has already navigated to the tasks list (/tasks).
 */
export async function createTaskViaUI(
  page: Page,
  title: string,
): Promise<string> {
  // Click "+ Create task" from the toolbar or empty state. The label is `tasks.new`, which reads
  // "+ Create task" — not "+ New task". This ONE stale locator blocked five specs at once
  // (tasks-record-close ×2, tasks-browser-back-dirty-veto ×2, guards.geometry GUARD-R1) because
  // they all create their fixture task through this helper, so every assertion after it was
  // unreachable and had never been evaluated.
  const newTaskLink = page.getByRole('link', { name: /create task/i })
  await newTaskLink.click()
  await page.waitForURL(/\/tasks\/new$/)

  // The create surface mounts BESIDE the persistent table (split-view, ADR-0007),
  // so scope to the create form — the toolbar has its own BU/search controls.
  const form = page.getByRole('form', { name: /create task form/i })
  await form.getByLabel('Title').fill(title)

  // OD-REDESIGN-3/14/41: Team and PIC prefill; Supervisor is an explicit required choice.
  await expect(form.getByLabel('Team')).not.toHaveValue('')
  await expect(form.getByLabel(/^pic$/i)).not.toHaveValue('')
  await form.getByLabel('Supervisor', { exact: true }).selectOption({ label: 'Dewi Director' })

  // GAP-6 / OD-REDESIGN-91 #11: creation returns to the originating collection with a highlight.
  await form.getByRole('button', { name: /create task/i }).click()
  await page.waitForURL(/\/work\/tasks\?.*highlight=[0-9a-f-]{36}$/, { timeout: 15_000 })
  const newId = page.url().match(/highlight=([0-9a-f-]{36})/)?.[1] ?? ''
  await expect(page.locator('tr.task-row', { hasText: title }).first()).toBeVisible({ timeout: 10_000 })
  if (!newId) throw new Error('[createTaskViaUI] could not read the new task id from ?highlight=')
  return `/work/tasks/${newId}`
}
