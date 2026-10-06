import { describe, expect, it } from 'vitest'
import { isCafeCaptureRequestId } from './cafe-capture-storage'

describe('isCafeCaptureRequestId', () => {
  it('accepts canonical UUIDs', () => {
    expect(isCafeCaptureRequestId('40000000-0000-0000-0000-000000000001')).toBe(true)
  })

  it.each([
    '------------------------------------',
    '40000000000000000000000000000001',
    'not-a-uuid',
    null,
  ])('rejects malformed persisted identities (%s)', value => {
    expect(isCafeCaptureRequestId(value)).toBe(false)
  })
})
