import { describe, it, expect } from 'vitest'
import { notificationRoute, type NotificationRow } from './notifications'

function withRoute(route: unknown): NotificationRow {
  return {
    id: 'n',
    severity: 'info',
    title: 't',
    body: null,
    metadata: { entity: { type: 'task', id: 't1', route } as never },
    read_at: null,
    created_at: '2026-07-05T00:00:00Z',
  }
}

describe('notificationRoute — app-relative guard (security Low-2)', () => {
  it('returns a valid app-relative route', () => {
    expect(notificationRoute(withRoute('/tasks/t1'))).toBe('/tasks/t1')
  })

  it('returns null when there is no route', () => {
    expect(notificationRoute({ ...withRoute('/x'), metadata: {} })).toBeNull()
  })

  const unsafe: unknown[] = ['//evil.com', 'javascript:alert(1)', 'http://evil.com', 'tasks/t1', 123]
  it.each(unsafe)('rejects an unsafe route (%s)', (route) => {
    expect(notificationRoute(withRoute(route))).toBeNull()
  })
})
