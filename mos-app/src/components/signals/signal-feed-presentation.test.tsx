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

function renderFeed(rows: readonly SignalRow[], actions: SignalCollectionActions) {
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
    onOpenRecord: vi.fn(),
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
  it('renders the Signal cards with resolved author/Team names', () => {
    renderFeed([row()], {})
    expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument()
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
  })

  it('wires the context actions (share / open / create task) to the cards', async () => {
    const actions: SignalCollectionActions = {
      onShareClick: vi.fn(),
      onOpen: vi.fn(),
      onCreateTask: vi.fn(),
    }
    renderFeed([row({ id: 'signal-9' })], actions)

    await userEvent.click(screen.getByRole('button', { name: /share a signal/i }))
    expect(actions.onShareClick).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'The freezer alarm went off' }))
    expect(actions.onOpen).toHaveBeenCalledWith('signal-9')

    await userEvent.click(screen.getByRole('button', { name: /create task/i }))
    expect(actions.onCreateTask).toHaveBeenCalledWith('signal-9')
  })
})
