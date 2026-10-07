import { afterEach, describe, expect, it, vi } from 'vitest'
import { signalOccurredAtIsoFromWib, wibPartsFromInstant } from './signal-occurred-at'

describe('Signal occurrence time in WIB', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['UTC', 'Asia/Jakarta', 'America/Los_Angeles'])(
    'shows an existing instant as the same WIB wall time when the device zone is %s',
    (deviceZone) => {
      vi.stubEnv('TZ', deviceZone)

      expect(wibPartsFromInstant('2026-10-05T03:15:00.000Z')).toEqual({
        date: '2026-10-05',
        time: '10:15',
      })
    },
  )

  it('converts the literal 10:15 WIB entry to its known UTC instant', () => {
    expect(signalOccurredAtIsoFromWib('2026-10-05', '10:15')).toBe('2026-10-05T03:15:00.000Z')
  })

  it.each([
    ['2026-10-06', '00:00', '2026-10-05T17:00:00.000Z'],
    ['2026-10-05', '00:15', '2026-10-04T17:15:00.000Z'],
  ])('converts %s %s WIB to its UTC instant', (date, time, expected) => {
    expect(signalOccurredAtIsoFromWib(date, time)).toBe(expected)
  })

  it.each([
    ['', '10:15'],
    ['2026-10-05', ''],
    ['2026-02-30', '10:15'],
    ['2026-10-05', '24:00'],
    ['2026-10-05', '9:15'],
  ])('rejects an invalid or incomplete WIB time (%s, %s)', (date, time) => {
    expect(signalOccurredAtIsoFromWib(date, time)).toBeNull()
  })

  it('rejects an invalid prefilled instant', () => {
    expect(wibPartsFromInstant('not a timestamp')).toBeNull()
  })
})
