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

// DIV-G5 / NFR-924 (docs/specs/home-layout-preference.spec.md §7): `count` used to be
// `items.length` with NO reference to `state`. With the tasks read failing, Focused rendered
// `Needs you now 0` on its tabs while the selected region showed the error; a never-resolving
// skeleton read `0` too. A count the viewer cannot trace is worse than no count — the page states a
// falsehood with full confidence. A count exists only when the read behind it SUCCEEDED.
describe('DIV-G5: a region has no count until its read succeeded (never a confident 0)', () => {
  it('needs-you and my-work have NO count while the shared tasks read is loading', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
      taskState: 'loading',
    })
    expect(regions.find((r) => r.id === 'needs-you')!.count).toBeNull()
    expect(regions.find((r) => r.id === 'my-work')!.count).toBeNull()
  })

  it('needs-you and my-work have NO count when the shared tasks read failed', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
      taskState: 'error',
    })
    expect(regions.find((r) => r.id === 'needs-you')!.count).toBeNull()
    expect(regions.find((r) => r.id === 'my-work')!.count).toBeNull()
  })

  it('failed-checks and mentions lose their own count independently of the tasks read', () => {
    const regions = buildHomeRegions({
      overdue: [item('a')], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
      failedChecksState: 'error', mentionsState: 'loading',
    })
    expect(regions.find((r) => r.id === 'failed-checks')!.count).toBeNull()
    expect(regions.find((r) => r.id === 'mentions')!.count).toBeNull()
    // The region whose read DID succeed still states its number.
    expect(regions.find((r) => r.id === 'needs-you')!.count).toBe(1)
  })
})

describe('every region carries a way through (Nielsen #3 — a named remainder must be reachable)', () => {
  // The defect this replaces: only my-work had a `drillTo`, so a needs-you region holding 9 items
  // rendered "5 more" on Overview and offered NO way to reach them from Home at all. The app named
  // something and then refused to show it.
  it('every region has a route to its own full scope', () => {
    const regions = buildHomeRegions({
      overdue: [item('a')], dueToday: [], blocked: [], myWork: [item('b')],
      failedChecks: [item('c')], mentions: [item('d')],
    })
    expect(Object.fromEntries(regions.map((r) => [r.id, r.drillTo?.route]))).toEqual({
      // The one view holding every overdue / due-today / blocked task the region ranks, in due
      // order — no saved view expresses that union on its own.
      'needs-you': '/work/tasks?view=my-work',
      // The café log is where a rejected log is re-entered.
      'failed-checks': '/cafe/log',
      // Inbox is the app's mentions/asks surface.
      mentions: '/inbox',
      'my-work': '/work/tasks?view=my-work',
    })
  })

  it('a region states a full count ONLY where it has an honest one — my-work, from the caller', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [item('a')], failedChecks: [], mentions: [],
      myWorkFullCount: 12,
    })
    expect(regions.find((r) => r.id === 'my-work')!.drillTo).toEqual({
      route: '/work/tasks?view=my-work', count: 12,
    })
    // The other regions have a destination but no full-scope count to advertise, so they must not
    // invent one (DIV-G5 — the same rule as the region counts).
    for (const r of regions) if (r.id !== 'my-work') expect(r.drillTo!.count).toBeUndefined()
  })

  it('my-work keeps its route but states no count when the caller reports none (still loading)', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
    })
    const myWork = regions.find((r) => r.id === 'my-work')!
    expect(myWork.drillTo).toEqual({ route: '/work/tasks?view=my-work' })
  })
})

describe('needs-you carries the Daily Log needs-attention flags (AC-091 propagation, #302)', () => {
  const opsItem = (id: string): StreamItem => ({ id, title: `Flag ${id}`, route: '/ops' })
  const base = { overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [] }

  it('AC-091: open flags LEAD needs-you ahead of the task bands, and the count includes them', () => {
    const regions = buildHomeRegions({
      ...base,
      overdue: [item('a')], dueToday: [item('b')], blocked: [item('c')],
      opsNeedsAttention: [opsItem('o1')],
    })
    const needsYou = regions.find((region) => region.id === 'needs-you')!
    expect(needsYou.items.map((item) => item.id)).toEqual(['o1', 'a', 'b', 'c'])
    expect(needsYou.count).toBe(4)
  })

  it('DIV-G5: needs-you is ready — and counted — only when BOTH its reads (tasks + ops) succeeded', () => {
    const loading = buildHomeRegions({ ...base, opsNeedsAttention: [opsItem('o1')], opsState: 'loading' })
    expect(loading.find((region) => region.id === 'needs-you')!.state).toBe('loading')
    expect(loading.find((region) => region.id === 'needs-you')!.count).toBeNull()

    const errored = buildHomeRegions({ ...base, taskState: 'ready', opsState: 'error' })
    expect(errored.find((region) => region.id === 'needs-you')!.state).toBe('error')

    const both = buildHomeRegions({ ...base, taskState: 'ready', opsState: 'ready' })
    expect(both.find((region) => region.id === 'needs-you')!.state).toBe('ready')
    // my-work reads ONLY the tasks projection — the ops read never leaks into it.
    for (const built of [loading, errored, both]) {
      expect(built.find((region) => region.id === 'my-work')!.state).toBe('ready')
    }
  })

  it('the needs-you retry re-fires BOTH reads; my-work keeps the tasks retry alone', () => {
    const calls: string[] = []
    const regions = buildHomeRegions({
      ...base,
      onRetryTasks: () => calls.push('tasks'),
      onRetryOps: () => calls.push('ops'),
    })
    regions.find((region) => region.id === 'needs-you')!.onRetry!()
    expect(calls).toEqual(['tasks', 'ops'])
    calls.length = 0
    regions.find((region) => region.id === 'my-work')!.onRetry!()
    expect(calls).toEqual(['tasks'])
  })
})
