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
    query: SIGNAL_COLLECTION_NEUTRAL_QUERY,
    projection,
    context: CONTEXT,
    selectedIds,
    onToggleSelected,
    onOpenRecord,
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

  it('NFR-V3-001: a retracted Signal is an explicit tombstone (message + reason), not a link', () => {
    renderTable([row({ id: 's-dead', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' })])
    expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    // No canonical link for a tombstone row.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  // Issue: Grouping must visibly group — the adapter computes projection.groups, but the
  // table flattens visibleRecords. RED: group headers should render with collapse/expand.
  it('FR-V3-GROUP: renders group headers with caret toggle when projection.groups is provided', () => {
    const rows = [
      row({ id: 's1', owning_team_id: 'team-hq', body: 'Team HQ signal' }),
      row({ id: 's2', owning_team_id: 'team-radiant', body: 'Team Radiant signal' }),
    ]
    const groups: SignalRenderGroup[] = [
      { key: 'team-hq', label: 'HQ Operations', rows: [rows[0]] },
      { key: 'team-radiant', label: 'Radiant Operations', rows: [rows[1]] },
    ]
    const projection: CollectionProjection<SignalRow, SignalRenderGroup> = {
      visibleRecords: rows,
      groups,
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
      selectedIds: new Set(),
      onToggleSelected: vi.fn(),
      onOpenRecord: vi.fn(),
      onToggleGroup: vi.fn(),
      isGroupCollapsed: (groupId) => groupId === 'team-radiant',
    }
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/signals']}>
          <SignalTablePresentation {...props} />
        </MemoryRouter>
      </I18nProvider>,
    )
    // Group headers should render with labels and counts - find group header rows by class
    const groupHeaderRows = screen.getAllByRole('row').filter(r => r.classList.contains('dt-group-row'))
    const hqGroupRow = groupHeaderRows.find(r => r.textContent?.includes('HQ Operations'))
    const radiantGroupRow = groupHeaderRows.find(r => r.textContent?.includes('Radiant Operations'))
    expect(hqGroupRow).toBeInTheDocument()
    expect(radiantGroupRow).toBeInTheDocument()
    // Caret toggle buttons for expand/collapse - query by role
    const collapseBtn = screen.getByRole('button', { name: /collapse hq operations/i })
    expect(collapseBtn).toBeInTheDocument()
    const expandBtn = screen.getByRole('button', { name: /expand radiant operations/i })
    expect(expandBtn).toBeInTheDocument()
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false')
    // Row counts (in group header)
    expect(hqGroupRow).toHaveTextContent('1')
    expect(radiantGroupRow).toHaveTextContent('1')
  })

  // Issue: Every Signal presentation must use the injected opener and preserve collection query state.
  // The table currently hardcodes `/work/signals?record=...` instead of calling onOpenRecord.
  // RED: clicking a row should call onOpenRecord, not navigate via hardcoded link.
  it('FR-V3-OPENER: clicking a signal row calls the injected onOpenRecord (not a hardcoded link)', async () => {
    const onOpenRecord = vi.fn()
    renderTable([row({ id: 'signal-42', body: 'Espresso machine repaired' })], new Set(), vi.fn(), onOpenRecord)
    // Click the span with role=button (not the text node)
    const messageCell = screen.getByRole('button', { name: 'Espresso machine repaired' })
    await userEvent.click(messageCell)
    expect(onOpenRecord).toHaveBeenCalledTimes(1)
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'signal-42' }))
    // The hardcoded link should NOT be present
    const link = screen.queryByRole('link', { name: 'Espresso machine repaired' })
    expect(link).not.toBeInTheDocument()
  })

  // Issue: Remove the phantom selection affordance — descriptor advertises selection and table
  // renders checkboxes, but no Signal bulk actions exist. RED: selection column should not render.
  it('NFR-V3-NO-SELECTION: no selection checkbox column is rendered (no bulk actions)', () => {
    renderTable([row({ id: 'signal-1' })])
    expect(screen.queryByRole('checkbox', { name: /select signal/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /select/i })).not.toBeInTheDocument()
  })
})
