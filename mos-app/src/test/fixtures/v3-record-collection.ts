// TEST-ONLY fixtures for the V3 RecordCollection engine (Issue 6). Nothing here is imported by
// production code. It proves the generic engine can host a future Inbox Triage Queue (Issue 7)
// WITHOUT changing InboxPage, InboxList, useNotifications, or the bell — using a local typed
// NotificationRow descriptor, never a universal record or arbitrary JSON query.
import { createRecordCollectionController } from '@/lib/record-collection/engine'
import type {
  CollectionData,
  CollectionProjection,
  CollectionQueryParse,
  CollectionQuerySchema,
  RecordCollectionDescriptor,
} from '@/lib/record-collection/types'

// --- Test-only Inbox Triage Queue conformance descriptor -----------------------------------------

type InboxSeverity = 'low' | 'medium' | 'high'

/** Inbox's distinct row — unread state, severity, notification title/body, route-to-source-record. */
export interface NotificationRow {
  id: string
  title: string
  body: string
  severity: InboxSeverity
  unread: boolean
  source: { type: 'task' | 'signal'; id: string }
}

export interface InboxTriageQuery {
  layout: 'queue'
  view: 'all' | 'unread'
  sort: 'unread' | 'severity'
  savedViewId: string | null
}

export type InboxTriagePresentation = 'queue'
export type InboxTriageGroup = { key: string; rows: readonly NotificationRow[] }
export type InboxTriageContext = { viewerId: string | null }

const INBOX_NEUTRAL: InboxTriageQuery = { layout: 'queue', view: 'all', sort: 'unread', savedViewId: null }

const SEVERITY_WEIGHT: Record<InboxSeverity, number> = { high: 3, medium: 2, low: 1 }

const NOTIFICATION_FIXTURES: readonly NotificationRow[] = [
  { id: 'n-1', title: 'Task overdue', body: 'Fix the coffee machine is overdue', severity: 'high', unread: false, source: { type: 'task', id: 't-1' } },
  { id: 'n-2', title: 'Urgent signal', body: 'Walk-in freezer reading 8°C', severity: 'high', unread: true, source: { type: 'signal', id: 's-1' } },
  { id: 'n-3', title: 'Mentioned you', body: 'Sari mentioned you', severity: 'low', unread: true, source: { type: 'signal', id: 's-2' } },
]

const inboxQuerySchema: CollectionQuerySchema<InboxTriageQuery> = {
  keys: ['layout', 'view', 'sort', 'savedViewId'],
  neutral: INBOX_NEUTRAL,
  parse: (params): CollectionQueryParse<InboxTriageQuery> => {
    const query: InboxTriageQuery = { ...INBOX_NEUTRAL }
    const view = params.get('view')
    if (view === 'unread' || view === 'all') query.view = view
    const sort = params.get('sort')
    if (sort === 'severity' || sort === 'unread') query.sort = sort
    return { ok: true, query }
  },
  serialize: (query) => {
    const p = new URLSearchParams()
    p.set('layout', 'queue')
    if (query.view !== 'all') p.set('view', query.view)
    if (query.sort !== 'unread') p.set('sort', query.sort)
    return p
  },
  normalize: (query) => query,
}

export interface InboxTriageOpen {
  routed: { type: 'task' | 'signal'; id: string }[]
}

/** Build a read-only Inbox Triage descriptor over the SAME engine, routing to the source record. */
export function makeInboxTriageDescriptor(routeLog: InboxTriageOpen): RecordCollectionDescriptor<
  NotificationRow,
  string,
  InboxTriageQuery,
  InboxTriageContext,
  InboxTriageGroup,
  never,
  InboxTriagePresentation
> {
  return {
    id: 'inbox',
    defaultPresentation: 'queue',
    query: inboxQuerySchema,
    savedViews: {
      enabled: true,
      store: { list: async () => [], get: async () => null, create: async () => { throw new Error('n/a') }, rename: async () => {}, archive: async () => {} },
      operations: [],
      buildSpec: () => { throw new Error('inbox has no persisted views in this fixture') },
      parseAndValidate: () => ({ ok: false, issues: [] }),
      applySpec: () => { throw new Error('n/a') },
    },
    presentations: {
      queue: {
        id: 'queue',
        label: 'Triage',
        compatibleQueryKeys: ['layout', 'view', 'sort', 'savedViewId'],
        capabilities: {
          search: false,
          filterKeys: ['view'],
          sortKeys: ['sort'],
          groupKeys: [],
          savedViews: false,
          selection: true,
          recordOpening: true,
          bulkActions: [],
        },
        render: () => null,
      },
    },
    load: async () => ({ records: NOTIFICATION_FIXTURES, context: { viewerId: 'p-me' } }) as CollectionData<NotificationRow, InboxTriageContext>,
    project: (data, query): CollectionProjection<NotificationRow, InboxTriageGroup> => {
      const rows = [...data.records]
      rows.sort((a, b) => {
        if (query.sort === 'severity') {
          const s = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
          if (s !== 0) return s
        }
        // Unread-first is the default ordering (and the tiebreak under severity sort).
        return Number(b.unread) - Number(a.unread)
      })
      const visible = query.view === 'unread' ? rows.filter((r) => r.unread) : rows
      return {
        visibleRecords: visible,
        groups: [{ key: 'all', rows: visible }],
        totalRecords: data.records.length,
        visibleRecordsAreFiltered: visible.length !== data.records.length,
      }
    },
    getId: (r) => r.id,
    // Inbox triage is read-only: no edit or bulk mutation affordance.
    getAccess: () => ({ mode: 'read-only', visibleActions: [] }),
    viewer: {
      recordType: 'notification',
      buildPanelEntry: (record) => {
        routeLog.routed.push(record.source)
        return { key: `${record.source.type}:${record.source.id}`, owner: 'shell', tenant: 'record', label: record.title, content: null }
      },
      toCanonicalPage: (id) => ({ pathname: `/inbox/${id}` }),
    },
  }
}

export { createRecordCollectionController }
