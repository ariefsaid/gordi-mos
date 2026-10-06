import { describe, expect, it } from 'vitest'
import { createBuildIdentity } from './build-identity'

describe('public build identity', () => {
  it('contains only the release SHA and build time', () => {
    const identity = createBuildIdentity('a'.repeat(40), new Date('2026-10-06T12:00:00.000Z'))

    expect(identity).toEqual({
      sha: 'a'.repeat(40),
      builtAt: '2026-10-06T12:00:00.000Z',
    })
    expect(Object.keys(identity)).toEqual(['sha', 'builtAt'])
  })
})
