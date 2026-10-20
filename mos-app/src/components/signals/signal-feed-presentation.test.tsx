import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import { SignalFeedPresentation } from './signal-feed-presentation'
import { SignalCollectionActionsProvider, type SignalCollectionActions } from './signal-collection-actions'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'
import { signalCollectionQuery } from './signal-collection-adapter'

const SIGNAL_COLLECTION_NEUTRAL_QUERY = signalCollectionQuery.neutral

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'p-author-a', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'FYI', category: null, audience: 'team',source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

const CONTEXT: SignalCollectionContext = {
  authorNamesById: new Map([['p-author-a', 'Author One']]),
  teamNamesById: new Map([['team-hq', 'HQ Operations']]),
  siteNamesByTeamId: new Map(),
  viewerId: 'p-me',
}

function renderFeed(
  rows: readonly SignalRow[],
  actions: SignalCollectionActions,
  onOpenRecord = vi.fn(),
) {
  const projection: CollectionProjection<SignalRow, SignalRenderGroup> = {
    visibleRecords: rows,
    groups: [{ key: 'all', label: null, rows }],
    totalRecords: rows.length,
    visibleRecordsAreFiltered: false,
  }
  const props: CollectionPresentationProps<
    SignalRow,
    SignalCollectionQuery,
    CollectionProjection<SignalRow, SignalRenderGroup>,
    SignalCollectionContext,
    string
  > = {
    query: { ...SIGNAL_COLLECTION_NEUTRAL_QUERY, layout: 'feed' },
    projection,
    context: CONTEXT,
    selectedIds: new Set<string>(),
    onToggleSelected: vi.fn(),
    onOpenRecord,
    onToggleGroup: vi.fn(),
    isGroupCollapsed: () => false,
  }
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/work/signals']}>
        <SignalCollectionActionsProvider actions={actions}>
          <SignalFeedPresentation {...props} />
        </SignalCollectionActionsProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('SignalFeedPresentation — Feed renderer reads the collection ACTIONS context', () => {
  it('renders the Signal rows with resolved author/Team names', () => {
    renderFeed([row()], {})
    expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument()
    expect(screen.getByText('Author One')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
  })

  it('D-D2: the archive Feed no longer renders the in-feed Share row (it is ambient-only; the toolbar hosts the one door)', () => {
    const actions: SignalCollectionActions = { onShareClick: vi.fn() }
    renderFeed([row({ id: 'signal-9' })], actions)
    // The in-feed "Share a Signal" row is Home-ambient-only now — the /work/signals archive's
    // single compose door lives in the CollectionToolbar (layout-independent), so the Feed presents
    // no second, layout-dependent Share door.
    expect(screen.queryByRole('button', { name: /share a signal/i })).not.toBeInTheDocument()
  })

  it('wires the injected collection opener while hiding unavailable Task creation', async () => {
    const onOpenRecord = vi.fn()
    const actions: SignalCollectionActions = { onShareClick: vi.fn() }
    renderFeed([row({ id: 'signal-9' })], actions, onOpenRecord)

    // The whole row is the record-open button, named by its content.
    await userEvent.click(screen.getByRole('button', { name: /the freezer alarm went off/i }))
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'signal-9' }))
    expect(screen.queryByRole('button', { name: /create task/i })).not.toBeInTheDocument()
  })

  it('uses one full-row activation in the archive without nested row actions or visible-to copy', async () => {
    const onOpenRecord = vi.fn()
    renderFeed([row({ id: 'signal-9', category: 'Equipment/facility' })], {}, onOpenRecord)

    const rowButton = screen.getByRole('button', { name: /the freezer alarm went off/i })
    expect(rowButton).toHaveAttribute('data-signal-id', 'signal-9')
    expect(within(rowButton).queryAllByRole('button')).toHaveLength(0)
    expect(within(rowButton).queryByRole('link')).toBeNull()
    expect(screen.queryByText(/visible to/i)).toBeNull()
    await userEvent.click(rowButton)
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'signal-9' }))
  })
})

// DO-14 (signals F-3) — the row-stack guard MOVED to `guard-signal-feed-row-fit.test.tsx`.
// It used to pin a VIEWPORT `@media (max-width: 480px)`, which is the wrong instrument and was the
// cause of the 1440px Home defect: the same row renders in a ~300px sidebar column and a ~1140px
// archive Feed *in the same viewport*, so only the CONTAINER width can say when to stack. The
// replacement guard pins the container query, forbids any viewport media query from driving the
// row anatomy, and keeps DO-14's "the base row stays horizontal" half intact.
