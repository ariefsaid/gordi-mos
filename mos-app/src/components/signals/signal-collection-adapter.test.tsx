import { describe, it, expect, vi, beforeEach } from 'vitest'

// SignalRecordHost is heavy (Supabase DAL) and is only used as the panel CONTENT of a viewer entry;
// stub it so the descriptor test stays a pure unit and asserts the opening seam, not a real record.
vi.mock('./signal-record-host', () => ({
  SignalRecordHost: (props: { signalId: string; mode?: string }) => (
    <div data-testid="signal-record-host-stub" data-signal-id={props.signalId} data-mode={props.mode} />
  ),
}))
vi.mock('@/lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return { ...actual, listReadableSignals: vi.fn(), listAllTeams: vi.fn() }
})
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn(), getBusinessUnits: vi.fn() }))

import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import type { SignalRow } from '@/lib/db/signals.types'
import type { CollectionData } from '@/lib/record-collection/types'
import {
  signalCollectionDescriptor,
  signalCollectionSavedViews,
  SIGNAL_COLLECTION_NEUTRAL_QUERY,
  type SignalCollectionContext,
  type SignalCollectionQuery,
} from './signal-collection-adapter'

const mockListReadableSignals = vi.mocked(listReadableSignals)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockGetPeople = vi.mocked(getPeople)

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'p-cahya', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'Needs attention', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

function query(overrides: Partial<SignalCollectionQuery> = {}): SignalCollectionQuery {
  return { ...SIGNAL_COLLECTION_NEUTRAL_QUERY, ...overrides }
}

const CTX: SignalCollectionContext = {
  authorNamesById: new Map([['p-cahya', 'Cahya Cafe'], ['p-riri', 'Riri Roastery']]),
  teamNamesById: new Map([['team-hq', 'HQ Operations'], ['team-radiant', 'Radiant Operations']]),
  siteNamesByTeamId: new Map(),
  viewerId: 'p-me',
}

function data(records: readonly SignalRow[]): CollectionData<SignalRow, SignalCollectionContext> {
  return { records, context: CTX }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListReadableSignals.mockResolvedValue([row()])
  mockListAllTeams.mockResolvedValue([
    { id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false },
  ])
  mockGetPeople.mockResolvedValue([{ id: 'p-cahya', full_name: 'Cahya Cafe' }])
})

describe('signalCollectionDescriptor — the one Signal loader/projector (FR-V3-013)', () => {
  it('FR-V3-013: load fetches readable Signals (incl. retracted), people, and teams into one context', async () => {
    const loaded = await signalCollectionDescriptor.load({ query: query(), viewerId: 'p-me' })
    expect(mockListReadableSignals).toHaveBeenCalledWith({ includeRetracted: true })
    expect(mockGetPeople).toHaveBeenCalledTimes(1)
    expect(mockListAllTeams).toHaveBeenCalledTimes(1)
    expect(loaded.records).toHaveLength(1)
    expect(loaded.context.authorNamesById.get('p-cahya')).toBe('Cahya Cafe')
    expect(loaded.context.teamNamesById.get('team-hq')).toBe('HQ Operations')
    expect(loaded.context.viewerId).toBe('p-me')
  })

  it('getId returns the Signal id; getAccess is full read (no bulk actions)', () => {
    expect(signalCollectionDescriptor.getId(row({ id: 'signal-9' }))).toBe('signal-9')
    const access = signalCollectionDescriptor.getAccess({ viewerId: 'p-me', accessRoles: ['member'] })
    expect(access.mode).toBe('full')
    expect(access.visibleActions).toEqual([])
  })

  it('NFR-V3-001: retracted Signals are hidden by default and revealed only by the typed query', () => {
    const rows = [
      row({ id: 's-live', retracted_at: null }),
      row({ id: 's-dead', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' }),
    ]
    const hidden = signalCollectionDescriptor.project(data(rows), query(), 'table')
    expect(hidden.visibleRecords.map((s) => s.id)).toEqual(['s-live'])
    expect(hidden.totalRecords).toBe(2)

    const shown = signalCollectionDescriptor.project(data(rows), query({ showRetracted: true }), 'table')
    expect(shown.visibleRecords.map((s) => s.id).sort()).toEqual(['s-dead', 's-live'])
  })

  it('FR-V3-007: text search + attention filter narrow the projection and mark it filtered', () => {
    const rows = [
      row({ id: 's-freezer', body: 'The freezer alarm went off', attention: 'Urgent' }),
      row({ id: 's-oat', body: 'New vendor for oat milk', attention: 'FYI' }),
    ]
    const filtered = signalCollectionDescriptor.project(data(rows), query({ q: 'freezer' }), 'table')
    expect(filtered.visibleRecords.map((s) => s.id)).toEqual(['s-freezer'])
    expect(filtered.visibleRecordsAreFiltered).toBe(true)

    const byAttention = signalCollectionDescriptor.project(data(rows), query({ attention: 'FYI' }), 'table')
    expect(byAttention.visibleRecords.map((s) => s.id)).toEqual(['s-oat'])
  })

  it('AC-V3-005: Feed projects attention-weighted recency; Table sorts newest occurred-at first', () => {
    const rows = [
      row({ id: 'fyi-new', attention: 'FYI', occurred_at: '2026-07-16T10:00:00Z' }),
      row({ id: 'urgent-old', attention: 'Urgent', occurred_at: '2026-07-16T02:00:00Z' }),
      row({ id: 'needs-mid', attention: 'Needs attention', occurred_at: '2026-07-16T06:00:00Z' }),
    ]
    const feed = signalCollectionDescriptor.project(data(rows), query({ layout: 'feed' }), 'feed')
    expect(feed.visibleRecords.map((s) => s.id)).toEqual(['urgent-old', 'needs-mid', 'fyi-new'])

    const table = signalCollectionDescriptor.project(
      data(rows), query({ layout: 'table', sort: 'occurredAt', direction: 'descending' }), 'table',
    )
    expect(table.visibleRecords.map((s) => s.id)).toEqual(['fyi-new', 'needs-mid', 'urgent-old'])
  })

  it('presentations are exactly feed + table, and Feed rejects attention sort / team grouping', () => {
    expect(Object.keys(signalCollectionDescriptor.presentations).sort()).toEqual(['feed', 'table'])
    const feedKeys = signalCollectionDescriptor.presentations.feed.compatibleQueryKeys
    expect(feedKeys).not.toContain('sort')
    expect(feedKeys).not.toContain('groupBy')
    expect(signalCollectionDescriptor.presentations.table.capabilities.selection).toBe(false)
  })

  it('FR-V3-003/004/006 seam: the viewer builds a Signal-owned panel entry + a canonical page target', () => {
    const source = {
      collectionId: 'signals', presentation: 'table',
      pathname: '/work/signals', search: '?q=freezer&record=signal-1',
    }
    const viewer = signalCollectionDescriptor.viewer
    if (!viewer) throw new Error('the signals descriptor must define its opening seam')
    const entry = viewer.buildPanelEntry(row({ id: 'signal-7' }), source)
    expect(entry.owner).toBe('signals')
    expect(entry.key).toBe('signal:signal-7')
    expect(entry.pageTo).toEqual({ pathname: '/work/signals/signal-7', search: '?q=freezer' })
    const page = viewer.toCanonicalPage('signal-7', source)
    expect(page).toEqual({ pathname: '/work/signals/signal-7', search: '?q=freezer' })
  })
})

describe('signalCollectionSavedViews — typed Signal saved-view lifecycle (FR-V3-007)', () => {
  it('buildSpec emits a signals CollectionViewSpec that the validator accepts', () => {
    const spec = signalCollectionSavedViews.buildSpec({
      query: query({ q: 'freezer', attention: 'Urgent', view: 'needs-attention' }),
      presentation: 'table',
    })
    expect(spec.collectionId).toBe('signals')
    expect(spec.domain).toBe('signals')
    const validated = signalCollectionSavedViews.parseAndValidate(spec)
    expect(validated.ok).toBe(true)
  })

  it('FR-V3-007: a Feed saved view with attention sort is rejected, not silently reset', () => {
    const bad = signalCollectionSavedViews.buildSpec({
      query: query({ layout: 'feed', sort: 'attention' }),
      presentation: 'feed',
    })
    const validated = signalCollectionSavedViews.parseAndValidate(bad)
    expect(validated.ok).toBe(false)
  })

  it('applySpec round-trips a persisted spec back into query + presentation', () => {
    const spec = signalCollectionSavedViews.buildSpec({
      query: query({ q: 'oat', attention: 'FYI' }),
      presentation: 'table',
    })
    const applied = signalCollectionSavedViews.applySpec(spec)
    expect(applied.presentation).toBe('table')
    expect(applied.query.q).toBe('oat')
    expect(applied.query.attention).toBe('FYI')
  })

  it('preserves a Signal grouping in a saved view and restores it when applied', () => {
    const spec = signalCollectionSavedViews.buildSpec({
      query: query({ groupBy: 'category', savedViewId: 'view-category' }),
      presentation: 'table',
    })

    expect(spec.grouping).toEqual({ field: 'category' })
    const applied = signalCollectionSavedViews.applySpec(spec)
    expect(applied.query.groupBy).toBe('category')
  })
})
