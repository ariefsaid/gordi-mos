import { test as base, expect, type Response } from '@playwright/test'
import { localSql } from '../helpers/local-sql'
import { assertFixtureSqlSafe, budgetCleanupSql } from './cleanup'

/** Capture budget ids returned by the capture RPC and clean only those owned budgets. */
export const test = base.extend({
  page: async ({ page }, runTest) => {
    const ids = new Set<string>()
    const pending: Promise<void>[] = []
    const capture = (response: Response) => {
      if (response.request().method() !== 'POST' || !response.ok()
        || !/\/rpc\/capture_budget(?:\?|$)/.test(response.url())) return
      pending.push((async () => {
        const body: unknown = await response.json()
        const id = typeof body === 'string'
          ? body
          : body && typeof body === 'object' && 'id' in body && typeof body.id === 'string'
            ? body.id
            : null
        if (id && /^[0-9a-f-]{36}$/i.test(id)) ids.add(id)
      })())
    }
    page.on('response', capture)
    try {
      await runTest(page)
    } finally {
      page.off('response', capture)
      await Promise.all(pending)
      if (ids.size) {
        const cleanup = budgetCleanupSql([...ids])
        assertFixtureSqlSafe(cleanup)
        await localSql(cleanup)
      }
    }
  },
})

export { expect }
