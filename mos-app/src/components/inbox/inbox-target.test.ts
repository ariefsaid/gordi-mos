import { describe, it, expect } from 'vitest'
import type { NotificationRow } from '@/lib/db/notifications'
import {
  resolveNotificationTarget,
  ALLOWED_TARGET_TYPES,
  type NotificationTargetRef,
  type ResolveTargetDeps,
} from './inbox-target'
import type { OverlayEntryDraft } from './inbox-host-contracts'

// Fixture NotificationRow with a chosen metadata envelope.
function row(metadata: Record<string, unknown>, extra?: Partial<NotificationRow>): NotificationRow {
  return {
    id: 'n1',
    severity: 'info',
    title: 'Title',
    body: 'Body',
    metadata,
    read_at: null,
    created_at: '2026-07-20T00:00:00Z',
    ...extra,
  }
}

// A viewer adapter that builds a canonical OverlayEntry draft for a typed ref. Stands in for the
// Issue 5 RecordViewer adapter; its `pageTo` is the ONLY canonical route authority.
function adapterFor(type: string) {
  return {
    buildEntry(ref: NotificationTargetRef): OverlayEntryDraft {
      return {
        key: `${ref.type}:${ref.id}`,
        owner: 'shell',
        tenant: 'record',
        label: `${type} ${ref.id}`,
        pageTo: `/${type}s/${ref.id}`,
        content: null,
      }
    },
  }
}

// Permissive defaults; individual tests override the one predicate under test (fail-closed proof).
function deps(overrides?: Partial<ResolveTargetDeps>): ResolveTargetDeps {
  return {
    registry: {
      task: adapterFor('task'),
      signal: adapterFor('signal'),
      follow_up: adapterFor('follow_up'),
    },
    canOpen: () => true,
    isSameOrg: () => true,
    recordExists: () => true,
    isFeatureEnabled: () => true,
    ...overrides,
  }
}

describe('resolveNotificationTarget — typed, fail-closed notification doors (FR-V3-008 / J06)', () => {
  it('allow-list is exactly task, signal, follow_up', () => {
    expect([...ALLOWED_TARGET_TYPES].sort()).toEqual(['follow_up', 'signal', 'task'])
  })

  it('resolves a safe Task target to its canonical adapter pageTo and typed entry', () => {
    const res = resolveNotificationTarget(row({ entity: { type: 'task', id: 't1' } }), deps())
    expect(res.status).toBe('available')
    if (res.status !== 'available') throw new Error('unreachable')
    expect(res.ref).toEqual({ type: 'task', id: 't1' })
    expect(res.entry.pageTo).toBe('/tasks/t1')
    expect(res.key).toBe('task:t1')
  })

  it('resolves Signal and Follow-up targets through the registry', () => {
    const sig = resolveNotificationTarget(row({ entity: { type: 'signal', id: 's1' } }), deps())
    const fu = resolveNotificationTarget(row({ entity: { type: 'follow_up', id: 'f1' } }), deps())
    expect(sig.status).toBe('available')
    expect(fu.status).toBe('available')
  })

  it('ignores a producer route entirely: an external/protocol-relative route can never override the typed adapter route', () => {
    const res = resolveNotificationTarget(
      row({ entity: { type: 'task', id: 't1', route: 'https://evil.example/x' } }),
      deps(),
    )
    expect(res.status).toBe('available')
    if (res.status !== 'available') throw new Error('unreachable')
    // Canonical route is the adapter's, never the producer's raw route.
    expect(res.entry.pageTo).toBe('/tasks/t1')
  })

  it('ignores a producer route even when it is app-relative (route is legacy input, never authority)', () => {
    const res = resolveNotificationTarget(
      row({ entity: { type: 'task', id: 't1', route: '/somewhere/else/99' } }),
      deps(),
    )
    expect(res.status).toBe('available')
    if (res.status !== 'available') throw new Error('unreachable')
    expect(res.entry.pageTo).toBe('/tasks/t1')
  })

  it('consumes the new route-free { source, entity:{type,id} } envelope the same way', () => {
    const res = resolveNotificationTarget(
      row({ source: 'signal_mention', entity: { type: 'signal', id: 's9' } }),
      deps(),
    )
    expect(res.status).toBe('available')
    if (res.status !== 'available') throw new Error('unreachable')
    expect(res.entry.pageTo).toBe('/signals/s9')
  })

  it('is unavailable (malformed-target) when there is no entity at all', () => {
    const res = resolveNotificationTarget(row({}), deps())
    expect(res).toMatchObject({ status: 'unavailable', reason: 'malformed-target' })
  })

  it('is unavailable (malformed-target) when the entity has a type but no id', () => {
    const res = resolveNotificationTarget(row({ entity: { type: 'task' } }), deps())
    expect(res).toMatchObject({ status: 'unavailable', reason: 'malformed-target' })
  })

  it('is unavailable (unsafe-legacy-route) for a legacy route-only notification with no typed identity', () => {
    const res = resolveNotificationTarget(row({ entity: { route: '/tasks/t1' } }), deps())
    expect(res).toMatchObject({ status: 'unavailable', reason: 'unsafe-legacy-route' })
  })

  it('is unavailable (unknown-type) for a type outside the allow-list', () => {
    const res = resolveNotificationTarget(row({ entity: { type: 'objective', id: 'o1' } }), deps())
    expect(res).toMatchObject({ status: 'unavailable', reason: 'unknown-type' })
  })

  it('never casts a legacy weekly_update / daily_log comment target to follow_up', () => {
    for (const legacy of ['weekly_update', 'daily_log']) {
      const res = resolveNotificationTarget(row({ entity: { type: legacy, id: 'x' } }), deps())
      expect(res).toMatchObject({ status: 'unavailable', reason: 'unknown-type' })
    }
  })

  it('is unavailable (feature-off) for a follow_up target while the feature is disabled', () => {
    const res = resolveNotificationTarget(
      row({ entity: { type: 'follow_up', id: 'f1' } }),
      deps({ isFeatureEnabled: (type) => type !== 'follow_up' }),
    )
    expect(res).toMatchObject({ status: 'unavailable', reason: 'feature-off' })
  })

  it('is unavailable (cross-org) when the target is not in the viewer org', () => {
    const res = resolveNotificationTarget(
      row({ entity: { type: 'task', id: 't1' } }),
      deps({ isSameOrg: () => false }),
    )
    expect(res).toMatchObject({ status: 'unavailable', reason: 'cross-org' })
  })

  it('is unavailable (missing-record) when the record no longer exists', () => {
    const res = resolveNotificationTarget(
      row({ entity: { type: 'task', id: 't1' } }),
      deps({ recordExists: () => false }),
    )
    expect(res).toMatchObject({ status: 'unavailable', reason: 'missing-record' })
  })

  it('is unavailable (permission-denied) when the viewer may not open the record', () => {
    const res = resolveNotificationTarget(
      row({ entity: { type: 'task', id: 't1' } }),
      deps({ canOpen: () => false }),
    )
    expect(res).toMatchObject({ status: 'unavailable', reason: 'permission-denied' })
  })

  it('never loads a different domain model just because metadata carries arbitrary keys', () => {
    const res = resolveNotificationTarget(
      row({ entity: { type: 'task', id: 't1' }, junk: { hijack: '/signals/s1' } }),
      deps(),
    )
    expect(res.status).toBe('available')
    if (res.status !== 'available') throw new Error('unreachable')
    expect(res.ref).toEqual({ type: 'task', id: 't1' })
  })

  it('every unavailable result carries a localizable messageKey (honest copy, no fabricated fact)', () => {
    const res = resolveNotificationTarget(row({}), deps())
    if (res.status !== 'unavailable') throw new Error('unreachable')
    expect(typeof res.messageKey).toBe('string')
    expect(res.messageKey.length).toBeGreaterThan(0)
  })
})
