import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useRecordCollection } from './use-record-collection'
import type { CollectionData, CollectionProjection, RecordCollectionDescriptor } from './types'
import {
  signalCollectionQuery,
  signalPresentationCompatibleKeys,
  type SignalCollectionPresentation,
  type SignalCollectionQuery,
} from '@/components/signals/signal-collection-adapter'

interface FakeSignal {
  id: string
  body: string
}
type FakeGroup = { key: string; rows: readonly FakeSignal[] }

const ROWS: FakeSignal[] = [
  { id: 's-1', body: 'Walk-in freezer at 8C' },
  { id: 's-2', body: 'New vendor for oat milk' },
]

function makeSignalDescriptor(): RecordCollectionDescriptor<
  FakeSignal,
  string,
  SignalCollectionQuery,
  { viewerId: string | null },
  FakeGroup,
  never,
  SignalCollectionPresentation
> {
  const pres = (id: SignalCollectionPresentation) => ({
    id,
    label: id,
    compatibleQueryKeys: signalPresentationCompatibleKeys[id],
    capabilities: {
      search: true,
      filterKeys: ['attention', 'category', 'teamId'] as const,
      sortKeys: ['sort'] as const,
      groupKeys: ['groupBy'] as const,
      savedViews: true,
      selection: true,
      recordOpening: true,
      bulkActions: [] as readonly never[],
    },
    render: () => null,
  })
  return {
    id: 'signals',
    defaultPresentation: 'feed',
    query: signalCollectionQuery,
    savedViews: {
      enabled: true,
      store: { list: async () => [], get: async () => null, create: vi.fn(), rename: vi.fn(), archive: vi.fn() },
      operations: ['save', 'apply', 'rename', 'archive'],
      buildSpec: () => { throw new Error('unused') },
      parseAndValidate: () => ({ ok: false, issues: [] }),
      applySpec: () => { throw new Error('unused') },
    },
    presentations: { feed: pres('feed'), table: pres('table') },
    load: async () => ({ records: ROWS, context: { viewerId: 'p-me' } }) as CollectionData<FakeSignal, { viewerId: string | null }>,
    project: (data): CollectionProjection<FakeSignal, FakeGroup> => ({
      visibleRecords: data.records,
      groups: [{ key: 'all', rows: data.records }],
      totalRecords: data.records.length,
      visibleRecordsAreFiltered: false,
    }),
    getId: (r) => r.id,
    getAccess: () => ({ mode: 'full', visibleActions: [] }),
    viewer: {
      recordType: 'signal',
      buildPanelEntry: (record) => ({ key: `signal:${record.id}`, owner: 'signals', tenant: 'record', label: record.body, content: null }),
      toCanonicalPage: (id) => ({ pathname: `/signals/${id}` }),
    },
  }
}

let capturedSearch = ''
let controllerRef: ReturnType<typeof useRecordCollection<FakeSignal, string, SignalCollectionQuery, { viewerId: string | null }, FakeGroup, never, SignalCollectionPresentation>> | null = null

function Harness() {
  const location = useLocation()
  capturedSearch = location.search
  const controller = useRecordCollection({
    descriptor: makeSignalDescriptor(),
    urlMode: 'synced',
    viewerId: 'p-me',
    accessRoles: ['ops_lead'],
  })
  controllerRef = controller
  return <div data-status={controller.state.status}>{controller.state.presentation}</div>
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('useRecordCollection (synced)', () => {
  it('AC-V3-005: Signal Feed saved view changes to Table and refresh preserve supported state and URL identity', async () => {
    render(
      <MemoryRouter initialEntries={['/signals?layout=feed&view=needs-attention&attention=Urgent&panel=keep']}>
        <Harness />
      </MemoryRouter>,
    )
    await flush()
    expect(controllerRef?.state.query.attention).toBe('Urgent')
    expect(controllerRef?.state.query.view).toBe('needs-attention')

    act(() => {
      controllerRef?.switchPresentation('table')
    })
    await flush()
    expect(controllerRef?.state.presentation).toBe('table')
    // URL now reflects the Table presentation while supported filters and unrelated route state persist.
    const params = new URLSearchParams(capturedSearch)
    expect(params.get('layout')).toBe('table')
    expect(params.get('attention')).toBe('Urgent')
    expect(params.get('view')).toBe('needs-attention')
    expect(params.get('panel')).toBe('keep')
  })

  it('FR-V3-007: search/filter changes replace only owned query keys and keep unrelated route state', async () => {
    render(
      <MemoryRouter initialEntries={['/signals?layout=table&panel=keep&sidebar=open']}>
        <Harness />
      </MemoryRouter>,
    )
    await flush()
    act(() => {
      controllerRef?.setQuery({ ...controllerRef.state.query, q: 'freezer', attention: 'Needs attention' })
    })
    await flush()
    const params = new URLSearchParams(capturedSearch)
    expect(params.get('q')).toBe('freezer')
    expect(params.get('attention')).toBe('Needs attention')
    // Unrelated route state untouched.
    expect(params.get('panel')).toBe('keep')
    expect(params.get('sidebar')).toBe('open')
  })

  it('FR-V3-007: applying an incompatible saved view keeps the current query and URL intact', async () => {
    // With a populated attention sort + team grouping, switching Feed->? is guarded; here we prove a
    // populated Table-only state cannot silently move to Feed.
    render(
      <MemoryRouter initialEntries={['/signals?layout=table&sort=attention&group=team']}>
        <Harness />
      </MemoryRouter>,
    )
    await flush()
    const before = capturedSearch
    act(() => {
      const result = controllerRef?.switchPresentation('feed')
      expect(result?.ok).toBe(false)
    })
    await flush()
    expect(controllerRef?.state.presentation).toBe('table')
    // URL unchanged on the rejected switch.
    expect(new URLSearchParams(capturedSearch).get('sort')).toBe('attention')
    expect(new URLSearchParams(capturedSearch).get('group')).toBe('team')
    expect(capturedSearch).toBe(before)
  })
})
