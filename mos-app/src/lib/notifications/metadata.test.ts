import { describe, expect, it } from 'vitest'
import { readNotificationEntity } from './metadata'

describe('notification metadata envelope', () => {
  it.each([undefined, null, 0, '', {}, { entity: null }, { entity: 'task' }])('returns no entity for %j', metadata => {
    expect(readNotificationEntity({ metadata })).toBeNull()
  })

  it('returns the raw entity without interpreting its identity or route', () => {
    const entity = { type: 'task', id: 't1', route: '/work/tasks/t1' }
    expect(readNotificationEntity({ metadata: { entity } })).toBe(entity)
    const partial = { route: '/updates' }
    expect(readNotificationEntity({ metadata: { entity: partial } })).toBe(partial)
  })
})
