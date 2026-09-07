import { describe, it, expect } from 'vitest'
import { hasRealEmail } from './sign-in-name'

describe('hasRealEmail — the one fact Profile reads to offer or withhold a self-service password change', () => {
  it('true for a real address', () => {
    expect(hasRealEmail('kartika.dev@example.test')).toBe(true)
  })
  it('false for a synthetic sign-in address, whatever its case', () => {
    expect(hasRealEmail('wulan-warung@ops.gordi.local')).toBe(false)
    expect(hasRealEmail('Wulan-Warung@OPS.GORDI.LOCAL')).toBe(false)
  })
  it('false when there is no address at all', () => {
    expect(hasRealEmail(null)).toBe(false)
    expect(hasRealEmail('')).toBe(false)
  })
})
