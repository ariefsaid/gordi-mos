import { describe, expect, it } from 'vitest'
import { createBuildIdentity } from './build-identity'

describe('public build identity', () => {
  it('contains the app version, release SHA, and build time', () => {
    const identity = createBuildIdentity('0.11.0', 'a'.repeat(40), new Date('2026-10-06T12:00:00.000Z'))

    expect(identity).toEqual({
      version: '0.11.0',
      sha: 'a'.repeat(40),
      builtAt: '2026-10-06T12:00:00.000Z',
    })
    expect(Object.keys(identity)).toEqual(['version', 'sha', 'builtAt'])
  })
})
