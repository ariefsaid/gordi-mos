import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { OverlayHostProvider, useOverlayHost } from '@/shell/overlay-host'
import { useRecordCollection } from './use-record-collection'
import type {
  CollectionData,
  CollectionProjection,
  CollectionQuerySchema,
  QueryKey,
  RecordCollectionDescriptor,
} from './types'
import type { CollectionViewSpec, PersistedCollectionView } from './collection-view-spec'
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

// A saved-view-capable variant, for Issue #614: `view` is the one saved view `applySavedView` can
// fetch, its `spec` never inspected by parseAndValidate/applySpec below (fakes bypass the real
// collection-view-spec parser, same as engine.test.ts's `as unknown as CollectionViewSpec` pattern) —
// only its `presentation` field drives what the fake `applySpec` reports.
function makeSignalDescriptorWithSavedView(
  view: PersistedCollectionView,
): RecordCollectionDescriptor<FakeSignal, string, SignalCollectionQuery, { viewerId: string | null }, FakeGroup, never, SignalCollectionPresentation> {
  const base = makeSignalDescriptor()
  return {
    ...base,
    savedViews: {
      ...base.savedViews,
      store: {
        list: async () => [view],
        get: async (id: string) => (id === view.id ? view : null),
        create: vi.fn(),
        rename: vi.fn(),
        archive: vi.fn(),
      },
      parseAndValidate: () => ({ ok: true, spec: view.spec }),
      applySpec: (spec) => ({
        query: { ...signalCollectionQuery.neutral, layout: spec.presentation as SignalCollectionPresentation },
        presentation: spec.presentation as SignalCollectionPresentation,
      }),
    },
  }
}

let capturedSearch = ''
let controllerRef: ReturnType<typeof useRecordCollection<FakeSignal, string, SignalCollectionQuery, { viewerId: string | null }, FakeGroup, never, SignalCollectionPresentation>> | null = null

// A stable descriptor instance — Harness re-renders with a new isDesktop prop across the resize
// tests below, and a fresh descriptor object each render would be indistinguishable from a real
// prop change to the effect that watches it.
const SIGNAL_DESCRIPTOR = makeSignalDescriptor()

function Harness({ isDesktop = true }: { isDesktop?: boolean } = {}) {
  const location = useLocation()
  capturedSearch = location.search
  const controller = useRecordCollection({
    descriptor: SIGNAL_DESCRIPTOR,
    urlMode: 'synced',
    isDesktop,
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

  it('binds the ambient Issue 4 overlay host so openRecord opens a real panel session without an explicit host prop', async () => {
    let sessionFrames = -1
    function HostObserver() {
      sessionFrames = useOverlayHost().session?.frames.length ?? 0
      return null
    }
    render(
      <MemoryRouter initialEntries={['/signals?layout=feed']}>
        <OverlayHostProvider>
          <Harness />
          <HostObserver />
        </OverlayHostProvider>
      </MemoryRouter>,
    )
    await flush()
    // No session open yet.
    expect(sessionFrames).toBe(0)

    act(() => {
      controllerRef?.openRecord(ROWS[0])
    })
    await flush()
    // The engine reached the REAL ambient host (openRoot), not a no-op: a one-frame panel session is live.
    expect(sessionFrames).toBe(1)
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

  // Issue #607: a desktop session narrowed to phone width used to keep presentation=table while
  // CSS alone hid the Table/Card switcher — a dead end with no way back to Feed. This proves the
  // hook reacts to the isDesktop PROP flipping (not just a fresh phone mount, already covered by
  // AC-V3-013 in signals-archive-page.test.tsx), that widening restores the desktop choice, and
  // that the URL's `layout` param — not just in-memory state — tracks the live presentation at
  // every stage, with the whole saved query (view/attention included) round-tripping verbatim.
  it('Issue #607: presentation and URL follow a desktop → 390px phone → desktop resize, restoring the saved Table view verbatim', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/signals?layout=table&view=needs-attention&attention=Urgent']}>
        <Harness isDesktop />
      </MemoryRouter>,
    )
    await flush()
    const savedQuery = { ...controllerRef!.state.query }
    expect(controllerRef?.state.presentation).toBe('table')
    expect(new URLSearchParams(capturedSearch).get('layout')).toBe('table')

    // Narrow: presentation is constrained at the state layer, not merely hidden by CSS — a bare
    // switchPresentation('table') would still read 'table' here if the fix were a no-op.
    rerender(
      <MemoryRouter initialEntries={['/signals?layout=table&view=needs-attention&attention=Urgent']}>
        <Harness isDesktop={false} />
      </MemoryRouter>,
    )
    await flush()
    expect(controllerRef?.state.presentation).toBe('feed')
    expect(new URLSearchParams(capturedSearch).get('layout')).toBe('feed')

    // Widen: the Table request that brought the user here is still compatible with the live
    // (unchanged) query, so it comes back rather than staying stuck on the phone default.
    rerender(
      <MemoryRouter initialEntries={['/signals?layout=table&view=needs-attention&attention=Urgent']}>
        <Harness isDesktop />
      </MemoryRouter>,
    )
    await flush()
    expect(controllerRef?.state.presentation).toBe('table')
    expect(controllerRef?.state.query).toEqual(savedQuery)
    expect(new URLSearchParams(capturedSearch).get('layout')).toBe('table')
  })

  // The Signal descriptor's Table presentation supports every query key, so a widen-restore to
  // Table can never be rejected there. To prove the restore genuinely re-checks compatibility
  // (rather than restoring unconditionally), this uses a tiny descriptor where the DESIRED
  // presentation ('card') is the restrictive one and the phone default ('table') is permissive —
  // mirroring a real host whose compact card view can't render every filter its full table can.
  type XPresentation = 'table' | 'card'
  interface XQuery { layout: XPresentation; filter: string | null }
  const X_NEUTRAL: XQuery = { layout: 'table', filter: null }
  const xQuerySchema: CollectionQuerySchema<XQuery> = {
    keys: ['layout', 'filter'],
    neutral: X_NEUTRAL,
    parse: (params, presentation) => ({
      ok: true,
      query: {
        layout: (params.get('layout') as XPresentation | null) ?? (presentation as XPresentation),
        filter: params.get('filter'),
      },
    }),
    serialize: (query) => {
      const p = new URLSearchParams()
      if (query.layout !== X_NEUTRAL.layout) p.set('layout', query.layout)
      if (query.filter !== X_NEUTRAL.filter) p.set('filter', query.filter ?? '')
      return p
    },
    normalize: (query) => query,
  }
  function makeAsymmetricDescriptor(): RecordCollectionDescriptor<
    FakeSignal, string, XQuery, { viewerId: string | null }, FakeGroup, never, XPresentation
  > {
    const pres = (id: XPresentation, compatibleQueryKeys: readonly QueryKey<XQuery>[]) => ({
      id, label: id, compatibleQueryKeys,
      capabilities: {
        search: false, filterKeys: ['filter'] as const, sortKeys: [] as const, groupKeys: [] as const,
        savedViews: false, selection: false, recordOpening: false, bulkActions: [] as readonly never[],
      },
      render: () => null,
    })
    return {
      id: 'x-widget',
      defaultPresentation: 'table',
      query: xQuerySchema,
      savedViews: {
        enabled: false,
        store: { list: async () => [], get: async () => null, create: vi.fn(), rename: vi.fn(), archive: vi.fn() },
        operations: [],
        buildSpec: () => { throw new Error('unused') },
        parseAndValidate: () => ({ ok: false, issues: [] }),
        applySpec: () => { throw new Error('unused') },
      },
      presentations: { table: pres('table', ['layout', 'filter']), card: pres('card', ['layout']) },
      load: async () => ({ records: ROWS, context: { viewerId: 'p-me' } }) as CollectionData<FakeSignal, { viewerId: string | null }>,
      project: (data): CollectionProjection<FakeSignal, FakeGroup> => ({
        visibleRecords: data.records,
        groups: [{ key: 'all', rows: data.records }],
        totalRecords: data.records.length,
        visibleRecordsAreFiltered: false,
      }),
      getId: (r) => r.id,
      getAccess: () => ({ mode: 'full', visibleActions: [] }),
    }
  }
  const X_DESCRIPTOR = makeAsymmetricDescriptor()
  let xControllerRef: ReturnType<typeof useRecordCollection<FakeSignal, string, XQuery, { viewerId: string | null }, FakeGroup, never, XPresentation>> | null = null
  function XHarness({ isDesktop = true }: { isDesktop?: boolean } = {}) {
    const controller = useRecordCollection({
      descriptor: X_DESCRIPTOR, urlMode: 'synced', isDesktop, viewerId: 'p-me', accessRoles: ['ops_lead'],
    })
    xControllerRef = controller
    return <div>{controller.state.presentation}</div>
  }

  it('Issue #607: widening does not restore a presentation the query can no longer support', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/signals?layout=card']}>
        <XHarness isDesktop />
      </MemoryRouter>,
    )
    await flush()
    expect(xControllerRef?.state.presentation).toBe('card') // desired, no filter populated yet

    rerender(
      <MemoryRouter initialEntries={['/signals?layout=card']}>
        <XHarness isDesktop={false} />
      </MemoryRouter>,
    )
    await flush()
    expect(xControllerRef?.state.presentation).toBe('table') // phone default, 'card' is remembered

    // While on the phone default Table, a filter gets set that Card cannot render (its
    // compatibleQueryKeys is ['layout'] only) — exactly what setQuery-driven filtering on the
    // phone default would produce.
    act(() => xControllerRef?.setQuery({ layout: 'table', filter: 'urgent' }))
    await flush()

    rerender(
      <MemoryRouter initialEntries={['/signals?layout=card']}>
        <XHarness isDesktop />
      </MemoryRouter>,
    )
    await flush()
    // Restoring 'card' would silently orphan the populated filter — checkPresentationCompatibility
    // would reject this exact move via switchPresentation, so the restore honors the same rule and
    // the permissive phone default stands instead.
    expect(xControllerRef?.state.presentation).toBe('table')
  })

  // Issue #614: applySavedView set presentation straight from the saved spec with no isDesktop
  // awareness — a desktop-saved Table view applied on a PHONE landed on Table with the switcher
  // hidden (a dead end), and the URL then carried layout=table on a phone, contradicting
  // AC-V3-013 (a phone render always shows the collection default as ?layout).
  it('Issue #614: applying a saved view whose spec asks for Table on a phone session renders the collection default instead, URL included', async () => {
    const view: PersistedCollectionView = {
      id: 'v-table', name: 'Desktop table view', scope: 'private', kind: 'collection', context: 'work',
      lifecycle: 'active', spec: { presentation: 'table' } as unknown as CollectionViewSpec,
      createdAt: '', updatedAt: '', archivedAt: null,
    }
    const descriptor = makeSignalDescriptorWithSavedView(view)
    function PhoneHarness() {
      const location = useLocation()
      capturedSearch = location.search
      const controller = useRecordCollection({
        descriptor, urlMode: 'synced', isDesktop: false, viewerId: 'p-me', accessRoles: ['ops_lead'],
      })
      controllerRef = controller
      return <div>{controller.state.presentation}</div>
    }
    render(
      <MemoryRouter initialEntries={['/signals']}>
        <PhoneHarness />
      </MemoryRouter>,
    )
    await flush()
    expect(controllerRef?.state.presentation).toBe('feed') // the collection default, pre-apply

    await act(async () => {
      const result = await controllerRef?.applySavedView('v-table')
      expect(result?.ok).toBe(true)
    })
    await flush()
    // Not 'table' — the saved view's own presentation never reaches state on a phone session.
    expect(controllerRef?.state.presentation).toBe('feed')
    expect(new URLSearchParams(capturedSearch).get('layout')).toBe('feed')
  })

  // A saved-view-capable variant of the asymmetric descriptor above (table default, card the
  // restrictive alternate) — Issue #614's second half needs a saved view whose presentation the
  // phone default does NOT already equal, to prove the widen-restore reads what the saved view
  // asked for rather than whatever was captured at the last narrow transition.
  function makeAsymmetricDescriptorWithSavedView(
    view: PersistedCollectionView,
  ): RecordCollectionDescriptor<FakeSignal, string, XQuery, { viewerId: string | null }, FakeGroup, never, XPresentation> {
    const base = makeAsymmetricDescriptor()
    return {
      ...base,
      savedViews: {
        enabled: true,
        store: {
          list: async () => [view],
          get: async (id: string) => (id === view.id ? view : null),
          create: vi.fn(),
          rename: vi.fn(),
          archive: vi.fn(),
        },
        operations: ['apply'],
        buildSpec: () => { throw new Error('unused') },
        parseAndValidate: () => ({ ok: true, spec: view.spec }),
        applySpec: (spec) => ({
          query: { layout: spec.presentation as XPresentation, filter: null },
          presentation: spec.presentation as XPresentation,
        }),
      },
    }
  }

  it('Issue #614: a saved view (Card) applied while narrow is restored on widen — not the presentation captured at the narrow transition', async () => {
    const view: PersistedCollectionView = {
      id: 'v-card', name: 'Card view', scope: 'private', kind: 'collection', context: 'work',
      lifecycle: 'active', spec: { presentation: 'card' } as unknown as CollectionViewSpec,
      createdAt: '', updatedAt: '', archivedAt: null,
    }
    const descriptor = makeAsymmetricDescriptorWithSavedView(view)
    function YHarness({ isDesktop = true }: { isDesktop?: boolean } = {}) {
      const controller = useRecordCollection({
        descriptor, urlMode: 'synced', isDesktop, viewerId: 'p-me', accessRoles: ['ops_lead'],
      })
      xControllerRef = controller
      return <div>{controller.state.presentation}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={['/signals?layout=table']}>
        <YHarness isDesktop />
      </MemoryRouter>,
    )
    await flush()
    expect(xControllerRef?.state.presentation).toBe('table') // desktop default, pre-narrow

    // Narrow: the pre-narrow value ('table') gets captured as the naive "desired" — the very value
    // the fix must NOT restore once a saved view supersedes it below.
    rerender(
      <MemoryRouter initialEntries={['/signals?layout=table']}>
        <YHarness isDesktop={false} />
      </MemoryRouter>,
    )
    await flush()
    expect(xControllerRef?.state.presentation).toBe('table') // already the default — unchanged

    // While still narrow, apply the Card saved view. State stays constrained to the default
    // (no switcher on a phone to leave a Card-only dead end reachable from), but the CONTROLLER's
    // notion of "what was asked for" must move to Card.
    await act(async () => {
      const result = await xControllerRef?.applySavedView('v-card')
      expect(result?.ok).toBe(true)
    })
    await flush()
    expect(xControllerRef?.state.presentation).toBe('table')

    // Widen: restores Card — the saved view just applied — not the stale pre-narrow 'table'.
    rerender(
      <MemoryRouter initialEntries={['/signals?layout=table']}>
        <YHarness isDesktop />
      </MemoryRouter>,
    )
    await flush()
    expect(xControllerRef?.state.presentation).toBe('card')
  })
})
