import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publishReadScope } from '@/lib/scoped-reads'
import { withReferenceCache, invalidateReferenceCache, __resetReferenceCacheForTests } from './reference-cache'

const SCOPE = Object.freeze({ generation: 3, authUserId: 'auth-1', viewerId: 'v-1', orgId: 'org-1', authorityKey: 'member' })

beforeEach(() => { __resetReferenceCacheForTests(); publishReadScope({ ...SCOPE }) })
afterEach(() => publishReadScope(null))

describe('reference data is stale-while-revalidate, invalidated on admin writes (#1359)', () => {
  it('serves the cached copy within the TTL and refreshes past it', async () => {
    vi.useFakeTimers()
    let n = 0
    const load = vi.fn(async () => ++n)
    expect(await withReferenceCache('x', load)).toBe(1)
    expect(await withReferenceCache('x', load)).toBe(1)   // fresh — no second load
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(61_000)
    expect(await withReferenceCache('x', load)).toBe(1)   // stale served at once…
    expect(await withReferenceCache('x', load)).toBe(2)   // …while the refresh lands for the next caller
    expect(load).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('never serves another viewer\'s rows — the scope is part of the key', async () => {
    let n = 0
    const load = vi.fn(async () => ++n)
    await withReferenceCache('x', load)
    publishReadScope({ ...SCOPE, generation: SCOPE.generation + 1 })
    expect(await withReferenceCache('x', load)).toBe(2)   // new scope → fresh load, not viewer 1's copy
  })

  it('invalidateReferenceCache(prefix) drops only that prefix', async () => {
    let n = 0
    const load = vi.fn(async () => ++n)
    await withReferenceCache('mos.objectives.active', load)
    await withReferenceCache('mos.work_lines.active', load)
    invalidateReferenceCache('mos.objectives')
    await withReferenceCache('mos.objectives.active', load)
    await withReferenceCache('mos.work_lines.active', load)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('does not let a pre-invalidation request overwrite fresh data', async () => {
    let resolveOld: (value: string) => void = () => {}
    const oldRequest = new Promise<string>((resolve) => { resolveOld = resolve })
    const oldRead = withReferenceCache('mos.objectives.active', () => oldRequest)
    invalidateReferenceCache('mos.objectives')

    const freshLoad = vi.fn(async () => 'fresh')
    await expect(withReferenceCache('mos.objectives.active', freshLoad)).resolves.toBe('fresh')
    resolveOld('stale')
    await expect(oldRead).resolves.toBe('stale')
    await expect(withReferenceCache('mos.objectives.active', freshLoad)).resolves.toBe('fresh')
    expect(freshLoad).toHaveBeenCalledTimes(1)
  })

  it('bypasses the cache without a published scope', async () => {
    publishReadScope(null)
    let n = 0
    const load = vi.fn(async () => ++n)
    expect(await withReferenceCache('x', load)).toBe(1)
    expect(await withReferenceCache('x', load)).toBe(2)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('discards scoped reference data when the viewer scope disappears', async () => {
    let n = 0
    const load = vi.fn(async () => ++n)
    await withReferenceCache('shared.people.active', load)
    publishReadScope(null)
    await withReferenceCache('shared.people.active', load)
    publishReadScope({ ...SCOPE, generation: SCOPE.generation + 1 })
    await withReferenceCache('shared.people.active', load)
    expect(load).toHaveBeenCalledTimes(3)
  })
})