import { test as base, expect, type Response } from '@playwright/test'
import { localSql } from '../helpers/local-sql'
import { assertFixtureSqlSafe, userViewCleanupSql } from './cleanup'

/** Capture user-view ids returned by inserts and clean only those owned rows. */
export const test = base.extend({
  page: async ({ page }, runTest) => {
    const ids = new Set<string>()
    const pending: Promise<void>[] = []
    const capture = (response: Response) => {
      if (response.request().method() !== 'POST' || !response.ok()
        || !/\/rest\/v1\/user_views(?:\?|$)/.test(response.url())) return
      pending.push((async () => {
        const body: unknown = await response.json()
        for (const row of Array.isArray(body) ? body : [body]) {
          if (row && typeof row === 'object' && 'id' in row && typeof row.id === 'string'
            && /^[0-9a-f-]{36}$/i.test(row.id)) ids.add(row.id)
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
        const cleanup = userViewCleanupSql([...ids])
        assertFixtureSqlSafe(cleanup)
        await localSql(cleanup)
      }
    }
  },
})

export { expect }
