import { test as base, expect, type Response } from '@playwright/test'
import { localSql } from '../helpers/local-sql'
import { assertFixtureSqlSafe, signalCleanupSql } from './cleanup'

/** Capture Signal ids returned by the create-signal RPC and remove only those rows after a test. */
export const test = base.extend({
  page: async ({ page }, runTest) => {
    const ids = new Set<string>()
    const pending: Promise<void>[] = []
    const capture = (response: Response) => {
      if (response.request().method() !== 'POST' || !response.ok()
        || !/\/rpc\/create_signal_with_mentions(?:\?|$)/.test(response.url())) return
      pending.push((async () => {
        const body: unknown = await response.json()
        const collect = (value: unknown): void => {
          if (typeof value === 'string') {
            if (/^[0-9a-f-]{36}$/i.test(value)) ids.add(value)
            return
          }
          if (Array.isArray(value)) {
            value.forEach(collect)
            return
          }
          if (value && typeof value === 'object') {
            Object.values(value).forEach(collect)
          }
        }
        collect(body)
      })())
    }
    page.on('response', capture)
    try {
      await runTest(page)
    } finally {
      page.off('response', capture)
      await Promise.all(pending)
      if (ids.size) {
        const cleanup = signalCleanupSql([...ids])
        assertFixtureSqlSafe(cleanup)
        await localSql(cleanup)
      }
    }
  },
})

export { expect }
