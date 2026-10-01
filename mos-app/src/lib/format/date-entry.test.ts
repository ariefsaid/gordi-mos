import { describe, expect, it } from 'vitest'
import { isRealDate, maskDayFirst, parseDayFirst, toDayFirst } from './date-entry'

describe('parseDayFirst', () => {
  it.each([
    ['05/10/2026', '2026-10-05'],
    ['5/10/2026', '2026-10-05'],
    ['5/1/2026', '2026-01-05'],
    ['05-10-2026', '2026-10-05'],
    ['05.10.2026', '2026-10-05'],
    ['05 10 2026', '2026-10-05'],
    ['05102026', '2026-10-05'],
    ['2026-10-05', '2026-10-05'],
    ['  29/02/2028 ', '2028-02-29'],
  ])('reads %s as day-first: %s', (text, iso) => {
    expect(parseDayFirst(text)).toEqual({ kind: 'ok', iso })
  })

  it('never reads the numbers month-first', () => {
    expect(parseDayFirst('10/05/2026')).toEqual({ kind: 'ok', iso: '2026-05-10' })
    expect(parseDayFirst('10/25/2026')).toEqual({ kind: 'impossible' })
  })

  it.each(['31/02/2026', '29/02/2027', '00/10/2026', '05/00/2026', '05/13/2026', '32/01/2026', '05/10/1800', '05/10/2101'])(
    'rejects %s as impossible instead of shifting it',
    (text) => expect(parseDayFirst(text)).toEqual({ kind: 'impossible' }),
  )

  it.each(['05/10', '05/10/26', '05/10/202', '5', 'abc', '05/10/2026/1', '2026-10', '05/1O/2026'])(
    'rejects %s as unfinished or malformed',
    (text) => expect(parseDayFirst(text)).toEqual({ kind: 'format' }),
  )

  it('treats blank text as empty', () => {
    expect(parseDayFirst('')).toEqual({ kind: 'empty' })
    expect(parseDayFirst('   ')).toEqual({ kind: 'empty' })
  })
})

describe('isRealDate', () => {
  it('knows leap years and month lengths', () => {
    expect(isRealDate(2028, 2, 29)).toBe(true)
    expect(isRealDate(2027, 2, 29)).toBe(false)
    expect(isRealDate(2026, 4, 31)).toBe(false)
    expect(isRealDate(2026, 12, 31)).toBe(true)
  })
})

describe('toDayFirst / maskDayFirst', () => {
  it('writes ISO as dd/mm/yyyy and leaves non-ISO text alone', () => {
    expect(toDayFirst('2026-10-05')).toBe('05/10/2026')
    expect(toDayFirst('')).toBe('')
  })

  it('inserts the separators as digits arrive', () => {
    expect(maskDayFirst('05')).toBe('05')
    expect(maskDayFirst('051')).toBe('05/1')
    expect(maskDayFirst('05/102')).toBe('05/10/2')
    expect(maskDayFirst('5/102')).toBe('5/10/2')
    expect(maskDayFirst('05102026')).toBe('05/10/2026')
  })

  it('does not touch a pasted yyyy-mm-dd or other separators', () => {
    expect(maskDayFirst('2026-10-05')).toBe('2026-10-05')
    expect(maskDayFirst('05-10-2026')).toBe('05-10-2026')
  })
})
