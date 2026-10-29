import { describe, expect, it } from 'vitest'
import {
  COLLECTION_VIEW_SPEC_VERSION,
  parseCollectionViewSpec,
  type CollectionViewSpec,
} from './collection-view-spec'

const taskSpec: CollectionViewSpec = {
  kind: 'collection',
  version: COLLECTION_VIEW_SPEC_VERSION,
  collectionId: 'tasks',
  domain: 'tasks',
  presentation: 'table',
  visibleFields: ['title', 'status', 'pic', 'supervisor', 'due', 'businessUnit'],
  query: {
    view: 'my-work',
    q: '',
    businessUnitId: 'bu-cafe',
    status: 'Open',
    picId: 'p-raka',
    supervisorId: 'p-sari',
    includeArchived: false,
    overdueOnly: false,
    occurrenceId: null,
  },
  sort: { field: 'due', direction: 'ascending' },
  grouping: { field: 'occurrence' },
  layout: { density: 'compact' },
}

const signalFeedSpec: CollectionViewSpec = {
  kind: 'collection',
  version: COLLECTION_VIEW_SPEC_VERSION,
  collectionId: 'signals',
  domain: 'signals',
  presentation: 'feed',
  visibleFields: ['message', 'author', 'team', 'occurredAt', 'attention'],
  query: { view: 'needs-attention', q: 'freezer', attention: 'Needs attention', category: null, teamId: 'team-cafe', showRetracted: false },
  sort: { field: 'occurredAt', direction: 'descending' },
  grouping: null,
  layout: { density: 'comfortable' },
}

function queryWith(spec: CollectionViewSpec, key: string, value: unknown): unknown {
  return { ...spec, query: { ...spec.query, [key]: value } }
}

function queryWithout(spec: CollectionViewSpec, key: string): unknown {
  const query = { ...spec.query } as Record<string, unknown>
  delete query[key]
  return { ...spec, query }
}

describe('collection-view-spec validator', () => {
  it('FR-V3-007: Task saved view accepts presentation, Business Unit, PIC, Supervisor, sort, grouping, visible fields, and layout', () => {
    const result = parseCollectionViewSpec(taskSpec)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.spec.collectionId).toBe('tasks')
      if (result.spec.collectionId === 'tasks') {
        expect(result.spec.query.picId).toBe('p-raka')
        expect(result.spec.query.supervisorId).toBe('p-sari')
        expect(result.spec.query.businessUnitId).toBe('bu-cafe')
      }
    }
  })

  it('rejects the retired Completed task view instead of persisting a fifth scope', () => {
    const completed = {
      ...taskSpec,
      query: { ...taskSpec.query, view: 'completed' as const },
    }
    const result = parseCollectionViewSpec(completed)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((issue) => issue.path === 'query.view')).toBe(true)
  })

  it('accepts the canonical Team-work task view without adding a free-form Team filter', () => {
    const teamWork = {
      ...taskSpec,
      query: { ...taskSpec.query, view: 'team-work' as const, businessUnitId: null },
    }
    const result = parseCollectionViewSpec(teamWork)
    expect(result.ok).toBe(true)
  })

  it('FR-V3-007: Task saved view rejects arbitrary Team field/query keys', () => {
    const withTeamField = parseCollectionViewSpec({ ...taskSpec, visibleFields: [...taskSpec.visibleFields, 'team'] })
    expect(withTeamField.ok).toBe(false)
    if (!withTeamField.ok) expect(withTeamField.issues.some((i) => i.code === 'unsupported-domain-field')).toBe(true)

    const withTeamQuery = parseCollectionViewSpec({ ...taskSpec, query: { ...taskSpec.query, teamId: 'team-cafe' } })
    expect(withTeamQuery.ok).toBe(false)
    if (!withTeamQuery.ok) expect(withTeamQuery.issues.some((i) => i.code === 'unsupported-domain-field')).toBe(true)
  })

  it('FR-V3-007: Task saved view rejects Supervisor grouping without aliasing it to PIC', () => {
    const result = parseCollectionViewSpec({ ...taskSpec, grouping: { field: 'supervisor' } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'unsupported-grouping')).toBe(true)
      // Never rewritten to pic.
      expect(result.issues.some((i) => i.detail.includes('pic'))).toBe(false)
    }
  })

  it('FR-V3-007: Signal Feed saved view applies to Table only when compatibility accepts its typed state', () => {
    expect(parseCollectionViewSpec(signalFeedSpec).ok).toBe(true)
    // A feed spec that asks for attention sort is rejected (feed is chronological).
    const feedAttentionSort = parseCollectionViewSpec({ ...signalFeedSpec, sort: { field: 'attention', direction: 'descending' } })
    expect(feedAttentionSort.ok).toBe(false)
    if (!feedAttentionSort.ok) expect(feedAttentionSort.issues.some((i) => i.code === 'invalid-sort')).toBe(true)
    // A feed spec that asks for Team grouping is rejected.
    const feedTeamGroup = parseCollectionViewSpec({ ...signalFeedSpec, grouping: { field: 'team' } })
    expect(feedTeamGroup.ok).toBe(false)
    if (!feedTeamGroup.ok) expect(feedTeamGroup.issues.some((i) => i.code === 'unsupported-grouping')).toBe(true)
    // The same typed state is valid as a Table view.
    expect(parseCollectionViewSpec({ ...signalFeedSpec, presentation: 'table', sort: { field: 'attention', direction: 'descending' }, grouping: { field: 'team' } }).ok).toBe(true)
  })

  it('rejects malformed persisted Signal search text with a query issue', () => {
    const result = parseCollectionViewSpec(queryWith(signalFeedSpec, 'q', ['freezer']))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((issue) => issue.path === 'query.q')).toBe(true)
  })

  it.each([
    { name: 'requires Task view', spec: queryWithout(taskSpec, 'view'), path: 'query.view' },
    { name: 'requires Task search text', spec: queryWithout(taskSpec, 'q'), path: 'query.q' },
    { name: 'requires a nullable Task Business Unit ID', spec: queryWithout(taskSpec, 'businessUnitId'), path: 'query.businessUnitId' },
    { name: 'requires nullable Task status', spec: queryWithout(taskSpec, 'status'), path: 'query.status' },
    { name: 'requires nullable Task PIC ID', spec: queryWithout(taskSpec, 'picId'), path: 'query.picId' },
    { name: 'requires nullable Task Supervisor ID', spec: queryWithout(taskSpec, 'supervisorId'), path: 'query.supervisorId' },
    { name: 'requires Task includeArchived boolean', spec: queryWith(taskSpec, 'includeArchived', 'false'), path: 'query.includeArchived' },
    { name: 'requires Task overdueOnly boolean', spec: queryWithout(taskSpec, 'overdueOnly'), path: 'query.overdueOnly' },
    { name: 'requires nullable Task occurrence ID', spec: queryWith(taskSpec, 'occurrenceId', 42), path: 'query.occurrenceId' },
    { name: 'validates optional Task person ID when present', spec: queryWith(taskSpec, 'personId', false), path: 'query.personId' },
    { name: 'rejects unknown Task query fields', spec: queryWith(taskSpec, 'searchMode', 'exact'), path: 'query.searchMode' },
    { name: 'requires Signal view', spec: queryWithout(signalFeedSpec, 'view'), path: 'query.view' },
    { name: 'requires Signal search text to be a string', spec: queryWith(signalFeedSpec, 'q', { text: 'freezer' }), path: 'query.q' },
    { name: 'requires nullable Signal attention', spec: queryWithout(signalFeedSpec, 'attention'), path: 'query.attention' },
    { name: 'requires nullable Signal category', spec: queryWithout(signalFeedSpec, 'category'), path: 'query.category' },
    { name: 'requires nullable Signal team ID', spec: queryWith(signalFeedSpec, 'teamId', 42), path: 'query.teamId' },
    { name: 'requires Signal showRetracted boolean', spec: queryWith(signalFeedSpec, 'showRetracted', 'false'), path: 'query.showRetracted' },
    { name: 'rejects unknown Signal query fields', spec: queryWith(signalFeedSpec, 'searchMode', 'exact'), path: 'query.searchMode' },
    {
      name: 'requires an Events month string',
      spec: {
        kind: 'collection', version: 1, collectionId: 'events', domain: 'events', presentation: 'calendar',
        visibleFields: ['title', 'time', 'venue', 'outbound'], query: {},
        sort: { field: 'startsAt', direction: 'ascending' }, grouping: null, layout: { density: 'comfortable' },
      },
      path: 'query.month',
    },
    {
      name: 'rejects unknown Events query fields',
      spec: {
        kind: 'collection', version: 1, collectionId: 'events', domain: 'events', presentation: 'calendar',
        visibleFields: ['title', 'time', 'venue', 'outbound'], query: { month: '2027-01', searchMode: 'exact' },
        sort: { field: 'startsAt', direction: 'ascending' }, grouping: null, layout: { density: 'comfortable' },
      },
      path: 'query.searchMode',
    },
  ])('$name', ({ spec, path }) => {
    const result = parseCollectionViewSpec(spec)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((issue) => issue.path === path)).toBe(true)
  })

  it('preserves valid saved query values, including Task specs without the optional person filter', () => {
    expect(parseCollectionViewSpec(taskSpec)).toEqual({ ok: true, spec: taskSpec })
    expect(parseCollectionViewSpec(signalFeedSpec)).toEqual({ ok: true, spec: signalFeedSpec })
  })

  it('FR-V3-007: malformed persisted spec is rejected without changing current URL', () => {
    expect(parseCollectionViewSpec(null).ok).toBe(false)
    expect(parseCollectionViewSpec({ kind: 'composition' }).ok).toBe(false)
    expect(parseCollectionViewSpec({ ...taskSpec, version: 99 }).ok).toBe(false)
    expect(parseCollectionViewSpec({ ...taskSpec, collectionId: 'bogus' }).ok).toBe(false)
    expect(parseCollectionViewSpec({ ...taskSpec, domain: 'signals' }).ok).toBe(false)
    expect(parseCollectionViewSpec({ ...taskSpec, presentation: 'board' }).ok).toBe(false)
  })

  it('AC-348: validates the calendar-only Events saved-view shape', () => {
    const event = { kind: 'collection', version: 1, collectionId: 'events', domain: 'events', presentation: 'calendar', visibleFields: ['title', 'time', 'venue', 'outbound'], query: { month: '2027-01' }, sort: { field: 'startsAt', direction: 'ascending' }, grouping: null, layout: { density: 'comfortable' } }
    expect(parseCollectionViewSpec(event).ok).toBe(true)
    for (const invalid of [{ ...event, presentation: 'table' }, { ...event, visibleFields: ['title', 'unknown'] }, { ...event, query: { month: '2027-13' } }, { ...event, sort: { field: 'title', direction: 'ascending' } }, { ...event, grouping: { field: 'venue' } }]) {
      expect(parseCollectionViewSpec(invalid).ok).toBe(false)
    }
  })

  it('FR-V3-013: CollectionViewSpec contains typed query only and no result rows, SQL, or executable code', () => {
    const withRows = parseCollectionViewSpec({ ...taskSpec, rows: [{ id: 't-1' }] })
    expect(withRows.ok).toBe(false)
    const withSql = parseCollectionViewSpec({ ...taskSpec, sql: 'select 1' })
    expect(withSql.ok).toBe(false)
  })
})
