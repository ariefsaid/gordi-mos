import { test as base, expect, type Response } from '@playwright/test'
import { localSql } from '../helpers/local-sql'
import { TASKS } from './tasks'

// Capture only IDs returned by this page's successful task inserts. A title, author or
// organization match alone never establishes ownership of a row for cleanup.
export const test = base.extend({
  page: async ({ page }, runTest) => {
    const ids = new Set<string>()
    const pending: Promise<void>[] = []
    const capture = (response: Response) => {
      if (response.request().method() !== 'POST' || !response.ok()
        || !/\/rest\/v1\/tasks(?:\?|$)/.test(response.url())) return
      pending.push((async () => {
        const body: unknown = await response.json()
        for (const row of Array.isArray(body) ? body : [body]) {
          if (row && typeof row.id === 'string' && /^[0-9a-f-]{36}$/.test(row.id)) ids.add(row.id)
        }
      })())
    }
    page.on('response', capture)
    try {
      await runTest(page)
    } finally {
      page.off('response', capture)
      await Promise.all(pending)
      if (ids.size) {
        const owned = [...ids].map((id) => `'${id}'`).join(', ')
        const org = TASKS.VIEWER_ACCOUNTABLE.orgId
        await localSql(`
          DELETE FROM mos.task_events WHERE org_id = '${org}' AND task_id IN (${owned});
          DELETE FROM mos.task_checklist_items WHERE org_id = '${org}' AND task_id IN (${owned});
          DELETE FROM mos.tasks WHERE org_id = '${org}' AND id IN (${owned});
        `)
      }
    }
  },
})

export { expect }
