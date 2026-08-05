import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import { SignalTablePresentation } from './signal-table-presentation'
import { SignalCollectionActionsProvider, type SignalCollectionActions } from './signal-collection-actions'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'
import { SIGNAL_COLLECTION_NEUTRAL_QUERY } from './signal-collection-adapter'

const desktopState = vi.hoisted(() => ({ value: true }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => desktopState.value }))

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'p-author-a', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'Needs attention', category: null, source: 'human',
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

function renderTable(
  rows: readonly SignalRow[],
  selectedIds = new Set<string>(),
  onToggleSelected = vi.fn(),
  onOpenRecord = vi.fn(),
  actions: SignalCollectionActions = {},
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
        <SignalCollectionActionsProvider actions={actions}>
          <SignalTablePresentation {...props} />
        </SignalCollectionActionsProvider>
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
    expect(screen.getByText('Author One')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Equipment/facility')).toBeInTheDocument()
    // A Signal is never dressed up as a Task.
    expect(screen.queryByText(/^PIC$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/supervisor/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /status/i })).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveClass('record-collection-table', 'collection-grammar-table')
    expect(screen.getByRole('button', { name: 'The freezer alarm went off' })).toHaveClass('collection-grammar-title')
    expect(document.querySelector('.collection-grammar-meta')).toHaveTextContent('Author One')
  })

  it('GAP-9 (OD-91 #14): the Signal table inherits the shared j/k row cursor — j moves it, Enter opens the cursor row', async () => {
    const onOpenRecord = vi.fn()
    renderTable(
      [row({ id: 's-1', body: 'First signal' }), row({ id: 's-2', body: 'Second signal' })],
      new Set<string>(), vi.fn(), onOpenRecord,
    )
    const user = userEvent.setup()
    // j lands the cursor on the first row…
    await user.keyboard('j')
    expect(screen.getByText('First signal').closest('tr')).toHaveClass('kfocus')
    // …a second j moves it to the second row…
    await user.keyboard('j')
    expect(screen.getByText('Second signal').closest('tr')).toHaveClass('kfocus')
    expect(screen.getByText('First signal').closest('tr')).not.toHaveClass('kfocus')
    // …and Enter opens the cursor row through the shared onOpenRecord seam.
    await user.keyboard('{Enter}')
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 's-2' }))
  })

  it('F3 (OD-91 #18): the amber row-fill class is Urgent-only; Needs attention / FYI / retracted stay calm', () => {
    renderTable([
      row({ id: 's-attn', body: 'Grinder is down', attention: 'Needs attention' }),
      row({ id: 's-urgent', body: 'Gas leak', attention: 'Urgent' }),
      row({ id: 's-fyi', body: 'Restocked cups', attention: 'FYI' }),
      row({ id: 's-dead', body: 'Dupe', attention: 'Urgent', retracted_at: '2026-07-16T05:00:00Z' }),
    ])
    const isUrgentRow = (text: string) =>
      screen.getByText(text).closest('tr')?.classList.contains('signal-table-row--urgent')
    // Only Urgent fills; Needs attention keeps its amber pill on a calm row.
    expect(isUrgentRow('Gas leak')).toBe(true)
    expect(isUrgentRow('Grinder is down')).toBe(false)
    expect(isUrgentRow('Restocked cups')).toBe(false)
    // A retracted row is a tombstone, never a filled row (state supersedes attention).
    expect(screen.getByText(/this signal was retracted/i).closest('tr')?.classList
      .contains('signal-table-row--urgent')).toBe(false)
  })

  it('AC-V3-014: Signal table headers use the same native keyboard-sort contract as Tasks', async () => {
    const onSort = vi.fn()
    renderTable([row()], new Set(), vi.fn(), vi.fn(), { onSort })

    const occurredAt = screen.getByRole('button', { name: /^occurred$/i })
    expect(occurredAt.tagName).toBe('BUTTON')
    expect(occurredAt.closest('th')).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(occurredAt)
    expect(onSort).toHaveBeenCalledWith('occurredAt', 'ascending')

    const attention = screen.getByRole('button', { name: /^attention$/i })
    expect(attention.closest('th')).toHaveAttribute('aria-sort', 'none')
    await userEvent.click(attention)
    expect(onSort).toHaveBeenCalledWith('attention', 'ascending')
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
    expect(document.querySelector('.signal-collection-presentation')).toBeInTheDocument()
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
    expect(hqGroupRow?.querySelector('.dt-group-bar')).toBeInTheDocument()
    expect(hqGroupRow?.querySelector('.dt-group-toggle')).toHaveAttribute('aria-expanded', 'true')
  })

  // Issue: Every Signal presentation must use the injected opener and preserve collection query state.
  // The table currently hardcodes `/work/signals?record=...` instead of calling onOpenRecord.
  // RED: clicking a row should call onOpenRecord, not navigate via hardcoded link.
  it('FR-V3-OPENER: clicking a signal row calls the injected onOpenRecord (not a hardcoded link)', async () => {
    const onOpenRecord = vi.fn()
    renderTable([row({ id: 'signal-42', body: 'Espresso machine repaired' })], new Set(), vi.fn(), onOpenRecord)
    // Click the span with role=button (not the text node)
    const messageCell = screen.getByRole('button', { name: 'Espresso machine repaired' })
    expect(messageCell).toHaveAttribute('type', 'button')
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

  it('phone cards keep the shared title/detail anatomy while retaining Signal fields', () => {
    desktopState.value = false
    try {
      renderTable([row({ body: 'Phone-readable signal', category: 'Equipment/facility' })])
      const card = document.querySelector('.signal-collection-presentation .dt-card')
      expect(card).toBeInTheDocument()
      expect(card?.querySelector('.collection-grammar-title')).toHaveTextContent('Phone-readable signal')
      expect(card?.querySelector('.collection-grammar-meta')).toHaveTextContent('Author One')
      expect(card?.querySelector('.dt-card-detail')).toBeInTheDocument()
    } finally {
      desktopState.value = true
    }
  })
})
