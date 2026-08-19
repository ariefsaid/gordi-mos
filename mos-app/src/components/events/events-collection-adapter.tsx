import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listEventsOverlapping } from '@/lib/db/events'
import type { EventRow } from '@/lib/db/events.types'
import { wibMonthKey, wibMonthRange } from '@/lib/week'
import { parseCollectionViewSpec, type CollectionViewSpec } from '@/lib/record-collection/collection-view-spec'
import type { CollectionAccess, CollectionData, CollectionProjection, CollectionQueryParse, CollectionQuerySchema, CollectionSavedViewDescriptor, CollectionViewStore, QueryKey, RecordCollectionDescriptor } from '@/lib/record-collection/types'
import { EventsCalendarPresentation } from './events-calendar-presentation'

export interface EventCollectionQuery { month: string; savedViewId: string | null }
export interface EventCollectionContext { businessUnits: ReadonlyMap<string, string>; people: ReadonlyMap<string, string> }
type EventPresentation = 'calendar'
type EventAction = never

/** Fresh at request time: a long-lived module must never pin yesterday's month. */
export const currentEventCollectionQuery = (): EventCollectionQuery => ({ month: wibMonthKey(), savedViewId: null })
const EVENT_QUERY_KEYS: readonly QueryKey<EventCollectionQuery>[] = ['month', 'savedViewId']

function parseEventQuery(params: URLSearchParams): CollectionQueryParse<EventCollectionQuery> {
  const neutral = currentEventCollectionQuery()
  const month = params.get('month') ?? neutral.month
  const savedViewId = params.get('saved')
  if (!wibMonthRange(month)) return { ok: false, query: { month: neutral.month, savedViewId }, issues: [{ key: 'month', code: 'invalid-value', value: month }] }
  return { ok: true, query: { month, savedViewId } }
}
function serializeEventQuery(query: EventCollectionQuery): URLSearchParams {
  const params = new URLSearchParams()
  params.set('month', query.month)
  if (query.savedViewId) params.set('saved', query.savedViewId)
  return params
}
export const eventCollectionQuery: CollectionQuerySchema<EventCollectionQuery> = {
  keys: EVENT_QUERY_KEYS,
  get neutral() { return currentEventCollectionQuery() },
  parse: parseEventQuery,
  serialize: serializeEventQuery,
  normalize: (query) => query,
}

const noSavedViews: CollectionViewStore = {
  async list() { return [] }, async get() { return null },
  async create() { throw new Error('Events saved views are not available') },
  async rename() { throw new Error('Events saved views are not available') },
  async archive() { throw new Error('Events saved views are not available') },
}
const eventSavedViews: CollectionSavedViewDescriptor<EventCollectionQuery, EventPresentation> = {
  enabled: false, store: noSavedViews, operations: [],
  buildSpec({ query }): CollectionViewSpec { return { kind: 'collection', version: 1, collectionId: 'events', domain: 'events', presentation: 'calendar', visibleFields: ['title', 'time', 'venue', 'outbound', 'businessUnit', 'coordinator'], query: { month: query.month }, sort: { field: 'startsAt', direction: 'ascending' }, grouping: null, layout: { density: 'comfortable' } } },
  parseAndValidate: parseCollectionViewSpec,
  applySpec(spec) { if (spec.collectionId !== 'events') throw new Error('Expected events view'); return { presentation: 'calendar', query: { month: spec.query.month, savedViewId: null } } },
}

export const eventsCollectionDescriptor: RecordCollectionDescriptor<EventRow, string, EventCollectionQuery, EventCollectionContext, EventRow[], EventAction, EventPresentation> = {
  id: 'events', defaultPresentation: 'calendar', query: eventCollectionQuery, savedViews: eventSavedViews, loadKeys: ['month'],
  presentations: { calendar: { id: 'calendar', label: 'Calendar', compatibleQueryKeys: EVENT_QUERY_KEYS, capabilities: { search: false, filterKeys: [], sortKeys: [], groupKeys: [], savedViews: false, selection: false, recordOpening: false, bulkActions: [] }, render: ({ query, projection, context }) => <EventsCalendarPresentation month={query.month} events={projection.visibleRecords} businessUnits={context.businessUnits} people={context.people} /> } },
  async load({ query }): Promise<CollectionData<EventRow, EventCollectionContext>> {
    const range = wibMonthRange(query.month)
    if (!range) throw new Error('Invalid Events month')
    const [records, businessUnits, people] = await Promise.all([listEventsOverlapping(range), getBusinessUnits(), getPeople()])
    return { records, context: { businessUnits: new Map(businessUnits.map((row) => [row.id, row.name])), people: new Map(people.map((row) => [row.id, row.full_name])) } }
  },
  project(data): CollectionProjection<EventRow, EventRow[]> { return { visibleRecords: [...data.records].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.title.localeCompare(b.title)), groups: [], totalRecords: data.records.length, visibleRecordsAreFiltered: false } },
  getId: (event) => event.id,
  getAccess: (): CollectionAccess<EventAction> => ({ mode: 'full', visibleActions: [] }),
}
