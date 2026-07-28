import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import { SignalFeedPresentation } from './signal-feed-presentation'
import { SignalCollectionActionsProvider, type SignalCollectionActions } from './signal-collection-actions'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'
import { SIGNAL_COLLECTION_NEUTRAL_QUERY } from './signal-collection-adapter'

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'p-cahya', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'FYI', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

const CONTEXT: SignalCollectionContext = {
  authorNamesById: new Map([['p-cahya', 'Cahya Cafe']]),
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
      <SignalCollectionActionsProvider actions={actions}>
        <SignalFeedPresentation {...props} />
      </SignalCollectionActionsProvider>
    </I18nProvider>,
  )
}

describe('SignalFeedPresentation — Feed renderer reads the collection ACTIONS context', () => {
  it('renders the Signal rows with resolved author/Team names', () => {
    renderFeed([row()], {})
    expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument()
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
  })

  it('F3 (OD-91 #18): the amber row-fill is Urgent-only; Needs attention + FYI rows stay calm (P1-1)', () => {
    renderFeed(
      [
        row({ id: 'sig-urgent', body: 'Freezer alarm went off', attention: 'Urgent' }),
        row({ id: 'sig-attn', body: 'Grinder is down', attention: 'Needs attention' }),
        row({ id: 'sig-fyi', body: 'Restocked cups', attention: 'FYI' }),
      ],
      {},
    )
    // The archive Feed opts into the attention treatment via the shared component's variant.
    expect(document.querySelector('.home-signal-feed--archive')).toBeInTheDocument()
    // Only the Urgent row carries the fill modifier the CSS lights up (warning fill + 2px left rule).
    // Needs attention keeps its amber pill on a calm row; FYI is neutral. Home's ambient variant
    // never sets `--archive`, so Home is untouched.
    const urgentRow = document.querySelector('[data-signal-id="sig-urgent"]')
    const attnRow = document.querySelector('[data-signal-id="sig-attn"]')
    const fyiRow = document.querySelector('[data-signal-id="sig-fyi"]')
    expect(urgentRow?.classList.contains('home-signal-row--urgent')).toBe(true)
    expect(attnRow?.classList.contains('home-signal-row--urgent')).toBe(false)
    expect(fyiRow?.classList.contains('home-signal-row--urgent')).toBe(false)
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

    // The record-open affordance is now accessibly named ("Open signal: <body>") — Luna (c).
    await userEvent.click(screen.getByRole('button', { name: /open signal: the freezer alarm went off/i }))
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'signal-9' }))
    expect(screen.queryByRole('button', { name: /create task/i })).not.toBeInTheDocument()
  })
})

// DO-14 (signals F-3) — the row-stack guard MOVED to `guard-signal-feed-row-fit.test.tsx`.
// It used to pin a VIEWPORT `@media (max-width: 480px)`, which is the wrong instrument and was the
// cause of the 1440px Home defect: the same row renders in a ~300px sidebar column and a ~1140px
// archive Feed *in the same viewport*, so only the CONTAINER width can say when to stack. The
// replacement guard pins the container query, forbids any viewport media query from driving the
// row anatomy, and keeps DO-14's "the base row stays horizontal" half intact.
