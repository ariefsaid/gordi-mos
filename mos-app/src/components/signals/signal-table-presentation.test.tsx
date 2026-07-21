import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import { SignalTablePresentation } from './signal-table-presentation'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'
import { SIGNAL_COLLECTION_NEUTRAL_QUERY } from './signal-collection-adapter'

vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => true }))

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

const CONTEXT: SignalCollectionContext = {
  authorNamesById: new Map([['p-cahya', 'Cahya Cafe']]),
  teamNamesById: new Map([['team-hq', 'HQ Operations']]),
  siteNamesByTeamId: new Map(),
  viewerId: 'p-me',
}

function renderTable(
  rows: readonly SignalRow[],
  selectedIds = new Set<string>(),
  onToggleSelected = vi.fn(),
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
    query: SIGNAL_COLLECTION_NEUTRAL_QUERY,
    projection,
    context: CONTEXT,
    selectedIds,
    onToggleSelected,
    onOpenRecord: vi.fn(),
    onToggleGroup: vi.fn(),
    isGroupCollapsed: () => false,
  }
  const utils = render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/work/signals']}>
        <SignalTablePresentation {...props} />
      </MemoryRouter>
    </I18nProvider>,
  )
  return { ...utils, onToggleSelected }
}

describe('SignalTablePresentation — typed Signal archive Table (Issue 6)', () => {
  it('FR-V3-002: renders Signal fields and NEVER a Task PIC / Supervisor / Status column', () => {
    renderTable([row({ body: 'The freezer alarm went off', category: 'Equipment/facility' })])
    // Signal-specific content is present.
    expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument()
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Equipment/facility')).toBeInTheDocument()
    // A Signal is never dressed up as a Task.
    expect(screen.queryByText(/^PIC$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/supervisor/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /status/i })).not.toBeInTheDocument()
  })

  it('FR-V3-416: each live row links to the canonical Signal record URL (?record=<id>)', () => {
    renderTable([row({ id: 'signal-42', body: 'Espresso machine repaired' })])
    const link = screen.getByText('Espresso machine repaired').closest('a')
    expect(link).toHaveAttribute('href', '/work/signals?record=signal-42')
    expect(link).toHaveAttribute('data-canonical', '/work/signals?record=signal-42')
  })

  it('NFR-V3-001: a retracted Signal is an explicit tombstone (message + reason), not a link', () => {
    renderTable([row({ id: 's-dead', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' })])
    expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    // No canonical link for a tombstone row.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('FR-V3-003/006 seam: a row selection checkbox toggles the selected id', async () => {
    const { onToggleSelected } = renderTable([row({ id: 'signal-7' })])
    await userEvent.click(screen.getByRole('checkbox', { name: /select signal/i }))
    expect(onToggleSelected).toHaveBeenCalledWith('signal-7')
  })

  it('reflects an already-selected row as checked', () => {
    renderTable([row({ id: 'signal-7' })], new Set(['signal-7']))
    expect(screen.getByRole('checkbox', { name: /select signal/i })).toBeChecked()
  })
})
