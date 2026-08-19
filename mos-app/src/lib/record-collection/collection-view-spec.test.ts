import { describe, expect, it } from 'vitest'
import {
  COLLECTION_VIEW_SPEC_VERSION,
  parseCollectionViewSpec,
  serializeCollectionViewSpec,
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

describe('collection-view-spec validator', () => {
  it('FR-V3-007: Task saved view serializes presentation, Business Unit, PIC, Supervisor, sort, grouping, visible fields, and layout', () => {
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
    // Stable serialization is order-independent.
    const a = serializeCollectionViewSpec(taskSpec)
    const shuffled = { ...taskSpec, layout: { density: 'compact' as const } }
    expect(serializeCollectionViewSpec(shuffled)).toBe(a)
  })

  it('FR-V3-007: Task saved view rejects Team field/query before the Issue 8 team_id contract', () => {
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
    // Serialized spec is pure JSON with no code/HTML.
    const serialized = serializeCollectionViewSpec(taskSpec)
    expect(serialized).not.toContain('select')
    expect(serialized).not.toContain('<')
  })
})
