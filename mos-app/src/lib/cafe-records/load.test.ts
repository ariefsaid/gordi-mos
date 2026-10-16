import { describe, expect, it, vi } from 'vitest'
import type { RecordPage } from '@/lib/db/cafe-records'
import { completeNestedLines, exhaustPages, isAccessDenied, mapLimit, NonAdvancingCursorError, uncoveredRange } from './load'

const pageOf = (rows: string[]): RecordPage<string> => ({ rows, next: rows.length ? [rows.at(-1)!] : null })

describe('exhaustPages', () => {
  it('reads 1001 rows in several pages and stops only on the empty page, not a short one', async () => {
    const all = Array.from({ length: 1001 }, (_, i) => `r${String(1000 - i).padStart(4, '0')}`)
    const reads: Array<readonly string[] | null> = []
    // The server caps pages at 400 even though 500 were asked for: a short page is NOT the end.
    const result = await exhaustPages<string>(async after => {
      reads.push(after)
      const start = after ? all.findIndex(row => row === after[0]) + 1 : 0
      return pageOf(all.slice(start, start + 400))
    })
    expect(result.complete).toBe(true)
    expect(result.rows).toHaveLength(1001)
    expect(reads).toHaveLength(4) // 400 + 400 + 201 + empty
    expect(result.pages).toBe(4)
  })

  it('reads a 51-row scope across the 50-row boundary', async () => {
    const all = Array.from({ length: 51 }, (_, i) => `r${i}`)
    const result = await exhaustPages<string>(async after => {
      const start = after ? all.indexOf(after[0]) + 1 : 0
      return pageOf(all.slice(start, start + 50))
    })
    expect(result.rows).toEqual(all)
    expect(result.complete).toBe(true)
  })

  it('flags a non-advancing cursor as incomplete instead of looping or completing', async () => {
    const result = await exhaustPages<string>(async () => ({ rows: ['same'], next: ['same'] }))
    expect(result.complete).toBe(false)
    expect(result.error).toBeInstanceOf(NonAdvancingCursorError)
  })

  it('keeps the rows it has and reports a failed page as incomplete coverage', async () => {
    let calls = 0
    const result = await exhaustPages<string>(async () => {
      calls += 1
      if (calls === 2) throw new Error('network')
      return { rows: ['a', 'b'], next: ['b'] }
    })
    expect(result.complete).toBe(false)
    expect(result.rows).toEqual(['a', 'b'])
    expect(result.error?.message).toBe('network')
    expect(result.lastCursor).toEqual(['b'])
  })

  it('stops reading when the generation went stale', async () => {
    const read = vi.fn(async () => ({ rows: ['a'], next: ['a'] }))
    let stale = false
    const result = await exhaustPages<string>(async after => { const page = await read(); stale = true; return after ? { rows: [], next: null } : page }, { isStale: () => stale })
    expect(result.complete).toBe(false)
    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('tied cursor keys', () => {
  it('rows sharing a date and timestamp are still returned once each when ordered by the id tiebreak', async () => {
    const rows = ['2026-10-14|t|c', '2026-10-14|t|b', '2026-10-14|t|a'] // same date and timestamp, id descending
    const result = await exhaustPages<string>(async after => {
      const start = after ? rows.findIndex(r => r === after.join('|')) + 1 : 0
      const slice = rows.slice(start, start + 1) // page size 1 forces the boundary through the tie
      return { rows: slice, next: slice.length ? slice.at(-1)!.split('|') : null }
    })
    expect(result.rows).toEqual(rows)
  })
})

describe('completeNestedLines', () => {
  const parent = { id: 'p1', lines: Array.from({ length: 3 }, (_, i) => ({ id: `l${i}` })) }
  it('trusts a parent below the cap and reads nothing more', async () => {
    const read = vi.fn()
    const out = await completeNestedLines([parent], p => p.lines, (p, lines) => ({ ...p, lines }), read, { cap: 5 })
    expect(read).not.toHaveBeenCalled()
    expect(out.incomplete).toEqual([])
  })

  it('verifies a parent AT the cap through the line pager until an empty page and merges by line id', async () => {
    const capped = { id: 'p2', lines: ['l00', 'l01', 'l02'].map(id => ({ id })) }
    const pages: Record<string, { id: string }[]> = {
      '': [{ id: 'l00' }, { id: 'l01' }, { id: 'l02' }],
      l02: [{ id: 'l03' }, { id: 'l04' }],
      l04: [],
    }
    const read = vi.fn(async (_id: string, after: string | null) => pages[after ?? ''] ?? [])
    const out = await completeNestedLines([capped], p => p.lines, (p, lines) => ({ ...p, lines }), read, { cap: 3 })
    expect(out.parents[0].lines.map(l => l.id)).toEqual(['l00', 'l01', 'l02', 'l03', 'l04'])
    expect(out.incomplete).toEqual([])
  })

  it('marks the parent incomplete when its line pager fails', async () => {
    const capped = { id: 'p3', lines: [{ id: 'a' }, { id: 'b' }] }
    const out = await completeNestedLines([capped], p => p.lines, (p, lines) => ({ ...p, lines }), async () => { throw new Error('denied') }, { cap: 2 })
    expect(out.incomplete).toEqual(['p3'])
  })
})

describe('helpers', () => {
  it('mapLimit never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => { running += 1; peak = Math.max(peak, running); await Promise.resolve(); running -= 1 })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('names the dates a failed read did not cover', () => {
    expect(uncoveredRange({ from: '2026-10-01', to: '2026-10-14' }, ['2026-10-09', 't', 'id'], c => c[0])).toEqual({ from: '2026-10-01', to: '2026-10-09' })
    expect(uncoveredRange({ from: '2026-10-01', to: '2026-10-14' }, null, c => c[0])).toEqual({ from: '2026-10-01', to: '2026-10-14' })
  })

  it('recognises a denial, not an empty result', () => {
    expect(isAccessDenied({ code: '42501' })).toBe(true)
    expect(isAccessDenied(new Error('permission denied for table'))).toBe(true)
    expect(isAccessDenied(new Error('network'))).toBe(false)
  })
})
