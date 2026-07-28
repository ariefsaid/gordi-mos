import { describe, it, expect } from 'vitest'
import { buildHomeRegions } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string): StreamItem => ({
  id, title: `Task ${id}`, route: `/work/tasks/${id}`,
})

describe('buildHomeRegions (FR-929, FR-930)', () => {
  it('returns every region even when empty, each with its count', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
    })
    expect(regions.map((r) => r.id)).toEqual(['needs-you', 'failed-checks', 'mentions', 'my-work'])
    expect(regions.every((r) => r.count === 0)).toBe(true)
  })

  it('needs-you merges overdue, due-today and blocked', () => {
    const regions = buildHomeRegions({
      overdue: [item('a')], dueToday: [item('b')], blocked: [item('c')],
      myWork: [], failedChecks: [], mentions: [],
    })
    const needsYou = regions.find((r) => r.id === 'needs-you')!
    expect(needsYou.count).toBe(3)
  })

  it('defaults every region to "ready" state with no retry when the caller reports no async state', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
    })
    expect(regions.every((r) => r.state === 'ready')).toBe(true)
    expect(regions.every((r) => r.onRetry === undefined)).toBe(true)
  })
})

describe('buildHomeRegions carries per-region async state (DIV-G5) — a failed or still-loading read', () => {
  it('needs-you AND my-work share the tasks projection state + retry (they read the same fetch)', () => {
    const retryTasks = () => {}
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
      taskState: 'error', onRetryTasks: retryTasks,
    })
    const needsYou = regions.find((r) => r.id === 'needs-you')!
    const myWork = regions.find((r) => r.id === 'my-work')!
    expect(needsYou.state).toBe('error')
    expect(needsYou.onRetry).toBe(retryTasks)
    expect(myWork.state).toBe('error')
    expect(myWork.onRetry).toBe(retryTasks)
  })

  it('failed-checks and mentions carry their OWN independent state + retry', () => {
    const retryFailedChecks = () => {}
    const retryMentions = () => {}
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
      failedChecksState: 'loading', onRetryFailedChecks: retryFailedChecks,
      mentionsState: 'error', onRetryMentions: retryMentions,
    })
    const failedChecks = regions.find((r) => r.id === 'failed-checks')!
    const mentions = regions.find((r) => r.id === 'mentions')!
    expect(failedChecks.state).toBe('loading')
    expect(failedChecks.onRetry).toBe(retryFailedChecks)
    expect(mentions.state).toBe('error')
    expect(mentions.onRetry).toBe(retryMentions)
    // Independent bands never inherit the shared tasks state.
    const needsYou = regions.find((r) => r.id === 'needs-you')!
    expect(needsYou.state).toBe('ready')
  })
})

describe('buildHomeRegions carries the my-work drill link (restored "My open tasks · N" affordance)', () => {
  it('my-work gets a drillTo carrying the FULL open-task count when the caller reports one', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [item('a')], failedChecks: [], mentions: [],
      myWorkFullCount: 12,
    })
    const myWork = regions.find((r) => r.id === 'my-work')!
    expect(myWork.drillTo).toEqual({ route: '/work/tasks?view=my-work', count: 12 })
    // No other region gets a drill link — it is my-work's own full-scope destination.
    for (const r of regions) if (r.id !== 'my-work') expect(r.drillTo).toBeUndefined()
  })

  it('my-work has no drillTo when the caller reports no full count (e.g. still loading)', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
    })
    const myWork = regions.find((r) => r.id === 'my-work')!
    expect(myWork.drillTo).toBeUndefined()
  })
})
