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
})
