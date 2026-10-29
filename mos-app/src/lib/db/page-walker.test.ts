import { describe, expect, it } from 'vitest'
import { readAllPages } from './page-walker'

describe('readAllPages', () => {
  it('returns complete rows beyond twenty thousand across full pages', async () => {
    const allRows = Array.from({ length: 20_501 }, (_, index) => index)
    const ranges: Array<[number, number]> = []

    const rows = await readAllPages<number>('directory', async (from, to) => {
      ranges.push([from, to])
      return { data: allRows.slice(from, to + 1), error: null }
    })

    expect(rows).toEqual(allRows)
    expect(ranges).toHaveLength(21)
    expect(ranges[0]).toEqual([0, 999])
    expect(ranges[ranges.length - 1]).toEqual([20_000, 20_999])
  })

  it('completes after an empty page following a full page', async () => {
    const ranges: Array<[number, number]> = []

    const rows = await readAllPages<number>('directory', async (from, to) => {
      ranges.push([from, to])
      return { data: from === 0 ? Array.from({ length: 1000 }, (_, index) => index) : [], error: null }
    })

    expect(rows).toHaveLength(1000)
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
  })

  it('rejects when a later page fails instead of returning earlier rows', async () => {
    const ranges: Array<[number, number]> = []

    await expect(readAllPages<number>('directory', async (from, to) => {
      ranges.push([from, to])
      return from === 0
        ? { data: Array.from({ length: 1000 }, (_, index) => index), error: null }
        : { data: null, error: { message: 'connection lost' } }
    })).rejects.toThrow('directory failed — connection lost')

    expect(ranges).toEqual([[0, 999], [1000, 1999]])
  })

  it('rejects at a caller-owned row bound with the caller-owned error', async () => {
    class DirectoryLimitError extends Error {}
    const limitError = new DirectoryLimitError('directory exceeded its allowed size')
    const ranges: Array<[number, number]> = []

    await expect(readAllPages<number>('directory', async (from, to) => {
      ranges.push([from, to])
      return { data: Array.from({ length: 1000 }, (_, index) => index), error: null }
    }, { maxRows: 1000, onMaxRowsExceeded: () => limitError })).rejects.toBe(limitError)

    expect(ranges).toEqual([[0, 999]])
  })
})
