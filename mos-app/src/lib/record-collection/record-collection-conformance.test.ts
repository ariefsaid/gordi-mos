import { describe, expect, it, vi } from 'vitest'
import {
  createRecordCollectionController,
  makeInboxTriageDescriptor,
  type InboxTriageOpen,
  type NotificationRow,
} from '@/test/fixtures/v3-record-collection'
import type { CollectionOverlayHost } from './types'
import { checkPresentationCompatibility } from './query-state'
import {
  taskCollectionQuery,
  type TaskCollectionPresentation,
  type TaskCollectionQuery,
} from '@/components/tasks/task-collection-query'

const INBOX_INITIAL = {
  query: { layout: 'queue' as const, view: 'all' as const, sort: 'unread' as const, savedViewId: null },
  presentation: 'queue' as const,
  viewerId: 'p-me',
  accessRoles: ['member'],
}

// Session-stateful fake host: openRoot starts a one-frame session, push stacks; `session` is read
// live so the engine dispatches a first open to openRoot and a consecutive open to push.
function fakeHost(): CollectionOverlayHost & { openRoot: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> } {
  let frames: { entry: unknown }[] = []
  const committed = { status: 'committed' as const }
  return {
    get session() {
      return frames.length
        ? ({ id: 'ovs-fake', mode: 'route', frames } as unknown as CollectionOverlayHost['session'])
        : null
    },
    openRoot: vi.fn(async (entry: unknown) => {
      frames = [{ entry }]
      return committed
    }),
    push: vi.fn(async (entry: unknown) => {
      frames = [...frames, { entry }]
      return committed
    }),
    openPage: vi.fn(async () => committed),
  }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('RecordCollection conformance (test-only Inbox boundary)', () => {
  it('FR-V3-013: Inbox-shaped Triage Queue keeps unread-first, severity, route-to-source-record, selection, and read-only semantics', async () => {
    const routeLog: InboxTriageOpen = { routed: [] }
    const host = fakeHost()
    const descriptor = { ...makeInboxTriageDescriptor(routeLog), host }
    const c = createRecordCollectionController(descriptor, INBOX_INITIAL)
    await flush()

    // Read-only triage (no fake edit/bulk affordance).
    expect(c.state.status).toBe('read-only')
    expect(c.state.access.mode).toBe('read-only')

    // Unread-first ordering by default.
    const ids = c.state.projection?.visibleRecords.map((r) => r.id)
    expect(ids?.[0]).toBe('n-2') // unread + high
    expect(ids?.indexOf('n-1')).toBeGreaterThan(0) // read row sinks below unread rows

    // Severity sort changes the order deterministically.
    c.setQuery({ ...c.state.query, sort: 'severity' })
    await flush()
    const bySeverity = c.state.projection?.visibleRecords.map((r) => r.severity)
    expect(bySeverity?.[0]).toBe('high')

    // Selection is live.
    c.toggleSelected('n-3')
    expect(c.state.selectedIds.has('n-3')).toBe(true)

    // Opening routes to the source record through the SAME shared host — never a second host.
    const first: NotificationRow = c.state.projection!.visibleRecords[0]
    c.openRecord(first, {
      collectionId: 'inbox',
      presentation: 'queue',
      pathname: '/inbox',
      search: '',
      query: c.state.query,
    })
    await flush()
    expect(host.openRoot).toHaveBeenCalledTimes(1)
    expect(routeLog.routed).toHaveLength(1)
    expect(routeLog.routed[0]).toHaveProperty('type')
  })

  it('FR-V3-007: a NotificationRow query is rejected by the Task descriptor at compile time', () => {
    const inboxQuery = { layout: 'queue', view: 'all', sort: 'unread', savedViewId: null }
    // @ts-expect-error — an Inbox triage query is NOT a TaskCollectionQuery; the compiler proves the
    // adapter boundary is typed, not a universal Record<string, unknown>.
    const rejected: TaskCollectionQuery = inboxQuery
    expect(rejected).toBeDefined()
  })

  it('FR-V3-007: a Signal category query is rejected by the Task presentation compatibility guard', () => {
    // The Task query grammar has no Signal `category` key at all — it cannot cross the boundary.
    expect('category' in taskCollectionQuery.neutral).toBe(false)
    expect(taskCollectionQuery.keys).not.toContain('category' as never)

    // Actually run the Task guard on a query bearing a Signal `category` alongside a populated Task
    // `groupBy` that the target presentation drops. The switch is REJECTED, and the alien Signal
    // `category` is structurally invisible to the Task guard: it is neither honored nor surfaced as
    // an issue — it cannot cross the boundary even to be evaluated as a Task key.
    const rogue = {
      ...taskCollectionQuery.neutral,
      groupBy: 'occurrence',
      category: 'Ops',
    } as unknown as TaskCollectionQuery
    const result = checkPresentationCompatibility<TaskCollectionQuery, TaskCollectionPresentation>({
      query: rogue,
      schema: taskCollectionQuery,
      from: 'table',
      to: 'card',
      compatibleQueryKeys: {
        table: taskCollectionQuery.keys,
        card: taskCollectionQuery.keys.filter((k) => k !== 'groupBy'),
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.key === 'groupBy')).toBe(true)
      // The Signal key never appears as a recognized/rejected Task key.
      expect(result.issues.some((i) => i.key === 'category')).toBe(false)
    }
  })

  it('NFR-V3-007: no universal record row or arbitrary JSON query crosses the adapter boundary', () => {
    // The Inbox descriptor is typed over NotificationRow, not Record<string, unknown>.
    const routeLog: InboxTriageOpen = { routed: [] }
    const descriptor = makeInboxTriageDescriptor(routeLog)
    const sample: NotificationRow = { id: 'n-x', title: 't', body: 'b', severity: 'low', unread: true, source: { type: 'task', id: 't-9' } }
    expect(descriptor.getId(sample)).toBe('n-x')
    // A Task query key set and a Signal-shaped key are disjoint from the Inbox key set.
    expect(descriptor.query.keys).toEqual(['layout', 'view', 'sort', 'savedViewId'])
    expect(descriptor.query.keys).not.toContain('picId' as never)
    expect(descriptor.query.keys).not.toContain('attention' as never)
  })

  it('NFR-V3-009: Issue 6 does not modify Inbox production paths or mount a second host', async () => {
    // The Inbox-shaped proof runs entirely on the SHARED engine via a test-only fixture descriptor;
    // it never imports InboxPage/InboxList/useNotifications and mounts no second physical host.
    const routeLog: InboxTriageOpen = { routed: [] }
    const host = fakeHost()
    const c = createRecordCollectionController({ ...makeInboxTriageDescriptor(routeLog), host }, INBOX_INITIAL)
    await flush()
    const rows = c.state.projection!.visibleRecords
    // Open two consecutive records — push, not a second host.
    c.openRecord(rows[0], { collectionId: 'inbox', presentation: 'queue', pathname: '/inbox', search: '', query: c.state.query })
    await flush()
    c.openRecord(rows[1], { collectionId: 'inbox', presentation: 'queue', pathname: '/inbox', search: '', query: c.state.query })
    await flush()
    expect(host.openRoot).toHaveBeenCalledTimes(1)
    expect(host.push).toHaveBeenCalledTimes(1)
  })
})
